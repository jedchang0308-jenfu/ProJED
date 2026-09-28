import { countAllPendingQuickCaptures } from './outbox';

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

  let deferredPrompt: BeforeInstallPromptEventLike | null = null;
  let installing = false;
  let showReinstall = false;
  let pendingStatus: 'checking' | 'ready' | 'unavailable' = 'checking';
  let pendingCount = 0;
  let linkNotice = '';
  const platform = detectPlatform();
  const canReinstall = platform === 'standalone' && /Android/iu.test(navigator.userAgent || '');
  const installUrl = new URL('/quick-task/?install=1', window.location.origin).toString();
  const render = (notice = '') => {
    section.hidden = false;
    const action = deferredPrompt
      ? '<button type="button" data-quick-install-action="true">安裝快速建待辦</button>'
      : '';
    const body = platform === 'standalone'
      ? '<strong>已在獨立 App 模式</strong><span>這個入口已可直接使用；下方名稱欄可立即記錄。</span>'
      : platform === 'ios'
        ? '<strong>加入手機主畫面</strong><span>點 Safari 的分享，選「加入主畫面」，就會建立「ProJED快速建待辦」圖示。</span>'
        : platform === 'embedded'
          ? '<strong>請先開啟系統瀏覽器</strong><span>在內嵌瀏覽器中無法可靠建立 App，請用 Safari 或 Chrome 開啟本頁後再安裝。</span>'
          : platform === 'android'
            ? '<strong>安裝「ProJED快速建待辦」</strong><span>若下方沒有安裝按鈕，請在 Chrome 點 ⋮，選「安裝應用程式」或「安裝並建立捷徑」。</span>'
            : '<strong>安裝「ProJED快速建待辦」</strong><span>安裝後從手機桌面圖示開啟，就能直接輸入名稱，不必等待完整工作台。</span>';
    const pendingMessage = pendingStatus === 'checking'
      ? '正在檢查本機待辦…'
      : pendingStatus === 'unavailable'
        ? '無法檢查本機待辦，請先確認已同步，暫勿直接移除。'
        : pendingCount > 0
          ? `有 ${pendingCount} 筆快速待辦尚未同步，請先完成同步，暫勿移除。`
          : '未發現未同步的快速待辦；其他未儲存草稿仍請先保存。';
    const reinstall = canReinstall
      ? `<button type="button" data-quick-icon-reinstall-toggle="true" aria-expanded="${showReinstall}">自行更新此圖示（選用）</button>${showReinstall
        ? `<div class="quick-icon-reinstall" data-quick-icon-reinstall="true"><span>可保留舊圖示繼續使用。若要換圖，請自行完成：</span><ol><li>${escapeHtml(pendingMessage)}</li><li>先保留安裝連結，再到 Android「設定 → 應用程式」解除安裝「ProJED快速建待辦」。</li><li>從保留的連結以 Chrome 開啟，選「安裝應用程式」或「安裝並建立捷徑」，用原帳號登入。</li></ol><button type="button" data-quick-icon-reinstall-link="true">保留安裝連結</button><small>${escapeHtml(installUrl)}</small>${linkNotice ? `<small role="status">${escapeHtml(linkNotice)}</small>` : ''}</div>`
        : ''}`
      : '';
    section.innerHTML = `${body}${action}${reinstall}${notice ? `<small role="status">${escapeHtml(notice)}</small>` : ''}`;
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
            await navigator.share({ title: '安裝 ProJED 快速建待辦', url: installUrl });
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
    if (!deferredPrompt || installing) return;
    installing = true;
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      render(choice.outcome === 'accepted' ? '已送出安裝；完成後可從桌面圖示開啟。' : '安裝已取消，仍可直接使用快速輸入。');
    } catch {
      render('目前無法叫出安裝提示，請改用瀏覽器選單加入主畫面。');
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
    render('已完成安裝；下次請從桌面圖示開啟。');
  };
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
  render();
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  };
};
