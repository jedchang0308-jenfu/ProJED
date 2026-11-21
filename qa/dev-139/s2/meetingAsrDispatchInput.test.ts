import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { validateMeetingAsrDispatchInput, type MeetingAsrDispatchUnit } from '../../../server/meetingAsrDispatchInput.js';

const SHA = 'a'.repeat(64);
const SOURCE_START_MS = 120_000;

function expectInvalid(action: () => unknown): void {
  assert.throws(action, error => error instanceof KernelError
    && error.code === 'DOMAIN_DATA_INVALID' && error.httpStatus === 409);
}

function payload(overrides: Partial<MeetingAsrDispatchUnit> = {}): MeetingAsrDispatchUnit {
  return {
    chunkIndex: 1,
    chunkCount: 2,
    startSample: 800_000,
    endSample: 834_000,
    decodedSha256: SHA,
    startOffsetMs: SOURCE_START_MS + 50_000,
    endOffsetMs: SOURCE_START_MS + 52_125,
    ...overrides,
  };
}

test('dispatch payload preserves exact chunk/sample/global-time metadata without transcript fields', () => {
  const value = payload();
  const validated = validateMeetingAsrDispatchInput(value, {
    startOffsetMs: SOURCE_START_MS,
    metadataDurationMs: 52_125,
  });
  assert.deepEqual(validated, value);
  assert.equal(Object.isFrozen(validated), true);
  assert.deepEqual(Object.keys(validated), [
    'chunkIndex', 'chunkCount', 'startSample', 'endSample', 'decodedSha256', 'startOffsetMs', 'endOffsetMs',
  ]);
  assert.equal(validated.endOffsetMs - validated.startOffsetMs,
    Math.ceil((validated.endSample - validated.startSample) / 16));
});

test('last chunk accepts the full two-second decoder slack without trimming samples', () => {
  const sourceStartMs = 7_000;
  const value: MeetingAsrDispatchUnit = {
    chunkIndex: 6,
    chunkCount: 7,
    startSample: 4_800_000,
    endSample: (302_000 + 2_000) * 16,
    decodedSha256: SHA,
    startOffsetMs: sourceStartMs + 300_000,
    endOffsetMs: sourceStartMs + 304_000,
  };
  assert.deepEqual(validateMeetingAsrDispatchInput(value, {
    startOffsetMs: sourceStartMs,
    metadataDurationMs: 302_000,
  }), value);
});

test('rejects malformed shapes, extra or transcript keys, hashes, and unsafe numeric values', () => {
  const extra = { ...payload(), rawText: 'private transcript' };
  const symbolExtra = Object.assign(payload(), { [Symbol('extra')]: 1 });
  const invalidUnits: unknown[] = [
    null,
    [],
    extra,
    symbolExtra,
    { ...payload(), sourceHash: SHA },
    { ...payload(), wordOffsets: [] },
    { ...payload(), decodedSha256: SHA.toUpperCase() },
    { ...payload(), decodedSha256: 'a'.repeat(63) },
    { ...payload(), chunkIndex: Number.NaN },
    { ...payload(), chunkCount: 2.5 },
    { ...payload(), startSample: Number.POSITIVE_INFINITY },
    { ...payload(), endSample: Number.MAX_SAFE_INTEGER + 1 },
    { ...payload(), startOffsetMs: 120_000.5 },
    { ...payload(), endOffsetMs: Number.NaN },
    { ...payload(), startOffsetMs: Number.MAX_SAFE_INTEGER },
  ];
  for (const unit of invalidUnits) expectInvalid(() => validateMeetingAsrDispatchInput(unit));
});

test('enforces chunk order, exact starts, bounded ends, and full non-final chunks', () => {
  const invalidUnits = [
    payload({ chunkIndex: -1 }),
    payload({ chunkIndex: 7 }),
    payload({ chunkCount: 0 }),
    payload({ chunkCount: 8 }),
    payload({ chunkIndex: 1, chunkCount: 1 }),
    payload({ startSample: 800_001 }),
    payload({ endSample: 800_000 }),
    payload({ endSample: 1_600_001 }),
    payload({ endOffsetMs: 172_124 }),
    payload({ chunkIndex: 0, chunkCount: 2, startSample: 0, endSample: 799_999 }),
    payload({ chunkIndex: 0, chunkCount: 2, startSample: 0, endSample: 800_001 }),
    payload({ chunkIndex: 0, chunkCount: 1, startSample: 0, endSample: 0 }),
  ];
  for (const unit of invalidUnits) expectInvalid(() => validateMeetingAsrDispatchInput(unit));
});

test('source timing binds global offsets and metadata duration plus two-second sample cap', () => {
  const source = { startOffsetMs: SOURCE_START_MS, metadataDurationMs: 52_125 };
  expectInvalid(() => validateMeetingAsrDispatchInput(payload({ startOffsetMs: SOURCE_START_MS + 49_999 }), source));
  expectInvalid(() => validateMeetingAsrDispatchInput(payload({ endOffsetMs: SOURCE_START_MS + 52_124 }), source));
  const exactSlack = payload({
    endSample: 866_000,
    endOffsetMs: SOURCE_START_MS + 54_125,
  });
  assert.deepEqual(validateMeetingAsrDispatchInput(exactSlack, source), exactSlack);
  expectInvalid(() => validateMeetingAsrDispatchInput(payload({
    endSample: 866_001,
    endOffsetMs: SOURCE_START_MS + 54_126,
  }), source));

  for (const metadataDurationMs of [0, 302_001, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expectInvalid(() => validateMeetingAsrDispatchInput(payload(), {
      startOffsetMs: SOURCE_START_MS,
      metadataDurationMs,
    }));
  }
  expectInvalid(() => validateMeetingAsrDispatchInput(payload(), {
    startOffsetMs: Number.MAX_SAFE_INTEGER,
    metadataDurationMs: 52_125,
  }));
});

test('source timing rejects a short final chunk that omits most of the decoded audio', () => {
  const sourceStartMs = 120_000;
  const shortSingleChunk: MeetingAsrDispatchUnit = {
    chunkIndex: 0,
    chunkCount: 1,
    startSample: 0,
    endSample: 800_000,
    decodedSha256: SHA,
    startOffsetMs: sourceStartMs,
    endOffsetMs: sourceStartMs + 50_000,
  };

  expectInvalid(() => validateMeetingAsrDispatchInput(shortSingleChunk, {
    startOffsetMs: sourceStartMs,
    metadataDurationMs: 300_000,
  }));
});
