import { create } from 'zustand';
import dayjs from 'dayjs';
import { recordService } from '../services/dataBackend';
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
import { appendTaskDiscussionToRecordContent } from '../utils/meetingTaskDiscussion';
import type { MeetingSynthesisInput } from '../utils/meetingRecordSynthesis';
import { getRecordDraftSignature } from '../utils/meetingRecordWorkflow';
import { mergeHumanDraftWithAiSynthesis } from '../utils/humanDraftSynthesisMerge';
import { useMemberStore } from './useMemberStore';
import type {
  KnowledgeRecord,
  KnowledgeRecordInput,
  KnowledgeRecordStatus,
  KnowledgeRecordType,
  KnowledgeRecordVisibility,
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
};

type RecordSaveFeedback = {
  recordId: string;
  status: KnowledgeRecordStatus;
  savedAt: number;
} | null;

export type MeetingTaskActivityInput = {
  eventType: string;
  nodeId: string;
  title: string;
  occurredAt?: number;
  payload?: Record<string, unknown>;
};

export type MeetingTaskActivity = Required<Omit<MeetingTaskActivityInput, 'payload'>> & {
  payload: Record<string, unknown>;
  summary: string;
};

interface RecordStoreState {
  records: KnowledgeRecord[];
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
  meetingSynthesisStatus: MeetingSynthesisStatus;
  meetingSynthesisError: string | null;
  meetingSynthesisWarnings: string[];
  meetingSynthesisProvider: string | null;
  lastSaveFeedback: RecordSaveFeedback;
}

