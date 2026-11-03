'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';

export type LiveStatus = 'idle' | 'connecting' | 'live';

export interface LiveCallbacks {
  // Streaming transcription chunks of what the user / assistant are saying.
  onTranscript: (role: 'user' | 'assistant', chunk: string) => void;
  // The assistant finished (or was interrupted in) its turn.
  onTurnEnd: () => void;
  // Returns one response object per call, in the same order.
  onToolCalls: (calls: FunctionCall[]) => Promise<Record<string, unknown>[]>;
  onEnded: (reason?: string) => void;
}

// Close the session after this long with nobody talking, so a forgotten
// open mic doesn't keep streaming (and billing) audio all shift.
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

// Mic -> 16 kHz mono 16-bit PCM in ~100 ms chunks, which is what Gemini Live
// expects. Inlined so there's no extra file to serve.
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.buffer.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

/**
 * Realtime voice conversation with Gemini Live: streams the mic up, plays the
 * spoken reply back as it arrives, and hands tool calls to the caller.
 */
export function useLiveAssistant(callbacks: LiveCallbacks) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMutedState] = useState(false);

  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const sessionRef = useRef<Session | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const mutedRef = useRef(false);
  const lastActivityRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // True from start() until the session is torn down; guards double stops.
  const activeRef = useRef(false);

  const stopPlayback = () => {
    for (const src of playQueueRef.current) {
      try {
        src.stop();
      } catch {}
    }
    playQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    setSpeaking(false);
  };

  const playChunk = (base64: string) => {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    const samples = pcm16ToFloat32(base64);
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    playQueueRef.current.push(src);
    setSpeaking(true);
    src.onended = () => {
      playQueueRef.current = playQueueRef.current.filter((s) => s !== src);
      if (!playQueueRef.current.length) setSpeaking(false);
    };
  };

  const cleanup = () => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    idleTimerRef.current = null;
    stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void captureCtxRef.current?.close().catch(() => {});
    void playCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;
    playCtxRef.current = null;
    sessionRef.current = null;
    setStatus('idle');
  };

  const stop = useCallback((reason?: string) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try {
      sessionRef.current?.close();
    } catch {}
    cleanup();
    cbRef.current.onEnded(reason);
  }, []);

  const handleMessage = async (message: LiveServerMessage) => {
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) stopPlayback();
      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) playChunk(part.inlineData.data);
      }
      if (content.inputTranscription?.text) {
        lastActivityRef.current = Date.now();
        cbRef.current.onTranscript('user', content.inputTranscription.text);
      }
      if (content.outputTranscription?.text) {
        lastActivityRef.current = Date.now();
        cbRef.current.onTranscript('assistant', content.outputTranscription.text);
      }
      if (content.turnComplete || content.interrupted) cbRef.current.onTurnEnd();
    }

    const calls = message.toolCall?.functionCalls;
    if (calls?.length) {
      lastActivityRef.current = Date.now();
      let responses: Record<string, unknown>[];
      try {
        responses = await cbRef.current.onToolCalls(calls);
      } catch (e) {
        responses = calls.map(() => ({ error: e instanceof Error ? e.message : 'failed' }));
      }
      sessionRef.current?.sendToolResponse({
        functionResponses: calls.map((fc, i) => ({ id: fc.id, name: fc.name, response: responses[i] ?? {} })),
      });
    }

    if (message.goAway) stop('time-limit');
  };

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    mutedRef.current = false;
    setMutedState(false);
    setStatus('connecting');
    const ensureActive = () => {
      if (!activeRef.current) throw new Error('cancelled');
    };
    try {
      const res = await fetch('/api/assistant/live-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar.');
      ensureActive();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      ensureActive();

      // Both contexts are created inside the click that started the session,
      // so autoplay rules let them run.
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      const playCtx = new AudioContext({ sampleRate: 24000 });
      captureCtxRef.current = captureCtx;
      playCtxRef.current = playCtx;

      const ai = new GoogleGenAI({ apiKey: data.token });
      const session = await ai.live.connect({
        model: data.model,
        config: data.config,
        callbacks: {
          onmessage: (m) => void handleMessage(m),
          onerror: () => stop('error'),
          onclose: () => stop(),
        },
      });
      sessionRef.current = session;
      ensureActive();

      const workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
      await captureCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      ensureActive();
      const source = captureCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(captureCtx, 'pcm-capture');
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (mutedRef.current || !sessionRef.current) return;
        sessionRef.current.sendRealtimeInput({
          audio: { data: toBase64(e.data), mimeType: 'audio/pcm;rate=16000' },
        });
      };
      source.connect(worklet);

      lastActivityRef.current = Date.now();
      idleTimerRef.current = setInterval(() => {
        if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS) stop('idle');
      }, 10000);

      setStatus('live');
    } catch (e) {
      // Also lands here when stop() ran mid-setup: release whatever got
      // created after it, without reporting a second end.
      try {
        sessionRef.current?.close();
      } catch {}
      const wasActive = activeRef.current;
      activeRef.current = false;
      cleanup();
      if (!wasActive) return;
      const name = e instanceof Error ? e.name : '';
      cbRef.current.onEnded(
        name === 'NotAllowedError'
          ? 'Jarvis necesita permiso para usar el micrófono. Dale clic al candado junto a la dirección de la página, permite el micrófono y vuelve a tocar Jarvis.'
          : name === 'NotFoundError'
          ? 'No encontré ningún micrófono conectado.'
          : e instanceof Error
          ? e.message
          : 'error'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  // Text typed (or a button press reported) while the voice session is open.
  const sendText = useCallback((text: string) => {
    lastActivityRef.current = Date.now();
    sessionRef.current?.sendRealtimeInput({ text });
  }, []);

  const setMuted = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMutedState(value);
    if (value) sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { status, speaking, muted, start, stop, sendText, setMuted };
}
