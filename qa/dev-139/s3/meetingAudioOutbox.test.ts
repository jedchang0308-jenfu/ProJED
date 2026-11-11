import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteMeetingAudioSegment,
  deleteMeetingPointerBatch,
  listMeetingAudioSegments,
  listMeetingPointerBatches,
  putMeetingAudioSegment,
  putMeetingPointerBatch,
} from '../../../src/features/meetingTaskResolution/meetingAudioOutbox';
import {
  meetingAudioSegmentOutboxKey,
  normalizeMeetingAudioOutboxScope,
  type MeetingAudioOutboxScope,
} from '../../../src/features/meetingTaskResolution/meetingCaptureBinding';
import type { MeetingAudioSegmentManifest, MeetingPointerInterval } from '../../../src/features/meetingTaskResolution/meetingAnalysisContract';

const SEGMENT_STORE = 'segments';
const POINTER_STORE = 'pointers';

const scope = (overrides: Partial<MeetingAudioOutboxScope> = {}): MeetingAudioOutboxScope => ({
  accountId: 'account-a',
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recordId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  captureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  sourceVersion: 7,
  ...overrides,
});

const manifest = (segmentId: string, segmentIndex: number): MeetingAudioSegmentManifest => ({
  segmentId,
  segmentIndex,
  epoch: 0,
  startOffsetMs: segmentIndex * 1000,
  endOffsetMs: (segmentIndex + 1) * 1000,
  overlapMs: 0,
  gapBeforeMs: 0,
  mime: 'audio/webm',
  bytes: 3,
  uploadState: 'pending',
});

const pointer = (captureId: string): MeetingPointerInterval => ({
  captureId,
  clockEpoch: 0,
  sequence: 0,
  canonicalTaskId: 'task-1',
  surfaceKind: 'task',
  startedOffsetMs: 0,
  endedOffsetMs: 100,
  visible: true,
  terminationReason: 'pause',
});

type TinyRequest<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

const requestValue = <T,>(): TinyRequest<T> => ({
  result: undefined as T,
  error: null,
  onsuccess: null,
  onerror: null,
});

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  closeCount = 0;
  abortNextCommit = false;

  get objectStoreNames(): Pick<DOMStringList, 'contains'> {
    return { contains: name => this.stores.has(name) };
  }

  createObjectStore(name: string): IDBObjectStore {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return {} as IDBObjectStore;
  }

  transaction(name: string, mode: IDBTransactionMode): IDBTransaction {
    const rows = this.stores.get(name);
    if (!rows) throw new Error(`Unknown fake IndexedDB store: ${name}`);
    const transaction = new FakeTransaction(this, name, mode, rows, this.abortNextCommit);
    if (mode === 'readwrite') this.abortNextCommit = false;
    return transaction as unknown as IDBTransaction;
  }

  close(): void {
    this.closeCount += 1;
  }

  seed(name: string, key: string, value: unknown): void {
    let rows = this.stores.get(name);
    if (!rows) {
      rows = new Map();
      this.stores.set(name, rows);
    }
    rows.set(key, structuredClone(value));
  }

  read(name: string, key: string): unknown {
    const value = this.stores.get(name)?.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  snapshot(name: string): unknown[] {
    return [...(this.stores.get(name)?.values() ?? [])].map(value => structuredClone(value));
  }

  commit(name: string, rows: Map<string, unknown>): void {
    this.stores.set(name, rows);
  }
}

class FakeTransaction {
  oncomplete: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  error: DOMException | null = null;
  private pending = 0;
  private completionQueued = false;
  private readonly rows: Map<string, unknown>;

  constructor(
    private readonly db: FakeDatabase,
    private readonly storeName: string,
    private readonly mode: IDBTransactionMode,
    existingRows: Map<string, unknown>,
    private readonly abortAtCommit: boolean,
  ) {
    this.rows = new Map([...existingRows].map(([key, value]) => [key, structuredClone(value)]));
  }

  objectStore(name: string): IDBObjectStore {
    if (name !== this.storeName) throw new Error('Unexpected fake store.');
    return new FakeObjectStore(this).asObjectStore();
  }

  request<T>(action: () => T): TinyRequest<T> {
    const request = requestValue<T>();
    this.pending += 1;
    queueMicrotask(() => {
      try {
        request.result = action();
        request.onsuccess?.(new Event('success'));
      } catch (error) {
        this.error = error instanceof DOMException ? error : new DOMException('Fake request failed.', 'AbortError');
        request.error = this.error;
        request.onerror?.(new Event('error'));
      } finally {
        this.pending -= 1;
        this.scheduleCompletion();
      }
    });
    return request;
  }

  put(value: Record<string, unknown>): IDBRequest<IDBValidKey> {
    if (this.mode !== 'readwrite') throw new Error('Read-only fake transaction.');
    const copy = structuredClone(value);
    return this.request(() => {
      const key = copy.key;
      if (typeof key !== 'string') throw new Error('Missing fake row key.');
      this.rows.set(key, copy);
      return key;
    }) as unknown as IDBRequest<IDBValidKey>;
  }

