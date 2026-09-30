import {
  QUICK_AUTH_CONTEXT_STORE,
  QUICK_CAPTURE_DB,
  QUICK_CAPTURE_LEASE_MS,
  QUICK_CAPTURE_MAX_AUTOMATIC_ATTEMPTS,
  QUICK_CAPTURE_RETENTION_MS,
  QUICK_CAPTURE_SCHEMA_VERSION,
  QUICK_CAPTURE_STORE,
  isQuickCaptureReceipt,
  type QuickAuthContext,
  type QuickCaptureReceipt,
  type QuickCaptureRecord,
  type QuickCaptureState,
} from './model';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IDB_UNAVAILABLE'));
    return;
  }
  const request = indexedDB.open(QUICK_CAPTURE_DB, QUICK_CAPTURE_SCHEMA_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    const store = db.objectStoreNames.contains(QUICK_CAPTURE_STORE)
      ? request.transaction!.objectStore(QUICK_CAPTURE_STORE)
      : db.createObjectStore(QUICK_CAPTURE_STORE, { keyPath: 'captureId' });
    if (!store.indexNames.contains('accountId')) store.createIndex('accountId', 'accountId', { unique: false });
    if (!store.indexNames.contains('state')) store.createIndex('state', 'state', { unique: false });
    if (!store.indexNames.contains('claimIntent.nonceHash')) {
      store.createIndex('claimIntent.nonceHash', 'claimIntent.nonceHash', { unique: true });
    }
    if (!db.objectStoreNames.contains(QUICK_AUTH_CONTEXT_STORE)) {
      db.createObjectStore(QUICK_AUTH_CONTEXT_STORE, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IDB_OPEN_FAILED'));
});

const transaction = async <T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let value: T | undefined;
    let failure: unknown;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
      const result = action(tx);
      if (result) {
        result.onsuccess = () => { value = result.result; };
        result.onerror = () => { failure = result.error ?? new Error('IDB_REQUEST_FAILED'); };
      }
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error('IDB_TRANSACTION_FAILED')); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('IDB_TRANSACTION_ABORTED')); };
  });
};

export const commitQuickCapture = async (
  record: QuickCaptureRecord,
  expectedContext?: number | { revision: number; projectRef: string; accountId: string },
) => {
  const expectedContextRevision = typeof expectedContext === 'number' ? expectedContext : expectedContext?.revision;
  await transaction(
    expectedContextRevision === undefined ? QUICK_CAPTURE_STORE : [QUICK_CAPTURE_STORE, QUICK_AUTH_CONTEXT_STORE],
    'readwrite',
    (tx) => {
      const captureStore = tx.objectStore(QUICK_CAPTURE_STORE);
      if (expectedContextRevision !== undefined) {
        const contextRequest = tx.objectStore(QUICK_AUTH_CONTEXT_STORE).get('current');
        contextRequest.onsuccess = () => {
          const context = contextRequest.result as QuickAuthContext | undefined;
          if (!context || !context.bindingAllowed || context.revision !== expectedContextRevision
            || context.accountId !== record.accountId
            || (typeof expectedContext !== 'number' && context.projectRef !== expectedContext?.projectRef)) {
            tx.abort();
            return;
          }
          captureStore.add(record);
        };
        contextRequest.onerror = () => tx.abort();
      } else {
        captureStore.add(record);
      }
    },
  );
  let readback: QuickCaptureRecord | undefined;
  try {
    readback = await transaction<QuickCaptureRecord | undefined>(QUICK_CAPTURE_STORE, 'readonly', tx => tx.objectStore(QUICK_CAPTURE_STORE).get(record.captureId));
  } catch {
    throw new Error('IDB_READBACK_FAILED');
  }
  if (!readback || readback.captureId !== record.captureId || readback.title !== record.title) {
    throw new Error('IDB_READBACK_FAILED');
  }
  return readback;
};

export const getQuickCapture = (captureId: string) => transaction<QuickCaptureRecord | undefined>(QUICK_CAPTURE_STORE, 'readonly', tx => tx.objectStore(QUICK_CAPTURE_STORE).get(captureId));

export const getQuickAuthContext = () => transaction<QuickAuthContext | undefined>(QUICK_AUTH_CONTEXT_STORE, 'readonly', tx => tx.objectStore(QUICK_AUTH_CONTEXT_STORE).get('current'));

