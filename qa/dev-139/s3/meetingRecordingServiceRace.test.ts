import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMeetingRecordingService,
  MeetingRecordingAbortedError,
  MeetingRecordingScopeChangedError,
  type MeetingAudioReservation,
  type MeetingRecordingDependencies,
} from '../../../src/features/meetingTaskResolution/meetingRecordingService';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const pendingReservation = (overrides: Partial<MeetingAudioReservation> = {}): MeetingAudioReservation => ({
  segmentId: 'segment-1',
  sourceVersion: 1,
  segmentIndex: 0,
  path: 'private/capture/segment-1',
  token: 'opaque-upload-token',
  signedUrl: null,
  expiresAt: Date.now() + 60_000,
  uploadState: 'pending',
  alreadyVerified: false,
  sha256: null,
  bytes: 0,
  ...overrides,
});

const verifiedResponse = (bytes: number, sha256: string) => ({
  segment: {
    id: 'segment-1',
    segment_index: 0,
    source_version: 1,
    bytes,
    sha256,
    upload_state: 'verified',
    object_path: 'private/capture/segment-1',
  },
});

async function digest(blob: Blob): Promise<string> {
  const result = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

function dependencies(options: {
  invoke?: (operation: string, payload: Record<string, unknown>) => Promise<unknown>;
  upload?: (path: string, token: string, blob: Blob, options: { contentType: string }) => Promise<{ error: unknown | null }>;
  operations?: string[];
} = {}): MeetingRecordingDependencies {
  return {
    async invoke<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
      options.operations?.push(operation);
      return (await (options.invoke?.(operation, payload) ?? Promise.resolve({}))) as T;
    },
    async uploadToSignedUrl(path, token, blob, uploadOptions) {
      options.operations?.push('storage-upload');
      return options.upload
        ? options.upload(path, token, blob, uploadOptions)
        : { error: null };
    },
  };
}

test('late reserve completion cannot start a storage upload in a replaced scope', async () => {
  const reserve = deferred<MeetingAudioReservation>();
  const operations: string[] = [];
  let current = true;
  const service = createMeetingRecordingService(dependencies({
    operations,
    invoke: operation => operation === 'reserve-segment' ? reserve.promise : Promise.resolve({}),
  }), () => current);

  const pending = service.uploadSegment('capture-1', 0, new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }));
  assert.deepEqual(operations, ['reserve-segment']);
  current = false;
  reserve.resolve(pendingReservation());

  await assert.rejects(pending, error => error instanceof MeetingRecordingScopeChangedError);
  assert.deepEqual(operations, ['reserve-segment']);
});

