const RECOGNIZE_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const BILLING_PROJECT = 'projed-cc78d';
const SAMPLE_RATE_HZ = 16_000;
const BYTES_PER_SAMPLE = 2;
const MAX_CHUNK_SECONDS = 50;
const MAX_PCM_BYTES = SAMPLE_RATE_HZ * BYTES_PER_SAMPLE * MAX_CHUNK_SECONDS;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_RESPONSE_DURATION_SECONDS = 315_576_000_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_RESULTS = 1_000;
const MAX_TRANSCRIPT_CODE_UNITS = 128_000;
const MAX_WORDS = 50_000;
const MAX_WORD_CODE_UNITS = 1_000;
const MAX_INT64 = 9_223_372_036_854_775_807n;

export interface GoogleCloudSpeechProviderOptions {
  readonly getAccessToken: () => Promise<string>;
  /** Test seam; production defaults to the platform fetch implementation. */
  readonly fetchImpl?: typeof fetch;
  /** Bounded timeout seam; production defaults to 60 seconds. */
  readonly timeoutMs?: number;
}

export interface GoogleCloudSpeechWord {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface GoogleCloudSpeechTranscription {
  readonly transcript: string;
  readonly words: readonly GoogleCloudSpeechWord[];
  /** Provider metadata only. Absence does not mean the operation was free. */
  readonly totalBilledTime?: string;
  readonly requestId?: string;
}

export interface GoogleCloudSpeechTranscribeInput {
  readonly pcm16le: Uint8Array;
  readonly signal?: AbortSignal;
}

export type GoogleCloudSpeechProviderErrorCode =
  | 'ASR_INVALID_INPUT'
  | 'ASR_AUTH_UNAVAILABLE'
  | 'ASR_REQUEST_ABORTED'
  | 'ASR_REQUEST_TIMEOUT'
  | 'ASR_PROVIDER_REJECTED'
  | 'ASR_PROVIDER_INVALID_RESPONSE'
  | 'ASR_TRANSPORT_UNKNOWN';

export class GoogleCloudSpeechProviderError extends Error {
  constructor(
    readonly code: GoogleCloudSpeechProviderErrorCode,
    message: string,
    readonly requestSent: boolean,
    readonly usageUnknown: boolean,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'GoogleCloudSpeechProviderError';
  }
}

export interface GoogleCloudSpeechProvider {
  transcribe(input: GoogleCloudSpeechTranscribeInput): Promise<GoogleCloudSpeechTranscription>;
}

type AbortReason = 'caller' | 'timeout';

interface AbortContext {
  readonly signal: AbortSignal;
  readonly aborted: Promise<AbortReason>;
  readonly reason: () => AbortReason | undefined;
  dispose(): void;
}

function providerError(
  code: GoogleCloudSpeechProviderErrorCode,
  message: string,
  requestSent: boolean,
  usageUnknown: boolean,
  httpStatus?: number,
): GoogleCloudSpeechProviderError {
  return new GoogleCloudSpeechProviderError(code, message, requestSent, usageUnknown, httpStatus);
}

function interruption(reason: AbortReason, requestSent: boolean): GoogleCloudSpeechProviderError {
  return reason === 'timeout'
    ? providerError('ASR_REQUEST_TIMEOUT', 'Speech recognition request timed out', requestSent, requestSent)
    : providerError('ASR_REQUEST_ABORTED', 'Speech recognition request was cancelled', requestSent, requestSent);
}

function createAbortContext(externalSignal: AbortSignal | undefined, timeoutMs: number): AbortContext {
  const controller = new AbortController();
  let resolveAborted!: (reason: AbortReason) => void;
  let abortReason: AbortReason | undefined;
  const aborted = new Promise<AbortReason>((resolve) => { resolveAborted = resolve; });
  const abort = (reason: AbortReason) => {
    if (abortReason) return;
    abortReason = reason;
    controller.abort();
    resolveAborted(reason);
  };
  const onExternalAbort = () => abort('caller');

  if (externalSignal?.aborted) abort('caller');
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeout = setTimeout(() => abort('timeout'), timeoutMs);

  return {
    signal: controller.signal,
    aborted,
    reason: () => abortReason,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function waitOrAbort<T>(operation: PromiseLike<T>, context: AbortContext, requestSent: boolean): Promise<T> {
  const settled = Promise.resolve(operation).then(
    (value) => ({ kind: 'value' as const, value }),
    (error: unknown) => ({ kind: 'error' as const, error }),
  );
  const result = await Promise.race([
    settled,
    context.aborted.then((reason) => ({ kind: 'abort' as const, reason })),
  ]);
  if (result.kind === 'abort') throw interruption(result.reason, requestSent);
  if (result.kind === 'error') throw result.error;
  return result.value;
}

function validateInput(input: GoogleCloudSpeechTranscribeInput): number {
  if (!input || typeof input !== 'object' || !(input.pcm16le instanceof Uint8Array)
      || input.pcm16le.byteLength < 1 || input.pcm16le.byteLength > MAX_PCM_BYTES
      || input.pcm16le.byteLength % BYTES_PER_SAMPLE !== 0) {
    throw providerError('ASR_INVALID_INPUT', 'PCM input is invalid', false, false);
  }
  return input.pcm16le.byteLength / (SAMPLE_RATE_HZ * BYTES_PER_SAMPLE) * 1000;
}

function isAccessToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 16_384
    && /^[A-Za-z0-9\-._~+/]+=*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return false;
    }
  }
  return true;
}

