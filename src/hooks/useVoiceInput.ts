import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'phrases-not-supported'
  | 'service-not-allowed';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: SpeechRecognitionErrorCode;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseVoiceInputOptions {
  onResult: (transcript: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}

export interface UseVoiceInputResult {
  error: string | null;
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function getRecognitionErrorMessage(error: SpeechRecognitionErrorCode): string {
  switch (error) {
    case 'audio-capture':
      return '偵測不到麥克風。';
    case 'language-not-supported':
      return '此瀏覽器不支援目前選擇的語音辨識語言。';
    case 'network':
      return '語音辨識時發生網路錯誤。';
    case 'no-speech':
      return '沒有偵測到語音，請再試一次。';
    case 'not-allowed':
    case 'service-not-allowed':
      return '麥克風存取已被封鎖，請允許麥克風權限後再試一次。';
    case 'aborted':
      return '語音辨識已取消。';
    case 'bad-grammar':
    case 'phrases-not-supported':
    default:
      return '語音辨識失敗，請再試一次。';
  }
}

export function useVoiceInput({
  onResult,
  onError,
  lang = 'zh-TW',
}: UseVoiceInputOptions): UseVoiceInputResult {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emitResult = useEffectEvent((transcript: string) => {
    onResult(transcript);
  });

  const emitError = useEffectEvent((message: string) => {
    onError?.(message);
  });

  const speechRecognitionConstructor = getSpeechRecognitionConstructor();
  const isSupported = speechRecognitionConstructor !== null;

  const startListening = useCallback(() => {
    if (isListening) {
      return;
    }

    if (!speechRecognitionConstructor) {
      const message =
        '此瀏覽器不支援語音辨識，請改用相容的瀏覽器。';
      setError(message);
      emitError(message);
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new speechRecognitionConstructor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = Array.from(
          { length: event.results.length - event.resultIndex },
          (_, index) => event.results[event.resultIndex + index]?.[0]?.transcript ?? ''
        )
          .join('')
          .trim();

        if (transcript) {
          setError(null);
          emitResult(transcript);
        }
      };

      recognition.onerror = (event) => {
        const message = getRecognitionErrorMessage(event.error);
        setError(message);
        setIsListening(false);
        emitError(message);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    recognitionRef.current.lang = lang;
    setError(null);

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '無法啟動語音辨識。';

      setError(message);
      setIsListening(false);
      emitError(message);
    }
  }, [emitError, emitResult, isListening, lang, speechRecognitionConstructor]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    error,
    isListening,
    isSupported,
    startListening,
  };
}

export default useVoiceInput;
