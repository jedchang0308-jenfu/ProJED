import { HttpApiClient, HttpApiError } from './httpApiClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/v([1-9][0-9]{0,9})\/(0|[1-9][0-9]{0,3})\.(m4a|mp3|wav|ogg|webm)$/u;
const AUDIO_MIME_EXTENSION: Readonly<Record<string, string>> = {
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};
const MAX_SOURCE_VERSION = 2_147_483_647;
const MAX_SEGMENT_INDEX = 4095;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_RESERVATION_KEY = 180;
const CONTROL_CHARS = /[\p{Cc}]/u;

export interface MeetingAudioReservePayload {
  readonly captureId: string;
  readonly expectedSourceVersion: number;
  readonly segmentIndex: number;
  readonly mime: string;
  readonly bytes?: number;
  readonly epoch?: number;
  readonly startOffsetMs?: number;
  readonly endOffsetMs?: number;
  readonly overlapMs?: number;
  readonly gapBeforeMs?: number;
  readonly reservationKey?: string;
}

export interface MeetingAudioReservation {
  readonly segmentId: string;
  readonly sourceVersion: number;
  readonly segmentIndex: number;
  readonly uploadUrl: string;
  readonly expiresAt: number;
  readonly uploadState: 'pending' | 'uploading' | 'verified';
  readonly alreadyVerified: boolean;
  readonly sha256: string | null;
  readonly bytes: number;
}

function isUploadState(value: unknown): value is MeetingAudioReservation['uploadState'] {
  return value === 'pending' || value === 'uploading' || value === 'verified';
}

export interface MeetingAudioUploadReservation {
  readonly segmentId: string;
  readonly uploadUrl: string;
  readonly sourceVersion: number;
}

export interface MeetingAudioVerifyPayload {
  readonly captureId: string;
  readonly expectedSourceVersion: number;
  readonly segmentIndex: number;
}

export interface MeetingAudioSegment {
  readonly id: string;
  readonly segmentIndex: number;
  readonly sourceVersion: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly uploadState: 'verified';
}

export interface HttpMeetingAudioAdapter {
  reserve(payload: MeetingAudioReservePayload, signal?: AbortSignal): Promise<MeetingAudioReservation>;
  upload(reservation: MeetingAudioUploadReservation, blob: Blob, signal?: AbortSignal): Promise<MeetingAudioSegment>;
  verify(payload: MeetingAudioVerifyPayload, signal?: AbortSignal): Promise<MeetingAudioSegment>;
  playback(recordId: string, segmentId: string, signal?: AbortSignal): Promise<{
    segmentId: string;
    blob: Blob;
    expiresAt: number;
  }>;
}

function invalidRequest(): never {
  throw new HttpApiError('INVALID_MEETING_AUDIO_REQUEST', 400, null, false);
}

function invalidResponse(): never {
  throw new HttpApiError('INVALID_MEETING_AUDIO_RESPONSE', 502, null, false);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidResponse();
  return value as Record<string, unknown>;
}

function requestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidRequest();
  return value as Record<string, unknown>;
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => required.includes(key) || optional.includes(key));
}

function canonicalUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) invalidRequest();
  return value;
}

function sourceVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_SOURCE_VERSION) {
    invalidRequest();
  }
  return value;
}

function segmentIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_SEGMENT_INDEX) {
    invalidRequest();
  }
  return value;
}

function safeInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalidRequest();
  return value;
}

function audioMime(value: unknown): string {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) invalidRequest();
  const mime = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!Object.prototype.hasOwnProperty.call(AUDIO_MIME_EXTENSION, mime)) invalidRequest();
  return mime;
}

function safeRecordId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512
      || !value.trim() || CONTROL_CHARS.test(value)) invalidRequest();
  return value;
}

function segmentPath(segmentId: string): string {
  return `/api/v1/meeting-audio/${segmentId}`;
}

function validateObjectPath(value: unknown, captureId: string, version: number, index: number, mime: string): void {
  if (typeof value !== 'string') invalidResponse();
  const match = UUID_PATH_RE.exec(value);
  if (!match || !match.slice(1, 5).every(id => UUID_RE.test(id))
      || match[4] !== captureId || Number(match[5]) !== version || Number(match[6]) !== index
      || match[7] !== AUDIO_MIME_EXTENSION[mime]) invalidResponse();
}

