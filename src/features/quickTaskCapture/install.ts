import { getPwaCheckPresentation } from '../../services/pwaUpdatePresentation';
import type { PwaUpdateCheckState, PwaUpdateState } from '../../services/pwaUpdateService';
import { countAllPendingQuickCaptures } from './outbox';
import { getQuickInstallUrl, isMainProductionOrigin } from './origins';

type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
};

type BeforeInstallPromptEventLike = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type QuickInstallPlatform = 'standalone' | 'ios' | 'android' | 'embedded' | 'browser';
type QuickPwaUpdateApi = Pick<
  typeof import('../../services/pwaUpdateService'),
  'getPwaUpdateState' | 'subscribePwaUpdateState' | 'checkPwaUpdate' | 'applyPwaUpdate'
>;

type QuickInstallGuideOptions = {
  getPwaApi: () => Promise<QuickPwaUpdateApi>;
};

const CHECK_UI_DEADLINE_MS = 10_000;
const checkErrorMessages: Record<NonNullable<PwaUpdateCheckState['errorCode']>, string> = {
  CHECK_OFFLINE: '無法連線',
  CHECK_TIMEOUT: '檢查逾時，請重試',
  CHECK_FAILED: '檢查失敗，請重試',
  CHECK_UNAVAILABLE: '目前無法檢查更新',
  CHECK_VERSION_UNKNOWN: '無法確認版本，請重試',
};

const isStandalone = () => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
      || window.matchMedia?.('(display-mode: minimal-ui)').matches
      || window.matchMedia?.('(display-mode: fullscreen)').matches
      || nav.standalone,
  );
};

const detectPlatform = (): QuickInstallPlatform => {
  if (isStandalone()) return 'standalone';
  const userAgent = navigator.userAgent || '';
  if (/FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|Threads|TikTok|BytedanceWebview|KAKAOTALK/iu.test(userAgent)) return 'embedded';
  if (/iPad|iPhone|iPod/iu.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/iu.test(userAgent)) return 'android';
  return 'browser';
};

const createButton = (label: string, attribute: string) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-task-install-menu-action';
  button.dataset[attribute] = 'true';
  button.textContent = label;
  return button;
};

const makeCheckResult = (
  errorCode: NonNullable<PwaUpdateCheckState['errorCode']>,
  startedAt: number,
): PwaUpdateCheckState => ({
  requestId: 0,
  phase: 'error',
  currentVersion: null,
  latestVersion: null,
  startedAt,
  finishedAt: Date.now(),
  errorCode,
});

const isSuccessfulCheck = (result: PwaUpdateCheckState | null): result is PwaUpdateCheckState => (
  result?.phase === 'up-to-date' || result?.phase === 'available'
);

