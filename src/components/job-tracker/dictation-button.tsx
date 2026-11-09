'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

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

type DictLang = 'es-MX' | 'en-US';
const LANG_KEY = 'jf-dictation-lang';

interface DictationButtonProps {
  // Current text of the field; dictation is appended to it.
  value: string;
  onChange: (next: string) => void;
}

/**
 * Mic button + ES/EN toggle that turns speech into text for a textarea.
 * Tap to start, tap again to stop. Text appears live while you talk.
 */
export function DictationButton({ value, onChange }: DictationButtonProps) {
  const [supported, setSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lang, setLang] = useState<DictLang>('es-MX');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(!!getSpeechRecognition());
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'es-MX' || saved === 'en-US') setLang(saved);
    } catch {}
    return () => recognitionRef.current?.stop();
  }, []);

  if (!supported) return null;

  const toggleLang = () => {
    const next: DictLang = lang === 'es-MX' ? 'en-US' : 'es-MX';
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  };

  const stop = () => recognitionRef.current?.stop();

  const start = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition || recognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    // Text that was in the field before dictation started stays untouched;
    // the spoken text is appended after it.
    const base = value.trimEnd();
    recognition.onresult = (event: any) => {
      const spoken = Array.from(event.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      onChange([base, spoken].filter(Boolean).join(' '));
    };
    recognition.onerror = () => {};
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleLang}
        disabled={isRecording}
        title="Idioma del dictado / Dictation language"
        className="h-7 px-2 rounded-md border border-border text-[10px] font-bold tracking-wider text-muted-foreground hover:text-card-foreground hover:bg-muted disabled:opacity-50"
      >
        {lang === 'es-MX' ? 'ES' : 'EN'}
      </button>
      <button
        type="button"
        onClick={isRecording ? stop : start}
        title={isRecording ? 'Detener dictado' : 'Dictar nota por voz'}
        className={`h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
          isRecording
            ? 'bg-red-600 text-white animate-pulse'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {isRecording ? <Square size={12} /> : <Mic size={13} />}
        {isRecording ? 'Stop' : 'Dictar'}
      </button>
    </div>
  );
}
