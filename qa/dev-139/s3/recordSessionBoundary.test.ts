import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

async function fixture() {
  const name = `__RECORD_SESSION_${randomUUID().replaceAll('-', '')}`;
  const auth = { user: { uid: 'a', authContextId: 'session-a' } as { uid: string; authContextId: string } | null };
  const board = { activeWorkspaceId: 'ws', activeBoardId: 'board', currentView: 'board', setView: () => {} };
  const member = { currentBoardAccess: { workspaceId: 'ws', boardId: 'board', capabilities: ['read_board'] } };
  const ports = { auth: { getState: () => auth }, board: { getState: () => board }, member: { getState: () => member } };
  (globalThis as Record<string, unknown>)[name] = ports;
  const virtual: Record<string, string> = {
    useAuthStore: `export default globalThis.${name}.auth`,
    useBoardStore: `export default globalThis.${name}.board`,
    useMemberStore: `export const useMemberStore=globalThis.${name}.member`,
    useTagStore: 'export const useTagStore={getState:()=>({tags:[]})}',
    dataBackend: 'export const isHttpBackend=true,isSupabaseBackend=false,recordService={},eventLogService={}',
    meetingAnalysisService: 'export const meetingAnalysisService={}',
    meetingSynthesisService: 'export const synthesizeMeetingRecord=()=>{throw Error("UNEXPECTED_PROVIDER")}',
    meetingRecordAvailability: 'export const isMeetingRecordUnavailable=()=>false',
  };
  const root = process.cwd();
  const output = await build({ stdin: { contents: `
    export * from './src/services/httpApi/recordSessionBoundary';
    export * from './src/services/recordSessionProtection';
    export {default as records} from './src/store/useRecordStore';
    export {default as undo} from './src/store/useUndoStore';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'isolated-record-ports', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      const key = path.basename(args.path).replace(/\.ts$/u, '');
      return key in virtual ? { path: key, namespace: name } : null;
    });
    api.onLoad({ filter: /.*/, namespace: name }, args => ({ contents: virtual[args.path], loader: 'js' }));
  } }] });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`);
  return { ...mod, auth, board, member };
}

test('stable identity cleanup preserves a private draft, recovery prompt and undo', async () => {
  const f = await fixture();
  f.records.getState().openNewRecord('work_log');
  f.records.getState().updateDraft({ content: 'private unsaved text' });
  f.undo.getState().pushUndo({ label: 'private title', undo: () => {}, redo: () => {} });
  const before = f.records.getState();
  for (let i = 0; i < 3; i++) assert.equal(f.protectRecordEditorOnIdentityChange('a', 'a:session-a'), false);
  assert.equal(f.records.getState().draft, before.draft);
  assert.equal(f.records.getState().draftEditorSession, before.draftEditorSession);
  assert.equal(f.undo.getState().undoStack.length, 1);
});

test('meeting checkpoint uses the old owner before memory is cleared and only returns to an authorized old scope', async () => {
  const f = await fixture();
  f.records.getState().openNewRecord('meeting');
  f.records.getState().updateDraft({ title: 'private meeting', content: 'private pending edit', visibility: 'private' });
  const original = f.records.getState();
  const snapshot = { schemaVersion: 2, scopeKey: 'a:ws:board:draft', ownerUserId: 'a', workspaceId: 'ws', boardId: 'board',
    draftId: original.draft.id, draft: original.draft, savedAt: Date.now(), writeSequence: 9, canonicalBaselineSignature: null,
    localSignature: 'private signature', contentCursorOffset: 0, meetingActivities: [], appendedMeetingActivityIds: [] };
  let checkpoint = 0;
  f.registerRecordSessionCheckpoint({ accountId: 'a', identity: 'a:session-a', workspaceId: 'ws', boardId: 'board' }, () => {
    assert.equal(f.records.getState().draft.content, 'private pending edit');
    checkpoint++;
    return { snapshot, completion: Promise.resolve({ indexedDbSaved: true, sessionStorageSaved: true, status: 'saved' }) };
  });
  f.records.getState().setMeetingDraftRecovery({ pendingSnapshot: snapshot, conflictSnapshot: snapshot });
  f.undo.getState().pushUndo({ label: 'private undo', undo: () => {}, redo: () => {} });
  f.auth.user = { uid: 'b', authContextId: 'session-b' };
  assert.equal(f.protectRecordEditorOnIdentityChange('a', 'a:session-a'), true);
  assert.equal(checkpoint, 1);
  assert.equal(f.records.getState().draft, null);
  assert.equal(f.records.getState().isPanelOpen, false);
  assert.equal(f.records.getState().meetingDraftRecovery.pendingSnapshot, null);
  assert.equal(f.records.getState().meetingDraftRecovery.conflictSnapshot, null);
  assert.equal(f.undo.getState().undoStack.length, 0);
  assert.equal(f.restoreParkedRecordEditor(), false);
  f.auth.user = { uid: 'a', authContextId: 'session-new' };
  assert.equal(f.restoreParkedRecordEditor(), false, 'fresh server reads are required');
  f.records.setState({ recordListLoad: { status: 'ready', scopeKey: '["ws","board"]', error: null } });
  assert.equal(f.restoreParkedRecordEditor(), true);
  assert.equal(f.records.getState().draft, null, 'recovery stays opt-in');
  assert.equal(f.records.getState().meetingDraftRecovery.pendingSnapshot.draft.content, 'private pending edit');
});

test('passive work-log loss retains same-tab data without giving another account or scope access', async () => {
  const f = await fixture();
  f.records.getState().openNewRecord('work_log');
  f.records.getState().updateDraft({ content: 'owner a only', visibility: 'private' });
  f.auth.user = null;
  f.protectRecordEditorOnIdentityChange('a', 'a:session-a');
  f.records.setState({ recordListLoad: { status: 'ready', scopeKey: '["ws","board"]', error: null } });
  f.auth.user = { uid: 'b', authContextId: 'session-b' };
  assert.equal(f.restoreParkedRecordEditor(), false);
  f.auth.user = { uid: 'a', authContextId: 'session-new' };
  f.board.activeBoardId = 'other-board';
  assert.equal(f.restoreParkedRecordEditor(), false);
  f.board.activeBoardId = 'board';
  assert.equal(f.restoreParkedRecordEditor(), true);
  assert.equal(f.records.getState().draft.content, 'owner a only');
  assert.equal(f.records.getState().saving, false);
});

test('explicit logout does not checkpoint or retain an abandoned private editor', async () => {
  const f = await fixture();
  f.records.getState().openNewRecord('work_log');
  f.records.getState().updateDraft({ content: 'explicitly abandoned' });
  f.markRecordSessionLogout('a');
  f.auth.user = null;
  f.protectRecordEditorOnIdentityChange('a', 'a:session-a');
  f.cancelRecordSessionLogout('a');
  f.auth.user = { uid: 'a', authContextId: 'session-new' };
  f.records.setState({ recordListLoad: { status: 'ready', scopeKey: '["ws","board"]', error: null } });
  assert.equal(f.restoreParkedRecordEditor(), false);
  assert.equal(f.records.getState().draft, null);
});

test('an in-flight undo cannot republish the old private command after identity clear', async () => {
  const f = await fixture();
  let complete!: () => void;
  f.undo.getState().pushUndo({ label: 'old private command', undo: () => new Promise<void>(resolve => { complete = resolve; }), redo: () => {} });
  f.undo.getState().undo();
  f.auth.user = { uid: 'b', authContextId: 'session-b' };
  f.protectRecordEditorOnIdentityChange('a', 'a:session-a');
  f.undo.getState().pushUndo({ label: 'new owner command', undo: () => {}, redo: () => {} });
  complete();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(f.undo.getState().undoStack.map((entry: { label: string }) => entry.label), ['new owner command']);
  assert.equal(f.undo.getState().redoStack.length, 0);
});
