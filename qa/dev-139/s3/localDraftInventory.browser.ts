import { inspectLocalDrafts, type LocalInventoryPorts } from '../../../src/features/originSwitch/localDraftInventory';
import { draftIssue } from '../../../src/features/originSwitch/guide';
import { QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, QUICK_LOCAL_DRAFT } from '../../../src/features/quickTaskCapture/model';

const checks: string[] = [];
function check(name: string, condition: boolean) {
  if (!condition) throw new Error(name);
  checks.push(name);
  console.log('PASS ' + name);
}
const scope = { accountId: 'account-A', entry: 'main' as const };
let activity = { current: true, editing: false, online: true, revision: 'A:1' };
const ports: LocalInventoryPorts = { activity: () => ({ ...activity }) };
const read = (extra: Partial<LocalInventoryPorts> = {}) => inspectLocalDrafts(scope, { ...ports, ...extra });
const put = async (name: string, store: string, value: object, version = 1) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => {
      const names = name === 'projed-dev123-meeting-audio' ? ['segments', 'pointers']
        : name === QUICK_CAPTURE_DB ? [QUICK_CAPTURE_STORE, 'auth_context'] : [store];
      for (const item of names) {
        const keyPath = item === QUICK_CAPTURE_STORE ? 'captureId' : item === 'meeting-drafts' ? 'scopeKey' : 'key';
        r.result.createObjectStore(item, { keyPath });
      }
    };
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
};
const clear = async () => {
  sessionStorage.clear();
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('test cleanup blocked: ' + name));
    });
  }
};
const capture = (extra: object = {}) => ({ key: 'capture-1', schemaVersion: 1, captureId: 'capture-1',
  accountId: scope.accountId, title: 'private draft', state: 'pending', attemptCount: 0,
  lastErrorCode: null, ...extra });
const meeting = { schemaVersion: 2, scopeKey: 'account-A:workspace:board:meeting', ownerUserId: scope.accountId,
  workspaceId: 'workspace', boardId: 'board', draftId: 'meeting', savedAt: 1, localSignature: 'private old text' };

