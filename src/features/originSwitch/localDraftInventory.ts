import { QUICK_CAPTURE_DB, QUICK_CAPTURE_STORE, isQuickCaptureReceipt, isQuickLocalDraft,
  isQuickCaptureWritePaused, type QuickCaptureRecord, type QuickCaptureReceipt } from '../quickTaskCapture/model';
import type { DraftInspection, GuideEntry } from './guide';

export interface LocalInventoryScope {
  accountId: string;
  entry: GuideEntry;
}
export interface LocalInventoryPorts {
  /** Must fence account/session changes and include unsaved editors/in-flight writes. */
  activity(): { current: boolean; editing: boolean; online: boolean; revision: string };
  /** Authoritative same-key readback, never the local `synced` flag alone. */
  readQuickReceipt?(captureId: string): Promise<QuickCaptureReceipt | null>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Reads existing stores without creating/upgrading databases, claiming drafts,
 * starting sync, expiring old entries or returning private content to the guide.
 * This is an inventory, not a transfer or proof of destination readiness. */
export async function inspectLocalDrafts(scope: LocalInventoryScope, ports: LocalInventoryPorts,
  factory: IDBFactory = indexedDB, sessions: Storage | null = sessionStorage): Promise<DraftInspection> {
  const result: DraftInspection = { complete: false, online: false, editing: false,
    pending: 0, unknown: 0, conflicts: 0, unbound: 0 };
  const before = ports.activity();
  if (!text(scope.accountId) || !['main', 'quick'].includes(scope.entry) || !before.current) return result;
  result.online = before.online;
  result.editing = before.editing;
  const receipts: Array<{ captureId: string; receipt?: QuickCaptureReceipt; title: string }> = [];
  const meetingKeys = new Set<string>();
  let valid = true;

  const quick = (value: unknown) => {
    if (!record(value)) { valid = false; return; }
    if (value.accountId !== scope.accountId && value.accountId !== null) {
      if (!text(value.accountId)) valid = false;
      return;
    }
    if (value.schemaVersion !== 1 || !text(value.captureId) || typeof value.title !== 'string') {
      valid = false; return;
    }
    if (value.accountId === null) { result.unbound++; return; }
    const capture = value as QuickCaptureRecord;
    if (isQuickLocalDraft(capture)) { result.pending++; return; }
    if (capture.state === 'synced') {
      if (isQuickCaptureReceipt(capture.receipt, capture)) {
        const { status, captureId, ownerId, titleHash, created, committedAt } = capture.receipt;
        receipts.push({ captureId, receipt: { status, captureId, ownerId, titleHash, created, committedAt }, title: capture.title });
      }
      else result.unknown++;
    } else if (capture.lastErrorCode?.includes('CONFLICT')) result.conflicts++;
    else if (capture.state === 'syncing' || (capture.attemptCount > 0 && !isQuickCaptureWritePaused(capture))) {
      receipts.push({ captureId: capture.captureId, title: capture.title });
    }
    else if (['awaiting_auth', 'pending', 'failed_auth', 'failed_retryable', 'failed_permanent'].includes(capture.state)) result.pending++;
    else valid = false;
  };
  const task = (value: unknown) => {
    if (!record(value) || !text(value.accountId)) { valid = false; return; }
    if (value.accountId !== scope.accountId) return;
    if (value.schemaVersion !== 1 || !text(value.key) || !text(value.taskId)
      || !text(value.workspaceId) || !text(value.boardId) || typeof value.unknown !== 'boolean') { valid = false; return; }
    if (value.unknown) result.unknown++;
    else result.pending++;
  };
  const meeting = (value: unknown) => {
    if (!record(value) || !text(value.ownerUserId)) { valid = false; return; }
    if (value.ownerUserId !== scope.accountId) return;
    if (![1, 2].includes(Number(value.schemaVersion)) || !text(value.scopeKey) || !text(value.draftId)
      || !text(value.workspaceId) || !text(value.boardId)) { valid = false; return; }
    const expectedKey = [scope.accountId, value.workspaceId, value.boardId, value.draftId].map(encodeURIComponent).join(':');
    if (value.scopeKey !== expectedKey) { valid = false; return; }
    // Both copies block departure; age is never permission to discard unsent text.
    meetingKeys.add(value.scopeKey);
  };
  const audio = (value: unknown) => {
    if (!record(value) || !record(value.scope) || !text(value.scope.accountId)) { valid = false; return; }
    if (value.scope.accountId === scope.accountId) result.pending++;
  };
  try {
    const names = new Set((await factory.databases()).map(item => item.name));
    const stores: Array<[string, string[], (value: unknown) => void]> = [
      [QUICK_CAPTURE_DB, [QUICK_CAPTURE_STORE], quick],
      ...(scope.entry === 'main' ? [
        ['projed-task-detail-drafts-v1', ['drafts'], task],
        ['projed-draft-recovery', ['meeting-drafts'], meeting],
        ['projed-dev123-meeting-audio', ['segments', 'pointers'], audio],
      ] as Array<[string, string[], (value: unknown) => void]> : []),
    ];
    for (const [name, storeNames, visit] of stores) {
      if (names.has(name)) await readExistingStores(factory, name, storeNames, visit);
    }
    if (scope.entry === 'main') {
      if (!sessions) valid = false;
      else {
        const prefix = 'projed:meeting-draft-recovery:v1:';
        const ownerPrefix = `${prefix}${encodeURIComponent(scope.accountId)}:`;
        for (let index = 0; index < sessions.length; index++) {
          const key = sessions.key(index);
          if (!key?.startsWith(ownerPrefix)) continue;
          const value: unknown = JSON.parse(sessions.getItem(key) ?? 'null');
          if (!record(value) || value.ownerUserId !== scope.accountId || key !== prefix + value.scopeKey) valid = false;
          else meeting(value);
        }
      }
    }
    for (const { captureId, receipt, title } of receipts) {
      if (!ports.activity().current) { valid = false; break; }
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(title));
      const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
      if (receipt && hash !== receipt.titleHash) { result.unknown++; continue; }
      const remote = ports.readQuickReceipt ? await ports.readQuickReceipt(captureId) : null;
      if (!isQuickCaptureReceipt(remote, { captureId, accountId: scope.accountId, title }) || hash !== remote.titleHash
        || (receipt && remote.committedAt !== receipt.committedAt)) result.unknown++;
    }
    result.pending += meetingKeys.size;
    const after = ports.activity();
    result.editing ||= after.editing;
    result.online = after.online;
    result.complete = valid && after.current && before.revision === after.revision;
  } catch {
    // Storage, parsing and readback failures never become an empty/saved result.
    result.complete = false;
  }
  return result;
}

