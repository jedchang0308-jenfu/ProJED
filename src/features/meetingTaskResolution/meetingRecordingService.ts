import type { MeetingCaptureProgress, MeetingPointerInterval } from './meetingAnalysisContract';

export type MeetingCaptureBeginInput = {
  tenantId: string;
  projectId: string;
  recordId: string;
  idempotencyKey: string;
};

export type MeetingAudioReservationInput = {
  segmentIndex: number;
  mime: string;
  bytes?: number;
  epoch?: number;
  startOffsetMs?: number;
  endOffsetMs?: number;
  overlapMs?: number;
  gapBeforeMs?: number;
  reservationKey?: string;
};

export type MeetingAudioReservation = {
  segmentId: string;
  sourceVersion: number;
  segmentIndex: number;
  path: string;
  token: string | null;
  signedUrl: string | null;
  expiresAt: number;
  uploadState: string;
  alreadyVerified?: boolean;
  sha256?: string | null;
  bytes?: number;
};

export type MeetingAudioVerification = {
  segment: {
    id: string;
    segment_index: number;
    source_version: number;
    bytes: number;
    sha256: string;
    upload_state: string;
    object_path: string;
  };
};

export type MeetingAudioUploadReceipt = MeetingAudioReservation & {
  sha256: string;
  bytes: number;
};

export type MeetingAudioUploadMetadata = Omit<MeetingAudioReservationInput, 'segmentIndex' | 'mime' | 'bytes'> & {
  /** Frozen capture source version captured by the recorder/recovery scope. */
  expectedSourceVersion?: number;
};

export interface MeetingRecordingDependencies {
  invoke<T>(operation: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
  reserveAudio?(
    captureId: string,
    payload: MeetingAudioReservationInput,
    expectedSourceVersion: number | undefined,
    signal?: AbortSignal,
  ): Promise<MeetingAudioReservation>;
  verifyAudio?(
    captureId: string,
    segmentIndex: number,
    expectedSourceVersion: number | undefined,
    signal?: AbortSignal,
  ): Promise<MeetingAudioVerification>;
  uploadReservedAudio?(
    reservation: MeetingAudioReservation,
    blob: Blob,
    signal?: AbortSignal,
  ): Promise<void>;
  uploadToSignedUrl?(
    path: string,
    token: string,
    blob: Blob,
    options: { contentType: string },
  ): Promise<{ error: unknown | null }>;
}

export class MeetingRecordingScopeChangedError extends Error {
  readonly code = 'MEETING_RECORDING_SCOPE_CHANGED';

  constructor() {
    super('Meeting recording scope is no longer current');
    this.name = 'MeetingRecordingScopeChangedError';
  }
}

export class MeetingRecordingAbortedError extends Error {
  readonly code = 'ABORT_ERR';

