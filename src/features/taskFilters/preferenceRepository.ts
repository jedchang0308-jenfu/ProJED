import { createDefaultTaskFilters } from './defaults';
import {
  BOARD_TASK_FILTER_PREFS_VERSION,
  normalizeTaskFilters,
  readTaskFilterPreferenceCache,
  readTaskFilterPreferencePending,
  removeTaskFilterPreferenceCache,
  removeTaskFilterPreferencePending,
  writeTaskFilterPreferenceCache,
  writeTaskFilterPreferencePending,
} from './storage';
import type {
  AccountBoardTaskFilterScope,
  TaskFilterPreferenceMutation,
  TaskFilterState,
} from './types';
export type TaskFilterPreferenceRemoteRow = {
  accountId: string;
  projectId: string;
  preferenceVersion: number;
  filters: unknown;
  createdAt: string;
  updatedAt: string;
};

export type TaskFilterPreferenceRemoteAdapter = {
  enabled: boolean;
  read: (accountId: string, boardId: string) => Promise<TaskFilterPreferenceRemoteRow | null>;
  upsert: (accountId: string, boardId: string, filters: TaskFilterState) => Promise<void>;
  remove: (accountId: string, boardId: string) => Promise<void>;
};

export type TaskFilterPreferenceLocalAdapter = {
  readCache: typeof readTaskFilterPreferenceCache;
  writeCache: typeof writeTaskFilterPreferenceCache;
  removeCache: typeof removeTaskFilterPreferenceCache;
  readPending: typeof readTaskFilterPreferencePending;
  writePending: typeof writeTaskFilterPreferencePending;
  removePending: typeof removeTaskFilterPreferencePending;
};

export type TaskFilterHydrationResult = {
  filters: TaskFilterState;
  source: 'remote' | 'cache' | 'default' | 'local-only';
  hydrationStatus: 'ready' | 'fallback';
  syncStatus: 'synced' | 'sync-error';
  warning: string | null;
  remoteVersion: number | null;
};

export type TaskFilterMutationResult = {
  synced: boolean;
  warning: string | null;
};

type QueuedMutation = {
  scope: AccountBoardTaskFilterScope;
  mutation: TaskFilterPreferenceMutation;
  canSend: () => boolean;
};

type QueueState = {
  latest: QueuedMutation | null;
  running: Promise<TaskFilterMutationResult> | null;
  waiters: Array<(result: TaskFilterMutationResult) => void>;
};

const SYNC_FALLBACK_WARNING = '篩選偏好無法同步，已使用此裝置設定';
const SYNC_PENDING_WARNING = '篩選偏好未同步，已保留在此裝置';
const UPGRADE_WARNING = '篩選偏好版本較新，請升級後再同步';

const scopeKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => `${accountId}\u0000${boardId}`;
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const createMutationId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
);

