import {
  MEETING_SYNTHESIS_CONTRACT_VERSION,
  validateMeetingSynthesisOutput,
  type MeetingSynthesisInput,
  type MeetingSynthesisResponse,
} from '../../utils/meetingRecordSynthesis';
import { HttpApiClient, HttpApiError } from './httpApiClient';

export interface MeetingSynthesisScope {
  readonly workspaceId: string;
  readonly boardId: string;
  readonly signal?: AbortSignal;
}

export interface HttpMeetingSynthesisAdapter {
  synthesize(input: MeetingSynthesisInput, scope: MeetingSynthesisScope): Promise<MeetingSynthesisResponse>;
}

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpApiError(`INVALID_${label}`, 502, null, false);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function ref(value: string, label: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || hasControl) {
    throw new HttpApiError(`INVALID_${label}`, 400, null, false);
  }
  return encodeURIComponent(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function parseSynthesisResponse(value: unknown, input: MeetingSynthesisInput): MeetingSynthesisResponse {
  const envelope = object(value, 'MEETING_SYNTHESIS_ENVELOPE');
  if (!exactKeys(envelope, ['data'])) throw new HttpApiError('INVALID_MEETING_SYNTHESIS_ENVELOPE', 502, null, false);

  const candidate = object(envelope.data, 'MEETING_SYNTHESIS_DATA');
  const required = [
    'content', 'warnings', 'linkedTaskIds', 'provider', 'contractVersion', 'functionVersion',
    'runId', 'generatedAt', 'normalization', 'quality',
  ] as const;
  if (!exactKeys(candidate, required, ['model'])) {
    throw new HttpApiError('INVALID_MEETING_SYNTHESIS_DATA', 502, null, false);
  }
  if (typeof candidate.content !== 'string' || !candidate.content.trim()
      || !isStringArray(candidate.warnings) || !isStringArray(candidate.linkedTaskIds)
      || typeof candidate.provider !== 'string' || !candidate.provider.trim()
      || typeof candidate.contractVersion !== 'string'
      || typeof candidate.functionVersion !== 'string' || !candidate.functionVersion.trim()
      || typeof candidate.runId !== 'string' || !candidate.runId.trim()
      || typeof candidate.generatedAt !== 'string' || !Number.isFinite(Date.parse(candidate.generatedAt))
      || (hasOwn(candidate, 'model') && typeof candidate.model !== 'string')) {
    throw new HttpApiError('INVALID_MEETING_SYNTHESIS_DATA', 502, null, false);
  }
  if (candidate.contractVersion !== MEETING_SYNTHESIS_CONTRACT_VERSION) {
    throw new HttpApiError('CONTRACT_VERSION_MISMATCH', 409, null, false);
  }

  const normalization = object(candidate.normalization, 'MEETING_SYNTHESIS_NORMALIZATION');
  if (!exactKeys(normalization, ['receivedActivityCount', 'acceptedActivityCount', 'droppedActivityCount'])
      || !['receivedActivityCount', 'acceptedActivityCount', 'droppedActivityCount'].every(key =>
        Number.isSafeInteger(normalization[key]) && Number(normalization[key]) >= 0)
      || Number(normalization.receivedActivityCount)
        !== Number(normalization.acceptedActivityCount) + Number(normalization.droppedActivityCount)) {
    throw new HttpApiError('SYNTHESIS_TRACE_MISSING', 502, null, false);
  }

  const quality = object(candidate.quality, 'MEETING_SYNTHESIS_QUALITY');
  if (!exactKeys(quality, ['passed', 'checks', 'violations'])
      || typeof quality.passed !== 'boolean'
      || !isStringArray(quality.checks)
      || !isStringArray(quality.violations)) {
    throw new HttpApiError('INVALID_MEETING_SYNTHESIS_QUALITY', 502, null, false);
  }
  if (quality.passed !== true || quality.violations.length > 0) {
    throw new HttpApiError('QUALITY_GATE_FAILED', 502, null, false, undefined, {
      runId: candidate.runId,
      functionVersion: candidate.functionVersion,
      violations: quality.violations,
      affectedTaskIds: candidate.linkedTaskIds,
    });
  }

  const response = candidate as unknown as MeetingSynthesisResponse;
  const localQuality = validateMeetingSynthesisOutput(input, response);
  if (!localQuality.passed) {
    throw new HttpApiError('QUALITY_GATE_FAILED', 502, null, false, undefined, {
      runId: response.runId,
      functionVersion: response.functionVersion,
      violations: localQuality.violations,
      affectedTaskIds: response.linkedTaskIds,
    });
  }
  return response;
}

export function createHttpMeetingSynthesisAdapter(client: HttpApiClient): HttpMeetingSynthesisAdapter {
  return {
    async synthesize(input, scope) {
      const path = `/api/v1/workspaces/${ref(scope.workspaceId, 'WORKSPACE_REF')}`
        + `/boards/${ref(scope.boardId, 'BOARD_REF')}/meeting:synthesize`;
      const body = {
        title: input.title,
        participantsText: input.participantsText,
        rawContent: input.rawContent,
        taskLinks: input.taskLinks,
        tasks: input.tasks,
        activities: input.activities,
        occurredAt: input.occurredAt,
        requiredContractVersion: MEETING_SYNTHESIS_CONTRACT_VERSION,
      };
      const response = await client.request<unknown>(path, {
        method: 'POST',
        body,
        signal: scope.signal,
      });
      return parseSynthesisResponse(response, input);
    },
  };
}
