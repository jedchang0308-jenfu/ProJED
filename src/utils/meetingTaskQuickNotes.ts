import dayjs from 'dayjs';
import type { EditableKnowledgeRecord, KnowledgeRecordInput } from '../types';
import {
  appendTaskDiscussionToRecordContent,
  MEETING_TASK_DISCUSSION_HEADING,
  normalizeMeetingTaskDiscussionText,
} from './meetingTaskDiscussion';

export const MEETING_TASK_QUICK_NOTES_KEY = 'meetingTaskQuickNotes';
export const MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION = 1 as const;

export type MeetingTaskQuickNoteEntry = {
  id: string;
  taskId: string;
  text: string;
  occurredAt: number;
  anchor: {
    lineIndex: number;
    sourceToken: string;
  };
};

export type MeetingTaskQuickNotesV1 = {
  schemaVersion: typeof MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION;
  entries: MeetingTaskQuickNoteEntry[];
};

export type MeetingTaskQuickNotesParseResult =
  | { status: 'empty'; namespace: null }
  | { status: 'valid'; namespace: MeetingTaskQuickNotesV1 }
  | { status: 'invalid'; namespace: null; message: string };

export type MeetingTaskDiscussionCandidate = {
  lineIndex: number;
  timeLabel: string;
  taskId: string;
  taskTitle: string;
  sourceToken: string;
  text: string;
  rawLine: string;
};

export type MeetingTaskQuickNoteAppendResult = {
  content: string;
  entry: MeetingTaskQuickNoteEntry;
};

export type MeetingTaskQuickNoteReconcileResult = {
  status: 'valid' | 'invalid';
  metadata: Record<string, unknown>;
  detachedIds: string[];
  conflicts: string[];
};

export type MeetingTaskQuickNoteRecordLike = Pick<
  EditableKnowledgeRecord | KnowledgeRecordInput,
  'id' | 'content' | 'metadata' | 'status'
> & {
  taskLinks?: Array<{ nodeId: string }>;
};

export type MeetingTaskQuickNoteProjection = MeetingTaskQuickNoteEntry & {
  recordId: string;
  recordStatus: MeetingTaskQuickNoteRecordLike['status'];
  archived: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeText = (value: string) => normalizeMeetingTaskDiscussionText(value).trim();

const cloneEntry = (entry: MeetingTaskQuickNoteEntry): MeetingTaskQuickNoteEntry => ({
  id: entry.id,
  taskId: entry.taskId,
  text: entry.text,
  occurredAt: entry.occurredAt,
  anchor: { ...entry.anchor },
});

const isValidEntry = (value: unknown): value is MeetingTaskQuickNoteEntry => {
  if (!isObject(value)) return false;
  const anchor = value.anchor;
  return (
    typeof value.id === 'string' && value.id.trim() !== ''
    && typeof value.taskId === 'string' && value.taskId.trim() !== ''
    && typeof value.text === 'string' && normalizeText(value.text) !== ''
    && typeof value.occurredAt === 'number' && Number.isFinite(value.occurredAt)
    && isObject(anchor)
    && typeof anchor.lineIndex === 'number' && Number.isInteger(anchor.lineIndex) && anchor.lineIndex >= 0
    && typeof anchor.sourceToken === 'string' && anchor.sourceToken.trim() !== ''
  );
};

export const parseMeetingTaskQuickNotesMetadata = (
  metadata?: Record<string, unknown>,
): MeetingTaskQuickNotesParseResult => {
  const raw = metadata?.[MEETING_TASK_QUICK_NOTES_KEY];
  if (raw === undefined || raw === null) return { status: 'empty', namespace: null };
  if (!isObject(raw) || raw.schemaVersion !== MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION || !Array.isArray(raw.entries)) {
    return { status: 'invalid', namespace: null, message: 'meetingTaskQuickNotes schema 不可辨識。' };
  }
  const entries = raw.entries.filter(isValidEntry).map(cloneEntry);
  if (entries.length !== raw.entries.length) {
    return { status: 'invalid', namespace: null, message: 'meetingTaskQuickNotes 含有無效 entry。' };
  }
  const ids = new Set<string>();
  if (entries.some(entry => ids.has(entry.id))) {
    return { status: 'invalid', namespace: null, message: 'meetingTaskQuickNotes entry id 重複。' };
  }
  entries.forEach(entry => ids.add(entry.id));
  return {
    status: 'valid',
    namespace: { schemaVersion: MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION, entries },
  };
};

export const getMeetingTaskQuickNotes = (
  metadata?: Record<string, unknown>,
): MeetingTaskQuickNotesV1 | null => {
  const result = parseMeetingTaskQuickNotesMetadata(metadata);
  return result.status === 'valid' ? result.namespace : null;
};

const buildSourceToken = (timeLabel: string, taskId: string) => `${timeLabel}|${taskId}`;

export const parseMeetingTaskDiscussionCandidates = (content: string): MeetingTaskDiscussionCandidate[] => {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const candidates: MeetingTaskDiscussionCandidate[] = [];
  let inSection = false;
  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (trimmed === MEETING_TASK_DISCUSSION_HEADING) {
      inSection = true;
      return;
    }
    if (inSection && /^##\s+/.test(trimmed)) {
      inSection = false;
      return;
    }
    if (!inSection) return;
    const match = /^-\s+(\d{2}:\d{2})\s+@\[([^\]]+)\]\(task:([^)]+)\)[：:]\s*(.*)$/.exec(trimmed);
    if (!match) return;
    const [, timeLabel, taskTitle, taskId, rawText] = match;
    const text = normalizeText(rawText);
    if (!text) return;
    candidates.push({
      lineIndex,
      timeLabel,
      taskId,
      taskTitle,
      sourceToken: buildSourceToken(timeLabel, taskId),
      text,
      rawLine: trimmed,
    });
  });
  return candidates;
};

