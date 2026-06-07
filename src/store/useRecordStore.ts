import { create } from 'zustand';
import dayjs from 'dayjs';
import { recordService } from '../services/dataBackend';
import useAuthStore from './useAuthStore';
import useBoardStore from './useBoardStore';
import {
  extractTaskMentionIds,
  insertTaskMention,
  serializeTaskMention,
  syncTaskLinksFromRecordContent,
  uniqueRecordTaskLinks,
} from '../utils/recordContentMentions';
import { appendTaskDiscussionToRecordContent } from '../utils/meetingTaskDiscussion';
import type {
  KnowledgeRecord,
  KnowledgeRecordInput,
  KnowledgeRecordStatus,
  KnowledgeRecordType,
  KnowledgeRecordVisibility,
  RecordTaskLinkRole,
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
  meetingActivities: MeetingTaskActivity[];
  appendedMeetingActivityIds: string[];
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
  enterTaskSelectionMode: (options?: TaskSelectionModeOptions) => void;
  exitTaskSelectionMode: (restorePanel?: boolean) => void;
  saveDraft: () => Promise<KnowledgeRecord | null>;
  archiveRecord: (recordId: string) => Promise<void>;
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
    visibility: type === 'work_log' ? 'private' : 'project',
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
  return `${start} -> ${end}`;
};

