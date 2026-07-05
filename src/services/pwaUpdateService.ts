import { registerSW } from 'virtual:pwa-register';

export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'applying'
  | 'offline-ready'
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
  errorMessage: string | null;
};
type PwaUpdateListener = (state: PwaUpdateState) => void;
type RegisterUpdateCallback = ReturnType<typeof registerSW>;

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const MAX_AUTO_RECOVERY_ATTEMPTS = 1;
const RECOVERY_ATTEMPTS_KEY = 'projed.pwaUpdate.recoveryAttempts';
const STATE_EVENT_NAME = 'projed:pwa-update-state';

const listeners = new Set<PwaUpdateListener>();

let updateSW: RegisterUpdateCallback | null = null;
let queuedUpdate: (() => Promise<void>) | null = null;
let backgroundListenersBound = false;
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
  errorMessage: null,
};

declare global {
  interface Window {
    __projedPwaUpdateTest?: {
      getState: () => PwaUpdateState;
      simulateUpdateAvailable: () => void;
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
        lastUpdateFoundAt: Date.now(),
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
  if (!queuedUpdate) {
    setUpdateState({
      status: 'checking',
      lastCheckedAt: Date.now(),
      errorMessage: null,
    });
    return false;
  }
  return runQueuedUpdate();
};

export const clearPwaApplicationCacheAndReload = async () => {
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

  window.location.assign('/');
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

  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

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
        lastUpdateFoundAt: Date.now(),
        errorMessage: null,
      });
      applyUpdateWhenBackgrounded();
    },
    onOfflineReady() {
      console.info('[PWA] App shell cached for faster startup and offline reopen.');
      if (!updateState.updateAvailable) {
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
        setUpdateState({
          status: updateState.updateAvailable ? updateState.status : 'checking',
          lastCheckedAt: Date.now(),
        });
        registration.update().catch((error) => {
          console.warn('[PWA] Update check failed:', error);
          setUpdateState({
            status: updateState.updateAvailable ? updateState.status : 'failed',
            errorMessage: error instanceof Error ? error.message : '檢查更新失敗。',
          });
        }).finally(() => {
          if (!updateState.updateAvailable && updateState.status === 'checking') {
            setUpdateState({ status: 'idle' });
          }
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
