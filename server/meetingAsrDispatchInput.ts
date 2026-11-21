import { KernelError } from './errors.js';

const SAMPLE_RATE_HZ = 16_000;
const SAMPLES_PER_MS = SAMPLE_RATE_HZ / 1000;
const MAX_CHUNK_SAMPLES = SAMPLE_RATE_HZ * 50;
const MAX_CHUNK_INDEX = 6;
const MAX_CHUNK_COUNT = 7;
const MAX_SOURCE_DURATION_MS = 302_000;
const DURATION_SLACK_MS = 2_000;
const MAX_END_SAMPLE = (MAX_SOURCE_DURATION_MS + DURATION_SLACK_MS) * SAMPLES_PER_MS;
const SHA256_RE = /^[a-f0-9]{64}$/u;

const UNIT_KEYS = Object.freeze([
  'chunkIndex', 'chunkCount', 'startSample', 'endSample', 'decodedSha256', 'startOffsetMs', 'endOffsetMs',
]);

export interface MeetingAsrDispatchUnit {
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly startSample: number;
  readonly endSample: number;
  readonly decodedSha256: string;
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
}

export interface MeetingAsrDispatchSourceTiming {
  readonly startOffsetMs: number;
  readonly metadataDurationMs: number;
}

function invalid(): never {
  throw new KernelError('DOMAIN_DATA_INVALID', 'Meeting ASR dispatch input is invalid', 409);
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function exactUnitRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== UNIT_KEYS.length || keys.some(key => typeof key !== 'string' || !UNIT_KEYS.includes(key))) invalid();
  for (const key of UNIT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
  }
  return value as Record<string, unknown>;
}

function sourceTimingValues(source: MeetingAsrDispatchSourceTiming): {
  startOffsetMs: number;
  metadataDurationMs: number;
} {
  if (typeof source !== 'object' || source === null) invalid();
  const startDescriptor = Object.getOwnPropertyDescriptor(source, 'startOffsetMs');
  const durationDescriptor = Object.getOwnPropertyDescriptor(source, 'metadataDurationMs');
  if (!startDescriptor || !Object.hasOwn(startDescriptor, 'value')
      || !durationDescriptor || !Object.hasOwn(durationDescriptor, 'value')) invalid();
  const startOffsetMs: unknown = startDescriptor.value;
  const metadataDurationMs: unknown = durationDescriptor.value;
  if (!isSafeNonnegativeInteger(startOffsetMs)
      || !Number.isSafeInteger(metadataDurationMs) || Number(metadataDurationMs) < 1
      || Number(metadataDurationMs) > MAX_SOURCE_DURATION_MS
      || !Number.isSafeInteger(startOffsetMs + Number(metadataDurationMs) + DURATION_SLACK_MS)) invalid();
  return { startOffsetMs, metadataDurationMs: Number(metadataDurationMs) };
}

/** Validate the exact metadata-only payload persisted before an ASR provider dispatch. */
export function validateMeetingAsrDispatchInput(
  input: unknown,
  source?: MeetingAsrDispatchSourceTiming,
): MeetingAsrDispatchUnit {
  try {
    const value = exactUnitRecord(input);
    const chunkIndex = value.chunkIndex;
    const chunkCount = value.chunkCount;
    const startSample = value.startSample;
    const endSample = value.endSample;
    const decodedSha256 = value.decodedSha256;
    const startOffsetMs = value.startOffsetMs;
    const endOffsetMs = value.endOffsetMs;

    if (!Number.isSafeInteger(chunkIndex) || Number(chunkIndex) < 0 || Number(chunkIndex) > MAX_CHUNK_INDEX
        || !Number.isSafeInteger(chunkCount) || Number(chunkCount) < 1 || Number(chunkCount) > MAX_CHUNK_COUNT
        || Number(chunkIndex) >= Number(chunkCount)
        || !Number.isSafeInteger(startSample) || Number(startSample) !== Number(chunkIndex) * MAX_CHUNK_SAMPLES
        || !Number.isSafeInteger(endSample) || Number(endSample) <= Number(startSample)
        || Number(endSample) > Number(startSample) + MAX_CHUNK_SAMPLES
        || Number(endSample) > MAX_END_SAMPLE
        || (Number(chunkIndex) < Number(chunkCount) - 1
          && Number(endSample) !== Number(startSample) + MAX_CHUNK_SAMPLES)
        || typeof decodedSha256 !== 'string' || !SHA256_RE.test(decodedSha256)
        || !isSafeNonnegativeInteger(startOffsetMs) || !isSafeNonnegativeInteger(endOffsetMs)
        || Number(endOffsetMs) <= Number(startOffsetMs)) invalid();

    const durationMs = Math.ceil((Number(endSample) - Number(startSample)) / SAMPLES_PER_MS);
    if (Number(endOffsetMs) - Number(startOffsetMs) !== durationMs) invalid();

    if (source !== undefined) {
      const timing = sourceTimingValues(source);
      if (Number(endSample) > (timing.metadataDurationMs + DURATION_SLACK_MS) * SAMPLES_PER_MS) invalid();
      if (Number(chunkIndex) === Number(chunkCount) - 1
          && Number(endSample) < Math.max(0, timing.metadataDurationMs - DURATION_SLACK_MS) * SAMPLES_PER_MS) invalid();
      const expectedStartOffsetMs = timing.startOffsetMs + Number(startSample) / SAMPLES_PER_MS;
      const expectedEndOffsetMs = Math.ceil(timing.startOffsetMs + Number(endSample) / SAMPLES_PER_MS);
      if (!Number.isSafeInteger(expectedStartOffsetMs) || !Number.isSafeInteger(expectedEndOffsetMs)
          || Number(startOffsetMs) !== expectedStartOffsetMs || Number(endOffsetMs) !== expectedEndOffsetMs) invalid();
    }

    return Object.freeze({
      chunkIndex: Number(chunkIndex), chunkCount: Number(chunkCount),
      startSample: Number(startSample), endSample: Number(endSample), decodedSha256,
      startOffsetMs: Number(startOffsetMs), endOffsetMs: Number(endOffsetMs),
    });
  } catch (error) {
    if (error instanceof KernelError && error.code === 'DOMAIN_DATA_INVALID') throw error;
    return invalid();
  }
}
