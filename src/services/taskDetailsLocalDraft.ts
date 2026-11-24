import type { TaskDetailNote, TaskNotePersistenceSnapshot, TaskNode } from '../types';
import { TASK_DETAILS_DRAFT_KEYS, taskDetailsFieldEqual, type TaskDetailsFields } from '../components/taskDetailsDraft';
import { areTaskNoteSnapshotsEqual } from '../utils/taskNotePersistence';

export type TaskDetailsDraftScope = { accountId: string; workspaceId: string; boardId: string; taskId: string };
export type TaskDetailsLocalDraft = TaskDetailsDraftScope & {
  key: string;
  schemaVersion: 1;
  savedAt: number;
  fields: { baseline: TaskDetailsFields; draft: Partial<TaskDetailsFields> };
  notes: { baseline: TaskNotePersistenceSnapshot; draft: TaskDetailNote[] | null };
  /** An interrupted request must be read back, never treated as unsent edits. */
  unknown: boolean;
  submitted: Partial<TaskNode>;
};

const DB_NAME = 'projed-task-detail-drafts-v1';
const STORE = 'drafts';
const matchesScope = (draft: TaskDetailsDraftScope, scope: TaskDetailsDraftScope) =>
  draft.accountId === scope.accountId && draft.workspaceId === scope.workspaceId
  && draft.boardId === scope.boardId && draft.taskId === scope.taskId;

const transact = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const open = indexedDB.open(DB_NAME, 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'key' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('LOCAL_DRAFT_STORAGE_BLOCKED'));
  });
  db.onversionchange = () => db.close();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('LOCAL_DRAFT_STORAGE_FAILED'));
    });
  } finally { db.close(); }
};

const matchesCanonical = (draft: TaskDetailsLocalDraft, fields: TaskDetailsFields, notes: TaskNotePersistenceSnapshot) =>
  TASK_DETAILS_DRAFT_KEYS.every(key => !(key in draft.fields.draft)
    || taskDetailsFieldEqual(key, draft.fields.draft[key], fields[key]))
  && (!draft.notes.draft || areTaskNoteSnapshotsEqual({
    detailNotes: draft.notes.draft, description: draft.notes.draft[0]?.content ?? '',
  }, notes));

export const loadTaskDetailsLocalDraft = async (
  scope: TaskDetailsDraftScope,
  fields: TaskDetailsFields,
  notes: TaskNotePersistenceSnapshot,
) => {
  const drafts = await transact<TaskDetailsLocalDraft[]>('readonly', store => store.getAll());
  return drafts.filter(draft => draft.schemaVersion === 1 && matchesScope(draft, scope)
    && (draft.unknown || !matchesCanonical(draft, fields, notes))).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
};

export const saveTaskDetailsLocalDraft = async (draft: TaskDetailsLocalDraft) => {
  await transact('readwrite', store => store.put(draft));
  const readback = await transact<TaskDetailsLocalDraft>('readonly', store => store.get(draft.key));
  // A later checkpoint by the same editor may already be durable.
  if (!readback || !matchesScope(readback, draft) || readback.savedAt < draft.savedAt) {
    throw new Error('LOCAL_DRAFT_READBACK_FAILED');
  }
};

/** Only remove drafts whose intended values are confirmed by the existing
 * canonical readback. Other tabs' distinct edits/conflicts stay on the device. */
export const clearConfirmedTaskDetailsLocalDrafts = (
  scope: TaskDetailsDraftScope,
  fields: TaskDetailsFields,
  notes: TaskNotePersistenceSnapshot,
) => transact('readwrite', store => {
  const cursor = store.openCursor();
  cursor.onsuccess = () => {
    const item = cursor.result;
    if (!item) return;
    const draft = item.value as TaskDetailsLocalDraft;
    if (draft.schemaVersion === 1 && matchesScope(draft, scope) && matchesCanonical(draft, fields, notes)) item.delete();
    item.continue();
  };
  return cursor;
});

export const discardTaskDetailsLocalDraft = (key: string, expectedSavedAt?: number) => transact('readwrite', store => {
  const request = store.get(key);
  request.onsuccess = () => {
    if (request.result && (expectedSavedAt === undefined || request.result.savedAt === expectedSavedAt)) store.delete(key);
  };
  return request;
});
