import { create } from 'zustand';
import dayjs from 'dayjs';
import { eventLogService, recordService } from '../services/dataBackend';
import { synthesizeMeetingRecord } from '../services/meetingSynthesisService';
import useAuthStore from './useAuthStore';
import useBoardStore from './useBoardStore';
import useUndoStore from './useUndoStore';
import {
  extractTaskMentionIds,
  insertTaskMention,
  syncTaskLinksFromRecordContent,
  uniqueRecordTaskLinks,
} from '../utils/recordContentMentions';
import {
  appendMeetingTaskQuickNoteMetadata,
  appendMeetingTaskQuickNoteToRecordContent,
  parseMeetingTaskQuickNotesMetadata,
  reconcileMeetingTaskQuickNoteMetadata,
  validateMeetingTaskQuickNoteAggregate,
} from '../utils/meetingTaskQuickNotes';
import {
  filterMeetingSynthesisActivities,
  isLowValueMeetingActivity,
  type MeetingSynthesisInput,
  type MeetingSynthesisResponse,
} from '../utils/meetingRecordSynthesis';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';
import { updateMeetingTaskReservationMetadata } from '../utils/meetingTaskReservation';
import { isMeetingRecordUnavailable } from '../utils/meetingRecordAvailability';
import { mergeHumanDraftWithAiSynthesis } from '../utils/humanDraftSynthesisMerge';
import { useMemberStore } from './useMemberStore';
import { useTagStore } from './useTagStore';
import { summarizeTaskActivity } from '../utils/meetingActivitySummary';
import {
  createMeetingLiveAggregateValue,
  formatMeetingLiveAggregateLine,
  getMeetingLiveContentBaseline,
  getMeetingLiveFieldChanges,
  isMeetingLiveAggregateNoop,
  isMeetingLiveContentField,
  meetingLiveFingerprint,
} from '../utils/meetingLiveTaskChanges';
import {
  createMeetingActivityQuery,
  createMeetingProjectChangeImportBatch,
  listMeetingProjectChangeDelta,
  markMeetingProjectChangeImportAiIntegrated,
  parseMeetingProjectChangeImportMetadata,
  projectMeetingProjectChangeImportMetadata,
  reconcileMeetingProjectChangeImportMetadata,
  resolveMeetingProjectChangeImportWindow,
  MeetingProjectChangeImportError,
} from '../utils/meetingProjectChangeImport';
import { PROJECT_CHANGE_EVENT_TYPES, createProjectChangeSynthesisInput, wrapProjectChangeImportContent } from '../utils/projectChangeImport';
import type {
  EditableKnowledgeRecord,
  KnowledgeRecordInput,
  EditableKnowledgeRecordType,
  KnowledgeRecordStatus,
  KnowledgeRecordVisibility,
  MeetingDraftRecoverySnapshot,
  MeetingDraftRecoveryState,
  MeetingTaskActivity,
  MeetingTaskActivityInput,
  MeetingLiveCaptureRuntime,
  MeetingLiveFieldAggregate,
  RecordTaskLinkRole,
  TaskNode,
  ViewMode,
} from '../types';

type RecordDraft = KnowledgeRecordInput & {
  taskLinks: Array<{ nodeId: string; role: RecordTaskLinkRole }>;
  legacyTaskLinkNodeIds?: string[];
};

type TaskSelectionModeOptions = {
  collapsePanel?: boolean;
  returnToPreviousView?: boolean;
};

type MeetingSynthesisStatus = 'idle' | 'synthesizing' | 'ready' | 'error';

type SaveDraftOptions = {
  nodes?: Record<string, TaskNode>;
  status?: KnowledgeRecordStatus;
};

type RecordSaveFeedback = {
  recordId: string;
  status: KnowledgeRecordStatus;
  savedAt: number;
} | null;

type MeetingLiveMutationInput = {
  mutationId: string;
  segmentId?: string;
  beforeNode: TaskNode | null;
  afterNode: TaskNode;
  changedKeys?: Array<keyof TaskNode>;
};

type AppendMeetingTaskQuickNoteResult =
  | { status: 'appended'; entryId: string }
  | { status: 'noop'; entryId: string }
  | { status: 'denied'; reason: 'not-meeting' | 'invalid-input' | 'invalid-metadata' | 'invalid-task' };

const activeBoardIdForMeeting = () => useBoardStore.getState().activeBoardId;

interface RecordStoreState {
  records: EditableKnowledgeRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  isPanelOpen: boolean;
  isPanelCollapsed: boolean;
  isTaskSelectionMode: boolean;
  isMeetingMode: boolean;
  meetingTaskCaptureEnabled: boolean;
  restoreCollapsedAfterSelection: boolean;
  returnViewAfterSelection: ViewMode | null;
  contentCursorOffset: number | null;
  draft: RecordDraft | null;
  draftBaselineSignature: string | null;
  meetingActivities: MeetingTaskActivity[];
  appendedMeetingActivityIds: string[];
  meetingLiveCaptureRuntime: MeetingLiveCaptureRuntime | null;
  meetingSynthesisStatus: MeetingSynthesisStatus;
  meetingSynthesisError: string | null;
  meetingSynthesisWarnings: string[];
  meetingSynthesisProvider: string | null;
  lastSaveFeedback: RecordSaveFeedback;
  meetingDraftRecovery: MeetingDraftRecoveryState;
  meetingDraftRecoveryClearToken: number;
  contentFocusRequestId: number;
  contentFocusPending: boolean;
  meetingProjectImportStatus: 'idle' | 'loading' | 'complete' | 'empty' | 'error';
  meetingProjectImportMessage: string | null;
  meetingProjectImportRequestId: number;
}

