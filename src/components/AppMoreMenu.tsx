import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
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

interface AppMoreMenuProps {
  isRecordsView: boolean;
  isSettingsScopeView: boolean;
  showShareAction: boolean;
  boardMemberCount: number;
  isMeetingRecordUnavailable: boolean;
  isMeetingMode: boolean;
  isNonMeetingRecordOpen: boolean;
  isRecordOpen: boolean;
  onOpenRecords: () => void;
  onOpenSettings: () => void;
  onOpenShareDialog: () => void;
  onToggleMeetingRecord: () => void;
}

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

const AppMoreMenu: React.FC<AppMoreMenuProps> = ({
  isRecordsView,
  isSettingsScopeView,
  showShareAction,
  boardMemberCount,
  isMeetingRecordUnavailable,
  isMeetingMode,
  isNonMeetingRecordOpen,
  isRecordOpen,
  onOpenRecords,
  onOpenSettings,
  onOpenShareDialog,
  onToggleMeetingRecord,
}) => {
  const [state, setState] = useState<PwaUpdateState>(() => getPwaUpdateState());
  const [operation, setOperation] = useState<CheckOperation>(emptyOperation);
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = useAuthStore(s => s.user);
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
  const hasUpdateNotification = state.status === 'update-available'
    && state.updateAvailable
    && !state.dismissedAt;
  const isLocalBusy = state.localUpdateBusy;
  const statusMessage = presentation.statusMessage;
  const showPersonalRecordAction = !isMeetingMode && !isRecordOpen;
  const hasWorkspaceActions = showShareAction || !isMeetingRecordUnavailable || showPersonalRecordAction;

  return (
    <details
      ref={detailsRef}
      className="relative shrink-0"
      data-app-more-menu="true"
      onToggle={(event) => handleDisclosureToggle(event.currentTarget.open)}
    >
      <summary
        ref={summaryRef}
        aria-label={hasUpdateNotification ? '更多選項，有可用更新' : '更多選項'}
        title={hasUpdateNotification ? '更多選項，有可用更新' : '更多選項'}
        className="group flex h-11 w-11 cursor-pointer list-none items-center justify-center focus:outline-none [&::-webkit-details-marker]:hidden"
      >
        {/* Match the topbar's visible size while keeping a 44px touch target. */}
        <span
          aria-hidden="true"
          className={cn(
            topbarClassNames.iconButton,
            'relative group-hover:border-slate-400 group-hover:bg-slate-100 group-hover:text-slate-700 group-focus-visible:ring-2 group-focus-visible:ring-primary/20',
            isOpen && 'border-slate-400 bg-slate-100 text-slate-700',
          )}
        >
          <MoreVertical size={16} />
          {hasUpdateNotification ? (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white"
              data-app-more-update-badge="true"
            >
              1
            </span>
          ) : null}
        </span>
        <span className="sr-only">{hasUpdateNotification ? '更多選項，有可用更新' : '更多選項'}</span>
      </summary>

      {isOpen ? (
        <div
          className="absolute right-1.5 top-full z-50 mt-0.5 max-h-[calc(100dvh-3.5rem)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg"
          data-app-more-menu-panel="true"
        >
          <button
            type="button"
            className={`flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              isSettingsScopeView ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => {
              closeMenu();
              onOpenSettings();
            }}
            aria-current={isSettingsScopeView ? 'page' : undefined}
            title={isSettingsScopeView ? '回到看板' : '設定'}
            data-app-more-settings="true"
            data-sidebar-settings-button="true"
          >
            <span className="min-w-0 flex-1">設定</span>
          </button>
          <button
            type="button"
            className={`flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              isRecordsView ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => {
              closeMenu();
              onOpenRecords();
            }}
            aria-current={isRecordsView ? 'page' : undefined}
            title={isRecordsView ? '回到看板' : '紀錄庫'}
            data-app-more-records="true"
            data-sidebar-records-button="true"
          >
            <span className="min-w-0 flex-1">紀錄庫</span>
          </button>
          {hasWorkspaceActions ? <div className="my-1 h-px bg-slate-200" role="separator" /> : null}
          {showShareAction ? (
            <button
              type="button"
              className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => {
                closeMenu();
                onOpenShareDialog();
              }}
              title="分享看板"
              aria-label={`分享看板，${boardMemberCount} 位成員`}
              data-board-share-open
              data-app-more-share="true"
            >
              <span className="min-w-0 flex-1">分享看板</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                {boardMemberCount}
              </span>
            </button>
          ) : null}
          {!isMeetingRecordUnavailable ? (
            isMeetingMode ? (
              <div
                role="status"
                data-active-record-kind="meeting"
                className="flex min-h-11 items-center rounded px-3 text-sm text-blue-700"
                title="已開啟會議紀錄；離開請使用右側紀錄欄的離開紀錄。"
              >
                <span>紀錄中</span>
              </div>
            ) : isNonMeetingRecordOpen ? (
              <div
                role="status"
                data-active-record-kind="work-log"
                className="flex min-h-11 items-center rounded px-3 text-sm text-blue-700"
                title="已開啟個人紀錄；若要開始會議模式，請先離開目前紀錄。"
              >
                <span>紀錄中</span>
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={() => {
                  closeMenu();
                  onToggleMeetingRecord();
                }}
                title="開始會議模式，開啟右側紀錄欄"
                data-app-more-meeting-record="true"
              >
                <span className="min-w-0 flex-1">開始會議模式</span>
              </button>
            )
          ) : null}
          {showPersonalRecordAction ? (
            <>
              <button
                type="button"
                disabled
                aria-describedby="app-more-work-log-unavailable"
                title="個人紀錄功能目前尚未開放，敬請期待。"
                className="flex min-h-11 w-full cursor-not-allowed items-center rounded px-3 text-left text-sm font-medium text-slate-400"
                data-work-log-unavailable="true"
                data-app-more-work-log="true"
              >
                <span className="min-w-0 flex-1">新增個人紀錄</span>
              </button>
              <span id="app-more-work-log-unavailable" className="sr-only">個人紀錄功能目前尚未開放，敬請期待。</span>
            </>
          ) : null}
          <button
            type="button"
            className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={presentation.checkDisabled || operation.pending || isLocalBusy}
            onClick={handleCheck}
            data-app-update-check="true"
          >
            立即檢查更新
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
          <div className="my-1 h-px bg-slate-200" role="separator" />
          <div className="flex min-w-0 items-center justify-between gap-2 px-2 py-2" data-app-more-account="true">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-700">{currentUser?.displayName || '使用者'}</div>
              <div className="truncate text-xs text-slate-400">{currentUser?.email || ''}</div>
            </div>
            <button
              type="button"
              onClick={() => void useAuthStore.getState().signOut()}
              className="flex h-9 shrink-0 items-center rounded px-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="登出"
              aria-label="登出"
              data-app-more-sign-out="true"
            >
              登出
            </button>
          </div>
        </div>
      ) : null}
    </details>
  );
};

export default AppMoreMenu;
