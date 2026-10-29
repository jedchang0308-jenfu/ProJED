export type HttpApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type HttpExpectedActor = {
  readonly accountId: string;
  readonly contextId: string;
};

export interface HttpApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly expectedActor?: HttpExpectedActor;
}

export class HttpApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'HttpApiError';
  }
}

const API_ORIGIN = 'https://projed.invalid';
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MEETING_AUDIO_PATH_RE = /^\/api\/v1\/meeting-audio\/([0-9a-f-]{36})$/u;
const AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const MAX_MEETING_AUDIO_BYTES = 10 * 1024 * 1024;

function checkedApiPath(path: string): string {
  let parsed: URL;
  try {
    parsed = new URL(path, API_ORIGIN);
  } catch (error) {
    void error;
    throw new HttpApiError('INVALID_API_PATH', 0, null, false);
  }
  const hasControlCharacter = Array.from(path).some(character => character.charCodeAt(0) < 32);
  const rawPathname = path.split('?', 1)[0];
  if (!path.startsWith('/') || path.startsWith('//') || parsed.origin !== API_ORIGIN
      || !parsed.pathname.startsWith('/api/v1/') || rawPathname !== parsed.pathname
      || parsed.hash || path.includes('\\') || hasControlCharacter) {
    throw new HttpApiError('INVALID_API_PATH', 0, null, false);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function checkedMeetingAudioPath(path: string): string {
  if (typeof path !== 'string') throw new HttpApiError('INVALID_API_PATH', 0, null, false);
  const match = MEETING_AUDIO_PATH_RE.exec(path);
  if (!match || !UUID_RE.test(match[1] ?? '')) throw new HttpApiError('INVALID_API_PATH', 0, null, false);
  return path;
}

function meetingAudioMime(value: string | null): string {
  const mime = (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!AUDIO_MIME_TYPES.has(mime)) throw new HttpApiError('INVALID_RESPONSE', 502, null, false);
  return mime;
}

function meetingAudioResponseError(response: Response, payload: unknown): HttpApiError {
  const error = errorFromResponse(response, payload);
  // Audio endpoints never surface arbitrary error details, which could carry a URL or token.
  return new HttpApiError(error.code, error.status, error.requestId, error.retryable, error.retryAfterMs);
}

async function throwMeetingAudioResponseError(response: Response): Promise<never> {
  throw meetingAudioResponseError(response, await parseJson(response));
}

function requestFailure(error: unknown): never {
  if (error instanceof HttpApiError) throw error;
  if (error instanceof DOMException && error.name === 'AbortError') throw error;
  void error;
  throw new HttpApiError('DEPENDENCY_UNAVAILABLE', 503, null, true);
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Preserve the response validation error.
  }
}

async function readBoundedAudio(response: Response, mime: string): Promise<Blob> {
  const rawLength = response.headers.get('content-length');
  if (rawLength !== null && (!/^\d+$/u.test(rawLength) || Number(rawLength) > MAX_MEETING_AUDIO_BYTES)) {
    await cancelResponseBody(response);
    throw invalidResponse(response);
  }
  if (!response.body) throw invalidResponse(response);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_MEETING_AUDIO_BYTES) {
        await reader.cancel();
        throw invalidResponse(response);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    void error;
    throw new HttpApiError('INVALID_RESPONSE', 502, response.headers.get('x-request-id'), false);
  } finally {
    reader.releaseLock();
  }
  if (size === 0 || (rawLength !== null && Number(rawLength) !== size)) throw invalidResponse(response);
  const buffer = new ArrayBuffer(size);
  const combined = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([buffer], { type: mime });
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw invalidResponse(response);
  }
  try {
    return await response.json();
  } catch (error) {
    void error;
    throw invalidResponse(response);
  }
}

function invalidResponse(response: Response): HttpApiError {
  const status = response.ok ? 502 : response.status;
  return new HttpApiError(
    'INVALID_RESPONSE',
    status,
    response.headers.get('x-request-id'),
    status === 429 || status >= 500,
  );
}

function errorFromResponse(response: Response, payload: unknown): HttpApiError {
  const candidate = payload && typeof payload === 'object'
    ? (payload as { error?: unknown }).error
    : null;
  const errorDetails = candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : {};
  const code = typeof errorDetails.code === 'string' && ERROR_CODE_RE.test(errorDetails.code)
    ? errorDetails.code
    : 'HTTP_REQUEST_FAILED';
  const requestId = typeof errorDetails.requestId === 'string' && errorDetails.requestId.length <= 128
    ? errorDetails.requestId
    : response.headers.get('x-request-id');
  const retryable = typeof errorDetails.retryable === 'boolean'
    ? errorDetails.retryable
    : response.status === 429 || response.status >= 500;
  const retryAfterMs = Number.isSafeInteger(errorDetails.retryAfterMs) && Number(errorDetails.retryAfterMs) >= 0
    ? Number(errorDetails.retryAfterMs)
    : undefined;
  return new HttpApiError(code, response.status, requestId, retryable, retryAfterMs, errorDetails.details);
}

export class HttpApiClient {
  private expectedActor: HttpExpectedActor | null = null;

  constructor(private readonly fetcher: HttpApiFetch = globalThis.fetch.bind(globalThis)) {}

  bindExpectedActor(expectedActor: HttpExpectedActor): void {
    this.expectedActor = { ...expectedActor };
  }