interface RecordStoreActions {
  loadRecords: (workspaceId: string, boardId: string) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanelCollapsed: () => void;
  openNewRecord: (type: EditableKnowledgeRecordType, initialNodeId?: string) => void;
  openExistingRecord: (record: EditableKnowledgeRecord) => void;
  startMeetingRecord: () => void;
  exitMeetingMode: () => void;
  toggleMeetingTaskCapture: () => void;
  setMeetingTaskReservation: (input: {
    taskId: string;
    value: number | null;
    currentUserId: string;
    activeBoardId: string;
    taskExists: boolean;
    taskArchived?: boolean;
    taskBoardId?: string | null;
  }) => 'updated' | 'cleared' | 'noop' | 'denied';
  updateDraft: (updates: Partial<RecordDraft>) => void;
  setContentCursorOffset: (offset: number) => void;
  setDraftTaskRole: (nodeId: string, role: RecordTaskLinkRole) => void;
  toggleDraftTask: (nodeId: string) => void;
  insertTaskMentionAtCursor: (nodeId: string, title: string) => void;
  appendTaskDiscussionToMeetingDraft: (input: {
    taskId: string;
    taskTitle: string;
    text: string;
    submissionId: string;
    occurredAt: number;
  }) => AppendMeetingTaskQuickNoteResult;
  commitMeetingTaskMutation: (input: MeetingLiveMutationInput) => Promise<'committed' | 'ignored' | 'failed'>;
  recordMeetingTaskActivity: (activity: MeetingTaskActivityInput) => void;
  synthesizeMeetingDraft: (nodes?: Record<string, TaskNode>) => Promise<boolean>;
  enterTaskSelectionMode: (options?: TaskSelectionModeOptions) => void;
  exitTaskSelectionMode: (restorePanel?: boolean) => void;
  saveDraft: (options?: SaveDraftOptions) => Promise<EditableKnowledgeRecord | null>;
  archiveRecord: (recordId: string) => Promise<void>;
  clearSaveFeedback: () => void;
  setMeetingDraftRecovery: (updates: Partial<MeetingDraftRecoveryState>) => void;
  restoreMeetingDraftSnapshot: (snapshot: MeetingDraftRecoverySnapshot) => void;
  requestMeetingDraftRecoveryClear: () => void;
  resetMeetingDraftRecoveryState: () => void;
  requestContentFocus: () => void;
  consumeContentFocus: () => void;
  importMeetingProjectChanges: (options?: {
    mode?: 'default' | 'custom';
    startedAt?: number;
    endedAt?: number;
    nodes?: Record<string, TaskNode>;
  }) => Promise<boolean>;
}

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `record_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createDefaultDraft = (
  type: EditableKnowledgeRecordType,
  userId: string | null,
  initialNodeId?: string
): RecordDraft => {
  const now = dayjs();
  const end = now.endOf('day');
  const start = end.subtract(7, 'day');
  const title = type === 'meeting'
    ? '會議紀錄'
    : `工作紀錄 ${now.format('YYYY/MM/DD')}`;

  return {
    id: createId(),
    type,
    title,
    content: '',
    status: 'draft',
    visibility: 'tenant',
    participantsText: '',
    occurredAt: now.valueOf(),
    startedAt: start.valueOf(),
    endedAt: end.valueOf(),
    recordedBy: userId,
    taskLinks: initialNodeId ? [{ nodeId: initialNodeId, role: 'main' }] : [],
    legacyTaskLinkNodeIds: initialNodeId ? [initialNodeId] : [],
  };
};

const uniqueLinks = uniqueRecordTaskLinks;

const toRecordInput = (record: EditableKnowledgeRecord): KnowledgeRecordInput => {
  return {
  id: record.id,
  type: record.type,
  title: record.title,
  content: record.content,
  status: record.status,
  visibility: record.visibility,
  participantsText: record.participantsText,
  occurredAt: record.occurredAt,
  startedAt: record.startedAt,
  endedAt: record.endedAt,
  recordedBy: record.recordedBy,
  metadata: record.metadata,
    taskLinks: record.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
  };
};

const toDraftFromRecordInput = (
  input: KnowledgeRecordInput,
  saved: EditableKnowledgeRecord,
): RecordDraft => ({
  ...input,
  id: saved.id,
  taskLinks: saved.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
});

const syncDraftContentLinks = (draft: RecordDraft, content: string): RecordDraft => ({
  ...draft,
  content,
  taskLinks: syncTaskLinksFromRecordContent(content, draft.taskLinks, draft.legacyTaskLinkNodeIds ?? []),
});

const summarizeMeetingActivity = (activity: MeetingTaskActivityInput) => {
  const memberNameById = new Map(
    useMemberStore.getState().boardMembers.flatMap(member => {
      const name = member.profile?.displayName || member.profile?.email;
      return name ? [[member.userId, name] as const] : [];
    }),
  );
  const tagNameById = new Map(useTagStore.getState().tags.map(tag => [tag.id, tag.name] as const));
  const summary = summarizeTaskActivity(activity.eventType, activity.payload ?? {}, {
    memberNameById,
    tagNameById,
  });
  return activity.eventType === 'task_created'
    ? `新增任務「${activity.title || activity.nodeId}」。`
    : summary;
};

const createMeetingActivity = (activity: MeetingTaskActivityInput): MeetingTaskActivity => {
  const occurredAt = activity.occurredAt ?? Date.now();
  return {
    eventType: activity.eventType,
    nodeId: activity.nodeId,
    title: activity.title,
    occurredAt,
    payload: activity.payload ?? {},
    summary: summarizeMeetingActivity(activity),
  };
};

const resetMeetingSynthesisState = {
  meetingSynthesisStatus: 'idle' as MeetingSynthesisStatus,
  meetingSynthesisError: null,
  meetingSynthesisWarnings: [],
  meetingSynthesisProvider: null,
};

const createMeetingLiveRuntime = (draftId: string, boardId: string): MeetingLiveCaptureRuntime => ({
  segment: {
    id: createId(),
    draftId,
    boardId,
    startedAt: Date.now(),
    closedAt: null,
    nextDispatchSequence: 1,
  },
  aggregates: new Map(),
  plaintextBaselines: new Map(),
  appliedMutationIds: new Set(),
  pendingMutationIds: new Set(),
  nextCommitSequence: 1,
});

const meetingLiveCommitQueues = new Map<string, Promise<'committed' | 'ignored' | 'failed'>>();

const getLineCandidates = (content: string, exactText: string) => content.split('\n')
  .map((line, index) => line === exactText ? index : -1)
  .filter(index => index >= 0);

const rebaseMeetingLiveProjectionAnchors = (
  runtime: MeetingLiveCaptureRuntime | null,
  content: string,
): MeetingLiveCaptureRuntime | null => {
  if (!runtime) return null;
  const nextAggregates = new Map<string, MeetingLiveFieldAggregate>();
  runtime.aggregates.forEach((aggregate, key) => {
    if (!aggregate.projection) {
      nextAggregates.set(key, aggregate);
      return;
    }
    const candidates = getLineCandidates(content, aggregate.projection.exactText);
    nextAggregates.set(key, {
      ...aggregate,
      projection: candidates.length === 1
        ? { ...aggregate.projection, lineIndex: candidates[0] }
        : null,
    });
  });
  return { ...runtime, aggregates: nextAggregates };
};

const initialMeetingDraftRecoveryState: MeetingDraftRecoveryState = {
  localStatus: 'idle',
  cloudStatus: 'idle',
  localSavedAt: null,
  cloudSavedAt: null,
  message: null,
  restoredAt: null,
  conflictSnapshot: null,
};

type MeetingSynthesisTraceMetadata = ReturnType<typeof createMeetingSynthesisTraceMetadata>;

const createMeetingSynthesisTraceMetadata = (
  result: MeetingSynthesisResponse,
  sourceContent: string,
  outputContent: string,
) => ({
  runId: result.runId,
  contractVersion: result.contractVersion,
  functionVersion: result.functionVersion,
  provider: result.provider,
  model: result.model,
  generatedAt: result.generatedAt,
  normalization: result.normalization,
  quality: result.quality,
  sourceContent,
  outputContent,
});

const getMeetingSynthesisTraceMetadata = (draft: RecordDraft): MeetingSynthesisTraceMetadata | null => {
  const trace = draft.metadata?.meetingSynthesis;
  return trace && typeof trace === 'object' && !Array.isArray(trace)
    ? trace as MeetingSynthesisTraceMetadata
    : null;
};

const normalizeSynthesisContentForComparison = (content: string) =>
  content.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();

const getMeetingSynthesisSourceDraft = (draft: RecordDraft): RecordDraft => {
  const trace = getMeetingSynthesisTraceMetadata(draft);
  if (
    trace &&
    typeof trace.sourceContent === 'string' &&
    typeof trace.outputContent === 'string' &&
    normalizeSynthesisContentForComparison(trace.outputContent) === normalizeSynthesisContentForComparison(draft.content)
  ) {
    return { ...draft, content: trace.sourceContent };
  }
  return draft;
};

const getMeetingSynthesisMergeViolations = (aiContent: string, mergedContent: string) => {
  const violations: string[] = [];
  for (const heading of ['1. 本次會議總結', '2. 任務討論與結論', '3. 其他']) {
    if (!aiContent.includes(heading)) continue;
    const occurrenceCount = mergedContent.split(heading).length - 1;
    if (occurrenceCount !== 1) violations.push(`SECTION_COUNT:${heading}:${occurrenceCount}`);
  }
  const mergedTaskIds = new Set(extractTaskMentionIds(mergedContent));
  if (extractTaskMentionIds(aiContent).some(taskId => !mergedTaskIds.has(taskId))) {
    violations.push('TASK_MENTION_LOST');
  }
  if (/^2\.\d+(?:\.\d+)*\s+/m.test(mergedContent) && !mergedContent.includes('2. 任務討論與結論')) {
    violations.push('ORPHAN_TASK_HEADING');
  }
  return violations;
};

type MeetingSynthesisTaskInput = MeetingSynthesisInput['tasks'][number];

const getMeetingTaskPath = (
  nodeId: string,
  nodes: Record<string, TaskNode>,
  fallbackTitle?: string,
): Array<{ id: string; title: string }> => {
  const path: Array<{ id: string; title: string }> = [];
  const visited = new Set<string>();
  let current: TaskNode | undefined = nodes[nodeId];

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift({ id: current.id, title: current.title || current.id });
    current = current.parentId ? nodes[current.parentId] : undefined;
  }

  if (path.length > 0) return path;

  return [{
    id: nodeId,
    title: fallbackTitle || nodes[nodeId]?.title || nodeId,
  }];
};

const createMeetingSynthesisTask = (
  nodeId: string,
  nodes: Record<string, TaskNode>,
  activities: MeetingSynthesisInput['activities'],
): MeetingSynthesisTaskInput => {
  const node = nodes[nodeId];
  const activity = activities.find(item => item.nodeId === nodeId);
  const title = node?.title || activity?.title || nodeId;
  const path = getMeetingTaskPath(nodeId, nodes, title);
  const group = path[0] || { id: nodeId, title };

  return {
    id: nodeId,
    title,
    parentId: node?.parentId ?? null,
    path,
    depth: Math.max(0, path.findIndex(item => item.id === nodeId)),
    groupId: group.id,
    groupTitle: group.title,
    order: typeof node?.order === 'number' ? node.order : undefined,
  };
};

const createMeetingSynthesisInput = (
  draft: RecordDraft,
  activities: MeetingTaskActivity[],
  nodes: Record<string, TaskNode> = {},
): MeetingSynthesisInput => {
  const synthesisActivities = filterMeetingSynthesisActivities(
    activities.map(activity => createMeetingActivity({
      eventType: activity.eventType,
      nodeId: activity.nodeId,
      title: nodes[activity.nodeId]?.title || activity.title,
      occurredAt: activity.occurredAt,
      payload: activity.payload,
    })),
  );
  const evidenceNodeIds = Array.from(new Set([
    ...draft.taskLinks.map(link => link.nodeId),
    ...extractTaskMentionIds(draft.content),
    ...synthesisActivities.map(activity => activity.nodeId),
  ]));
  const taskMap = new Map<string, MeetingSynthesisTaskInput>();

  for (const nodeId of evidenceNodeIds) {
    const task = createMeetingSynthesisTask(nodeId, nodes, synthesisActivities);
    taskMap.set(task.id, task);

    if (task.groupId && !taskMap.has(task.groupId)) {
      taskMap.set(task.groupId, createMeetingSynthesisTask(task.groupId, nodes, synthesisActivities));
    }
  }

  return {
    title: draft.title,
    participantsText: draft.participantsText,
    rawContent: draft.content,
    taskLinks: draft.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
    occurredAt: draft.occurredAt,
    activities: synthesisActivities,
    tasks: Array.from(taskMap.values()),
  };
};

const useRecordStore = create<RecordStoreState & RecordStoreActions>((set, get) => ({
  records: [],
  loading: false,
  saving: false,
  error: null,
  isPanelOpen: false,
  isPanelCollapsed: false,
  isTaskSelectionMode: false,
  isMeetingMode: false,
  meetingTaskCaptureEnabled: false,
  restoreCollapsedAfterSelection: false,
  returnViewAfterSelection: null,
  contentCursorOffset: null,
  draft: null,
  draftBaselineSignature: null,
  meetingActivities: [],
  appendedMeetingActivityIds: [],
  meetingLiveCaptureRuntime: null,
  meetingSynthesisStatus: 'idle',
  meetingSynthesisError: null,
  meetingSynthesisWarnings: [],
  meetingSynthesisProvider: null,
  lastSaveFeedback: null,
  meetingDraftRecovery: initialMeetingDraftRecoveryState,
  meetingDraftRecoveryClearToken: 0,
  contentFocusRequestId: 0,
  contentFocusPending: false,
  meetingProjectImportStatus: 'idle',
  meetingProjectImportMessage: null,
  meetingProjectImportRequestId: 0,

  loadRecords: async (workspaceId, boardId) => {
    set({ loading: true, error: null });
    try {
      const records = await recordService.listByProject(workspaceId, boardId);
      set({ records, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  openPanel: () => set({ isPanelOpen: true, isPanelCollapsed: false }),

  closePanel: () => set(state => ({
    isPanelOpen: false,
    isPanelCollapsed: false,
    isTaskSelectionMode: false,
    isMeetingMode: false,
    meetingTaskCaptureEnabled: false,
    returnViewAfterSelection: null,
    contentCursorOffset: null,
    draft: null,
    draftBaselineSignature: null,
    meetingActivities: [],
    appendedMeetingActivityIds: [],
    meetingLiveCaptureRuntime: null,
    ...resetMeetingSynthesisState,
    lastSaveFeedback: null,
    meetingDraftRecoveryClearToken: state.meetingDraftRecoveryClearToken,
    contentFocusRequestId: state.contentFocusRequestId,
    contentFocusPending: false,
    meetingProjectImportRequestId: state.meetingProjectImportRequestId + 1,
    meetingProjectImportStatus: 'idle',
    meetingProjectImportMessage: null,
  })),

  togglePanelCollapsed: () => set(state => ({ isPanelCollapsed: !state.isPanelCollapsed })),

  openNewRecord: (type, initialNodeId) => {
    if (type === 'meeting' && isMeetingRecordUnavailable()) return;
    const userId = useAuthStore.getState().user?.uid ?? null;
    const draft = createDefaultDraft(type, userId, initialNodeId);
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
      isMeetingMode: false,
      meetingTaskCaptureEnabled: false,
      contentCursorOffset: 0,
      draft,
      draftBaselineSignature: getRecordDraftSignature(draft),
      meetingActivities: [],
      appendedMeetingActivityIds: [],
      meetingLiveCaptureRuntime: null,
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
      error: null,
      meetingDraftRecovery: initialMeetingDraftRecoveryState,
      contentFocusRequestId: type === 'meeting' ? get().contentFocusRequestId + 1 : get().contentFocusRequestId,
      contentFocusPending: type === 'meeting',
      meetingProjectImportStatus: 'idle',
      meetingProjectImportMessage: null,
      meetingProjectImportRequestId: get().meetingProjectImportRequestId + 1,
    });
  },

  openExistingRecord: (record) => {
    if (record.type === 'meeting' && isMeetingRecordUnavailable()) return;
    const mentionedNodeIds = extractTaskMentionIds(record.content);
    const draft = {
      id: record.id,
      type: record.type,
      title: record.title,
      content: record.content,
      status: record.status,
      visibility: record.visibility,
      participantsText: record.participantsText ?? '',
      occurredAt: record.occurredAt,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      recordedBy: record.recordedBy,
      metadata: record.metadata,
      taskLinks: record.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
      legacyTaskLinkNodeIds: record.taskLinks
        .map(link => link.nodeId)
        .filter(nodeId => !mentionedNodeIds.includes(nodeId)),
    };
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
      isMeetingMode: false,
      meetingTaskCaptureEnabled: false,
      contentCursorOffset: record.content.length,
      draft,
      draftBaselineSignature: getRecordDraftSignature(draft),
      meetingActivities: [],
      appendedMeetingActivityIds: [],
      meetingLiveCaptureRuntime: null,
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
      error: null,
      meetingDraftRecovery: initialMeetingDraftRecoveryState,
      contentFocusRequestId: get().contentFocusRequestId,
      contentFocusPending: false,
      meetingProjectImportStatus: 'idle',
      meetingProjectImportMessage: null,
      meetingProjectImportRequestId: get().meetingProjectImportRequestId + 1,
    });
  },

  startMeetingRecord: () => {
    if (isMeetingRecordUnavailable()) return;
    const { activeBoardId, currentView, setView } = useBoardStore.getState();
    if (!activeBoardId) {
      set({
        isPanelOpen: true,
        isPanelCollapsed: false,
        error: '請先選擇一個看板再開始會議紀錄。',
      });
      return;
    }

    if (currentView !== 'board') setView('board');

    const userId = useAuthStore.getState().user?.uid ?? null;
    set(state => {
      const isExistingMeetingDraft = state.draft?.type === 'meeting';
      const draft = state.draft?.type === 'meeting'
        ? state.draft
        : createDefaultDraft('meeting', userId);

      return {
        isPanelOpen: true,
        isPanelCollapsed: false,
        isTaskSelectionMode: false,
        isMeetingMode: true,
        meetingTaskCaptureEnabled: false,
        returnViewAfterSelection: null,
        contentCursorOffset: state.draft === draft ? state.contentCursorOffset ?? draft.content.length : draft.content.length,
        draft,
        draftBaselineSignature: isExistingMeetingDraft
          ? state.draftBaselineSignature ?? getRecordDraftSignature(draft)
          : getRecordDraftSignature(draft),
        meetingActivities: state.draft === draft ? state.meetingActivities : [],
        appendedMeetingActivityIds: state.draft === draft ? state.appendedMeetingActivityIds : [],
        meetingLiveCaptureRuntime: createMeetingLiveRuntime(draft.id ?? createId(), activeBoardId),
        ...(isExistingMeetingDraft ? {} : resetMeetingSynthesisState),
        lastSaveFeedback: null,
        error: null,
        meetingDraftRecovery: isExistingMeetingDraft ? state.meetingDraftRecovery : initialMeetingDraftRecoveryState,
        contentFocusRequestId: isExistingMeetingDraft ? state.contentFocusRequestId : state.contentFocusRequestId + 1,
        contentFocusPending: !isExistingMeetingDraft,
        meetingProjectImportStatus: isExistingMeetingDraft ? state.meetingProjectImportStatus : 'idle',
        meetingProjectImportMessage: isExistingMeetingDraft ? state.meetingProjectImportMessage : null,
        meetingProjectImportRequestId: state.meetingProjectImportRequestId + 1,
      };
    });
  },

  exitMeetingMode: () => set({
    isMeetingMode: false,
    meetingTaskCaptureEnabled: false,
    meetingLiveCaptureRuntime: null,
    isTaskSelectionMode: false,
    returnViewAfterSelection: null,
  }),

  toggleMeetingTaskCapture: () => set(state => ({
    meetingTaskCaptureEnabled: !state.meetingTaskCaptureEnabled,
  })),

  setMeetingTaskReservation: (input) => {
    let outcome: 'updated' | 'cleared' | 'noop' | 'denied' = 'denied';
    set(state => {
      const draft = state.draft;
      const authUserId = useAuthStore.getState().user?.uid;
      const liveBoardId = useBoardStore.getState().activeBoardId;
      const isAllowed = Boolean(
        state.isMeetingMode
        && draft?.id
        && draft.type === 'meeting'
        && draft.status === 'draft'
        && input.taskId
        && input.currentUserId
        && input.currentUserId === authUserId
        && draft.recordedBy === authUserId
        && liveBoardId
        && liveBoardId === input.activeBoardId
        && input.taskExists
        && !input.taskArchived
        && input.taskBoardId === input.activeBoardId,
      );
      if (!isAllowed || !draft) return state;

      const result = updateMeetingTaskReservationMetadata(draft.metadata, input.taskId, input.value);
      outcome = result.status;
      if (result.status === 'denied' || result.status === 'noop') return state;
      return {
        draft: { ...draft, metadata: result.metadata },
        lastSaveFeedback: null,
      };
    });
    return outcome;
  },

  updateDraft: (updates) => set(state => {
    if (!state.draft) return {};
    const previousContent = state.draft.content;
    const nextDraft = typeof updates.content === 'string'
      ? syncDraftContentLinks({ ...state.draft, ...updates }, updates.content)
      : { ...state.draft, ...updates };
    let reconciledDraft = nextDraft;
    if (nextDraft.type === 'meeting' && typeof updates.content === 'string') {
      const quickNoteReconcile = reconcileMeetingTaskQuickNoteMetadata(
        previousContent,
        nextDraft.content,
        nextDraft.metadata,
      );
      reconciledDraft = { ...reconciledDraft, metadata: quickNoteReconcile.metadata };
      if (activeBoardIdForMeeting()) {
        reconciledDraft = {
          ...reconciledDraft,
          metadata: reconcileMeetingProjectChangeImportMetadata(
            reconciledDraft.metadata,
            activeBoardIdForMeeting() as string,
            nextDraft.content,
          ),
        };
      }
    }
    return { draft: reconciledDraft, lastSaveFeedback: null };
  }),

  setContentCursorOffset: (offset) => set({ contentCursorOffset: offset }),

  requestContentFocus: () => set(state => ({
    contentFocusRequestId: state.contentFocusRequestId + 1,
    contentFocusPending: true,
  })),

  consumeContentFocus: () => set({ contentFocusPending: false }),

  importMeetingProjectChanges: async (options = {}) => {
    const initial = get();
    const { draft, isMeetingMode } = initial;
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!draft || draft.type !== 'meeting' || !isMeetingMode || !activeWorkspaceId || !activeBoardId) {
      set({ meetingProjectImportStatus: 'error', meetingProjectImportMessage: '目前沒有可匯入的會議草稿。' });
      return false;
    }
    const requestId = initial.meetingProjectImportRequestId + 1;
    const clickedAt = Date.now();
    set({
      meetingProjectImportRequestId: requestId,
      meetingProjectImportStatus: 'loading',
      meetingProjectImportMessage: null,
      error: null,
    });

    const isCurrentRequest = () => {
      const current = get();
      return current.meetingProjectImportRequestId === requestId && current.draft?.id === draft.id && current.isMeetingMode;
    };

    try {
      const records = await recordService.listByProject(activeWorkspaceId, activeBoardId);
      if (!isCurrentRequest()) return false;
      set({ records });
      const window = resolveMeetingProjectChangeImportWindow({
        draftOccurredAt: draft.occurredAt,
        clickedAt,
        records,
        boardId: activeBoardId,
        mode: options.mode ?? 'default',
        customStartedAt: options.startedAt,
        customEndedAt: options.endedAt,
      });
      const events = await eventLogService.listActivity(createMeetingActivityQuery({
        workspaceId: activeWorkspaceId,
        boardId: activeBoardId,
        startedAt: window.rangeStartedAt,
        endedAt: window.rangeEndedAt,
        eventTypes: PROJECT_CHANGE_EVENT_TYPES,
      }));
      if (!isCurrentRequest()) return false;
      const currentDraft = get().draft;
      if (!currentDraft || currentDraft.type !== 'meeting') return false;
      const parsed = parseMeetingProjectChangeImportMetadata(currentDraft.metadata, activeBoardId);
      const existingEventIds = parsed?.batches.flatMap(batch => batch.sourceEventIds) ?? [];
      const deltaEvents = listMeetingProjectChangeDelta(events, existingEventIds);
      if (deltaEvents.length === 0) {
        set({ meetingProjectImportStatus: 'empty', meetingProjectImportMessage: '沒有可帶入的變更。' });
        return false;
      }
      const result = await synthesizeMeetingRecord(createProjectChangeSynthesisInput(
        currentDraft.title || '專案變化紀錄',
        deltaEvents,
        options.nodes ?? {},
      ));
      if (!isCurrentRequest()) return false;
      const latestDraft = get().draft;
      if (!latestDraft || latestDraft.type !== 'meeting' || latestDraft.status === 'published') return false;
      const importedBlock = wrapProjectChangeImportContent(result.content);
      if (!importedBlock) {
        set({ meetingProjectImportStatus: 'empty', meetingProjectImportMessage: '沒有可帶入的變更。' });
        return false;
      }
      const latestContent = latestDraft.content;
      const nextContent = [latestContent.trim(), importedBlock].filter(Boolean).join('\n\n');
      const batch = createMeetingProjectChangeImportBatch({
        mode: options.mode ?? 'default',
        rangeStartedAt: window.rangeStartedAt,
        rangeEndedAt: window.rangeEndedAt,
        events: deltaEvents,
        beforeContentSignature: getRecordDraftSignature(latestDraft) ?? '',
        importedAt: clickedAt,
        content: nextContent,
      });
      const nextMetadata = {
        ...(latestDraft.metadata ?? {}),
        meetingProjectChangeImport: {
          schemaVersion: 1 as const,
          boardId: activeBoardId,
          batches: [...(parsed?.batches ?? []), batch],
        },
      };
      set(current => {
        if (current.meetingProjectImportRequestId !== requestId || current.draft?.id !== draft.id) return current;
        const nextDraft = syncDraftContentLinks({ ...current.draft!, metadata: nextMetadata }, nextContent);
        return {
          draft: nextDraft,
          contentCursorOffset: nextContent.length,
          meetingProjectImportStatus: 'complete',
          meetingProjectImportMessage: '已完成',
          lastSaveFeedback: null,
        };
      });
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      const message = error instanceof MeetingProjectChangeImportError || error instanceof Error
        ? error.message
        : String(error);
      set({ meetingProjectImportStatus: 'error', meetingProjectImportMessage: message });
      return false;
    }
  },

  setDraftTaskRole: (nodeId, role) => set(state => {
    if (!state.draft) return {};
    const nextLinks = state.draft.taskLinks.map(link =>
      link.nodeId === nodeId ? { ...link, role } : link
    );
    return { draft: { ...state.draft, taskLinks: uniqueLinks(nextLinks) }, lastSaveFeedback: null };
  }),

  toggleDraftTask: (nodeId) => set(state => {
    if (!state.draft) return {};
    const hasLink = state.draft.taskLinks.some(link => link.nodeId === nodeId);
    const nextRole: RecordTaskLinkRole = state.draft.taskLinks.length === 0 ? 'main' : 'related';
    const taskLinks = hasLink
      ? state.draft.taskLinks.filter(link => link.nodeId !== nodeId)
      : [...state.draft.taskLinks, { nodeId, role: nextRole }];
    return { draft: { ...state.draft, taskLinks }, lastSaveFeedback: null };
  }),

  insertTaskMentionAtCursor: (nodeId, title) => set(state => {
    if (!state.draft) return {};

    const insertion = insertTaskMention(
      state.draft.content,
      state.contentCursorOffset,
      nodeId,
      title
    );
    const taskLinks = syncTaskLinksFromRecordContent(
      insertion.content,
      state.draft.taskLinks,
      state.draft.legacyTaskLinkNodeIds ?? []
    );

    return {
      contentCursorOffset: insertion.cursorOffset,
      draft: {
        ...state.draft,
        content: insertion.content,
        taskLinks,
      },
      lastSaveFeedback: null,
    };
  }),

  appendTaskDiscussionToMeetingDraft: (input) => {
    const state = get();
    if (!state.isMeetingMode || state.draft?.type !== 'meeting') return { status: 'denied', reason: 'not-meeting' };
    if (!input.taskId.trim() || !input.taskTitle.trim()) return { status: 'denied', reason: 'invalid-task' };
    if (!input.submissionId.trim() || !Number.isFinite(input.occurredAt) || !input.text.trim()) {
      return { status: 'denied', reason: 'invalid-input' };
    }
    const parsed = parseMeetingTaskQuickNotesMetadata(state.draft.metadata);
    if (parsed.status === 'invalid') return { status: 'denied', reason: 'invalid-metadata' };
    const existing = parsed.namespace?.entries.find(entry => entry.id === input.submissionId);
    if (existing) return { status: 'noop', entryId: existing.id };

    const appended = appendMeetingTaskQuickNoteToRecordContent(
      state.draft.content,
      input.taskId,
      input.taskTitle,
      input.text,
      input.occurredAt,
      input.submissionId,
    );
    if (!appended) return { status: 'denied', reason: 'invalid-input' };
    const metadataResult = appendMeetingTaskQuickNoteMetadata(state.draft.metadata, appended.entry);
    if (metadataResult.status === 'denied') return { status: 'denied', reason: 'invalid-metadata' };
    const draft = {
      ...syncDraftContentLinks(state.draft, appended.content),
      metadata: metadataResult.metadata,
    };

    set({
      draft,
      contentCursorOffset: appended.content.length,
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
    });
    return { status: 'appended', entryId: appended.entry.id };
  },

  commitMeetingTaskMutation: async (input) => {
    const initial = get();
    const runtime = initial.meetingLiveCaptureRuntime;
    if (!initial.isMeetingMode || initial.draft?.type !== 'meeting' || !runtime) return 'ignored';
    if (input.segmentId && input.segmentId !== runtime.segment.id) return 'ignored';
    // A meeting segment is board-scoped.  A late persistence callback from a
    // different board (or the unplaced workbench) must never leak into this
    // meeting's live evidence.
    if (runtime.segment.boardId && input.afterNode.boardId !== runtime.segment.boardId) return 'ignored';
    const runCommit = async (): Promise<'committed' | 'ignored' | 'failed'> => {
      const current = get();
      if (
        !current.isMeetingMode
        || current.draft?.type !== 'meeting'
        || current.draft.id !== initial.draft?.id
        || current.meetingLiveCaptureRuntime !== runtime
      ) return 'ignored';
      if (runtime.appliedMutationIds.has(input.mutationId) || runtime.pendingMutationIds.has(input.mutationId)) return 'ignored';

      runtime.pendingMutationIds.add(input.mutationId);
      try {
      const changes = getMeetingLiveFieldChanges(input.beforeNode, input.afterNode, input.changedKeys ?? []);
      if (changes.length === 0) {
        runtime.pendingMutationIds.delete(input.mutationId);
        runtime.appliedMutationIds.add(input.mutationId);
        return 'ignored';
      }

      const prepared = await Promise.all(changes.map(async change => {
        const aggregateKey = `${input.afterNode.id}:${change.fieldKey}`;
        const existing = runtime.aggregates.get(aggregateKey);
        const isContent = isMeetingLiveContentField(change.fieldKey);
        const baselineText = isContent
          ? runtime.plaintextBaselines.get(aggregateKey) ?? getMeetingLiveContentBaseline(change)
          : undefined;
        if (isContent && !runtime.plaintextBaselines.has(aggregateKey)) {
          runtime.plaintextBaselines.set(aggregateKey, baselineText ?? '');
        }

        let value = await createMeetingLiveAggregateValue(
          change,
          baselineText,
        );
        if (existing && existing.value.kind !== 'created' && value.kind !== 'created') {
          if (value.kind === 'content_delta' && existing.value.kind === 'content_delta') {
            value = await createMeetingLiveAggregateValue({
              ...change,
              before: existing.value.baselineHash,
              beforeText: baselineText,
            }, baselineText);
          } else if (value.kind !== 'content_delta' && existing.value.kind !== 'content_delta') {
            value = await createMeetingLiveAggregateValue({
              ...change,
              before: existing.value.baseline,
            });
          }
        }
        return { aggregateKey, change, value, existing };
      }));

      const latest = get();
      if (latest.meetingLiveCaptureRuntime !== runtime || latest.draft?.id !== initial.draft?.id || !latest.isMeetingMode) {
        runtime.pendingMutationIds.delete(input.mutationId);
        return 'ignored';
      }

      const nextAggregates = new Map(runtime.aggregates);
      const affectedKeys = new Set<string>();
      prepared.forEach(({ aggregateKey, change, value, existing }) => {
        affectedKeys.add(aggregateKey);
        const nextAggregate: MeetingLiveFieldAggregate = {
          key: aggregateKey,
          segmentId: runtime.segment.id,
          nodeId: input.afterNode.id,
          fieldKey: change.fieldKey,
          taskTitle: input.afterNode.title || input.afterNode.id,
          value,
          firstConfirmedAt: existing?.firstConfirmedAt ?? Date.now(),
          lastConfirmedAt: Date.now(),
          lastCommitSequence: runtime.nextCommitSequence,
          appliedMutationIds: Array.from(new Set([...(existing?.appliedMutationIds ?? []), input.mutationId])),
          projection: existing?.projection ?? null,
        };
        if (isMeetingLiveAggregateNoop(nextAggregate)) {
          nextAggregates.delete(aggregateKey);
          runtime.plaintextBaselines.delete(aggregateKey);
        } else {
          nextAggregates.set(aggregateKey, nextAggregate);
        }
      });

      if (changes.some(change => change.fieldKey === 'title')) {
        nextAggregates.forEach((aggregate, key) => {
          if (aggregate.nodeId === input.afterNode.id) {
            affectedKeys.add(key);
            nextAggregates.set(key, { ...aggregate, taskTitle: input.afterNode.title || input.afterNode.id });
          }
        });
      }

      const previousAggregates = runtime.aggregates;
      const lines = (latest.draft?.content ?? '').split('\n');
      const locateAnchor = (anchor: MeetingLiveFieldAggregate['projection']) => {
        if (!anchor) return [];
        if (lines[anchor.lineIndex] === anchor.exactText) return [anchor.lineIndex];
        return getLineCandidates(lines.join('\n'), anchor.exactText);
      };
      const removeLineFor = (aggregate: MeetingLiveFieldAggregate) => {
        const candidates = locateAnchor(aggregate.projection);
        if (candidates.length === 1) lines.splice(candidates[0], 1);
      };
      const appendLineFor = async (aggregate: MeetingLiveFieldAggregate) => {
        const line = formatMeetingLiveAggregateLine(aggregate);
        if (lines.length === 1 && !lines[0]) lines[0] = line;
        else lines.push(line);
        return {
          ...aggregate,
          projection: {
            lineIndex: lines.length - 1,
            exactText: line,
            fingerprint: await meetingLiveFingerprint(line),
            generation: (aggregate.projection?.generation ?? 0) + 1,
          },
        };
      };
      const replaceLineFor = async (aggregate: MeetingLiveFieldAggregate, previous: MeetingLiveFieldAggregate | undefined) => {
        const line = formatMeetingLiveAggregateLine(aggregate);
        const candidates = locateAnchor(previous?.projection ?? aggregate.projection);
        if (candidates.length === 1) {
          lines[candidates[0]] = line;
          return {
            ...aggregate,
            projection: {
              lineIndex: candidates[0],
              exactText: line,
              fingerprint: await meetingLiveFingerprint(line),
              generation: previous?.projection?.generation ?? 0,
            },
          };
        }
        return appendLineFor(aggregate);
      };

      for (const [key, previous] of previousAggregates) {
        if (!affectedKeys.has(key) || nextAggregates.has(key)) continue;
        removeLineFor(previous);
      }
      for (const key of affectedKeys) {
        const next = nextAggregates.get(key);
        if (!next) continue;
        const previous = previousAggregates.get(key);
        nextAggregates.set(key, await replaceLineFor(next, previous));
      }

      runtime.nextCommitSequence += 1;
      runtime.pendingMutationIds.delete(input.mutationId);
      runtime.appliedMutationIds.add(input.mutationId);
      const nextDraft = syncDraftContentLinks(latest.draft!, lines.join('\n'));
      set({
        draft: nextDraft,
        meetingLiveCaptureRuntime: { ...runtime, aggregates: nextAggregates },
        ...resetMeetingSynthesisState,
        lastSaveFeedback: null,
      });
      return 'committed';
      } catch (error) {
        runtime.pendingMutationIds.delete(input.mutationId);
        set({ error: error instanceof Error ? error.message : '會中變更暫時無法更新，請重試。' });
        return 'failed';
      }
    };

    const segmentId = runtime.segment.id;
    const previousQueue = meetingLiveCommitQueues.get(segmentId) ?? Promise.resolve<'ignored'>('ignored');
    const queued = previousQueue.then(runCommit, runCommit);
    meetingLiveCommitQueues.set(segmentId, queued);
    try {
      return await queued;
    } finally {
      if (meetingLiveCommitQueues.get(segmentId) === queued) meetingLiveCommitQueues.delete(segmentId);
    }
  },

  recordMeetingTaskActivity: (activity) => set(state => {
    if (!state.isMeetingMode || state.draft?.type !== 'meeting') return {};
    const nextActivity = createMeetingActivity(activity);
    if (isLowValueMeetingActivity(nextActivity)) return {};
    return {
      meetingActivities: [...state.meetingActivities, nextActivity],
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
    };
  }),

  synthesizeMeetingDraft: async (nodes = {}) => {
    const { draft, meetingActivities, isMeetingMode } = get();
    if (!draft || draft.type !== 'meeting' || !isMeetingMode) {
      set({ error: '目前沒有可統整的會議草稿。' });
      return false;
    }
    if (!draft.title.trim()) {
      set({ error: '請先輸入會議標題，再進行 AI 統整。' });
      return false;
    }

    const preservedDraft: RecordDraft = { ...draft, status: 'draft' };
    set({
      saving: true,
      draft: preservedDraft,
      meetingSynthesisStatus: 'synthesizing',
      meetingSynthesisError: null,
      meetingSynthesisWarnings: [],
      meetingSynthesisProvider: null,
      lastSaveFeedback: null,
      error: null,
    });

    try {
      const synthesisSourceDraft = getMeetingSynthesisSourceDraft(preservedDraft);
      const result = await synthesizeMeetingRecord(
        createMeetingSynthesisInput(synthesisSourceDraft, meetingActivities, nodes),
      );
      const mergedContent = mergeHumanDraftWithAiSynthesis(result.content, synthesisSourceDraft.content);
      const mergeViolations = getMeetingSynthesisMergeViolations(result.content, mergedContent);
      if (mergeViolations.length > 0) {
        throw new Error('AI 整理結果在合併後未通過完整性檢查，原始草稿已保留，請重試。');
      }
      const quickNoteReconcile = reconcileMeetingTaskQuickNoteMetadata(
        synthesisSourceDraft.content,
        mergedContent,
        preservedDraft.metadata,
      );
      if (quickNoteReconcile.status === 'invalid' || quickNoteReconcile.detachedIds.length > 0) {
        throw new Error('AI 整理結果無法唯一重定位任務會議補記，原始草稿已保留，請重試。');
      }
      const nextDraft = syncDraftContentLinks(
        {
          ...preservedDraft,
          status: 'draft',
          metadata: {
            ...(preservedDraft.metadata ?? {}),
            ...quickNoteReconcile.metadata,
            meetingSynthesis: createMeetingSynthesisTraceMetadata(
              result,
              synthesisSourceDraft.content,
              mergedContent,
            ),
          },
          legacyTaskLinkNodeIds: Array.from(new Set([
            ...(preservedDraft.legacyTaskLinkNodeIds ?? []),
            ...result.linkedTaskIds,
          ])),
        },
        mergedContent,
      );
      const activeBoardId = useBoardStore.getState().activeBoardId;
      const aiIntegratedDraft = activeBoardId && nextDraft.type === 'meeting'
        ? { ...nextDraft, metadata: markMeetingProjectChangeImportAiIntegrated(nextDraft.metadata, activeBoardId) }
        : nextDraft;
      const nextLiveRuntime = rebaseMeetingLiveProjectionAnchors(get().meetingLiveCaptureRuntime, mergedContent);

      set({
        saving: false,
        draft: aiIntegratedDraft,
        meetingLiveCaptureRuntime: nextLiveRuntime,
        contentCursorOffset: mergedContent.length,
        meetingSynthesisStatus: 'ready',
        meetingSynthesisError: null,
        meetingSynthesisWarnings: result.warnings,
        meetingSynthesisProvider: result.provider ?? null,
        lastSaveFeedback: null,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({
        saving: false,
        draft: preservedDraft,
        meetingSynthesisStatus: 'error',
        meetingSynthesisError: message,
        error: `AI 統整失敗，原始草稿已保留：${message}`,
      });
      return false;
    }
  },

  enterTaskSelectionMode: (options = {}) => {
    const { currentView, setView } = useBoardStore.getState();
    const collapsePanel = options.collapsePanel ?? true;
    const returnToPreviousView = options.returnToPreviousView ?? true;
    if (currentView !== 'board') setView('board');
    set(state => ({
      isPanelOpen: true,
      restoreCollapsedAfterSelection: state.isPanelCollapsed,
      returnViewAfterSelection: returnToPreviousView ? currentView : null,
      isPanelCollapsed: collapsePanel ? true : state.isPanelCollapsed,
      isTaskSelectionMode: true,
    }));
  },

  exitTaskSelectionMode: (restorePanel = true) => {
    const returnView = get().returnViewAfterSelection;
    if (returnView && returnView !== 'board') {
      useBoardStore.getState().setView(returnView);
    }
    set(state => ({
      isTaskSelectionMode: false,
      returnViewAfterSelection: null,
      isPanelCollapsed: restorePanel ? state.restoreCollapsedAfterSelection : state.isPanelCollapsed,
    }));
  },

  saveDraft: async (options = {}) => {
    const {
      draft: currentDraft,
    } = get();
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!currentDraft || !activeWorkspaceId || !activeBoardId) {
      set({ error: '請先選擇工作區與看板。' });
      return null;
    }
    const draft = options.status
      ? { ...currentDraft, status: options.status }
      : currentDraft;
    const wantsPublish = draft.status === 'published';

    if (!draft.title.trim()) {
      set({ error: '請先輸入標題。' });
      return null;
    }
    if (wantsPublish && !draft.content.trim()) {
      set({ error: '發布前請先輸入內容。' });
      return null;
    }
    if (draft.type === 'work_log' && draft.startedAt && draft.endedAt && draft.startedAt > draft.endedAt) {
      set({ error: '工作紀錄的開始時間不可晚於結束時間。' });
      return null;
    }
    if (draft.type === 'meeting') {
      const quickNoteInvariant = validateMeetingTaskQuickNoteAggregate(draft.content, draft.metadata);
      if (!quickNoteInvariant.valid) {
        set({ error: `任務會議補記資料不一致，無法儲存：${quickNoteInvariant.errors[0]}` });
        return null;
      }
    }

    const { legacyTaskLinkNodeIds, ...serializableDraft } = draft;
    void legacyTaskLinkNodeIds;
    const projectedMetadata = draft.type === 'meeting'
      ? projectMeetingProjectChangeImportMetadata(draft.metadata, activeBoardId, wantsPublish ? 'published' : 'draft')
      : draft.metadata;
    const payload: KnowledgeRecordInput = {
      ...serializableDraft,
      title: draft.title.trim(),
      content: draft.content.trim(),
      participantsText: draft.participantsText?.trim(),
      taskLinks: uniqueLinks(draft.taskLinks),
      status: draft.status as KnowledgeRecordStatus,
      visibility: draft.visibility as KnowledgeRecordVisibility,
      metadata: projectedMetadata,
    };
    const previousRecord = payload.id
      ? get().records.find(record => record.id === payload.id)
      : undefined;
    const previousInput = previousRecord ? toRecordInput(previousRecord) : null;

    set({ saving: true, error: null });
    try {
      const saved = await recordService.upsert(activeWorkspaceId, activeBoardId, payload);
      const savedInput = toRecordInput(saved);
      set(state => ({
        saving: false,
        draft: {
          ...payload,
          id: saved.id,
          taskLinks: saved.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
        },
        draftBaselineSignature: getRecordDraftSignature({
          ...payload,
          id: saved.id,
          taskLinks: saved.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
        }),
        records: [saved, ...state.records.filter(record => record.id !== saved.id)],
        lastSaveFeedback: {
          recordId: saved.id,
          status: payload.status,
          savedAt: Date.now(),
        },
      }));

      const applyRecordInput = async (input: KnowledgeRecordInput) => {
        set({ saving: true, error: null });
        try {
          const restored = await recordService.upsert(activeWorkspaceId, activeBoardId, input);
          const restoredDraft = toDraftFromRecordInput(input, restored);
          set(state => ({
            saving: false,
            records: [restored, ...state.records.filter(record => record.id !== restored.id)],
            draft: state.draft?.id === restored.id ? restoredDraft : state.draft,
            draftBaselineSignature: state.draft?.id === restored.id
              ? getRecordDraftSignature(restoredDraft)
              : state.draftBaselineSignature,
            lastSaveFeedback: {
              recordId: restored.id,
              status: restored.status,
              savedAt: Date.now(),
            },
          }));
        } catch (error) {
          set({
            saving: false,
            error: error instanceof Error ? error.message : String(error),
            lastSaveFeedback: null,
          });
          throw error;
        }
      };

      const archiveSavedRecord = async () => {
        set({ saving: true, error: null });
        try {
          await recordService.delete(activeWorkspaceId, activeBoardId, saved.id);
          set(state => ({
            saving: false,
            records: state.records.filter(record => record.id !== saved.id),
            draft: state.draft?.id === saved.id ? null : state.draft,
            draftBaselineSignature: state.draft?.id === saved.id ? null : state.draftBaselineSignature,
            lastSaveFeedback: state.lastSaveFeedback?.recordId === saved.id ? null : state.lastSaveFeedback,
          }));
        } catch (error) {
          set({
            saving: false,
            error: error instanceof Error ? error.message : String(error),
            lastSaveFeedback: null,
          });
          throw error;
        }
      };

      useUndoStore.getState().pushUndo({
        label: previousInput
          ? previousInput.status !== savedInput.status ? '修改紀錄狀態' : '修改紀錄'
          : '新增紀錄',
        scope: 'record',
        entityIds: [saved.id],
        undo: () => previousInput ? applyRecordInput(previousInput) : archiveSavedRecord(),
        redo: () => applyRecordInput(savedInput),
      });
      if (draft.type === 'meeting') get().requestMeetingDraftRecoveryClear();
      return saved;
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
        lastSaveFeedback: null,
      });
      return null;
    }
  },

  archiveRecord: async (recordId) => {
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!activeWorkspaceId || !activeBoardId) return;
    const archivedRecord = get().records.find(record => record.id === recordId);
    set({ saving: true, error: null });
    try {
      await recordService.delete(activeWorkspaceId, activeBoardId, recordId);
      set(state => ({
        saving: false,
        records: state.records.filter(record => record.id !== recordId),
        draft: state.draft?.id === recordId ? null : state.draft,
        draftBaselineSignature: state.draft?.id === recordId ? null : state.draftBaselineSignature,
        lastSaveFeedback: state.lastSaveFeedback?.recordId === recordId ? null : state.lastSaveFeedback,
      }));
      if (archivedRecord?.type === 'meeting') get().requestMeetingDraftRecoveryClear();
      if (archivedRecord) {
        const restoreInput = toRecordInput(archivedRecord);
        useUndoStore.getState().pushUndo({
          label: '封存紀錄',
          scope: 'record',
          entityIds: [recordId],
          undo: async () => {
            set({ saving: true, error: null });
            try {
              const restored = await recordService.upsert(activeWorkspaceId, activeBoardId, restoreInput);
              const restoredDraft = toDraftFromRecordInput(restoreInput, restored);
              set(state => ({
                saving: false,
                records: [restored, ...state.records.filter(record => record.id !== restored.id)],
                draft: state.draft?.id === restored.id ? restoredDraft : state.draft,
                draftBaselineSignature: state.draft?.id === restored.id
                  ? getRecordDraftSignature(restoredDraft)
                  : state.draftBaselineSignature,
                lastSaveFeedback: {
                  recordId: restored.id,
                  status: restored.status,
                  savedAt: Date.now(),
                },
              }));
            } catch (error) {
              set({
                saving: false,
                error: error instanceof Error ? error.message : String(error),
                lastSaveFeedback: null,
              });
              throw error;
            }
          },
          redo: () => get().archiveRecord(recordId),
        });
      }
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
        lastSaveFeedback: null,
      });
    }
  },

  setMeetingDraftRecovery: (updates) => set(state => ({
    meetingDraftRecovery: { ...state.meetingDraftRecovery, ...updates },
  })),

  restoreMeetingDraftSnapshot: (snapshot) => set({
    isPanelOpen: true,
    isPanelCollapsed: false,
    isTaskSelectionMode: false,
    isMeetingMode: true,
    meetingTaskCaptureEnabled: false,
    returnViewAfterSelection: null,
    contentCursorOffset: snapshot.contentCursorOffset,
    draft: {
      ...snapshot.draft,
      taskLinks: snapshot.draft.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
    },
    draftBaselineSignature: snapshot.canonicalBaselineSignature ?? snapshot.baselineSignature ?? getRecordDraftSignature(snapshot.draft),
    meetingActivities: snapshot.meetingActivities,
    appendedMeetingActivityIds: snapshot.appendedMeetingActivityIds,
    meetingLiveCaptureRuntime: createMeetingLiveRuntime(snapshot.draft.id ?? createId(), activeBoardIdForMeeting() ?? ''),
    ...resetMeetingSynthesisState,
    lastSaveFeedback: null,
    error: null,
    meetingDraftRecovery: {
      ...initialMeetingDraftRecoveryState,
      localStatus: 'saved',
      cloudStatus: 'idle',
      localSavedAt: snapshot.savedAt,
      cloudSavedAt: null,
      restoredAt: Date.now(),
    },
    meetingProjectImportStatus: 'idle',
    meetingProjectImportMessage: null,
    meetingProjectImportRequestId: get().meetingProjectImportRequestId + 1,
    contentFocusPending: false,
  }),

  requestMeetingDraftRecoveryClear: () => set(state => ({
    meetingDraftRecoveryClearToken: state.meetingDraftRecoveryClearToken + 1,
    meetingDraftRecovery: initialMeetingDraftRecoveryState,
  })),

  resetMeetingDraftRecoveryState: () => set({ meetingDraftRecovery: initialMeetingDraftRecoveryState }),

  clearSaveFeedback: () => set({ lastSaveFeedback: null }),
}));

export default useRecordStore;