interface RecordStoreActions {
  loadRecords: (workspaceId: string, boardId: string) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanelCollapsed: () => void;
  openNewRecord: (type: KnowledgeRecordType, initialNodeId?: string) => void;
  openExistingRecord: (record: KnowledgeRecord) => void;
  startMeetingRecord: () => void;
  exitMeetingMode: () => void;
  toggleMeetingTaskCapture: () => void;
  updateDraft: (updates: Partial<RecordDraft>) => void;
  setContentCursorOffset: (offset: number) => void;
  setDraftTaskRole: (nodeId: string, role: RecordTaskLinkRole) => void;
  toggleDraftTask: (nodeId: string) => void;
  insertTaskMentionAtCursor: (nodeId: string, title: string) => void;
  appendTaskDiscussionToMeetingDraft: (nodeId: string, title: string, text: string) => boolean;
  recordMeetingTaskActivity: (activity: MeetingTaskActivityInput) => void;
  synthesizeMeetingDraft: (nodes?: Record<string, TaskNode>) => Promise<boolean>;
  enterTaskSelectionMode: (options?: TaskSelectionModeOptions) => void;
  exitTaskSelectionMode: (restorePanel?: boolean) => void;
  saveDraft: (options?: SaveDraftOptions) => Promise<KnowledgeRecord | null>;
  archiveRecord: (recordId: string) => Promise<void>;
  clearSaveFeedback: () => void;
}

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `record_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createDefaultDraft = (
  type: KnowledgeRecordType,
  userId: string | null,
  initialNodeId?: string
): RecordDraft => {
  const now = dayjs();
  const end = now.endOf('day');
  const start = end.subtract(7, 'day');
  const title = type === 'meeting'
    ? `會議紀錄 ${now.format('YYYY/MM/DD HH:mm')}`
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

const toRecordInput = (record: KnowledgeRecord): KnowledgeRecordInput => ({
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
  taskLinks: record.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
});

const toDraftFromRecordInput = (
  input: KnowledgeRecordInput,
  saved: KnowledgeRecord,
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

const statusLabels: Record<string, string> = {
  todo: '待辦',
  in_progress: '進行中',
  completed: '已完成',
  delayed: '延遲',
  unsure: '未確認',
  onhold: '暫停',
};

const getPayloadStatus = (payload: Record<string, unknown>, side: 'before' | 'after') => {
  const sidePayload = payload[side] as Record<string, unknown> | undefined;
  const status = sidePayload?.status;
  return typeof status === 'string' ? status : '';
};

const formatStatus = (status: string) => statusLabels[status] ?? (status || '未設定');

const formatDateRange = (value: Record<string, unknown> | undefined) => {
  const start = typeof value?.startDate === 'string' && value.startDate ? value.startDate : '未設定';
  const end = typeof value?.endDate === 'string' && value.endDate ? value.endDate : '未設定';
  return `${start} 至 ${end}`;
};

const getPayloadAssigneeId = (payload: Record<string, unknown>, side: 'before' | 'after') => {
  const sidePayload = payload[side] as Record<string, unknown> | undefined;
  const assigneeId = sidePayload?.assigneeId;
  return typeof assigneeId === 'string' && assigneeId ? assigneeId : null;
};

const shortId = (value: string) => value.slice(0, 8);

const formatAssignee = (assigneeId: string | null) => {
  if (!assigneeId) return '未指派';

  const member = useMemberStore.getState().boardMembers.find(item => item.userId === assigneeId);
  const label = member?.profile?.displayName || member?.profile?.email;
  if (label) return label;

  return `已離開成員（${shortId(assigneeId)}）`;
};

const summarizeMeetingActivity = (activity: MeetingTaskActivityInput) => {
  const payload = activity.payload ?? {};
  if (activity.eventType === 'task_status_changed') {
    return `狀態由「${formatStatus(getPayloadStatus(payload, 'before'))}」改為「${formatStatus(getPayloadStatus(payload, 'after'))}」。`;
  }
  if (activity.eventType === 'task_moved') return '位置已調整。';
  if (activity.eventType === 'task_dates_changed') {
    const before = payload.before as Record<string, unknown> | undefined;
    const after = payload.after as Record<string, unknown> | undefined;
    return `日期由「${formatDateRange(before)}」改為「${formatDateRange(after)}」。`;
  }
  if (activity.eventType === 'task_assigned') {
    return `負責人改為「${formatAssignee(getPayloadAssigneeId(payload, 'after'))}」。`;
  }
  if (activity.eventType === 'task_collaborators_changed') return '協作者已更新。';
  if (activity.eventType === 'task_tags_changed') return '標籤已更新。';
  if (activity.eventType === 'task_archived') return '任務已封存。';
  if (activity.eventType === 'task_restored') return '任務已還原。';
  if (activity.eventType === 'task_created') return `新增任務「${activity.title || activity.nodeId}」。`;
  return '任務已更新。';
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
  activities: MeetingTaskActivity[],
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
  const synthesisActivities = activities.map(activity => createMeetingActivity({
    eventType: activity.eventType,
    nodeId: activity.nodeId,
    title: nodes[activity.nodeId]?.title || activity.title,
    occurredAt: activity.occurredAt,
    payload: activity.payload,
  }));
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
  meetingSynthesisStatus: 'idle',
  meetingSynthesisError: null,
  meetingSynthesisWarnings: [],
  meetingSynthesisProvider: null,
  lastSaveFeedback: null,

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

  closePanel: () => set({
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
    ...resetMeetingSynthesisState,
    lastSaveFeedback: null,
  }),

  togglePanelCollapsed: () => set(state => ({ isPanelCollapsed: !state.isPanelCollapsed })),

  openNewRecord: (type, initialNodeId) => {
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
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
      error: null,
    });
  },

  openExistingRecord: (record) => {
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
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
      error: null,
    });
  },

  startMeetingRecord: () => {
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
        ...(isExistingMeetingDraft ? {} : resetMeetingSynthesisState),
        lastSaveFeedback: null,
        error: null,
      };
    });
  },

  exitMeetingMode: () => set({
    isMeetingMode: false,
    meetingTaskCaptureEnabled: false,
    isTaskSelectionMode: false,
    returnViewAfterSelection: null,
  }),

  toggleMeetingTaskCapture: () => set(state => ({
    meetingTaskCaptureEnabled: !state.meetingTaskCaptureEnabled,
  })),

  updateDraft: (updates) => set(state => ({
    draft: state.draft
      ? typeof updates.content === 'string'
        ? syncDraftContentLinks({ ...state.draft, ...updates }, updates.content)
        : { ...state.draft, ...updates }
      : state.draft,
    lastSaveFeedback: null,
  })),

  setContentCursorOffset: (offset) => set({ contentCursorOffset: offset }),

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

  appendTaskDiscussionToMeetingDraft: (nodeId, title, text) => {
    const state = get();
    if (!state.isMeetingMode || state.draft?.type !== 'meeting') return false;

    const content = appendTaskDiscussionToRecordContent(state.draft.content, nodeId, title, text);
    if (!content) return false;

    const draft = syncDraftContentLinks(state.draft, content);

    set({
      draft,
      contentCursorOffset: content.length,
      ...resetMeetingSynthesisState,
      lastSaveFeedback: null,
    });
    return true;
  },

  recordMeetingTaskActivity: (activity) => set(state => {
    if (!state.isMeetingMode || state.draft?.type !== 'meeting') return {};
    const nextActivity = createMeetingActivity(activity);
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
      const result = await synthesizeMeetingRecord(
        createMeetingSynthesisInput(preservedDraft, meetingActivities, nodes),
      );
      const mergedContent = mergeHumanDraftWithAiSynthesis(result.content, preservedDraft.content);
      const nextDraft = syncDraftContentLinks(
        {
          ...preservedDraft,
          status: 'draft',
          legacyTaskLinkNodeIds: Array.from(new Set([
            ...(preservedDraft.legacyTaskLinkNodeIds ?? []),
            ...result.linkedTaskIds,
          ])),
        },
        mergedContent,
      );

      set({
        saving: false,
        draft: nextDraft,
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

  saveDraft: async (_options = {}) => {
    const {
      draft: currentDraft,
    } = get();
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!currentDraft || !activeWorkspaceId || !activeBoardId) {
      set({ error: '請先選擇工作區與看板。' });
      return null;
    }
    const wantsPublish = currentDraft.status === 'published';

    const draft = currentDraft;
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

    const { legacyTaskLinkNodeIds: _legacyTaskLinkNodeIds, ...serializableDraft } = draft;
    const payload: KnowledgeRecordInput = {
      ...serializableDraft,
      title: draft.title.trim(),
      content: draft.content.trim(),
      participantsText: draft.participantsText?.trim(),
      taskLinks: uniqueLinks(draft.taskLinks),
      status: draft.status as KnowledgeRecordStatus,
      visibility: draft.visibility as KnowledgeRecordVisibility,
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

  clearSaveFeedback: () => set({ lastSaveFeedback: null }),
}));

export default useRecordStore;
