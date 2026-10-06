import type { MeetingAudioSegmentManifest, MeetingPointerInterval } from './meetingAnalysisContract';

const DB_NAME = 'projed-dev123-meeting-audio';
const STORE_NAME = 'segments';
const POINTER_STORE_NAME = 'pointers';

type StoredSegment = { key: string; manifest: MeetingAudioSegmentManifest; blob: Blob };
export type StoredPointerBatch = { key: string; batchKey: string; digest: string; intervals: MeetingPointerInterval[]; createdAt: number };

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

export const putMeetingAudioSegment = async (scopeKey: string, manifest: MeetingAudioSegmentManifest, blob: Blob) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
      key: `${scopeKey}:${manifest.segmentId}`,
      manifest,
      blob,
    } satisfies StoredSegment);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to persist audio segment.'));
  });
  db.close();
};

export const listMeetingAudioSegments = async (scopeKey: string) => {
  const db = await openDb();
  const rows = await new Promise<StoredSegment[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as StoredSegment[]).filter(row => row.key.startsWith(`${scopeKey}:`)));
    request.onerror = () => reject(request.error ?? new Error('Unable to read audio outbox.'));
  });
  db.close();
  return rows.sort((left, right) => left.manifest.segmentIndex - right.manifest.segmentIndex);
};

export const deleteMeetingAudioSegment = async (scopeKey: string, segmentId: string) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(`${scopeKey}:${segmentId}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to acknowledge audio segment.'));
  });
  db.close();
};

export const putMeetingPointerBatch = async (
  scopeKey: string,
  batchKey: string,
  digest: string,
  intervals: MeetingPointerInterval[],
) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(POINTER_STORE_NAME, 'readwrite').objectStore(POINTER_STORE_NAME).put({
      key: `${scopeKey}:${batchKey}`,
      batchKey,
      digest,
      intervals,
      createdAt: Date.now(),
    } satisfies StoredPointerBatch);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to persist pointer batch.'));
  });
  db.close();
};

export const listMeetingPointerBatches = async (scopeKey: string) => {
  const db = await openDb();
  const rows = await new Promise<StoredPointerBatch[]>((resolve, reject) => {
    const request = db.transaction(POINTER_STORE_NAME, 'readonly').objectStore(POINTER_STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as StoredPointerBatch[]).filter(row => row.key.startsWith(`${scopeKey}:`)));
    request.onerror = () => reject(request.error ?? new Error('Unable to read pointer outbox.'));
  });
  db.close();
  return rows.sort((left, right) => left.createdAt - right.createdAt);
};

export const deleteMeetingPointerBatch = async (scopeKey: string, batchKey: string) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(POINTER_STORE_NAME, 'readwrite').objectStore(POINTER_STORE_NAME).delete(`${scopeKey}:${batchKey}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to acknowledge pointer batch.'));
  });
  db.close();
};
