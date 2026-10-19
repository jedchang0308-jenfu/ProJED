import { createDefaultBoardTaskFilters } from './defaults';
import {
  BOARD_TASK_FILTER_PREFS_VERSION,
  decodePersistedTaskFilters,
  normalizeTaskFilters,
  readTaskFilterPreferenceCache,
  readTaskFilterPreferenceCacheState,
  readTaskFilterPreferencePending,
  readTaskFilterPreferencePendingState,
  removeTaskFilterPreferenceCache,
  removeTaskFilterPreferencePending,
  writeTaskFilterPreferenceCache,
  writeTaskFilterPreferencePending,
} from './storage';
import type {
  AccountBoardTaskFilterScope,
  TaskFilterPreferenceMutation,
  TaskFilterQuery,
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
  compareAndSet?: (
    accountId: string,
    boardId: string,
    expectedVersion: 4 | 5 | 6 | null,
    filters: TaskFilterQuery,
    expectedUpdatedAt?: string,
  ) => Promise<void>;
  upsert?: (accountId: string, boardId: string, filters: TaskFilterQuery) => Promise<void>;
  remove: (accountId: string, boardId: string, expectedVersion?: 6) => Promise<void>;
};

export type TaskFilterPreferenceLocalAdapter = {
  readCache: typeof readTaskFilterPreferenceCache;
  readCacheState: typeof readTaskFilterPreferenceCacheState;
  writeCache: typeof writeTaskFilterPreferenceCache;
  removeCache: typeof removeTaskFilterPreferenceCache;
  readPending: typeof readTaskFilterPreferencePending;
  readPendingState: typeof readTaskFilterPreferencePendingState;
  writePending: typeof writeTaskFilterPreferencePending;
  removePending: typeof removeTaskFilterPreferencePending;
};

export type TaskFilterHydrationResult = {
  filters: TaskFilterQuery;
  source: 'remote' | 'cache' | 'default' | 'local-only';
  hydrationStatus: 'ready' | 'fallback';
  syncStatus: 'synced' | 'sync-error';
  warning: string | null;
  remoteVersion: number | null;
  controlsLocked: boolean;
};

