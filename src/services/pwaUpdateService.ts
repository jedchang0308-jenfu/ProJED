import { registerSW } from 'virtual:pwa-register';

export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'applying'
  | 'offline-ready'
  | 'updated'
  | 'recoverable-cache-error'
  | 'failed';

export type PwaUpdateState = {
  status: PwaUpdateStatus;
  updateAvailable: boolean;
  offlineReady: boolean;
  dismissedAt: number | null;
  lastCheckedAt: number | null;
  lastUpdateFoundAt: number | null;
  lastAppliedAt: number | null;
  recoveryAttemptCount: number;
  currentVersion: string | null;
  latestVersion: string | null;
  previousVersion: string | null;
  errorMessage: string | null;
};

type PwaUpdateListener = (state: PwaUpdateState) => void;
type RegisterUpdateCallback = ReturnType<typeof registerSW>;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const APP_SHELL_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_AUTO_RECOVERY_ATTEMPTS = 1;
const APP_VERSION_KEY = 'projed.pwaUpdate.currentBundle';
const RECOVERY_ATTEMPTS_KEY = 'projed.pwaUpdate.recoveryAttempts';
const LATEST_RELOAD_PARAM = 'projed_update_latest';
const STATE_EVENT_NAME = 'projed:pwa-update-state';

const listeners = new Set<PwaUpdateListener>();

let updateSW: RegisterUpdateCallback | null = null;
let queuedUpdate: (() => Promise<void>) | null = null;
let backgroundListenersBound = false;
let appShellCheckListenersBound = false;
let setupDone = false;
let testControlsInstalled = false;

let updateState: PwaUpdateState = {
  status: 'idle',
  updateAvailable: false,
  offlineReady: false,
  dismissedAt: null,
  lastCheckedAt: null,
  lastUpdateFoundAt: null,
  lastAppliedAt: null,
  recoveryAttemptCount: 0,
  currentVersion: null,
  latestVersion: null,
  previousVersion: null,
  errorMessage: null,
};

declare global {
  interface Window {
    __projedPwaUpdateTest?: {
      getState: () => PwaUpdateState;
      simulateUpdateAvailable: () => void;
      simulateUpdated: () => void;
      simulateOfflineReady: () => void;
      simulateRecoverableCacheError: (message?: string) => void;
      reset: () => void;
    };
  }
}

const cloneState = (): PwaUpdateState => ({ ...updateState });

const dispatchStateEvent = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PwaUpdateState>(STATE_EVENT_NAME, { detail: cloneState() }));
};

const notifyUpdateListeners = () => {
  const nextState = cloneState();
  listeners.forEach((listener) => listener(nextState));
  dispatchStateEvent();
};

const setUpdateState = (updates: Partial<PwaUpdateState>) => {
  updateState = { ...updateState, ...updates };
  notifyUpdateListeners();
};

const readRecoveryAttempts = () => {
  if (typeof sessionStorage === 'undefined') return { count: 0, firstAttemptAt: 0 };
  try {
    const stored = sessionStorage.getItem(RECOVERY_ATTEMPTS_KEY);
    if (!stored) return { count: 0, firstAttemptAt: 0 };
    const parsed = JSON.parse(stored) as { count?: number; firstAttemptAt?: number };
    return {
      count: Number(parsed.count) || 0,
      firstAttemptAt: Number(parsed.firstAttemptAt) || 0,
    };
  } catch {
    return { count: 0, firstAttemptAt: 0 };
  }
};

const writeRecoveryAttempts = (count: number, firstAttemptAt: number) => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(RECOVERY_ATTEMPTS_KEY, JSON.stringify({ count, firstAttemptAt }));
};

const resetRecoveryAttempts = () => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(RECOVERY_ATTEMPTS_KEY);
};

const extractBundleVersionFromSrc = (src: string | null | undefined) => {
  const match = src?.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  return match?.[1] ?? null;
};

const getCurrentAppShellVersion = () => {
  if (typeof document === 'undefined') return null;
  const entryScript = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return extractBundleVersionFromSrc(entryScript?.getAttribute('src'));
};

const extractAppShellVersionFromHtml = (html: string) => {
  const match = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[A-Za-z0-9_-]+\.js)["']/);
  return extractBundleVersionFromSrc(match?.[1]);
};

