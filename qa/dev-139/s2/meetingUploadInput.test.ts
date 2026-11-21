import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { normalizeMeetingUploadCompletion } from '../../../server/meetingUploadInput.js';

const CAPTURE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BASE_SHA = 'a'.repeat(64);

function expectInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => (
    error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID' && error.httpStatus === 400
  ));
}

function audioEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    segmentIndex: 0,
    epoch: 0,
    bytes: 4,
    startOffsetMs: 0,
    endOffsetMs: 1200,
    overlapMs: 0,
    gapBeforeMs: 0,
    mime: 'audio/webm',
    sha256: BASE_SHA,
    objectPath: 'tenant/project/record/capture/v3/0.webm',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'complete-upload',
    captureId: CAPTURE_ID,
    expectedSourceVersion: 3,
    audioManifestHash: 'audio-manifest-v1',
    pointerManifestHash: 'pointer-manifest-v1',
    sourceCompleteness: 'complete',
    audioManifest: [audioEntry()],
    ...overrides,
  };
}

test('completion normalizes SQL-consumed camel/snake aliases and strips legacy client-only fields', () => {
  const result = normalizeMeetingUploadCompletion(body({
    audioManifestHash: '  opaque audio fingerprint  ',
    pointerManifestHash: 'opaque pointer fingerprint',
    audioManifest: [{
      segment_id: 'ignored-legacy-id',
      segment_index: '2',
      epoch: 7,
      bytes: 8192,
      start_offset_ms: 2400,
      end_offset_ms: 5400,
      overlap_ms: 200,
      gap_before_ms: 80,
      mime: ' Audio/WEBM;codecs=opus ',
      sha256: BASE_SHA.toUpperCase(),
      object_path: ' /bucket/path/2.webm ',
      upload_state: 'pending',
      provider: 'ignored',
    }],
    sourceCompleteness: 'partial',
  }));

  assert.deepEqual(result, {
    captureId: CAPTURE_ID,
    expectedSourceVersion: 3,
    audioManifestHash: '  opaque audio fingerprint  ',
    pointerManifestHash: 'opaque pointer fingerprint',
    sourceCompleteness: 'partial',
    audioManifest: [{
      segmentIndex: 2,
      epoch: 7,
      bytes: 8192,
      startOffsetMs: 2400,
      endOffsetMs: 5400,
      overlapMs: 200,
      gapBeforeMs: 80,
      mime: 'audio/webm',
      sha256: BASE_SHA,
      objectPath: ' /bucket/path/2.webm ',
    }],
  });
  assert.deepEqual(Object.keys(result.audioManifest[0]!), [
    'segmentIndex', 'epoch', 'bytes', 'startOffsetMs', 'endOffsetMs', 'overlapMs', 'gapBeforeMs', 'mime', 'sha256', 'objectPath',
  ]);
});

test('complete requires contiguous nonempty segments; partial and missing allow empty or sparse verified subsets', () => {
  assert.equal(normalizeMeetingUploadCompletion(body({ audioManifest: [audioEntry(), audioEntry({ segmentIndex: 1 })] })).audioManifest.length, 2);
  assert.deepEqual(normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [] })).audioManifest, []);
  assert.deepEqual(normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'missing', audioManifest: [] })).audioManifest, []);
  assert.equal(normalizeMeetingUploadCompletion(body({
    sourceCompleteness: 'missing',
    audioManifest: [audioEntry({ segmentIndex: 4 })],
  })).audioManifest[0]?.segmentIndex, 4);

  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifest: [] })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifest: [audioEntry(), audioEntry({ segmentIndex: 2 })] })));
});

test('manifest bounds allow 4096 rows and reject larger sets, duplicate indexes, and out-of-range IDs', () => {
  const maxManifest = Array.from({ length: 4096 }, (_, segmentIndex) => audioEntry({ segmentIndex }));
  assert.equal(normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: maxManifest })).audioManifest.length, 4096);
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [...maxManifest, audioEntry({ segmentIndex: 4095 })] })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({
    sourceCompleteness: 'partial', audioManifest: [audioEntry(), audioEntry()],
  })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [audioEntry({ segmentIndex: -1 })] })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [audioEntry({ segmentIndex: 4096 })] })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [audioEntry({ segmentIndex: Number.MAX_SAFE_INTEGER + 1 })] })));
});

