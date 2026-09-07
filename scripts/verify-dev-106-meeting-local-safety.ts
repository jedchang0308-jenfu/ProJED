import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeMeetingDraftRecoverySnapshot } from '../src/services/meetingDraftRecoveryService';
import type { MeetingDraftRecoverySnapshot } from '../src/types';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};
const read = (path: string) => readFileSync(path, 'utf8');

const v1Snapshot: MeetingDraftRecoverySnapshot = {
  schemaVersion: 1,
  scopeKey: 'owner:workspace:board:draft',
  ownerUserId: 'owner',
  workspaceId: 'workspace',
  boardId: 'board',
  draftId: 'draft',
  savedAt: Date.now(),
  localSignature: 'sig-v1',
  remoteSignature: 'legacy-remote',
  baselineSignature: 'baseline-v1',
  contentCursorOffset: 4,
  draft: {
    id: 'draft',
    type: 'meeting',
    title: '測試會議',
    content: '內容',
    status: 'draft',
    visibility: 'tenant',
    taskLinks: [],
  },
  meetingActivities: [],
  appendedMeetingActivityIds: [],
};

const normalized = normalizeMeetingDraftRecoverySnapshot(v1Snapshot);
assert('v1 snapshot normalizes to v2', normalized.schemaVersion === 2);
assert('v1 write sequence defaults to zero', normalized.writeSequence === 0);
assert('v1 baseline maps to canonical baseline', normalized.canonicalBaselineSignature === 'baseline-v1');
assert('legacy remote signature is not promoted to cloud success', normalized.remoteSignature === 'legacy-remote');

const recoveryService = read('src/services/meetingDraftRecoveryService.ts');
const recoveryHook = read('src/hooks/useMeetingDraftRecovery.ts');
const store = read('src/store/useRecordStore.ts');
const dataBackend = read('src/services/dataBackend.ts');
const supabaseBackend = read('src/services/supabase/projedService.ts');
const firestoreBackend = read('src/services/firestoreService.ts');
const localTestBackend = read('src/services/localTestService.ts');
const exitGuard = read('src/hooks/useMeetingModeExitGuard.ts');
const draftGuard = read('src/hooks/useRecordDraftGuard.ts');
const discardHook = read('src/hooks/useMeetingDraftDiscard.ts');
const sidebar = read('src/components/Records/RecordSidebar.tsx');
const workspaceSidebar = read('src/components/Sidebar.tsx');
const mainLayout = read('src/components/MainLayout.tsx');
const recordsView = read('src/components/Records/RecordsView.tsx');
const settingsView = read('src/components/SettingsView.tsx');
const browserVerifier = read('scripts/verify-dev-106-meeting-local-safety-browser.pw.js');
const meetingSaveAndExitHandler = sidebar.slice(sidebar.indexOf('const handleMeetingSaveAndExit'), sidebar.indexOf('const handleSynthesizeMeetingDraft'));

