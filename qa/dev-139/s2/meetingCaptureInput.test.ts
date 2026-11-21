import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  assertEpochManifestDoesNotRewind,
  normalizeEpochManifest,
  normalizePointerBatch,
  normalizeSourceGaps,
  requireAudioMime,
  requirePositiveVersion,
  requireUuid,
} from '../../../server/meetingCaptureInput.js';

const CAPTURE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CAPTURE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function expectKernelError(action: () => unknown, code: string, status: number): void {
  assert.throws(action, (error: unknown) => (
    error instanceof KernelError && error.code === code && error.httpStatus === status
  ));
}

function pointerBatch(intervals: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    batchKey: 'batch-2026-10-29-a',
    digest: createHash('sha256').update(JSON.stringify(intervals), 'utf8').digest('hex'),
    intervals,
    ...overrides,
  };
}

const epoch = (overrides: Record<string, unknown> = {}) => ({
  epoch: 0,
  captureOffsetMs: 0,
  monotonicStart: 1000,
  durationMs: 120,
  gapBeforeMs: 0,
  ...overrides,
});

test('epoch manifest normalizes aliases and permits same-epoch progress and appended epochs', () => {
  const existing = normalizeEpochManifest([{
    epoch: 0,
    capture_offset_ms: 0,
    monotonic_start: 1000,
    duration_ms: 120,
    gap_before_ms: 0,
  }]);
  const progress = [epoch({ durationMs: 240 })];
  assert.doesNotThrow(() => assertEpochManifestDoesNotRewind(existing, progress));

  const afterPause = [
    epoch({ durationMs: 400 }),
    { epoch: 2, captureOffsetMs: 430, monotonicStart: 25, durationMs: 10, gapBeforeMs: 30 },
  ];
  assert.doesNotThrow(() => assertEpochManifestDoesNotRewind(progress, afterPause));
});

test('epoch manifest rejects changed history, a shortened tail, and removed epochs as revision conflicts', () => {
  const existing = [
    epoch({ durationMs: 100 }),
    { epoch: 1, captureOffsetMs: 140, monotonicStart: 50, durationMs: 80, gapBeforeMs: 40 },
  ];
  expectKernelError(() => assertEpochManifestDoesNotRewind(existing, [
    epoch({ durationMs: 100, captureOffsetMs: 1 }),
    existing[1],
  ]), 'REVISION_CONFLICT', 409);
  expectKernelError(() => assertEpochManifestDoesNotRewind(existing, [
    existing[0],
    { ...existing[1], durationMs: 79 },
  ]), 'REVISION_CONFLICT', 409);
  expectKernelError(() => assertEpochManifestDoesNotRewind(existing, existing.slice(0, 1)), 'REVISION_CONFLICT', 409);
});

test('epoch manifests retain the 128-entry bound and reject unsafe or non-finite clock values', () => {
  assert.equal(normalizeEpochManifest(Array.from({ length: 128 }, (_, index) => epoch({
    epoch: index,
    captureOffsetMs: index,
  }))).length, 128);
  expectKernelError(() => normalizeEpochManifest(Array.from({ length: 129 }, (_, index) => epoch({ epoch: index }))), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeEpochManifest([epoch({ epoch: Number.MAX_SAFE_INTEGER + 1 })]), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeEpochManifest([epoch({ captureOffsetMs: Number.POSITIVE_INFINITY })]), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeEpochManifest([epoch({ monotonicStart: Number.NaN })]), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeEpochManifest([epoch({ durationMs: '1\n0' })]), 'DOMAIN_DATA_INVALID', 400);
});

test('source gaps accept both naming styles, cap reasons, and retain the 4096-entry bound', () => {
  const rows = normalizeSourceGaps([
    { startOffsetMs: 0, endOffsetMs: 5, reason: 'x'.repeat(100) },
    { start_offset_ms: 6, end_offset_ms: 9, terminationReason: 'pause' },
  ]);
  assert.ok(rows[0]);
  assert.equal(rows[0].reason.length, 80);
  assert.deepEqual(rows[1], { startOffsetMs: 6, endOffsetMs: 9, reason: 'pause' });
  assert.equal(normalizeSourceGaps(Array.from({ length: 4096 }, (_, index) => ({
    startOffsetMs: index * 2,
    endOffsetMs: index * 2 + 1,
  }))).length, 4096);
  expectKernelError(() => normalizeSourceGaps(Array.from({ length: 4097 }, (_, index) => ({
    startOffsetMs: index * 2,
    endOffsetMs: index * 2 + 1,
  }))), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeSourceGaps([{ startOffsetMs: 0, endOffsetMs: 1, reason: 'bad\u0000reason' }]), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizeSourceGaps([{ startOffsetMs: Number.MAX_SAFE_INTEGER + 1, endOffsetMs: Number.MAX_SAFE_INTEGER + 2 }]), 'DOMAIN_DATA_INVALID', 400);
});

