import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  transaction: 'src/services/pwaUpdateTransaction.ts',
  pwaUpdateService: 'src/services/pwaUpdateService.ts',
  appUpdatePrompt: 'src/components/AppUpdatePrompt.tsx',
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

assert('transaction contract remains available', source.transaction.includes('PwaUpdateTransactionV1') && source.transaction.includes('ownerFence') && source.transaction.includes('awaiting-controller'));
assert('observable PWA state remains available', source.pwaUpdateService.includes('export type PwaUpdateStatus') && source.pwaUpdateService.includes('export const getPwaUpdateState') && source.pwaUpdateService.includes('export const subscribePwaUpdateState') && source.pwaUpdateService.includes("const STATE_EVENT_NAME = 'projed:pwa-update-state'"));
assert('prompt update mode remains non-forced', source.viteConfig.includes("registerType: 'prompt'") && source.viteConfig.includes('skipWaiting: false') && source.viteConfig.includes('cleanupOutdatedCaches: false'));
assert('worker update availability is visible but navigation remains application-owned', source.pwaUpdateService.includes("status: 'update-available'") && source.pwaUpdateService.includes('new Workbox') && source.pwaUpdateService.includes('reloadAtOwnBoundary') && !source.pwaUpdateService.includes('applyUpdateWhenBackgrounded'));
assert('normal update keeps cache recovery as a separate manual path', !normalApplyBody.includes('clearPwaApplicationCacheAndReload') && source.pwaUpdateService.includes('export const clearPwaApplicationCacheAndReload') && source.pwaUpdateService.includes('navigator.serviceWorker.getRegistrations()') && source.pwaUpdateService.includes('window.caches.delete(cacheName)'));
assert('post-reload version reconciliation exists', source.pwaUpdateService.includes('currentVersion === transaction.targetVersion') && source.pwaUpdateService.includes('writeCompletedVersion') && source.pwaUpdateService.includes('POST_RELOAD_MISMATCH'));
assert('global prompt remains mounted outside AuthGate', source.app.includes("import { AppUpdatePrompt } from './components/AppUpdatePrompt'") && source.app.includes('<AppUpdatePrompt />') && source.app.indexOf('<AppUpdatePrompt />') < source.app.indexOf('<AppInstallAssistant />'));
assert('normal prompt follows DEV-097 compact wording contract', source.appUpdatePrompt.includes('新版已就緒') && source.appUpdatePrompt.includes('重新載入') && source.appUpdatePrompt.includes('稍後') && !source.appUpdatePrompt.includes('關閉更新提示') && !source.appUpdatePrompt.includes('RefreshCw'));
assert('recoverable load failures remain bounded', source.main.includes('handleRecoverableAppLoadError') && source.pwaUpdateService.includes('MAX_AUTO_RECOVERY_ATTEMPTS') && source.pwaUpdateService.includes('window.location.replace(buildLatestReloadUrl())'));
assert('business storage is not cleared by recovery', source.errorBoundary.includes('clearPwaApplicationCacheAndReload') && !source.pwaUpdateService.includes('localStorage.clear()') && !source.pwaUpdateService.includes('sessionStorage.clear()'));
assert('DEV-041 historical authority points to DEV-096 correction', source.spec.includes('DEV-096 Corrective Addendum') && source.qa.includes('authority note') && source.qa.includes('不得以本文件歷史 PASS 宣稱 DEV-096 已通過'));
assert('DEV-041 and DEV-096 verifier commands are registered', source.packageJson.includes('verify:dev-041-pwa-update-notification-cache-recovery') && source.packageJson.includes('verify:dev-096-pwa-update-transaction-convergence'));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
if (failed.length > 0) process.exit(1);