export const saveQuickAuthContext = async (context: QuickAuthContext, expectedRevision?: number) => {
  await transaction(
    QUICK_AUTH_CONTEXT_STORE,
    'readwrite',
    (tx) => {
      const store = tx.objectStore(QUICK_AUTH_CONTEXT_STORE);
      const request = store.get('current');
      request.onsuccess = () => {
        const current = request.result as QuickAuthContext | undefined;
        if (expectedRevision !== undefined && current?.revision !== expectedRevision) {
          tx.abort();
          return;
        }
        store.put({ ...context, key: 'current' });
      };
      request.onerror = () => tx.abort();
    },
  );
  return context;
};

export const listQuickCaptures = async (accountId: string | null, includeUnbound = false) => {
  const records = await transaction<QuickCaptureRecord[]>(QUICK_CAPTURE_STORE, 'readonly', tx => tx.objectStore(QUICK_CAPTURE_STORE).getAll());
  return (records ?? [])
    .filter(record => includeUnbound ? (record.accountId === accountId || record.accountId === null) : record.accountId === accountId)
    .filter(record => record.state !== 'synced' || !isQuickCaptureReceipt(record.receipt, record) || Date.now() - record.updatedAt < QUICK_CAPTURE_RETENTION_MS)
    .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt || a.captureId.localeCompare(b.captureId));
};

export const countPendingQuickCaptures = async (accountId: string | null) => (await listQuickCaptures(accountId)).filter(record => record.state !== 'synced').length;

export const countAllPendingQuickCaptures = async () => {
  const records = await transaction<QuickCaptureRecord[]>(QUICK_CAPTURE_STORE, 'readonly', tx => tx.objectStore(QUICK_CAPTURE_STORE).getAll());
  return (records ?? []).filter(record => record.state !== 'synced').length;
};

export const updateQuickCapture = async (captureId: string, update: Partial<QuickCaptureRecord>, expectedLeaseId?: string | null) => {
  const db = await openDatabase();
  return new Promise<QuickCaptureRecord | null>((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, 'readwrite');
    const store = tx.objectStore(QUICK_CAPTURE_STORE);
    const request = store.get(captureId);
    let next: QuickCaptureRecord | null = null;
    request.onsuccess = () => {
      const record = request.result as QuickCaptureRecord | undefined;
      if (!record || (expectedLeaseId !== undefined && record.leaseId !== expectedLeaseId)) return;
      next = { ...record, ...update, updatedAt: Date.now() };
      store.put(next);
    };
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_ABORTED')); };
  });
};

export const acquireQuickCaptureLease = async (captureId: string, accountId: string) => {
  const db = await openDatabase();
  return new Promise<QuickCaptureRecord | null>((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, 'readwrite');
    const store = tx.objectStore(QUICK_CAPTURE_STORE);
    const request = store.get(captureId);
    let result: QuickCaptureRecord | null = null;
    request.onsuccess = () => {
      const current = request.result as QuickCaptureRecord | undefined;
      if (!current || current.accountId !== accountId) return;
      if (current.state === 'synced' || current.state === 'failed_permanent') return;
      if (current.nextAttemptAt !== null && current.nextAttemptAt > Date.now()) return;
      if (current.leaseExpiresAt && current.leaseExpiresAt > Date.now()) return;
      const leaseId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      result = {
        ...current,
        state: 'syncing',
        attemptCount: current.attemptCount + 1,
        leaseId,
        leaseExpiresAt: Date.now() + QUICK_CAPTURE_LEASE_MS,
        updatedAt: Date.now(),
      };
      store.put(result);
    };
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_LEASE_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_LEASE_ABORTED')); };
  });
};

