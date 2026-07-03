import { isLocalTestBackend, isSupabaseBackend } from './dataBackend';
import { isSupabaseConfigured, supabase } from './supabase/client';
import {
  buildDeterministicMeetingSynthesis,
  type MeetingSynthesisInput,
  type MeetingSynthesisResponse,
} from '../utils/meetingRecordSynthesis';

export class MeetingSynthesisError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code = 'SYNTHESIS_ERROR', status = 500) {
    super(message);
    this.name = 'MeetingSynthesisError';
    this.code = code;
    this.status = status;
  }
}

const MEETING_SYNTHESIS_TIMEOUT_MS = 30000;

const isTimeoutOrAbortError = (error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : null;
  const contextMessage = context && typeof context === 'object' && 'message' in context
    ? String((context as { message?: unknown }).message)
    : '';
  return /abort|timeout|timed out/i.test(`${name} ${message} ${contextMessage}`);
};

const buildTimeoutFallbackSynthesis = (input: MeetingSynthesisInput): MeetingSynthesisResponse => {
  const fallback = buildDeterministicMeetingSynthesis(input);
  return {
    ...fallback,
    warnings: [
      `AI整理超過 ${Math.round(MEETING_SYNTHESIS_TIMEOUT_MS / 1000)} 秒未完成，已改用本機規則整理；請人工校稿。`,
      ...fallback.warnings,
    ],
    provider: 'deterministic-timeout-fallback',
  };
};

const parseFunctionError = async (error: unknown) => {
  let code = 'SYNTHESIS_ERROR';
  let status = 500;
  let message = error instanceof Error ? error.message : String(error);

  if (error instanceof Error && 'context' in error) {
    const context = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
    if (context?.status) status = context.status;

    try {
      const bodyText = await context?.text?.();
      if (bodyText) {
        const bodyJson = JSON.parse(bodyText);
        if (bodyJson?.error?.code) code = bodyJson.error.code;
        if (bodyJson?.error?.message) message = bodyJson.error.message;
      }
    } catch {
      // Supabase FunctionsHttpError does not guarantee a JSON body.
    }
  }

  return new MeetingSynthesisError(message, code, status);
};

export const synthesizeMeetingRecord = async (
  input: MeetingSynthesisInput,
): Promise<MeetingSynthesisResponse> => {
  if (isLocalTestBackend || !isSupabaseBackend || !isSupabaseConfigured) {
    return buildDeterministicMeetingSynthesis(input);
  }

  const invokeResponse = await supabase.functions.invoke<MeetingSynthesisResponse>(
    'synthesize_meeting_record',
    { body: input, timeout: MEETING_SYNTHESIS_TIMEOUT_MS },
  ).catch(async error => {
    if (isTimeoutOrAbortError(error)) {
      return {
        data: buildTimeoutFallbackSynthesis(input),
        error: null,
      };
    }
    throw await parseFunctionError(error);
  });

  const { data, error } = invokeResponse;

  if (error) {
    if (isTimeoutOrAbortError(error)) {
      return buildTimeoutFallbackSynthesis(input);
    }
    throw await parseFunctionError(error);
  }

  if (!data?.content?.trim()) {
    throw new MeetingSynthesisError('AI 統整未回傳會議紀錄草稿。', 'EMPTY_SYNTHESIS', 502);
  }

  return {
    content: data.content,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    linkedTaskIds: Array.isArray(data.linkedTaskIds) ? data.linkedTaskIds : [],
    provider: data.provider,
  };
};
