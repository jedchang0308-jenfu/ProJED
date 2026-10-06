import type { ActivityEvent, ActivityEventListQuery, EditableKnowledgeRecord, KnowledgeRecordInput } from '../types';
import { extractProjectChangeImportEvidenceBlocks, wrapProjectChangeImportContent } from './projectChangeImport';

export const MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY = 'meetingProjectChangeImport';

export type MeetingProjectChangeImportMode = 'default' | 'custom';

export type MeetingProjectChangeImportBatchV1 = {
  batchId: string;
  mode: MeetingProjectChangeImportMode;
  scope: 'board';
  rangeStartedAt: number;
  rangeEndedAt: number;
  startBoundary: 'exclusive';
  endBoundary: 'inclusive';
  sourceEventIds: string[];
  evidenceFingerprint: string;
  beforeContentSignature: string;
  importedAt: number;
  representation: 'protected_block' | 'ai_integrated';
};

export type MeetingProjectChangeImportV1 = {
  schemaVersion: 1;
  boardId: string;
  batches: MeetingProjectChangeImportBatchV1[];
  effectiveCutoffAt?: number;
};

export class MeetingProjectChangeImportError extends Error {
  readonly code: 'MISSING_EVENT_ID' | 'INVALID_METADATA' | 'STALE_REQUEST';

