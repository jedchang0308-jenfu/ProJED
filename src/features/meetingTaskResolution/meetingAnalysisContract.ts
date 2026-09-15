export const MEETING_ANALYSIS_CONTRACT_VERSION = 'dev-123.v1' as const;
export const MEETING_AUDIO_SEGMENT_MS = 5 * 60 * 1000;
export const MEETING_POINTER_BATCH_MAX_INTERVALS = 500;
export const MEETING_POINTER_BATCH_MAX_BYTES = 128 * 1024;

export type MeetingCaptureState =
  | 'created' | 'recording' | 'paused' | 'stopped' | 'uploading' | 'queued' | 'running'
  | 'ready' | 'awaiting_budget' | 'cancelled' | 'expired' | 'failed_retryable'
  | 'failed_terminal';

export type MeetingPointerInterval = {
  captureId: string;
  clockEpoch: number;
  sequence: number;
  canonicalTaskId: string;
  surfaceKind: string;
  startedOffsetMs: number;
  endedOffsetMs: number;
  visible: boolean;
  terminationReason: string;
};

export type MeetingAudioSegmentManifest = {
  segmentId: string;
  segmentIndex: number;
  epoch: number;
  startOffsetMs: number;
  endOffsetMs: number;
  overlapMs: number;
  gapBeforeMs: number;
  mime: string;
  bytes: number;
  sha256?: string;
  objectPath?: string;
  uploadState: 'pending' | 'uploading' | 'uploaded' | 'verified' | 'expired' | 'purged';
};

export type MeetingCaptureProgress = {
  captureId: string;
  state: MeetingCaptureState;
  sourceVersion: number;
  lastProgressAt: number | null;
  stoppedAt: number | null;
  audioExpiresAt: number | null;
  reviewRevision: number;
  pointerLoss: boolean;
  sourceCompleteness: 'complete' | 'partial' | 'missing';
  finalPointerSequence?: number | null;
  sourceGaps?: Array<{ startOffsetMs: number; endOffsetMs: number; reason: string }>;
};

export type MeetingTaskCandidate = {
  taskId: string;
  title: string;
  path: string;
  quoteRange?: { fromWord: number; toWord: number } | null;
  semanticScore: number;
  pointerFeature: number;
  source: 'lexical' | 'rag' | 'pointer' | 'human';
  snapshotHash: string;
  decision?: 'suggested' | 'accepted' | 'rejected' | 'cleared';
};

export type MeetingReviewSegment = {
  segmentId: string;
  audioSegmentId?: string | null;
  transcriptRevisionId: string;
  text: string;
  startOffsetMs: number;
  endOffsetMs: number;
  wordOffsets: unknown[];
  resolutionId: string | null;
  resolutionRevision: number;
  decision: MeetingSegmentResolution['decision'];
  humanReviewed: boolean;
  humanEmptyDecision: boolean;
  candidates: MeetingTaskCandidate[];
};

export type MeetingSegmentResolution = {
  segmentId: string;
  text: string;
  startOffsetMs: number;
  endOffsetMs: number;
  candidates: MeetingTaskCandidate[];
  decision: 'pending' | 'accepted' | 'rejected' | 'needs_review';
  humanReviewed: boolean;
  humanEmptyDecision: boolean;
  revision: number;
};

export type MeetingDraftProjection = {
  content: string;
  taskLinks: Array<{ nodeId: string; role: 'main' | 'related' | 'decision' | 'blocker' | 'follow_up' }>;
  appliedRunId: string | null;
  appliedReviewRevision: number;
  manualLinkSet: string[];
  autoLinkSet: string[];
  resolutionLinkSet: string[];
};

export type MeetingDraftTaskLink = MeetingDraftProjection['taskLinks'][number];

export type MeetingResolutionTaskLinkState = {
  taskLinks: MeetingDraftTaskLink[];
  autoLinkSet: string[];
  manualLinkSet: string[];
  resolutionLinkSet: string[];
};

export const reconcileMeetingResolutionTaskLinks = (
  existingLinks: MeetingDraftTaskLink[],
  acceptedTaskIds: string[],
  manuallyResolvedTaskIds: string[],
  previousAutoLinkSet: string[],
  previousResolutionLinkSet: string[],
): MeetingResolutionTaskLinkState => {
  const readIds = (ids: string[]) => Array.from(new Set(ids.filter(id => typeof id === 'string' && id.length > 0)));
  const previousAuto = readIds(previousAutoLinkSet);
  const previousResolution = readIds(previousResolutionLinkSet);
  const accepted = readIds(acceptedTaskIds);
  const manual = readIds(manuallyResolvedTaskIds).filter(taskId => accepted.includes(taskId));
  const auto = accepted.filter(taskId => !manual.includes(taskId));
  const managedTaskIds = new Set(previousResolution.length > 0 ? previousResolution : previousAuto);
  const existingByTaskId = new Map(existingLinks.map(link => [link.nodeId, link]));
  const retainedLinks = existingLinks.filter(link => !managedTaskIds.has(link.nodeId));
  const resolutionLinkSet = accepted.filter(taskId => managedTaskIds.has(taskId) || !existingByTaskId.has(taskId));
  const retainedTaskIds = new Set(retainedLinks.map(link => link.nodeId));
  const resolvedLinks = accepted
    .filter(taskId => !retainedTaskIds.has(taskId))
    .map(nodeId => existingByTaskId.get(nodeId) ?? { nodeId, role: 'related' as const });
  return {
    taskLinks: [...retainedLinks, ...resolvedLinks],
    autoLinkSet: auto,
    manualLinkSet: manual,
    resolutionLinkSet,
  };
};

