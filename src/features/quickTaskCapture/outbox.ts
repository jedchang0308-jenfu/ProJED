import {
  QUICK_CAPTURE_DB,
  QUICK_CAPTURE_LEASE_MS,
  QUICK_CAPTURE_MAX_AUTOMATIC_ATTEMPTS,
  QUICK_CAPTURE_RETENTION_MS,
  QUICK_CAPTURE_SCHEMA_VERSION,
  QUICK_CAPTURE_STORE,
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
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IDB_OPEN_FAILED'));
});

const transaction = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUICK_CAPTURE_STORE, mode);
    const result = action(tx.objectStore(QUICK_CAPTURE_STORE));
    let value: T | undefined;
    if (result) {
      result.onsuccess = () => { value = result.result; };
      result.onerror = () => reject(result.error ?? new Error('IDB_REQUEST_FAILED'));
    }
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_TRANSACTION_ABORTED')); };
  });
};

export const commitQuickCapture = async (record: QuickCaptureRecord) => {
  await transaction('readwrite', store => store.add(record));
  const readback = await transaction<QuickCaptureRecord | undefined>('readonly', store => store.get(record.captureId));
  if (!readback || readback.captureId !== record.captureId || readback.title !== record.title) {
    throw new Error('IDB_READBACK_FAILED');
  }
  return readback;
};

export const getQuickCapture = (captureId: string) => transaction<QuickCaptureRecord | undefined>('readonly', store => store.get(captureId));

export const listQuickCaptures = async (accountId: string | null, includeUnbound = false) => {
  const records = await transaction<QuickCaptureRecord[]>('readonly', store => store.getAll());
  return (records ?? [])
    .filter(record => includeUnbound ? (record.accountId === accountId || record.accountId === null) : record.accountId === accountId)
    .filter(record => record.state !== 'synced' || Date.now() - record.updatedAt < QUICK_CAPTURE_RETENTION_MS)
    .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt || a.captureId.localeCompare(b.captureId));
};

export const countPendingQuickCaptures = async (accountId: string | null) => (await listQuickCaptures(accountId)).filter(record => record.state !== 'synced').length;

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
      if (current.state === 'synced' || current.state === 'failed_permanent' || current.state === 'failed_auth') return;
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
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IDB_LEASE_FAILED')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IDB_LEASE_ABORTED')); };
  });
};

export const finishQuickCaptureLease = async (captureId: string, leaseId: string, state: QuickCaptureState, lastErrorCode: string | null = null) => {
  const record = await getQuickCapture(captureId);
  if (!record || record.leaseId !== leaseId) return null;
  const exhausted = state === 'failed_retryable' && record.attemptCount >= QUICK_CAPTURE_MAX_AUTOMATIC_ATTEMPTS;
  const nextState: QuickCaptureState = exhausted ? 'failed_permanent' : state;
  const nextErrorCode = exhausted ? 'AUTO_RETRY_EXHAUSTED' : lastErrorCode;
  const nextAttemptAt = nextState === 'failed_retryable'
    ? Date.now() + Math.min(15 * 60_000, 5_000 * (2 ** Math.max(0, record.attemptCount - 1)))
    : null;
  return updateQuickCapture(captureId, {
    state: nextState,
    lastErrorCode: nextErrorCode,
    nextAttemptAt,
    leaseId: null,
    leaseExpiresAt: null,
  }, leaseId);
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

export const removeExpiredQuickCaptures = async () => {
  const records = await listQuickCaptures(null, true);
  await Promise.all(records.filter(record => record.state === 'synced' && Date.now() - record.updatedAt >= QUICK_CAPTURE_RETENTION_MS).map(async record => {
    await transaction('readwrite', store => store.delete(record.captureId));
  }));
};
