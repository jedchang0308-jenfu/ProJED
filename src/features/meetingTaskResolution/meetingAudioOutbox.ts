import type { MeetingAudioSegmentManifest, MeetingPointerInterval } from './meetingAnalysisContract';
import {
  isMeetingAudioOutboxScope,
  meetingAudioOutboxScopesEqual,
  meetingAudioSegmentOutboxKey,
  meetingPointerBatchOutboxKey,
  normalizeMeetingAudioOutboxScope,
  type MeetingAudioOutboxScope,
} from './meetingCaptureBinding';

export type { MeetingAudioOutboxScope } from './meetingCaptureBinding';

const DB_NAME = 'projed-dev123-meeting-audio';
const STORE_NAME = 'segments';
const POINTER_STORE_NAME = 'pointers';

type StoredSegment = {
  key: string;
  scope: MeetingAudioOutboxScope;
  manifest: MeetingAudioSegmentManifest;
  blob: Blob;
};

export type StoredPointerBatch = {
  key: string;
  scope: MeetingAudioOutboxScope;
  batchKey: string;
  digest: string;
  intervals: MeetingPointerInterval[];
  createdAt: number;
};

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB unavailable; audio capture cannot continue safely.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    if (!db.objectStoreNames.contains(POINTER_STORE_NAME)) db.createObjectStore(POINTER_STORE_NAME, { keyPath: 'key' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Unable to open audio outbox.'));
});

type TransactionSetup<T> = (
  store: IDBObjectStore,
  setResult: (value: T) => void,
  fail: (error: unknown) => void,
) => void;

const runTransaction = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  setup: TransactionSetup<T>,
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (error) {
        reject(error);
        return;
      }

      let result: T;
      let hasResult = false;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error('Meeting audio outbox transaction failed.'));
      };
      const setResult = (value: T) => {
        result = value;
        hasResult = true;
      };

      transaction.oncomplete = () => {
        if (settled) return;
        if (!hasResult) {
          fail(new Error('Meeting audio outbox transaction completed without a result.'));
          return;
        }
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('Meeting audio outbox transaction failed.'));
      transaction.onabort = () => fail(transaction.error ?? new Error('Meeting audio outbox transaction aborted.'));

      try {
        setup(transaction.objectStore(storeName), setResult, fail);
      } catch (error) {
        fail(error);
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive; its completion handler owns cleanup.
        }
      }
    });
  } finally {
    db.close();
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isManifest = (value: unknown): value is MeetingAudioSegmentManifest => {
  if (!isRecord(value)) return false;
  return typeof value.segmentId === 'string'
    && value.segmentId.length > 0
    && Number.isSafeInteger(value.segmentIndex)
    && Number.isSafeInteger(value.epoch)
    && Number.isFinite(value.startOffsetMs)
    && Number.isFinite(value.endOffsetMs)
    && Number.isFinite(value.overlapMs)
    && Number.isFinite(value.gapBeforeMs)
    && typeof value.mime === 'string'
    && Number.isSafeInteger(value.bytes)
    && ['pending', 'uploading', 'uploaded', 'verified', 'expired', 'purged'].includes(String(value.uploadState));
};

const isStoredSegment = (value: unknown): value is StoredSegment => (
  isRecord(value)
  && typeof value.key === 'string'
  && isMeetingAudioOutboxScope(value.scope)
  && isManifest(value.manifest)
  && typeof Blob !== 'undefined'
  && value.blob instanceof Blob
);

const isStoredPointerBatch = (value: unknown): value is StoredPointerBatch => (
  isRecord(value)
  && typeof value.key === 'string'
  && isMeetingAudioOutboxScope(value.scope)
  && typeof value.batchKey === 'string'
  && typeof value.digest === 'string'
  && Array.isArray(value.intervals)
  && Number.isFinite(value.createdAt)
);

const exactSegment = (value: unknown, scope: MeetingAudioOutboxScope): value is StoredSegment => {
  if (!isStoredSegment(value) || !meetingAudioOutboxScopesEqual(value.scope, scope)) return false;
  try {
    return value.key === meetingAudioSegmentOutboxKey(scope, value.manifest.segmentId);
  } catch {
    return false;
  }
};

const exactPointerBatch = (value: unknown, scope: MeetingAudioOutboxScope): value is StoredPointerBatch => {
  if (!isStoredPointerBatch(value) || !meetingAudioOutboxScopesEqual(value.scope, scope)) return false;
  try {
    return value.key === meetingPointerBatchOutboxKey(scope, value.batchKey);
  } catch {
    return false;
  }
};

export const putMeetingAudioSegment = async (
  scopeInput: MeetingAudioOutboxScope,
  manifest: MeetingAudioSegmentManifest,
  blob: Blob,
): Promise<void> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  const key = meetingAudioSegmentOutboxKey(scope, manifest.segmentId);
  await runTransaction<void>(STORE_NAME, 'readwrite', (store, setResult, fail) => {
    const request = store.put({ key, scope, manifest: { ...manifest }, blob } satisfies StoredSegment);
    request.onsuccess = () => setResult(undefined);
    request.onerror = () => fail(request.error ?? new Error('Unable to persist audio segment.'));
  });
};

