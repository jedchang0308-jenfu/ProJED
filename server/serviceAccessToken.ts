import { KernelError } from './errors.js';

const METADATA_ACCESS_TOKEN_ENDPOINT = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_ACCESS_TOKEN_BYTES = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
const CACHE_SKEW_MS = 60_000;

function unavailable(): KernelError {
  return new KernelError('MEETING_STORAGE_UNAVAILABLE', 'Service access token is unavailable', 503);
}

function configInvalid(): KernelError {
  return new KernelError('CONFIG_INVALID', 'Service access token configuration is invalid', 503);
}

function cancelResponse(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // A body can already be locked by the bounded reader.
  }
}

async function readBoundedBody(
  response: Response,
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array> | undefined) => void,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength) || !Number.isSafeInteger(Number(declaredLength))
      || Number(declaredLength) > MAX_RESPONSE_BYTES) {
      cancelResponse(response);
      throw unavailable();
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  onReader(reader);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw unavailable();
      }
      chunks.push(part.value);
    }
  } catch {
    throw unavailable();
  } finally {
    onReader(undefined);
    try { reader.releaseLock(); } catch { /* The stream may already be cancelled. */ }
  }
  if (declaredLength !== null && Number(declaredLength) !== total) throw unavailable();

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

interface AccessTokenResponse {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

function parseAccessTokenResponse(value: unknown): AccessTokenResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  const record = value as Record<string, unknown>;
  const token = record.access_token;
  if (typeof token !== 'string' || token.length === 0 || Buffer.byteLength(token, 'utf8') > MAX_ACCESS_TOKEN_BYTES
    || /[\s\p{Cc}]/u.test(token)) {
    throw unavailable();
  }
  if (record.token_type !== 'Bearer') throw unavailable();
  const expiresInSeconds = record.expires_in;
  if (typeof expiresInSeconds !== 'number' || !Number.isSafeInteger(expiresInSeconds)
    || expiresInSeconds < 1 || expiresInSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw unavailable();
  }
  return { accessToken: token, expiresInSeconds };
}

async function fetchAccessToken(fetchImpl: typeof fetch, timeoutMs: number): Promise<AccessTokenResponse> {
  const controller = new AbortController();
  let response: Response | undefined;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let rejectTimeout!: (reason: KernelError) => void;
  const timeoutPromise = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const timeout = setTimeout(() => {
    controller.abort();
    if (activeReader) void activeReader.cancel().catch(() => undefined);
    else if (response) cancelResponse(response);
    rejectTimeout(unavailable());
  }, timeoutMs);

  const request = async (): Promise<AccessTokenResponse> => {
    try {
      response = await fetchImpl(METADATA_ACCESS_TOKEN_ENDPOINT, {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google', accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw unavailable();
    }
    if (response.status !== 200 || !response.ok || response.redirected || response.type === 'opaqueredirect') {
      cancelResponse(response);
      throw unavailable();
    }

    const bytes = await readBoundedBody(response, reader => { activeReader = reader; });
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw unavailable();
    }
    return parseAccessTokenResponse(parsed);
  };

  try {
    return await Promise.race([request(), timeoutPromise]);
  } catch {
    throw unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

export interface ServiceAccessTokenProviderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Injectable clock for deterministic cache-expiry verification. */
  readonly now?: () => number;
}

/** Fetches and briefly caches an OAuth access token from the Cloud Run metadata server. */
export function createServiceAccessTokenProvider(
  options: ServiceAccessTokenProviderOptions = {},
): () => Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) throw configInvalid();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') throw configInvalid();

  let cached: { token: string; refreshAt: number } | undefined;
  let inFlight: Promise<string> | undefined;

  return () => {
    const requestTime = now();
    if (!Number.isSafeInteger(requestTime)) return Promise.reject(unavailable());
    if (cached && requestTime < cached.refreshAt) return Promise.resolve(cached.token);
    if (inFlight) return inFlight;

    const request = fetchAccessToken(fetchImpl, timeoutMs).then(({ accessToken, expiresInSeconds }) => {
      const receivedAt = now();
      const expiresAt = receivedAt + expiresInSeconds * 1_000;
      if (!Number.isSafeInteger(receivedAt) || !Number.isSafeInteger(expiresAt)) throw unavailable();
      const refreshAt = expiresAt - CACHE_SKEW_MS;
      cached = refreshAt > receivedAt ? { token: accessToken, refreshAt } : undefined;
      return accessToken;
    }).finally(() => {
      if (inFlight === request) inFlight = undefined;
    });
    inFlight = request;
    return request;
  };
}