const fetchLatestAppShellVersion = async () => {
  const response = await fetch(`/index.html?projed_update_check=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return extractAppShellVersionFromHtml(await response.text());
};

const buildLatestReloadUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set(LATEST_RELOAD_PARAM, String(Date.now()));
  return `${url.pathname}${url.search}${url.hash}`;
};

const stripLatestReloadParam = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(LATEST_RELOAD_PARAM)) return;

  url.searchParams.delete(LATEST_RELOAD_PARAM);
  window.history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const reloadToLatestAppShell = () => {
  if (typeof window === 'undefined') return;

  if ((import.meta.env.DEV || import.meta.env.MODE === 'test') && window.__projedPwaUpdateTest) {
    setUpdateState({
      status: 'idle',
      updateAvailable: false,
      dismissedAt: null,
      lastAppliedAt: Date.now(),
      errorMessage: null,
    });
    window.dispatchEvent(new CustomEvent('projed:pwa-update-test-latest-reload', { detail: cloneState() }));
    return;
  }

  window.location.assign(buildLatestReloadUrl());
};

const recordLoadedAppVersion = () => {
  if (typeof localStorage === 'undefined') return;

  const currentVersion = getCurrentAppShellVersion();
  if (!currentVersion) return;

  let previousVersion: string | null = null;
  try {
    previousVersion = localStorage.getItem(APP_VERSION_KEY);
    localStorage.setItem(APP_VERSION_KEY, currentVersion);
  } catch {
    previousVersion = null;
  }

  setUpdateState({
    currentVersion,
    latestVersion: currentVersion,
    previousVersion,
  });

  if (previousVersion !== currentVersion && !updateState.updateAvailable) {
    setUpdateState({
      status: 'updated',
      updateAvailable: false,
      dismissedAt: null,
      currentVersion,
      latestVersion: currentVersion,
      previousVersion,
      lastAppliedAt: Date.now(),
      errorMessage: null,
    });
  }
};

const checkForAppShellUpdate = async () => {
  const currentVersion = getCurrentAppShellVersion();
  if (!currentVersion || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;

  setUpdateState({
    currentVersion,
    lastCheckedAt: Date.now(),
  });

  try {
    const latestVersion = await fetchLatestAppShellVersion();
    if (!latestVersion) return false;

    setUpdateState({ latestVersion });
    if (latestVersion === currentVersion) return false;

    queuedUpdate = async () => {
      window.location.reload();
    };
    setUpdateState({
      status: 'update-available',
      updateAvailable: true,
      dismissedAt: null,
      currentVersion,
      latestVersion,
      lastUpdateFoundAt: Date.now(),
      errorMessage: null,
    });
    return true;
  } catch (error) {
    console.warn('[PWA] App shell version check failed:', error);
    return false;
  }
};

const bindAppShellUpdateChecks = () => {
  if (appShellCheckListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  appShellCheckListenersBound = true;

  window.setTimeout(() => {
    void checkForAppShellUpdate();
  }, 3000);
  window.setInterval(() => {
    void checkForAppShellUpdate();
  }, APP_SHELL_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForAppShellUpdate();
  });
};

const reserveAutomaticRecoveryAttempt = () => {
  const now = Date.now();
  const stored = readRecoveryAttempts();
  const withinWindow = stored.firstAttemptAt && now - stored.firstAttemptAt < RECOVERY_WINDOW_MS;
  const count = withinWindow ? stored.count : 0;
  const firstAttemptAt = withinWindow ? stored.firstAttemptAt : now;

  if (count >= MAX_AUTO_RECOVERY_ATTEMPTS) {
    setUpdateState({ recoveryAttemptCount: count });
    return false;
  }

  const nextCount = count + 1;
  writeRecoveryAttempts(nextCount, firstAttemptAt);
  setUpdateState({ recoveryAttemptCount: nextCount });
  return true;
};

const runQueuedUpdate = async () => {
  if (!queuedUpdate) return false;
  const applyUpdate = queuedUpdate;
  queuedUpdate = null;
  setUpdateState({
    status: 'applying',
    updateAvailable: true,
    dismissedAt: null,
    errorMessage: null,
  });

  try {
    await applyUpdate();
    setUpdateState({
      status: 'idle',
      updateAvailable: false,
      dismissedAt: null,
      lastAppliedAt: Date.now(),
      errorMessage: null,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '無法套用新版本。';
    console.warn('[PWA] Failed to activate pending app update:', error);
    setUpdateState({ status: 'failed', errorMessage: message });
    return false;
  }
};

const applyUpdateWhenBackgrounded = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  if (document.visibilityState === 'hidden') {
    void runQueuedUpdate();
    return;
  }

  if (backgroundListenersBound) return;
  backgroundListenersBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void runQueuedUpdate();
  });
  window.addEventListener('pagehide', () => {
    void runQueuedUpdate();
  });
};

const installPwaUpdateTestControls = () => {
  if (testControlsInstalled || typeof window === 'undefined') return;
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
  testControlsInstalled = true;

  window.__projedPwaUpdateTest = {
    getState: getPwaUpdateState,
    simulateUpdateAvailable: () => {
      queuedUpdate = async () => {
        window.dispatchEvent(new CustomEvent('projed:pwa-update-test-applied'));
      };
      setUpdateState({
        status: 'update-available',
        updateAvailable: true,
        dismissedAt: null,
        currentVersion: 'test-current',
        latestVersion: 'test-next',
        lastUpdateFoundAt: Date.now(),
        errorMessage: null,
      });
    },
    simulateUpdated: () => {
      setUpdateState({
        status: 'updated',
        updateAvailable: false,
        dismissedAt: null,
        currentVersion: 'test-next',
        latestVersion: 'test-next',
        previousVersion: 'test-current',
        lastAppliedAt: Date.now(),
        errorMessage: null,
      });
    },
    simulateOfflineReady: () => {
      setUpdateState({
        status: 'offline-ready',
        offlineReady: true,
        errorMessage: null,
      });
    },
    simulateRecoverableCacheError: (message = '測試載入錯誤') => {
      setUpdateState({
        status: 'recoverable-cache-error',
        errorMessage: message,
      });
    },
    reset: () => {
      queuedUpdate = null;
      resetRecoveryAttempts();
      setUpdateState({
        status: 'idle',
        updateAvailable: false,
        offlineReady: false,
        dismissedAt: null,
        lastCheckedAt: null,
        lastUpdateFoundAt: null,
        lastAppliedAt: null,
        recoveryAttemptCount: 0,
        currentVersion: null,
        latestVersion: null,
        previousVersion: null,
        errorMessage: null,
      });
    },
  };
};

export const getPwaUpdateState = () => cloneState();

export const subscribePwaUpdateState = (listener: PwaUpdateListener) => {
  listeners.add(listener);
  listener(cloneState());
  return () => {
    listeners.delete(listener);
  };
};

export const dismissPwaUpdatePrompt = () => {
  setUpdateState({ dismissedAt: Date.now() });
};

export const applyPwaUpdate = async () => {
  const hadQueuedUpdate = Boolean(queuedUpdate || updateState.updateAvailable);

  setUpdateState({
    status: 'checking',
    lastCheckedAt: Date.now(),
    errorMessage: null,
  });

  const foundAppShellUpdate = await checkForAppShellUpdate();
  const hasKnownUpdate = hadQueuedUpdate || foundAppShellUpdate || updateState.updateAvailable;

  if (!hasKnownUpdate) {
    setUpdateState({ status: 'idle' });
    return false;
  }

  return clearPwaApplicationCacheAndReload();
};

export const clearPwaApplicationCacheAndReload = async () => {
  queuedUpdate = null;
  setUpdateState({ status: 'applying', errorMessage: null });

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }

    resetRecoveryAttempts();
  } catch (error) {
    const message = error instanceof Error ? error.message : '清除應用程式快取失敗。';
    console.warn('[PWA] Failed to clear app cache:', error);
    setUpdateState({ status: 'failed', errorMessage: message });
    return false;
  }

  reloadToLatestAppShell();
  return true;
};

export const handleRecoverableAppLoadError = (error: unknown, source: 'error' | 'unhandledrejection' = 'error') => {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '新版檔案載入失敗。';

  console.warn(`[PWA] Recoverable app load error from ${source}:`, error);
  setUpdateState({
    status: 'recoverable-cache-error',
    errorMessage: message,
  });

  if (!reserveAutomaticRecoveryAttempt()) return false;

  window.setTimeout(() => {
    window.location.reload();
  }, 50);
  return true;
};

export const setupPwaLifecycle = () => {
  installPwaUpdateTestControls();
  if (setupDone) return;
  setupDone = true;

  if (typeof window === 'undefined') return;
  stripLatestReloadParam();
  if (import.meta.env.PROD) {
    recordLoadedAppVersion();
    bindAppShellUpdateChecks();
  }
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      queuedUpdate = async () => {
        if (!updateSW) throw new Error('PWA update callback is not ready.');
        await updateSW(true);
      };
      setUpdateState({
        status: 'update-available',
        updateAvailable: true,
        dismissedAt: null,
        currentVersion: getCurrentAppShellVersion() ?? updateState.currentVersion,
        lastUpdateFoundAt: Date.now(),
        errorMessage: null,
      });
      applyUpdateWhenBackgrounded();
    },
    onOfflineReady() {
      console.info('[PWA] App shell cached for faster startup and offline reopen.');
      if (!updateState.updateAvailable && updateState.status !== 'updated') {
        setUpdateState({
          status: 'offline-ready',
          offlineReady: true,
          errorMessage: null,
        });
      } else {
        setUpdateState({ offlineReady: true });
      }
    },
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        const canShowChecking = !updateState.updateAvailable && updateState.status !== 'updated';
        if (canShowChecking) {
          setUpdateState({
            status: 'checking',
            lastCheckedAt: Date.now(),
          });
        } else {
          setUpdateState({ lastCheckedAt: Date.now() });
        }
        registration.update().catch((error) => {
          console.warn('[PWA] Update check failed:', error);
          setUpdateState({
            status: updateState.updateAvailable || updateState.status === 'updated' ? updateState.status : 'failed',
            errorMessage: error instanceof Error ? error.message : '檢查更新失敗。',
          });
        }).finally(() => {
          if (!updateState.updateAvailable && updateState.status === 'checking') {
            setUpdateState({ status: 'idle' });
          }
          void checkForAppShellUpdate();
        });
      };

      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
      setUpdateState({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '版本更新服務註冊失敗。',
      });
    },
  });
};