  constructor(code: MeetingProjectChangeImportError['code'], message: string) {
    super(message);
    this.name = 'MeetingProjectChangeImportError';
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isMode = (value: unknown): value is MeetingProjectChangeImportMode => value === 'default' || value === 'custom';

const normalizeEvidence = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();

const hasEvidence = (content: string, fingerprint: string) => {
  const normalizedContent = normalizeEvidence(content);
  const normalizedFingerprint = normalizeEvidence(fingerprint);
  return Boolean(normalizedFingerprint && normalizedContent.includes(normalizedFingerprint));
};

const parseBatch = (value: unknown): MeetingProjectChangeImportBatchV1 | null => {
  if (!isRecord(value)) return null;
  const sourceEventIds = value.sourceEventIds;
  if (
    typeof value.batchId !== 'string' || !value.batchId.trim() ||
    !isMode(value.mode) || value.scope !== 'board' ||
    !isFiniteNumber(value.rangeStartedAt) || !isFiniteNumber(value.rangeEndedAt) ||
    value.startBoundary !== 'exclusive' || value.endBoundary !== 'inclusive' ||
    !Array.isArray(sourceEventIds) || sourceEventIds.length === 0 ||
    sourceEventIds.some(id => typeof id !== 'string' || !id.trim()) ||
    new Set(sourceEventIds).size !== sourceEventIds.length ||
    typeof value.evidenceFingerprint !== 'string' || !value.evidenceFingerprint.trim() ||
    typeof value.beforeContentSignature !== 'string' || !value.beforeContentSignature.trim() ||
    !isFiniteNumber(value.importedAt) ||
    (value.representation !== 'protected_block' && value.representation !== 'ai_integrated')
  ) return null;

  return {
    batchId: value.batchId,
    mode: value.mode,
    scope: 'board',
    rangeStartedAt: value.rangeStartedAt,
    rangeEndedAt: value.rangeEndedAt,
    startBoundary: 'exclusive',
    endBoundary: 'inclusive',
    sourceEventIds: [...sourceEventIds].sort(),
    evidenceFingerprint: normalizeEvidence(value.evidenceFingerprint),
    beforeContentSignature: value.beforeContentSignature,
    importedAt: value.importedAt,
    representation: value.representation,
  };
};

/** Parse and normalize only the namespaced meeting metadata; malformed data is ignored. */
export const parseMeetingProjectChangeImportMetadata = (
  metadata: Record<string, unknown> | undefined,
  boardId: string,
): MeetingProjectChangeImportV1 | null => {
  const value = metadata?.[MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY];
  if (!isRecord(value) || value.schemaVersion !== 1 || value.boardId !== boardId || !Array.isArray(value.batches)) return null;
  const batches = value.batches.map(parseBatch);
  if (batches.some(batch => batch === null)) return null;
  if (value.effectiveCutoffAt !== undefined && !isFiniteNumber(value.effectiveCutoffAt)) return null;
  return {
    schemaVersion: 1,
    boardId,
    batches: (batches as MeetingProjectChangeImportBatchV1[]).map(batch => ({ ...batch, sourceEventIds: [...batch.sourceEventIds] })),
    ...(value.effectiveCutoffAt === undefined ? {} : { effectiveCutoffAt: value.effectiveCutoffAt }),
  };
};

export const projectMeetingProjectChangeImportMetadata = (
  metadata: Record<string, unknown> | undefined,
  boardId: string,
  status: 'draft' | 'published',
) => {
  const parsed = parseMeetingProjectChangeImportMetadata(metadata, boardId);
  if (!parsed) return metadata;
  const activeBatches = parsed.batches.filter(batch => batch.sourceEventIds.length > 0);
  const effectiveCutoffAt = status === 'published'
    ? activeBatches[activeBatches.length - 1]?.rangeEndedAt
    : undefined;
  const next: MeetingProjectChangeImportV1 = {
    schemaVersion: 1,
    boardId,
    batches: parsed.batches,
    ...(effectiveCutoffAt === undefined ? {} : { effectiveCutoffAt }),
  };
  return {
    ...(metadata ?? {}),
    [MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY]: next,
  };
};

export const getMeetingProjectChangeImportMetadataForSignature = (
  metadata: Record<string, unknown> | undefined,
) => {
  const value = metadata?.[MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY];
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.boardId !== 'string' || !Array.isArray(value.batches)) return null;
  const batches = value.batches.map(parseBatch);
  if (batches.some(batch => batch === null)) return null;
  return {
    schemaVersion: 1,
    boardId: value.boardId,
    batches: (batches as MeetingProjectChangeImportBatchV1[]).map(batch => ({
      ...batch,
      sourceEventIds: [...batch.sourceEventIds],
    })),
  };
};

export const resolveMeetingProjectChangeImportCutoff = (
  records: Array<Pick<EditableKnowledgeRecord, 'id' | 'type' | 'status' | 'boardId' | 'updatedAt' | 'metadata'>>,
  boardId: string,
) => {
  const eligible = records
    .filter(record => record.type === 'meeting' && record.status === 'published' && record.boardId === boardId)
    .map(record => ({ record, metadata: parseMeetingProjectChangeImportMetadata(record.metadata, boardId) }))
    .filter(({ metadata }) => Boolean(metadata?.effectiveCutoffAt && metadata.batches.some(batch => batch.sourceEventIds.length > 0)))
    .sort((a, b) => (b.record.updatedAt ?? 0) - (a.record.updatedAt ?? 0) || b.record.id.localeCompare(a.record.id));
  return eligible[0]?.metadata?.effectiveCutoffAt ?? null;
};

export const resolveMeetingProjectChangeImportWindow = ({
  draftOccurredAt,
  clickedAt,
  records,
  boardId,
  mode = 'default',
  customStartedAt,
  customEndedAt,
}: {
  draftOccurredAt?: number;
  clickedAt: number;
  records: Array<Pick<EditableKnowledgeRecord, 'id' | 'type' | 'status' | 'boardId' | 'updatedAt' | 'metadata'>>;
  boardId: string;
  mode?: MeetingProjectChangeImportMode;
  customStartedAt?: number;
  customEndedAt?: number;
}) => {
  if (mode === 'custom') {
    if (!isFiniteNumber(customStartedAt) || !isFiniteNumber(customEndedAt) || customStartedAt > customEndedAt || customEndedAt > clickedAt) {
      throw new MeetingProjectChangeImportError('INVALID_METADATA', '請確認自訂日期範圍。');
    }
    return { rangeStartedAt: customStartedAt, rangeEndedAt: customEndedAt, startBoundary: 'exclusive' as const, endBoundary: 'inclusive' as const };
  }
  const cutoff = resolveMeetingProjectChangeImportCutoff(records, boardId);
  return {
    rangeStartedAt: cutoff ?? ((draftOccurredAt ?? clickedAt) - 7 * 24 * 60 * 60 * 1000),
    rangeEndedAt: clickedAt,
    startBoundary: 'exclusive' as const,
    endBoundary: 'inclusive' as const,
  };
};

export const listMeetingProjectChangeDelta = (
  events: ActivityEvent[],
  existingEventIds: string[],
) => {
  if (events.some(event => typeof event.id !== 'string' || !event.id.trim())) {
    throw new MeetingProjectChangeImportError('MISSING_EVENT_ID', '專案變更缺少穩定識別碼，未匯入任何內容。');
  }
  const seen = new Set(existingEventIds);
  const returned = new Set<string>();
  return events.filter(event => {
    const id = event.id as string;
    if (seen.has(id) || returned.has(id)) return false;
    returned.add(id);
    return true;
  });
};

export const createMeetingProjectChangeImportBatch = ({
  mode,
  rangeStartedAt,
  rangeEndedAt,
  events,
  beforeContentSignature,
  importedAt,
  content,
}: {
  mode: MeetingProjectChangeImportMode;
  rangeStartedAt: number;
  rangeEndedAt: number;
  events: ActivityEvent[];
  beforeContentSignature: string;
  importedAt: number;
  content: string;
}): MeetingProjectChangeImportBatchV1 => {
  const ids = events.map(event => event.id).filter((id): id is string => Boolean(id)).sort();
  const evidenceBlocks = extractProjectChangeImportEvidenceBlocks(content);
  const evidence = evidenceBlocks[evidenceBlocks.length - 1] ?? content;
  return {
    batchId: `meeting-import-${importedAt}-${ids.join('-')}`,
    mode,
    scope: 'board',
    rangeStartedAt,
    rangeEndedAt,
    startBoundary: 'exclusive',
    endBoundary: 'inclusive',
    sourceEventIds: ids,
    evidenceFingerprint: normalizeEvidence(evidence),
    beforeContentSignature,
    importedAt,
    representation: 'protected_block',
  };
};

export const reconcileMeetingProjectChangeImportMetadata = (
  metadata: Record<string, unknown> | undefined,
  boardId: string,
  content: string,
) => {
  const parsed = parseMeetingProjectChangeImportMetadata(metadata, boardId);
  if (!parsed) return metadata;
  const blocks = extractProjectChangeImportEvidenceBlocks(content);
  const activeBatches = parsed.batches.filter(batch => batch.representation === 'ai_integrated' || blocks.some(block => hasEvidence(block, batch.evidenceFingerprint)));
  const next = { ...parsed, batches: activeBatches };
  delete next.effectiveCutoffAt;
  return { ...(metadata ?? {}), [MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY]: next };
};

export const markMeetingProjectChangeImportAiIntegrated = (
  metadata: Record<string, unknown> | undefined,
  boardId: string,
) => {
  const parsed = parseMeetingProjectChangeImportMetadata(metadata, boardId);
  if (!parsed) return metadata;
  return {
    ...(metadata ?? {}),
    [MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY]: {
      ...parsed,
      batches: parsed.batches.map(batch => ({ ...batch, representation: 'ai_integrated' as const })),
    },
  };
};

export const buildMeetingProjectChangeImportDraft = (
  draft: KnowledgeRecordInput,
  boardId: string,
  batch: MeetingProjectChangeImportBatchV1,
  importedContent: string,
) => {
  const previous = parseMeetingProjectChangeImportMetadata(draft.metadata, boardId);
  const nextMetadata: MeetingProjectChangeImportV1 = {
    schemaVersion: 1,
    boardId,
    batches: [...(previous?.batches ?? []), batch],
  };
  return {
    ...draft,
    content: [draft.content.trim(), wrapProjectChangeImportContent(importedContent)].filter(Boolean).join('\n\n'),
    metadata: { ...(draft.metadata ?? {}), [MEETING_PROJECT_CHANGE_IMPORT_METADATA_KEY]: nextMetadata },
  };
};

export const createMeetingActivityQuery = ({
  workspaceId,
  boardId,
  startedAt,
  endedAt,
  eventTypes,
}: {
  workspaceId: string;
  boardId: string;
  startedAt: number;
  endedAt: number;
  eventTypes?: ActivityEventListQuery['eventTypes'];
}): ActivityEventListQuery => ({
  workspaceId,
  boardId,
  scope: 'board',
  startedAt,
  endedAt,
  startBoundary: 'exclusive',
  eventTypes,
});
