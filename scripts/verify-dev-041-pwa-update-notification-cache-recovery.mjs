import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  pwaUpdateService: 'src/services/pwaUpdateService.ts',
  appUpdatePrompt: 'src/components/AppUpdatePrompt.tsx',
  app: 'src/App.tsx',
  main: 'src/main.tsx',
  errorBoundary: 'src/components/GlobalErrorBoundary.tsx',
  viteConfig: 'vite.config.js',
  spec: 'ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md',
  qa: 'ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));

assert(
  'pwa update service exposes observable state and subscription',
  source.pwaUpdateService.includes('export type PwaUpdateStatus') &&
    source.pwaUpdateService.includes("'update-available'") &&
    source.pwaUpdateService.includes("'applying'") &&
    source.pwaUpdateService.includes("'offline-ready'") &&
    source.pwaUpdateService.includes("'updated'") &&
    source.pwaUpdateService.includes("'recoverable-cache-error'") &&
    source.pwaUpdateService.includes("'failed'") &&
    source.pwaUpdateService.includes('export const getPwaUpdateState') &&
    source.pwaUpdateService.includes('export const subscribePwaUpdateState') &&
    source.pwaUpdateService.includes("const STATE_EVENT_NAME = 'projed:pwa-update-state'"),
);

assert(
  'app shell bundle hash is recorded and checked independently of service worker events',
  source.pwaUpdateService.includes("const APP_VERSION_KEY = 'projed.pwaUpdate.currentBundle'") &&
    source.pwaUpdateService.includes('getCurrentAppShellVersion') &&
    source.pwaUpdateService.includes('extractAppShellVersionFromHtml') &&
    source.pwaUpdateService.includes('fetchLatestAppShellVersion') &&
    source.pwaUpdateService.includes('recordLoadedAppVersion') &&
    source.pwaUpdateService.includes('bindAppShellUpdateChecks') &&
    source.pwaUpdateService.includes("cache: 'no-store'"),
);

assert(
  'onNeedRefresh queues update and notifies visible update state',
  source.pwaUpdateService.includes('onNeedRefresh()') &&
    source.pwaUpdateService.includes('queuedUpdate = async () =>') &&
    source.pwaUpdateService.includes("status: 'update-available'") &&
    source.pwaUpdateService.includes('updateAvailable: true') &&
    source.pwaUpdateService.includes('lastUpdateFoundAt: Date.now()') &&
    source.pwaUpdateService.includes('applyUpdateWhenBackgrounded()'),
);

assert(
  'apply update path is explicit and guarded',
  source.pwaUpdateService.includes('export const applyPwaUpdate') &&
    source.pwaUpdateService.includes('return clearPwaApplicationCacheAndReload();') &&
    source.pwaUpdateService.includes("const LATEST_RELOAD_PARAM = 'projed_update_latest'") &&
    source.pwaUpdateService.includes('reloadToLatestAppShell') &&
    source.pwaUpdateService.includes("status: 'applying'") &&
    source.appUpdatePrompt.includes('isLoading={isApplying || state.status === \'applying\'}') &&
    source.appUpdatePrompt.includes('data-pwa-update-action') &&
    source.appUpdatePrompt.includes('一鍵更新到最新版'),
);

assert(
  'update action bypasses stale queued worker and reloads latest app shell',
  source.pwaUpdateService.includes('const hadQueuedUpdate = Boolean(queuedUpdate || updateState.updateAvailable)') &&
    source.pwaUpdateService.includes('queuedUpdate = null;') &&
    source.pwaUpdateService.includes('window.location.assign(buildLatestReloadUrl())') &&
    source.pwaUpdateService.includes('projed:pwa-update-test-latest-reload') &&
    !source.pwaUpdateService.includes('return runQueuedUpdate();'),
);

assert(
  'dismiss keeps update callback instead of clearing queued update',
  source.pwaUpdateService.includes('export const dismissPwaUpdatePrompt') &&
    source.pwaUpdateService.includes('dismissedAt: Date.now()') &&
    !source.pwaUpdateService.match(/dismissPwaUpdatePrompt[\s\S]{0,180}queuedUpdate\s*=\s*null/),
);

