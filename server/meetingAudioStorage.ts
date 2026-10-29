import { KernelError } from './errors.js';

const STORAGE_API = 'https://storage.googleapis.com';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_GENERATION = 9_223_372_036_854_775_807n;

const MIME_EXTENSION = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
} as const;

type MeetingAudioMime = keyof typeof MIME_EXTENSION;
type MeetingAudioExtension = typeof MIME_EXTENSION[MeetingAudioMime];

const UUID_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const AUDIO_KEY_PATTERN = new RegExp(
  `^${UUID_PART}/${UUID_PART}/${UUID_PART}/${UUID_PART}/v([1-9][0-9]*)/(0|[1-9][0-9]*)\\.(webm|ogg|m4a|mp3|wav)$`,
);
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
const GENERATION_PATTERN = /^[1-9][0-9]{0,19}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

export interface MeetingAudioUploadResult {
  contentType: string;
  generation: string;
  size: number;
}

export interface MeetingAudioReadResult extends MeetingAudioUploadResult {
  bytes: Uint8Array;
}

export interface MeetingAudioStorage {
  upload(key: string, bytes: Uint8Array, mime: string, signal?: AbortSignal): Promise<MeetingAudioUploadResult>;
  read(key: string, signal?: AbortSignal): Promise<MeetingAudioReadResult>;
  delete(key: string, generation: string, signal?: AbortSignal): Promise<void>;
}

export interface GcsMeetingAudioStorageOptions {
  bucket: string;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

interface GcsObjectMetadata extends MeetingAudioUploadResult {
  name: string;
}

function storageError(message: string): KernelError {
  return new KernelError('MEETING_STORAGE_UNAVAILABLE', message, 503);
}

function conflictError(): KernelError {
  return new KernelError('MEETING_STORAGE_CONFLICT', 'Meeting audio object generation changed', 409);
}

function inputError(message: string): KernelError {
  return new KernelError('DOMAIN_DATA_INVALID', message, 400);
}

function configError(): KernelError {
  return new KernelError('CONFIG_INVALID', 'Meeting audio storage configuration is invalid', 503);
}

function normalizeMime(value: unknown): MeetingAudioMime {
  if (typeof value !== 'string' || value.length > 160) throw inputError('Meeting audio MIME type is invalid');
  const baseMime = value.split(';', 1)[0]?.trim().toLowerCase();
  if (!baseMime || !(baseMime in MIME_EXTENSION)) throw inputError('Meeting audio MIME type is not allowed');
  return baseMime as MeetingAudioMime;
}

function assertKey(key: unknown): { extension: MeetingAudioExtension } {
  if (typeof key !== 'string' || key.length > 256) throw inputError('Meeting audio object path is invalid');
  const match = AUDIO_KEY_PATTERN.exec(key);
  if (!match) throw inputError('Meeting audio object path is invalid');
  const segmentIndex = Number(match[2]);
  if (!Number.isSafeInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 4095) {
    throw inputError('Meeting audio segment index is invalid');
  }
  return { extension: match[3] as MeetingAudioExtension };
}

function assertMimeMatchesKey(key: string, mime: MeetingAudioMime): void {
  const { extension } = assertKey(key);
  if (MIME_EXTENSION[mime] !== extension) throw inputError('Meeting audio MIME type does not match its path');
}

function parseGeneration(value: unknown): string {
  if (typeof value !== 'string' || !GENERATION_PATTERN.test(value)) throw storageError('Meeting audio metadata is unavailable');
  try {
    if (BigInt(value) > MAX_GENERATION) throw storageError('Meeting audio metadata is unavailable');
  } catch {
    throw storageError('Meeting audio metadata is unavailable');
  }
  return value;
}

function parseSize(value: unknown): number {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) throw storageError('Meeting audio metadata is unavailable');
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_AUDIO_BYTES) {
    throw storageError('Meeting audio object size is invalid');
  }
  return size;
}

function parseMetadata(value: unknown, key: string): GcsObjectMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw storageError('Meeting audio metadata is unavailable');
  const record = value as Record<string, unknown>;
  if (record.name !== key || typeof record.contentType !== 'string') throw storageError('Meeting audio metadata is unavailable');
  const contentType = record.contentType;
  let normalizedMime: MeetingAudioMime;
  try {
    normalizedMime = normalizeMime(contentType);
  } catch {
    throw storageError('Meeting audio content type is invalid');
  }
  try {
    assertMimeMatchesKey(key, normalizedMime);
  } catch {
    throw storageError('Meeting audio content type is invalid');
  }
  return {
    name: key,
    contentType,
    generation: parseGeneration(record.generation),
    size: parseSize(record.size),
  };
}

function validateBucket(bucket: string): string {
  if (typeof bucket !== 'string' || bucket.length < 3 || bucket.length > 222 || !BUCKET_PATTERN.test(bucket)) {
    throw configError();
  }
  return bucket;
}

function validateToken(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192 || /[\s\p{Cc}]/u.test(value)) {
    throw storageError('Meeting audio storage is unavailable');
  }
  return value;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw storageError('Meeting audio storage operation was cancelled');
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A response body is never part of the public error surface.
  }
}

async function readBoundedBody(response: Response, limit: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!DECIMAL_PATTERN.test(declaredLength) || Number(declaredLength) > limit) {
      await cancelBody(response);
      throw storageError('Meeting audio response is too large');
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* Keep the bounded response error. */ }
        throw storageError('Meeting audio response is too large');
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof KernelError) throw error;
    throw storageError('Meeting audio response is unavailable');
  } finally {
    try { reader.releaseLock(); } catch { /* The stream may already be cancelled. */ }
  }

  if (declaredLength !== null && Number(declaredLength) !== total) {
    throw storageError('Meeting audio response size does not match metadata');
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const bytes = await readBoundedBody(response, MAX_METADATA_BYTES);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw storageError('Meeting audio metadata is unavailable');
  }
}

