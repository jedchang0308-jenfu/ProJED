import React from 'react';
import { useToastStore } from '../../store/useToastStore';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[10001] flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:items-end"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-toast-container="true"
    >
      {toasts.map((toast) => {
        let Icon = Info;
        let bgColor = 'bg-blue-50 dark:bg-blue-900/30';
        let borderColor = 'border-blue-200 dark:border-blue-800';
        let iconColor = 'text-blue-500 dark:text-blue-400';

        switch (toast.type) {
          case 'success':
            Icon = CheckCircle2;
            bgColor = 'bg-emerald-50 dark:bg-emerald-900/30';
            borderColor = 'border-emerald-200 dark:border-emerald-800';
            iconColor = 'text-emerald-500 dark:text-emerald-400';
            break;
          case 'error':
            Icon = AlertCircle;
            bgColor = 'bg-red-50 dark:bg-red-900/30';
            borderColor = 'border-red-200 dark:border-red-800';
            iconColor = 'text-red-500 dark:text-red-400';
            break;
          case 'warning':
            Icon = AlertTriangle;
            bgColor = 'bg-amber-50 dark:bg-amber-900/30';
            borderColor = 'border-amber-200 dark:border-amber-800';
            iconColor = 'text-amber-500 dark:text-amber-400';
            break;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-right-8 fade-in sm:min-w-[280px] ${bgColor} ${borderColor}`}
            style={{ animationDuration: '0.3s' }}
            data-toast-message={toast.message}
          >
            <Icon size={18} className={`flex-shrink-0 ${iconColor}`} />
            <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
