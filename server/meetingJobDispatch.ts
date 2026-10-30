import { KernelError } from './errors.js';
import { MEETING_ANALYSIS_JOB_RESOURCE, type MeetingJobRuntimeBinding } from './meetingJobRuntimeBinding.js';

const PROJECT = 'projed-cc78d';
const ENDPOINT = `https://run.googleapis.com/v2/${MEETING_ANALYSIS_JOB_RESOURCE}:run`;
const OPERATION_PREFIX = 'projects/projed-cc78d/locations/asia-east1/operations/';
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_ACCESS_TOKEN_BYTES = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

export type MeetingJobDispatchResult =
  | { readonly kind: 'accepted'; readonly operationName: string }
  | { readonly kind: 'not_sent' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'rejected'; readonly httpStatus: number };

export interface MeetingJobDispatchOptions {
  readonly getAccessToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  /** Bounded test seam; production default and maximum are both five seconds. */
  readonly timeoutMs?: number;
}

function configInvalid(): KernelError {
  return new KernelError('CONFIG_INVALID', 'Meeting Job dispatch configuration is invalid', 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validBinding(binding: MeetingJobRuntimeBinding): boolean {
  if (!isRecord(binding) || Object.keys(binding).sort().join('|') !== 'qualificationEvidenceRef|resource') return false;
  return binding.resource === MEETING_ANALYSIS_JOB_RESOURCE
    && typeof binding.qualificationEvidenceRef === 'string'
    && binding.qualificationEvidenceRef.trim().length > 0
    && binding.qualificationEvidenceRef.length <= 512
    && !/[\p{Cc}]/u.test(binding.qualificationEvidenceRef);
}

function validAccessToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_ACCESS_TOKEN_BYTES
    && !/[\s\p{Cc}]/u.test(value);
}

function cancelResponse(response: Response | undefined,
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined): void {
  try {
    if (reader) void reader.cancel().catch(() => undefined);
    else if (response) void response.body?.cancel().catch(() => undefined);
  } catch {
    // A body may already be closed or locked by the bounded reader.
  }
}

async function readBoundedBody(response: Response,
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array> | undefined) => void): Promise<Uint8Array | null> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength)
      || !Number.isSafeInteger(Number(declaredLength)) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
    cancelResponse(response, undefined);
    return null;
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  onReader(reader);
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(part.value);
    }
  } catch {
    return null;
  } finally {
    onReader(undefined);
    try { reader.releaseLock(); } catch { /* The stream may already be cancelled. */ }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function parseOperationName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(OPERATION_PREFIX)) return null;
  const id = value.slice(OPERATION_PREFIX.length);
  return /^[A-Za-z0-9._~-]{1,128}$/u.test(id) ? value : null;
}

/**
 * Creates a single fixed-target Cloud Run Jobs API port. This does not attest
 * provider qualification and never submits overrides or retries a request.
 */
export function createMeetingJobDispatcher(binding: MeetingJobRuntimeBinding | null,
  options?: MeetingJobDispatchOptions): { readonly run: (signal?: AbortSignal) => Promise<MeetingJobDispatchResult> } | undefined {
  if (binding === null) return undefined;
  if (!validBinding(binding) || !options || typeof options.getAccessToken !== 'function') throw configInvalid();

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || timeoutMs > DEFAULT_TIMEOUT_MS) throw configInvalid();

  return {
    run(signal?: AbortSignal): Promise<MeetingJobDispatchResult> {
      if (signal?.aborted) return Promise.resolve({ kind: 'not_sent' });

      const controller = new AbortController();
      let requestSent = false;
      let closed = false;
      let response: Response | undefined;
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let finishStopped!: (result: MeetingJobDispatchResult) => void;
      const stopped = new Promise<MeetingJobDispatchResult>(resolve => { finishStopped = resolve; });
      const stop = (): void => {
        if (closed) return;
        closed = true;
        controller.abort();
        cancelResponse(response, activeReader);
        finishStopped(requestSent ? { kind: 'unknown' } : { kind: 'not_sent' });
      };
      const onAbort = (): void => stop();
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) stop();
      const timeout = setTimeout(stop, timeoutMs);

      const send = async (): Promise<MeetingJobDispatchResult> => {
        try {
          const token = await options.getAccessToken();
          // A late token after caller abort/timeout must never start the API request.
          if (closed || controller.signal.aborted || !validAccessToken(token)) return { kind: 'not_sent' };

          requestSent = true;
          response = await fetchImpl(ENDPOINT, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              accept: 'application/json',
              'content-type': 'application/json',
              'x-goog-user-project': PROJECT,
            },
            body: '{}',
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal,
          });
          if (closed) return { kind: 'unknown' };
          if (response.status >= 400 && response.status <= 499) {
            cancelResponse(response, undefined);
            return { kind: 'rejected', httpStatus: response.status };
          }
          if (response.status < 200 || response.status > 299 || !response.ok || response.redirected
              || response.type === 'opaqueredirect') {
            cancelResponse(response, undefined);
            return { kind: 'unknown' };
          }

          const bytes = await readBoundedBody(response, reader => { activeReader = reader; });
          if (closed || bytes === null) return { kind: 'unknown' };
          let payload: unknown;
          try {
            payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
          } catch {
            return { kind: 'unknown' };
          }
          const operationName = isRecord(payload) ? parseOperationName(payload.name) : null;
          return operationName === null ? { kind: 'unknown' } : { kind: 'accepted', operationName };
        } catch {
          return requestSent ? { kind: 'unknown' } : { kind: 'not_sent' };
        }
      };

      return Promise.race([send(), stopped]).finally(() => {
        closed = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      });
    },
  };
}
