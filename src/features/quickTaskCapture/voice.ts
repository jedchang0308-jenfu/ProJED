import { insertFinalTranscript } from './model';

type SpeechRecognitionResultEventLike = Event & { results: SpeechRecognitionResultList; resultIndex: number };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const getConstructor = () => {
  const scope = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

export type VoiceSession = {
  stop: () => void;
  abort: () => void;
};

export const startVoiceCapture = (input: HTMLInputElement, handlers: {
  onState: (state: 'requesting' | 'listening' | 'idle' | 'fallback') => void;
  onValue: (value: string, caret: number) => void;
}) : VoiceSession | null => {
  const Constructor = getConstructor();
  if (!Constructor) {
    input.focus();
    handlers.onState('fallback');
    return null;
  }
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = document.documentElement.lang || 'zh-TW';
  let finalApplied = false;
  recognition.onresult = event => {
    let finalText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.isFinal) finalText += result[0]?.transcript ?? '';
    }
    if (finalText && !finalApplied) {
      finalApplied = true;
      const next = insertFinalTranscript({ value: input.value, selectionStart, selectionEnd, transcript: finalText });
      handlers.onValue(next.value, next.caret);
    }
  };
  recognition.onerror = event => {
    handlers.onState(event.error === 'not-allowed' ? 'fallback' : 'idle');
  };
  recognition.onend = () => handlers.onState(finalApplied ? 'idle' : 'fallback');
  handlers.onState('requesting');
  input.focus();
  try {
    recognition.start();
    handlers.onState('listening');
  } catch {
    handlers.onState('fallback');
  }
  return { stop: () => recognition.stop(), abort: () => recognition.abort() };
};
