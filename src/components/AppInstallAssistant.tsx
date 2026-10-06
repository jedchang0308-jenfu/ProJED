import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  MonitorDown,
  MoreHorizontal,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import {
  dismissPwaInstallPrompt,
  getPwaInstallContext,
  promptPwaInstall,
  setupPwaInstallPromptListener,
  snoozePwaInstallPrompt,
  subscribePwaInstallContext,
  type PwaInstallContext,
} from '../services/pwaInstallService';
import { toast } from '../store/useToastStore';
import useAuthStore from '../store/useAuthStore';
import { getQuickInstallUrl } from '../features/quickTaskCapture/origins';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

type AppInstallAssistantProps = {
  mode?: 'auto' | 'settings';
};

const getExternalOpenUrl = () => {
  const currentUrl = new URL(window.location.href);
  const isAndroid = /Android/i.test(navigator.userAgent || '');

  if (isAndroid) {
    return `intent://${currentUrl.host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}#Intent;scheme=${currentUrl.protocol.replace(':', '')};package=com.android.chrome;end`;
  }

  const chromeScheme = currentUrl.protocol === 'https:' ? 'googlechromes' : 'googlechrome';
  return `${chromeScheme}://${currentUrl.host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
};

const getGuidance = (context: PwaInstallContext) => {
  switch (context.platform) {
    case 'standalone':
      return {
        icon: CheckCircle2,
        badge: '已完成',
        title: '已從桌面開啟',
        description: '之後直接點 ProJED 圖示，就能更快回到工作入口。',
      };
    case 'embedded':
      return {
        icon: ExternalLink,
        badge: '先換瀏覽器',
        title: '請先用 Safari 或 Chrome 開啟',
        description: '目前在內建瀏覽器，無法完成登入與加入桌面。',
      };
    case 'ios-safari':
      return {
        icon: Share2,
        badge: 'iPhone / iPad',
        title: '加入 iPhone 主畫面',
        description: '點分享，選「加入主畫面」，再點「新增」。',
      };
    case 'android-installable':
      return {
        icon: Smartphone,
        badge: 'Android',
        title: '加入手機桌面',
        description: '之後可直接點 ProJED 圖示快速記事。',
      };
    case 'android-browser':
      return {
        icon: Smartphone,
        badge: 'Android',
        title: '從 Chrome 安裝',
        description: '點 Chrome 的 ⋮，選「安裝應用程式」或「安裝並建立捷徑」。',
      };
    case 'desktop-installable':
      return {
        icon: MonitorDown,
        badge: '電腦',
        title: '安裝到電腦',
        description: '之後可從桌面或開始選單直接開啟 ProJED。',
      };
    case 'desktop-browser':
      return {
        icon: MonitorDown,
        badge: '電腦',
        title: '可固定到瀏覽器或桌面',
        description: '若網址列出現安裝圖示，可點擊後安裝 ProJED。',
      };
    default:
      return {
        icon: Smartphone,
        badge: '目前不支援',
        title: '目前瀏覽器不支援加入桌面',
        description: '請改用 Safari、Chrome 或 Edge 開啟。',
      };
  }
};

const IosSteps = () => (
  <ol className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
    <li className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <Share2 size={15} className="text-primary" />
      點分享
    </li>
    <li className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <MoreHorizontal size={15} className="text-primary" />
      選加入主畫面
    </li>
    <li className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <CheckCircle2 size={15} className="text-primary" />
      點新增
    </li>
  </ol>
);

const AndroidChromeSteps: React.FC<{ target: string }> = ({ target }) => (
  <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
    <li>用手機 Chrome 開啟 {target}，點右上角「⋮」。</li>
    <li>選「安裝應用程式」，再點「安裝」。</li>
  </ol>
);

const installMainApp = async () => {
  const choice = await promptPwaInstall();
  if (!choice) {
    toast.info('請依畫面上的步驟加入主畫面。');
    return;
  }
  if (choice.outcome === 'accepted') toast.success('已開始安裝 ProJED。');
  else toast.info('已暫時略過，之後可在設定中查看。');
};

const AppInstallContent: React.FC<{
  context: PwaInstallContext;
  compact?: boolean;
  onClose?: () => void;
}> = ({ context, compact = false, onClose }) => {
  const guidance = useMemo(() => getGuidance(context), [context]);
  const Icon = guidance.icon;

  const handleSnooze = () => {
    snoozePwaInstallPrompt();
    onClose?.();
  };

  const handleDismiss = () => {
    dismissPwaInstallPrompt();
    onClose?.();
  };

  const isInstalled = context.platform === 'standalone';
  const isEmbedded = context.platform === 'embedded';
  const isIos = context.platform === 'ios-safari';
  const canPrompt = context.canPromptInstall;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{guidance.title}</h3>
            <Badge variant={isInstalled ? 'success' : isEmbedded ? 'warning' : 'info'}>{guidance.badge}</Badge>
          </div>
          <p className="text-sm leading-6 text-slate-600">{guidance.description}</p>
        </div>
      </div>

      {isIos && <IosSteps />}

      <div className={`flex gap-2 ${compact ? 'flex-col sm:flex-row' : 'flex-wrap'}`}>
        {canPrompt && (
          <Button type="button" onClick={() => { void installMainApp(); }} className="gap-2">
            <Smartphone size={16} />
            加入主畫面
          </Button>
        )}

        {isEmbedded && (
          <a
            href={getExternalOpenUrl()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(99,102,241,0.22)] transition-colors hover:bg-primary/90"
          >
            <ExternalLink size={16} />
            用 Safari 或 Chrome 開啟
          </a>
        )}

        {isInstalled ? null : (
          <>
            {onClose && (
              <Button type="button" variant="secondary" onClick={handleSnooze}>
                稍後
              </Button>
            )}
            {onClose && (
              <Button type="button" variant="ghost" onClick={handleDismiss}>
                不再提示
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const AppInstallAssistant: React.FC<AppInstallAssistantProps> = ({ mode = 'auto' }) => {
  const user = useAuthStore((state) => state.user);
  const isAndroidDevice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  const [context, setContext] = useState<PwaInstallContext>(() => getPwaInstallContext());
  const [isVisible, setIsVisible] = useState(false);
  const [selectedApp, setSelectedApp] = useState<'main' | 'quick' | null>(null);
  const [showManualMainInstall, setShowManualMainInstall] = useState(false);

  useEffect(() => {
    setupPwaInstallPromptListener();
    const updateContext = () => setContext(getPwaInstallContext());
    updateContext();
    return subscribePwaInstallContext(updateContext);
  }, []);

  useEffect(() => {
    if (mode !== 'auto') return;
    setIsVisible(Boolean(user && context.shouldAutoShow));
  }, [context.shouldAutoShow, mode, user]);

  if (mode === 'settings') {
    return (
      <section data-pwa-install-settings data-pwa-install-scope="device-account">
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="選擇要安裝的 App">
          {([
            { id: 'main' as const, name: 'ProJED 主程式', description: '完整任務工作台', icon: '/icons/projed-main-icon-brand-20260929-192.png' },
            { id: 'quick' as const, name: 'ProJED-快速建任務', description: '立即記下待辦', icon: '/icons/projed-quick-task-icon-brand-20260929-192.png' },
          ]).map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => {
                setSelectedApp(app.id);
                setShowManualMainInstall(false);
              }}
              aria-pressed={selectedApp === app.id}
              data-app-install-choice={app.id}
              data-quick-task-install-cta={app.id === 'quick' ? 'true' : undefined}
              className={`flex min-h-24 w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                selectedApp === app.id
                  ? 'border-primary bg-primary/5 text-slate-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-800 hover:border-primary/50 hover:bg-slate-50'
              }`}
            >
              <img src={app.icon} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{app.name}</span>
                <span className="mt-1 block text-sm text-slate-500">{app.description}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          ))}
        </div>

        {selectedApp === 'main' && (
          <div className="mt-4 border-t border-slate-200 pt-4" data-app-install-detail="main">
            {context.platform === 'ios-safari' ? (
              <IosSteps />
            ) : context.platform === 'embedded' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">請用 Chrome 或 Safari 開啟此頁，再安裝 App。</p>
                <a href={getExternalOpenUrl()} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">嘗試在瀏覽器開啟</a>
              </div>
            ) : context.platform === 'android-browser' || context.platform === 'android-installable' ? (
              <div className="space-y-3">
                <AndroidChromeSteps target="ProJED 頁面" />
                {context.canPromptInstall && (
                  <Button type="button" onClick={() => { void installMainApp(); }}>直接安裝 ProJED</Button>
                )}
              </div>
            ) : context.platform === 'desktop-installable' || context.platform === 'desktop-browser' ? (
              <div className="space-y-2">
                <Button
                  type="button"
                  data-main-install-action="true"
                  onClick={() => {
                    if (context.canPromptInstall) {
                      setShowManualMainInstall(false);
                      void installMainApp();
                    } else setShowManualMainInstall(true);
                  }}
                >
                  安裝 ProJED 主程式
                </Button>
                {showManualMainInstall && !context.canPromptInstall && (
                  <p className="text-sm leading-6 text-slate-600" role="status">
                    目前瀏覽器無法直接開啟安裝視窗。請用 Chrome 或 Edge 開啟此頁，點網址列的安裝圖示。
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                {context.platform === 'standalone' && '目前已從 ProJED App 開啟。'}
                {context.platform === 'unsupported' && '請用 Safari、Chrome 或 Edge 開啟此頁。'}
              </p>
            )}
          </div>
        )}

        {selectedApp === 'quick' && (
          <div className="mt-4 border-t border-slate-200 pt-4" data-app-install-detail="quick">
            <a
              href={getQuickInstallUrl(window.location.origin)}
              data-quick-task-install-link="true"
              className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              開啟 ProJED-快速建任務安裝頁
            </a>
            {!isAndroidDevice && <p className="mt-2 text-sm leading-6 text-slate-600">ProJED-快速建任務使用獨立安裝頁；開啟後點「安裝 ProJED-快速建任務」。</p>}
            {isAndroidDevice && <div className="mt-3"><AndroidChromeSteps target="ProJED-快速建任務安裝頁" /></div>}
            <p className="mt-2 text-sm leading-6 text-slate-600">首次開啟獨立入口時，請用與主程式相同的 Google 帳號登入。若舊入口仍有待同步待辦，請先完成同步。</p>
          </div>
        )}
      </section>
    );
  }

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] px-3 pb-3 sm:px-5 sm:pb-5" data-pwa-install-assistant>
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/20">
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="float-right rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="關閉加入主畫面提示"
        >
          <X size={16} />
        </button>
        <AppInstallContent context={context} compact onClose={() => setIsVisible(false)} />
      </div>
    </div>
  );
};
