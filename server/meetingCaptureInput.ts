import { createHash } from 'node:crypto';

import { KernelError } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const CONTROL_CHAR_RE = /[\p{Cc}]/u;
const MAX_EPOCHS = 128;
const MAX_SOURCE_GAPS = 4096;
const MAX_POINTER_INTERVALS = 500;
const MAX_POINTER_BATCH_BYTES = 128 * 1024;

export interface MeetingCaptureEpoch {
  readonly epoch: number;
  readonly captureOffsetMs: number;
  readonly monotonicStart: number;
  readonly durationMs: number;
  readonly gapBeforeMs: number;
}

export interface MeetingCaptureSourceGap {
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
  readonly reason: string;
}

export interface MeetingPointerInterval {
  readonly captureId: string;
  readonly clockEpoch: number;
  readonly sequence: number;
  readonly canonicalTaskId: string;
  readonly surfaceKind: string;
  readonly startedOffsetMs: number;
  readonly endedOffsetMs: number;
  readonly visible: boolean;
  readonly terminationReason: string;
}

export interface NormalizedPointerBatch {
  readonly batchKey: string;
  readonly digest: string;
  readonly intervals: readonly MeetingPointerInterval[];
  readonly ackSequence: number;
}

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function conflict(message: string): never {
  throw new KernelError('REVISION_CONFLICT', message, 409);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAlias(record: Record<string, unknown>, camel: string, snake?: string): unknown {
  return record[camel] ?? (snake ? record[snake] : undefined);
}

function numeric(value: unknown, field: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) invalid(`${field} is invalid`);
  if (typeof value === 'string' && CONTROL_CHAR_RE.test(value)) invalid(`${field} is invalid`);
  let parsed: number;
  try {
    parsed = Number(value);
  } catch {
    return invalid(`${field} is invalid`);
  }
  if (!Number.isFinite(parsed)) invalid(`${field} is invalid`);
  return parsed;
}

function safeInteger(value: unknown, field: string): number {
  const parsed = numeric(value, field);
  if (!Number.isSafeInteger(parsed)) invalid(`${field} is invalid`);
  return parsed;
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') invalid(`${field} is invalid`);
  if (CONTROL_CHAR_RE.test(value)) invalid(`${field} is invalid`);
  const text = value.trim();
  if (!text || text.length > maxLength) invalid(`${field} is invalid`);
  return text;
}

function exactText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value || value.length > maxLength || CONTROL_CHAR_RE.test(value)) {
    invalid(`${field} is invalid`);
  }
  return value;
}

export function requirePositiveVersion(value: unknown): number {
  const version = safeInteger(value, 'Source version');
  if (version < 1) invalid('Source version is invalid');
  return version;
}

export function requireUuid(value: unknown, field = 'Identifier'): string {
  if (typeof value !== 'string' || CONTROL_CHAR_RE.test(value) || !UUID_RE.test(value)) {
    invalid(`${field} is invalid`);
  }
  return value;
}

export function requireAudioMime(value: unknown): string {
  const raw = value === undefined || value === null ? 'audio/webm' : value;
  if (typeof raw !== 'string' || CONTROL_CHAR_RE.test(raw)) invalid('Audio MIME is not allowed');
  const mime = (raw.split(';', 1)[0] ?? '').trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME.has(mime)) invalid('Audio MIME is not allowed');
  return mime;
}

export function normalizeEpochManifest(value: unknown): MeetingCaptureEpoch[] {
  if (!Array.isArray(value) || value.length > MAX_EPOCHS) invalid('Epoch manifest is invalid');
  let previousEpoch = -1;
  let previousOffset = -1;
  return value.map((item, index) => {
    if (!isRecord(item)) invalid(`Epoch manifest is invalid at ${index}`);
    const epoch = safeInteger(item.epoch, `Epoch ${index}`);
    const captureOffsetMs = numeric(readAlias(item, 'captureOffsetMs', 'capture_offset_ms'), `Capture offset ${index}`);
    const monotonicStart = numeric(readAlias(item, 'monotonicStart', 'monotonic_start'), `Monotonic start ${index}`);
    const durationValue = readAlias(item, 'durationMs', 'duration_ms');
    const durationMs = durationValue === undefined || durationValue === null
      ? 0
      : numeric(durationValue, `Epoch duration ${index}`);
    const gapValue = readAlias(item, 'gapBeforeMs', 'gap_before_ms');
    const gapBeforeMs = gapValue === undefined || gapValue === null
      ? 0
      : safeInteger(gapValue, `Epoch gap ${index}`);

    if (epoch < 0 || epoch <= previousEpoch
      || captureOffsetMs < 0 || captureOffsetMs < previousOffset
      || monotonicStart < 0 || durationMs < 0 || gapBeforeMs < 0) {
      invalid(`Epoch manifest is invalid at ${index}`);
    }
    previousEpoch = epoch;
    previousOffset = captureOffsetMs;
    return { epoch, captureOffsetMs, monotonicStart, durationMs, gapBeforeMs };
  });
}