  getAll(): IDBRequest<unknown[]> {
    return this.request(() => [...this.rows.values()].map(value => structuredClone(value))) as unknown as IDBRequest<unknown[]>;
  }

  get(key: IDBValidKey): IDBRequest<unknown> {
    return this.request(() => {
      const value = this.rows.get(String(key));
      return value === undefined ? undefined : structuredClone(value);
    }) as unknown as IDBRequest<unknown>;
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    if (this.mode !== 'readwrite') throw new Error('Read-only fake transaction.');
    return this.request(() => {
      this.rows.delete(String(key));
      return undefined;
    }) as unknown as IDBRequest<undefined>;
  }

  commitIfSuccessful(): void {
    if (this.abortAtCommit) {
      this.error = new DOMException('Fake commit aborted.', 'AbortError');
      this.onabort?.(new Event('abort'));
      return;
    }
    if (this.mode === 'readwrite') this.db.commit(this.storeName, this.rows);
    this.oncomplete?.(new Event('complete'));
  }

  private scheduleCompletion(): void {
    if (this.pending !== 0 || this.completionQueued) return;
    this.completionQueued = true;
    setTimeout(() => {
      this.completionQueued = false;
      if (this.pending === 0) this.commitIfSuccessful();
    }, 0);
  }
}

class FakeObjectStore {
  constructor(private readonly transaction: FakeTransaction) {}

  put(value: Record<string, unknown>): IDBRequest<IDBValidKey> {
    return this.transaction.put(value);
  }

  getAll(): IDBRequest<unknown[]> {
    return this.transaction.getAll();
  }

  get(key: IDBValidKey): IDBRequest<unknown> {
    return this.transaction.get(key);
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return this.transaction.delete(key);
  }

  asObjectStore(): IDBObjectStore {
    return this as unknown as IDBObjectStore;
  }
}

class FakeIndexedDbFactory {
  readonly databases = new Map<string, FakeDatabase>();
  readonly database = new FakeDatabase();

  open(name: string): IDBOpenDBRequest {
    const request = requestValue<IDBDatabase>() as TinyRequest<IDBDatabase> & {
      onupgradeneeded: ((event: Event) => void) | null;
    };
    request.onupgradeneeded = null;
    setTimeout(() => {
      let db = this.databases.get(name);
      const isNew = !db;
      if (!db) {
        db = this.database;
        this.databases.set(name, db);
      }
      request.result = db as unknown as IDBDatabase;
      if (isNew) request.onupgradeneeded?.(new Event('upgradeneeded'));
      request.onsuccess?.(new Event('success'));
    }, 0);
    return request as unknown as IDBOpenDBRequest;
  }
}

const withFakeIndexedDb = async <T,>(factory: FakeIndexedDbFactory, run: () => Promise<T>): Promise<T> => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: factory as unknown as IDBFactory,
  });
  try {
    return await run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
};

test('segment and pointer outbox rows are isolated by owner and full record/capture/version scope', async () => {
  const factory = new FakeIndexedDbFactory();
  const ownerA = scope();
  const ownerB = scope({ accountId: 'account-b' });
  const version8 = scope({ sourceVersion: 8 });

  await withFakeIndexedDb(factory, async () => {
    await putMeetingAudioSegment(ownerA, manifest('segment-1', 1), new Blob(['one'], { type: 'audio/webm' }));
    await putMeetingAudioSegment(ownerB, manifest('segment-1', 1), new Blob(['two'], { type: 'audio/webm' }));
    await putMeetingAudioSegment(version8, manifest('segment-1', 1), new Blob(['three'], { type: 'audio/webm' }));

    await putMeetingPointerBatch(ownerA, 'capture:pointer:1', 'digest-a', [pointer(ownerA.captureId)]);
    await putMeetingPointerBatch(ownerB, 'capture:pointer:1', 'digest-b', [pointer(ownerB.captureId)]);
    await putMeetingPointerBatch(version8, 'capture:pointer:1', 'digest-v8', [pointer(version8.captureId)]);

    assert.deepEqual((await listMeetingAudioSegments(ownerA)).map(row => row.manifest.segmentId), ['segment-1']);
    assert.equal((await listMeetingAudioSegments(ownerB))[0]?.blob.size, 3);
    assert.equal((await listMeetingAudioSegments(version8)).length, 1);
    assert.equal((await listMeetingAudioSegments(scope({ recordId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }))).length, 0);

    assert.deepEqual((await listMeetingPointerBatches(ownerA)).map(row => row.digest), ['digest-a']);
    assert.deepEqual((await listMeetingPointerBatches(ownerB)).map(row => row.digest), ['digest-b']);
    assert.deepEqual((await listMeetingPointerBatches(version8)).map(row => row.digest), ['digest-v8']);

    assert.equal(await deleteMeetingAudioSegment(ownerB, 'segment-1'), true);
    assert.equal((await listMeetingAudioSegments(ownerA)).length, 1);
    assert.equal(await deleteMeetingPointerBatch(version8, 'capture:pointer:1'), true);
    assert.equal((await listMeetingPointerBatches(ownerA)).length, 1);
  });
});

