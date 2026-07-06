import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '../../utils/cn';

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
  const [isOpen, setIsOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const activeOption = options.find(option => option.value === value) || options[0];

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = 232;
    const gutter = 8;
    setMenuPosition({
      left: Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter)),
      top: rect.bottom + 6,
    });
  }, []);

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    updateMenuPosition();
    setIsOpen(true);
  }, [disabled, updateMenuPosition]);

  const toggleMenu = React.useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    openMenu();
  }, [disabled, isOpen, openMenu]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, updateMenuPosition]);

  const handleSelect = (nextValue: T) => {
    setIsOpen(false);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleMenu}
        title={disabled ? disabledTitle : '檢視畫面'}
        aria-label="檢視畫面"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-mode-switcher-trigger="true"
        className={cn(
          'app-compact-text-button inline-flex h-[30px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-[10px] text-xs font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50',
          isOpen && 'border-primary/35 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15',
        )}
      >
        {activeOption?.icon}
        <span className="hidden lg:inline">檢視畫面</span>
        <ChevronDown size={12} className={cn('transition-transform duration-150', isOpen && 'rotate-180')} />
      </button>

      {isOpen && menuPosition ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          data-mode-switcher-menu="true"
          className="fixed z-[10000] w-[232px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl animate-in fade-in duration-150"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          <div className="grid h-9 grid-cols-[2rem_1fr_2rem] items-center border-b border-slate-100 px-2">
            <span aria-hidden="true" />
            <div className="text-center text-xs font-bold text-slate-500">檢視畫面</div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="關閉檢視畫面選單"
              data-mode-switcher-close="true"
            >
              <X size={15} />
            </button>
          </div>

          <div className="py-1">
            {options.map(option => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleSelect(option.value)}
                  title={disabled ? disabledTitle : option.title ?? option.label}
                  data-mode-switcher-value={option.value}
                  className={cn(
                    'flex h-9 w-full items-center gap-3 px-3 text-left text-sm font-semibold transition-colors',
                    active
                      ? 'bg-primary-light text-primary'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <span className={cn('inline-flex w-4 shrink-0 justify-center', active ? 'text-primary' : 'text-slate-400')}>
                    {option.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active ? <Check size={14} className="shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