export function assertEpochManifestDoesNotRewind(existing: unknown, next: unknown): void {
  const existingRows = Array.isArray(existing) ? normalizeEpochManifest(existing) : [];
  const nextRows = normalizeEpochManifest(next);
  if (nextRows.length < existingRows.length) conflict('Epoch manifest cannot remove committed history');

  for (let index = 0; index < Math.max(0, existingRows.length - 1); index += 1) {
    const before = existingRows[index]!;
    const after = nextRows[index]!;
    if (before.epoch !== after.epoch
      || before.captureOffsetMs !== after.captureOffsetMs
      || before.monotonicStart !== after.monotonicStart
      || before.durationMs !== after.durationMs
      || before.gapBeforeMs !== after.gapBeforeMs) {
      conflict('Epoch manifest cannot rewrite committed history');
    }
  }

  if (existingRows.length === 0) return;
  const beforeTail = existingRows[existingRows.length - 1]!;
  const afterTail = nextRows[existingRows.length - 1]!;
  if (beforeTail.epoch !== afterTail.epoch
    || beforeTail.captureOffsetMs !== afterTail.captureOffsetMs
    || beforeTail.monotonicStart !== afterTail.monotonicStart
    || beforeTail.gapBeforeMs !== afterTail.gapBeforeMs
    || afterTail.durationMs < beforeTail.durationMs) {
    conflict('Epoch manifest cannot rewind or rewrite its current epoch');
  }
}

export function normalizeSourceGaps(value: unknown): MeetingCaptureSourceGap[] {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_GAPS) invalid('Source gaps are invalid');
  return value.map((item, index) => {
    if (!isRecord(item)) invalid(`Source gaps are invalid at ${index}`);
    const startOffsetMs = safeInteger(readAlias(item, 'startOffsetMs', 'start_offset_ms'), `Gap start ${index}`);
    const endOffsetMs = safeInteger(readAlias(item, 'endOffsetMs', 'end_offset_ms'), `Gap end ${index}`);
    const rawReason = item.reason ?? item.terminationReason ?? 'gap';
    if (typeof rawReason !== 'string' || CONTROL_CHAR_RE.test(rawReason)) invalid(`Source gaps are invalid at ${index}`);
    const reason = rawReason.slice(0, 80);
    if (startOffsetMs < 0 || endOffsetMs <= startOffsetMs || !reason) {
      invalid(`Source gaps are invalid at ${index}`);
    }
    return { startOffsetMs, endOffsetMs, reason };
  });
}

export function normalizePointerBatch(captureId: unknown, body: unknown): NormalizedPointerBatch {
  const normalizedCaptureId = requireUuid(captureId, 'Capture identifier');
  if (!isRecord(body) || !Array.isArray(body.intervals)) invalid('Pointer batch is invalid');
  const rawIntervals = body.intervals;
  if (rawIntervals.length > MAX_POINTER_INTERVALS) invalid('Pointer batch is too large');

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(rawIntervals);
  } catch {
    invalid('Pointer batch is invalid');
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_POINTER_BATCH_BYTES) {
    invalid('Pointer batch is too large');
  }

  const batchKey = exactText(body.batchKey, 'Pointer batch key', Number.MAX_SAFE_INTEGER);
  const suppliedDigest = exactText(body.digest, 'Pointer batch digest', 64);
  const digest = createHash('sha256').update(serialized, 'utf8').digest('hex');
  if (suppliedDigest !== digest) invalid('Pointer batch digest mismatch');

  const sequences = new Set<number>();
  let ackSequence = -1;
  const intervals = rawIntervals.map((item, index): MeetingPointerInterval => {
    if (!isRecord(item)) invalid(`Pointer interval ${index} is invalid`);
    const sequence = safeInteger(item.sequence, `Pointer sequence ${index}`);
    const clockEpoch = safeInteger(readAlias(item, 'clockEpoch', 'clock_epoch'), `Pointer clock epoch ${index}`);
    const startedOffsetMs = safeInteger(readAlias(item, 'startedOffsetMs', 'started_offset_ms'), `Pointer start ${index}`);
    const endedOffsetMs = safeInteger(readAlias(item, 'endedOffsetMs', 'ended_offset_ms'), `Pointer end ${index}`);
    const taskId = readAlias(item, 'canonicalTaskId', 'canonical_task_id');
    const canonicalTaskId = requireUuid(taskId, `Pointer task ${index}`);
    const itemCaptureIdRaw = readAlias(item, 'captureId', 'capture_id') ?? normalizedCaptureId;
    const itemCaptureId = requireUuid(itemCaptureIdRaw, `Pointer capture ${index}`);
    const surfaceValue = readAlias(item, 'surfaceKind', 'surface_kind') ?? 'unknown';
    const reasonValue = readAlias(item, 'terminationReason', 'termination_reason') ?? 'flush';
    const surfaceKind = boundedText(surfaceValue, `Pointer surface ${index}`, 120);
    const terminationReason = boundedText(reasonValue, `Pointer termination ${index}`, 80);
    if (itemCaptureId.toLowerCase() !== normalizedCaptureId.toLowerCase()) invalid('Pointer interval belongs to another capture');
    if (sequence < 0 || sequences.has(sequence)
      || clockEpoch < 0 || startedOffsetMs < 0 || endedOffsetMs <= startedOffsetMs) {
      invalid(`Pointer interval ${index} is invalid`);
    }
    sequences.add(sequence);
    ackSequence = Math.max(ackSequence, sequence);
    return {
      captureId: normalizedCaptureId,
      clockEpoch,
      sequence,
      canonicalTaskId,
      surfaceKind,
      startedOffsetMs,
      endedOffsetMs,
      visible: item.visible !== false,
      terminationReason,
    };
  });

  return { batchKey, digest, intervals, ackSequence };
}
