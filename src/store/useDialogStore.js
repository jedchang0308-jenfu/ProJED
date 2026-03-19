import { create } from 'zustand';

// 設計意圖：管理全域自訂的對話框狀態，取代會阻斷執行緒的原生 prompt/confirm。
const useDialogStore = create((set) => ({
    isOpen: false,
    type: 'confirm', // 'confirm' | 'prompt'
    message: '',
    defaultValue: '',
    inputValue: '',
    
    // Resolve function to be called when user confirms/cancels
    resolvePromise: null,

    // Actions called by UI component (GlobalDialog.jsx)
    setInputValue: (val) => set({ inputValue: val }),
    
    // Actions called by application code
    showConfirm: (message) => new Promise((resolve) => {
        set({
            isOpen: true,
            type: 'confirm',
            message,
            resolvePromise: resolve
        });
    }),

    showPrompt: (message, defaultValue = '') => new Promise((resolve) => {
        set({
            isOpen: true,
            type: 'prompt',
            message,
            defaultValue,
            inputValue: defaultValue,
            resolvePromise: resolve
        });
    }),

    // Called by GlobalDialog when User clicks OK / Cancel
    closeDialog: (result) => {
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