function normalizeReservePayload(payload: MeetingAudioReservePayload): {
  captureId: string;
  expectedSourceVersion: number;
  segmentIndex: number;
  mime: string;
  body: Record<string, unknown>;
} {
  const input = requestObject(payload);
  const allowed = [
    'captureId', 'expectedSourceVersion', 'segmentIndex', 'mime', 'bytes', 'epoch', 'startOffsetMs',
    'endOffsetMs', 'overlapMs', 'gapBeforeMs', 'reservationKey',
  ] as const;
  if (!hasExactKeys(input, ['captureId', 'expectedSourceVersion', 'segmentIndex', 'mime'], allowed.slice(4))) invalidRequest();

  const captureId = canonicalUuid(input.captureId);
  const version = sourceVersion(input.expectedSourceVersion);
  const index = segmentIndex(input.segmentIndex);
  const mime = audioMime(input.mime);
  const body: Record<string, unknown> = {
    operation: 'reserve-segment',
    captureId,
    expectedSourceVersion: version,
    segmentIndex: index,
    mime,
  };

  if (input.bytes !== undefined) body.bytes = safeInteger(input.bytes, 0, MAX_AUDIO_BYTES);
  if (input.epoch !== undefined) body.epoch = safeInteger(input.epoch, 0);
  if (input.overlapMs !== undefined) body.overlapMs = safeInteger(input.overlapMs, 0, 500);
  if (input.gapBeforeMs !== undefined) body.gapBeforeMs = safeInteger(input.gapBeforeMs, 0);
  if (input.reservationKey !== undefined) {
    if (typeof input.reservationKey !== 'string' || input.reservationKey.length === 0
        || input.reservationKey.length > MAX_RESERVATION_KEY || !input.reservationKey.trim()
        || CONTROL_CHARS.test(input.reservationKey)) invalidRequest();
    body.reservationKey = input.reservationKey;
  }

  const start = input.startOffsetMs === undefined ? 0 : safeInteger(input.startOffsetMs, 0);
  const end = input.endOffsetMs === undefined ? 0 : safeInteger(input.endOffsetMs, 0);
  const normalizedEnd = end === 0 ? start + 1 : end;
  if (!Number.isSafeInteger(normalizedEnd) || normalizedEnd <= start) invalidRequest();
  if (input.startOffsetMs !== undefined) body.startOffsetMs = start;
  if (input.endOffsetMs !== undefined) body.endOffsetMs = end;
  return { captureId, expectedSourceVersion: version, segmentIndex: index, mime, body };
}

function parseEnvelope(value: unknown): Record<string, unknown> {
  const envelope = object(value);
  if (!hasExactKeys(envelope, ['data'])) invalidResponse();
  return object(envelope.data);
}

async function requestMeetingControl(client: HttpApiClient, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  try {
    return await client.request<unknown>('/api/v1/meeting-control', { method: 'POST', body, signal });
  } catch (error) {
    if (!(error instanceof HttpApiError)) throw error;
    throw new HttpApiError(error.code, error.status, error.requestId, error.retryable, error.retryAfterMs);
  }
}

function parseSegment(value: unknown, expected: { sourceVersion: number; captureId?: string; segmentIndex?: number }): MeetingAudioSegment {
  const segment = object(value);
  if (!hasExactKeys(segment, ['id', 'segment_index', 'source_version', 'bytes', 'sha256', 'upload_state', 'object_path'])) {
    invalidResponse();
  }
  if (typeof segment.id !== 'string' || !UUID_RE.test(segment.id)
      || segment.source_version !== expected.sourceVersion
      || !Number.isSafeInteger(segment.segment_index) || Number(segment.segment_index) < 0
      || Number(segment.segment_index) > MAX_SEGMENT_INDEX
      || (expected.segmentIndex !== undefined && segment.segment_index !== expected.segmentIndex)
      || !Number.isSafeInteger(segment.bytes) || Number(segment.bytes) < 1 || Number(segment.bytes) > MAX_AUDIO_BYTES
      || typeof segment.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(segment.sha256)
      || segment.upload_state !== 'verified') invalidResponse();
  if (expected.captureId !== undefined) {
    const match = typeof segment.object_path === 'string' ? UUID_PATH_RE.exec(segment.object_path) : null;
    if (!match || !match.slice(1, 5).every(id => UUID_RE.test(id))
        || match[4] !== expected.captureId || Number(match[5]) !== expected.sourceVersion
        || Number(match[6]) !== Number(segment.segment_index)) invalidResponse();
  } else {
    const match = typeof segment.object_path === 'string' ? UUID_PATH_RE.exec(segment.object_path) : null;
    if (!match || !match.slice(1, 5).every(id => UUID_RE.test(id))
        || Number(match[5]) !== expected.sourceVersion
        || Number(match[6]) !== Number(segment.segment_index)) invalidResponse();
  }
  return {
    id: segment.id,
    segmentIndex: Number(segment.segment_index),
    sourceVersion: expected.sourceVersion,
    bytes: Number(segment.bytes),
    sha256: segment.sha256,
    uploadState: 'verified',
  };
}

