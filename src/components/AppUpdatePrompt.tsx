import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  clearPwaApplicationCacheAndReload,
  getPwaUpdateState,
  subscribePwaUpdateState,
  retryPwaUpdate,
  type PwaUpdateState,
} from '../services/pwaUpdateService';
import { getPwaUpdatePresentation } from '../services/pwaUpdatePresentation';
import { Button } from './ui/Button';

export const AppUpdatePrompt: React.FC = () => {
  const [state, setState] = useState<PwaUpdateState>(() => getPwaUpdateState());
  const [isApplying, setIsApplying] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePwaUpdateState(setState);
    return unsubscribe;
  }, []);

  const presentation = getPwaUpdatePresentation(state);
  const { isRecovery } = presentation;
  const visible = presentation.visible;
  const isUpdating = state.localUpdateBusy || isApplying || isRecovering;

  const handleRecovery = async () => {
    if (isRecovering || isUpdating) return;
    setIsRecovering(true);
    try {
      await clearPwaApplicationCacheAndReload();
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRetry = async () => {
    if (isUpdating || isRecovering) return;
    setIsApplying(true);
    try {
      await retryPwaUpdate();
    } finally {
      setIsApplying(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[9999] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] sm:px-5 sm:pb-4"
      data-pwa-update-prompt
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl shadow-slate-900/15 sm:px-4 sm:py-3">
        {isRecovery && (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600" aria-hidden="true">
            <AlertTriangle size={17} />
          </span>
        )}
        <div className="min-w-[10rem] flex-1">
          <h2 className="truncate text-sm font-bold leading-5 text-slate-900">
            {presentation.title}
          </h2>
          {presentation.detail !== null && (
            <p className="mt-0.5 break-words text-xs leading-4 text-slate-600" data-pwa-update-error>
              {presentation.detail}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isRecovery && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={handleRetry}
                isLoading={isApplying}
                disabled={isUpdating}
                className="h-8 px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                data-pwa-update-action
              >
                重試
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isRecovering}
                disabled={isUpdating}
                onClick={handleRecovery}
                className="h-8 px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                data-pwa-cache-recovery
              >
                清除快取後重整
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