function objectUrl(bucket: string, key: string): URL {
  return new URL(`${STORAGE_API}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(key)}`);
}

function requestInit(token: string, signal?: AbortSignal, extraHeaders?: Record<string, string>): RequestInit {
  return {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    redirect: 'error',
    signal,
  };
}

export function createGcsMeetingAudioStorage(options: GcsMeetingAudioStorageOptions): MeetingAudioStorage {
  const bucket = validateBucket(options.bucket);
  if (typeof options.getAccessToken !== 'function') throw configError();
  const fetcher = options.fetchImpl ?? fetch;

  const accessToken = async (signal?: AbortSignal): Promise<string> => {
    checkAbort(signal);
    try {
      return validateToken(await options.getAccessToken());
    } catch {
      throw storageError('Meeting audio storage is unavailable');
    }
  };

  const performFetch = async (url: URL, init: RequestInit): Promise<Response> => {
    checkAbort(init.signal as AbortSignal | undefined);
    try {
      return await fetcher(url, init);
    } catch {
      throw storageError('Meeting audio storage is unavailable');
    }
  };

  return {
    async upload(key, bytes, mime, signal) {
      const { extension } = assertKey(key);
      const normalizedMime = normalizeMime(mime);
      if (MIME_EXTENSION[normalizedMime] !== extension) throw inputError('Meeting audio MIME type does not match its path');
      if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
        throw inputError('Meeting audio size is invalid');
      }
      checkAbort(signal);
      const token = await accessToken(signal);
      const url = new URL(`${STORAGE_API}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
      url.searchParams.set('uploadType', 'media');
      url.searchParams.set('name', key);
      url.searchParams.set('ifGenerationMatch', '0');
      const response = await performFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': normalizedMime,
        },
        body: bytes as unknown as RequestInit['body'],
        redirect: 'error',
        signal,
      });
      if (response.status === 412) {
        await cancelBody(response);
        throw conflictError();
      }
      if (!response.ok) {
        await cancelBody(response);
        throw storageError('Meeting audio upload is unavailable');
      }
      const metadata = parseMetadata(await readJsonBody(response), key);
      if (metadata.size !== bytes.byteLength || normalizeMime(metadata.contentType) !== normalizedMime) {
        throw storageError('Meeting audio upload metadata does not match the request');
      }
      return {
        contentType: metadata.contentType,
        generation: metadata.generation,
        size: metadata.size,
      };
    },

    async read(key, signal) {
      const { extension } = assertKey(key);
      checkAbort(signal);
      const token = await accessToken(signal);
      const metadataUrl = objectUrl(bucket, key);
      const metadataResponse = await performFetch(metadataUrl, requestInit(token, signal));
      if (!metadataResponse.ok) {
        await cancelBody(metadataResponse);
        throw storageError('Meeting audio object is unavailable');
      }
      const metadata = parseMetadata(await readJsonBody(metadataResponse), key);
      const metadataMime = normalizeMime(metadata.contentType);
      if (MIME_EXTENSION[metadataMime] !== extension) throw storageError('Meeting audio content type is invalid');

      checkAbort(signal);
      const mediaUrl = objectUrl(bucket, key);
      mediaUrl.searchParams.set('alt', 'media');
      mediaUrl.searchParams.set('generation', metadata.generation);
      const mediaResponse = await performFetch(mediaUrl, requestInit(token, signal));
      if (!mediaResponse.ok) {
        await cancelBody(mediaResponse);
        throw storageError('Meeting audio object generation is unavailable');
      }
      const mediaMimeValue = mediaResponse.headers.get('content-type');
      let mediaMime: MeetingAudioMime;
      try {
        mediaMime = normalizeMime(mediaMimeValue);
      } catch {
        await cancelBody(mediaResponse);
        throw storageError('Meeting audio content type is invalid');
      }
      if (mediaMime !== metadataMime) {
        await cancelBody(mediaResponse);
        throw storageError('Meeting audio content type changed');
      }
      const mediaGeneration = mediaResponse.headers.get('x-goog-generation');
      if (mediaGeneration !== null && mediaGeneration !== metadata.generation) {
        await cancelBody(mediaResponse);
        throw conflictError();
      }
      const bytes = await readBoundedBody(mediaResponse, MAX_AUDIO_BYTES);
      if (bytes.byteLength !== metadata.size) throw storageError('Meeting audio size does not match metadata');
      return {
        bytes,
        contentType: metadata.contentType,
        generation: metadata.generation,
        size: metadata.size,
      };
    },

    async delete(key, generation, signal) {
      assertKey(key);
      const exactGeneration = parseGeneration(generation);
      checkAbort(signal);
      const token = await accessToken(signal);
      const url = objectUrl(bucket, key);
      url.searchParams.set('ifGenerationMatch', exactGeneration);
      const response = await performFetch(url, {
        ...requestInit(token, signal),
        method: 'DELETE',
      });
      if (response.status === 404) {
        await cancelBody(response);
        return;
      }
      if (response.status === 412) {
        await cancelBody(response);
        throw conflictError();
      }
      if (!response.ok) {
        await cancelBody(response);
        throw storageError('Meeting audio delete is unavailable');
      }
      await cancelBody(response);
    },
  };
}
