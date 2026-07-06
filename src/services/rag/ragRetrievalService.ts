import { supabase } from '../supabase/client';
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

export const queryProjectKnowledge = async (
  request: RagRetrievalRequest
): Promise<RagRetrievalResponse> => {
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
