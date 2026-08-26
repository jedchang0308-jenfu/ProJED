import { create } from 'zustand';
import {
  createDefaultTaskFilters,
  migrateLegacyBoardTaskFilterPrefs,
  normalizeTaskFilters,
  type AccountBoardTaskFilterScope,
  type TaskFilterState,
} from '../features/taskFilters';
import { taskFilterPreferenceRepository } from '../features/taskFilters/preferenceRepositoryInstance';
import useAuthStore from './useAuthStore';
import useUndoStore from './useUndoStore';
import { toast } from './useToastStore';

export type TaskFilterHydrationStatus = 'idle' | 'hydrating' | 'ready' | 'fallback';
export type TaskFilterSyncStatus = 'synced' | 'pending-upsert' | 'pending-delete' | 'sync-error';

type TaskFilterStoreState = {
  accountId: string | null;
  boardId: string | null;
  generation: number;
  filters: TaskFilterState;
  hydrationStatus: TaskFilterHydrationStatus;
  syncStatus: TaskFilterSyncStatus;
  warning: string | null;
  source: 'remote' | 'cache' | 'default' | 'local-only';
  remoteVersion: number | null;
};

type TaskFilterStoreActions = {
  activateScope: (accountId: string, boardId: string) => Promise<void>;
  clearScope: () => void;
  retrySync: () => Promise<void>;
  toggleStatusFilter: (status: keyof TaskFilterState['statusFilters']) => void;
  setDueWithinDays: (days: number | null) => void;
  toggleOverdueFilter: () => void;
  toggleAssigneeFilter: (assigneeId: string) => void;
  clearAssigneeFilters: () => void;
  toggleTagFilter: (tagId: string) => void;
  clearTagFilters: () => void;
  setKeyword: (keyword: string) => void;
  resetFilters: () => void;
  reconcileAssigneeIds: (validIds: ReadonlySet<string>, preserveIds?: ReadonlySet<string>) => void;
  reconcileTagIds: (validIds: ReadonlySet<string>) => void;
  refreshProjection: () => void;
};

const defaultState = (): TaskFilterStoreState => ({
  accountId: null,
  boardId: null,
  generation: 0,
  filters: createDefaultTaskFilters(),
  hydrationStatus: 'idle',
  syncStatus: 'synced',
  warning: null,
  source: 'default',
  remoteVersion: null,
});

const sameScope = (
  state: Pick<TaskFilterStoreState, 'accountId' | 'boardId'>,
  scope: AccountBoardTaskFilterScope,
) => state.accountId === scope.accountId && state.boardId === scope.boardId;

const isAccountSessionCurrent = (scope: AccountBoardTaskFilterScope) => (
  useAuthStore.getState().user?.uid === scope.accountId
);

