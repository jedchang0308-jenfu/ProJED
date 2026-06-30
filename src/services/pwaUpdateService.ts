import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let queuedUpdate: (() => void) | null = null;
let backgroundListenersBound = false;

const applyQueuedUpdate = () => {
  if (!queuedUpdate) return;

  const applyUpdate = queuedUpdate;
  queuedUpdate = null;
  applyUpdate();
};

const applyUpdateWhenBackgrounded = () => {
  if (document.visibilityState === 'hidden') {
    applyQueuedUpdate();
    return;
  }

  if (backgroundListenersBound) return;
  backgroundListenersBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') applyQueuedUpdate();
  });
  window.addEventListener('pagehide', applyQueuedUpdate);
};

export const setupPwaLifecycle = () => {
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  let updateSW: ReturnType<typeof registerSW> | null = null;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      queuedUpdate = () => {
        updateSW?.(true).catch((error) => {
          console.warn('[PWA] Failed to activate pending app update:', error);
        });
      };
      applyUpdateWhenBackgrounded();
    },
    onOfflineReady() {
      console.info('[PWA] App shell cached for faster startup and offline reopen.');
    },
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        registration.update().catch((error) => {
          console.warn('[PWA] Update check failed:', error);
        });
      };

      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
    },
  });
};
