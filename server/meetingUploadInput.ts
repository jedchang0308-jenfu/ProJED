import { KernelError } from './errors.js';
import { requireAudioMime, requirePositiveVersion, requireUuid } from './meetingCaptureInput.js';

const MAX_SOURCE_VERSION = 2_147_483_647;
const MAX_SEGMENT_INDEX = 4095;
const MAX_EPOCH = 2_147_483_647;
const MAX_SEGMENT_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_SEGMENTS = 4096;
const MAX_MANIFEST_HASH_LENGTH = 256;
const MAX_OBJECT_PATH_LENGTH = 1024;
const CONTROL_CHAR = /\p{Cc}/u;
const SHA256 = /^[a-f0-9]{64}$/iu;
const SOURCE_COMPLETENESS = new Set(['complete', 'partial', 'missing']);
const BODY_FIELDS = new Set([
  'operation',
  'captureId',
  'expectedSourceVersion',
  'audioManifestHash',
  'pointerManifestHash',
  'sourceCompleteness',
  'audioManifest',
]);

export type NormalizedMeetingUploadAudioEntry = Readonly<{
  segmentIndex: number;
  epoch: number;
  bytes: number;
  startOffsetMs: number;
  endOffsetMs: number;
  overlapMs: number;
  gapBeforeMs: number;
  mime: string;
  sha256: string;
  objectPath: string;
}>;

export type NormalizedMeetingUploadCompletion = Readonly<{
  captureId: string;
  expectedSourceVersion: number;
  audioManifestHash: string;
  pointerManifestHash: string;
  sourceCompleteness: 'complete' | 'partial' | 'missing';
  audioManifest: readonly NormalizedMeetingUploadAudioEntry[];
}>;

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAlias(record: Record<string, unknown>, camel: string, snake: string): unknown {
  return record[camel] ?? record[snake];
}

function safeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '' || CONTROL_CHAR.test(value))) {
    invalid(`${field} is invalid`);
  }
  let parsed: number;
  try {
    parsed = Number(value);
  } catch {
    return invalid(`${field} is invalid`);
  }
  if (!Number.isSafeInteger(parsed)) invalid(`${field} is invalid`);
  return parsed;
}

function opaqueHash(value: unknown, field: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_MANIFEST_HASH_LENGTH
    || CONTROL_CHAR.test(value)
    || value.trim().length === 0) {
    invalid(`${field} is invalid`);
  }
  return value;
}

function objectPath(value: unknown): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_OBJECT_PATH_LENGTH
    || CONTROL_CHAR.test(value)) {
    invalid('Audio manifest object path is invalid');
  }
  return value;
}

function normalizeAudioEntry(value: unknown, position: number): NormalizedMeetingUploadAudioEntry {
  if (!isRecord(value)) invalid(`Audio manifest entry ${position} is invalid`);

  const segmentIndex = safeInteger(readAlias(value, 'segmentIndex', 'segment_index'), `Audio segment index ${position}`);
  const epoch = safeInteger(value.epoch, `Audio epoch ${position}`);
  const bytes = safeInteger(value.bytes, `Audio byte count ${position}`);
  const startOffsetMs = safeInteger(readAlias(value, 'startOffsetMs', 'start_offset_ms'), `Audio start offset ${position}`);
  const endOffsetMs = safeInteger(readAlias(value, 'endOffsetMs', 'end_offset_ms'), `Audio end offset ${position}`);
  const overlapValue = readAlias(value, 'overlapMs', 'overlap_ms');
  const gapValue = readAlias(value, 'gapBeforeMs', 'gap_before_ms');
  const overlapMs = overlapValue == null ? 0 : safeInteger(overlapValue, `Audio overlap ${position}`);
  const gapBeforeMs = gapValue == null ? 0 : safeInteger(gapValue, `Audio gap ${position}`);
  const mime = requireAudioMime(value.mime);
  const rawSha256 = value.sha256;
  if (typeof rawSha256 !== 'string' || !SHA256.test(rawSha256)) {
    invalid(`Audio SHA-256 ${position} is invalid`);
  }
  const sha256 = rawSha256.toLowerCase();
  const path = objectPath(readAlias(value, 'objectPath', 'object_path'));

  if (segmentIndex < 0 || segmentIndex > MAX_SEGMENT_INDEX) {
    invalid(`Audio segment index ${position} is invalid`);
  }
  if (epoch < 0 || epoch > MAX_EPOCH) invalid(`Audio epoch ${position} is invalid`);
  if (bytes < 1 || bytes > MAX_SEGMENT_BYTES) invalid(`Audio byte count ${position} is invalid`);
  if (startOffsetMs < 0 || endOffsetMs <= startOffsetMs) {
    invalid(`Audio offsets ${position} are invalid`);
  }
  if (overlapMs < 0 || overlapMs > 500 || gapBeforeMs < 0) {
    invalid(`Audio timeline ${position} is invalid`);
  }

  return {
    segmentIndex,
    epoch,
    bytes,
    startOffsetMs,
    endOffsetMs,
    overlapMs,
    gapBeforeMs,
    mime,
    sha256,
    objectPath: path,
  };
}

export function normalizeMeetingUploadCompletion(body: unknown): NormalizedMeetingUploadCompletion {
  if (!isRecord(body)) invalid('Meeting upload completion is invalid');
  if (Object.keys(body).some(key => !BODY_FIELDS.has(key))) invalid('Unknown meeting upload completion field');
  if (body.operation !== 'complete-upload') invalid('Meeting upload operation is invalid');

  const captureId = requireUuid(body.captureId, 'Capture identifier');
  const expectedSourceVersion = requirePositiveVersion(body.expectedSourceVersion);
  if (expectedSourceVersion > MAX_SOURCE_VERSION) invalid('Source version is invalid');

  const rawCompleteness = body.sourceCompleteness;
  if (typeof rawCompleteness !== 'string' || !SOURCE_COMPLETENESS.has(rawCompleteness)) {
    invalid('Source completeness is invalid');
  }
  const sourceCompleteness = rawCompleteness as 'complete' | 'partial' | 'missing';

  const audioManifestHash = opaqueHash(body.audioManifestHash, 'Audio manifest hash');
  const pointerManifestHash = opaqueHash(body.pointerManifestHash, 'Pointer manifest hash');
  const rawManifest = body.audioManifest == null ? [] : body.audioManifest;
  if (!Array.isArray(rawManifest) || rawManifest.length > MAX_MANIFEST_SEGMENTS) {
    invalid('Audio manifest is invalid');
  }

  const indexes = new Set<number>();
  const audioManifest = rawManifest.map((entry, position) => {
    const normalized = normalizeAudioEntry(entry, position);
    if (indexes.has(normalized.segmentIndex)) invalid('Audio manifest contains duplicate segment indexes');
    indexes.add(normalized.segmentIndex);
    return normalized;
  });

  if (sourceCompleteness === 'complete') {
    if (audioManifest.length === 0) invalid('Complete source requires audio segments');
    for (let index = 0; index < audioManifest.length; index += 1) {
      if (!indexes.has(index)) invalid('Complete audio manifest indexes must be contiguous');
    }
  }

  return {
    captureId,
    expectedSourceVersion,
    audioManifestHash,
    pointerManifestHash,
    sourceCompleteness,
    audioManifest,
  };
}
