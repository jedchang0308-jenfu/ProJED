import { create } from 'zustand';
import {
  createDefaultTaskFilters,
  migrateLegacyBoardTaskFilterPrefs,
  normalizeTaskFilters,
  type AccountBoardTaskFilterScope,
  type TaskFilterQuery,
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
  filters: TaskFilterQuery;
  hydrationStatus: TaskFilterHydrationStatus;
  syncStatus: TaskFilterSyncStatus;
  warning: string | null;
  source: 'remote' | 'cache' | 'default' | 'local-only';
  remoteVersion: number | null;
  controlsLocked: boolean;
};

type TaskFilterStoreActions = {
  activateScope: (accountId: string, boardId: string) => Promise<void>;
  clearScope: () => void;
  retrySync: () => Promise<void>;
  setQuery: (filters: TaskFilterQuery) => void;
  clearAssigneeFilters: () => void;
  clearTagFilters: () => void;
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
  controlsLocked: false,
});

const sameScope = (
  state: Pick<TaskFilterStoreState, 'accountId' | 'boardId'>,
  scope: AccountBoardTaskFilterScope,
) => state.accountId === scope.accountId && state.boardId === scope.boardId;

const isAccountSessionCurrent = (scope: AccountBoardTaskFilterScope) => (
  useAuthStore.getState().user?.uid === scope.accountId
);

export const useTaskFilterStore = create<TaskFilterStoreState & TaskFilterStoreActions>((set, get) => {
  const canSendScoped = (scope: AccountBoardTaskFilterScope, generation: number) => {
    const current = get();
    return isAccountSessionCurrent(scope) && sameScope(current, scope) && current.generation === generation;
  };
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
      ...(result.controlsLocked ? { controlsLocked: true } : {}),
    });
  };

  const applyScopedFilters = (
    scope: AccountBoardTaskFilterScope,
    filters: TaskFilterQuery,
    syncStatus: Extract<TaskFilterSyncStatus, 'pending-upsert' | 'pending-delete'>,
  ) => {
    const current = get();
    if (!sameScope(current, scope)) return Promise.resolve();
    const generation = current.generation;
    const normalized = normalizeTaskFilters(filters);
    set({ filters: normalized, syncStatus, warning: null });
    const mutation = syncStatus === 'pending-delete'
      ? taskFilterPreferenceRepository.reset(scope, () => canSendScoped(scope, generation))
      : taskFilterPreferenceRepository.persist(scope, normalized, () => canSendScoped(scope, generation));
    return settleMutation(scope, generation, mutation);
  };

  const updateFilters = (
    recipe: (filters: TaskFilterQuery) => TaskFilterQuery,
    label: string,
  ) => {
    const current = get();
    if (!current.accountId || !current.boardId || current.controlsLocked) return;
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
       if (sameScope(previous, scope) && previous.hydrationStatus !== 'idle' && !previous.controlsLocked) {
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
        controlsLocked: taskFilterPreferenceRepository.remoteEnabled,
      });

      const result = await taskFilterPreferenceRepository.hydrate(
        scope,
        () => canSendScoped(scope, generation),
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
        controlsLocked: result.controlsLocked,
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
      if (current.controlsLocked) {
        set({ hydrationStatus: 'hydrating' });
        const hydrated = await taskFilterPreferenceRepository.hydrate(scope, () => canSendScoped(scope, generation));
        const latest = get();
        if (!sameScope(latest, scope) || latest.generation !== generation) return;
        applyWarning(hydrated.warning);
        set({ filters: hydrated.filters, hydrationStatus: hydrated.hydrationStatus, syncStatus: hydrated.syncStatus, warning: hydrated.warning, source: hydrated.source, remoteVersion: hydrated.remoteVersion, controlsLocked: hydrated.controlsLocked });
        return;
      }
      const result = await taskFilterPreferenceRepository.retryPending(
        scope,
        () => canSendScoped(scope, generation),
      );
      const latest = get();
      if (!sameScope(latest, scope) || latest.generation !== generation) return;
      applyWarning(result.warning);
      set({
        syncStatus: result.synced ? 'synced' : 'sync-error',
        warning: result.warning,
        ...(result.controlsLocked ? { controlsLocked: true } : {}),
      });
    },

    setQuery: filters => {
      const current = get();
      if (!current.accountId || !current.boardId || current.controlsLocked) return;
      const scope = { accountId: current.accountId, boardId: current.boardId };
      const before = normalizeTaskFilters(current.filters);
      const after = normalizeTaskFilters(filters);
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      void applyScopedFilters(scope, after, 'pending-upsert');
      useUndoStore.getState().pushUndo({
        label: '修改篩選條件',
        scope: 'filter',
        entityIds: [scope.boardId],
        undo: () => applyScopedFilters(scope, before, 'pending-upsert'),
        redo: () => applyScopedFilters(scope, after, 'pending-upsert'),
      });
    },

    clearAssigneeFilters: () => updateFilters(filters => ({
      ...filters,
      people: { mode: 'all', ids: [], includeUnassigned: false },
    }), '清除負責人篩選'),

    clearTagFilters: () => updateFilters(filters => ({ ...filters, tags: { mode: 'all', ids: [], includeUntagged: false } }), '清除標籤篩選'),

    resetFilters: () => {
      const current = get();
      if (!current.accountId || !current.boardId || current.controlsLocked) return;
      const scope = { accountId: current.accountId, boardId: current.boardId };
      const before = normalizeTaskFilters(current.filters);
      const after = createDefaultTaskFilters();
      void applyScopedFilters(scope, after, 'pending-upsert');
      useUndoStore.getState().pushUndo({
        label: '清除篩選',
        scope: 'filter',
        entityIds: [scope.boardId],
        undo: () => applyScopedFilters(scope, before, 'pending-upsert'),
        redo: () => applyScopedFilters(scope, after, 'pending-upsert'),
      });
    },

    // Saved IDs are snapshots and remain valid filter choices even when the
    // current option source no longer enumerates them.
    reconcileAssigneeIds: () => undefined,
    reconcileTagIds: () => undefined,

    refreshProjection: () => set(state => ({ filters: normalizeTaskFilters(state.filters) })),
  };
});

export default useTaskFilterStore;
