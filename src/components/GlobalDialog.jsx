import React, { useEffect, useRef } from 'react';
import useDialogStore from '../store/useDialogStore';
import { X } from 'lucide-react';

const GlobalDialog = () => {
    const { isOpen, type, message, inputValue, setInputValue, closeDialog } = useDialogStore();
    const inputRef = useRef(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen && type === 'prompt' && inputRef.current) {
            // Slight delay to ensure render is complete
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, type]);

    // Handle Keyboard Shortcuts (Enter / Escape)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            // Do not stop propagation everywhere, just specific keys for dialog
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeDialog(type === 'prompt' ? null : false);
            } else if (e.key === 'Enter') {
                e.stopPropagation();
                closeDialog(type === 'prompt' ? inputValue : true);
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [isOpen, type, inputValue, closeDialog]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm transform scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 break-words leading-snug pr-4">
                        {message}
                    </h3>
                    <button 
                        onClick={() => closeDialog(type === 'prompt' ? null : false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                        <X size={18} />
                    </button>
                </div>

                {type === 'prompt' && (
                    <div className="mb-6">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm placeholder-slate-400"
                            placeholder="請輸入文字..."
                        />
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-2">
                    <button
                        onClick={() => closeDialog(type === 'prompt' ? null : false)}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => closeDialog(type === 'prompt' ? inputValue : true)}
                        className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-md hover:shadow-primary/30 transition-all active:scale-95"
                    >
                        確認
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GlobalDialog;