export const listMeetingAudioSegments = async (
  scopeInput: MeetingAudioOutboxScope,
): Promise<StoredSegment[]> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  return runTransaction<StoredSegment[]>(STORE_NAME, 'readonly', (store, setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as unknown[]).filter((row): row is StoredSegment => exactSegment(row, scope));
      setResult(rows.sort((left, right) => left.manifest.segmentIndex - right.manifest.segmentIndex));
    };
    request.onerror = () => fail(request.error ?? new Error('Unable to read audio outbox.'));
  });
};

export const deleteMeetingAudioSegment = async (
  scopeInput: MeetingAudioOutboxScope,
  segmentId: string,
): Promise<boolean> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  const key = meetingAudioSegmentOutboxKey(scope, segmentId);
  return runTransaction<boolean>(STORE_NAME, 'readwrite', (store, setResult, fail) => {
    const request = store.get(key);
    request.onsuccess = () => {
      if (!exactSegment(request.result, scope)) {
        setResult(false);
        return;
      }
      const deletion = store.delete(key);
      deletion.onsuccess = () => setResult(true);
      deletion.onerror = () => fail(deletion.error ?? new Error('Unable to acknowledge audio segment.'));
    };
    request.onerror = () => fail(request.error ?? new Error('Unable to acknowledge audio segment.'));
  });
};

export const putMeetingPointerBatch = async (
  scopeInput: MeetingAudioOutboxScope,
  batchKey: string,
  digest: string,
  intervals: MeetingPointerInterval[],
): Promise<void> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  const key = meetingPointerBatchOutboxKey(scope, batchKey);
  await runTransaction<void>(POINTER_STORE_NAME, 'readwrite', (store, setResult, fail) => {
    const request = store.put({
      key,
      scope,
      batchKey,
      digest,
      intervals: intervals.map(interval => ({ ...interval })),
      createdAt: Date.now(),
    } satisfies StoredPointerBatch);
    request.onsuccess = () => setResult(undefined);
    request.onerror = () => fail(request.error ?? new Error('Unable to persist pointer batch.'));
  });
};

export const listMeetingPointerBatches = async (
  scopeInput: MeetingAudioOutboxScope,
): Promise<StoredPointerBatch[]> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  return runTransaction<StoredPointerBatch[]>(POINTER_STORE_NAME, 'readonly', (store, setResult, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = (request.result as unknown[]).filter((row): row is StoredPointerBatch => exactPointerBatch(row, scope));
      setResult(rows.sort((left, right) => left.createdAt - right.createdAt));
    };
    request.onerror = () => fail(request.error ?? new Error('Unable to read pointer outbox.'));
  });
};

export const deleteMeetingPointerBatch = async (
  scopeInput: MeetingAudioOutboxScope,
  batchKey: string,
): Promise<boolean> => {
  const scope = normalizeMeetingAudioOutboxScope(scopeInput);
  const key = meetingPointerBatchOutboxKey(scope, batchKey);
  return runTransaction<boolean>(POINTER_STORE_NAME, 'readwrite', (store, setResult, fail) => {
    const request = store.get(key);
    request.onsuccess = () => {
      if (!exactPointerBatch(request.result, scope)) {
        setResult(false);
        return;
      }
      const deletion = store.delete(key);
      deletion.onsuccess = () => setResult(true);
      deletion.onerror = () => fail(deletion.error ?? new Error('Unable to acknowledge pointer batch.'));
    };
    request.onerror = () => fail(request.error ?? new Error('Unable to acknowledge pointer batch.'));
  });
};