const summarizeMeetingActivity = (activity: MeetingTaskActivityInput) => {
  const payload = activity.payload ?? {};
  if (activity.eventType === 'task_status_changed') {
    return `狀態 ${formatStatus(getPayloadStatus(payload, 'before'))} -> ${formatStatus(getPayloadStatus(payload, 'after'))}`;
  }
  if (activity.eventType === 'task_moved') return '位置變更';
  if (activity.eventType === 'task_dates_changed') {
    const before = payload.before as Record<string, unknown> | undefined;
    const after = payload.after as Record<string, unknown> | undefined;
    return `日期 ${formatDateRange(before)} => ${formatDateRange(after)}`;
  }
  if (activity.eventType === 'task_assigned') return '負責人變更';
  if (activity.eventType === 'task_collaborators_changed') return '協作者變更';
  if (activity.eventType === 'task_tags_changed') return '標籤變更';
  if (activity.eventType === 'task_archived') return '任務封存';
  if (activity.eventType === 'task_restored') return '任務還原';
  if (activity.eventType === 'task_created') return '新增任務';
  return '任務更新';
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

const getMeetingActivityId = (activity: MeetingTaskActivity) =>
  `${activity.occurredAt}:${activity.eventType}:${activity.nodeId}:${activity.summary}`;

const appendMeetingActivitiesToDraft = (
  draft: RecordDraft,
  activities: MeetingTaskActivity[],
  appendedActivityIds: string[],
) => {
  const appendedIds = new Set(appendedActivityIds);
  const pendingActivities = activities.filter(activity => !appendedIds.has(getMeetingActivityId(activity)));
  if (draft.type !== 'meeting' || pendingActivities.length === 0) {
    return { draft, appendedActivityIds };
  }

  const activityLines = pendingActivities.map(activity => {
    const time = dayjs(activity.occurredAt).format('HH:mm');
    return `- ${time} ${serializeTaskMention(activity.nodeId, activity.title)}：${activity.summary}`;
  });
  const content = [
    draft.content.trim(),
    '## 會議中任務變更',
    ...activityLines,
  ].filter(Boolean).join('\n\n');
  const nextDraft = syncDraftContentLinks(draft, content);
  return {
    draft: nextDraft,
    appendedActivityIds: [
      ...appendedActivityIds,
      ...pendingActivities.map(getMeetingActivityId),
    ],
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
  meetingActivities: [],
  appendedMeetingActivityIds: [],

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
    meetingActivities: [],
    appendedMeetingActivityIds: [],
  }),

  togglePanelCollapsed: () => set(state => ({ isPanelCollapsed: !state.isPanelCollapsed })),

  openNewRecord: (type, initialNodeId) => {
    const userId = useAuthStore.getState().user?.uid ?? null;
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
      isMeetingMode: false,
      meetingTaskCaptureEnabled: false,
      contentCursorOffset: 0,
      draft: createDefaultDraft(type, userId, initialNodeId),
      meetingActivities: [],
      appendedMeetingActivityIds: [],
      error: null,
    });
  },

  openExistingRecord: (record) => {
    const mentionedNodeIds = extractTaskMentionIds(record.content);
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
      isMeetingMode: false,
      meetingTaskCaptureEnabled: false,
      contentCursorOffset: record.content.length,
      draft: {
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
      },
      meetingActivities: [],
      appendedMeetingActivityIds: [],
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
        meetingActivities: state.draft === draft ? state.meetingActivities : [],
        appendedMeetingActivityIds: state.draft === draft ? state.appendedMeetingActivityIds : [],
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
  })),

  setContentCursorOffset: (offset) => set({ contentCursorOffset: offset }),

  setDraftTaskRole: (nodeId, role) => set(state => {
    if (!state.draft) return {};
    const nextLinks = state.draft.taskLinks.map(link =>
      link.nodeId === nodeId ? { ...link, role } : link
    );
    return { draft: { ...state.draft, taskLinks: uniqueLinks(nextLinks) } };
  }),

  toggleDraftTask: (nodeId) => set(state => {
    if (!state.draft) return {};
    const hasLink = state.draft.taskLinks.some(link => link.nodeId === nodeId);
    const nextRole: RecordTaskLinkRole = state.draft.taskLinks.length === 0 ? 'main' : 'related';
    const taskLinks = hasLink
      ? state.draft.taskLinks.filter(link => link.nodeId !== nodeId)
      : [...state.draft.taskLinks, { nodeId, role: nextRole }];
    return { draft: { ...state.draft, taskLinks } };
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
    });
    return true;
  },

  recordMeetingTaskActivity: (activity) => set(state => {
    if (!state.isMeetingMode || state.draft?.type !== 'meeting') return {};
    const nextActivity = createMeetingActivity(activity);
    return {
      meetingActivities: [...state.meetingActivities, nextActivity],
    };
  }),

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

  saveDraft: async () => {
    const {
      draft: currentDraft,
      isMeetingMode,
      meetingActivities,
      appendedMeetingActivityIds,
    } = get();
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!currentDraft || !activeWorkspaceId || !activeBoardId) {
      set({ error: '請先選擇工作區與看板。' });
      return null;
    }
    const appended = isMeetingMode
      ? appendMeetingActivitiesToDraft(currentDraft, meetingActivities, appendedMeetingActivityIds)
      : { draft: currentDraft, appendedActivityIds: appendedMeetingActivityIds };
    const draft = appended.draft;
    if (draft !== currentDraft || appended.appendedActivityIds !== appendedMeetingActivityIds) {
      set({
        draft,
        appendedMeetingActivityIds: appended.appendedActivityIds,
        contentCursorOffset: draft.content.length,
      });
    }
    if (!draft.title.trim() || !draft.content.trim()) {
      set({ error: '標題與內容不可空白。' });
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

    set({ saving: true, error: null });
    try {
      const saved = await recordService.upsert(activeWorkspaceId, activeBoardId, payload);
      set(state => ({
        saving: false,
        draft: {
          ...payload,
          id: saved.id,
          taskLinks: saved.taskLinks.map(link => ({ nodeId: link.nodeId, role: link.role })),
        },
        records: [saved, ...state.records.filter(record => record.id !== saved.id)],
      }));
      return saved;
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  archiveRecord: async (recordId) => {
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!activeWorkspaceId || !activeBoardId) return;
    set({ saving: true, error: null });
    try {
      await recordService.delete(activeWorkspaceId, activeBoardId, recordId);
      set(state => ({
        saving: false,
        records: state.records.filter(record => record.id !== recordId),
        draft: state.draft?.id === recordId ? null : state.draft,
      }));
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));

export default useRecordStore;
