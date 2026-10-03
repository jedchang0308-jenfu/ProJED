import type { PwaUpdateState } from '../../services/pwaUpdateService';
import { getPwaUpdatePresentation } from '../../services/pwaUpdatePresentation';

type QuickTaskPwaUpdateActions = {
  read: () => PwaUpdateState;
  subscribe: (listener: (state: PwaUpdateState) => void) => () => void;
  apply: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  recover: () => Promise<boolean>;
  dismiss: () => void;
};

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
  let suspended = false;
  let previousRenderValues: readonly unknown[] = [];
  const updating = () => isApplying || isRecovering || currentState?.localUpdateBusy === true;

  const render = () => {
    if (!active || suspended || !currentState) return;
    const presentation = getPwaUpdatePresentation(currentState);
    const { isRecovery } = presentation;
    const isUpdating = updating();
    // Version checks and safety notifications can change metadata without changing this view.
    const renderValues = [presentation.visible, isRecovery, presentation.title, presentation.detail, isUpdating, isApplying, isRecovering];
    if (renderValues.every((value, index) => value === previousRenderValues[index])) return;
    previousRenderValues = renderValues;
    root.hidden = !presentation.visible;
    heading.textContent = presentation.title;
    detail.textContent = presentation.detail ?? '';
    detail.hidden = presentation.detail === null;
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
    if (!active || suspended || updating()) return;
    if (operation === 'recover') isRecovering = true;
    else isApplying = true;
    render();
    try {
      await actions[operation]();
    } finally {
      isApplying = false;
      isRecovering = false;
      if (active && !suspended) render();
    }
  };
  const onUpdateClick = () => { void run('apply'); };
  const onRetryClick = () => { void run('retry'); };
  const onRecoverClick = () => { void run('recover'); };
  const onDismissClick = () => {
    if (active && !suspended && !updating()) actions.dismiss();
  };
  update.addEventListener('click', onUpdateClick);
  retry.addEventListener('click', onRetryClick);
  recover.addEventListener('click', onRecoverClick);
  later.addEventListener('click', onDismissClick);
  const unsubscribe = actions.subscribe(state => { currentState = state; render(); });
  const onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) {
      suspended = true;
      return;
    }
    cleanup();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || !active) return;
    suspended = false;
    currentState = actions.read();
    previousRenderValues = [];
    render();
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    unsubscribe();
    root.remove();
    update.removeEventListener('click', onUpdateClick);
    retry.removeEventListener('click', onRetryClick);
    recover.removeEventListener('click', onRecoverClick);
    later.removeEventListener('click', onDismissClick);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  return cleanup;
};
