import type { MeetingDraftRecoverySnapshot, MeetingDraftRecoverySnapshotV2 } from '../types';

export const MEETING_DRAFT_RECOVERY_DB_NAME = 'projed-draft-recovery';
export const MEETING_DRAFT_RECOVERY_STORE_NAME = 'meeting-drafts';
export const MEETING_DRAFT_RECOVERY_DB_VERSION = 1;
export const MEETING_DRAFT_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MEETING_DRAFT_RECOVERY_SESSION_PREFIX = 'projed:meeting-draft-recovery:v1:';

export type MeetingDraftCheckpointErrorKind = 'conflict' | 'unauthorized' | 'oversize' | 'offline' | 'transient';

export class MeetingDraftCheckpointError extends Error {
  readonly kind: MeetingDraftCheckpointErrorKind;

  constructor(kind: MeetingDraftCheckpointErrorKind, message: string) {
    super(message);
    this.name = 'MeetingDraftCheckpointError';
    this.kind = kind;
  }
}

export type MeetingDraftRecoverySaveResult = {
  indexedDbSaved: boolean;
  sessionStorageSaved: boolean;
  status: 'saved' | 'degraded' | 'error';
};

export const getMeetingDraftRecoveryScopeKey = (ownerUserId: string, workspaceId: string, boardId: string, draftId: string) =>
  [ownerUserId, workspaceId, boardId, draftId].map(value => encodeURIComponent(value)).join(':');

export const getMeetingDraftRecoverySessionKey = (scopeKey: string) =>
  `${MEETING_DRAFT_RECOVERY_SESSION_PREFIX}${scopeKey}`;

const canUseBrowserStorage = () => typeof window !== 'undefined';

const isValidSnapshot = (value: unknown): value is MeetingDraftRecoverySnapshot => {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<MeetingDraftRecoverySnapshot>;
  return (snapshot.schemaVersion === 1 || snapshot.schemaVersion === 2)
    && typeof snapshot.scopeKey === 'string'
    && typeof snapshot.ownerUserId === 'string'
    && typeof snapshot.workspaceId === 'string'
    && typeof snapshot.boardId === 'string'
    && typeof snapshot.draftId === 'string'
    && typeof snapshot.savedAt === 'number'
    && Number.isFinite(snapshot.savedAt)
    && typeof snapshot.localSignature === 'string'
    && snapshot.draft?.type === 'meeting'
    && Array.isArray(snapshot.meetingActivities)
    && Array.isArray(snapshot.appendedMeetingActivityIds)
    && (snapshot.schemaVersion === 1 || (
      typeof snapshot.writeSequence === 'number'
      && Number.isFinite(snapshot.writeSequence)
      && (typeof snapshot.canonicalBaselineSignature === 'string' || snapshot.canonicalBaselineSignature === null)
    ));
};

export const normalizeMeetingDraftRecoverySnapshot = (snapshot: MeetingDraftRecoverySnapshot): MeetingDraftRecoverySnapshotV2 => ({
  ...snapshot,
  schemaVersion: 2,
  writeSequence: snapshot.writeSequence ?? 0,
  canonicalBaselineSignature: snapshot.canonicalBaselineSignature ?? snapshot.baselineSignature ?? null,
});

const isFreshSnapshot = (snapshot: MeetingDraftRecoverySnapshot) =>
  snapshot.savedAt >= Date.now() - MEETING_DRAFT_RECOVERY_TTL_MS;

