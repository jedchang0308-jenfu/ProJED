import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../../utils/cn';
import useVoiceInput from '../../hooks/useVoiceInput';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  voiceEnabled?: boolean;
  voiceLang?: string;
  onVoiceResult?: (transcript: string) => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      error,
      leftIcon,
      rightIcon,
      voiceEnabled = false,
      voiceLang = 'zh-TW',
      onVoiceResult,
      disabled,
      readOnly,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const supportsVoiceInput = voiceEnabled && ['text', 'search', 'tel'].includes(type);

    const assignRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;

        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const handleVoiceResult = React.useCallback(
      (transcript: string) => {
        if (onVoiceResult) {
          onVoiceResult(transcript);
          return;
        }

        const input = inputRef.current;
        if (!input) {
          return;
        }

        const currentValue = input.value.trim();
        const nextValue = currentValue ? `${currentValue} ${transcript}` : transcript;
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;

        valueSetter?.call(input, nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      },
      [onVoiceResult]
    );

    const { error: voiceError, isListening, isSupported, startListening } = useVoiceInput({
      onResult: handleVoiceResult,
      lang: voiceLang,
    });

    const mergedError = error ?? (supportsVoiceInput ? voiceError : null);
    const rightPaddingClass = supportsVoiceInput
      ? rightIcon
        ? 'pr-20'
        : 'pr-12'
      : rightIcon
        ? 'pr-10'
        : undefined;

    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          ref={assignRef}
          disabled={disabled}
          readOnly={readOnly}
          type={type}
          className={cn(
            "flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-1 transition-all disabled:cursor-not-allowed disabled:opacity-50",
            mergedError
              ? "border-red-500 focus:border-red-500 focus:ring-red-200" 
              : "border-slate-200 focus:border-primary focus:ring-primary/20",
            leftIcon && "pl-10",
            rightPaddingClass,
            className
          )}
          {...props}
        />
        {(rightIcon || supportsVoiceInput) && (
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-slate-400">
            {rightIcon}
            {supportsVoiceInput && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={startListening}
                disabled={disabled || readOnly || !isSupported}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  isListening
                    ? 'bg-red-50 text-red-500'
                    : 'hover:bg-slate-100 hover:text-slate-600',
                  (disabled || readOnly || !isSupported) && 'cursor-not-allowed opacity-50'
                )}
                aria-label={isListening ? '語音辨識中' : '啟用語音輸入'}
                title={
                  !isSupported
                    ? '此瀏覽器不支援語音輸入'
                    : isListening
                      ? '語音辨識中'
                      : '語音輸入'
                }
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
          </div>
        )}
        {mergedError && (
          <p className="mt-1 text-xs text-red-500">{mergedError}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
