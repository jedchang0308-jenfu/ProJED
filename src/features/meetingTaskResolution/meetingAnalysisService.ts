import { supabase } from '../../services/supabase/client';
import {
  BackendFeatureUnavailableError,
  isHttpBackend,
  requireLegacyProviderFeature,
} from '../../services/backendMode';
import {
  httpApiClient,
  httpMeetingAudioService,
} from '../../services/httpApi/backend';
import { HttpApiError } from '../../services/httpApi/httpApiClient';
import type { MeetingAudioSegment as HttpMeetingAudioSegment } from '../../services/httpApi/meetingAudioAdapter';
import { readMeetingReviewSummary, type MeetingReviewResponse } from './meetingAnalysisContract';
import {
  createMeetingRecordingService,
  type MeetingAudioReservation,
  type MeetingAudioReservationInput,
  type MeetingAudioVerification,
  type ScopedMeetingRecordingService,
} from './meetingRecordingService';

type ControlResponse<T> = { data: T | null; error: Error | null };

const invokeLegacy = async <T>(operation: string, payload: Record<string, unknown>): Promise<T> => {
  requireLegacyProviderFeature('會議錄音與音訊分析');
  const response = await supabase.functions.invoke('meeting_capture_control', {
    body: { operation, ...payload },
  });
  if (response.error) throw response.error;
  return response.data as T;
};

const legacyRecordingDependencies = {
  invoke: invokeLegacy,
  uploadToSignedUrl: async (path: string, token: string, blob: Blob, options: { contentType: string }) => {
    requireLegacyProviderFeature('會議錄音與音訊分析');
    return supabase.storage.from('meeting-audio').uploadToSignedUrl(path, token, blob, options);
  },
};

function invalidMeetingControlResponse(): never {
  throw new HttpApiError('INVALID_MEETING_CONTROL_RESPONSE', 502, null, false);
}

function unwrapMeetingControlResponse<T>(value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidMeetingControlResponse();
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).length !== 1 || !Object.prototype.hasOwnProperty.call(envelope, 'data')
      || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    invalidMeetingControlResponse();
  }
  return envelope.data as T;
}

