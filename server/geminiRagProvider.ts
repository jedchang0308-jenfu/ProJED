import { KernelError } from './errors.js';

export interface RagProvider {
  embed(content: string, signal?: AbortSignal): Promise<number[]>;
  generate(
    input: { model: 'gemini-3.1-flash-lite' | 'gemini-3.5-flash'; prompt: string;
      responseMimeType?: 'application/json'; temperature?: number },
    signal?: AbortSignal,
  ): Promise<string>;
}

export interface GeminiRagProviderOptions {
  apiKey: string;
  fetcher?: typeof fetch;
}

type RagProviderErrorCode =
  | 'RAG_PROVIDER_UNAVAILABLE'
  | 'RAG_MODEL_UNAVAILABLE'
  | 'RAG_PROVIDER_INVALID_RESPONSE'
  | 'RAG_TIMEOUT'
  | 'RAG_QUOTA_EXCEEDED';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 3072;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBED_TIMEOUT_MS = 8_000;
const GENERATE_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_EMBED_INPUT_CHARS = 64 * 1024;
const MAX_GENERATE_PROMPT_CHARS = 256 * 1024;
const MAX_GENERATED_TEXT_CHARS = 256 * 1024;

function providerError(code: RagProviderErrorCode, message: string, status: number): KernelError {
  return new KernelError(code, message, status);
}

function invalidRequest(): KernelError {
  return new KernelError('DOMAIN_DATA_INVALID', 'RAG provider request is invalid', 400);
}

function invalidResponse(): KernelError {
  return providerError('RAG_PROVIDER_INVALID_RESPONSE', 'RAG provider returned an invalid response', 502);
}

function unavailable(): KernelError {
  return providerError('RAG_PROVIDER_UNAVAILABLE', 'RAG provider is unavailable', 503);
}

function timeoutError(): KernelError {
  return providerError('RAG_TIMEOUT', 'RAG provider request timed out', 504);
}

function quotaError(): KernelError {
  return providerError('RAG_QUOTA_EXCEEDED', 'RAG provider quota is temporarily unavailable', 429);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json') || !response.body) throw invalidResponse();

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES) throw invalidResponse();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    byteLength += value.byteLength;
    if (byteLength > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw invalidResponse();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw invalidResponse();
  }
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T> {
  if (callerSignal?.aborted) throw timeoutError();

  const controller = new AbortController();
  let abortListener: (() => void) | undefined;
  let timedOut = false;
  let rejectInterrupted: ((error: KernelError) => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject;
  });

  const abort = (error: KernelError) => {
    rejectInterrupted?.(error);
    controller.abort();
  };

  const timer = setTimeout(() => {
    timedOut = true;
    abort(timeoutError());
  }, timeoutMs);

  if (callerSignal) {
    abortListener = () => abort(timeoutError());
    callerSignal.addEventListener('abort', abortListener, { once: true });
    if (callerSignal.aborted) abortListener();
  }

  const work = Promise.resolve().then(() => operation(controller.signal));
  try {
    return await Promise.race([work, interrupted]);
  } catch (error) {
    if (error instanceof KernelError) throw error;
    if (timedOut || callerSignal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw timeoutError();
    }
    throw unavailable();
  } finally {
    clearTimeout(timer);
    if (callerSignal && abortListener) callerSignal.removeEventListener('abort', abortListener);
  }
}

function validateInput(content: string, maxLength: number): void {
  if (typeof content !== 'string' || content.trim().length === 0 || content.length > maxLength) {
    throw invalidRequest();
  }
}

export function createGeminiRagProvider({ apiKey, fetcher = globalThis.fetch.bind(globalThis) }: GeminiRagProviderOptions): RagProvider {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new KernelError('CONFIG_INVALID', 'RAG provider configuration is incomplete', 503);
  }

  const post = async (url: string, body: Record<string, unknown>, signal: AbortSignal, generation = false): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof KernelError) throw error;
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw timeoutError();
      throw unavailable();
    }

    if (response.redirected || (response.status >= 300 && response.status < 400)) throw unavailable();
    if (response.status === 429) throw quotaError();
    if (response.status === 503) throw unavailable();
    if (response.status === 504) throw timeoutError();
    if (generation && response.status === 404) {
      throw providerError('RAG_MODEL_UNAVAILABLE', 'Generation model is unavailable', 502);
    }
    if (generation && response.status === 400) {
      const payload=await readBoundedJson(response).catch(()=>null);
      const message=isRecord(payload)&&isRecord(payload.error)&&typeof payload.error.message==='string'
        ?payload.error.message:'';
      if (/\bmodel\b|\bmodels\//iu.test(message)
          && /not\s+(?:found|supported|available)|unsupported|does\s+not\s+exist/iu.test(message)) {
        throw providerError('RAG_MODEL_UNAVAILABLE','Generation model is unavailable',502);
      }
    }
    if (!response.ok) throw unavailable();

    try {
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof KernelError) throw error;
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw timeoutError();
      throw unavailable();
    }
  };

  return {
    async embed(content, signal) {
      validateInput(content, MAX_EMBED_INPUT_CHARS);
      return withDeadline(async requestSignal => {
        const payload = await post(`${API_BASE}/${EMBEDDING_MODEL}:embedContent`, {
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: content }] },
          output_dimensionality: EMBEDDING_DIMENSIONS,
        }, requestSignal);
        if (!isRecord(payload) || !isRecord(payload.embedding) || !Array.isArray(payload.embedding.values)
            || payload.embedding.values.length !== EMBEDDING_DIMENSIONS
            || !payload.embedding.values.every(value => typeof value === 'number' && Number.isFinite(value))) {
          throw invalidResponse();
        }
        return [...payload.embedding.values] as number[];
      }, EMBED_TIMEOUT_MS, signal);
    },

    async generate({ model, prompt, responseMimeType, temperature }, signal) {
      if (model !== 'gemini-3.1-flash-lite' && model !== 'gemini-3.5-flash') throw invalidRequest();
      validateInput(prompt, MAX_GENERATE_PROMPT_CHARS);
      if ((responseMimeType !== undefined && responseMimeType !== 'application/json')
          || (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2))) {
        throw invalidRequest();
      }
      return withDeadline(async requestSignal => {
        const payload = await post(`${API_BASE}/${model}:generateContent`, {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(responseMimeType !== undefined || temperature !== undefined
            ? {generationConfig: {...(responseMimeType ? {responseMimeType} : {}),
              ...(temperature !== undefined ? {temperature} : {})}} : {}),
        }, requestSignal, true);
        if (!isRecord(payload) || !Array.isArray(payload.candidates) || !isRecord(payload.candidates[0])) {
          throw invalidResponse();
        }
        const content = payload.candidates[0].content;
        if (!isRecord(content) || !Array.isArray(content.parts)) throw invalidResponse();
        const text = content.parts
          .filter(isRecord)
          .map(part => part.text)
          .filter((part): part is string => typeof part === 'string')
          .join('');
        if (text.trim().length === 0 || text.length > MAX_GENERATED_TEXT_CHARS) throw invalidResponse();
        return text;
      }, GENERATE_TIMEOUT_MS, signal);
    },
  };
}
