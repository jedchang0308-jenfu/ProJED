export type HttpApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HttpApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly expectedActor?: {
    readonly accountId: string;
    readonly contextId: string;
  };
}

export class HttpApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = 'HttpApiError';
  }
}

const API_ORIGIN = 'https://projed.invalid';
const ERROR_CODE_RE = /^[A-Z][A-Z0-9_]{1,127}$/;

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
  const details = candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : {};
  const code = typeof details.code === 'string' && ERROR_CODE_RE.test(details.code)
    ? details.code
    : 'HTTP_REQUEST_FAILED';
  const requestId = typeof details.requestId === 'string' && details.requestId.length <= 128
    ? details.requestId
    : response.headers.get('x-request-id');
  const retryable = typeof details.retryable === 'boolean'
    ? details.retryable
    : response.status === 429 || response.status >= 500;
  const retryAfterMs = Number.isSafeInteger(details.retryAfterMs) && Number(details.retryAfterMs) >= 0
    ? Number(details.retryAfterMs)
    : undefined;
  return new HttpApiError(code, response.status, requestId, retryable, retryAfterMs);
}

export class HttpApiClient {
  constructor(private readonly fetcher: HttpApiFetch = globalThis.fetch.bind(globalThis)) {}

  async request<T>(path: string, options: HttpApiRequestOptions = {}): Promise<T> {
    const url = checkedApiPath(path);
    const method = options.method ?? 'GET';
    if ((method === 'GET' || method === 'DELETE') && options.body !== undefined) {
      throw new HttpApiError('INVALID_REQUEST', 0, null, false);
    }
    const headers = new Headers({ accept: 'application/json' });
    if (options.expectedActor) {
      headers.set('x-projed-expected-account-id', options.expectedActor.accountId);
      headers.set('x-projed-expected-context-id', options.expectedActor.contextId);
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
