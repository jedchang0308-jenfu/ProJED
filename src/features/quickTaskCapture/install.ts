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

const escapeHtml = (value: string) => value.replace(/[&<>"']/gu, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

export const installQuickInstallGuide = (container: HTMLElement) => {
  const params = new URLSearchParams(window.location.search);
  const section = container.querySelector<HTMLElement>('#quick-task-install');
  if (!section) return () => undefined;
  if (params.get('install') !== '1') {
    if (detectPlatform() !== 'standalone' || !/Android/iu.test(navigator.userAgent || '')) return () => undefined;
    const link = document.createElement('a');
    link.href = '/quick-task/?install=1';
    link.className = 'quick-task-install-link';
    link.textContent = '安裝與圖示';
    link.dataset.quickInstallLink = 'true';
    container.append(link);
    return () => link.remove();
  }

  if (isMainProductionOrigin(window.location.origin)) {
    section.hidden = false;
    section.innerHTML = '<strong>安裝 ProJED-快速建任務</strong><span>目前這個網址屬於 ProJED 主程式。若有尚未同步的待辦，請先在此完成同步；主程式內的快速記錄仍可照常使用。</span><a class="quick-task-install-destination" href="https://projed-cc78d.firebaseapp.com/quick-task/?install=1">開啟 ProJED-快速建任務安裝頁</a>';
    return () => undefined;
  }

  let deferredPrompt: BeforeInstallPromptEventLike | null = null;
  let installing = false;
  let showReinstall = false;
  let pendingStatus: 'checking' | 'ready' | 'unavailable' = 'checking';
  let pendingCount = 0;
  let linkNotice = '';
  const platform = detectPlatform();
  if (platform === 'browser') {
    container.querySelector<HTMLElement>('.quick-task-header-actions')?.append(section);
  }
  const installNoticeDialog = document.createElement('dialog');
  installNoticeDialog.className = 'quick-task-install-dialog';
  installNoticeDialog.setAttribute('aria-labelledby', 'quick-task-install-dialog-title');
  installNoticeDialog.setAttribute('aria-describedby', 'quick-task-install-dialog-description');
  installNoticeDialog.innerHTML = '<h2 id="quick-task-install-dialog-title">安裝提示</h2><p id="quick-task-install-dialog-description" data-quick-install-dialog-message></p><form method="dialog"><button type="submit">關閉</button></form>';
  document.body.append(installNoticeDialog);
  const dialogTitle = installNoticeDialog.querySelector<HTMLElement>('#quick-task-install-dialog-title');
  const compactViewport = window.matchMedia('(max-width: 559px)');
  const getInstallGuidance = () => {
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
  const showInstallNotice = (notice: string, title: string) => {
    const message = installNoticeDialog.querySelector<HTMLElement>('[data-quick-install-dialog-message]');
    if (!message || !dialogTitle) return;
    dialogTitle.textContent = title;
    message.textContent = notice;
    if (!installNoticeDialog.open) installNoticeDialog.showModal();
    installNoticeDialog.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const canReinstall = platform === 'standalone' && /Android/iu.test(navigator.userAgent || '');
  const installUrl = new URL(getQuickInstallUrl(window.location.origin), window.location.origin).toString();
  const render = (notice = '') => {
    section.hidden = false;
    section.classList.toggle('quick-task-install-plain', platform === 'browser');
    const installMenuOpen = section.querySelector<HTMLDetailsElement>('[data-quick-install-menu]')?.open ?? false;
    const actionLabel = deferredPrompt
      ? '安裝 ProJED-快速建任務'
      : platform === 'browser' && compactViewport.matches
        ? 'APP安裝教學'
        : platform === 'browser'
          ? '安裝APP'
          : '';
    const action = actionLabel
      ? `<button type="button" data-quick-install-action="true">${actionLabel}</button>`
      : '';
    const body = platform === 'standalone'
      ? '<strong>目前以 App 視窗開啟</strong><span>可立即記錄待辦；是否已建立獨立手機圖示，請以 Android 應用程式清單為準。</span>'
      : platform === 'ios'
        ? '<strong>加入手機主畫面</strong><span>點 Safari 的分享，選「加入主畫面」，就會建立「ProJED-快速建任務」圖示。</span>'
        : platform === 'embedded'
          ? '<strong>請先開啟系統瀏覽器</strong><span>在內嵌瀏覽器中無法可靠建立 App，請用 Safari 或 Chrome 開啟本頁後再安裝。</span>'
        : platform === 'android'
            ? '<strong>從 Chrome 安裝 ProJED-快速建任務</strong><ol class="quick-install-steps"><li>用手機 Chrome 開啟此頁，點右上角「⋮」。</li><li>選「安裝應用程式」，再點「安裝」。</li></ol>'
            : '';
    const pendingMessage = pendingStatus === 'checking'
      ? '正在檢查本機待辦…'
      : pendingStatus === 'unavailable'
        ? '無法檢查本機待辦，請先確認已同步，暫勿直接移除。'
        : pendingCount > 0
          ? `有 ${pendingCount} 筆快速待辦尚未同步，請先完成同步，暫勿移除。`
          : '未發現未同步的快速待辦；其他未儲存草稿仍請先保存。';
    const reinstall = canReinstall
      ? `<button type="button" data-quick-icon-reinstall-toggle="true" aria-expanded="${showReinstall}">自行更新此圖示（選用）</button>${showReinstall
        ? `<div class="quick-icon-reinstall" data-quick-icon-reinstall="true"><span>可保留舊圖示繼續使用。若要換圖，請自行完成：</span><ol><li>${escapeHtml(pendingMessage)}</li><li>先保留安裝連結；只有在 Android「設定 → 應用程式」找得到「ProJED-快速建任務」時，才解除安裝該 App。</li><li>從保留的連結以 Chrome 開啟，選「安裝應用程式」，用原帳號登入；完成後確認應用程式清單有獨立圖示。</li></ol><button type="button" data-quick-icon-reinstall-link="true">保留安裝連結</button><small>${escapeHtml(installUrl)}</small>${linkNotice ? `<small role="status">${escapeHtml(linkNotice)}</small>` : ''}</div>`
        : ''}`
      : '';
    const noticeMarkup = notice ? `<small role="status">${escapeHtml(notice)}</small>` : '';
    section.innerHTML = platform === 'browser'
      ? `<details class="quick-task-install-menu" data-quick-install-menu="true"><summary aria-label="更多選項" title="更多選項">⋮</summary><div class="quick-task-install-menu-panel">${action}${noticeMarkup}</div></details>`
      : `${body}${action}${reinstall}${noticeMarkup}`;
    const installMenu = section.querySelector<HTMLDetailsElement>('[data-quick-install-menu]');
    if (installMenu) installMenu.open = installMenuOpen;
    section.querySelector<HTMLButtonElement>('[data-quick-install-action]')?.addEventListener('click', () => { void promptInstall(); });
    section.querySelector<HTMLButtonElement>('[data-quick-icon-reinstall-toggle]')?.addEventListener('click', () => {
      showReinstall = !showReinstall;
      render();
      if (showReinstall) {
        pendingStatus = 'checking';
        void countAllPendingQuickCaptures().then(count => {
          pendingCount = count;
          pendingStatus = 'ready';
          if (showReinstall) render();
        }).catch(() => {
          pendingStatus = 'unavailable';
          if (showReinstall) render();
        });
      }
    });
    section.querySelector<HTMLButtonElement>('[data-quick-icon-reinstall-link]')?.addEventListener('click', () => {
      void (async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title: '安裝 ProJED-快速建任務', url: installUrl });
            linkNotice = '已開啟分享選單；請將連結存到卸載後可開啟的位置。';
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(installUrl);
            linkNotice = '連結已複製，請先存到記事或訊息。';
          } else {
            linkNotice = '無法自動保存，請先記下上方網址。';
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          linkNotice = '未保存連結，可改用上方網址。';
        }
        render();
      })();
    });
  };
  const promptInstall = async () => {
    if (installing) return;
    if (!deferredPrompt) {
      const guidance = getInstallGuidance();
      showInstallNotice(guidance.message, guidance.title);
      return;
    }
    installing = true;
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      render(choice.outcome === 'accepted'
        ? platform === 'browser' ? '已送出安裝；請確認電腦應用程式清單中有獨立圖示。' : '已送出安裝；請確認 Android 應用程式清單中有獨立圖示。'
        : '安裝已取消，仍可直接使用快速輸入。');
    } catch {
      const guidance = getInstallGuidance();
      showInstallNotice(guidance.message, guidance.title);
    } finally {
      installing = false;
    }
  };
  const onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEventLike;
    render();
  };
  const onAppInstalled = () => {
    deferredPrompt = null;
    render(platform === 'browser' ? 'Chrome 已完成安裝程序；請確認電腦應用程式清單中有獨立圖示。' : 'Chrome 已完成安裝程序；請確認 Android 應用程式清單中有獨立圖示。');
  };
  const closeInstallMenuOnOutsidePointer = (event: PointerEvent) => {
    if (event.target instanceof Node && section.contains(event.target)) return;
    const menu = section.querySelector<HTMLDetailsElement>('[data-quick-install-menu]');
    if (menu) menu.open = false;
  };
  const closeInstallMenuOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const menu = section.querySelector<HTMLDetailsElement>('[data-quick-install-menu]');
    if (!menu?.open) return;
    menu.open = false;
    menu.querySelector<HTMLElement>('summary')?.focus();
  };
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  if (platform === 'browser') {
    document.addEventListener('pointerdown', closeInstallMenuOnOutsidePointer);
    document.addEventListener('keydown', closeInstallMenuOnEscape);
  }
  const onCompactViewportChange = () => {
    if (platform === 'browser') render();
  };
  compactViewport.addEventListener('change', onCompactViewportChange);
  render();
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
    if (platform === 'browser') {
      document.removeEventListener('pointerdown', closeInstallMenuOnOutsidePointer);
      document.removeEventListener('keydown', closeInstallMenuOnEscape);
    }
    compactViewport.removeEventListener('change', onCompactViewportChange);
    installNoticeDialog.remove();
  };
};
