import { supabase } from '../../services/supabase/client';
import { requireLegacyProviderFeature } from '../../services/backendMode';
import type {
  MeetingReviewSegment,
} from './meetingAnalysisContract';
import {
  createMeetingRecordingService,
  type ScopedMeetingRecordingService,
} from './meetingRecordingService';

type ControlResponse<T> = { data: T | null; error: Error | null };

const invoke = async <T>(operation: string, payload: Record<string, unknown>): Promise<T> => {
  requireLegacyProviderFeature('會議錄音與音訊分析');
  const response = await supabase.functions.invoke('meeting_capture_control', {
    body: { operation, ...payload },
  });
  if (response.error) throw response.error;
  return response.data as T;
};

const legacyRecordingDependencies = {
  invoke,
  uploadToSignedUrl: async (path: string, token: string, blob: Blob, options: { contentType: string }) => {
    requireLegacyProviderFeature('會議錄音與音訊分析');
    return supabase.storage.from('meeting-audio').uploadToSignedUrl(path, token, blob, options);
  },
};

export const createScopedMeetingRecordingService = (
  isCurrent: () => boolean,
  signal?: AbortSignal,
): ScopedMeetingRecordingService => createMeetingRecordingService(legacyRecordingDependencies, isCurrent, signal);

const unscopedLegacyRecordingService = createScopedMeetingRecordingService(() => true);

export const meetingAnalysisService = {
  ...unscopedLegacyRecordingService,
  uploadToken: (captureId: string, segmentIndex: number, mime: string) =>
    unscopedLegacyRecordingService.reserveSegment(captureId, { segmentIndex, mime }),
  playbackUrl: (recordId: string, segmentId: string) => invoke<{ segmentId: string; url: string; expiresAt: number }>('playback-url', { recordId, segmentId }),
  reviseSource: (captureId: string, expectedSourceVersion: number, requestKey: string) => invoke<{ captureId: string; state: string; sourceVersion: number; parentVersion: number }>('revise-source', { captureId, expectedSourceVersion, requestKey }),
  retry: (runId: string, requestKey: string, mode: 'retry' | 'rematch' | 'retranscribe') => invoke<{ runId: string; state: string; deadlineAt: string; sourceVersion: number }>('retry', { runId, requestKey, mode }),
  cancel: (captureId: string, expectedSourceVersion: number, reason?: string) => invoke<{ captureId: string; state: string; sourceVersion: number }>('cancel', { captureId, expectedSourceVersion, reason }),
  review: (captureId: string) => invoke<{
    captureId: string;
    state: string;
    reviewRevision: number;
    segments: MeetingReviewSegment[];
  }>('review', { captureId }),
  decideMatch: (payload: {
    resolutionId: string;
    expectedResolutionRevision: number;
    operations: Array<{ action: 'accept' | 'reject' | 'add' | 'replace' | 'clear-all'; taskId?: string }>;
  }) => invoke<{
    resolutionId: string;
    resolutionRevision: number;
    reviewRevision: number;
    state: string;
  }>('decide-match', payload),
  saveProjection: (payload: Record<string, unknown>) => invoke<Record<string, unknown>>('save-projection', payload),
};

export type { ControlResponse };