const readSessionSnapshot = (scopeKey: string): MeetingDraftRecoverySnapshot | null => {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = sessionStorage.getItem(getMeetingDraftRecoverySessionKey(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSnapshot(parsed) || !isFreshSnapshot(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveEmergencyMeetingDraftSnapshot = (snapshot: MeetingDraftRecoverySnapshot): boolean => {
  if (!canUseBrowserStorage()) return false;
  try {
    sessionStorage.setItem(
      getMeetingDraftRecoverySessionKey(snapshot.scopeKey),
      JSON.stringify(normalizeMeetingDraftRecoverySnapshot(snapshot)),
    );
    return true;
  } catch {
    return false;
  }
};

const openRecoveryDatabase = (): Promise<IDBDatabase | null> => {
  if (!canUseBrowserStorage() || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false;
    const settle = (database: IDBDatabase | null) => {
      if (settled) {
        if (database) database.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    try {
      const request = indexedDB.open(MEETING_DRAFT_RECOVERY_DB_NAME, MEETING_DRAFT_RECOVERY_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEETING_DRAFT_RECOVERY_STORE_NAME)) {
          database.createObjectStore(MEETING_DRAFT_RECOVERY_STORE_NAME, { keyPath: 'scopeKey' });
        }
      };
      request.onsuccess = () => settle(request.result);
      request.onerror = () => settle(null);
      request.onblocked = () => settle(null);
    } catch {
      settle(null);
    }
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const database = await openRecoveryDatabase();
  if (!database) return null;
  return new Promise(resolve => {
    let settled = false;
    let requestResult: T | null = null;
    let requestFailed = false;
    const settle = (result: T | null) => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    try {
      const transaction = database.transaction(MEETING_DRAFT_RECOVERY_STORE_NAME, mode);
      const request = callback(transaction.objectStore(MEETING_DRAFT_RECOVERY_STORE_NAME));
      request.onsuccess = () => {
        requestResult = request.result ?? null;
      };
      request.onerror = () => {
        requestFailed = true;
      };
      transaction.oncomplete = () => settle(requestFailed ? null : requestResult);
      transaction.onerror = () => settle(null);
      transaction.onabort = () => settle(null);
    } catch {
      settle(null);
    }
  });
};

const withTransactionComplete = async (
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<unknown>,
): Promise<boolean | null> => {
  const database = await openRecoveryDatabase();
  if (!database) return null;
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    try {
      const transaction = database.transaction(MEETING_DRAFT_RECOVERY_STORE_NAME, mode);
      callback(transaction.objectStore(MEETING_DRAFT_RECOVERY_STORE_NAME));
      transaction.oncomplete = () => settle(true);
      transaction.onerror = () => settle(false);
      transaction.onabort = () => settle(false);
    } catch {
      settle(false);
    }
  });
};

type SaveQueue = {
  inFlight: boolean;
  pending: {
    snapshot: MeetingDraftRecoverySnapshot;
    resolves: Array<(result: MeetingDraftRecoverySaveResult) => void>;
  } | null;
  clearRequested: boolean;
  clearWaiters: Array<(result: boolean) => void>;
};

const saveQueues = new Map<string, SaveQueue>();

const getSaveQueue = (scopeKey: string) => {
  const existing = saveQueues.get(scopeKey);
  if (existing) return existing;
  const created: SaveQueue = { inFlight: false, pending: null, clearRequested: false, clearWaiters: [] };
  saveQueues.set(scopeKey, created);
  return created;
};

const saveSnapshotOnce = async (snapshot: MeetingDraftRecoverySnapshot): Promise<MeetingDraftRecoverySaveResult> => {
  const normalized = normalizeMeetingDraftRecoverySnapshot(snapshot);
  const sessionStorageSaved = saveEmergencyMeetingDraftSnapshot(normalized);
  const indexedDbKey = await withStore<string>('readwrite', store => store.put(normalized) as IDBRequest<string>);
  const indexedDbSaved = indexedDbKey === normalized.scopeKey;
  return {
    indexedDbSaved,
    sessionStorageSaved,
    status: indexedDbSaved && sessionStorageSaved ? 'saved' : indexedDbSaved || sessionStorageSaved ? 'degraded' : 'error',
  };
};

const drainSaveQueue = async (scopeKey: string, queue: SaveQueue) => {
  if (queue.inFlight) return;
  if (queue.clearRequested) {
    queue.inFlight = true;
    queue.pending = null;
    const deleted = await withTransactionComplete('readwrite', store => store.delete(scopeKey) as IDBRequest<unknown>);
    let sessionRemoved = !canUseBrowserStorage();
    if (canUseBrowserStorage() && (deleted === true || deleted === null)) {
      try {
        const sessionKey = getMeetingDraftRecoverySessionKey(scopeKey);
        const hadSessionSnapshot = sessionStorage.getItem(sessionKey) !== null;
        sessionStorage.removeItem(sessionKey);
        sessionRemoved = !hadSessionSnapshot || sessionStorage.getItem(sessionKey) === null;
      } catch {
        sessionRemoved = false;
      }
    }
    const acknowledged = ((deleted === true || deleted === null) && sessionRemoved);
    queue.inFlight = false;
    queue.clearRequested = false;
    const waiters = queue.clearWaiters.splice(0);
    waiters.forEach(resolve => resolve(acknowledged));
    if (!queue.pending && queue.clearWaiters.length === 0) saveQueues.delete(scopeKey);
    if (queue.pending) void drainSaveQueue(scopeKey, queue);
    return;
  }
  const next = queue.pending;
  if (!next) return;
  queue.pending = null;
  queue.inFlight = true;
  const result = await saveSnapshotOnce(next.snapshot);
  queue.inFlight = false;
  next.resolves.forEach(resolve => resolve(result));
  void drainSaveQueue(scopeKey, queue);
};

export const saveMeetingDraftSnapshot = (snapshot: MeetingDraftRecoverySnapshot): Promise<MeetingDraftRecoverySaveResult> => {
  const queue = getSaveQueue(snapshot.scopeKey);
  return new Promise(resolve => {
    const normalized = normalizeMeetingDraftRecoverySnapshot(snapshot);
    if (queue.pending) {
      queue.pending.snapshot = normalized;
      queue.pending.resolves.push(resolve);
    } else {
      queue.pending = { snapshot: normalized, resolves: [resolve] };
    }
    void drainSaveQueue(snapshot.scopeKey, queue);
  });
};

export const loadMeetingDraftSnapshot = async (scopeKey: string): Promise<MeetingDraftRecoverySnapshot | null> => {
  const indexedDbSnapshot = await withStore<MeetingDraftRecoverySnapshot | undefined>('readonly', store => store.get(scopeKey));
  const candidates = [indexedDbSnapshot, readSessionSnapshot(scopeKey)]
    .filter((snapshot): snapshot is MeetingDraftRecoverySnapshot => Boolean(snapshot) && isValidSnapshot(snapshot))
    .filter(isFreshSnapshot);
  return candidates
    .sort((a, b) => (b.writeSequence ?? 0) - (a.writeSequence ?? 0) || b.savedAt - a.savedAt)[0] ?? null;
};

export type MeetingDraftRecoveryLoadSource = 'indexeddb' | 'session';

export const loadLatestMeetingDraftSnapshotWithSource = async (scopePrefix: string): Promise<{
  snapshot: MeetingDraftRecoverySnapshot;
  source: MeetingDraftRecoveryLoadSource;
} | null> => {
  const indexedDbSnapshots = await withStore<MeetingDraftRecoverySnapshot[]>('readonly', store => store.getAll());
  const candidates: Array<{ snapshot: MeetingDraftRecoverySnapshot; source: MeetingDraftRecoveryLoadSource }> =
    (indexedDbSnapshots ?? []).filter(isValidSnapshot).map(snapshot => ({ snapshot, source: 'indexeddb' as const }));
  if (canUseBrowserStorage()) {
    try {
      Object.keys(sessionStorage)
        .filter(key => key.startsWith(getMeetingDraftRecoverySessionKey(scopePrefix)))
        .forEach(key => {
          const raw = sessionStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (isValidSnapshot(parsed)) candidates.push({ snapshot: parsed, source: 'session' });
        });
    } catch {
      // Ignore malformed or inaccessible session storage.
    }
  }
  return candidates
    .filter(candidate => candidate.snapshot.scopeKey.startsWith(scopePrefix) && isFreshSnapshot(candidate.snapshot))
    .sort((a, b) => (b.snapshot.writeSequence ?? 0) - (a.snapshot.writeSequence ?? 0) || b.snapshot.savedAt - a.snapshot.savedAt)[0] ?? null;
};

export const loadLatestMeetingDraftSnapshot = async (scopePrefix: string): Promise<MeetingDraftRecoverySnapshot | null> =>
  (await loadLatestMeetingDraftSnapshotWithSource(scopePrefix))?.snapshot ?? null;

export const clearMeetingDraftSnapshot = (scopeKey: string): Promise<boolean> => {
  const queue = getSaveQueue(scopeKey);
  queue.pending = null;
  queue.clearRequested = true;
  return new Promise(resolve => {
    queue.clearWaiters.push(resolve);
    void drainSaveQueue(scopeKey, queue);
  });
};

export const clearMeetingDraftRecoveryForUser = async (ownerUserId: string): Promise<boolean> => {
  if (canUseBrowserStorage()) {
    const prefix = `${MEETING_DRAFT_RECOVERY_SESSION_PREFIX}${encodeURIComponent(ownerUserId)}:`;
    try {
      Object.keys(sessionStorage)
        .filter(key => key.startsWith(prefix))
        .forEach(key => sessionStorage.removeItem(key));
    } catch {
      return false;
    }
  }
  const database = await openRecoveryDatabase();
  if (!database) return false;
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    try {
      const transaction = database.transaction(MEETING_DRAFT_RECOVERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(MEETING_DRAFT_RECOVERY_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result as MeetingDraftRecoverySnapshot[])
          .filter(snapshot => snapshot.ownerUserId === ownerUserId)
          .forEach(snapshot => store.delete(snapshot.scopeKey));
      };
      transaction.oncomplete = () => settle(true);
      transaction.onerror = () => settle(false);
      transaction.onabort = () => settle(false);
    } catch {
      settle(false);
    }
  });
};