const invokeHttp = async <T>(
  operation: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> => {
  if (operation === 'retry') throw new BackendFeatureUnavailableError('會議分析重試');
  const result = await httpApiClient.request<unknown>('/api/v1/meeting-control', {
    method: 'POST',
    body: { operation, ...payload },
    signal,
  });
  return unwrapMeetingControlResponse<T>(result);
};

function toRecordingReservation(value: Awaited<ReturnType<typeof httpMeetingAudioService.reserve>>): MeetingAudioReservation {
  return {
    segmentId: value.segmentId,
    sourceVersion: value.sourceVersion,
    segmentIndex: value.segmentIndex,
    path: value.path,
    token: null,
    signedUrl: null,
    expiresAt: value.expiresAt,
    uploadState: value.uploadState,
    alreadyVerified: value.alreadyVerified,
    sha256: value.sha256,
    bytes: value.bytes,
  };
}

function toRecordingVerification(value: HttpMeetingAudioSegment): MeetingAudioVerification {
  return {
    segment: {
      id: value.id,
      segment_index: value.segmentIndex,
      source_version: value.sourceVersion,
      bytes: value.bytes,
      sha256: value.sha256,
      upload_state: value.uploadState,
      object_path: value.objectPath,
    },
  };
}

const httpRecordingDependencies = {
  invoke: invokeHttp,
  reserveAudio: async (
    captureId: string,
    payload: MeetingAudioReservationInput,
    expectedSourceVersion: number | undefined,
    signal?: AbortSignal,
  ): Promise<MeetingAudioReservation> => {
    if (!Number.isSafeInteger(expectedSourceVersion) || (expectedSourceVersion ?? 0) < 1) {
      throw new HttpApiError('INVALID_MEETING_AUDIO_REQUEST', 400, null, false);
    }
    const reserved = await httpMeetingAudioService.reserve({
      captureId,
      expectedSourceVersion: expectedSourceVersion!,
      ...payload,
    }, signal);
    return toRecordingReservation(reserved);
  },
  uploadReservedAudio: async (reservation: MeetingAudioReservation, blob: Blob, signal?: AbortSignal) => {
    await httpMeetingAudioService.upload({
      segmentId: reservation.segmentId,
      uploadUrl: `/api/v1/meeting-audio/${reservation.segmentId}`,
      sourceVersion: reservation.sourceVersion,
    }, blob, signal);
  },
  verifyAudio: async (
    captureId: string,
    segmentIndex: number,
    expectedSourceVersion: number | undefined,
    signal?: AbortSignal,
  ): Promise<MeetingAudioVerification> => {
    if (!Number.isSafeInteger(expectedSourceVersion) || (expectedSourceVersion ?? 0) < 1) {
      throw new HttpApiError('INVALID_MEETING_AUDIO_REQUEST', 400, null, false);
    }
    const verified = await httpMeetingAudioService.verify({
      captureId,
      expectedSourceVersion: expectedSourceVersion!,
      segmentIndex,
    }, signal);
    return toRecordingVerification(verified);
  },
};

export const createScopedMeetingRecordingService = (
  isCurrent: () => boolean,
  signal?: AbortSignal,
): ScopedMeetingRecordingService => createMeetingRecordingService(
  isHttpBackend ? httpRecordingDependencies : legacyRecordingDependencies,
  isCurrent,
  signal,
);

const unscopedRecordingService = createScopedMeetingRecordingService(() => true);

export const meetingAnalysisService = {
  ...unscopedRecordingService,
  uploadToken: (captureId: string, segmentIndex: number, mime: string) => (
    unscopedRecordingService.reserveSegment(captureId, { segmentIndex, mime })
  ),
  playbackUrl: async (recordId: string, segmentId: string) => {
    if (!isHttpBackend) {
      return invokeLegacy<{ segmentId: string; url: string; expiresAt: number }>(
        'playback-url', { recordId, segmentId },
      );
    }
    const playback = await httpMeetingAudioService.playback(recordId, segmentId);
    return {
      segmentId: playback.segmentId,
      url: URL.createObjectURL(playback.blob),
      expiresAt: playback.expiresAt,
    };
  },
  reviseSource: (captureId: string, expectedSourceVersion: number, requestKey: string) => invokeLegacyOrHttp<{
    captureId: string; state: string; sourceVersion: number; parentVersion: number;
  }>('revise-source', { captureId, expectedSourceVersion, requestKey }),
  retry: (runId: string, requestKey: string, mode: 'retry' | 'rematch' | 'retranscribe') => invokeLegacyOrHttp<{
    runId: string; state: string; deadlineAt: string; sourceVersion: number;
  }>('retry', { runId, requestKey, mode }),
  cancel: (captureId: string, expectedSourceVersion: number, reason?: string) => invokeLegacyOrHttp<{
    captureId: string; state: string; sourceVersion: number;
  }>('cancel', { captureId, expectedSourceVersion, reason }),
  review: async (captureId: string): Promise<MeetingReviewResponse> => {
    const response = await invokeLegacyOrHttp<unknown>('review', { captureId });
    let summary: string | null;
    try { summary = readMeetingReviewSummary(response); }
    catch { invalidMeetingControlResponse(); }
    return { ...(response as Record<string, unknown>), summary } as unknown as MeetingReviewResponse;
  },
  decideMatch: (payload: {
    resolutionId: string;
    expectedResolutionRevision: number;
    operations: Array<{ action: 'accept' | 'reject' | 'add' | 'replace' | 'clear-all'; taskId?: string }>;
  }) => invokeLegacyOrHttp<{
    resolutionId: string;
    resolutionRevision: number;
    reviewRevision: number;
    state: string;
  }>('decide-match', payload),
  saveProjection: (payload: Record<string, unknown>) => invokeLegacyOrHttp<Record<string, unknown>>('save-projection', payload),
};

function invokeLegacyOrHttp<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  return isHttpBackend ? invokeHttp<T>(operation, payload) : invokeLegacy<T>(operation, payload);
}

export type { ControlResponse };
