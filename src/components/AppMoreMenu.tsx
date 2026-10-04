import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  applyPwaUpdate,
  checkPwaUpdate,
  getPwaUpdateState,
  subscribePwaUpdateState,
  type PwaUpdateCheckState,
  type PwaUpdateState,
} from '../services/pwaUpdateService';
import { getPwaCheckPresentation } from '../services/pwaUpdatePresentation';
import { cn } from '../utils/cn';
import { topbarClassNames } from './ui/compactTokens';

type CheckOperation = {
  pending: boolean;
  result: PwaUpdateCheckState | null;
};

const emptyOperation = (): CheckOperation => ({ pending: false, result: null });
const CHECK_WAIT_MS = 10_000;

const makeLocalCheckResult = (
  phase: 'error',
  errorCode: 'CHECK_FAILED' | 'CHECK_TIMEOUT',
  startedAt: number,
  requestId = 0,
): PwaUpdateCheckState => ({
  requestId,
  phase,
  currentVersion: null,
  latestVersion: null,
  startedAt,
  finishedAt: Date.now(),
  errorCode,
});

const AppMoreMenu: React.FC = () => {
  const [state, setState] = useState<PwaUpdateState>(() => getPwaUpdateState());
  const [operation, setOperation] = useState<CheckOperation>(emptyOperation);
  const [isOpen, setIsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(false);
  const isOpenRef = useRef(false);
  const stateRef = useRef(state);
  const operationRef = useRef<CheckOperation>(emptyOperation());
  const actionSequenceRef = useRef(0);
  const cancelWaitRef = useRef<(() => void) | null>(null);
  const pendingPromptFocusRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);

  const clearPromptFocus = useCallback(() => {
    pendingPromptFocusRef.current = null;
    if (focusFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
  }, []);

  const invalidateMenuOperation = useCallback(() => {
    actionSequenceRef.current += 1;
    clearPromptFocus();
    cancelWaitRef.current?.();
    cancelWaitRef.current = null;
    operationRef.current = emptyOperation();
    setOperation(operationRef.current);
  }, [clearPromptFocus]);

  const closeMenu = useCallback(() => {
    invalidateMenuOperation();
    isOpenRef.current = false;
    if (detailsRef.current?.open) detailsRef.current.open = false;
    setIsOpen(false);
  }, [invalidateMenuOperation]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribePwaUpdateState((nextState) => {
      stateRef.current = nextState;
      const currentOperation = operationRef.current;
      if (currentOperation.result) {
        const nextPresentation = getPwaCheckPresentation(nextState, currentOperation);
        if (nextPresentation.clearResult) {
          operationRef.current = emptyOperation();
          setOperation(operationRef.current);
        }
      }
      setState(nextState);
    });
    const handlePageHide = () => {
      invalidateMenuOperation();
      isOpenRef.current = false;
      if (detailsRef.current?.open) detailsRef.current.open = false;
      setIsOpen(false);
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      mountedRef.current = false;
      actionSequenceRef.current += 1;
      clearPromptFocus();
      cancelWaitRef.current?.();
      cancelWaitRef.current = null;
      window.removeEventListener('pagehide', handlePageHide);
      unsubscribe();
    };
  }, [clearPromptFocus, invalidateMenuOperation]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details && event.target && details.contains(event.target as Node)) return;
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpenRef.current || event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      summaryRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeMenu, isOpen]);

  const handleDisclosureToggle = (nextOpen: boolean) => {
    if (nextOpen === isOpenRef.current) return;
    isOpenRef.current = nextOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      actionSequenceRef.current += 1;
      clearPromptFocus();
      operationRef.current = emptyOperation();
      setOperation(operationRef.current);
    } else {
      invalidateMenuOperation();
    }
  };

  const transferFocusToPrompt = (sequence: number, result: PwaUpdateCheckState) => {
    pendingPromptFocusRef.current = sequence;

    const tryFocus = (attempt: number) => {
      if (
        !mountedRef.current
        || pendingPromptFocusRef.current !== sequence
        || actionSequenceRef.current !== sequence
        || isOpenRef.current
      ) return;

      if (!getPwaCheckPresentation(stateRef.current, { pending: false, result }).handoffToPrompt) {
        clearPromptFocus();
        return;
      }

      const promptAction = document.querySelector<HTMLElement>(
        '[data-pwa-update-prompt] [data-pwa-update-action]',
      );
      const isDisabled = promptAction instanceof HTMLButtonElement && promptAction.disabled;
      if (promptAction && !isDisabled) {
        promptAction.focus({ preventScroll: true });
        pendingPromptFocusRef.current = null;
        focusFrameRef.current = null;
        return;
      }

      if (attempt >= 4) {
        pendingPromptFocusRef.current = null;
        focusFrameRef.current = null;
        return;
      }
      focusFrameRef.current = window.requestAnimationFrame(() => tryFocus(attempt + 1));
    };

    focusFrameRef.current = window.requestAnimationFrame(() => tryFocus(0));
  };

  const handleCheck = () => {
    if (!isOpenRef.current) return;
    const currentPresentation = getPwaCheckPresentation(stateRef.current, operationRef.current);
    if (currentPresentation.checkDisabled || operationRef.current.pending || stateRef.current.localUpdateBusy) return;

    const sequence = actionSequenceRef.current + 1;
    actionSequenceRef.current = sequence;
    const startedAt = Date.now();
    const deadlineAt = startedAt + CHECK_WAIT_MS;
    const pendingOperation: CheckOperation = { pending: true, result: null };
    operationRef.current = pendingOperation;
    setOperation(pendingOperation);

    let serviceRequest: Promise<PwaUpdateCheckState>;
    try {
      serviceRequest = Promise.resolve(checkPwaUpdate({ deadlineAt })).catch(() => (
        makeLocalCheckResult('error', 'CHECK_FAILED', startedAt)
      ));
    } catch {
      serviceRequest = Promise.resolve(makeLocalCheckResult('error', 'CHECK_FAILED', startedAt));
    }

    let timeoutId: number | null = null;
    let cancelWait: (() => void) | null = null;
    const timeoutResult = new Promise<PwaUpdateCheckState | null>((resolve) => {
      timeoutId = window.setTimeout(() => {
        const currentCheck = stateRef.current.check;
        const requestId = currentCheck.phase === 'checking' ? currentCheck.requestId : 0;
        resolve(makeLocalCheckResult('error', 'CHECK_TIMEOUT', startedAt, requestId));
      }, Math.max(0, deadlineAt - Date.now()));
      cancelWait = () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve(null);
      };
      cancelWaitRef.current = cancelWait;
    });

    void Promise.race([serviceRequest, timeoutResult]).then((result) => {
      if (
        !result
        || !mountedRef.current
        || !isOpenRef.current
        || actionSequenceRef.current !== sequence
      ) return;

      const latestState = getPwaUpdateState();
      stateRef.current = latestState;
      setState(latestState);
      const completedOperation: CheckOperation = { pending: false, result };
      const presentation = getPwaCheckPresentation(latestState, completedOperation);
      if (presentation.clearResult) {
        operationRef.current = emptyOperation();
        setOperation(operationRef.current);
        return;
      }

      operationRef.current = completedOperation;
      setOperation(completedOperation);
      if (!presentation.handoffToPrompt) return;

      const details = detailsRef.current;
      if (!details?.open || actionSequenceRef.current !== sequence) return;
      clearPromptFocus();
      operationRef.current = emptyOperation();
      setOperation(operationRef.current);
      isOpenRef.current = false;
      details.open = false;
      setIsOpen(false);
      transferFocusToPrompt(sequence, result);
    }).finally(() => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (cancelWaitRef.current === cancelWait) cancelWaitRef.current = null;
    });
  };

  const handleReload = async () => {
    if (stateRef.current.localUpdateBusy) return;
    try {
      await applyPwaUpdate();
    } catch {
      // The existing global update prompt owns recovery feedback.
    }
  };

  const presentation = getPwaCheckPresentation(state, operation);
  const isLocalBusy = state.localUpdateBusy;
  const statusMessage = presentation.statusMessage;

  return (
    <details
      ref={detailsRef}
      className="relative shrink-0"
      data-app-more-menu="true"
      onToggle={(event) => handleDisclosureToggle(event.currentTarget.open)}
    >
      <summary
        ref={summaryRef}
        aria-label="更多選項"
        title="更多選項"
        className="group flex h-11 w-11 cursor-pointer list-none items-center justify-center focus:outline-none [&::-webkit-details-marker]:hidden"
      >
        {/* Match the topbar's visible size while keeping a 44px touch target. */}
        <span
          aria-hidden="true"
          className={cn(
            topbarClassNames.iconButton,
            'group-hover:border-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 group-focus-visible:ring-2 group-focus-visible:ring-primary/20',
            isOpen && 'border-slate-400 bg-slate-100 text-slate-700',
          )}
        >
          <MoreVertical size={16} />
        </span>
        <span className="sr-only">更多選項</span>
      </summary>

      {isOpen ? (
        <div
          className="absolute right-1.5 top-full z-50 mt-0.5 max-h-[calc(100dvh-3.5rem)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg"
          data-app-more-menu-panel="true"
        >
          <button
            type="button"
            className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={presentation.checkDisabled || operation.pending || isLocalBusy}
            onClick={handleCheck}
            data-app-update-check="true"
          >
            檢查更新
          </button>
          {statusMessage ? (
            <p className="px-3 py-2 text-xs leading-5 text-slate-600" role="status" aria-live="polite" aria-atomic="true">
              {statusMessage}
            </p>
          ) : null}
          {!isLocalBusy && presentation.showReload ? (
            <button
              type="button"
              className="mt-1 flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-semibold text-primary hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleReload()}
              data-app-update-reload="true"
            >
              重新載入
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
};

export default AppMoreMenu;