function parseDurationMilliseconds(value: unknown, allowMissing = false): number {
  if (value === undefined && allowMissing) return 0;
  if (typeof value !== 'string') throw new Error('invalid duration');
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?s$/.exec(value);
  if (!match || match[1]!.length > 12) throw new Error('invalid duration');
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds > MAX_RESPONSE_DURATION_SECONDS) throw new Error('invalid duration');
  const wholeNanos = BigInt(match[1]!) * 1_000_000_000n;
  const fractionalNanos = BigInt((match[2] ?? '').padEnd(9, '0') || '0');
  const milliseconds = Number(wholeNanos + fractionalNanos) / 1_000_000;
  if (!Number.isFinite(milliseconds)) {
    throw new Error('invalid duration');
  }
  return milliseconds;
}

function validateOptionalMetadata(value: Record<string, unknown>): Pick<GoogleCloudSpeechTranscription, 'totalBilledTime' | 'requestId'> {
  const metadata: { totalBilledTime?: string; requestId?: string } = {};
  if (value.totalBilledTime !== undefined) {
    if (typeof value.totalBilledTime !== 'string') throw new Error('invalid billed time');
    parseDurationMilliseconds(value.totalBilledTime);
    metadata.totalBilledTime = value.totalBilledTime;
  }
  if (value.requestId !== undefined) {
    if (typeof value.requestId !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value.requestId)
        || BigInt(value.requestId) > MAX_INT64) throw new Error('invalid request id');
    metadata.requestId = value.requestId;
  }
  return metadata;
}

function invalidResponse(httpStatus = 200): GoogleCloudSpeechProviderError {
  return providerError(
    'ASR_PROVIDER_INVALID_RESPONSE',
    'Speech recognition provider returned an invalid response',
    true,
    true,
    httpStatus,
  );
}

function parseResponse(bytes: Uint8Array, pcmDurationMs: number, httpStatus: number): GoogleCloudSpeechTranscription {
  let wire: unknown;
  try {
    wire = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw invalidResponse(httpStatus);
  }

  try {
    if (!isRecord(wire) || Object.hasOwn(wire, 'error')) {
      throw new Error('invalid response shape');
    }
    // Protobuf JSON can omit an empty repeated results field for silence.
    if (wire.results === undefined && Object.keys(wire).some(key =>
      !['totalBilledTime', 'requestId', 'speechAdaptationInfo'].includes(key))) throw new Error('invalid response shape');
    const results = wire.results === undefined ? [] : wire.results;
    if (!Array.isArray(results) || results.length > MAX_RESPONSE_RESULTS) throw new Error('invalid response shape');
    const metadata = validateOptionalMetadata(wire);
    const transcriptParts: string[] = [];
    const words: GoogleCloudSpeechWord[] = [];
    let transcriptCodeUnits = 0;
    let previousStartMs = -1;

    for (const result of results) {
      if (!isRecord(result) || !Array.isArray(result.alternatives) || result.alternatives.length < 1) {
        throw new Error('invalid result');
      }
      const alternative = result.alternatives[0];
      if (!isRecord(alternative) || typeof alternative.transcript !== 'string'
          || !isWellFormedUnicode(alternative.transcript)) throw new Error('invalid alternative');
      transcriptCodeUnits += alternative.transcript.length;
      if (transcriptCodeUnits > MAX_TRANSCRIPT_CODE_UNITS) throw new Error('transcript too long');
      transcriptParts.push(alternative.transcript);

      if (alternative.words === undefined) {
        if (alternative.transcript.length > 0) throw new Error('missing word offsets');
        continue;
      }
      if (!Array.isArray(alternative.words)) throw new Error('invalid words');
      if (alternative.transcript.length > 0 && alternative.words.length === 0) {
        throw new Error('missing word offsets');
      }
      for (const word of alternative.words) {
        if (!isRecord(word) || typeof word.word !== 'string' || word.word.length < 1
            || word.word.length > MAX_WORD_CODE_UNITS || !isWellFormedUnicode(word.word)) {
          throw new Error('invalid word');
        }
        if (words.length >= MAX_WORDS) throw new Error('too many words');
        const startMs = parseDurationMilliseconds(word.startTime, true);
        const endMs = parseDurationMilliseconds(word.endTime);
        if (startMs < previousStartMs - 0.000001 || endMs < startMs
            || startMs > pcmDurationMs + 100 || endMs > pcmDurationMs + 100) {
          throw new Error('invalid word timing');
        }
        previousStartMs = startMs;
        words.push({ text: word.word, startMs, endMs });
      }
    }
    return { transcript: transcriptParts.join(''), words, ...metadata };
  } catch {
    throw invalidResponse(httpStatus);
  }
}

