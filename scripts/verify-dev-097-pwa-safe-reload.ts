import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PWA_RELOAD_SAFETY_OWNER_IDS,
  getPwaReloadSafetyOwnerManifest,
} from '../src/services/pwaReloadOwnerManifest';
import {
  getPwaReloadSafetySnapshot,
  registerPwaReloadSafetyOwner,
  requestPwaReloadBoundary,
  setPwaReloadReadiness,
} from '../src/services/pwaReloadSafety';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const results: Array<{ name: string; ok: boolean; details?: unknown }> = [];
const assert = (name: string, condition: boolean, details?: unknown) => results.push({ name, ok: condition, details });

const source = read('src/services/pwaReloadSafety.ts');
const updateService = read('src/services/pwaUpdateService.ts');
const prompt = read('src/components/AppUpdatePrompt.tsx');
const ownerBridge = read('src/components/PwaReloadSafetyBridge.tsx');
const authGate = read('src/components/AuthGate.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const boardMembers = read('src/components/BoardMembersPanel.tsx');
const calendarSubscriptions = read('src/components/CalendarSubscriptionsView.tsx');
const vite = read('vite.config.js');
const packageJson = read('package.json');

assert(
  'typed manifest includes every mandatory owner and no authenticated owner for AuthGate-only shell',
  PWA_RELOAD_SAFETY_OWNER_IDS.length === 9
    && getPwaReloadSafetyOwnerManifest(null).length === 0
    && getPwaReloadSafetyOwnerManifest('home').length === 6
    && getPwaReloadSafetyOwnerManifest('settings').some(entry => entry.ownerId === 'backup-import'),
);
assert('safety service has no cross-client heartbeat or TTL', !source.includes('heartbeat') && !source.includes('BroadcastChannel') && !source.includes('setInterval'));
assert('safety service exposes explicit readiness and boundary contracts', source.includes('setPwaReloadReadiness') && source.includes('requestPwaReloadBoundary') && source.includes('PWA_RELOAD_RESERVATION_KEY'));
assert(
  'last readiness producer immediately re-evaluates stale fail-closed state',
  source.includes('else refreshPwaReloadSafety(currentView);')
    && !source.includes('else notify();'),
);
assert(
  'global completed metadata cannot suppress a stale document local obligation',
  !updateService.includes('if (readCompletedVersion() === targetVersion) return null;')
    && updateService.includes('completedVersion is cross-tab history')
    && updateService.includes('do not\n    // create a second global transaction')
    && updateService.includes("if (readCompletedVersion() === targetVersion) {\n    reloadAtOwnBoundary(targetVersion);"),
);
assert(
  'document identity and post-reload recovery are local-tab scoped',
  updateService.includes('sessionStorage.setItem(CURRENT_VERSION_KEY, currentVersion)')
    && !updateService.includes('localStorage.setItem(CURRENT_VERSION_KEY, currentVersion)')
    && updateService.includes("reservation?.targetVersion === transaction.targetVersion")
    && updateService.includes('transaction.ownerTabId === getTabId()'),
);
assert(
  'multi-tab detection has stable transaction identity and redundant is not an activation failure',
  updateService.includes('createStableTransactionId(sourceVersion, targetVersion)')
    && updateService.includes("navigator.serviceWorker.addEventListener('controllerchange', onControllerChange")
    && updateService.includes('const onRedundant = () => undefined')
    && !updateService.includes("setUpdateState({ reloadSafetyCode: 'WORKER_ACTIVATION_FAILED'"),
);
assert(
  'retarget activation messages only the worker mapped to the stable target',
  updateService.includes('const waitingWorkerTargets = new WeakMap<ServiceWorker, string>()')
    && updateService.includes('previousTarget === transaction.targetVersion')
    && updateService.includes("prepared.waitingWorker.postMessage({ type: 'SKIP_WAITING' })"),
);
assert('update service owns Workbox without virtual helper', updateService.includes("import { Workbox") && !updateService.includes('virtual:pwa-register') && updateService.includes("prepared.waitingWorker.postMessage({ type: 'SKIP_WAITING' })"));
assert('worker isolation flags are fail-closed and normal cleanup is disabled', vite.includes('clientsClaim: false') && vite.includes('skipWaiting: false') && vite.includes('cleanupOutdatedCaches: false') && vite.includes('PROJED_RELEASE_ID'));
assert('workbox-window is a direct runtime dependency', /"workbox-window"\s*:\s*"7\.4\.1"/.test(packageJson));
assert('normal prompt has exact compact action set', prompt.includes('新版已就緒') && prompt.includes('重新載入') && prompt.includes('稍後') && !prompt.includes('關閉更新提示'));
assert(
  'owner bridge selectors return stable store snapshots',
  !/use(?:Record|Dialog|Rag)Store\(state\s*=>\s*\(\{/.test(ownerBridge)
    && ownerBridge.includes('useRecordStore(state => state.draft)')
    && ownerBridge.includes('useDialogStore(state => state.isOpen)')
    && ownerBridge.includes('useRagStore(state => state.queryDraft)'),
);
assert(
  'real owner revisions are monotonic rather than signature hashes',
  ownerBridge.includes('revisionState.revision + 1')
    && ownerBridge.includes('setRevisionState({ signature, revision })')
    && !ownerBridge.includes('signature.charCodeAt'),
);
assert(
  'anonymous auth shell owns active-view readiness before AppContent mounts',
  authGate.includes("if (loading || user) return;")
    && authGate.includes("setPwaReloadReadiness('active-view', epoch, true)")
    && authGate.includes('refreshPwaReloadSafety(null)')
    && authGate.includes("setPwaReloadReadiness('active-view', epoch, false)"),
);
assert(
  'real Sidebar rename inputs are connected to the inline-editor owner',
  sidebar.includes('data-workspace-title-input="true"')
    && sidebar.includes('data-board-title-input="true"'),
);
assert(
  'invite loading and explicit cancel remain observable to the owner bridge',
  ownerBridge.includes("inviteState?.matches('[data-board-share-loading=\"true\"]')")
    && boardMembers.includes('if (inviteLoading) return;')
    && boardMembers.includes("setInviteEmail('');"),
);
assert(
  'local authenticated calendar preview exposes real dirty and cancel signals',
  calendarSubscriptions.includes('data-calendar-subscription-root="true"')
    && calendarSubscriptions.includes("data-pwa-calendar-state={localPreviewDirty || isDeleting ? 'dirty' : 'safe'}")
    && calendarSubscriptions.includes('data-calendar-subscription-local-cancel="true"'),
);

const ownerStates = new Map<string, { state: 'safe' | 'dirty'; revision: number }>();
const unregisters = PWA_RELOAD_SAFETY_OWNER_IDS.map(ownerId => registerPwaReloadSafetyOwner({
  ownerId,
  getSnapshot: () => {
    const state = ownerStates.get(ownerId) ?? { state: 'safe' as const, revision: 1 };
    return { ownerId, state: state.state, reasonCodes: state.state === 'dirty' ? ['FORM_DRAFT_UNSAVED' as const] : [], revision: state.revision };
  },
  prepareForReload: async () => {
    const state = ownerStates.get(ownerId) ?? { state: 'safe' as const, revision: 1 };
    state.state = 'safe';
    state.revision += 1;
    ownerStates.set(ownerId, state);
    return { ok: true as const, revision: state.revision };
  },
}));
(['version-shell', 'auth-shell', 'active-view'] as const).forEach(scope => setPwaReloadReadiness(scope, `dev097-${scope}`, true));
assert(
  'readiness completion converges the aggregate state before a boundary request',
  getPwaReloadSafetySnapshot().state === 'safe' && getPwaReloadSafetySnapshot().code === null,
  { snapshot: getPwaReloadSafetySnapshot() },
);

const safeGate = await requestPwaReloadBoundary('app-open', 'home');
assert('all readiness and registered owners produce safe app-open gate', safeGate.ok && getPwaReloadSafetySnapshot().state === 'safe', { safeGate, snapshot: getPwaReloadSafetySnapshot() });

ownerStates.set('record-draft', { state: 'dirty', revision: 2 });
const dirtyGate = await requestPwaReloadBoundary('app-open', 'home');
assert('dirty owner blocks automatic boundary without navigation', !dirtyGate.ok && dirtyGate.code === 'OWNER_ACTION_REQUIRED' && dirtyGate.localState === 'dirty', { dirtyGate, snapshot: getPwaReloadSafetySnapshot() });

const preparedGate = await requestPwaReloadBoundary('user-confirmed', 'home');
assert('user-confirmed boundary prepares dirty owner and rechecks it', preparedGate.ok && getPwaReloadSafetySnapshot().state === 'safe', { preparedGate, snapshot: getPwaReloadSafetySnapshot() });

const revisionOwner = unregisters[0];
revisionOwner();
const currentRevision = { value: 2 };
registerPwaReloadSafetyOwner({
  ownerId: PWA_RELOAD_SAFETY_OWNER_IDS[0],
  getSnapshot: () => ({ ownerId: PWA_RELOAD_SAFETY_OWNER_IDS[0], state: 'safe', reasonCodes: [], revision: currentRevision.value }),
  prepareForReload: async () => ({ ok: true as const, revision: currentRevision.value }),
});
await requestPwaReloadBoundary('app-open', 'home');
currentRevision.value = 1;
const revisionGate = await requestPwaReloadBoundary('app-open', 'home');
assert('revision regression fails closed as owner signal fault', !revisionGate.ok && revisionGate.code === 'OWNER_SIGNAL_FAULT', { revisionGate });

unregisters.slice(1).forEach(unregister => unregister());

const failedResults = results.filter(result => !result.ok);
const output = {
  devId: 'DEV-097',
  generatedAt: new Date().toISOString(),
  sourceRevision: process.env.GITHUB_SHA || 'working-tree',
  command: 'npm.cmd run verify:dev-097-pwa-safe-reload',
  fixture: 'typed owner registry + readiness + local boundary state machine',
  ok: failedResults.length === 0,
  summary: { pass: results.length - failedResults.length, fail: failedResults.length },
  results,
};
mkdirSync(resolve('output/qa/dev-097'), { recursive: true });
writeFileSync(resolve('output/qa/dev-097/static-result.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
if (failedResults.length > 0) process.exit(1);