const cloneMetadataWithNamespace = (
  metadata: Record<string, unknown> | undefined,
  namespace: MeetingTaskQuickNotesV1,
) => ({
  ...(metadata ?? {}),
  [MEETING_TASK_QUICK_NOTES_KEY]: {
    schemaVersion: MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION,
    entries: namespace.entries.map(cloneEntry),
  } satisfies MeetingTaskQuickNotesV1,
});

export const appendMeetingTaskQuickNoteToRecordContent = (
  content: string,
  taskId: string,
  taskTitle: string,
  text: string,
  occurredAt = Date.now(),
  entryId = createMeetingTaskQuickNoteId(),
): MeetingTaskQuickNoteAppendResult | null => {
  const normalizedText = normalizeText(text);
  if (!taskId.trim() || !normalizedText) return null;
  const nextContent = appendTaskDiscussionToRecordContent(content, taskId, taskTitle, normalizedText, occurredAt);
  if (!nextContent) return null;
  const timeLabel = dayjs(occurredAt).format('HH:mm');
  const sourceToken = buildSourceToken(timeLabel, taskId);
  const candidates = parseMeetingTaskDiscussionCandidates(nextContent)
    .filter(candidate => candidate.sourceToken === sourceToken && candidate.text === normalizedText);
  const candidate = candidates[candidates.length - 1];
  if (!candidate) return null;
  return {
    content: nextContent,
    entry: {
      id: entryId,
      taskId,
      text: normalizedText,
      occurredAt,
      anchor: { lineIndex: candidate.lineIndex, sourceToken },
    },
  };
};

export const appendMeetingTaskQuickNoteMetadata = (
  metadata: Record<string, unknown> | undefined,
  entry: MeetingTaskQuickNoteEntry,
): { status: 'appended' | 'denied'; metadata: Record<string, unknown>; message?: string } => {
  const parsed = parseMeetingTaskQuickNotesMetadata(metadata);
  if (parsed.status === 'invalid') return { status: 'denied', metadata: { ...(metadata ?? {}) }, message: parsed.message };
  const namespace = parsed.namespace ?? { schemaVersion: MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION, entries: [] };
  if (namespace.entries.some(item => item.id === entry.id)) {
    return { status: 'denied', metadata: { ...(metadata ?? {}) }, message: 'submissionId 已存在。' };
  }
  return {
    status: 'appended',
    metadata: cloneMetadataWithNamespace(metadata, { ...namespace, entries: [...namespace.entries, cloneEntry(entry)] }),
  };
};

const findCandidateForEntry = (
  entry: MeetingTaskQuickNoteEntry,
  candidates: MeetingTaskDiscussionCandidate[],
): MeetingTaskDiscussionCandidate | null => {
  const atAnchor = candidates.find(candidate => (
    candidate.lineIndex === entry.anchor.lineIndex && candidate.sourceToken === entry.anchor.sourceToken
  ));
  if (atAnchor) return atAnchor;
  const byText = candidates.filter(candidate => (
    candidate.sourceToken === entry.anchor.sourceToken && candidate.text === entry.text
  ));
  if (byText.length === 1) return byText[0];
  const byToken = candidates.filter(candidate => candidate.sourceToken === entry.anchor.sourceToken);
  return byToken.length === 1 ? byToken[0] : null;
};

