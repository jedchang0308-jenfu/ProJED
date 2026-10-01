import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type SystemNoticeDetailsDialogProps = {
  date: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export const SystemNoticeDetailsDialog: React.FC<SystemNoticeDetailsDialogProps> = ({ date, title, onClose, children }) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-start justify-center bg-slate-950/45 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
      role="presentation"
      data-system-notice-backdrop="true"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-notice-dialog-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        data-system-notice-dialog="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <time className="text-xs text-slate-500" dateTime={date}>{date}</time>
            <h2 id="system-notice-dialog-title" className="mt-1 text-base font-bold text-slate-900">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="關閉通知明細"
          >
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-4 text-sm leading-6 text-slate-700 sm:px-6" data-system-notice-dialog-content>
          {children}
        </div>
      </section>
    </div>
  );
};
