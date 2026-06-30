type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

export type PwaInstallPlatform =
  | 'standalone'
  | 'embedded'
  | 'ios-safari'
  | 'android-installable'
  | 'desktop-installable'
  | 'desktop-browser'
  | 'unsupported';

export type PwaInstallStatus = {
  installed: boolean;
  dismissed: boolean;
  snoozedUntil: number | null;
  lastPromptedAt: number | null;
};

export type PwaInstallContext = {
  platform: PwaInstallPlatform;
  canPromptInstall: boolean;
  shouldAutoShow: boolean;
  status: PwaInstallStatus;
};

const INSTALL_STATUS_KEY = 'projed.pwaInstall.status';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

let setupDone = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const defaultStatus: PwaInstallStatus = {
  installed: false,
  dismissed: false,
  snoozedUntil: null,
  lastPromptedAt: null,
};

const readStatus = (): PwaInstallStatus => {
  if (typeof window === 'undefined') return defaultStatus;
  try {
    const stored = localStorage.getItem(INSTALL_STATUS_KEY);
    if (!stored) return defaultStatus;
    return { ...defaultStatus, ...JSON.parse(stored) };
  } catch {
    return defaultStatus;
  }
};

const writeStatus = (updates: Partial<PwaInstallStatus>) => {
  if (typeof window === 'undefined') return;
  const nextStatus = { ...readStatus(), ...updates };
  localStorage.setItem(INSTALL_STATUS_KEY, JSON.stringify(nextStatus));
  notifyInstallListeners();
};

const notifyInstallListeners = () => {
  listeners.forEach((listener) => listener());
};

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      nav.standalone
  );
};

const isEmbeddedBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|Threads|TikTok|BytedanceWebview|KAKAOTALK/i.test(
    navigator.userAgent || ''
  );
};

const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isAndroid = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
};

const isSafari = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium|Android/i.test(ua);
};

const isDesktop = () => !isIOS() && !isAndroid();

export const getPwaInstallContext = (): PwaInstallContext => {
  const status = readStatus();
  const now = Date.now();
  const installed = status.installed || isStandaloneDisplay();
  const snoozed = Boolean(status.snoozedUntil && status.snoozedUntil > now);

  let platform: PwaInstallPlatform = 'unsupported';
  if (installed) platform = 'standalone';
  else if (isEmbeddedBrowser()) platform = 'embedded';
  else if (isIOS() && isSafari()) platform = 'ios-safari';
  else if (deferredPrompt && isAndroid()) platform = 'android-installable';
  else if (deferredPrompt && isDesktop()) platform = 'desktop-installable';
  else if (isDesktop()) platform = 'desktop-browser';

  const canPromptInstall = platform === 'android-installable' || platform === 'desktop-installable';
  const shouldAutoShow = !installed && !status.dismissed && !snoozed && (
    platform === 'ios-safari' ||
    platform === 'android-installable' ||
    platform === 'desktop-installable'
  );

  return {
    platform,
    canPromptInstall,
    shouldAutoShow,
    status: { ...status, installed },
  };
};

export const setupPwaInstallPromptListener = () => {
  if (setupDone || typeof window === 'undefined') return;
  setupDone = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyInstallListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    writeStatus({
      installed: true,
      dismissed: false,
      snoozedUntil: null,
      lastPromptedAt: Date.now(),
    });
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', notifyInstallListeners);
};

export const subscribePwaInstallContext = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const promptPwaInstall = async (): Promise<BeforeInstallPromptChoice | null> => {
  if (!deferredPrompt) return null;
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  writeStatus({ lastPromptedAt: Date.now() });
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  if (choice.outcome === 'accepted') {
    writeStatus({ installed: true, dismissed: false, snoozedUntil: null });
  } else {
    writeStatus({ snoozedUntil: Date.now() + SNOOZE_MS });
  }
  return choice;
};

export const snoozePwaInstallPrompt = () => {
  writeStatus({ snoozedUntil: Date.now() + SNOOZE_MS, lastPromptedAt: Date.now() });
};

export const dismissPwaInstallPrompt = () => {
  writeStatus({ dismissed: true, snoozedUntil: null, lastPromptedAt: Date.now() });
};

export const resetPwaInstallPreference = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(INSTALL_STATUS_KEY);
  notifyInstallListeners();
};