export const finishQuickCaptureLease = async (
  captureId: string,
  leaseId: string,
  state: QuickCaptureState,
  lastErrorCode: string | null = null,
  retryAfterMs = 0,
  receipt?: QuickCaptureReceipt,
) => {
  const db = await openDatabase();
  return new Promise<QuickCaptureRecord | null>((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, 'readwrite');
    const store = tx.objectStore(QUICK_CAPTURE_STORE);
    const request = store.get(captureId);
    let next: QuickCaptureRecord | null = null;
    request.onsuccess = () => {
      const record = request.result as QuickCaptureRecord | undefined;
      if (!record || record.leaseId !== leaseId) return;
      if (state === 'synced' && (!receipt || !isQuickCaptureReceipt(receipt, { captureId, accountId: record.accountId, title: record.title }))) {
        next = { ...record, state: 'failed_permanent', lastErrorCode: 'RECEIPT_INVALID', nextAttemptAt: null, leaseId: null, leaseExpiresAt: null, updatedAt: Date.now() };
        store.put(next);
        return;
      }
      const exhausted = state === 'failed_retryable' && record.attemptCount >= QUICK_CAPTURE_MAX_AUTOMATIC_ATTEMPTS;
      const nextState: QuickCaptureState = exhausted ? 'failed_permanent' : state;
      const nextErrorCode = exhausted ? 'AUTO_RETRY_EXHAUSTED' : lastErrorCode;
      const retryAfterDelay = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
      const backoffDelay = Math.min(15 * 60_000, 5_000 * (2 ** Math.max(0, record.attemptCount - 1)));
      const nextAttemptAt = nextState === 'failed_retryable'
        ? Date.now() + Math.min(15 * 60_000, Math.max(backoffDelay, retryAfterDelay))
        : null;
      next = {
        ...record,
        state: nextState,
        lastErrorCode: nextErrorCode,
        nextAttemptAt,
        leaseId: null,
        leaseExpiresAt: null,
        receipt: nextState === 'synced' ? receipt : record.receipt ?? null,
        updatedAt: Date.now(),
      };
      store.put(next);
    };
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_ABORTED')); };
  });
};

export const retryQuickCapture = async (captureId: string, accountId: string) => {
  const record = await getQuickCapture(captureId);
  if (!record || record.accountId !== accountId) return null;
  if (record.state === 'failed_permanent' && !record.lastErrorCode?.includes('WORKSPACE')
    && record.lastErrorCode !== 'AUTO_RETRY_EXHAUSTED') return null;
  return updateQuickCapture(captureId, {
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    leaseId: null,
    leaseExpiresAt: null,
  });
};

export const bindQuickCaptureClaim = async (captureId: string, accountId: string, nonceHash: string) => {
  const db = await openDatabase();
  return new Promise<QuickCaptureRecord | null>((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, 'readwrite');
    const store = tx.objectStore(QUICK_CAPTURE_STORE);
    const request = store.get(captureId);
    let next: QuickCaptureRecord | null = null;
    request.onsuccess = () => {
      const record = request.result as QuickCaptureRecord | undefined;
      if (!record || record.accountId !== null || !record.claimIntent
        || record.claimIntent.nonceHash !== nonceHash || record.claimIntent.expiresAt < Date.now()) return;
      next = {
        ...record,
        accountId,
        state: 'pending',
        claimIntent: null,
        nextAttemptAt: null,
        updatedAt: Date.now(),
      };
      store.put(next);
    };
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
    tx.oncomplete = () => { db.close(); resolve(next); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_ABORTED')); };
  });
};

export const putClaimIntent = (captureId: string, nonceHash: string, expiresAt: number) => updateQuickCapture(captureId, {
  claimIntent: { captureId, nonceHash, expiresAt },
});

const hasMatchingReceiptHash = async (record: QuickCaptureRecord) => {
  if (!isQuickCaptureReceipt(record.receipt, record) || typeof crypto === 'undefined' || !crypto.subtle) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(record.title));
  const titleHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return titleHash === record.receipt.titleHash;
};

export const removeExpiredQuickCaptures = async (now = Date.now()) => {
  const records = await transaction<QuickCaptureRecord[]>(QUICK_CAPTURE_STORE, 'readonly', tx => tx.objectStore(QUICK_CAPTURE_STORE).getAll());
  const candidates = new Map<string, number>();
  for (const record of records ?? []) {
    if (record.state === 'synced' && Number.isFinite(record.updatedAt)
      && now - record.updatedAt >= QUICK_CAPTURE_RETENTION_MS && await hasMatchingReceiptHash(record)) {
      candidates.set(record.captureId, record.updatedAt);
    }
  }
  if (candidates.size === 0) return 0;
  const db = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, 'readwrite');
    const cursorRequest = tx.objectStore(QUICK_CAPTURE_STORE).openCursor();
    let removedCount = 0;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as QuickCaptureRecord;
      if (candidates.get(record.captureId) === record.updatedAt && record.state === 'synced'
        && isQuickCaptureReceipt(record.receipt, record)) {
        cursor.delete();
        removedCount += 1;
      }
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(removedCount); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_CLEANUP_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_CLEANUP_ABORTED')); };
  });
};