export function createHttpMeetingAudioAdapter(client: HttpApiClient): HttpMeetingAudioAdapter {
  return {
    async reserve(payload, signal) {
      const input = normalizeReservePayload(payload);
      const response = await requestMeetingControl(client, input.body, signal);
      const data = parseEnvelope(response);
      if (!hasExactKeys(data, [
        'segmentId', 'sourceVersion', 'segmentIndex', 'path', 'uploadUrl', 'token', 'signedUrl',
        'expiresAt', 'uploadState', 'alreadyVerified', 'sha256', 'bytes',
      ])) invalidResponse();
      if (typeof data.segmentId !== 'string' || !UUID_RE.test(data.segmentId)
          || data.sourceVersion !== input.expectedSourceVersion || data.segmentIndex !== input.segmentIndex
          || data.uploadUrl !== segmentPath(data.segmentId) || data.token !== null || data.signedUrl !== null
          || !Number.isSafeInteger(data.expiresAt) || Number(data.expiresAt) < 0
          || !isUploadState(data.uploadState) || typeof data.alreadyVerified !== 'boolean'
          || data.alreadyVerified !== (data.uploadState === 'verified')
          || (data.sha256 !== null && (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(data.sha256)))
          || !Number.isSafeInteger(data.bytes) || Number(data.bytes) < 0 || Number(data.bytes) > MAX_AUDIO_BYTES) {
        invalidResponse();
      }
      validateObjectPath(data.path, input.captureId, input.expectedSourceVersion, input.segmentIndex, input.mime);
      return {
        segmentId: data.segmentId,
        sourceVersion: input.expectedSourceVersion,
        segmentIndex: input.segmentIndex,
        uploadUrl: data.uploadUrl,
        expiresAt: Number(data.expiresAt),
        uploadState: data.uploadState,
        alreadyVerified: data.alreadyVerified,
        sha256: data.sha256,
        bytes: Number(data.bytes),
      };
    },

    async upload(reservation, blob, signal) {
      const input = requestObject(reservation);
      if (!hasExactKeys(input, ['segmentId', 'uploadUrl', 'sourceVersion'])) invalidRequest();
      const id = canonicalUuid(input.segmentId);
      const version = sourceVersion(input.sourceVersion);
      const url = segmentPath(id);
      if (input.uploadUrl !== url) invalidRequest();
      const response = await client.putMeetingAudio<unknown>(url, blob, version, signal);
      const data = parseEnvelope(response);
      if (!hasExactKeys(data, ['segment'])) invalidResponse();
      const segment = parseSegment(data.segment, { sourceVersion: version });
      if (segment.bytes !== blob.size) invalidResponse();
      return segment;
    },

    async verify(payload, signal) {
      if (!hasExactKeys(requestObject(payload), ['captureId', 'expectedSourceVersion', 'segmentIndex'])) invalidRequest();
      const captureId = canonicalUuid(payload.captureId);
      const version = sourceVersion(payload.expectedSourceVersion);
      const index = segmentIndex(payload.segmentIndex);
      const response = await requestMeetingControl(client, {
        operation: 'verify-segment', captureId, expectedSourceVersion: version, segmentIndex: index,
      }, signal);
      const data = parseEnvelope(response);
      if (!hasExactKeys(data, ['segment'])) invalidResponse();
      return parseSegment(data.segment, { captureId, sourceVersion: version, segmentIndex: index });
    },

    async playback(recordId, segmentId, signal) {
      const id = canonicalUuid(segmentId);
      const audio = await client.getMeetingAudio(segmentPath(id), safeRecordId(recordId), signal);
      return { segmentId: id, blob: audio.blob, expiresAt: audio.expiresAt };
    },
  };
}