  clearExpectedActor(): void {
    this.expectedActor = null;
  }

  private snapshotExpectedActor(): Readonly<HttpExpectedActor> {
    if (!this.expectedActor || !this.expectedActor.accountId || !this.expectedActor.contextId) {
      throw new HttpApiError('ACTOR_REQUIRED', 401, null, false);
    }
    return Object.freeze({
      accountId: this.expectedActor.accountId,
      contextId: this.expectedActor.contextId,
    });
  }

  private assertExpectedActorUnchanged(snapshot: Readonly<HttpExpectedActor>): void {
    if (!this.expectedActor
        || this.expectedActor.accountId !== snapshot.accountId
        || this.expectedActor.contextId !== snapshot.contextId) {
      throw new HttpApiError('ACTOR_CHANGED', 409, null, false);
    }
  }

  private async assertAudioResponseActor(snapshot:Readonly<HttpExpectedActor>,response:Response):Promise<void>{
    try{this.assertExpectedActorUnchanged(snapshot);}catch(error){await cancelResponseBody(response);throw error;}
  }

  async putMeetingAudio<T>(path: string, blob: Blob, sourceVersion: number, signal?: AbortSignal): Promise<T> {
    const url = checkedMeetingAudioPath(path);
    const actor = this.snapshotExpectedActor();
    if (!(blob instanceof Blob) || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > MAX_MEETING_AUDIO_BYTES
        || !Number.isSafeInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > 2_147_483_647) {
      throw new HttpApiError('INVALID_REQUEST', 400, null, false);
    }
    let mime: string;
    try {
      mime = meetingAudioMime(blob.type || 'audio/webm');
    } catch {
      throw new HttpApiError('INVALID_REQUEST', 400, null, false);
    }
    const headers = new Headers({
      accept: 'application/json',
      'content-type': mime,
      'x-projed-source-version': String(sourceVersion),
      'x-projed-expected-account-id': actor.accountId,
      'x-projed-expected-context-id': actor.contextId,
    });
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'PUT',
        headers,
        body: blob,
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (error) {
      return requestFailure(error);
    }
    await this.assertAudioResponseActor(actor,response);
    if (!response.ok) return throwMeetingAudioResponseError(response);
    if (response.status !== 200) {
      await cancelResponseBody(response);
      throw invalidResponse(response);
    }
    const payload=await parseJson(response);
    this.assertExpectedActorUnchanged(actor);
    return payload as T;
  }

  async getMeetingAudio(path: string, recordId: string, signal?: AbortSignal): Promise<{ blob: Blob; expiresAt: number }> {
    const url = checkedMeetingAudioPath(path);
    const actor = this.snapshotExpectedActor();
    if (typeof recordId !== 'string' || recordId.length === 0 || recordId.length > 512
        || !recordId.trim() || /[\p{Cc}]/u.test(recordId)) {
      throw new HttpApiError('INVALID_REQUEST', 400, null, false);
    }
    const headers = new Headers({
      accept: 'audio/*',
      'x-projed-record-id': recordId,
      'x-projed-expected-account-id': actor.accountId,
      'x-projed-expected-context-id': actor.contextId,
    });
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers,
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (error) {
      return requestFailure(error);
    }
    await this.assertAudioResponseActor(actor,response);
    if (!response.ok) return throwMeetingAudioResponseError(response);
    if (response.status !== 200) {
      await cancelResponseBody(response);
      throw invalidResponse(response);
    }

    let mime: string;
    try {
      mime = meetingAudioMime(response.headers.get('content-type'));
    } catch {
      await cancelResponseBody(response);
      throw invalidResponse(response);
    }
    const rawExpiry = response.headers.get('x-projed-expires-at');
    const expiresAt = rawExpiry !== null && /^\d{1,16}$/u.test(rawExpiry) ? Number(rawExpiry) : NaN;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
      await cancelResponseBody(response);
      throw invalidResponse(response);
    }
    const blob = await readBoundedAudio(response, mime);
    this.assertExpectedActorUnchanged(actor);
    return { blob, expiresAt };
  }

  async request<T>(path: string, options: HttpApiRequestOptions = {}): Promise<T> {
    const url = checkedApiPath(path);
    const method = options.method ?? 'GET';
    if ((method === 'GET' || method === 'DELETE') && options.body !== undefined) {
      throw new HttpApiError('INVALID_REQUEST', 0, null, false);
    }
    const headers = new Headers({ accept: 'application/json' });
    const expectedActor = options.expectedActor
      ?? (method === 'GET' && url === '/api/v1/session' ? null : this.expectedActor);
    if (expectedActor) {
      headers.set('x-projed-expected-account-id', expectedActor.accountId);
      headers.set('x-projed-expected-context-id', expectedActor.contextId);
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json; charset=utf-8');
      body = JSON.stringify(options.body);
    }
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        body,
        signal: options.signal,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof HttpApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      void error;
      throw new HttpApiError('DEPENDENCY_UNAVAILABLE', 503, null, true);
    }
    if (response.status === 204) {
      if (!response.ok) throw new HttpApiError('HTTP_REQUEST_FAILED', response.status, response.headers.get('x-request-id'), false);
      return undefined as T;
    }
    const payload = await parseJson(response);
    if (!response.ok) throw errorFromResponse(response, payload);
    return payload as T;
  }
}