export const createTaskFilterPreferenceRepository = (
  remote: TaskFilterPreferenceRemoteAdapter,
  local: TaskFilterPreferenceLocalAdapter = {
    readCache: readTaskFilterPreferenceCache,
    writeCache: writeTaskFilterPreferenceCache,
    removeCache: removeTaskFilterPreferenceCache,
    readPending: readTaskFilterPreferencePending,
    writePending: writeTaskFilterPreferencePending,
    removePending: removeTaskFilterPreferencePending,
  },
) => {
  const queues = new Map<string, QueueState>();
  const blockedRemoteVersions = new Set<string>();

  const getImmediate = (scope: AccountBoardTaskFilterScope): TaskFilterState => (
    local.readCache(scope)?.filters ?? createDefaultTaskFilters()
  );

  const sendWithRetry = async (queued: QueuedMutation): Promise<TaskFilterMutationResult> => {
    if (!queued.canSend()) return { synced: false, warning: SYNC_PENDING_WARNING };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (!queued.canSend()) return { synced: false, warning: SYNC_PENDING_WARNING };
        if (queued.mutation.kind === 'delete') {
          await remote.remove(queued.scope.accountId, queued.scope.boardId);
        } else {
          await remote.upsert(
            queued.scope.accountId,
            queued.scope.boardId,
            normalizeTaskFilters(queued.mutation.filters),
          );
        }
        const currentPending = local.readPending(queued.scope);
        if (currentPending?.id === queued.mutation.id) {
          local.removePending(queued.scope);
          if (queued.mutation.kind === 'delete') local.removeCache(queued.scope);
        }
        return { synced: true, warning: null };
      } catch (error) {
        lastError = error;
        if (attempt === 0) await delay(100);
      }
    }
    console.warn('[taskFilterPreferenceRepository] preference mutation failed:', lastError);
    return { synced: false, warning: SYNC_PENDING_WARNING };
  };

  const drainQueue = async (key: string, state: QueueState): Promise<TaskFilterMutationResult> => {
    let finalResult: TaskFilterMutationResult = { synced: true, warning: null };
    while (state.latest) {
      const queued = state.latest;
      state.latest = null;
      finalResult = await sendWithRetry(queued);
      if (!finalResult.synced && !state.latest) break;
    }
    state.running = null;
    state.waiters.splice(0).forEach(resolve => resolve(finalResult));
    if (!state.latest) queues.delete(key);
    return finalResult;
  };

  const enqueue = (queued: QueuedMutation): Promise<TaskFilterMutationResult> => {
    const key = scopeKey(queued.scope);
    const state = queues.get(key) ?? { latest: null, running: null, waiters: [] };
    state.latest = queued;
    queues.set(key, state);
    const result = new Promise<TaskFilterMutationResult>(resolve => state.waiters.push(resolve));
    if (!state.running) state.running = drainQueue(key, state);
    return result;
  };

  const queueMutation = (
    scope: AccountBoardTaskFilterScope,
    mutation: TaskFilterPreferenceMutation,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    if (!remote.enabled) return Promise.resolve({ synced: true, warning: null });
    if (blockedRemoteVersions.has(scopeKey(scope))) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING });
    }
    return enqueue({ scope, mutation, canSend });
  };

  const persist = (
    scope: AccountBoardTaskFilterScope,
    filters: TaskFilterState,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const normalized = normalizeTaskFilters(filters);
    const cacheWritten = local.writeCache(scope, normalized);
    if (!remote.enabled) {
      return Promise.resolve({
        synced: cacheWritten,
        warning: cacheWritten ? null : SYNC_PENDING_WARNING,
      });
    }
    if (blockedRemoteVersions.has(scopeKey(scope))) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING });
    }
    const mutation: TaskFilterPreferenceMutation = {
      id: createMutationId(),
      version: BOARD_TASK_FILTER_PREFS_VERSION,
      kind: 'upsert',
      filters: normalized,
      updatedAt: Date.now(),
    };
    local.writePending(scope, mutation);
    return queueMutation(scope, mutation, canSend);
  };

  const reset = (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const cacheRemoved = local.removeCache(scope);
    if (!remote.enabled) {
      return Promise.resolve({
        synced: cacheRemoved,
        warning: cacheRemoved ? null : SYNC_PENDING_WARNING,
      });
    }
    if (blockedRemoteVersions.has(scopeKey(scope))) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING });
    }
    const mutation: TaskFilterPreferenceMutation = {
      id: createMutationId(),
      version: BOARD_TASK_FILTER_PREFS_VERSION,
      kind: 'delete',
      updatedAt: Date.now(),
    };
    local.writePending(scope, mutation);
    return queueMutation(scope, mutation, canSend);
  };

  const retryPending = async (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const pending = local.readPending(scope);
    if (!pending) return { synced: true, warning: null };
    return queueMutation(scope, pending, canSend);
  };

  const hydrate = async (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterHydrationResult> => {
    const cached = local.readCache(scope);
    const fallbackFilters = cached?.filters ?? createDefaultTaskFilters();
    if (!remote.enabled) {
      return {
        filters: fallbackFilters,
        source: cached ? 'local-only' : 'default',
        hydrationStatus: 'ready',
        syncStatus: 'synced',
        warning: null,
        remoteVersion: null,
      };
    }

    if (!canSend()) {
      return {
        filters: fallbackFilters,
        source: cached ? 'cache' : 'default',
        hydrationStatus: 'fallback',
        syncStatus: 'sync-error',
        warning: SYNC_FALLBACK_WARNING,
        remoteVersion: null,
      };
    }

    try {
      // Always inspect the remote version before replaying a v4 journal. This
      // prevents an old client from overwriting a row created by a newer client.
      const initialRow = await remote.read(scope.accountId, scope.boardId);
      if (initialRow && initialRow.preferenceVersion !== BOARD_TASK_FILTER_PREFS_VERSION) {
        blockedRemoteVersions.add(scopeKey(scope));
        return {
          filters: fallbackFilters,
          source: cached ? 'cache' : 'default',
          hydrationStatus: 'fallback',
          syncStatus: 'sync-error',
          warning: UPGRADE_WARNING,
          remoteVersion: initialRow.preferenceVersion,
        };
      }
      blockedRemoteVersions.delete(scopeKey(scope));

      const pending = local.readPending(scope);
      if (pending) {
        const retryResult = await retryPending(scope, canSend);
        if (!retryResult.synced) {
          return {
            filters: fallbackFilters,
            source: cached ? 'cache' : 'default',
            hydrationStatus: 'fallback',
            syncStatus: 'sync-error',
            warning: retryResult.warning,
            remoteVersion: initialRow?.preferenceVersion ?? null,
          };
        }
      }

      // Read again after replay so delete/upsert results, including concurrent
      // same-version last-write-wins commits, become the hydrate authority.
      const row = pending
        ? await remote.read(scope.accountId, scope.boardId)
        : initialRow;
      if (!row) {
        blockedRemoteVersions.delete(scopeKey(scope));
        local.removeCache(scope);
        return {
          filters: createDefaultTaskFilters(),
          source: 'default',
          hydrationStatus: 'ready',
          syncStatus: 'synced',
          warning: null,
          remoteVersion: null,
        };
      }
      if (row.preferenceVersion !== BOARD_TASK_FILTER_PREFS_VERSION) {
        blockedRemoteVersions.add(scopeKey(scope));
        return {
          filters: fallbackFilters,
          source: cached ? 'cache' : 'default',
          hydrationStatus: 'fallback',
          syncStatus: 'sync-error',
          warning: UPGRADE_WARNING,
          remoteVersion: row.preferenceVersion,
        };
      }
      blockedRemoteVersions.delete(scopeKey(scope));
      const filters = normalizeTaskFilters(row.filters as Partial<TaskFilterState>);
      local.writeCache(scope, filters);
      return {
        filters,
        source: 'remote',
        hydrationStatus: 'ready',
        syncStatus: 'synced',
        warning: null,
        remoteVersion: row.preferenceVersion,
      };
    } catch (error) {
      console.warn('[taskFilterPreferenceRepository] preference hydration failed:', error);
      return {
        filters: fallbackFilters,
        source: cached ? 'cache' : 'default',
        hydrationStatus: 'fallback',
        syncStatus: 'sync-error',
        warning: SYNC_FALLBACK_WARNING,
        remoteVersion: null,
      };
    }
  };

  return {
    remoteEnabled: remote.enabled,
    getImmediate,
    hydrate,
    persist,
    reset,
    retryPending,
  };
};
