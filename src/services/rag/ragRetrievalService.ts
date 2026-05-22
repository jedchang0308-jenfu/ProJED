import { supabase } from '../supabase/client';
import type { RagRetrievalRequest, RagRetrievalResponse } from './ragContract';

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

export const queryProjectKnowledge = async (
  request: RagRetrievalRequest
): Promise<RagRetrievalResponse> => {
  const { data, error } = await supabase.functions.invoke<RagRetrievalResponse>(
    'match_project_knowledge',
    {
      body: request,
    }
  );

  if (error) {
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
