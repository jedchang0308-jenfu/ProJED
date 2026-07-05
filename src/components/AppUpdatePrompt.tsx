import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import {
  applyPwaUpdate,
  clearPwaApplicationCacheAndReload,
  dismissPwaUpdatePrompt,
  getPwaUpdateState,
  subscribePwaUpdateState,
  type PwaUpdateState,
} from '../services/pwaUpdateService';
import { Button } from './ui/Button';

const isVisibleState = (state: PwaUpdateState) => (
  (state.updateAvailable && !state.dismissedAt) ||
  state.status === 'recoverable-cache-error' ||
  state.status === 'failed'
);

export const AppUpdatePrompt: React.FC = () => {
  const [state, setState] = useState<PwaUpdateState>(() => getPwaUpdateState());
  const [isApplying, setIsApplying] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => subscribePwaUpdateState(setState), []);

  const visible = isVisibleState(state);
  const isRecovery = state.status === 'recoverable-cache-error' || state.status === 'failed';
  const content = useMemo(() => {
    if (isRecovery) {
      return {
        title: '載入新版時發生問題',
        description: '請重新整理；若仍無法開啟，可清除應用程式快取後再載入。',
        actionLabel: '重新整理',
      };
    }
    return {
      title: '有新版本可用',
      description: '更新後會重新整理畫面，建議先完成正在輸入的內容。',
      actionLabel: '更新',
    };
  }, [isRecovery]);

  const handleUpdate = async () => {
    if (isApplying) return;
    setIsApplying(true);
    await applyPwaUpdate();
    setIsApplying(false);
  };

  const handleRecovery = async () => {
    if (isRecovering) return;
    setIsRecovering(true);
    await clearPwaApplicationCacheAndReload();
    setIsRecovering(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[9999] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:px-5 sm:pb-5"
      data-pwa-update-prompt
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/20 sm:p-4">
        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isRecovery ? 'bg-amber-50 text-amber-600' : 'bg-primary/10 text-primary'}`}>
          {isRecovery ? <AlertTriangle size={18} /> : <RefreshCw size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-5 text-slate-900">{content.title}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{content.description}</p>
            </div>
            {!isRecovery && (
              <button
                type="button"
                onClick={dismissPwaUpdatePrompt}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="稍後更新"
                data-pwa-update-dismiss
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            {isRecovery ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="gap-2"
                  data-pwa-update-action
                >
                  <RefreshCw size={15} />
                  {content.actionLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={isRecovering}
                  onClick={handleRecovery}
                  data-pwa-cache-recovery
                >
                  清除快取後重整
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  isLoading={isApplying || state.status === 'applying'}
                  onClick={handleUpdate}
                  className="gap-2"
                  data-pwa-update-action
                >
                  <RefreshCw size={15} />
                  {state.status === 'applying' || isApplying ? '更新中' : content.actionLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={dismissPwaUpdatePrompt}
                  data-pwa-update-later
                >
                  稍後
                </Button>
              </>
            )}
          </div>
          {state.errorMessage && (
            <p className="mt-2 break-words text-xs leading-5 text-slate-500" data-pwa-update-error>
              {state.errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
