import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  claimPwaUpdateTransaction,
  createPwaUpdateTransaction,
  isPwaUpdateTransaction,
  isPwaUpdateTransactionStale,
  ownsPwaUpdateTransaction,
  parsePwaUpdateTransaction,
  PWA_UPDATE_LEASE_MS,
  retargetPwaUpdateTransaction,
  serializePwaUpdateTransaction,
  transitionPwaUpdateTransaction,
} from '../src/services/pwaUpdateTransaction';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const results: Array<{ name: string; ok: boolean; details?: unknown }> = [];
const assert = (name: string, condition: boolean, details?: unknown) => results.push({ name, ok: condition, details });

const now = 1_700_000_000_000;
const available = createPwaUpdateTransaction({
  transactionId: 'tx-test',
  sourceVersion: 'release:A',
  targetVersion: 'release:B',
  now,
});
const claimed = claimPwaUpdateTransaction(available, 'tab-a', 1, now + 1);
const retargeted = retargetPwaUpdateTransaction(claimed, 'release:C', now + 2);
const awaiting = transitionPwaUpdateTransaction(retargeted, 'awaiting-controller', now + 3, { normalReloadReserved: true });
const recovering = transitionPwaUpdateTransaction(awaiting, 'recovering', now + 4, { recoveryAttemptCount: 1 });
const failed = transitionPwaUpdateTransaction(recovering, 'failed', now + 5, { errorCode: 'POST_RELOAD_MISMATCH' });

assert('valid transaction round trip is byte stable', parsePwaUpdateTransaction(serializePwaUpdateTransaction(available)) !== null && JSON.stringify(parsePwaUpdateTransaction(serializePwaUpdateTransaction(available))) === JSON.stringify(available));
assert('available transaction has unowned fence zero', available.ownerTabId === '' && available.ownerFence === 0);
assert('claim adds owner lease and fence', claimed.ownerTabId === 'tab-a' && claimed.ownerFence === 1 && claimed.leaseExpiresAt === now + 1 + PWA_UPDATE_LEASE_MS);
assert('only applying owner may retarget before controller reservation', retargeted.targetVersion === 'release:C' && retargeted.phase === 'applying');
assert('controller reservation is explicit', awaiting.phase === 'awaiting-controller' && awaiting.normalReloadReserved);
assert('recovery consumes exactly one attempt', recovering.phase === 'recovering' && recovering.recoveryAttemptCount === 1);
assert('failed is terminal', failed.phase === 'failed' && !ownsPwaUpdateTransaction(failed, 'tab-a', 1, now + 6));
assert('stale transaction is detectable', isPwaUpdateTransactionStale({ ...claimed, createdAt: now - 5 * 60_000 - 2, updatedAt: now - 5 * 60_000 - 1 }, now));
assert('old owner fence cannot commit', !ownsPwaUpdateTransaction(claimed, 'tab-a', 2, now + 2));

const invalidCases: Array<[string, unknown]> = [
  ['invalid schema', { ...available, schemaVersion: 2 }],
  ['invalid phase', { ...available, phase: 'idle' }],
  ['available owner', { ...available, ownerTabId: 'tab-a' }],
  ['invalid fence', { ...claimed, ownerFence: 0 }],
  ['invalid timestamp', { ...available, updatedAt: Number.NaN }],
  ['reserved controller without reload flag', { ...claimed, phase: 'awaiting-controller' }],
  ['recovering without attempt', { ...claimed, phase: 'recovering' }],
];
for (const [name, value] of invalidCases) assert(`strict parser rejects ${name}`, !isPwaUpdateTransaction(value));

const service = read('src/services/pwaUpdateService.ts');
const prompt = read('src/components/AppUpdatePrompt.tsx');
const vite = read('vite.config.js');
const env = read('src/vite-env.d.ts');
const packageJson = read('package.json');
const normalApplyBody = service.match(/export const applyPwaUpdate[\s\S]*?(?=export const clearPwaApplicationCacheAndReload)/)?.[0] ?? '';

assert('normal apply does not call cache recovery', !normalApplyBody.includes('clearPwaApplicationCacheAndReload'));
assert('normal apply does not use background or pagehide writers', !service.includes('applyUpdateWhenBackgrounded') && !service.includes("addEventListener('pagehide'"));
assert('normal activation uses standard update callback', service.includes('await updateSW()') && service.includes("status: 'awaiting-controller'"));
assert('post-reload completion compares current and target', service.includes('currentVersion === transaction.targetVersion') && service.includes('writeCompletedVersion'));
assert('cross-tab lock has Web Locks and PWA IndexedDB paths', service.includes('locks.request(APPLY_LOCK_NAME') && service.includes("indexedDB.open(APPLY_LOCK_DB_NAME") && service.includes('ownerFence'));
assert('production version uses injected release ID and release metadata', vite.includes('VITE_PROJED_RELEASE_ID') && env.includes('VITE_PROJED_RELEASE_ID') && service.includes('/release-meta.json'));
assert('normal UI removes the redlined icon and description', !prompt.includes('RefreshCw') && !prompt.includes('一鍵更新到最新版') && !prompt.includes('description'));
assert('normal UI retains compact action contract', prompt.includes('有新版本可用') && prompt.includes('一鍵更新') && prompt.includes('稍後') && prompt.includes('關閉更新提示'));
assert('new verifier scripts are registered', packageJson.includes('verify:dev-096-pwa-update-transaction-convergence') && packageJson.includes('verify:dev-096-pwa-update-transaction-convergence-browser') && packageJson.includes('verify:dev-096-pwa-update-transaction-convergence-sw'));

const failedResults = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failedResults.length === 0,
  summary: { pass: results.length - failedResults.length, fail: failedResults.length },
  results,
}, null, 2));
if (failedResults.length > 0) process.exit(1);
