// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import useDialogStore from '../store/useDialogStore';
import { X } from 'lucide-react';

const GlobalDialog = () => {
    const { isOpen, type, message, description, inputValue, actions, setInputValue, closeDialog } = useDialogStore();
    const inputRef = useRef<any>(null);
    const closeButtonRef = useRef<any>(null);
    const decisionButtonRefs = useRef<any[]>([]);
    const inputValueRef = useRef(inputValue);
    const actionsRef = useRef(actions);
    const [focusedDecisionIndex, setFocusedDecisionIndex] = useState(-1);

    inputValueRef.current = inputValue;
    actionsRef.current = actions;

    const decisionButtonCount = type === 'action' ? actions.length : 2;
    const defaultDecisionIndex = type === 'action' ? 0 : 1;

    const getDialogResult = (index: number) => {
        if (type === 'prompt') return inputValueRef.current;
        if (type === 'action') return actionsRef.current[index]?.id ?? null;
        return index === 1;
    };

    // Focus the primary/default control on open. Prompt inputs keep their native text editing focus.
    useEffect(() => {
        if (!isOpen) return undefined;

        const initialIndex = type === 'prompt' ? -1 : defaultDecisionIndex;
        setFocusedDecisionIndex(initialIndex);
        const focusTimer = window.setTimeout(() => {
            if (type === 'prompt') {
                inputRef.current?.focus();
                inputRef.current?.select();
                return;
            }
            decisionButtonRefs.current[defaultDecisionIndex]?.focus();
        }, 50);

        return () => window.clearTimeout(focusTimer);
    }, [actions.length, defaultDecisionIndex, isOpen, type]);

    // Shared dialog keyboard contract: ArrowLeft/ArrowRight selects a decision button; Enter executes it.
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.isComposing) return;
            const target = e.target;
            const isFromDialog = target.closest?.('.global-dialog-content');
            if (!isFromDialog) return;

            const isTextEditingTarget = target.tagName === 'INPUT'
                || target.tagName === 'TEXTAREA'
                || target.isContentEditable;
            const isCloseButton = target === closeButtonRef.current;
            const activeDecisionIndex = decisionButtonRefs.current.findIndex(button => button === target);
            const stopDialogKey = () => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            };

            if (e.key === 'Escape') {
                stopDialogKey();
                closeDialog(type === 'prompt' ? null : type === 'action' ? null : false);
                return;
            }

            // Preserve native caret movement while typing in prompt inputs.
            if (isTextEditingTarget && type === 'prompt') {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    // Keep the browser's caret default, but do not let the key reach a mode-level shortcut.
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                }
                if (e.key === 'Enter') {
                    stopDialogKey();
                    closeDialog(inputValueRef.current);
                }
                return;
            }

            if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && decisionButtonCount > 0 && !isCloseButton) {
                const currentIndex = activeDecisionIndex >= 0
                    ? activeDecisionIndex
                    : focusedDecisionIndex >= 0 ? focusedDecisionIndex : defaultDecisionIndex;
                const direction = e.key === 'ArrowLeft' ? -1 : 1;
                const nextIndex = (currentIndex + direction + decisionButtonCount) % decisionButtonCount;
                stopDialogKey();
                setFocusedDecisionIndex(nextIndex);
                decisionButtonRefs.current[nextIndex]?.focus();
                return;
            }

            if (e.key === 'Enter' && !isCloseButton) {
                const currentIndex = activeDecisionIndex >= 0
                    ? activeDecisionIndex
                    : focusedDecisionIndex >= 0 ? focusedDecisionIndex : defaultDecisionIndex;
                stopDialogKey();
                closeDialog(getDialogResult(currentIndex));
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [closeDialog, decisionButtonCount, defaultDecisionIndex, focusedDecisionIndex, isOpen, type]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" data-global-dialog="true" role="dialog" aria-modal="true">
            <div className="global-dialog-content bg-white rounded-xl shadow-2xl p-6 w-full max-w-md transform scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 break-words leading-snug pr-4">
                        {message}
                    </h3>
                    <button 
                        ref={closeButtonRef}
                        onClick={() => closeDialog(type === 'prompt' ? null : type === 'action' ? null : false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                        aria-label="關閉"
                        data-global-dialog-close="true"
                    >
                        <X size={18} />
                    </button>
                </div>

                {description ? (
                    <p className="mb-4 text-sm leading-6 text-slate-600">
                        {description}
                    </p>
                ) : null}

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

                {type === 'action' ? (
                    <div className="mt-2 grid gap-2">
                        {actions.map((action, index) => {
                            const isDanger = action.variant === 'danger';
                            const isPrimary = action.variant === 'primary';
                            return (
                                <button
                                    key={action.id}
                                    onClick={() => closeDialog(action.id)}
                                    ref={(element) => { decisionButtonRefs.current[index] = element; }}
                                    onFocus={() => setFocusedDecisionIndex(index)}
                                    data-global-dialog-decision="true"
                                    data-global-dialog-decision-index={index}
                                    className={`rounded-lg border px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                        isPrimary
                                            ? 'border-primary bg-primary text-white shadow-md hover:bg-primary-dark'
                                            : isDanger
                                                ? 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="block font-semibold">{action.label}</span>
                                    {action.description ? (
                                        <span className={`mt-0.5 block text-xs leading-5 ${isPrimary ? 'text-white/85' : 'text-slate-500'}`}>
                                            {action.description}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex justify-end gap-2 mt-2">
                        <button
                            ref={(element) => { decisionButtonRefs.current[0] = element; }}
                            onFocus={() => setFocusedDecisionIndex(0)}
                            onClick={() => closeDialog(type === 'prompt' ? null : false)}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            data-global-dialog-decision="true"
                            data-global-dialog-decision-index="0"
                        >
                            取消
                        </button>
                        <button
                            ref={(element) => { decisionButtonRefs.current[1] = element; }}
                            onFocus={() => setFocusedDecisionIndex(1)}
                            onClick={() => closeDialog(type === 'prompt' ? inputValue : true)}
                            className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-md hover:shadow-primary/30 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            data-global-dialog-decision="true"
                            data-global-dialog-decision-index="1"
                        >
                            確認
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GlobalDialog;
