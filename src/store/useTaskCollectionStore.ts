import { create } from 'zustand';
import { taskCollectionService } from '../services/dataBackend';
import type { TaskCollectionRecord } from '../types';
import type { TaskCollectionSummary } from '../features/taskCollection/types';
import { markTaskCollectionPending, clearTaskCollectionPending } from '../features/taskCollection/pending';

export type TaskCollectionSection = 'task_collection' | 'meeting' | 'work_log';

type TaskCollectionStore = {
  activeSection: TaskCollectionSection;
  previewState: 'idle' | 'loading' | 'confirmation' | 'committing' | 'success' | 'error';
  pendingByTaskId: Record<string, string>;
  list: { scopeKey: string | null; query: string; items: TaskCollectionSummary[]; nextCursor: { occurredAt: number; id: string } | null; requestId: number; loading: boolean; error: string | null };
  detail: { recordId: string | null; data: TaskCollectionRecord | null; loading: boolean; error: string | null };
  lastResult: { recordId: string; taskId: string } | null;
  summaries: TaskCollectionSummary[];
  selected: TaskCollectionRecord | null;
  loading: boolean;
  error: string | null;
  load: (workspaceId: string, boardId: string, query?: string) => Promise<void>;
  open: (workspaceId: string, boardId: string, recordId: string) => Promise<void>;
  clear: () => void;
  setActiveSection: (section: TaskCollectionSection) => void;
  setPending: (taskId: string, operationId: string) => void;
  clearPending: (taskId: string) => void;
};

export const useTaskCollectionStore = create<TaskCollectionStore>((set) => ({
  activeSection: 'task_collection',
  previewState: 'idle',
  pendingByTaskId: {},
  list: { scopeKey: null, query: '', items: [], nextCursor: null, requestId: 0, loading: false, error: null },
  detail: { recordId: null, data: null, loading: false, error: null },
  lastResult: null,
  summaries: [],
  selected: null,
  loading: false,
  error: null,
  load: async (workspaceId, boardId, query = useTaskCollectionStore.getState().list.query) => {
    const scopeKey = `${workspaceId}:${boardId}`;
    const trimmedQuery = query.trim();
    const effectiveQuery = Array.from(trimmedQuery).length === 1 ? '' : trimmedQuery;
    const requestId = useTaskCollectionStore.getState().list.requestId + 1;
    set(state => ({ loading: true, error: null, list: { ...state.list, scopeKey, query, loading: true, error: null, requestId } }));
    try {
      const summaries = await taskCollectionService.listSummaries(workspaceId, boardId, effectiveQuery || undefined);
      set(state => state.list.requestId === requestId && state.list.scopeKey === scopeKey
        ? ({ summaries, loading: false, list: { ...state.list, items: summaries, loading: false, error: null } })
        : state);
    } catch (error) {
      // Firebase remains a supported legacy backend; it simply has no collection endpoint.
      const message = error instanceof Error ? error.message : String(error);
      set(state => state.list.requestId === requestId && state.list.scopeKey === scopeKey
        ? ({ summaries: [], loading: false, error: message, list: { ...state.list, loading: false, error: message } })
        : state);
    }
  },
  open: async (workspaceId, boardId, recordId) => {
    set({ activeSection: 'task_collection', loading: true, error: null, detail: { recordId, data: null, loading: true, error: null } });
    try {
      const selected = await taskCollectionService.getById(workspaceId, boardId, recordId);
      set({ selected, loading: false, detail: { recordId, data: selected, loading: false, error: null } });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error), detail: { recordId, data: null, loading: false, error: error instanceof Error ? error.message : String(error) } });
    }
  },
  clear: () => set({ selected: null, error: null, detail: { recordId: null, data: null, loading: false, error: null } }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setPending: (taskId, operationId) => {
    markTaskCollectionPending([taskId], operationId);
    set(state => ({ pendingByTaskId: { ...state.pendingByTaskId, [taskId]: operationId } }));
  },
  clearPending: (taskId) => {
    clearTaskCollectionPending(taskId);
    set(state => ({ pendingByTaskId: Object.fromEntries(Object.entries(state.pendingByTaskId).filter(([id]) => id !== taskId)) }));
  },
}));

export default useTaskCollectionStore;