async function readBoundedResponse(
  response: Response,
  context: AbortContext,
  httpStatus: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw invalidResponse(httpStatus);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await waitOrAbort(reader.read(), context, true);
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw invalidResponse(httpStatus);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/** One fixed, non-retrying V1 synchronous request per <=50-second PCM chunk. */
export function createGoogleCloudSpeechProvider({
  getAccessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GoogleCloudSpeechProviderOptions): GoogleCloudSpeechProvider {
  if (typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function'
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw providerError('ASR_INVALID_INPUT', 'Speech recognition provider configuration is invalid', false, false);
  }

  return {
    async transcribe(input): Promise<GoogleCloudSpeechTranscription> {
      const pcmDurationMs = validateInput(input);
      const context = createAbortContext(input.signal, timeoutMs);
      let requestSent = false;
      try {
        if (context.reason()) throw interruption(context.reason()!, false);
        const token = await waitOrAbort(
          Promise.resolve().then(getAccessToken).catch(() => {
            throw providerError('ASR_AUTH_UNAVAILABLE', 'Speech recognition credentials are unavailable', false, false);
          }),
          context,
          false,
        );
        if (!isAccessToken(token)) {
          throw providerError('ASR_AUTH_UNAVAILABLE', 'Speech recognition credentials are unavailable', false, false);
        }
        if (context.reason()) throw interruption(context.reason()!, false);

        const body = JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: SAMPLE_RATE_HZ,
            audioChannelCount: 1,
            languageCode: 'cmn-Hant-TW',
            model: 'default',
            enableWordTimeOffsets: true,
          },
          audio: { content: Buffer.from(input.pcm16le).toString('base64') },
        });
        requestSent = true;
        const response = await waitOrAbort(
          Promise.resolve().then(() => fetchImpl(RECOGNIZE_URL, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              'x-goog-user-project': BILLING_PROJECT,
            },
            body,
            redirect: 'error',
            signal: context.signal,
          })),
          context,
          true,
        );

        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          // Cloud Speech pricing excludes server-error responses. Keep 4xx and
          // nonstandard statuses conservative because their billing outcome is unknown.
          const serverErrorIsUnbilled = response.status >= 500 && response.status <= 599;
          throw providerError(
            'ASR_PROVIDER_REJECTED',
            'Speech recognition provider rejected the request',
            true,
            !serverErrorIsUnbilled,
            response.status,
          );
        }
        const bytes = await readBoundedResponse(response, context, response.status);
        return parseResponse(bytes, pcmDurationMs, response.status);
      } catch (error) {
        if (error instanceof GoogleCloudSpeechProviderError) throw error;
        const reason = context.reason();
        if (reason) throw interruption(reason, requestSent);
        if (requestSent) {
          throw providerError('ASR_TRANSPORT_UNKNOWN', 'Speech recognition outcome is unknown', true, true);
        }
        throw providerError('ASR_AUTH_UNAVAILABLE', 'Speech recognition credentials are unavailable', false, false);
      } finally {
        context.dispose();
      }
    },
  };
}
