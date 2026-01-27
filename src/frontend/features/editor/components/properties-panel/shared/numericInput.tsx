/**
 * Numeric Input Component
 * A flexible numeric input with optional preset dropdown, keyboard navigation,
 * and support for manual value entry including decimals.
 */
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { Input } from '@/frontend/components/ui/input';
import { cn } from '@/frontend/utils/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  presets?: number[];
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  suffix?: string;
  placeholder?: string;
  size?: 'sm' | 'default';
  showSteppers?: boolean;
  allowDecimals?: boolean;
  decimalPlaces?: number;
  ariaLabel?: string;
}

const NumericInputComponent: React.FC<NumericInputProps> = ({
  value,
  onChange,
  onChangeStart,
  onChangeEnd,
  min = 1,
  max = 999,
  step = 1,
  presets,
  disabled = false,
  className,
  inputClassName,
  suffix,
  placeholder,
  size = 'sm',
  showSteppers = false,
  allowDecimals = false,
  decimalPlaces = 1,
  ariaLabel,
}) => {
  const [inputValue, setInputValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isChangingRef = useRef(false);

  // Sync input value with external value when not focused
  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);

  const clampValue = useCallback(
    (val: number): number => {
      let clamped = Math.max(min, Math.min(max, val));
      if (!allowDecimals) {
        clamped = Math.round(clamped);
      } else {
        clamped = Number(clamped.toFixed(decimalPlaces));
      }
      return clamped;
    },
    [min, max, allowDecimals, decimalPlaces],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      // Allow empty, minus sign, or valid number patterns
      if (
        newValue === '' ||
        newValue === '-' ||
        /^-?\d*\.?\d*$/.test(newValue)
      ) {
        setInputValue(newValue);
      }
    },
    [],
  );

  const handleInputBlur = useCallback(() => {
    setIsFocused(false);

    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = clampValue(parsed);
      setInputValue(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    } else {
      // Reset to current value if invalid
      setInputValue(String(value));
    }

    if (isChangingRef.current) {
      onChangeEnd?.();
      isChangingRef.current = false;
    }
  }, [inputValue, value, clampValue, onChange, onChangeEnd]);

  const handleInputFocus = useCallback(() => {
    setIsFocused(true);
    // Select all text on focus for easy replacement
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.blur();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setInputValue(String(value));
        inputRef.current?.blur();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        if (!isChangingRef.current) {
          onChangeStart?.();
          isChangingRef.current = true;
        }

        const currentValue = parseFloat(inputValue) || value;
        const delta = e.key === 'ArrowUp' ? step : -step;
        const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const newValue = clampValue(currentValue + delta * multiplier);

        setInputValue(String(newValue));
        onChange(newValue);
      }
    },
    [value, inputValue, step, clampValue, onChange, onChangeStart],
  );

  const handleStepperClick = useCallback(
    (direction: 'up' | 'down') => {
      if (disabled) return;

      if (!isChangingRef.current) {
        onChangeStart?.();
        isChangingRef.current = true;
      }

      const currentValue = parseFloat(inputValue) || value;
      const delta = direction === 'up' ? step : -step;
      const newValue = clampValue(currentValue + delta);

      setInputValue(String(newValue));
      onChange(newValue);

      // End the change after a short delay
      setTimeout(() => {
        if (isChangingRef.current) {
          onChangeEnd?.();
          isChangingRef.current = false;
        }
      }, 100);
    },
    [
      disabled,
      inputValue,
      value,
      step,
      clampValue,
      onChange,
      onChangeStart,
      onChangeEnd,
    ],
  );

  const handlePresetSelect = useCallback(
    (preset: number) => {
      onChangeStart?.();
      const clamped = clampValue(preset);
      setInputValue(String(clamped));
      onChange(clamped);
      setIsDropdownOpen(false);
      onChangeEnd?.();
    },
    [clampValue, onChange, onChangeStart, onChangeEnd],
  );

  const inputHeight = size === 'sm' ? 'h-8' : 'h-10';
  const inputPadding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-2';
  const fontSize = size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {/* Main Input */}
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel || 'Numeric input'}
          className={cn(
            inputHeight,
            inputPadding,
            fontSize,
            'text-center tabular-nums',
            suffix && 'pr-6',
            presets && presets.length > 0 && 'rounded-r-none',
            showSteppers && 'pr-8',
            inputClassName,
          )}
        />
        {suffix && (
          <span
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
              fontSize,
            )}
          >
            {suffix}
          </span>
        )}
        {showSteppers && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
            <button
              type="button"
              onClick={() => handleStepperClick('up')}
              disabled={disabled}
              className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              tabIndex={-1}
              aria-label="Increase value"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => handleStepperClick('down')}
              disabled={disabled}
              className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              tabIndex={-1}
              aria-label="Decrease value"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Preset Dropdown */}
      {presets && presets.length > 0 && (
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              className={cn(
                inputHeight,
                'px-1.5 rounded-l-none border-l-0 min-w-0',
              )}
              aria-label="Select preset value"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[90px] max-h-[250px]"
          >
            {presets.map((preset) => (
              <DropdownMenuItem
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  'justify-center tabular-nums',
                  value === preset && 'bg-accent',
                )}
              >
                {preset}
                {suffix}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

NumericInputComponent.displayName = 'NumericInput';

// Memoize the component to prevent unnecessary re-renders
export const NumericInput = React.memo(NumericInputComponent);

// Common presets for convenience
export const FONT_SIZE_PRESETS = [
  8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120,
];