test('legacy schema-1 rows remain stored but are not attributed, listed, or deleted as a current owner', async () => {
  const factory = new FakeIndexedDbFactory();
  const currentScope = scope();
  const oldManifest = manifest('legacy-segment', 1);
  const legacyKey = `capture:${currentScope.captureId}:${oldManifest.segmentId}`;
  factory.database.seed(SEGMENT_STORE, legacyKey, {
    key: legacyKey,
    manifest: oldManifest,
    blob: new Blob(['legacy'], { type: 'audio/webm' }),
  });
  const legacyPointerKey = `capture:${currentScope.captureId}:legacy-pointer`;
  factory.database.seed(POINTER_STORE, legacyPointerKey, {
    key: legacyPointerKey,
    batchKey: 'legacy-pointer',
    digest: 'legacy-digest',
    intervals: [pointer(currentScope.captureId)],
    createdAt: 1,
  });

  await withFakeIndexedDb(factory, async () => {
    assert.deepEqual(await listMeetingAudioSegments(currentScope), []);
    assert.deepEqual(await listMeetingPointerBatches(currentScope), []);
    assert.equal(await deleteMeetingAudioSegment(currentScope, oldManifest.segmentId), false);
    assert.equal(await deleteMeetingPointerBatch(currentScope, 'legacy-pointer'), false);
  });

  assert.ok(factory.database.read(SEGMENT_STORE, legacyKey));
  assert.ok(factory.database.read(POINTER_STORE, legacyPointerKey));
});

test('delete checks stored provenance before acknowledging and cannot delete a mismatched row at the same key', async () => {
  const factory = new FakeIndexedDbFactory();
  const requestedScope = normalizeMeetingAudioOutboxScope(scope());
  const wrongScope = normalizeMeetingAudioOutboxScope(scope({ accountId: 'account-other' }));
  const rowKey = meetingAudioSegmentOutboxKey(requestedScope, 'segment-1');
  const pointerKey = `meeting-audio-v2:${encodeURIComponent(requestedScope.accountId)}:${requestedScope.tenantId}:${requestedScope.projectId}:${requestedScope.recordId}:${requestedScope.captureId}:v${requestedScope.sourceVersion}:pointer:batch-1`;
  factory.database.seed(SEGMENT_STORE, rowKey, {
    key: rowKey,
    scope: wrongScope,
    manifest: manifest('segment-1', 1),
    blob: new Blob(['wrong-owner'], { type: 'audio/webm' }),
  });
  factory.database.seed(POINTER_STORE, pointerKey, {
    key: pointerKey,
    scope: wrongScope,
    batchKey: 'batch-1',
    digest: 'other-owner',
    intervals: [pointer(requestedScope.captureId)],
    createdAt: 1,
  });

  await withFakeIndexedDb(factory, async () => {
    assert.deepEqual(await listMeetingAudioSegments(requestedScope), []);
    assert.equal(await deleteMeetingAudioSegment(requestedScope, 'segment-1'), false);
    assert.deepEqual(await listMeetingPointerBatches(requestedScope), []);
    assert.equal(await deleteMeetingPointerBatch(requestedScope, 'batch-1'), false);
  });

  assert.ok(factory.database.read(SEGMENT_STORE, rowKey));
  assert.ok(factory.database.read(POINTER_STORE, pointerKey));
});

test('write resolves only after transaction commit; an abort rejects and leaves no row', async () => {
  const factory = new FakeIndexedDbFactory();
  const currentScope = scope();

  await withFakeIndexedDb(factory, async () => {
    factory.database.abortNextCommit = true;
    await assert.rejects(putMeetingAudioSegment(
      currentScope,
      manifest('aborted-segment', 2),
      new Blob(['not-committed'], { type: 'audio/webm' }),
    ), /aborted|failed/u);
  });

  assert.equal(factory.database.snapshot(SEGMENT_STORE).length, 0);
  assert.equal(factory.database.closeCount, 1);
});

test('database connections close after successful read/write and failed delete transaction', async () => {
  const factory = new FakeIndexedDbFactory();
  const currentScope = scope();

  await withFakeIndexedDb(factory, async () => {
    await putMeetingAudioSegment(currentScope, manifest('segment-1', 1), new Blob(['one'], { type: 'audio/webm' }));
    await listMeetingAudioSegments(currentScope);
    await deleteMeetingAudioSegment(currentScope, 'missing-segment');
  });

  assert.equal(factory.database.closeCount, 3);
});
