import type { MeetingDraftRecoverySnapshot } from '../types';

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

export const getMeetingDraftRecoveryScopeKey = (ownerUserId: string, workspaceId: string, boardId: string, draftId: string) =>
  [ownerUserId, workspaceId, boardId, draftId].map(value => encodeURIComponent(value)).join(':');

export const getMeetingDraftRecoverySessionKey = (scopeKey: string) =>
  `${MEETING_DRAFT_RECOVERY_SESSION_PREFIX}${scopeKey}`;

const canUseBrowserStorage = () => typeof window !== 'undefined';

const isValidSnapshot = (value: unknown): value is MeetingDraftRecoverySnapshot => {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<MeetingDraftRecoverySnapshot>;
  return snapshot.schemaVersion === 1
    && typeof snapshot.scopeKey === 'string'
    && typeof snapshot.ownerUserId === 'string'
    && typeof snapshot.workspaceId === 'string'
    && typeof snapshot.boardId === 'string'
    && typeof snapshot.draftId === 'string'
    && typeof snapshot.savedAt === 'number'
    && typeof snapshot.localSignature === 'string'
    && snapshot.draft?.type === 'meeting'
    && Array.isArray(snapshot.meetingActivities)
    && Array.isArray(snapshot.appendedMeetingActivityIds);
};

const readSessionSnapshot = (scopeKey: string): MeetingDraftRecoverySnapshot | null => {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = sessionStorage.getItem(getMeetingDraftRecoverySessionKey(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSnapshot(parsed)) return null;
    if (parsed.savedAt < Date.now() - MEETING_DRAFT_RECOVERY_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveEmergencyMeetingDraftSnapshot = (snapshot: MeetingDraftRecoverySnapshot): boolean => {
  if (!canUseBrowserStorage()) return false;
  try {
    sessionStorage.setItem(getMeetingDraftRecoverySessionKey(snapshot.scopeKey), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
};

const openRecoveryDatabase = (): Promise<IDBDatabase | null> => {
  if (!canUseBrowserStorage() || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(
        MEETING_DRAFT_RECOVERY_DB_NAME,
        MEETING_DRAFT_RECOVERY_DB_VERSION,
      );
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MEETING_DRAFT_RECOVERY_STORE_NAME)) {
          database.createObjectStore(MEETING_DRAFT_RECOVERY_STORE_NAME, { keyPath: 'scopeKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const withStore = async <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
  const database = await openRecoveryDatabase();
  if (!database) return null;
  return new Promise(resolve => {
    try {
      const transaction = database.transaction(MEETING_DRAFT_RECOVERY_STORE_NAME, mode);
      const request = callback(transaction.objectStore(MEETING_DRAFT_RECOVERY_STORE_NAME));
      request.onsuccess = () => {
        database.close();
        resolve(request.result ?? null);
      };
      request.onerror = () => {
        database.close();
        resolve(null);
      };
      transaction.onabort = () => {
        database.close();
        resolve(null);
      };
    } catch {
      database.close();
      resolve(null);
    }
  });
};

export const saveMeetingDraftSnapshot = async (snapshot: MeetingDraftRecoverySnapshot) => {
  const sessionStorageSaved = saveEmergencyMeetingDraftSnapshot(snapshot);
  const indexedDbSaved = Boolean(await withStore('readwrite', store => store.put(snapshot)));
  return {
    indexedDbSaved,
    sessionStorageSaved,
    status: indexedDbSaved && sessionStorageSaved ? 'saved' as const : indexedDbSaved || sessionStorageSaved ? 'degraded' as const : 'error' as const,
  };
};

export const loadMeetingDraftSnapshot = async (scopeKey: string): Promise<MeetingDraftRecoverySnapshot | null> => {
  const indexedDbSnapshot = await withStore<MeetingDraftRecoverySnapshot | undefined>('readonly', store => store.get(scopeKey));
  const candidates = [indexedDbSnapshot, readSessionSnapshot(scopeKey)]
    .filter((snapshot): snapshot is MeetingDraftRecoverySnapshot => isValidSnapshot(snapshot))
    .filter(snapshot => snapshot.savedAt >= Date.now() - MEETING_DRAFT_RECOVERY_TTL_MS);
  return candidates.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
};

export const loadLatestMeetingDraftSnapshot = async (scopePrefix: string): Promise<MeetingDraftRecoverySnapshot | null> => {
  const indexedDbSnapshots = await withStore<MeetingDraftRecoverySnapshot[]>('readonly', store => store.getAll());
  const sessionSnapshots: MeetingDraftRecoverySnapshot[] = [];
  if (canUseBrowserStorage()) {
    try {
      Object.keys(sessionStorage)
        .filter(key => key.startsWith(getMeetingDraftRecoverySessionKey(scopePrefix)))
        .forEach(key => {
          const raw = sessionStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (isValidSnapshot(parsed)) sessionSnapshots.push(parsed);
        });
    } catch {
      // Ignore malformed or inaccessible session storage.
    }
  }
  const candidates = [
    ...(indexedDbSnapshots ?? []).filter(isValidSnapshot),
    ...sessionSnapshots,
  ].filter(snapshot => snapshot.scopeKey.startsWith(scopePrefix))
    .filter(snapshot => snapshot.savedAt >= Date.now() - MEETING_DRAFT_RECOVERY_TTL_MS);
  return candidates.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
};

export const clearMeetingDraftSnapshot = async (scopeKey: string): Promise<void> => {
  if (canUseBrowserStorage()) {
    try {
      sessionStorage.removeItem(getMeetingDraftRecoverySessionKey(scopeKey));
    } catch {
      // Ignore storage cleanup failure.
    }
  }
  await withStore('readwrite', store => store.delete(scopeKey));
};

export const clearMeetingDraftRecoveryForUser = async (ownerUserId: string): Promise<void> => {
  if (canUseBrowserStorage()) {
    const prefix = `${MEETING_DRAFT_RECOVERY_SESSION_PREFIX}${encodeURIComponent(ownerUserId)}:`;
    try {
      Object.keys(sessionStorage)
        .filter(key => key.startsWith(prefix))
        .forEach(key => sessionStorage.removeItem(key));
    } catch {
      // Ignore storage cleanup failure.
    }
  }
  const database = await openRecoveryDatabase();
  if (!database) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = database.transaction(MEETING_DRAFT_RECOVERY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(MEETING_DRAFT_RECOVERY_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result as MeetingDraftRecoverySnapshot[])
          .filter(snapshot => snapshot.ownerUserId === ownerUserId)
          .forEach(snapshot => store.delete(snapshot.scopeKey));
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        resolve();
      };
    } catch {
      database.close();
      resolve();
    }
  });
};
