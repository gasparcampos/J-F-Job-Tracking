'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, Mic, MicOff, Check, Volume2, VolumeX, Zap, AudioLines, PhoneOff } from 'lucide-react';
import type { FunctionCall } from '@google/genai';
import { Button } from '@/components/ui/button';
import { useLiveAssistant } from '@/hooks/use-live-assistant';
import type { AssistantAction, Job } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UiMessage extends ChatMessage {
  actions?: AssistantAction[];
  actionsState?: 'pending' | 'running' | 'done' | 'cancelled';
  // Live (Jarvis) transcript bubble still receiving text.
  streaming?: boolean;
}

interface AssistantPanelProps {
  // Lets the assistant's confirmed changes update the Kanban/Table state
  // immediately, the same way handleMoveJob does in page.tsx.
  onJobUpdated?: (job: Job) => void;
  // Full reload after a batch of changes (picks up extra parts, shipped, ...).
  onDataChanged?: () => void;
}

// Web Speech API isn't in the standard lib.dom types; Chrome/Edge expose it
// as webkitSpeechRecognition.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

type Lang = 'es' | 'en';

// Rough Spanish/English guess so replies are spoken with the right voice and
// confirmations come back in the language the user is using.
function detectLang(text: string, fallback: Lang): Lang {
  const es = (text.match(/[¿¡ñáéíóú]|\b(el|la|los|las|que|de|del|en|está|para|con|mueve|mover|cuál|cuáles|qué|sí|ponle|pon|trabajo|pieza)\b/gi) || []).length;
  const en = (text.match(/\b(the|is|are|what|which|move|to|of|and|job|put|set|yes|where|when)\b/gi) || []).length;
  if (es === en) return fallback;
  return es > en ? 'es' : 'en';
}

// Short spoken replies to a pending confirmation, handled locally so "sí" /
// "no" applies instantly without another round trip to the model.
const YES_RE = /^(s[ií]|yes|yeah|yep|ok|okay|dale|confirm[ao]?|confirmado|hazlo|adelante|correcto|claro|do it|go ahead|sure)\b/i;
const NO_RE = /^(no|cancela|cancelar|cancel|nel|olv[ií]dalo|never ?mind|stop|detente)\b/i;
const isShortReply = (text: string) => text.trim().split(/\s+/).length <= 4;

function toSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}⚠️✅]/gu, '')
    .replace(/JOB#\s*/gi, 'job ')
    .replace(/→/g, ' a ')
    .replace(/[*_#`>]/g, '')
    .trim();
}

export function AssistantPanel({ onJobUpdated, onDataChanged }: AssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'es-MX' | 'en-US'>('en-US');
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Mirrors for callbacks that fire from speech events (stale closures).
  const messagesRef = useRef<UiMessage[]>([]);
  const inputRef = useRef('');
  const isOpenRef = useRef(false);
  const speakEnabledRef = useRef(true);
  // While a Jarvis session is open, Gemini does the talking -- browser TTS
  // stays quiet.
  const liveActiveRef = useRef(false);
  const speechSupported = typeof window !== 'undefined' && !!getSpeechRecognition();

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    }
  }, [isOpen]);
  useEffect(() => {
    speakEnabledRef.current = speakEnabled;
  }, [speakEnabled]);

  // Auto-grow the textarea to fit whatever was typed or dictated, so the
  // full text is visible to review/edit before sending.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Remember the last language picked so it doesn't reset every time the
  // panel is reopened (different shop-floor staff speak different defaults).
  useEffect(() => {
    const saved = localStorage.getItem('assistantVoiceLang');
    if (saved === 'es-MX' || saved === 'en-US') setVoiceLang(saved);
    if (localStorage.getItem('assistantSpeak') === 'off') setSpeakEnabled(false);
  }, []);

  const toggleVoiceLang = () => {
    const next = voiceLang === 'es-MX' ? 'en-US' : 'es-MX';
    setVoiceLang(next);
    localStorage.setItem('assistantVoiceLang', next);
  };

  const toggleSpeak = () => {
    const next = !speakEnabled;
    setSpeakEnabled(next);
    localStorage.setItem('assistantSpeak', next ? 'on' : 'off');
    if (!next) window.speechSynthesis?.cancel();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const fallbackLang: Lang = voiceLang === 'es-MX' ? 'es' : 'en';

  // Reads a reply out loud; onDone fires when it finishes (or right away if
  // speech is off/unsupported) so the mic can reopen for a "sí".
  const speak = (text: string, onDone?: () => void) => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const clean = toSpeech(text);
    if (!speakEnabledRef.current || liveActiveRef.current || !synth || !clean) {
      onDone?.();
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = detectLang(text, fallbackLang) === 'es' ? 'es-MX' : 'en-US';
    const voices = synth.getVoices();
    const voice =
      voices.find((v) => v.lang.replace('_', '-') === utterance.lang) ||
      voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();
    synth.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || recognitionRef.current) return;
    window.speechSynthesis?.cancel();

    const recognition = new SpeechRecognition();
    recognition.lang = voiceLang;
    recognition.interimResults = false;
    recognition.continuous = false;

    let transcript = '';
    recognition.onresult = (event: any) => {
      transcript = Array.from(event.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(' ');
    };
    recognition.onerror = () => {};
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
      if (!transcript.trim() || !isOpenRef.current) return;
      // Hands-free: anything typed so far plus the dictation goes straight out.
      const text = [inputRef.current.trim(), transcript.trim()].filter(Boolean).join(' ');
      setInput('');
      void handleUserText(text, true);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    startListening();
  };

  const updateMessage = (index: number, patch: Partial<UiMessage>) =>
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const appendMessage = (m: UiMessage) => setMessages((prev) => [...prev, m]);

  // Applies a confirmed proposal and returns a short summary of the outcome.
  const runActions = async (index: number, lang: Lang): Promise<string> => {
    const actions = messagesRef.current[index]?.actions ?? [];
    updateMessage(index, { actionsState: 'running' });

    const done: string[] = [];
    let failure: string | null = null;
    for (const action of actions) {
      try {
        const res = await fetch(action.path, {
          method: action.method,
          headers: { 'content-type': 'application/json' },
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

        let job: Job | null = action.jobId ? data : null;
        if (action.jobId && action.annotation) {
          const noteRes = await fetch(`/api/jobs/${action.jobId}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ annotation: action.annotation }),
          });
          if (noteRes.ok) job = await noteRes.json();
        }
        if (job) onJobUpdated?.(job);
        done.push(action.label);
      } catch (e) {
        failure = `${action.label}: ${e instanceof Error ? e.message : 'error'}`;
        break;
      }
    }

    onDataChanged?.();
    updateMessage(index, { actionsState: 'done' });

    const t = (es: string, en: string) => (lang === 'es' ? es : en);
    const summary = failure
      ? `⚠️ ${t('No se pudo completar', 'Could not complete')} — ${failure}` +
        (done.length ? `\n${t('Sí se hizo', 'Done')}: ${done.join('; ')}` : '')
      : `✅ ${t('Listo', 'Done')}: ${done.join('; ')}`;
    appendMessage({ role: 'assistant', content: summary });
    speak(failure ? summary : t('Listo.', 'Done.'));
    return summary;
  };

  const cancelActions = (index: number, lang: Lang) => {
    updateMessage(index, { actionsState: 'cancelled' });
    const text = lang === 'es' ? 'Cancelado, no se cambió nada.' : 'Cancelled, nothing was changed.';
    appendMessage({ role: 'assistant', content: text });
    speak(text);
  };

  // ---------- Jarvis (realtime voice via Gemini Live) ----------

  const lastPendingIndex = () => {
    const msgs = messagesRef.current;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].actionsState === 'pending') return i;
    }
    return -1;
  };

  // Language of the conversation, judged by what the user said last.
  const liveLang = (): Lang => {
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user');
    return lastUser ? detectLang(lastUser.content, fallbackLang) : fallbackLang;
  };

  const appendLiveText = (role: 'user' | 'assistant', chunk: string) =>
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && last.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
      }
      return [...prev, { role, content: chunk.trimStart(), streaming: true }];
    });

  const endLiveTurn = () =>
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));

  const handleLiveToolCalls = async (calls: FunctionCall[]): Promise<Record<string, unknown>[]> => {
    const lang = liveLang();
    const results: Record<string, unknown>[] = calls.map(() => ({}));
    const proposals: { index: number; call: FunctionCall }[] = [];

    for (let i = 0; i < calls.length; i++) {
      const name = calls[i].name;
      if (name === 'confirm_pending_changes' || name === 'cancel_pending_changes') {
        const pending = lastPendingIndex();
        if (pending < 0) {
          results[i] = { error: 'There are no pending changes.' };
        } else if (name === 'confirm_pending_changes') {
          results[i] = { result: await runActions(pending, lang) };
        } else {
          cancelActions(pending, lang);
          results[i] = { result: 'Cancelled, nothing was changed.' };
        }
      } else {
        proposals.push({ index: i, call: calls[i] });
      }
    }

    if (proposals.length) {
      const res = await fetch('/api/assistant/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang, calls: proposals.map((p) => ({ name: p.call.name, args: p.call.args })) }),
      });
      const data = await res.json();
      const actions: AssistantAction[] = res.ok ? data.actions ?? [] : [];
      const errors: string[] = res.ok ? data.errors ?? [] : [data.error || 'error'];

      // A new proposal replaces any older one still waiting, so "sí" always
      // applies to what was just read out.
      setMessages((prev) => [
        ...prev.map((m) => (m.actionsState === 'pending' ? { ...m, actionsState: 'cancelled' as const } : m)),
        {
          role: 'assistant',
          content: errors.join('\n'),
          ...(actions.length ? { actions, actionsState: 'pending' as const } : {}),
        },
      ]);

      const payload = {
        status: actions.length ? 'awaiting_user_confirmation' : 'nothing_to_apply',
        proposed: actions.map((a) => a.label),
        errors,
      };
      for (const p of proposals) results[p.index] = payload;
    }

    return results;
  };

  const live = useLiveAssistant({
    onTranscript: appendLiveText,
    onTurnEnd: endLiveTurn,
    onToolCalls: handleLiveToolCalls,
    onEnded: (reason) => {
      endLiveTurn();
      const es = fallbackLang === 'es' || liveLang() === 'es';
      const text =
        reason === 'idle'
          ? es ? 'Jarvis se desconectó por inactividad.' : 'Jarvis disconnected after being idle.'
          : reason === 'time-limit'
          ? es ? 'Se acabó el tiempo de la sesión. Toca Jarvis para seguir.' : 'Session time is up. Tap Jarvis to continue.'
          : reason === 'error'
          ? '⚠️ Se perdió la conexión con Jarvis.'
          : reason
          ? `⚠️ ${reason}`
          : null;
      if (text) appendMessage({ role: 'assistant', content: text });
    },
  });
  const liveActive = live.status !== 'idle';

  useEffect(() => {
    liveActiveRef.current = liveActive;
    if (liveActive) {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    }
  }, [liveActive]);

  useEffect(() => {
    if (!isOpen) live.stop();
  }, [isOpen, live.stop]);

  const toggleLive = () => {
    if (liveActive) live.stop();
    else void live.start();
  };

  // Confirm/Cancel buttons; during a Jarvis session the model is told what
  // happened so it can say so.
  const handleConfirmClick = async (index: number, lang: Lang) => {
    const summary = await runActions(index, lang);
    if (liveActiveRef.current) live.sendText(`[The user confirmed with the button. Result: ${summary}]`);
  };

  const handleCancelClick = (index: number, lang: Lang) => {
    cancelActions(index, lang);
    if (liveActiveRef.current) live.sendText('[The user cancelled the proposed changes with the button.]');
  };

  const handleUserText = async (text: string, fromVoice: boolean) => {
    if (liveActiveRef.current) {
      appendMessage({ role: 'user', content: text });
      live.sendText(text);
      return;
    }

    const lang = detectLang(text, fallbackLang);
    const current = messagesRef.current;
    const last = current[current.length - 1];

    // A "sí" / "no" right after a proposal answers it directly.
    if (last?.actionsState === 'pending' && isShortReply(text)) {
      const lastIndex = current.length - 1;
      if (YES_RE.test(text.trim()) || NO_RE.test(text.trim())) {
        const confirmed = YES_RE.test(text.trim());
        // "sí"/"no"/"ok" alone don't tell the language -- answer in the
        // proposal's language instead.
        const replyLang = detectLang(`${last.content} ${(last.actions ?? []).map((a) => a.label).join(' ')}`, lang);
        const next = [...current, { role: 'user' as const, content: text }];
        messagesRef.current = next;
        setMessages(next);
        if (confirmed) await runActions(lastIndex, replyLang);
        else cancelActions(lastIndex, replyLang);
        return;
      }
    }

    const nextMessages: UiMessage[] = [...current, { role: 'user', content: text }];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Only role/content matter to the API -- proposed changes are folded
        // into the text so the model knows what it offered last turn.
        body: JSON.stringify({
          lang,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.actions?.length
              ? `${m.content}\n[Proposed changes: ${m.actions.map((a) => a.label).join('; ')} — ${m.actionsState}]`
              : m.content,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendMessage({ role: 'assistant', content: `⚠️ ${data.error || 'Error desconocido.'}` });
        return;
      }

      const actions: AssistantAction[] = data.actions ?? [];
      appendMessage({
        role: 'assistant',
        content: data.reply,
        ...(actions.length ? { actions, actionsState: 'pending' as const } : {}),
      });

      const spoken = [data.reply, ...actions.map((a) => a.label)].filter(Boolean).join('. ');
      // After proposing changes by voice, reopen the mic so the user can
      // just say "sí" / "no".
      speak(spoken, () => {
        if (fromVoice && actions.length && isOpenRef.current) startListening();
      });
    } catch {
      appendMessage({ role: 'assistant', content: '⚠️ No se pudo conectar con el asistente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void handleUserText(text, false);
  };

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Preguntar al asistente"
          className="fixed bottom-6 right-6 z-[70] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 flex items-center justify-center hover:scale-105 transition-transform"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Slide-in side panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-full max-w-sm h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="bg-primary px-5 py-4 flex items-center justify-between text-primary-foreground flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bot size={18} />
                <h3 className="font-bold text-sm">Asistente de Jobs</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleLive}
                  disabled={live.status === 'connecting'}
                  title={liveActive ? 'Terminar Jarvis' : 'Jarvis: conversación por voz en tiempo real'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    liveActive ? 'bg-white text-primary' : 'bg-white/15 hover:bg-white/25'
                  }`}
                >
                  {live.status === 'connecting' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : liveActive ? (
                    <PhoneOff size={14} />
                  ) : (
                    <AudioLines size={14} />
                  )}
                  {liveActive ? 'Terminar' : 'Jarvis'}
                </button>
                <button
                  onClick={toggleSpeak}
                  disabled={liveActive}
                  title={speakEnabled ? 'Silenciar respuestas habladas' : 'Leer respuestas en voz alta'}
                  className="hover:bg-white/10 p-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {speakEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {liveActive && (
              <div className="px-4 py-2 border-b border-border bg-primary/10 flex items-center gap-3 flex-shrink-0">
                <span className="relative flex h-2.5 w-2.5">
                  {live.status === 'live' && !live.muted && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                  )}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live.muted ? 'bg-muted-foreground' : 'bg-primary'}`} />
                </span>
                <span className="flex-1 text-xs font-medium">
                  {live.status === 'connecting'
                    ? 'Conectando...'
                    : live.speaking
                    ? 'Jarvis está hablando (puedes interrumpirlo)'
                    : live.muted
                    ? 'Micrófono en silencio'
                    : 'Te escucho...'}
                </span>
                <button
                  type="button"
                  onClick={() => live.setMuted(!live.muted)}
                  disabled={live.status !== 'live'}
                  title={live.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
                  className="h-7 w-7 rounded-lg flex items-center justify-center border border-border hover:border-primary/40 disabled:opacity-50"
                >
                  {live.muted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-8">
                  Pregúntame por JOB#, Part# o DWG#, o pídeme cambios: mover un job, ponerlo en progreso, cambiar
                  prioridad o fecha, agregar una nota, enviarlo, o guardar/sacar piezas extra. Usa el micrófono y
                  responde &quot;sí&quot; para confirmar. Toca <b>Jarvis</b> para platicar en tiempo real.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i}>
                  {m.content && (
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'ml-auto bg-primary text-primary-foreground'
                          : 'bg-muted text-card-foreground'
                      } ${m.streaming ? 'opacity-80' : ''}`}
                    >
                      {m.content}
                    </div>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div
                      className={`mt-2 max-w-[85%] bg-muted/50 border border-border rounded-xl p-3 space-y-2 ${
                        m.actionsState === 'cancelled' ? 'opacity-50' : ''
                      }`}
                    >
                      <ul className="space-y-1.5">
                        {m.actions.map((a, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs font-medium">
                            {m.actionsState === 'done' ? (
                              <Check size={12} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                            ) : (
                              <Zap size={12} className="mt-0.5 flex-shrink-0 text-primary" />
                            )}
                            <span className={m.actionsState === 'cancelled' ? 'line-through' : ''}>{a.label}</span>
                          </li>
                        ))}
                      </ul>
                      {(m.actionsState === 'pending' || m.actionsState === 'running') && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleConfirmClick(i, detectLang(`${m.content} ${m.actions!.map((a) => a.label).join(' ')}`, fallbackLang))}
                            disabled={m.actionsState === 'running'}
                            className="h-8 flex-1 rounded-lg text-xs gap-1.5"
                          >
                            {m.actionsState === 'running' ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelClick(i, detectLang(`${m.content} ${m.actions!.map((a) => a.label).join(' ')}`, fallbackLang))}
                            disabled={m.actionsState === 'running'}
                            className="h-8 flex-1 rounded-lg text-xs"
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="bg-muted text-card-foreground max-w-[85%] rounded-xl px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Pensando...
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border flex items-end gap-2 flex-shrink-0">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={liveActive ? 'Jarvis te escucha; también puedes escribir...' : isRecording ? 'Escuchando...' : 'Escribe o habla...'}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none overflow-y-auto leading-snug focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleVoiceLang}
                  disabled={isRecording || liveActive}
                  title="Idioma del dictado"
                  className="h-9 px-2 rounded-lg flex-shrink-0 text-[10px] font-bold uppercase tracking-wider border border-border text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 transition-colors"
                >
                  {voiceLang === 'es-MX' ? 'ES' : 'EN'}
                </button>
              )}
              {speechSupported && (
                <Button
                  type="button"
                  size="icon"
                  variant={isRecording ? 'destructive' : 'outline'}
                  onClick={toggleRecording}
                  disabled={loading || liveActive}
                  title={isRecording ? 'Detener' : `Hablar (${voiceLang === 'es-MX' ? 'Español' : 'English'})`}
                  className={`h-9 w-9 rounded-lg flex-shrink-0 ${isRecording ? 'animate-pulse' : ''}`}
                >
                  {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                </Button>
              )}
              <Button
                size="icon"
                onClick={handleSend}
                disabled={loading || !input.trim() || live.status === 'connecting'}
                className="h-9 w-9 rounded-lg flex-shrink-0"
              >
                <Send size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