export async function runInventoryChecks() {
  await clear();
  check('empty-device-is-clean-without-creating-databases', draftIssue(await read()) === null && (await indexedDB.databases()).length === 0);
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ accountId: 'account-B' }), 2);
  check('other-account-does-not-leak-content-or-counts', draftIssue(await read()) === null);
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ accountId: null }), 2);
  check('unbound-needs-explicit-claim', (await read()).unbound === 1);
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'failed_permanent', lastErrorCode: QUICK_LOCAL_DRAFT,
    localDraft: { revision: 1, projectRef: 'legacy-source' } }), 2);
  check('existing-quick-editable-draft-is-not-cloud-saved', draftIssue(await read()) === 'drafts');
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'failed_retryable', attemptCount: 1 }), 2);
  check('interrupted-submit-needs-same-key-readback', draftIssue(await read()) === 'unknown');
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'failed_permanent', lastErrorCode: 'IDEMPOTENCY_CONFLICT' }), 2);
  check('conflict-does-not-become-a-resend', draftIssue(await read()) === 'conflict');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('private draft'))),
    b => b.toString(16).padStart(2, '0')).join('');
  const receipt = { status: 'committed', captureId: 'capture-1', ownerId: scope.accountId,
    titleHash: hash, created: false, committedAt: 10 };
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'synced', receipt: { ...receipt, privateText: 'do not forward' } }), 2);
  check('local-synced-flag-alone-is-not-proof', draftIssue(await read()) === 'unknown');
  let queried = '';
  check('authoritative-exact-receipt-can-confirm-synced-copy', draftIssue(await read({ verifyQuickReceipt: async input => {
    queried = JSON.stringify(input); return true;
  } })) === null && queried === JSON.stringify(receipt) && !queried.includes('private draft'));
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'synced', receipt: { ...receipt, titleHash: 'a'.repeat(64) } }), 2);
  let calls = 0;
  check('receipt-for-different-content-is-not-accepted', draftIssue(await read({ verifyQuickReceipt: async () => { calls++; return true; } })) === 'unknown' && calls === 0);
  await clear();
  await put('projed-task-detail-drafts-v1', 'drafts', { key: 'note', schemaVersion: 1, accountId: scope.accountId,
    workspaceId: 'workspace', boardId: 'board', taskId: 'task', unknown: true });
  check('main-unknown-note-blocks-but-quick-stays-independent', draftIssue(await read()) === 'unknown'
    && draftIssue(await inspectLocalDrafts({ ...scope, entry: 'quick' }, ports)) === null);
  await clear();
  await put('projed-draft-recovery', 'meeting-drafts', { key: meeting.scopeKey, ...meeting });
  sessionStorage.setItem('projed:meeting-draft-recovery:v1:' + meeting.scopeKey, JSON.stringify(meeting));
  const before = sessionStorage.getItem('projed:meeting-draft-recovery:v1:' + meeting.scopeKey);
  check('old-idb-and-session-meeting-copy-is-retained-and-counted-once', (await read()).pending === 1
    && sessionStorage.getItem('projed:meeting-draft-recovery:v1:' + meeting.scopeKey) === before);
  await clear();
  sessionStorage.setItem('projed:meeting-draft-recovery:v1:account-A:broken', '{broken');
  check('malformed-emergency-copy-is-not-empty', !(await read()).complete);
  await clear();
  await put('projed-dev123-meeting-audio', 'segments', { key: 'audio-1', scope: { accountId: scope.accountId }, blob: new Blob(['private audio']) });
  check('local-audio-is-not-forgotten', (await read()).pending === 1);
  activity.editing = true;
  check('live-editor-blocks-departure', draftIssue(await read()) === 'editing');
  activity.editing = false; activity.current = false;
  check('expired-or-switched-session-does-not-produce-complete-inventory', !(await read()).complete);
  activity.current = true;
  await clear(); activity.online = false;
  check('offline-empty-inventory-does-not-enable-departure', draftIssue(await read()) === 'offline');
  activity.online = true;
  check('missing-session-storage-does-not-imply-no-draft', !(await inspectLocalDrafts(scope, ports, indexedDB, null)).complete);
  const unavailable = { databases: async () => { throw new Error('denied'); } } as unknown as IDBFactory;
  check('storage-unavailable-is-not-empty', !(await inspectLocalDrafts(scope, ports, unavailable)).complete);
  await put('projed-task-detail-drafts-v1', 'drafts', { key: 'invalid', accountId: scope.accountId, schemaVersion: 99 });
  check('unsupported-owned-draft-format-is-not-ignored', !(await read()).complete);
  await clear();
  await put(QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, capture({ state: 'synced', receipt }), 2);
  check('late-receipt-after-account-change-is-rejected', !(await read({ verifyQuickReceipt: async () => {
    activity = { ...activity, current: false, revision: 'B:2' }; return true;
  } })).complete);
  activity = { current: true, online: true, editing: false, revision: 'A:3' };
  check('same-account-editor-revision-change-invalidates-readback', !(await read({ verifyQuickReceipt: async () => {
    activity.revision = 'A:4'; return true;
  } })).complete);
  await put('projed-task-detail-drafts-v1', 'drafts', { key: 'note', schemaVersion: 1, accountId: scope.accountId,
    workspaceId: 'workspace', boardId: 'board', taskId: 'task', unknown: false });
  await put('projed-draft-recovery', 'meeting-drafts', { key: meeting.scopeKey, ...meeting });
  await put('projed-dev123-meeting-audio', 'pointers', { key: 'pointer-1', scope: { accountId: scope.accountId } });
  const beforeRead = await snapshot();
  await read({ verifyQuickReceipt: async () => true });
  check('inspection-does-not-mutate-any-existing-store', beforeRead === await snapshot());
  await clear();
  return { status: 'PASS', checks, environment: 'isolated-headless-edge-real-indexeddb', production: 'NOT_RUN' };
}

async function snapshot() {
  const values: unknown[] = [];
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); });
    try {
      for (const store of db.objectStoreNames) {
        const rows = await new Promise<unknown[]>(resolve => {
          const tx = db.transaction(store, 'readonly'); const r = tx.objectStore(store).getAll();
          tx.oncomplete = () => resolve(r.result);
        });
        values.push([name, db.version, store, rows]);
      }
    } finally { db.close(); }
  }
  return JSON.stringify(values);
}