test('late storage completion cannot trigger verify in a replaced scope', async () => {
  const storage = deferred<{ error: unknown | null }>();
  const uploadEntered = deferred<void>();
  const operations: string[] = [];
  let current = true;
  const service = createMeetingRecordingService(dependencies({
    operations,
    invoke: operation => operation === 'reserve-segment'
      ? Promise.resolve(pendingReservation())
      : Promise.resolve(verifiedResponse(3, 'a'.repeat(64))),
    upload: () => { uploadEntered.resolve(); return storage.promise; },
  }), () => current);

  const pending = service.uploadSegment('capture-1', 0, new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/webm' }));
  await uploadEntered.promise;
  assert.deepEqual(operations, ['reserve-segment', 'storage-upload']);
  current = false;
  storage.resolve({ error: null });

  await assert.rejects(pending, error => error instanceof MeetingRecordingScopeChangedError);
  assert.deepEqual(operations, ['reserve-segment', 'storage-upload']);
});

test('late begin response is rejected after its capture scope ends', async () => {
  const begin = deferred<unknown>();
  const operations: string[] = [];
  let current = true;
  const service = createMeetingRecordingService(dependencies({
    operations,
    invoke: () => begin.promise,
  }), () => current);

  const pending = service.begin({ tenantId: 'tenant-1', projectId: 'board-1', recordId: 'record-1', idempotencyKey: 'begin-1' });
  current = false;
  begin.resolve({ captureId: 'capture-1', state: 'recording', sourceVersion: 1, startedAt: new Date().toISOString() });

  await assert.rejects(pending, error => error instanceof MeetingRecordingScopeChangedError);
  assert.deepEqual(operations, ['begin']);
});

test('abort rejects before dispatch and fences a request already in flight', async () => {
  const controller = new AbortController();
  controller.abort();
  const operations: string[] = [];
  const beforeDispatch = createMeetingRecordingService(dependencies({ operations }), () => true, controller.signal);
  await assert.rejects(beforeDispatch.begin({
    tenantId: 'tenant-1', projectId: 'board-1', recordId: 'record-1', idempotencyKey: 'begin-aborted',
  }), error => error instanceof MeetingRecordingAbortedError);
  assert.deepEqual(operations, []);

  const inFlightController = new AbortController();
  const begin = deferred<unknown>();
  const inFlightOperations: string[] = [];
  const inFlight = createMeetingRecordingService(dependencies({
    operations: inFlightOperations,
    invoke: () => begin.promise,
  }), () => true, inFlightController.signal);
  const pending = inFlight.begin({
    tenantId: 'tenant-1', projectId: 'board-1', recordId: 'record-1', idempotencyKey: 'begin-in-flight',
  });
  inFlightController.abort();
  begin.resolve({ captureId: 'capture-1', state: 'recording', sourceVersion: 1, startedAt: new Date().toISOString() });
  await assert.rejects(pending, error => error instanceof MeetingRecordingAbortedError);
  assert.deepEqual(inFlightOperations, ['begin']);
});

test('normal upload remains reserve, signed upload, then verify', async () => {
  const operations: string[] = [];
  let reservePayload: Record<string, unknown> | null = null;
  const blob = new Blob([new Uint8Array([7, 8, 9])], { type: 'audio/webm' });
  const sha256 = await digest(blob);
  const service = createMeetingRecordingService(dependencies({
    operations,
    invoke: (operation, payload) => operation === 'reserve-segment'
      ? (reservePayload = payload, Promise.resolve(pendingReservation()))
      : Promise.resolve(verifiedResponse(blob.size, sha256)),
  }), () => true);

  const receipt = await service.uploadSegment('capture-1', 0, blob, {
    expectedSourceVersion: 1, epoch: 2, startOffsetMs: 10, endOffsetMs: 20,
  });

  assert.deepEqual(operations, ['reserve-segment', 'storage-upload', 'verify-segment']);
  assert.ok(reservePayload);
  assert.equal(Object.prototype.hasOwnProperty.call(reservePayload, 'expectedSourceVersion'), false,
    'the local frozen source fence must not change the legacy reserve wire contract');
  assert.equal(receipt.sha256, sha256);
  assert.equal(receipt.bytes, blob.size);
});

test('capture mutations carry their frozen expected source version unchanged', async () => {
  const calls: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  const service = createMeetingRecordingService(dependencies({
    invoke: (operation, payload) => {
      calls.push({ operation, payload });
      return Promise.resolve({});
    },
  }), () => true);

  await service.progress('capture-1', {
    expectedSourceVersion: 7,
    epochManifest: [{ epoch: 2 }],
    lastProgressAt: 1234,
  });
  await service.pause('capture-1', 7);
  await service.resume('capture-1', [{ epoch: 3 }], 7);
  await service.appendPointer('capture-1', {
    expectedSourceVersion: 7,
    batchKey: 'batch-1',
    digest: 'a'.repeat(64),
    intervals: [{
      captureId: 'capture-1', clockEpoch: 2, sequence: 4, canonicalTaskId: 'task-1',
      surfaceKind: 'qa', startedOffsetMs: 10, endedOffsetMs: 20, visible: true, terminationReason: 'flush',
    }],
  });

  assert.deepEqual(calls.map(call => [call.operation, call.payload.expectedSourceVersion]), [
    ['progress', 7], ['pause', 7], ['resume', 7], ['append-pointer', 7],
  ]);
  assert.deepEqual(calls[2]?.payload, {
    captureId: 'capture-1', epochManifest: [{ epoch: 3 }], expectedSourceVersion: 7,
  }, 'resume keeps epochManifest in its existing argument position and includes the source fence');
});

test('reservation frozen source version and segment index must match before storage upload', async () => {
  const operations: string[] = [];
  const wrongSourceVersion = createMeetingRecordingService(dependencies({
    operations,
    invoke: () => Promise.resolve(pendingReservation({ sourceVersion: 2 })),
  }), () => true);
  const blob = new Blob([new Uint8Array([14, 15])], { type: 'audio/webm' });

  await assert.rejects(
    wrongSourceVersion.uploadSegment('capture-1', 0, blob, { expectedSourceVersion: 1 }),
    error => (error as { code?: string }).code === 'MEETING_AUDIO_RESERVATION_MISMATCH',
  );
  assert.deepEqual(operations, ['reserve-segment']);

  const wrongSegmentIndex = createMeetingRecordingService(dependencies({
    operations,
    invoke: () => Promise.resolve(pendingReservation({ segmentIndex: 3 })),
  }), () => true);
  await assert.rejects(
    wrongSegmentIndex.uploadSegment('capture-1', 2, blob, { expectedSourceVersion: 1 }),
    error => (error as { code?: string }).code === 'MEETING_AUDIO_RESERVATION_MISMATCH',
  );
  assert.deepEqual(operations, ['reserve-segment', 'reserve-segment']);
});

test('normal upload rejects a verify receipt that does not match its reservation and local bytes', async () => {
  const blob = new Blob([new Uint8Array([16, 17, 18])], { type: 'audio/webm' });
  const localSha256 = await digest(blob);
  const mismatches = [
    { label: 'state', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, upload_state: 'uploading' }) },
    { label: 'segment ID', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, id: 'other-segment' }) },
    { label: 'segment index', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, segment_index: 4 }) },
    { label: 'source version', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, source_version: 2 }) },
    { label: 'object path', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, object_path: 'other/path' }) },
    { label: 'bytes', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, bytes: blob.size + 1 }) },
    { label: 'SHA-256', mutate: (row: ReturnType<typeof verifiedResponse>['segment']) => ({ ...row, sha256: 'e'.repeat(64) }) },
  ];

  for (const mismatch of mismatches) {
    const operations: string[] = [];
    const service = createMeetingRecordingService(dependencies({
      operations,
      invoke: operation => operation === 'reserve-segment'
        ? Promise.resolve(pendingReservation())
        : Promise.resolve({ segment: mismatch.mutate(verifiedResponse(blob.size, localSha256).segment) }),
    }), () => true);
    await assert.rejects(
      service.uploadSegment('capture-1', 0, blob, { expectedSourceVersion: 1 }),
      error => (error as { code?: string }).code === 'MEETING_AUDIO_VERIFICATION_MISMATCH',
      mismatch.label,
    );
    assert.deepEqual(operations, ['reserve-segment', 'storage-upload', 'verify-segment']);
  }
});