export const createCaptureEpoch = (epoch: number, captureOffsetMs: number, monotonicStart: number) => ({
  epoch,
  captureOffsetMs,
  monotonicStart,
  durationMs: 0,
  gapBeforeMs: 0,
});

export const shouldRotateAudioSegment = (segmentStartOffsetMs: number, captureOffsetMs: number) => (
  captureOffsetMs - segmentStartOffsetMs >= MEETING_AUDIO_SEGMENT_MS
);

export const clampPointerInterval = (interval: MeetingPointerInterval): MeetingPointerInterval | null => {
  if (!interval.canonicalTaskId || !Number.isFinite(interval.startedOffsetMs) || !Number.isFinite(interval.endedOffsetMs)) return null;
  if (interval.endedOffsetMs <= interval.startedOffsetMs) return null;
  const startedOffsetMs = Math.max(0, Math.floor(interval.startedOffsetMs));
  const endedOffsetMs = Math.max(0, Math.floor(interval.endedOffsetMs));
  if (endedOffsetMs <= startedOffsetMs) return null;
  return {
    ...interval,
    startedOffsetMs,
    endedOffsetMs,
    sequence: Math.max(0, Math.floor(interval.sequence)),
    clockEpoch: Math.max(0, Math.floor(interval.clockEpoch)),
  };
};

export const mergePointerIntervals = (intervals: MeetingPointerInterval[]) => {
  const sorted = intervals
    .map(clampPointerInterval)
    .filter((item): item is MeetingPointerInterval => Boolean(item))
    .sort((left, right) => left.startedOffsetMs - right.startedOffsetMs || left.sequence - right.sequence);
  const merged: MeetingPointerInterval[] = [];
  for (const current of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous
      && previous.captureId === current.captureId
      && previous.clockEpoch === current.clockEpoch
      && previous.canonicalTaskId === current.canonicalTaskId
      && previous.surfaceKind === current.surfaceKind
      && current.startedOffsetMs <= previous.endedOffsetMs + 250
    ) {
      previous.endedOffsetMs = Math.max(previous.endedOffsetMs, current.endedOffsetMs);
      previous.terminationReason = current.terminationReason;
      previous.visible = previous.visible && current.visible;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
};

export const selectPointerFeaturesForSegment = (
  intervals: MeetingPointerInterval[],
  startOffsetMs: number,
  endOffsetMs: number,
) => mergePointerIntervals(intervals)
  .filter(interval => interval.endedOffsetMs > startOffsetMs && interval.startedOffsetMs < endOffsetMs)
  .map(interval => ({
    taskId: interval.canonicalTaskId,
    overlapMs: Math.max(0, Math.min(interval.endedOffsetMs, endOffsetMs) - Math.max(interval.startedOffsetMs, startOffsetMs)),
    surfaceKind: interval.surfaceKind,
    visible: interval.visible,
  }));

export const createProjectionFromResolutions = (
  baseContent: string,
  resolutions: MeetingSegmentResolution[],
): MeetingDraftProjection => {
  const accepted = resolutions
    .filter(item => item.decision === 'accepted' && !item.humanEmptyDecision)
    .flatMap(item => item.candidates.filter(candidate => candidate.source !== 'pointer').map(candidate => ({ item, candidate })));
  const uniqueLinks = Array.from(new Map(accepted.map(({ candidate }) => [candidate.taskId, candidate])).values());
  const lines = resolutions
    .filter(item => item.text.trim() && (item.decision === 'accepted' || item.humanReviewed))
    .map(item => `- [${item.startOffsetMs}ms] ${item.text.trim()}`);
  const generated = lines.length > 0 ? `${baseContent.trim()}${baseContent.trim() ? '\n\n' : ''}${lines.join('\n')}` : baseContent;
  return {
    content: generated,
    taskLinks: uniqueLinks.map(candidate => ({ nodeId: candidate.taskId, role: 'related' as const })),
    appliedRunId: null,
    appliedReviewRevision: Math.max(0, ...resolutions.map(item => item.revision)),
    manualLinkSet: resolutions.filter(item => item.humanReviewed).flatMap(item => item.candidates.map(candidate => candidate.taskId)),
    autoLinkSet: uniqueLinks.map(candidate => candidate.taskId),
    resolutionLinkSet: uniqueLinks.map(candidate => candidate.taskId),
  };
};
