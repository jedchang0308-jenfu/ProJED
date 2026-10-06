import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastOptions {
  duration?: number;
}

interface ToastStore {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', options = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, options.duration ?? 3000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (msg: string, options?: ToastOptions) => useToastStore.getState().addToast(msg, 'success', options),
  error: (msg: string, options?: ToastOptions) => useToastStore.getState().addToast(msg, 'error', options),
  warning: (msg: string, options?: ToastOptions) => useToastStore.getState().addToast(msg, 'warning', options),
  info: (msg: string, options?: ToastOptions) => useToastStore.getState().addToast(msg, 'info', options),
};
