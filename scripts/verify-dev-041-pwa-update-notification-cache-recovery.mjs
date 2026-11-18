import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  transaction: 'src/services/pwaUpdateTransaction.ts',
  pwaUpdateService: 'src/services/pwaUpdateService.ts',
  appUpdatePrompt: 'src/components/AppUpdatePrompt.tsx',
  appMoreMenu: 'src/components/AppMoreMenu.tsx',
  updatePresentation: 'src/services/pwaUpdatePresentation.ts',
  app: 'src/App.tsx',
  main: 'src/main.tsx',
  errorBoundary: 'src/components/GlobalErrorBoundary.tsx',
  viteConfig: 'vite.config.js',
  spec: 'ai-doc/specs/SPEC-041-pwa-update-notification-cache-recovery.md',
  qa: 'ai-doc/qa/QA-DEV-041-pwa-update-notification-cache-recovery.md',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) assert(`file exists:${label}`, existsSync(resolve(file)), file);
const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));
const normalApplyBody = source.pwaUpdateService.match(/export const applyPwaUpdate[\s\S]*?(?=export const clearPwaApplicationCacheAndReload)/)?.[0] ?? '';
const loadErrorBody = source.pwaUpdateService.match(/export const handleRecoverableAppLoadError[\s\S]*?(?=export const setupPwaLifecycle)/)?.[0] ?? '';

assert('transaction contract remains available', source.transaction.includes('PwaUpdateTransactionV1') && source.transaction.includes('ownerFence') && source.transaction.includes('awaiting-controller'));
assert('observable PWA state remains available', source.pwaUpdateService.includes('export type PwaUpdateStatus') && source.pwaUpdateService.includes('export const getPwaUpdateState') && source.pwaUpdateService.includes('export const subscribePwaUpdateState') && source.pwaUpdateService.includes("const STATE_EVENT_NAME = 'projed:pwa-update-state'"));
assert('prompt update mode remains non-forced', source.viteConfig.includes("registerType: 'prompt'") && source.viteConfig.includes('skipWaiting: false') && source.viteConfig.includes('cleanupOutdatedCaches: false'));
assert('worker update availability is visible but navigation remains application-owned', source.pwaUpdateService.includes("status: 'update-available'") && source.pwaUpdateService.includes('new Workbox') && source.pwaUpdateService.includes('reloadAtOwnBoundary') && !source.pwaUpdateService.includes('applyUpdateWhenBackgrounded'));
assert('normal update keeps cache recovery as a separate version-scoped manual path', !normalApplyBody.includes('clearPwaApplicationCacheAndReload') && source.pwaUpdateService.includes('export const clearPwaApplicationCacheAndReload') && source.pwaUpdateService.includes('pathname.startsWith(versionPath)') && source.pwaUpdateService.includes('cache.delete(request)') && !source.pwaUpdateService.includes('navigator.serviceWorker.getRegistrations()'));
assert('post-reload version reconciliation exists', source.pwaUpdateService.includes('currentVersion === transaction.targetVersion') && source.pwaUpdateService.includes('writeCompletedVersion') && source.pwaUpdateService.includes('POST_RELOAD_MISMATCH'));
assert('global prompt remains mounted outside AuthGate', source.app.includes("import { AppUpdatePrompt } from './components/AppUpdatePrompt'") && source.app.includes('<AppUpdatePrompt />') && source.app.includes('</AuthGate>') && source.app.indexOf('</AuthGate>') < source.app.indexOf('<AppUpdatePrompt />') && source.app.indexOf('<AppUpdatePrompt />') < source.app.lastIndexOf('</PwaReloadSafetyBridge>'));
assert('DEV-141 normal update lives in more menu and recovery prompt remains manual', source.appMoreMenu.includes('getPwaCheckPresentation(state, operation)') && source.appMoreMenu.includes('data-app-update-available') && source.appMoreMenu.includes('新版已就緒') && source.appMoreMenu.includes('data-app-update-reload') && source.appMoreMenu.includes('data-app-update-later') && source.appUpdatePrompt.includes('getPwaUpdatePresentation(state)') && source.appUpdatePrompt.includes('data-pwa-cache-recovery') && !source.appUpdatePrompt.includes('dismissPwaUpdatePrompt'));
assert('recoverable load failures offer manual retry without automatic navigation', source.main.includes('handleRecoverableAppLoadError') && source.appUpdatePrompt.includes('retryPwaUpdate') && loadErrorBody.includes("status: 'recoverable-cache-error'") && !loadErrorBody.includes('startLocalRecovery(') && !loadErrorBody.includes('window.location.replace('));
assert('business storage is not cleared by recovery', source.errorBoundary.includes('clearPwaApplicationCacheAndReload') && !source.pwaUpdateService.includes('localStorage.clear()') && !source.pwaUpdateService.includes('sessionStorage.clear()'));
assert('DEV-041 historical authority points to DEV-096 correction', source.spec.includes('DEV-096 Corrective Addendum') && source.qa.includes('authority note') && source.qa.includes('不得以本文件歷史 PASS 宣稱 DEV-096 已通過'));
assert('DEV-041 and DEV-096 verifier commands are registered', source.packageJson.includes('verify:dev-041-pwa-update-notification-cache-recovery') && source.packageJson.includes('verify:dev-096-pwa-update-transaction-convergence'));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
if (failed.length > 0) process.exit(1);
