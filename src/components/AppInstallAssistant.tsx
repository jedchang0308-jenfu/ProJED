import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
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
  resetPwaInstallPreference,
  setupPwaInstallPromptListener,
  snoozePwaInstallPrompt,
  subscribePwaInstallContext,
  type PwaInstallContext,
} from '../services/pwaInstallService';
import { toast } from '../store/useToastStore';
import useAuthStore from '../store/useAuthStore';
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

const AppInstallContent: React.FC<{
  context: PwaInstallContext;
  compact?: boolean;
  onClose?: () => void;
}> = ({ context, compact = false, onClose }) => {
  const guidance = useMemo(() => getGuidance(context), [context]);
  const Icon = guidance.icon;

  const handleInstall = async () => {
    const choice = await promptPwaInstall();
    if (!choice) {
      toast.info('請依畫面上的步驟加入主畫面。');
      return;
    }
    if (choice.outcome === 'accepted') toast.success('已開始安裝 ProJED。');
    else toast.info('已暫時略過，之後可在設定中查看。');
  };

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
          <Button type="button" onClick={handleInstall} className="gap-2">
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
  const [context, setContext] = useState<PwaInstallContext>(() => getPwaInstallContext());
  const [isVisible, setIsVisible] = useState(false);

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
      <section className="border border-slate-200 bg-white" data-pwa-install-settings>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Smartphone size={16} className="text-primary" />
            App 安裝與快速開啟
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs" data-pwa-install-scope="device-account">
            <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
              設定範圍：此裝置 / 目前帳號
            </span>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
          <AppInstallContent context={context} />
          <div className="border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">提示狀態</div>
            <div className="mt-2 text-sm font-semibold text-slate-800">
              {context.status.installed ? '已完成' : context.status.dismissed ? '不再自動提示' : '可提示'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              若曾選擇稍後或不再提示，可在這裡重新開啟教學。
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => {
                resetPwaInstallPreference();
                toast.success('已重設加入主畫面提示。');
              }}
            >
              重新顯示提示
            </Button>
          </div>
        </div>
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