  constructor() {
    super('Meeting recording request was aborted');
    this.name = 'AbortError';
  }
}

export interface ScopedMeetingRecordingService {
  begin(payload: MeetingCaptureBeginInput): Promise<{ captureId: string; state: string; sourceVersion: number; startedAt: string }>;
  status(captureId: string): Promise<MeetingCaptureProgress>;
  progress(captureId: string, payload: { expectedSourceVersion: number; epochManifest: unknown; lastProgressAt: number }): Promise<MeetingCaptureProgress>;
  pause(captureId: string, expectedSourceVersion: number): Promise<MeetingCaptureProgress>;
  resume(captureId: string, epochManifest: unknown, expectedSourceVersion: number): Promise<MeetingCaptureProgress>;
  stop(captureId: string, payload: {
    expectedSourceVersion: number;
    stoppedAt: number;
    pointerLoss?: boolean;
    epochManifest?: unknown;
    finalPointerSequence?: number | null;
    gaps?: unknown[];
  }): Promise<MeetingCaptureProgress>;
  appendPointer(captureId: string, payload: {
    expectedSourceVersion: number;
    batchKey: string;
    digest: string;
    intervals: MeetingPointerInterval[];
  }): Promise<{ ackSequence: number }>;
  completeUpload(captureId: string, payload: {
    expectedSourceVersion: number;
    audioManifestHash: string;
    pointerManifestHash: string;
    sourceCompleteness: string;
    audioManifest?: unknown[];
  }): Promise<{ state: string; runId: string | null; sourceVersion: number; sourceComplete?: boolean }>;
  reserveSegment(captureId: string, payload: MeetingAudioReservationInput): Promise<MeetingAudioReservation>;
  verifySegment(captureId: string, segmentIndex: number, expectedSourceVersion?: number): Promise<MeetingAudioVerification>;
  uploadSegment(
    captureId: string,
    segmentIndex: number,
    blob: Blob,
    metadata?: MeetingAudioUploadMetadata,
  ): Promise<MeetingAudioUploadReceipt>;
}

function abortError(): MeetingRecordingAbortedError {
  return new MeetingRecordingAbortedError();
}

function verifiedAudioMismatch(): Error {
  return Object.assign(new Error('Verified meeting audio does not match the local segment'), {
    code: 'MEETING_AUDIO_VERIFICATION_MISMATCH',
  });
}

function reservationMismatch(): Error {
  return Object.assign(new Error('Meeting audio reservation does not match its frozen source scope'), {
    code: 'MEETING_AUDIO_RESERVATION_MISMATCH',
  });
}

function assertReservationIdentity(
  reservation: MeetingAudioReservation,
  segmentIndex: number,
  expectedSourceVersion?: number,
): void {
  if (!Number.isSafeInteger(reservation.sourceVersion) || reservation.sourceVersion <= 0
      || (expectedSourceVersion !== undefined && reservation.sourceVersion !== expectedSourceVersion)
      || reservation.segmentIndex !== segmentIndex
      || typeof reservation.segmentId !== 'string' || reservation.segmentId.length === 0
      || typeof reservation.path !== 'string' || reservation.path.length === 0) {
    throw reservationMismatch();
  }
}

function assertVerificationMatches(
  verification: MeetingAudioVerification,
  reservation: MeetingAudioReservation,
  segmentIndex: number,
  expectedSourceVersion: number,
  bytes: number,
  sha256: string,
): void {
  const segment = verification?.segment;
  if (!segment || segment.upload_state !== 'verified'
      || segment.id !== reservation.segmentId
      || segment.segment_index !== segmentIndex
      || segment.source_version !== expectedSourceVersion
      || segment.source_version !== reservation.sourceVersion
      || segment.object_path !== reservation.path
      || segment.bytes !== bytes
      || segment.sha256 !== sha256) {
    throw verifiedAudioMismatch();
  }
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Blob(blob: Blob, awaitCurrent: <T>(operation: () => Promise<T>) => Promise<T>): Promise<string> {
  const bytes = await awaitCurrent(() => blob.arrayBuffer());
  const digest = await awaitCurrent(() => globalThis.crypto.subtle.digest('SHA-256', bytes));
  return bytesToHex(digest);
}

/**
 * Bind each legacy recorder operation to the actor/capture lifetime that
 * started it. Supabase invoke and signed-upload APIs do not accept AbortSignal;
 * requests already sent cannot be recalled, so this fence blocks every later
 * operation and result after a scope change or abort.
 */
export function createMeetingRecordingService(
  dependencies: MeetingRecordingDependencies,
  isCurrent: () => boolean,
  signal?: AbortSignal,
): ScopedMeetingRecordingService {
  const assertActive = (): void => {
    if (signal?.aborted) throw abortError();
    let current = false;
    try { current = isCurrent(); } catch { /* Treat a broken scope check as stale. */ }
    if (!current) throw new MeetingRecordingScopeChangedError();
  };

  const awaitCurrent = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertActive();
    let value: T;
    try {
      value = await operation();
    } catch (error) {
      assertActive();
      throw error;
    }
    assertActive();
    return value;
  };

  const invoke = <T>(operation: string, payload: Record<string, unknown>): Promise<T> => (
    awaitCurrent(() => dependencies.invoke<T>(operation, payload, signal))
  );

  const reserveSegment = (
    captureId: string,
    payload: MeetingAudioReservationInput,
    expectedSourceVersion?: number,
  ): Promise<MeetingAudioReservation> => dependencies.reserveAudio
    ? awaitCurrent(() => dependencies.reserveAudio!(captureId, payload, expectedSourceVersion, signal))
    : invoke('reserve-segment', { captureId, ...payload });

  const verifySegment = (
    captureId: string,
    segmentIndex: number,
    expectedSourceVersion?: number,
  ): Promise<MeetingAudioVerification> => dependencies.verifyAudio
    ? awaitCurrent(() => dependencies.verifyAudio!(captureId, segmentIndex, expectedSourceVersion, signal))
    : invoke('verify-segment', { captureId, segmentIndex });

  return {
    begin: payload => invoke('begin', { ...payload }),
    status: captureId => invoke('status', { captureId }),
    progress: (captureId, payload) => invoke('progress', { captureId, ...payload }),
    pause: (captureId, expectedSourceVersion) => invoke('pause', { captureId, expectedSourceVersion }),
    resume: (captureId, epochManifest, expectedSourceVersion) => invoke('resume', {
      captureId, epochManifest, expectedSourceVersion,
    }),
    stop: (captureId, payload) => invoke('stop', { captureId, ...payload }),
    appendPointer: (captureId, payload) => invoke('append-pointer', { captureId, ...payload }),
    completeUpload: (captureId, payload) => invoke('complete-upload', { captureId, ...payload }),
    reserveSegment,
    verifySegment,
    uploadSegment: async (captureId, segmentIndex, blob, metadata = {}) => {
      const mime = blob.type || 'audio/webm';
      const { expectedSourceVersion, ...reservationMetadata } = metadata;
      if (expectedSourceVersion !== undefined
          && (!Number.isSafeInteger(expectedSourceVersion) || expectedSourceVersion <= 0)) {
        throw reservationMismatch();
      }
      const reservation = await reserveSegment(captureId, {
        segmentIndex,
        mime,
        bytes: blob.size,
        ...reservationMetadata,
      }, expectedSourceVersion);
      // reserveSegment checks after the invoke resolves; keep this explicit at
      // the point where the next, non-cancellable storage request would begin.
      assertActive();
      assertReservationIdentity(reservation, segmentIndex, expectedSourceVersion);

      const localSha256 = await sha256Blob(blob, awaitCurrent);

      if (reservation.uploadState === 'verified' || reservation.alreadyVerified) {
        if (reservation.bytes !== blob.size || reservation.sha256 !== localSha256) throw verifiedAudioMismatch();
        return { ...reservation, sha256: localSha256, bytes: blob.size };
      }

      assertActive();
      if (dependencies.uploadReservedAudio) {
        await awaitCurrent(() => dependencies.uploadReservedAudio!(reservation, blob, signal));
      } else {
        if (!reservation.token) throw new Error('Audio upload token is missing');
        if (!dependencies.uploadToSignedUrl) throw new Error('Audio upload is unavailable');
        const uploaded = await awaitCurrent(() => dependencies.uploadToSignedUrl!(
          reservation.path,
          reservation.token!,
          blob,
          { contentType: mime },
        ));
        if (uploaded.error) throw uploaded.error;
      }

      const verification = await verifySegment(
        captureId,
        segmentIndex,
        expectedSourceVersion ?? reservation.sourceVersion,
      );
      assertVerificationMatches(
        verification,
        reservation,
        segmentIndex,
        expectedSourceVersion ?? reservation.sourceVersion,
        blob.size,
        localSha256,
      );
      return { ...reservation, sha256: localSha256, bytes: blob.size };
    },
  };
}