export const reconcileMeetingTaskQuickNoteMetadata = (
  previousContent: string,
  nextContent: string,
  metadata?: Record<string, unknown>,
): MeetingTaskQuickNoteReconcileResult => {
  const parsed = parseMeetingTaskQuickNotesMetadata(metadata);
  if (parsed.status === 'empty') return { status: 'valid', metadata: { ...(metadata ?? {}) }, detachedIds: [], conflicts: [] };
  if (parsed.status === 'invalid') {
    return { status: 'invalid', metadata: { ...(metadata ?? {}) }, detachedIds: [], conflicts: [parsed.message] };
  }
  const candidates = parseMeetingTaskDiscussionCandidates(nextContent);
  const entries: MeetingTaskQuickNoteEntry[] = [];
  const detachedIds: string[] = [];
  const conflicts: string[] = [];
  parsed.namespace.entries.forEach((entry) => {
    const candidate = findCandidateForEntry(entry, candidates);
    if (!candidate) {
      detachedIds.push(entry.id);
      return;
    }
    entries.push({
      ...entry,
      text: candidate.text,
      taskId: candidate.taskId,
      anchor: { lineIndex: candidate.lineIndex, sourceToken: candidate.sourceToken },
    });
  });
  if (entries.length === 0) {
    const nextMetadata = { ...(metadata ?? {}) };
    delete nextMetadata[MEETING_TASK_QUICK_NOTES_KEY];
    return { status: 'valid', metadata: nextMetadata, detachedIds, conflicts };
  }
  void previousContent;
  return {
    status: 'valid',
    metadata: cloneMetadataWithNamespace(metadata, { schemaVersion: MEETING_TASK_QUICK_NOTES_SCHEMA_VERSION, entries }),
    detachedIds,
    conflicts,
  };
};

export const validateMeetingTaskQuickNoteAggregate = (
  content: string,
  metadata?: Record<string, unknown>,
): { valid: boolean; errors: string[] } => {
  const parsed = parseMeetingTaskQuickNotesMetadata(metadata);
  if (parsed.status === 'empty') return { valid: true, errors: [] };
  if (parsed.status === 'invalid') return { valid: false, errors: [parsed.message] };
  const candidates = parseMeetingTaskDiscussionCandidates(content);
  const errors: string[] = [];
  parsed.namespace.entries.forEach(entry => {
    const candidate = candidates.find(item => (
      item.lineIndex === entry.anchor.lineIndex
      && item.sourceToken === entry.anchor.sourceToken
      && item.taskId === entry.taskId
      && item.text === entry.text
    ));
    if (!candidate) errors.push(`entry ${entry.id} 沒有唯一對應的任務討論列。`);
  });
  return { valid: errors.length === 0, errors };
};

export const projectMeetingTaskQuickNotes = (
  records: MeetingTaskQuickNoteRecordLike[],
  taskId: string,
): MeetingTaskQuickNoteProjection[] => {
  const result: MeetingTaskQuickNoteProjection[] = [];
  const seen = new Set<string>();
  records.forEach(record => {
    const recordId = record.id;
    if (!recordId || !record.content || record.status === 'archived' && !record.metadata) return;
    const namespace = getMeetingTaskQuickNotes(record.metadata);
    if (!namespace) return;
    namespace.entries.forEach(entry => {
      if (entry.taskId !== taskId) return;
      const key = `${recordId}:${entry.id}`;
      if (seen.has(key)) return;
      const candidate = parseMeetingTaskDiscussionCandidates(record.content).find(item => (
        item.lineIndex === entry.anchor.lineIndex && item.sourceToken === entry.anchor.sourceToken
      ));
      if (!candidate) return;
      seen.add(key);
      result.push({
        ...entry,
        text: candidate.text,
        recordId,
        recordStatus: record.status,
        archived: record.status === 'archived',
      });
    });
  });
  return result.sort((left, right) => (
    left.occurredAt - right.occurredAt
    || left.recordId.localeCompare(right.recordId)
    || left.id.localeCompare(right.id)
  ));
};

export const createMeetingTaskQuickNoteId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `quick_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};