assert('transaction completion is the persistence acknowledgement', recoveryService.includes('transaction.oncomplete = () => settle(requestFailed ? null : requestResult)'));
assert('request success does not close or resolve early', !recoveryService.includes('request.onsuccess = () => {\n        database.close();\n        resolve(request.result ?? null);'));
assert('per-scope latest queue exists', recoveryService.includes('pending: {') && recoveryService.includes('resolves: Array<(result: MeetingDraftRecoverySaveResult) => void>'));
assert('clear uses a terminal barrier', recoveryService.includes('queue.clearRequested') && recoveryService.includes('withTransactionComplete'));
assert('session-only clear can acknowledge unavailable IDB', recoveryService.includes('Promise<boolean | null>') && recoveryService.includes('deleted === null'));
assert('delete abort preserves session fallback', recoveryService.includes("canUseBrowserStorage() && (deleted === true || deleted === null)"));
assert('writer emits v2 snapshot', recoveryHook.includes('schemaVersion: 2') && recoveryHook.includes('writeSequence'));
assert('hook exposes bounded force flush registry', recoveryHook.includes('registerMeetingDraftForceFlush') && recoveryHook.includes('forceFlushMeetingDraft') && recoveryHook.includes('MEETING_DRAFT_FORCE_FLUSH_TIMEOUT_MS') && recoveryHook.includes('Promise.race'));
assert('meeting recovery no longer calls cloud checkpoint', !recoveryHook.includes('recordService.checkpointDraft'));
assert('meeting recovery hook has no formal or side-effect service imports', !recoveryHook.includes('recordService') && !recoveryHook.includes('eventLogService') && !recoveryHook.includes('synthesizeMeetingRecord') && !recoveryHook.includes('useUndoStore'));
assert('formal backend checkpoint is disabled', dataBackend.includes('會議自動雲端 checkpoint 已停用'));
assert('Supabase checkpoint surface is unsupported', supabaseBackend.includes('會議雲端 checkpoint 已停用'));
assert('Firestore checkpoint surface is unsupported', firestoreBackend.includes('會議雲端 checkpoint 已停用'));
assert('local-test checkpoint surface is unsupported', localTestBackend.includes('會議雲端 checkpoint 已停用'));
assert('closePanel has no implicit recovery clear', !store.slice(store.indexOf('closePanel:'), store.indexOf('togglePanelCollapsed:')).includes('meetingDraftRecoveryClearToken + 1'));
assert('new/open record paths have no implicit recovery clear', !store.slice(store.indexOf('openNewRecord:'), store.indexOf('startMeetingRecord:')).includes('requestMeetingDraftRecoveryClear()') && !store.slice(store.indexOf('openExistingRecord:'), store.indexOf('startMeetingRecord:')).includes('requestMeetingDraftRecoveryClear()'));
assert('meeting mode exit has no direct discard path', !exitGuard.includes('exit_without_saving') && exitGuard.includes('forceFlushMeetingDraft'));
assert('cross-record meeting navigation force flushes', draftGuard.includes("draft.type === 'meeting'") && draftGuard.includes('forceFlushMeetingDraft'));
assert('workspace view transitions are guarded', workspaceSidebar.includes('useRecordDraftGuard') && workspaceSidebar.includes('void guardRecordDraft') && workspaceSidebar.includes('開啟紀錄庫會離開目前紀錄'));
assert('board switching transitions are guarded', workspaceSidebar.includes('void guardRecordDraft(switchToBoard') && workspaceSidebar.includes('切換看板會離開目前紀錄'));
assert('system-page return transition is guarded', mainLayout.includes('void guardRecordDraft(() => setView(nextView)') && mainLayout.includes('返回看板會離開目前紀錄'));
assert('records page return transition is guarded', recordsView.includes('void guardRecordDraft(() => setView(') && recordsView.includes('返回看板會離開目前紀錄'));
assert('settings page return transition is guarded', settingsView.includes('useRecordDraftGuard') && settingsView.includes('void guardRecordDraft(() => setView('));
assert('explicit delete-and-exit keeps discard isolation', discardHook.includes('刪除並離開') && discardHook.includes('clearMeetingDraftSnapshot') && discardHook.includes('resetMeetingDraftRecoveryState'));
assert('discard is an overflow action', sidebar.includes('data-meeting-draft-overflow') && sidebar.includes('data-meeting-draft-discard'));
assert('save-and-exit waits for canonical save and fails closed', sidebar.includes('data-meeting-draft-save-and-exit') && meetingSaveAndExitHandler.includes('if (isPublished)') && meetingSaveAndExitHandler.includes("await saveDraft({ nodes, status: 'draft' })") && meetingSaveAndExitHandler.includes('if (!saved)') && meetingSaveAndExitHandler.indexOf('if (!saved)') < meetingSaveAndExitHandler.lastIndexOf('closePanel()'));
assert('live meeting removes the ambiguous generic close action', sidebar.includes('{!isLiveMeeting ? (') && sidebar.includes('data-record-composer-close'));
assert('discard cancel or failure restores operation focus', sidebar.includes('meetingOverflowButtonRef') && sidebar.includes('requestAnimationFrame(() => meetingOverflowButtonRef.current?.focus())'));
assert('normal local status is intentionally quiet while warning status remains polite', !sidebar.includes('已保存在此裝置') && sidebar.includes('aria-live="polite"'));
assert('browser verifier covers entry matrix, cleanup retry and provider/action failure isolation', browserVerifier.includes("runCase('ROT-106-011'") && browserVerifier.includes('cleanupRetried: true') && browserVerifier.includes("runCase('ROT-106-010'") && browserVerifier.includes("runCase('ROT-106-012'") && browserVerifier.includes('recordActionNames') && browserVerifier.includes('originalUndoPush') && browserVerifier.includes('__DEV106_FAILURE_INJECTION_SPY__'));
assert('meeting menu names state save and exit outcomes explicitly', sidebar.includes('儲存草稿') && sidebar.includes('儲存並離開') && sidebar.includes('刪除並離開'));
assert('spec and QA define the local safety slice', read('ai-doc/specs/SPEC-106-meeting-safe-draft-lifecycle.md').includes('Local Safety Slice') && read('ai-doc/qa/QA-DEV-106-meeting-safe-draft-lifecycle.md').includes('TC-106-008'));

const artifact = {
  devId: 'DEV-106',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  command: 'npm run verify:dev-106-meeting-local-safety',
  assertionCount: checks.length,
  checks,
  failures,
  generatedAt: new Date().toISOString(),
};
const artifactPath = resolve('output/qa/dev-106-meeting-local-safety/result.json');
mkdirSync(resolve('output/qa/dev-106-meeting-local-safety'), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error('DEV-106 meeting local safety verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('DEV-106 meeting local safety verification passed: v1/v2 normalization, transaction acknowledgement, latest-write queue, safe close, explicit discard and cloud checkpoint kill switch.');
