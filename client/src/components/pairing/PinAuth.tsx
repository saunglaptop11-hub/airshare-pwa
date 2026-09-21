import React, { useRef, useState } from 'react';

export interface PinAuthProps {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const PinAuth: React.FC<PinAuthProps> = ({
  value,
  onChange,
  onComplete,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const cleanValue = value.replace(/\D/g, '').slice(0, 4);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
    onChange(digitsOnly);
    if (digitsOnly.length === 4 && onComplete) {
      onComplete(digitsOnly);
    }
  };

  const handleContainerClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div
      onClick={handleContainerClick}
      className="relative flex items-center justify-center gap-2.5 sm:gap-3 cursor-text select-none py-1"
    >
      {/* Hidden single native input for 100% reliable mobile keyboard and backspace */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={cleanValue}
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-text -z-0 pointer-events-auto"
        autoComplete="one-time-code"
        aria-label="4-digit PIN"
      />

      {/* 4 Visual Digit Boxes */}
      {[0, 1, 2, 3].map((index) => {
        const digit = cleanValue[index] || '';
        const isCurrent = isFocused && cleanValue.length === index;
        const isFilled = Boolean(digit);

        return (
          <div
            key={index}
            className={`w-12 h-14 sm:w-14 sm:h-16 flex items-center justify-center text-2xl font-mono font-bold rounded-xl border transition-all duration-150 ${
              isFilled
                ? 'border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                : isCurrent
                ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100/60 dark:bg-zinc-800/60 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-400'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            {digit ? (
              digit
            ) : isCurrent ? (
              <span className="w-0.5 h-6 bg-zinc-900 dark:bg-zinc-100 animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            )}
          </div>
        );
      })}
    </div>
  );
};
