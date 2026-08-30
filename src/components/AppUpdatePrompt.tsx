import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
  (state.updateAvailable && !state.dismissedAt)
  || state.status === 'recoverable-cache-error'
  || state.status === 'failed'
);

export const AppUpdatePrompt: React.FC = () => {
  const [state, setState] = useState<PwaUpdateState>(() => getPwaUpdateState());
  const [isApplying, setIsApplying] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePwaUpdateState(setState);
    return unsubscribe;
  }, []);

  const visible = isVisibleState(state);
  const isRecovery = state.status === 'recoverable-cache-error' || state.status === 'failed';
  const isUpdating = isApplying || state.status === 'applying' || state.status === 'awaiting-controller' || state.status === 'verifying';

  const handleUpdate = async () => {
    if (isUpdating) return;
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
      className="fixed inset-x-0 bottom-0 z-[9999] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] sm:px-5 sm:pb-4"
      data-pwa-update-prompt
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl shadow-slate-900/15 sm:px-4 sm:py-3">
        {isRecovery && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600" aria-hidden="true">
            <AlertTriangle size={17} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold leading-5 text-slate-900">
            {isRecovery ? '載入新版時發生問題' : '有新版本可用'}
          </h2>
          {isRecovery && (
            <p className="mt-0.5 break-words text-xs leading-4 text-slate-600" data-pwa-update-error>
              {state.errorMessage || '請重新整理；若仍無法開啟，可清除應用程式快取後再載入。'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRecovery ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => window.location.reload()}
                className="h-8 px-2.5 text-xs"
                data-pwa-update-action
              >
                重新整理
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isRecovering}
                onClick={handleRecovery}
                className="h-8 px-2.5 text-xs"
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
                isLoading={isUpdating}
                onClick={handleUpdate}
                className="h-8 px-2.5 text-xs"
                data-pwa-update-action
              >
                {isUpdating ? '更新中' : '一鍵更新'}
              </Button>
              {!isUpdating && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={dismissPwaUpdatePrompt}
                  className="h-8 px-2 text-xs"
                  data-pwa-update-later
                >
                  稍後
                </Button>
              )}
              {!isUpdating && (
                <button
                  type="button"
                  onClick={dismissPwaUpdatePrompt}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  aria-label="關閉更新提示"
                  data-pwa-update-dismiss
                >
                  <X size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