test('verified fast path requires exact byte count and SHA-256 before returning success', async () => {
  const blob = new Blob([new Uint8Array([10, 11, 12, 13])], { type: 'audio/webm' });
  const sha256 = await digest(blob);
  const operations: string[] = [];
  const service = createMeetingRecordingService(dependencies({
    operations,
    invoke: () => Promise.resolve(pendingReservation({
      uploadState: 'verified', alreadyVerified: true, token: null, bytes: blob.size, sha256,
    })),
  }), () => true);

  const receipt = await service.uploadSegment('capture-1', 0, blob);
  assert.equal(receipt.bytes, blob.size);
  assert.equal(receipt.sha256, sha256);
  assert.deepEqual(operations, ['reserve-segment']);

  const wrongBytes = createMeetingRecordingService(dependencies({
    invoke: () => Promise.resolve(pendingReservation({
      uploadState: 'verified', alreadyVerified: true, token: null, bytes: blob.size + 1, sha256,
    })),
  }), () => true);
  await assert.rejects(
    wrongBytes.uploadSegment('capture-1', 0, blob),
    error => (error as { code?: string }).code === 'MEETING_AUDIO_VERIFICATION_MISMATCH',
  );

  const wrongHash = createMeetingRecordingService(dependencies({
    invoke: () => Promise.resolve(pendingReservation({
      uploadState: 'verified', alreadyVerified: true, token: null, bytes: blob.size, sha256: 'f'.repeat(64),
    })),
  }), () => true);
  await assert.rejects(
    wrongHash.uploadSegment('capture-1', 0, blob),
    error => (error as { code?: string }).code === 'MEETING_AUDIO_VERIFICATION_MISMATCH',
  );
});
