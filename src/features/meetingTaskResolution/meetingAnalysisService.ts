import { supabase } from '../../services/supabase/client';
import type {
  MeetingCaptureProgress,
  MeetingPointerInterval,
  MeetingReviewSegment,
} from './meetingAnalysisContract';

type ControlResponse<T> = { data: T | null; error: Error | null };

const invoke = async <T>(operation: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await supabase.functions.invoke('meeting_capture_control', {
    body: { operation, ...payload },
  });
  if (response.error) throw response.error;
  return response.data as T;
};

export const meetingAnalysisService = {
  begin: (payload: { tenantId: string; projectId: string; recordId: string; idempotencyKey: string }) =>
    invoke<{ captureId: string; state: string; sourceVersion: number; startedAt: string }>('begin', payload),
  progress: (captureId: string, payload: { epochManifest: unknown; lastProgressAt: number }) =>
    invoke<MeetingCaptureProgress>('progress', { captureId, ...payload }),
  pause: (captureId: string) => invoke<MeetingCaptureProgress>('pause', { captureId }),
  resume: (captureId: string, epochManifest: unknown) => invoke<MeetingCaptureProgress>('resume', { captureId, epochManifest }),
  stop: (captureId: string, payload: { expectedSourceVersion: number; stoppedAt: number; pointerLoss?: boolean; epochManifest?: unknown; finalPointerSequence?: number | null; gaps?: unknown[] }) =>
    invoke<MeetingCaptureProgress>('stop', { captureId, ...payload }),
  appendPointer: (captureId: string, payload: { batchKey: string; digest: string; intervals: MeetingPointerInterval[] }) =>
    invoke<{ ackSequence: number }>('append-pointer', { captureId, ...payload }),
  completeUpload: (captureId: string, payload: { expectedSourceVersion: number; audioManifestHash: string; pointerManifestHash: string; sourceCompleteness: string; audioManifest?: unknown[] }) =>
    invoke<{ state: string; runId: string | null; sourceVersion: number; sourceComplete?: boolean }>('complete-upload', { captureId, ...payload }),
  reserveSegment: (captureId: string, payload: { segmentIndex: number; mime: string; bytes?: number; epoch?: number; startOffsetMs?: number; endOffsetMs?: number; overlapMs?: number; gapBeforeMs?: number; reservationKey?: string }) =>
    invoke<{ segmentId: string; sourceVersion: number; segmentIndex: number; path: string; token: string | null; signedUrl: string | null; expiresAt: number; uploadState: string; alreadyVerified?: boolean; sha256?: string | null; bytes?: number }>('reserve-segment', { captureId, ...payload }),
  uploadToken: (captureId: string, segmentIndex: number, mime: string) =>
    meetingAnalysisService.reserveSegment(captureId, { segmentIndex, mime }),
  verifySegment: (captureId: string, segmentIndex: number) =>
    invoke<{ segment: { id: string; segment_index: number; source_version: number; bytes: number; sha256: string; upload_state: string; object_path: string } }>('verify-segment', { captureId, segmentIndex }),
  uploadSegment: async (captureId: string, segmentIndex: number, blob: Blob, metadata: { epoch?: number; startOffsetMs?: number; endOffsetMs?: number; overlapMs?: number; gapBeforeMs?: number } = {}) => {
    const token = await meetingAnalysisService.reserveSegment(captureId, {
      segmentIndex,
      mime: blob.type || 'audio/webm',
      bytes: blob.size,
      ...metadata,
    });
    if (token.uploadState === 'verified' || token.alreadyVerified) {
      return { ...token, sha256: token.sha256 ?? '', bytes: token.bytes ?? blob.size };
    }
    if (!token.token) throw new Error('Audio upload token is missing');
    const { error } = await supabase.storage.from('meeting-audio').uploadToSignedUrl(token.path, token.token, blob, {
      contentType: blob.type || 'audio/webm',
    });
    if (error) throw error;
    const verification = await meetingAnalysisService.verifySegment(captureId, segmentIndex);
    return { ...token, sha256: verification.segment.sha256, bytes: verification.segment.bytes };
  },
  status: (captureId: string) => invoke<MeetingCaptureProgress>('status', { captureId }),
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
