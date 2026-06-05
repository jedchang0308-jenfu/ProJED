import React from 'react';
import { CompactSegmentedButton, CompactSegmentedControl } from './CompactControls';

export type ModeSwitcherOption<T extends string> = {
  value: T;
  label: string;
  icon: React.ReactNode;
  title?: string;
};

type ModeSwitcherProps<T extends string> = {
  value: T;
  options: ModeSwitcherOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledTitle?: string;
};

export function ModeSwitcher<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  disabledTitle = '',
}: ModeSwitcherProps<T>) {
  return (
    <CompactSegmentedControl>
      {options.map((option) => (
        <CompactSegmentedButton
          key={option.value}
          type="button"
          active={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          title={disabled ? disabledTitle : option.title ?? ''}
          className={disabled ? 'opacity-50 cursor-not-allowed' : ''}
        >
          {option.icon}
          <span className="hidden md:inline">{option.label}</span>
        </CompactSegmentedButton>
      ))}
    </CompactSegmentedControl>
  );
}