export type TaskFilterMutationResult = {
  synced: boolean;
  warning: string | null;
  controlsLocked?: boolean;
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
const LOCAL_SAVE_WARNING = '篩選偏好尚未儲存，請勿關閉頁面並重試';
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
    readCacheState: readTaskFilterPreferenceCacheState,
    writeCache: writeTaskFilterPreferenceCache,
    removeCache: removeTaskFilterPreferenceCache,
    readPending: readTaskFilterPreferencePending,
    readPendingState: readTaskFilterPreferencePendingState,
    writePending: writeTaskFilterPreferencePending,
    removePending: removeTaskFilterPreferencePending,
  },
) => {
  const queues = new Map<string, QueueState>();
  const blockedRemoteVersions = new Set<string>();
  const remoteVersions = new Map<string, number | null>();
  const volatilePending = new Map<string, TaskFilterPreferenceMutation>();

  const getImmediate = (scope: AccountBoardTaskFilterScope): TaskFilterQuery => (
    local.readCache(scope)?.filters ?? createDefaultBoardTaskFilters()
  );

  const acknowledge = (queued: QueuedMutation) => {
    const currentPending = local.readPending(queued.scope);
    if (currentPending?.id !== queued.mutation.id) return;
    local.removePending(queued.scope);
    if (queued.mutation.kind === 'delete') local.removeCache(queued.scope);
  };

  const readbackOutcome = async (queued: QueuedMutation): Promise<'confirmed' | 'mismatch' | 'blocked'> => {
    if (!queued.canSend()) return 'mismatch';
    const row = await remote.read(queued.scope.accountId, queued.scope.boardId);
    const key = scopeKey(queued.scope);
    remoteVersions.set(key, row?.preferenceVersion ?? null);
    if (!row) return queued.mutation.kind === 'delete' ? 'confirmed' : 'mismatch';
    const decoded = decodePersistedTaskFilters(row.filters, row.preferenceVersion);
    if (row.preferenceVersion !== 6 || decoded.kind !== 'valid') {
      blockedRemoteVersions.add(key);
      return 'blocked';
    }
    if (queued.mutation.kind === 'delete') return 'mismatch';
    return JSON.stringify(decoded.filters) === JSON.stringify(normalizeTaskFilters(queued.mutation.filters))
      ? 'confirmed'
      : 'mismatch';
  };

  const sendWithRetry = async (queued: QueuedMutation): Promise<TaskFilterMutationResult> => {
    const key = scopeKey(queued.scope);
    if (blockedRemoteVersions.has(key)) return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
    if (!queued.canSend()) return { synced: false, warning: SYNC_PENDING_WARNING };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (blockedRemoteVersions.has(key)) return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
        if (!queued.canSend()) return { synced: false, warning: SYNC_PENDING_WARNING };
        if (queued.mutation.kind === 'delete') {
          await remote.remove(queued.scope.accountId, queued.scope.boardId, BOARD_TASK_FILTER_PREFS_VERSION);
        } else {
          const expectedVersion = remoteVersions.has(key) ? remoteVersions.get(key) : null;
          const normalized = normalizeTaskFilters(queued.mutation.filters);
          if (remote.compareAndSet) {
            await remote.compareAndSet(
              queued.scope.accountId,
              queued.scope.boardId,
              expectedVersion === 4 || expectedVersion === 5 || expectedVersion === 6 ? expectedVersion : null,
              normalized,
            );
          } else if (remote.upsert) {
            await remote.upsert(queued.scope.accountId, queued.scope.boardId, normalized);
          } else {
            throw new Error('TASK_FILTER_CAS_UNSUPPORTED');
          }
          remoteVersions.set(key, BOARD_TASK_FILTER_PREFS_VERSION);
        }
        acknowledge(queued);
        return { synced: true, warning: null };
      } catch (error) {
        lastError = error;
        try {
          const outcome = await readbackOutcome(queued);
          if (outcome === 'blocked') return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
          if (outcome === 'confirmed') {
            acknowledge(queued);
            return { synced: true, warning: null };
          }
        } catch (readbackError) {
          console.warn('[taskFilterPreferenceRepository] mutation outcome is unknown:', readbackError);
          return { synced: false, warning: SYNC_PENDING_WARNING };
        }
        const message = error instanceof Error ? error.message : String(error);
        if (queued.mutation.kind === 'upsert' && message.startsWith('TASK_FILTER_CAS_CONFLICT:')) {
          const latest = await remote.read(queued.scope.accountId, queued.scope.boardId);
          const key = scopeKey(queued.scope);
          const latestVersion = latest?.preferenceVersion ?? null;
          remoteVersions.set(key, latestVersion);
          if (latest) {
            const decoded = decodePersistedTaskFilters(latest.filters, latestVersion);
            if (decoded.kind !== 'valid' || latestVersion !== 6) {
              blockedRemoteVersions.add(key);
              return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
            }
          }
          if (latestVersion !== null && latestVersion !== 4 && latestVersion !== 5 && latestVersion !== BOARD_TASK_FILTER_PREFS_VERSION) {
            blockedRemoteVersions.add(key);
            return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
          }
        }
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
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    }
    return enqueue({ scope, mutation, canSend });
  };

  const persist = (
    scope: AccountBoardTaskFilterScope,
    filters: TaskFilterQuery,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const normalized = normalizeTaskFilters(filters);
    const key = scopeKey(scope);
    const cacheState = local.readCacheState(scope);
    const pendingState = local.readPendingState(scope);
    if (cacheState.kind === 'locked' || pendingState.kind === 'locked') {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    }
    if (remote.enabled && blockedRemoteVersions.has(key)) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    }
    const mutation: TaskFilterPreferenceMutation = {
      id: createMutationId(),
      version: BOARD_TASK_FILTER_PREFS_VERSION,
      kind: 'upsert',
      filters: normalized,
      updatedAt: Date.now(),
    };
    const cacheWritten = local.writeCache(scope, normalized);
    if (!cacheWritten) {
      volatilePending.set(key, mutation);
      return Promise.resolve({ synced: false, warning: LOCAL_SAVE_WARNING });
    }
    if (!remote.enabled) {
      volatilePending.delete(key);
      return Promise.resolve({
        synced: cacheWritten,
        warning: cacheWritten ? null : SYNC_PENDING_WARNING,
      });
    }
    if (blockedRemoteVersions.has(scopeKey(scope))) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    }
    if (!local.writePending(scope, mutation)) {
      volatilePending.set(key, mutation);
      return Promise.resolve({ synced: false, warning: LOCAL_SAVE_WARNING });
    }
    volatilePending.delete(key);
    return queueMutation(scope, mutation, canSend);
  };

  const reset = (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const key = scopeKey(scope);
    const cacheState = local.readCacheState(scope);
    const pendingState = local.readPendingState(scope);
    if (cacheState.kind === 'locked' || pendingState.kind === 'locked') return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    const mutation: TaskFilterPreferenceMutation = {
      id: createMutationId(),
      version: BOARD_TASK_FILTER_PREFS_VERSION,
      kind: 'delete',
      updatedAt: Date.now(),
    };
    if (!remote.enabled) {
      const cacheRemoved = local.removeCache(scope);
      if (!cacheRemoved) volatilePending.set(key, mutation);
      else volatilePending.delete(key);
      return Promise.resolve({
        synced: cacheRemoved,
        warning: cacheRemoved ? null : LOCAL_SAVE_WARNING,
      });
    }
    if (blockedRemoteVersions.has(key)) {
      return Promise.resolve({ synced: false, warning: UPGRADE_WARNING, controlsLocked: true });
    }
    if (!local.writePending(scope, mutation)) {
      volatilePending.set(key, mutation);
      return Promise.resolve({ synced: false, warning: LOCAL_SAVE_WARNING });
    }
    volatilePending.delete(key);
    return queueMutation(scope, mutation, canSend);
  };

  const retryPending = async (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterMutationResult> => {
    const key = scopeKey(scope);
    const pendingState = local.readPendingState(scope);
    if (pendingState.kind === 'locked') return { synced: false, warning: pendingState.warning, controlsLocked: true };
    const volatile = volatilePending.get(key) ?? null;
    if (volatile) {
      if (volatile.kind === 'upsert' && !local.writeCache(scope, volatile.filters)) {
        return { synced: false, warning: LOCAL_SAVE_WARNING };
      }
      if (!remote.enabled) {
        const saved = volatile.kind === 'upsert' || local.removeCache(scope);
        if (saved) volatilePending.delete(key);
        return { synced: saved, warning: saved ? null : LOCAL_SAVE_WARNING };
      }
      if (blockedRemoteVersions.has(key)) return { synced: false, warning: UPGRADE_WARNING, controlsLocked: true };
      if (!local.writePending(scope, volatile)) return { synced: false, warning: LOCAL_SAVE_WARNING };
      volatilePending.delete(key);
      return queueMutation(scope, volatile, canSend);
    }
    const pending = pendingState.kind === 'valid' ? pendingState.value : null;
    if (!pending) return { synced: true, warning: null };
    return queueMutation(scope, pending, canSend);
  };

  const hydrate = async (
    scope: AccountBoardTaskFilterScope,
    canSend: () => boolean,
  ): Promise<TaskFilterHydrationResult> => {
    const cachedState = local.readCacheState(scope);
    const pendingState = local.readPendingState(scope);
    const cached = cachedState.kind === 'valid' ? cachedState.value : null;
    const fallbackFilters = cached?.filters ?? createDefaultBoardTaskFilters();
    if (cachedState.kind === 'locked' || pendingState.kind === 'locked') {
      return {
        filters: fallbackFilters,
        source: cached ? 'cache' : 'default',
        hydrationStatus: 'fallback',
        syncStatus: 'sync-error',
        warning: cachedState.kind === 'locked' ? cachedState.warning : pendingState.kind === 'locked' ? pendingState.warning : UPGRADE_WARNING,
        remoteVersion: null,
        controlsLocked: true,
      };
    }
    if (!remote.enabled) {
      return {
        filters: fallbackFilters,
        source: cached ? 'local-only' : 'default',
        hydrationStatus: 'ready',
        syncStatus: 'synced',
        warning: null,
        remoteVersion: null,
        controlsLocked: false,
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
        controlsLocked: !cached,
      };
    }

    try {
      // Always inspect the remote version before replaying the local journal.
      let initialRow = await remote.read(scope.accountId, scope.boardId);
      for (let attempt = 0; initialRow && initialRow.preferenceVersion !== 6 && attempt < 3; attempt += 1) {
        const decoded = decodePersistedTaskFilters(initialRow.filters, initialRow.preferenceVersion);
        if (decoded.kind !== 'valid') {
          blockedRemoteVersions.add(scopeKey(scope));
          return { filters: fallbackFilters, source: cached ? 'cache' : 'default', hydrationStatus: 'fallback', syncStatus: 'sync-error', warning: UPGRADE_WARNING, remoteVersion: initialRow.preferenceVersion, controlsLocked: true };
        }
        if (!canSend() || !remote.compareAndSet) throw new Error('TASK_FILTER_CAS_UNSUPPORTED');
        try {
          await remote.compareAndSet(scope.accountId, scope.boardId, decoded.version, decoded.filters, initialRow.updatedAt);
        } catch {
          // Another client may have changed the old row. Re-read and convert
          // the latest value instead of overwriting it with a stale snapshot.
        }
        initialRow = await remote.read(scope.accountId, scope.boardId);
      }
      if (initialRow && initialRow.preferenceVersion !== 6) {
        blockedRemoteVersions.add(scopeKey(scope));
        return { filters: fallbackFilters, source: cached ? 'cache' : 'default', hydrationStatus: 'fallback', syncStatus: 'sync-error', warning: UPGRADE_WARNING, remoteVersion: initialRow.preferenceVersion, controlsLocked: true };
      }
      if (initialRow) {
        const initialDecoded = decodePersistedTaskFilters(initialRow.filters, initialRow.preferenceVersion);
        if (initialDecoded.kind !== 'valid' || initialDecoded.version !== 6) {
          blockedRemoteVersions.add(scopeKey(scope));
          return { filters: fallbackFilters, source: cached ? 'cache' : 'default', hydrationStatus: 'fallback', syncStatus: 'sync-error', warning: UPGRADE_WARNING, remoteVersion: initialRow.preferenceVersion, controlsLocked: true };
        }
      }
      remoteVersions.set(scopeKey(scope), initialRow?.preferenceVersion ?? null);
      blockedRemoteVersions.delete(scopeKey(scope));

      const pending = local.readPending(scope);
      if (pending || volatilePending.has(scopeKey(scope))) {
        const retryResult = await retryPending(scope, canSend);
        if (!retryResult.synced) {
          const controlsLocked = blockedRemoteVersions.has(scopeKey(scope));
          return {
            filters: fallbackFilters,
            source: cached ? 'cache' : 'default',
            hydrationStatus: 'fallback',
            syncStatus: 'sync-error',
            warning: retryResult.warning,
            remoteVersion: initialRow?.preferenceVersion ?? null,
            controlsLocked,
          };
        }
      }

      // Read again after replay so delete/upsert results, including concurrent
      // same-version last-write-wins commits, become the hydrate authority.
      const row = await remote.read(scope.accountId, scope.boardId);
      if (!row) {
        blockedRemoteVersions.delete(scopeKey(scope));
        remoteVersions.set(scopeKey(scope), null);
        local.removeCache(scope);
        return {
          filters: createDefaultBoardTaskFilters(),
          source: 'default',
          hydrationStatus: 'ready',
          syncStatus: 'synced',
          warning: null,
          remoteVersion: null,
          controlsLocked: false,
        };
      }
      const decoded = decodePersistedTaskFilters(row.filters, row.preferenceVersion);
      if (decoded.kind !== 'valid' || row.preferenceVersion !== 6) {
        blockedRemoteVersions.add(scopeKey(scope));
        return {
          filters: fallbackFilters,
          source: cached ? 'cache' : 'default',
          hydrationStatus: 'fallback',
          syncStatus: 'sync-error',
          warning: UPGRADE_WARNING,
          remoteVersion: row.preferenceVersion,
          controlsLocked: true,
        };
      }
      blockedRemoteVersions.delete(scopeKey(scope));
      const filters = decoded.filters;
      remoteVersions.set(scopeKey(scope), row.preferenceVersion);
      const cacheWritten = local.writeCache(scope, filters);
      return {
        filters,
        source: 'remote',
        hydrationStatus: 'ready',
        syncStatus: cacheWritten ? 'synced' : 'sync-error',
        warning: cacheWritten ? null : SYNC_PENDING_WARNING,
        remoteVersion: row.preferenceVersion,
        controlsLocked: false,
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
        controlsLocked: !cached,
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
