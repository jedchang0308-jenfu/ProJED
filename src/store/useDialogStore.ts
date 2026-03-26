/**
 * 全域對話框狀態管理
 * 設計意圖：取代會阻斷執行緒的原生 window.prompt / window.confirm，
 * 使用非同步 Promise 機制讓 UI 可以正常響應。
 */
import { create } from 'zustand';
import type { DialogStore } from '../types';

const useDialogStore = create<DialogStore>((set) => ({
    isOpen: false,
    type: 'confirm',
    message: '',
    defaultValue: '',
    inputValue: '',

    // resolve 函式：當使用者按下確認/取消時被呼叫
    resolvePromise: null,

    // UI 元件（GlobalDialog）呼叫的 action
    setInputValue: (val: string) => set({ inputValue: val }),

    // 應用程式碼呼叫的 action
    showConfirm: (message: string): Promise<boolean> => new Promise((resolve) => {
        set({
            isOpen: true,
            type: 'confirm',
            message,
            resolvePromise: resolve as (value: boolean | string | null) => void,
        });
    }),

    showPrompt: (message: string, defaultValue = ''): Promise<string | null> => new Promise((resolve) => {
        set({
            isOpen: true,
            type: 'prompt',
            message,
            defaultValue,
            inputValue: defaultValue,
            resolvePromise: resolve as (value: boolean | string | null) => void,
        });
    }),

    // GlobalDialog 中使用者按下 OK / Cancel 時呼叫
    closeDialog: (result: boolean | string | null) => {
        set((state) => {
            if (state.resolvePromise) {
                state.resolvePromise(result);
            }
            return {
                isOpen: false,
                resolvePromise: null,
                inputValue: ''
            };
        });
    }
}));

export default useDialogStore;