function readExistingStores(factory: IDBFactory, name: string, stores: string[], visit: (value: unknown) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined;
    let tx: IDBTransaction | undefined;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) { try { tx?.abort(); } catch { /* Already terminal. */ } }
      db?.close();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('INVENTORY_STORAGE_TIMEOUT')), 3000);
    let request: IDBOpenDBRequest;
    try { request = factory.open(name); }
    catch { finish(new Error('INVENTORY_STORAGE_UNAVAILABLE')); return; }
    request.onupgradeneeded = () => {
      request.transaction?.abort(); // Deleted between enumeration and open: do not recreate.
      finish(new Error('INVENTORY_STORAGE_CHANGED'));
    };
    request.onblocked = () => finish(new Error('INVENTORY_STORAGE_BLOCKED'));
    request.onerror = () => finish(new Error('INVENTORY_STORAGE_UNAVAILABLE'));
    request.onsuccess = () => {
      db = request.result;
      if (finished) { db.close(); return; }
      db.onversionchange = () => finish(new Error('INVENTORY_STORAGE_CHANGED'));
      try {
        tx = db.transaction(stores, 'readonly');
        tx.oncomplete = () => finish();
        tx.onabort = tx.onerror = () => finish(new Error('INVENTORY_STORAGE_UNAVAILABLE'));
        for (const store of stores) {
          const cursor = tx.objectStore(store).openCursor();
          cursor.onsuccess = () => {
            if (finished) return;
            const item = cursor.result;
            if (!item) return;
            try { visit(item.value); item.continue(); }
            catch { finish(new Error('INVENTORY_RECORD_INVALID')); }
          };
        }
      } catch { finish(new Error('INVENTORY_STORAGE_UNAVAILABLE')); }
    };
  });
}