assert(
  'cache recovery only clears app cache and service worker registrations',
  source.pwaUpdateService.includes('export const clearPwaApplicationCacheAndReload') &&
    source.pwaUpdateService.includes('navigator.serviceWorker.getRegistrations()') &&
    source.pwaUpdateService.includes('registration.unregister()') &&
    source.pwaUpdateService.includes('window.caches.keys()') &&
    source.pwaUpdateService.includes('window.caches.delete(cacheName)') &&
    !source.pwaUpdateService.includes('localStorage.clear()') &&
    !source.pwaUpdateService.includes('sessionStorage.clear()'),
);

assert(
  'chunk load failures route through recoverable load handler with loop guard',
  source.main.includes('handleRecoverableAppLoadError') &&
    !source.main.includes('強制重新載入頁面取回最新快取') &&
    source.pwaUpdateService.includes('RECOVERY_ATTEMPTS_KEY') &&
    source.pwaUpdateService.includes('MAX_AUTO_RECOVERY_ATTEMPTS') &&
    source.pwaUpdateService.includes('reserveAutomaticRecoveryAttempt') &&
    source.pwaUpdateService.includes("status: 'recoverable-cache-error'"),
);

assert(
  'global update prompt is mounted and has stable DOM contracts',
  source.app.includes("import { AppUpdatePrompt } from './components/AppUpdatePrompt'") &&
    source.app.includes('<AppUpdatePrompt />') &&
    source.app.indexOf('<AppUpdatePrompt />') < source.app.indexOf('<AppInstallAssistant />') &&
    source.appUpdatePrompt.includes('data-pwa-update-prompt') &&
    source.appUpdatePrompt.includes('data-pwa-update-dismiss') &&
    source.appUpdatePrompt.includes('data-pwa-update-later') &&
    source.appUpdatePrompt.includes('data-pwa-cache-recovery') &&
    source.appUpdatePrompt.includes('data-pwa-updated-confirm') &&
    source.appUpdatePrompt.includes('已更新到新版') &&
    source.appUpdatePrompt.includes('aria-live="polite"'),
);

assert(
  'error boundary recovery no longer clears business storage',
  source.errorBoundary.includes('clearPwaApplicationCacheAndReload') &&
    source.errorBoundary.includes('這不會清除您的任務資料或登入資料') &&
    !source.errorBoundary.includes('localStorage.clear()') &&
    !source.errorBoundary.includes('sessionStorage.clear()'),
);

assert(
  'test-mode helper allows deterministic browser verification without production update',
  source.pwaUpdateService.includes('__projedPwaUpdateTest') &&
    source.pwaUpdateService.includes('simulateUpdateAvailable') &&
    source.pwaUpdateService.includes('simulateUpdated') &&
    source.pwaUpdateService.includes('simulateRecoverableCacheError') &&
    source.pwaUpdateService.includes("import.meta.env.MODE !== 'test'"),
);

assert(
  'vite PWA keeps prompt update mode instead of forced takeover',
  source.viteConfig.includes("registerType: 'prompt'") &&
    source.viteConfig.includes('skipWaiting: false') &&
    source.viteConfig.includes('cleanupOutdatedCaches: true'),
);

assert(
  'package exposes DEV-041 verifiers',
  source.packageJson.includes('"verify:dev-041-pwa-update-notification-cache-recovery"') &&
    source.packageJson.includes('"verify:dev-041-pwa-update-notification-cache-recovery-browser"'),
);

assert(
  'SPEC and QA are updated for implementation evidence',
  (source.spec.includes('Phase 1 Implemented') || source.spec.includes('Production Release Deployed')) &&
    source.spec.includes('AppUpdatePrompt') &&
    source.qa.includes('QC Evidence') &&
    source.qa.includes('verify:dev-041-pwa-update-notification-cache-recovery-browser'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
