import { supabase } from '../supabase/client';
import { isHttpBackend, requireLegacyProviderFeature } from '../backendMode';
import { httpRagService } from '../httpApi/backend';
import { HttpApiError } from '../httpApi/httpApiClient';
import type { RagRetrievalRequest, RagRetrievalResponse } from './ragContract';

const RAG_RETRIEVAL_TIMEOUT_MS = 45000;

export class RagRetrievalError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'RagRetrievalError';
    this.code = code;
    this.status = status;
  }
}

const isTimeoutLikeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  return /abort|timeout|timed out/i.test(`${name} ${message}`);
};

const httpTimeoutError = () => new RagRetrievalError(
  '知識檢索逾時，請稍後重試或縮小查詢範圍。',
  'RAG_TIMEOUT',
  504,
);

const queryHttpProjectKnowledge = async (
  request: RagRetrievalRequest,
  signal?: AbortSignal,
): Promise<RagRetrievalResponse> => {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(httpTimeoutError());
    }, RAG_RETRIEVAL_TIMEOUT_MS);
  });

  try {
    return await Promise.race([httpRagService.query(request, controller.signal), timeout]);
  } catch (error) {
    if (timedOut) throw httpTimeoutError();
    if (signal?.aborted) throw signal.reason ?? error;
    if (error instanceof RagRetrievalError) throw error;
    if (error instanceof HttpApiError) {
      throw new RagRetrievalError(
        error.code,
        error.code,
        error.status,
      );
    }
    if (error instanceof Error && error.message.startsWith('HTTP_API_INVALID_RAG_')) {
      throw new RagRetrievalError(
        '知識檢索服務回應格式無效。',
        'RAG_RESPONSE_INVALID',
        502,
      );
    }
    throw new RagRetrievalError(
      '知識檢索服務目前無法使用。',
      'RAG_UNAVAILABLE',
      503,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
};

export const queryProjectKnowledge = async (
  request: RagRetrievalRequest,
  signal?: AbortSignal,
): Promise<RagRetrievalResponse> => {
  if (isHttpBackend) return queryHttpProjectKnowledge(request, signal);

  try {
    requireLegacyProviderFeature('專案智慧助理');
  } catch {
    throw new RagRetrievalError(
      '專案智慧助理尚未接到目前的雲端後端，已停止舊資料來源查詢。',
      'BACKEND_UNSUPPORTED',
      501,
    );
  }
  const { data, error } = await supabase.functions.invoke<RagRetrievalResponse>(
    'match_project_knowledge',
    {
      body: request,
      timeout: RAG_RETRIEVAL_TIMEOUT_MS,
    }
  );

  if (error) {
    if (isTimeoutLikeError(error)) {
      throw new RagRetrievalError(
        '知識檢索逾時，請稍後重試或縮小查詢範圍。',
        'RAG_TIMEOUT',
        504
      );
    }

    // Supabase JS wraps the non-2xx responses. 
    // We try to extract our custom error format: { error: { message, code } }
    let code = 'UNKNOWN_ERROR';
    let status = 500;
    let message = error.message;

    if (error instanceof Error && 'context' in error) {
      // FunctionsHttpError
      const context = (error as any).context;
      if (context?.status) {
        status = context.status;
      }
      
      try {
        const bodyText = await context?.text?.();
        if (bodyText) {
          const bodyJson = JSON.parse(bodyText);
          if (bodyJson?.error?.code) {
            code = bodyJson.error.code;
          }
          if (bodyJson?.error?.message) {
            message = bodyJson.error.message;
          }
        }
      } catch {
        // Ignore parse error
      }
    }

    throw new RagRetrievalError(message, code, status);
  }

  if (!data) {
    return { answer: '', chunks: [] };
  }

  return data;
};