export const installQuickInstallGuide = (container: HTMLElement, options?: QuickInstallGuideOptions) => {
  const candidateSection = container.querySelector<HTMLElement>('#quick-task-install');
  if (!candidateSection) return () => undefined;
  const section = candidateSection;

  const mainProductionOrigin = isMainProductionOrigin(window.location.origin);
  const platform = detectPlatform();
  const compactViewport = window.matchMedia('(max-width: 559px)');
  const canReinstall = !mainProductionOrigin && platform === 'standalone' && /Android/iu.test(navigator.userAgent || '');
  const installUrl = new URL(getQuickInstallUrl(window.location.origin), window.location.origin).toString();
  const originalParent = section.parentNode;
  const originalNextSibling = section.nextSibling;
  const originallyHidden = section.hidden;
  const originallyPlain = section.classList.contains('quick-task-install-plain');

  let active = true;
  let suspended = false;
  let lifecycleEpoch = 0;
  let deferredPrompt: BeforeInstallPromptEventLike | null = null;
  let installing = false;
  let showReinstall = false;
  let pendingStatus: 'checking' | 'ready' | 'unavailable' = 'checking';
  let pendingCount = 0;
  let linkNotice = '';
  let installNoticeText = '';
  let checkPending = false;
  let checkResult: PwaUpdateCheckState | null = null;
  let checkSequence = 0;
  let pendingCheckSequence: number | null = null;
  let checkDeadlineTimer: ReturnType<typeof window.setTimeout> | null = null;
  let reloadPending = false;
  let reinstallRequestSequence = 0;
  let updateApi: QuickPwaUpdateApi | null = null;
  let updateApiPromise: Promise<QuickPwaUpdateApi> | null = null;
  let unsubscribeUpdateState: (() => void) | null = null;
  let updateSubscriptionAttempted = false;
  let updateState: PwaUpdateState | null = null;

  const menu = document.createElement('details');
  menu.className = 'quick-task-install-menu';
  menu.dataset.quickInstallMenu = 'true';
  const summary = document.createElement('summary');
  summary.setAttribute('aria-label', '更多選項');
  summary.title = '更多選項';
  summary.textContent = '⋮';
  const panel = document.createElement('div');
  panel.className = 'quick-task-install-menu-panel';

  const updateRow = document.createElement('div');
  updateRow.className = 'quick-task-update-menu-row';
  const checkButton = createButton('檢查更新', 'quickUpdateCheck');
  updateRow.append(checkButton);
  const checkStatus = document.createElement('small');
  checkStatus.dataset.quickUpdateStatus = 'true';
  checkStatus.setAttribute('role', 'status');
  checkStatus.setAttribute('aria-live', 'polite');
  checkStatus.hidden = true;
  const reloadButton = createButton('重新載入', 'quickUpdateReload');
  reloadButton.hidden = true;

  const installButton = createButton('安裝APP', 'quickInstallAction');
  const installNotice = document.createElement('small');
  installNotice.dataset.quickInstallNotice = 'true';
  installNotice.setAttribute('role', 'status');
  installNotice.setAttribute('aria-live', 'polite');
  installNotice.hidden = true;
  panel.append(updateRow, checkStatus, reloadButton, installButton, installNotice);
  menu.append(summary, panel);
  section.replaceChildren(menu);
  section.hidden = false;
  section.classList.add('quick-task-install-plain');
  container.querySelector<HTMLElement>('.quick-task-header-actions')?.append(section);

  const installNoticeDialog = document.createElement('dialog');
  installNoticeDialog.className = 'quick-task-install-dialog';
  installNoticeDialog.setAttribute('aria-labelledby', 'quick-task-install-dialog-title');
  installNoticeDialog.setAttribute('aria-describedby', 'quick-task-install-dialog-description');
  const dialogTitle = document.createElement('h2');
  dialogTitle.id = 'quick-task-install-dialog-title';
  dialogTitle.textContent = '安裝提示';
  const dialogMessage = document.createElement('p');
  dialogMessage.id = 'quick-task-install-dialog-description';
  dialogMessage.dataset.quickInstallDialogMessage = 'true';
  const dialogContent = document.createElement('div');
  dialogContent.dataset.quickInstallDialogContent = 'true';
  const dialogForm = document.createElement('form');
  dialogForm.method = 'dialog';
  const dialogCloseButton = document.createElement('button');
  dialogCloseButton.type = 'submit';
  dialogCloseButton.textContent = '關閉';
  dialogForm.append(dialogCloseButton);
  installNoticeDialog.append(dialogTitle, dialogMessage, dialogContent, dialogForm);
  document.body.append(installNoticeDialog);

  const getInstallGuidance = () => {
    if (platform === 'standalone') {
      return {
        title: '安裝與圖示',
        message: '目前以 App 視窗開啟。是否已建立獨立手機圖示，請以裝置的應用程式清單為準。',
      };
    }
    if (platform === 'android' || (platform === 'browser' && compactViewport.matches)) {
      return {
        title: '從 Chrome 安裝 ProJED-快速建任務',
        message: '用手機 Chrome 開啟此頁，點右上角「⋮」，選「安裝應用程式」，再點「安裝」。',
      };
    }
    if (platform === 'ios') {
      return {
        title: '加入 iPhone 主畫面',
        message: '用 Safari 開啟此頁，點分享按鈕，再選「加入主畫面」。',
      };
    }
    if (platform === 'embedded') {
      return {
        title: '先用瀏覽器開啟',
        message: '請先在此頁選「用瀏覽器開啟」，再使用 Chrome 或 Safari 的安裝功能。',
      };
    }
    return {
      title: '安裝提示',
      message: '目前瀏覽器無法直接開啟安裝視窗。請用 Chrome 或 Edge 開啟此頁，再點網址列的安裝圖示。',
    };
  };

  const reinstallToggle = canReinstall ? document.createElement('button') : null;
  const reinstallPanel = canReinstall ? document.createElement('div') : null;
  const pendingMessage = canReinstall ? document.createElement('span') : null;
  const linkNoticeElement = canReinstall ? document.createElement('small') : null;
  if (canReinstall && reinstallToggle && reinstallPanel && pendingMessage && linkNoticeElement) {
    reinstallToggle.type = 'button';
    reinstallToggle.dataset.quickIconReinstallToggle = 'true';
    reinstallToggle.textContent = '自行更新此圖示（選用）';
    reinstallToggle.setAttribute('aria-expanded', 'false');
    reinstallPanel.className = 'quick-icon-reinstall';
    reinstallPanel.dataset.quickIconReinstall = 'true';
    reinstallPanel.hidden = true;
    const stepList = document.createElement('ol');
    const pendingStep = document.createElement('li');
    pendingStep.append(pendingMessage);
    const installStep = document.createElement('li');
    installStep.textContent = '先保留安裝連結；只有在 Android「設定 → 應用程式」找得到「ProJED-快速建任務」時，才解除安裝該 App。';
    const reopenStep = document.createElement('li');
    reopenStep.textContent = '從保留的連結以 Chrome 開啟，選「安裝應用程式」，用原帳號登入；完成後確認應用程式清單有獨立圖示。';
    stepList.append(pendingStep, installStep, reopenStep);
    const saveLinkButton = document.createElement('button');
    saveLinkButton.type = 'button';
    saveLinkButton.dataset.quickIconReinstallLink = 'true';
    saveLinkButton.textContent = '保留安裝連結';
    const installUrlLabel = document.createElement('small');
    installUrlLabel.textContent = installUrl;
    linkNoticeElement.setAttribute('role', 'status');
    linkNoticeElement.hidden = true;
    reinstallPanel.append(document.createTextNode('可保留舊圖示繼續使用。若要換圖，請自行完成：'), stepList, saveLinkButton, installUrlLabel, linkNoticeElement);
    dialogContent.append(reinstallToggle, reinstallPanel);
  } else if (mainProductionOrigin) {
    const destinationLink = document.createElement('a');
    destinationLink.className = 'quick-task-install-destination';
    destinationLink.href = installUrl;
    destinationLink.textContent = '開啟 ProJED-快速建任務安裝頁';
    dialogContent.append(destinationLink);
  }

  const showInstallNotice = (notice: string, title: string) => {
    if (!active || suspended) return;
    dialogTitle.textContent = title;
    dialogMessage.textContent = notice;
    if (!installNoticeDialog.open) installNoticeDialog.showModal();
    dialogCloseButton.focus();
  };

  const renderCheckRow = () => {
    if (!active || suspended || !menu.open) return;
    const operation = { pending: checkPending, result: checkResult };
    const presentation = updateState ? getPwaCheckPresentation(updateState, operation) : null;
    const checkDisabled = Boolean(presentation?.checkDisabled || checkPending || reloadPending || updateState?.localUpdateBusy);
    checkButton.disabled = checkDisabled;
    checkButton.textContent = checkPending ? '檢查中' : '檢查更新';

    const statusMessage = presentation?.statusMessage
      ?? (reloadPending ? '正在更新'
        : checkResult?.phase === 'error'
          ? checkErrorMessages[checkResult.errorCode ?? 'CHECK_FAILED']
          : checkResult?.phase === 'busy' ? '正在更新' : null);
    checkStatus.textContent = statusMessage ?? '';
    checkStatus.hidden = !statusMessage;

    reloadButton.hidden = !presentation?.showReload;
    reloadButton.disabled = checkDisabled;
  };

  const syncUpdateState = (state: PwaUpdateState) => {
    if (!active) return;
    updateState = state;
    if (isSuccessfulCheck(checkResult)) {
      const presentation = getPwaCheckPresentation(state, { pending: checkPending, result: checkResult });
      if (presentation.clearResult) checkResult = null;
    }
    renderCheckRow();
  };

  const readUpdateState = (api: QuickPwaUpdateApi) => {
    try {
      syncUpdateState(api.getPwaUpdateState());
    } catch {
      // A stale optional API read leaves the existing menu snapshot intact.
    }
  };

  const bindUpdateSubscription = (api: QuickPwaUpdateApi) => {
    if (!active || updateSubscriptionAttempted) return;
    updateSubscriptionAttempted = true;
    try {
      unsubscribeUpdateState = api.subscribePwaUpdateState(syncUpdateState);
    } catch {
      // The check action remains available even if an optional state subscription is unavailable.
    }
    readUpdateState(api);
  };

  const getUpdateApi = () => {
    if (updateApi) {
      bindUpdateSubscription(updateApi);
      return Promise.resolve(updateApi);
    }
    if (updateApiPromise) return updateApiPromise;
    if (!options?.getPwaApi) return Promise.reject(new Error('Quick PWA API provider is unavailable'));

    const loading = Promise.resolve().then(() => options.getPwaApi!());
    const cachedPromise = loading.then(api => {
      updateApi = api;
      if (active) bindUpdateSubscription(api);
      return api;
    }, error => {
      updateApiPromise = null;
      throw error;
    });
    updateApiPromise = cachedPromise;
    return cachedPromise;
  };

  const clearCheckDeadline = () => {
    if (checkDeadlineTimer === null) return;
    window.clearTimeout(checkDeadlineTimer);
    checkDeadlineTimer = null;
  };

  const clearCheckRound = () => {
    checkSequence += 1;
    pendingCheckSequence = null;
    checkPending = false;
    checkResult = null;
    clearCheckDeadline();
  };

  const closeMenu = () => {
    if (!menu.open) return;
    clearCheckRound();
    menu.open = false;
  };

  const createTimeoutResult = (startedAt: number) => makeCheckResult('CHECK_TIMEOUT', startedAt);
  const isCurrentCheck = (sequence: number) => (
    active && !suspended && menu.open && checkPending && pendingCheckSequence === sequence
  );

  const finishCheck = (sequence: number, result: PwaUpdateCheckState, api?: QuickPwaUpdateApi) => {
    if (!isCurrentCheck(sequence)) return;
    clearCheckDeadline();
    checkPending = false;
    pendingCheckSequence = null;
    if (api) readUpdateState(api);
    checkResult = result;

    let presentation = updateState ? getPwaCheckPresentation(updateState, { pending: false, result }) : null;
    if (presentation?.clearResult) {
      checkResult = null;
      presentation = updateState ? getPwaCheckPresentation(updateState, { pending: false, result: null }) : null;
    }
    renderCheckRow();

    if (presentation?.handoffToPrompt && active && !suspended && menu.open) {
      const focusPrompt = () => {
        if (!active || suspended || !menu.open || checkResult !== result) return;
        const currentPresentation = updateState
          ? getPwaCheckPresentation(updateState, { pending: checkPending, result: checkResult })
          : null;
        if (!currentPresentation?.handoffToPrompt) return;
        const promptAction = document.querySelector<HTMLElement>('.quick-task-pwa-update [data-pwa-update-action]');
        if (!promptAction) return;
        closeMenu();
        promptAction.focus();
      };
      if (document.querySelector('.quick-task-pwa-update [data-pwa-update-action]')) focusPrompt();
      else window.requestAnimationFrame(focusPrompt);
    }
  };

  const startCheck = async () => {
    if (!active || suspended || !menu.open || checkPending || reloadPending || updateState?.localUpdateBusy) return;
    const startedAt = Date.now();
    const deadlineAt = startedAt + CHECK_UI_DEADLINE_MS;
    const sequence = ++checkSequence;
    pendingCheckSequence = sequence;
    checkPending = true;
    checkResult = null;
    clearCheckDeadline();
    checkDeadlineTimer = window.setTimeout(() => {
      finishCheck(sequence, createTimeoutResult(startedAt));
    }, Math.max(0, deadlineAt - Date.now()));
    renderCheckRow();

    let readinessPending = true;
    try {
      const api = await getUpdateApi();
      readinessPending = false;
      if (!isCurrentCheck(sequence)) return;
      if (Date.now() >= deadlineAt) {
        finishCheck(sequence, createTimeoutResult(startedAt), api);
        return;
      }
      const result = await api.checkPwaUpdate({ deadlineAt });
      if (Date.now() >= deadlineAt) {
        finishCheck(sequence, createTimeoutResult(startedAt), api);
        return;
      }
      finishCheck(sequence, result, api);
    } catch {
      if (Date.now() >= deadlineAt) {
        finishCheck(sequence, createTimeoutResult(startedAt));
      } else {
        finishCheck(sequence, makeCheckResult(readinessPending ? 'CHECK_UNAVAILABLE' : 'CHECK_FAILED', startedAt), updateApi ?? undefined);
      }
    }
  };

  const applyCheckedUpdate = async () => {
    if (!active || suspended || !menu.open || reloadPending || updateState?.localUpdateBusy || !updateApi) return;
    const presentation = updateState
      ? getPwaCheckPresentation(updateState, { pending: checkPending, result: checkResult })
      : null;
    if (!presentation?.showReload) return;
    reloadPending = true;
    renderCheckRow();
    try {
      await updateApi.applyPwaUpdate();
    } catch {
      // The shared service state owns update failures and the recovery prompt.
    } finally {
      reloadPending = false;
      if (active && !suspended) readUpdateState(updateApi);
      renderCheckRow();
    }
  };

  const renderInstallControls = () => {
    if (!active || suspended) return;
    section.hidden = false;
    section.classList.add('quick-task-install-plain');
    installButton.textContent = platform === 'standalone'
      ? '安裝與圖示'
      : deferredPrompt
        ? '安裝 ProJED-快速建任務'
        : platform !== 'browser' || compactViewport.matches
          ? 'APP安裝教學'
          : '安裝APP';
    installButton.disabled = installing;
    installNotice.textContent = installNoticeText;
    installNotice.hidden = !installNoticeText;
  };

  const promptInstall = async () => {
    if (!active || suspended || installing) return;
    if (mainProductionOrigin) {
      showInstallNotice('目前這個網址屬於 ProJED 主程式。若有尚未同步的任務，請先在此完成同步，再開啟快速 App 的安裝頁。', '安裝 ProJED-快速建任務');
      return;
    }
    if (!deferredPrompt || platform === 'standalone') {
      const guidance = getInstallGuidance();
      showInstallNotice(guidance.message, guidance.title);
      return;
    }
    installing = true;
    const operationEpoch = lifecycleEpoch;
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    renderInstallControls();
    try {
      await promptEvent.prompt();
      if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
      const choice = await promptEvent.userChoice;
      if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
      installNoticeText = choice.outcome === 'accepted'
        ? platform === 'browser' ? '已送出安裝；請確認電腦應用程式清單中有獨立圖示。' : '已送出安裝；請確認 Android 應用程式清單中有獨立圖示。'
        : '安裝已取消，仍可直接使用快速輸入。';
      renderInstallControls();
    } catch {
      if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
      const guidance = getInstallGuidance();
      showInstallNotice(guidance.message, guidance.title);
    } finally {
      installing = false;
      if (active && !suspended && lifecycleEpoch === operationEpoch) renderInstallControls();
    }
  };

  const renderReinstallContent = () => {
    if (!active || suspended || !reinstallToggle || !reinstallPanel || !pendingMessage || !linkNoticeElement) return;
    reinstallToggle.setAttribute('aria-expanded', String(showReinstall));
    reinstallPanel.hidden = !showReinstall;
    pendingMessage.textContent = pendingStatus === 'checking'
      ? '正在檢查本機待辦…'
      : pendingStatus === 'unavailable'
        ? '無法檢查本機待辦，請先確認已同步，暫勿直接移除。'
        : pendingCount > 0
          ? `有 ${pendingCount} 筆快速待辦尚未同步，請先完成同步，暫勿直接移除。`
          : '未發現未同步的快速待辦；其他未儲存草稿仍請先保存。';
    linkNoticeElement.textContent = linkNotice;
    linkNoticeElement.hidden = !linkNotice;
  };

  const closeMenuOnOutsidePointer = (event: PointerEvent) => {
    if (!active || suspended) return;
    if (event.target instanceof Node && section.contains(event.target)) return;
    closeMenu();
  };

  const closeMenuOnEscape = (event: KeyboardEvent) => {
    if (!active || suspended || event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || !menu.open) return;
    event.preventDefault();
    closeMenu();
    summary.focus();
  };

  const onSummaryClick = () => {
    if (active && !suspended && menu.open) clearCheckRound();
  };

  const onMenuToggle = () => {
    if (!active || suspended) return;
    if (!menu.open) {
      clearCheckRound();
      return;
    }
    if (updateApi) readUpdateState(updateApi);
    renderCheckRow();
  };

  const onBeforeInstallPrompt = (event: Event) => {
    if (!active) return;
    event.preventDefault();
    if (suspended) return;
    deferredPrompt = event as BeforeInstallPromptEventLike;
    renderInstallControls();
  };

  const onAppInstalled = () => {
    if (!active || suspended) return;
    deferredPrompt = null;
    installNoticeText = platform === 'browser'
      ? 'Chrome 已完成安裝程序；請確認電腦應用程式清單中有獨立圖示。'
      : 'Chrome 已完成安裝程序；請確認 Android 應用程式清單中有獨立圖示。';
    renderInstallControls();
  };

  const onCompactViewportChange = () => {
    renderInstallControls();
    renderReinstallContent();
    renderCheckRow();
  };

  const refreshPendingCount = () => {
    if (!active || suspended || !showReinstall) return;
    const sequence = ++reinstallRequestSequence;
    pendingStatus = 'checking';
    renderReinstallContent();
    void countAllPendingQuickCaptures().then(count => {
      if (!active || suspended || !showReinstall || sequence !== reinstallRequestSequence) return;
      pendingCount = count;
      pendingStatus = 'ready';
      renderReinstallContent();
    }).catch(() => {
      if (!active || suspended || !showReinstall || sequence !== reinstallRequestSequence) return;
      pendingStatus = 'unavailable';
      renderReinstallContent();
    });
  };

  const onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) {
      suspended = true;
      lifecycleEpoch += 1;
      reinstallRequestSequence += 1;
      if (checkPending) {
        checkSequence += 1;
        pendingCheckSequence = null;
        checkPending = false;
        clearCheckDeadline();
      }
      reloadPending = false;
      installing = false;
      return;
    }
    cleanup();
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || !active) return;
    suspended = false;
    reloadPending = false;
    if (updateApi) readUpdateState(updateApi);
    renderCheckRow();
    renderInstallControls();
    if (showReinstall) refreshPendingCount();
  };

  const onReinstallToggle = () => {
    if (!active || suspended) return;
    showReinstall = !showReinstall;
    renderReinstallContent();
    if (!showReinstall) {
      reinstallRequestSequence += 1;
      return;
    }
    refreshPendingCount();
  };

  const onSaveInstallLink = () => {
    if (!active || suspended) return;
    const operationEpoch = lifecycleEpoch;
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: '安裝 ProJED-快速建任務', url: installUrl });
          if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
          linkNotice = '已開啟分享選單；請將連結存到卸載後可開啟的位置。';
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(installUrl);
          if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
          linkNotice = '連結已複製，請先存到記事或訊息。';
        } else {
          linkNotice = '無法自動保存，請先記下上方網址。';
        }
      } catch (error) {
        if (!active || suspended || lifecycleEpoch !== operationEpoch) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        linkNotice = '未保存連結，可改用上方網址。';
      }
      if (active && !suspended) renderReinstallContent();
    })();
  };

  const onCheckClick = () => { void startCheck(); };
  const onReloadClick = () => { void applyCheckedUpdate(); };
  const onInstallClick = () => {
    if (!active || suspended) return;
    closeMenu();
    void promptInstall();
  };

  function cleanup() {
    if (!active) return;
    active = false;
    suspended = false;
    lifecycleEpoch += 1;
    checkSequence += 1;
    pendingCheckSequence = null;
    checkPending = false;
    clearCheckDeadline();
    reinstallRequestSequence += 1;
    unsubscribeUpdateState?.();
    unsubscribeUpdateState = null;
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('pointerdown', closeMenuOnOutsidePointer);
    document.removeEventListener('keydown', closeMenuOnEscape);
    compactViewport.removeEventListener('change', onCompactViewportChange);
    menu.removeEventListener('toggle', onMenuToggle);
    summary.removeEventListener('click', onSummaryClick);
    checkButton.removeEventListener('click', onCheckClick);
    reloadButton.removeEventListener('click', onReloadClick);
    installButton.removeEventListener('click', onInstallClick);
    reinstallToggle?.removeEventListener('click', onReinstallToggle);
    dialogContent.querySelector<HTMLButtonElement>('[data-quick-icon-reinstall-link]')?.removeEventListener('click', onSaveInstallLink);
    if (installNoticeDialog.open) installNoticeDialog.close();
    installNoticeDialog.remove();
    section.replaceChildren();
    section.hidden = originallyHidden;
    section.classList.toggle('quick-task-install-plain', originallyPlain);
    if (originalParent && section.parentNode !== originalParent) {
      if (originalNextSibling?.parentNode === originalParent) originalParent.insertBefore(section, originalNextSibling);
      else originalParent.append(section);
    }
  }

  checkButton.addEventListener('click', onCheckClick);
  reloadButton.addEventListener('click', onReloadClick);
  installButton.addEventListener('click', onInstallClick);
  summary.addEventListener('click', onSummaryClick);
  menu.addEventListener('toggle', onMenuToggle);
  if (reinstallToggle) reinstallToggle.addEventListener('click', onReinstallToggle);
  dialogContent.querySelector<HTMLButtonElement>('[data-quick-icon-reinstall-link]')?.addEventListener('click', onSaveInstallLink);
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('pointerdown', closeMenuOnOutsidePointer);
  document.addEventListener('keydown', closeMenuOnEscape);
  compactViewport.addEventListener('change', onCompactViewportChange);
  renderInstallControls();
  renderReinstallContent();
  return cleanup;
};
