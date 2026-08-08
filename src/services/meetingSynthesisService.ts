import { isLocalTestBackend, isSupabaseBackend } from './dataBackend';
import { isSupabaseConfigured, supabase } from './supabase/client';
import {
  buildDeterministicMeetingSynthesis,
  MEETING_SYNTHESIS_CONTRACT_VERSION,
  validateMeetingSynthesisOutput,
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

const assertMeetingSynthesisResponse = (
  input: MeetingSynthesisInput,
  data: MeetingSynthesisResponse | null,
): MeetingSynthesisResponse => {
  if (!data?.content?.trim()) {
    throw new MeetingSynthesisError('AI 整理未回傳會議紀錄草稿。', 'EMPTY_SYNTHESIS', 502);
  }

  if (data.contractVersion !== MEETING_SYNTHESIS_CONTRACT_VERSION) {
    throw new MeetingSynthesisError(
      'AI 整理服務版本尚未同步，原始草稿已保留，請稍後重試。',
      'CONTRACT_VERSION_MISMATCH',
      409,
    );
  }

  if (
    !data.runId?.trim() ||
    !data.functionVersion?.trim() ||
    !data.provider?.trim() ||
    !data.generatedAt?.trim() ||
    !data.normalization ||
    typeof data.normalization.receivedActivityCount !== 'number' ||
    typeof data.normalization.acceptedActivityCount !== 'number' ||
    typeof data.normalization.droppedActivityCount !== 'number'
  ) {
    throw new MeetingSynthesisError(
      'AI 整理結果缺少執行追溯資訊，原始草稿已保留，請重試。',
      'SYNTHESIS_TRACE_MISSING',
      502,
    );
  }

  if (!data.quality?.passed) {
    throw new MeetingSynthesisError(
      'AI 整理結果未通過品質檢查，原始草稿已保留，請重試。',
      'QUALITY_GATE_FAILED',
      502,
    );
  }

  const normalizedResponse = {
    ...data,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    linkedTaskIds: Array.isArray(data.linkedTaskIds) ? data.linkedTaskIds.filter(Boolean) : [],
  };
  const clientQuality = validateMeetingSynthesisOutput(input, normalizedResponse);
  if (!clientQuality.passed) {
    throw new MeetingSynthesisError(
      'AI 整理結果未通過本機品質檢查，原始草稿已保留，請重試。',
      'QUALITY_GATE_FAILED',
      502,
    );
  }

  return {
    ...normalizedResponse,
    quality: clientQuality,
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
    return assertMeetingSynthesisResponse(input, buildDeterministicMeetingSynthesis(input));
  }

  const invokeResponse = await supabase.functions.invoke<MeetingSynthesisResponse>(
    'synthesize_meeting_record',
    {
      body: {
        ...input,
        requiredContractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
      },
      timeout: MEETING_SYNTHESIS_TIMEOUT_MS,
    },
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

  return assertMeetingSynthesisResponse(input, data);
};
