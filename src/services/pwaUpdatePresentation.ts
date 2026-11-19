import type { PwaUpdateState, PwaUpdateCheckState, PwaCheckErrorCode } from './pwaUpdateService';

// Shared by the React shell and the lightweight Quick Task shell; no runtime side effects.
export const getPwaUpdatePresentation = (state: PwaUpdateState) => {
  const isRecovery = state.status === 'recoverable-cache-error' || state.status === 'failed';
  return {
    visible: isRecovery,
    isRecovery,
    title: isRecovery
      ? state.failureKind === 'load' ? '畫面載入失敗'
        : state.failureKind === 'cache-recovery' ? '快取恢復未完成' : '重新載入未完成'
      : '新版已就緒',
    detail: isRecovery
      ? state.errorMessage || '請重試；若仍無法開啟，可清除應用程式快取後再載入。'
      : null,
  };
};

export type PwaCheckUiState = { pending: boolean; result: PwaUpdateCheckState | null };
export type PwaCheckPresentation = {
  checkDisabled: boolean;
  statusMessage: string | null;
  showUpdate: boolean;
  showLater: boolean;
  showBadge: boolean;
  clearResult: boolean;
};
const checkMessages: Record<PwaCheckErrorCode, string> = {
  CHECK_OFFLINE: '無法連線',
  CHECK_TIMEOUT: '檢查逾時，請重試',
  CHECK_FAILED: '檢查失敗，請重試',
  CHECK_UNAVAILABLE: '目前無法檢查更新',
  CHECK_VERSION_UNKNOWN: '無法確認版本，請重試',
};
export const getPwaCheckPresentation = (state: PwaUpdateState, operation: PwaCheckUiState): PwaCheckPresentation => {
  const result = operation.result;
  const success = result?.phase === 'up-to-date' || result?.phase === 'available';
  const clearResult = Boolean(success && (state.localUpdateBusy
    || result.currentVersion !== state.currentVersion || result.latestVersion !== state.latestVersion));
  const isRecovery = getPwaUpdatePresentation(state).isRecovery;
  const available = state.updateAvailable && !isRecovery;
  return {
    checkDisabled: state.localUpdateBusy || operation.pending,
    statusMessage: state.localUpdateBusy ? '正在更新' : operation.pending ? '檢查中'
      : available && state.errorMessage ? state.errorMessage
        : clearResult ? null : result?.phase === 'up-to-date' && !available ? '已是最新版'
          : result?.phase === 'busy' ? '正在更新'
          : result?.phase === 'error' ? checkMessages[result.errorCode ?? 'CHECK_FAILED']
            : !available && !isRecovery && state.lastAppliedAt && state.previousVersion !== state.currentVersion ? '已完成更新'
              : null,
    showUpdate: available,
    showLater: available && !state.dismissedAt && !state.localUpdateBusy,
    showBadge: available && !state.dismissedAt && !state.localUpdateBusy,
    clearResult,
  };
};
