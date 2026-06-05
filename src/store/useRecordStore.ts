import { create } from 'zustand';
import dayjs from 'dayjs';
import { recordService } from '../services/dataBackend';
import useAuthStore from './useAuthStore';
import useBoardStore from './useBoardStore';
import {
  extractTaskMentionIds,
  insertTaskMention,
  syncTaskLinksFromRecordContent,
  uniqueRecordTaskLinks,
} from '../utils/recordContentMentions';
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

interface RecordStoreState {
  records: KnowledgeRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  isPanelOpen: boolean;
  isPanelCollapsed: boolean;
  isTaskSelectionMode: boolean;
  restoreCollapsedAfterSelection: boolean;
  returnViewAfterSelection: ViewMode | null;
  contentCursorOffset: number | null;
  draft: RecordDraft | null;
}

interface RecordStoreActions {
  loadRecords: (workspaceId: string, boardId: string) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanelCollapsed: () => void;
  openNewRecord: (type: KnowledgeRecordType, initialNodeId?: string) => void;
  openExistingRecord: (record: KnowledgeRecord) => void;
  updateDraft: (updates: Partial<RecordDraft>) => void;
  setContentCursorOffset: (offset: number) => void;
  setDraftTaskRole: (nodeId: string, role: RecordTaskLinkRole) => void;
  toggleDraftTask: (nodeId: string) => void;
  insertTaskMentionAtCursor: (nodeId: string, title: string) => void;
  enterTaskSelectionMode: () => void;
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

const useRecordStore = create<RecordStoreState & RecordStoreActions>((set, get) => ({
  records: [],
  loading: false,
  saving: false,
  error: null,
  isPanelOpen: false,
  isPanelCollapsed: false,
  isTaskSelectionMode: false,
  restoreCollapsedAfterSelection: false,
  returnViewAfterSelection: null,
  contentCursorOffset: null,
  draft: null,

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
    returnViewAfterSelection: null,
    contentCursorOffset: null,
    draft: null,
  }),

  togglePanelCollapsed: () => set(state => ({ isPanelCollapsed: !state.isPanelCollapsed })),

  openNewRecord: (type, initialNodeId) => {
    const userId = useAuthStore.getState().user?.uid ?? null;
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
      contentCursorOffset: 0,
      draft: createDefaultDraft(type, userId, initialNodeId),
      error: null,
    });
  },

  openExistingRecord: (record) => {
    const mentionedNodeIds = extractTaskMentionIds(record.content);
    set({
      isPanelOpen: true,
      isPanelCollapsed: false,
      isTaskSelectionMode: false,
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
      error: null,
    });
  },

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

  enterTaskSelectionMode: () => {
    const { currentView, setView } = useBoardStore.getState();
    if (currentView !== 'board') setView('board');
    set(state => ({
      isPanelOpen: true,
      restoreCollapsedAfterSelection: state.isPanelCollapsed,
      returnViewAfterSelection: currentView,
      isPanelCollapsed: true,
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
    const { draft } = get();
    const { activeWorkspaceId, activeBoardId } = useBoardStore.getState();
    if (!draft || !activeWorkspaceId || !activeBoardId) {
      set({ error: '請先選擇工作區與看板。' });
      return null;
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