test('epoch, offsets, overlap, gap, and byte values reject unsafe and invalid ranges', () => {
  const invalidEntries: Record<string, unknown>[] = [
    audioEntry({ epoch: -1 }),
    audioEntry({ epoch: 2_147_483_648 }),
    audioEntry({ bytes: 0 }),
    audioEntry({ bytes: 10 * 1024 * 1024 + 1 }),
    audioEntry({ bytes: Number.MAX_SAFE_INTEGER + 1 }),
    audioEntry({ startOffsetMs: -1 }),
    audioEntry({ startOffsetMs: Number.MAX_SAFE_INTEGER + 1 }),
    audioEntry({ startOffsetMs: 10, endOffsetMs: 10 }),
    audioEntry({ startOffsetMs: 10, endOffsetMs: 9 }),
    audioEntry({ endOffsetMs: Number.POSITIVE_INFINITY }),
    audioEntry({ endOffsetMs: Number.NaN }),
    audioEntry({ overlapMs: -1 }),
    audioEntry({ overlapMs: 501 }),
    audioEntry({ overlapMs: undefined, overlap_ms: Number.MAX_SAFE_INTEGER + 1 }),
    audioEntry({ gapBeforeMs: -1 }),
    audioEntry({ gapBeforeMs: undefined, gap_before_ms: Number.POSITIVE_INFINITY }),
  ];

  for (const item of invalidEntries) {
    expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'partial', audioManifest: [item] })));
  }
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ expectedSourceVersion: 2_147_483_648 })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ expectedSourceVersion: Number.MAX_SAFE_INTEGER + 1 })));
});

test('MIME, SHA, object path, and opaque hashes validate without rewriting source hash/path text', () => {
  assert.equal(normalizeMeetingUploadCompletion(body({ audioManifest: [audioEntry({ mime: 'audio/ogg;codecs=opus' })] })).audioManifest[0]?.mime, 'audio/ogg');
  assert.equal(normalizeMeetingUploadCompletion(body({ audioManifest: [audioEntry({ objectPath: ` ${'p'.repeat(1022)} ` })] })).audioManifest[0]?.objectPath.length, 1024);

  const invalidEntries = [
    audioEntry({ mime: 'application/octet-stream' }),
    audioEntry({ sha256: 'a'.repeat(63) }),
    audioEntry({ sha256: `${'a'.repeat(63)}g` }),
    audioEntry({ objectPath: '' }),
    audioEntry({ objectPath: 'x'.repeat(1025) }),
    audioEntry({ objectPath: 'path\u007fcontrol' }),
  ];
  for (const item of invalidEntries) {
    expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifest: [item] })));
  }

  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifestHash: '' })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ pointerManifestHash: ' '.repeat(256) })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifestHash: 'x'.repeat(257) })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ pointerManifestHash: 'hash\u0000suffix' })));
  assert.equal(normalizeMeetingUploadCompletion(body({ audioManifestHash: 'fingerprint-v1' })).audioManifestHash, 'fingerprint-v1');
});

test('completion rejects wrong operation, unknown top-level data, and invalid required contract fields', () => {
  expectInvalid(() => normalizeMeetingUploadCompletion({ ...body(), providerMode: 'fake' }));
  expectInvalid(() => normalizeMeetingUploadCompletion({ ...body(), actorId: 'client-controlled' }));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ operation: 'upload' })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ captureId: 'not-a-uuid' })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ expectedSourceVersion: 0 })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ sourceCompleteness: 'unknown' })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifest: { segmentIndex: 0 } })));
  expectInvalid(() => normalizeMeetingUploadCompletion(body({ audioManifest: [null] })));
});