test('pointer batches validate digest and normalize camel/snake aliases with a maximum ack sequence', () => {
  const rawIntervals = [
    {
      capture_id: CAPTURE_ID,
      clock_epoch: 1,
      sequence: 2,
      canonical_task_id: TASK_ID,
      surface_kind: 'task-card',
      started_offset_ms: 10,
      ended_offset_ms: 20,
      visible: false,
      termination_reason: 'blur',
    },
    {
      clockEpoch: 2,
      sequence: 5,
      canonicalTaskId: TASK_ID,
      surfaceKind: 'meeting-note',
      startedOffsetMs: 25,
      endedOffsetMs: 30,
    },
  ];
  const result = normalizePointerBatch(CAPTURE_ID, pointerBatch(rawIntervals));
  assert.deepEqual(result, {
    batchKey: 'batch-2026-10-29-a',
    digest: createHash('sha256').update(JSON.stringify(rawIntervals), 'utf8').digest('hex'),
    intervals: [
      {
        captureId: CAPTURE_ID,
        clockEpoch: 1,
        sequence: 2,
        canonicalTaskId: TASK_ID,
        surfaceKind: 'task-card',
        startedOffsetMs: 10,
        endedOffsetMs: 20,
        visible: false,
        terminationReason: 'blur',
      },
      {
        captureId: CAPTURE_ID,
        clockEpoch: 2,
        sequence: 5,
        canonicalTaskId: TASK_ID,
        surfaceKind: 'meeting-note',
        startedOffsetMs: 25,
        endedOffsetMs: 30,
        visible: true,
        terminationReason: 'flush',
      },
    ],
    ackSequence: 5,
  });
  assert.equal(normalizePointerBatch(CAPTURE_ID, pointerBatch([])).ackSequence, -1);
  assert.equal(normalizePointerBatch(CAPTURE_ID, pointerBatch([], { batchKey: '  stable key  ' })).batchKey, '  stable key  ');
});

test('pointer batches reject a mismatched hash and a different capture', () => {
  const raw = [{
    sequence: 1,
    clockEpoch: 0,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: 1,
    endedOffsetMs: 2,
  }];
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch(raw, { digest: '0'.repeat(64) })), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch(raw, {
    digest: `${createHash('sha256').update(JSON.stringify(raw), 'utf8').digest('hex')} `,
  })), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch([{
    ...raw[0],
    captureId: OTHER_CAPTURE_ID,
  }])), 'DOMAIN_DATA_INVALID', 400);
});

test('pointer batches retain count and byte bounds and reject unsafe numbers, duplicate sequences, and controls', () => {
  const tooMany = Array.from({ length: 501 }, (_, sequence) => ({
    sequence,
    clockEpoch: 0,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: sequence,
    endedOffsetMs: sequence + 1,
  }));
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch(tooMany)), 'DOMAIN_DATA_INVALID', 400);

  const tooLarge = [{
    sequence: 0,
    clockEpoch: 0,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: 0,
    endedOffsetMs: 1,
    surfaceKind: 'x'.repeat(129 * 1024),
  }];
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch(tooLarge)), 'DOMAIN_DATA_INVALID', 400);

  const unsafe = [{
    sequence: Number.MAX_SAFE_INTEGER + 1,
    clockEpoch: 0,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: 0,
    endedOffsetMs: 1,
  }];
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch(unsafe)), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch([
    { sequence: 1, clockEpoch: 0, canonicalTaskId: TASK_ID, startedOffsetMs: 0, endedOffsetMs: 1 },
    { sequence: 1, clockEpoch: 0, canonicalTaskId: TASK_ID, startedOffsetMs: 2, endedOffsetMs: 3 },
  ])), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch([{
    sequence: 0,
    clockEpoch: Number.POSITIVE_INFINITY,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: 0,
    endedOffsetMs: 1,
  }])), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => normalizePointerBatch(CAPTURE_ID, pointerBatch([{
    sequence: 0,
    clockEpoch: 0,
    canonicalTaskId: TASK_ID,
    startedOffsetMs: 0,
    endedOffsetMs: 1,
    surfaceKind: 'bad\u007fvalue',
  }])), 'DOMAIN_DATA_INVALID', 400);
});

test('version, UUID, and audio MIME helpers preserve the source value rules safely', () => {
  assert.equal(requirePositiveVersion('4'), 4);
  assert.equal(requireUuid(TASK_ID, 'task'), TASK_ID);
  assert.equal(requireAudioMime(' Audio/WEBM;codecs=opus '), 'audio/webm');
  assert.equal(requireAudioMime(undefined), 'audio/webm');
  assert.equal(requireAudioMime('audio/ogg'), 'audio/ogg');
  expectKernelError(() => requirePositiveVersion(Number.MAX_SAFE_INTEGER + 1), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => requirePositiveVersion(0), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => requireUuid('not-a-uuid'), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => requireUuid(`${TASK_ID}\n`), 'DOMAIN_DATA_INVALID', 400);
  expectKernelError(() => requireAudioMime('audio/webm\n'), 'DOMAIN_DATA_INVALID', 400);
});
