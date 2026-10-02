import type { PwaUpdateState } from '../../services/pwaUpdateService';

type QuickTaskPwaUpdateActions = {
  subscribe: (listener: (state: PwaUpdateState) => void) => () => void;
  apply: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  recover: () => Promise<boolean>;
  dismiss: () => void;
};

export const shouldShowQuickTaskPwaUpdatePrompt = (state: PwaUpdateState) => (
  (state.updateAvailable && !state.dismissedAt && (state.reloadSafetyState === 'dirty' || state.reloadSafetyState === 'blocked'))
  || state.status === 'recoverable-cache-error'
  || state.status === 'failed'
);

const createButton = (label: string, variant: 'primary' | 'secondary', attribute: string) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `quick-task-pwa-update-action quick-task-pwa-update-${variant}`;
  button.dataset[attribute] = 'true';
  button.textContent = label;
  return button;
};

export const mountQuickTaskPwaUpdatePrompt = (actions: QuickTaskPwaUpdateActions) => {
  const root = document.createElement('div');
  root.className = 'quick-task-pwa-update';
  root.hidden = true;
  root.dataset.pwaUpdatePrompt = 'true';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');

  const toast = document.createElement('div');
  toast.className = 'quick-task-pwa-update-toast';
  const content = document.createElement('div');
  content.className = 'quick-task-pwa-update-content';
  const heading = document.createElement('h2');
  const detail = document.createElement('p');
  detail.dataset.pwaUpdateError = 'true';
  content.append(heading, detail);

  const controls = document.createElement('div');
  controls.className = 'quick-task-pwa-update-controls';
  const normalControls = document.createElement('div');
  normalControls.className = 'quick-task-pwa-update-buttons';
  const update = createButton('重新載入', 'primary', 'pwaUpdateAction');
  const later = createButton('稍後', 'secondary', 'pwaUpdateLater');
  normalControls.append(update, later);
  const recoveryControls = document.createElement('div');
  recoveryControls.className = 'quick-task-pwa-update-buttons';
  const retry = createButton('重試', 'primary', 'pwaUpdateRetry');
  const recover = createButton('清除快取後重整', 'secondary', 'pwaCacheRecovery');
  recoveryControls.append(retry, recover);
  controls.append(normalControls, recoveryControls);
  toast.append(content, controls);
  root.append(toast);
  document.body.append(root);

  let currentState: PwaUpdateState | null = null;
  let isApplying = false;
  let isRecovering = false;
  let active = true;
  const updating = () => isApplying || isRecovering || currentState?.reloadSafetyState === 'preparing'
    || currentState?.status === 'applying' || currentState?.status === 'awaiting-controller'
    || currentState?.status === 'verifying';

  const render = () => {
    if (!currentState) return;
    const isRecovery = currentState.status === 'recoverable-cache-error' || currentState.status === 'failed';
    const isBlocked = !isRecovery && currentState.reloadSafetyState === 'blocked';
    const isUpdating = updating();
    root.hidden = !shouldShowQuickTaskPwaUpdatePrompt(currentState);
    heading.textContent = isRecovery
      ? currentState.failureKind === 'load' ? '畫面載入失敗'
        : currentState.failureKind === 'cache-recovery' ? '快取恢復未完成' : '重新載入未完成'
      : '新版已就緒';
    detail.textContent = (isRecovery || isBlocked)
      ? currentState.errorMessage || (isBlocked ? '目前無法確認內容是否已保存。' : '請重試；若仍無法開啟，可清除應用程式快取後再載入。')
      : '';
    detail.hidden = !isRecovery && !isBlocked;
    normalControls.hidden = isRecovery;
    recoveryControls.hidden = !isRecovery;
    update.textContent = isUpdating ? '準備重新載入' : '重新載入';
    update.disabled = isUpdating || isRecovering;
    later.hidden = isUpdating;
    later.disabled = isUpdating;
    retry.textContent = isApplying ? '準備重新載入' : '重試';
    retry.disabled = isUpdating || isRecovering;
    recover.textContent = isRecovering ? '正在恢復' : '清除快取後重整';
    recover.disabled = isUpdating || isRecovering;
  };

  const run = async (operation: 'apply' | 'retry' | 'recover') => {
    if (!active || updating()) return;
    if (operation === 'recover') isRecovering = true;
    else isApplying = true;
    render();
    try {
      await actions[operation]();
    } finally {
      isApplying = false;
      isRecovering = false;
      if (active) render();
    }
  };
  update.addEventListener('click', () => { void run('apply'); });
  retry.addEventListener('click', () => { void run('retry'); });
  recover.addEventListener('click', () => { void run('recover'); });
  later.addEventListener('click', actions.dismiss);
  const unsubscribe = actions.subscribe(state => { currentState = state; render(); });
  const cleanup = () => {
    if (!active) return;
    active = false;
    unsubscribe();
    root.remove();
    window.removeEventListener('pagehide', cleanup);
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  return cleanup;
};