export const useTaskFilterStore = create<TaskFilterStoreState & TaskFilterStoreActions>((set, get) => {
  const applyWarning = (warning: string | null) => {
    if (warning && get().warning !== warning) toast.warning(warning, { duration: 5000 });
  };

  const settleMutation = async (
    scope: AccountBoardTaskFilterScope,
    generation: number,
    promise: ReturnType<typeof taskFilterPreferenceRepository.persist>,
  ) => {
    const result = await promise;
    const current = get();
    if (!sameScope(current, scope) || current.generation !== generation) return;
    applyWarning(result.warning);
    set({
      syncStatus: result.synced ? 'synced' : 'sync-error',
      warning: result.warning,
    });
  };

  const applyScopedFilters = (
    scope: AccountBoardTaskFilterScope,
    filters: TaskFilterState,
    syncStatus: Extract<TaskFilterSyncStatus, 'pending-upsert' | 'pending-delete'>,
  ) => {
    const current = get();
    if (!sameScope(current, scope)) return Promise.resolve();
    const generation = current.generation;
    const normalized = normalizeTaskFilters(filters);
    set({ filters: normalized, syncStatus, warning: null });
    const mutation = syncStatus === 'pending-delete'
      ? taskFilterPreferenceRepository.reset(scope, () => isAccountSessionCurrent(scope))
      : taskFilterPreferenceRepository.persist(scope, normalized, () => isAccountSessionCurrent(scope));
    return settleMutation(scope, generation, mutation);
  };

  const updateFilters = (
    recipe: (filters: TaskFilterState) => TaskFilterState,
    label: string,
  ) => {
    const current = get();
    if (!current.accountId || !current.boardId) return;
    const scope = { accountId: current.accountId, boardId: current.boardId };
    const before = normalizeTaskFilters(current.filters);
    const after = normalizeTaskFilters(recipe(before));
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    void applyScopedFilters(scope, after, 'pending-upsert');
    useUndoStore.getState().pushUndo({
      label,
      scope: 'filter',
      entityIds: [scope.boardId],
      undo: () => applyScopedFilters(scope, before, 'pending-upsert'),
      redo: () => applyScopedFilters(scope, after, 'pending-upsert'),
    });
  };

  return {
    ...defaultState(),

    activateScope: async (accountId, boardId) => {
      const scope = { accountId, boardId };
      const previous = get();
      if (sameScope(previous, scope) && previous.hydrationStatus !== 'idle') {
        await get().retrySync();
        return;
      }
      const generation = previous.generation + 1;
      migrateLegacyBoardTaskFilterPrefs(accountId);
      useUndoStore.getState().clear();
      set({
        accountId,
        boardId,
        generation,
        filters: taskFilterPreferenceRepository.getImmediate(scope),
        hydrationStatus: taskFilterPreferenceRepository.remoteEnabled ? 'hydrating' : 'ready',
        syncStatus: 'synced',
        warning: null,
        source: taskFilterPreferenceRepository.remoteEnabled ? 'cache' : 'local-only',
        remoteVersion: null,
      });

      const result = await taskFilterPreferenceRepository.hydrate(
        scope,
        () => isAccountSessionCurrent(scope),
      );
      const current = get();
      if (!sameScope(current, scope) || current.generation !== generation) return;
      applyWarning(result.warning);
      set({
        filters: result.filters,
        hydrationStatus: result.hydrationStatus,
        syncStatus: result.syncStatus,
        warning: result.warning,
        source: result.source,
        remoteVersion: result.remoteVersion,
      });
    },

    clearScope: () => {
      useUndoStore.getState().clear();
      set(state => ({ ...defaultState(), generation: state.generation + 1 }));
    },

    retrySync: async () => {
      const current = get();
      if (!current.accountId || !current.boardId) return;
      const scope = { accountId: current.accountId, boardId: current.boardId };
      const generation = current.generation;
      const result = await taskFilterPreferenceRepository.retryPending(
        scope,
        () => isAccountSessionCurrent(scope),
      );
      const latest = get();
      if (!sameScope(latest, scope) || latest.generation !== generation) return;
      applyWarning(result.warning);
      set({ syncStatus: result.synced ? 'synced' : 'sync-error', warning: result.warning });
    },

    toggleStatusFilter: status => updateFilters(filters => ({
      ...filters,
      statusFilters: { ...filters.statusFilters, [status]: !filters.statusFilters[status] },
    }), '修改篩選條件'),

    setDueWithinDays: days => updateFilters(filters => ({ ...filters, dueWithinDays: days }), '修改到期篩選'),
    toggleOverdueFilter: () => updateFilters(filters => ({ ...filters, overdueOnly: !filters.overdueOnly }), '切換逾期篩選'),

    toggleAssigneeFilter: assigneeId => updateFilters(filters => ({
      ...filters,
      selectedAssigneeIds: filters.selectedAssigneeIds.includes(assigneeId)
        ? filters.selectedAssigneeIds.filter(id => id !== assigneeId)
        : [...filters.selectedAssigneeIds, assigneeId],
    }), '修改負責人篩選'),

    clearAssigneeFilters: () => updateFilters(filters => ({ ...filters, selectedAssigneeIds: [] }), '清除負責人篩選'),

    toggleTagFilter: tagId => updateFilters(filters => ({
      ...filters,
      selectedTagIds: filters.selectedTagIds.includes(tagId)
        ? filters.selectedTagIds.filter(id => id !== tagId)
        : [...filters.selectedTagIds, tagId],
    }), '修改標籤篩選'),

    clearTagFilters: () => updateFilters(filters => ({ ...filters, selectedTagIds: [] }), '清除標籤篩選'),
    setKeyword: keyword => updateFilters(filters => ({ ...filters, keyword }), '修改關鍵字篩選'),

    resetFilters: () => {
      const current = get();
      if (!current.accountId || !current.boardId) return;
      const scope = { accountId: current.accountId, boardId: current.boardId };
      const before = normalizeTaskFilters(current.filters);
      const after = createDefaultTaskFilters();
      void applyScopedFilters(scope, after, 'pending-delete');
      useUndoStore.getState().pushUndo({
        label: '清除篩選',
        scope: 'filter',
        entityIds: [scope.boardId],
        undo: () => applyScopedFilters(scope, before, 'pending-upsert'),
        redo: () => applyScopedFilters(scope, after, 'pending-delete'),
      });
    },

    reconcileAssigneeIds: (validIds, preserveIds = new Set(['__unassigned__'])) => {
      const current = get().filters.selectedAssigneeIds;
      const next = current.filter(id => validIds.has(id) || preserveIds.has(id));
      if (next.length !== current.length) updateFilters(filters => ({ ...filters, selectedAssigneeIds: next }), '清理失效負責人篩選');
    },

    reconcileTagIds: validIds => {
      const current = get().filters.selectedTagIds;
      const next = current.filter(id => validIds.has(id));
      if (next.length !== current.length) updateFilters(filters => ({ ...filters, selectedTagIds: next }), '清理失效標籤篩選');
    },

    refreshProjection: () => set(state => ({ filters: normalizeTaskFilters(state.filters) })),
  };
});

export default useTaskFilterStore;
