import { KernelError } from './errors.js';
import { requireAudioMime, requireUuid } from './meetingCaptureInput.js';

const MAX_SOURCE_VERSION = 2_147_483_647;
const MAX_SEGMENT_INDEX = 4095;
const MAX_AUDIO_SEGMENT_BYTES = 10 * 1024 * 1024;
const MAX_RESERVATION_KEY_LENGTH = 180;
const CONTROL_CHAR_RE = /[\p{Cc}]/u;
const INTEGER_TEXT_RE = /^\d+$/u;

const RESERVATION_FIELDS = new Set([
  'operation',
  'captureId',
  'expectedSourceVersion',
  'segmentIndex',
  'epoch',
  'bytes',
  'startOffsetMs',
  'start_offset_ms',
  'endOffsetMs',
  'end_offset_ms',
  'overlapMs',
  'overlap_ms',
  'gapBeforeMs',
  'gap_before_ms',
  'mime',
  'reservationKey',
]);

export interface MeetingAudioReservation {
  readonly captureId: string;
  readonly sourceVersion: number;
  readonly segmentIndex: number;
  readonly epoch: number;
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
  readonly overlapMs: number;
  readonly gapBeforeMs: number;
  readonly mime: string;
  readonly bytes: number;
  readonly reservationKey: string;
}

export interface MeetingAudioObjectKeyInput {
  readonly tenantId: string;
  readonly projectId: string;
  readonly recordId: string;
  readonly captureId: string;
  readonly sourceVersion: number;
  readonly segmentIndex: number;
  readonly mime: string;
}

function invalid(message: string): never {
  throw new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function conflict(message: string): never {
  throw new KernelError('REVISION_CONFLICT', message, 409);
}

function parseSafeInteger(value: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.length > 0 && INTEGER_TEXT_RE.test(value)) {
    parsed = Number(value);
  } else {
    return invalid(`${field} is invalid`);
  }
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) invalid(`${field} is invalid`);
  return parsed;
}

function parseSourceVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_SOURCE_VERSION) {
    invalid('Source version is invalid');
  }
  return value;
}

function optionalAlias(
  body: Record<string, unknown>,
  camelName: string,
  snakeName: string,
  defaultValue: number,
): unknown {
  if (Object.hasOwn(body, camelName)) return body[camelName];
  if (Object.hasOwn(body, snakeName)) return body[snakeName];
  return defaultValue;
}

function reservationKey(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RESERVATION_KEY_LENGTH
      || !value.trim() || CONTROL_CHAR_RE.test(value)) {
    invalid('Reservation key is invalid');
  }
  return value;
}

function canonicalScopeUuid(value: unknown, field: string): string {
  return requireUuid(value, field).toLowerCase();
}

function audioExtension(mime: string): string {
  switch (mime) {
    case 'audio/mp4': return 'm4a';
    case 'audio/mpeg': return 'mp3';
    case 'audio/wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    default: return 'webm';
  }
}

export function normalizeMeetingAudioReservation(
  captureId: string,
  sourceVersion: number,
  body: Record<string, unknown>,
): MeetingAudioReservation {
  const normalizedCaptureId = canonicalScopeUuid(captureId, 'Capture identifier');
  const normalizedSourceVersion = parseSourceVersion(sourceVersion);
  for (const key of Reflect.ownKeys(body)) {
    if (typeof key !== 'string' || !RESERVATION_FIELDS.has(key)) invalid('Audio reservation contains an unknown field');
  }

  if (body.captureId !== undefined
      && canonicalScopeUuid(body.captureId, 'Capture identifier') !== normalizedCaptureId) {
    invalid('Audio reservation capture does not match its server scope');
  }
  if (body.expectedSourceVersion !== undefined) {
    const expectedVersion = parseSafeInteger(body.expectedSourceVersion, 'Expected source version', 1, MAX_SOURCE_VERSION);
    if (expectedVersion !== normalizedSourceVersion) conflict('Meeting source version changed');
  }

  const segmentIndex = parseSafeInteger(body.segmentIndex, 'Segment index', 0, MAX_SEGMENT_INDEX);
  const epoch = parseSafeInteger(body.epoch === undefined ? 0 : body.epoch, 'Audio epoch', 0);
  const bytes = parseSafeInteger(body.bytes === undefined ? 0 : body.bytes, 'Audio byte count', 0, MAX_AUDIO_SEGMENT_BYTES);
  const startOffsetMs = parseSafeInteger(
    optionalAlias(body, 'startOffsetMs', 'start_offset_ms', 0),
    'Audio start offset',
    0,
  );
  const suppliedEndOffsetMs = parseSafeInteger(
    optionalAlias(body, 'endOffsetMs', 'end_offset_ms', 0),
    'Audio end offset',
    0,
  );
  const endOffsetMs = suppliedEndOffsetMs === 0 ? startOffsetMs + 1 : suppliedEndOffsetMs;
  if (!Number.isSafeInteger(endOffsetMs) || endOffsetMs <= startOffsetMs) invalid('Audio segment timeline is invalid');
  const overlapMs = parseSafeInteger(optionalAlias(body, 'overlapMs', 'overlap_ms', 0), 'Audio overlap', 0, 500);
  const gapBeforeMs = parseSafeInteger(optionalAlias(body, 'gapBeforeMs', 'gap_before_ms', 0), 'Audio gap', 0);
  const mime = requireAudioMime(body.mime);
  const key = reservationKey(body.reservationKey, `${normalizedCaptureId}:v${normalizedSourceVersion}:segment:${segmentIndex}`);

  return {
    captureId: normalizedCaptureId,
    sourceVersion: normalizedSourceVersion,
    segmentIndex,
    epoch,
    startOffsetMs,
    endOffsetMs,
    overlapMs,
    gapBeforeMs,
    mime,
    bytes,
    reservationKey: key,
  };
}

export function buildMeetingAudioObjectKey(input: MeetingAudioObjectKeyInput): string {
  const tenantId = canonicalScopeUuid(input.tenantId, 'Tenant identifier');
  const projectId = canonicalScopeUuid(input.projectId, 'Project identifier');
  const recordId = canonicalScopeUuid(input.recordId, 'Record identifier');
  const captureId = canonicalScopeUuid(input.captureId, 'Capture identifier');
  const sourceVersion = parseSourceVersion(input.sourceVersion);
  if (typeof input.segmentIndex !== 'number') invalid('Segment index is invalid');
  const segmentIndex = parseSafeInteger(input.segmentIndex, 'Segment index', 0, MAX_SEGMENT_INDEX);
  const mime = requireAudioMime(input.mime);
  return `${tenantId}/${projectId}/${recordId}/${captureId}/v${sourceVersion}/${segmentIndex}.${audioExtension(mime)}`;
}
