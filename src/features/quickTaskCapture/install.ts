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
  if (!section || params.get('install') !== '1') return () => undefined;

  let deferredPrompt: BeforeInstallPromptEventLike | null = null;
  let installing = false;
  const platform = detectPlatform();
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
          : '<strong>安裝「ProJED快速建待辦」</strong><span>安裝後從手機桌面圖示開啟，就能直接輸入名稱，不必等待完整工作台。</span>';
    section.innerHTML = `${body}${action}${notice ? `<small role="status">${escapeHtml(notice)}</small>` : ''}`;
    section.querySelector<HTMLButtonElement>('[data-quick-install-action]')?.addEventListener('click', () => { void promptInstall(); });
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
