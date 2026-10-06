import assert from 'node:assert/strict';
import {
  createDefaultTaskFilters,
  type AccountBoardTaskFilterScope,
  type TaskFilterPreferenceCache,
  type TaskFilterPreferenceMutation,
  type TaskFilterQuery,
} from '../src/features/taskFilters';
import {
  BOARD_TASK_FILTER_CACHE_STORAGE_KEY,
  BOARD_TASK_FILTER_PENDING_STORAGE_KEY,
  LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY,
  LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY,
  readTaskFilterPreferenceCache,
  readTaskFilterPreferencePending,
} from '../src/features/taskFilters/storage';
import { createTaskFilterPreferenceRepository, type TaskFilterPreferenceLocalAdapter, type TaskFilterPreferenceRemoteAdapter } from '../src/features/taskFilters/preferenceRepository';
import { getAccountBoardScopedStorageKey } from '../src/utils/accountScopedStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
const scope: AccountBoardTaskFilterScope = { accountId: 'account-a', boardId: 'board-a' };
const key = (base: string) => getAccountBoardScopedStorageKey(base, scope.accountId, scope.boardId);
const legacy: any = {
  version: 4,
  filters: {
    statusFilters: { todo: true, in_progress: false, delayed: false, completed: false, unsure: false, onhold: false },
    dueWithinDays: 7,
    overdueOnly: false,
    selectedAssigneeIds: ['user-a', '__unassigned__'],
    selectedTagIds: ['tag-a'],
    keyword: '  legacy  ',
  },
  updatedAt: 1,
};
storage.setItem(key(LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY), JSON.stringify(legacy));
storage.setItem(key(LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY), JSON.stringify({
  id: 'pending-1',
  version: 4,
  kind: 'upsert',
  filters: legacy.filters,
  updatedAt: 1,
}));
const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) }); }
};

await check('legacy cache and pending migrate to v5 and preserve semantics', () => {
  const cache = readTaskFilterPreferenceCache(scope);
  const pending = readTaskFilterPreferencePending(scope);
  assert.equal(cache?.version, 5);
  assert.equal(pending?.version, 5);
  assert.deepEqual(cache?.filters.people, { ids: ['user-a'], includeUnassigned: true });
  assert.equal(cache?.filters.due.upcomingWithinDays, 7);
  assert.equal(cache?.filters.keyword, 'legacy');
  assert.equal(storage.getItem(key(LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY)), null);
  assert.equal(storage.getItem(key(LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY)), null);
  assert.ok(storage.getItem(key(BOARD_TASK_FILTER_CACHE_STORAGE_KEY)));
  assert.ok(storage.getItem(key(BOARD_TASK_FILTER_PENDING_STORAGE_KEY)));
});

await check('newer remote version is fail-safe and does not write', async () => {
  let cachePresent = true;
  const local: TaskFilterPreferenceLocalAdapter = {
    readCache: () => cachePresent ? { version: 5, filters: createDefaultTaskFilters(), updatedAt: 1 } : null,
    writeCache: () => true,
    removeCache: () => { cachePresent = false; return true; },
    readPending: () => null,
    writePending: () => true,
    removePending: () => true,
  };
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => ({ accountId: scope.accountId, projectId: scope.boardId, preferenceVersion: 6, filters: {}, createdAt: '', updatedAt: '' }),
    compareAndSet: async () => { throw new Error('must not write'); },
    remove: async () => { throw new Error('must not delete'); },
  };
  const repository = createTaskFilterPreferenceRepository(remote, local);
  const result = await repository.hydrate(scope, () => true);
  assert.equal(result.syncStatus, 'sync-error');
  assert.match(result.warning ?? '', /版本較新/);
  const resetResult = await repository.reset(scope, () => true);
  assert.equal(resetResult.synced, false);
  assert.equal(cachePresent, true);
});

await check('CAS queue writes v5 with expected version and preserves pending readback', async () => {
  let version: number | null = null;
  let persisted: TaskFilterQuery = createDefaultTaskFilters();
  const local: TaskFilterPreferenceLocalAdapter = {
    readCache: () => null,
    writeCache: () => true,
    removeCache: () => true,
    readPending: () => null,
    writePending: () => true,
    removePending: () => true,
  };
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => version === null ? null : ({ accountId: scope.accountId, projectId: scope.boardId, preferenceVersion: version, filters: persisted, createdAt: '', updatedAt: '' }),
    compareAndSet: async (_a, _b, expected, filters) => {
      assert.equal(expected, version);
      if (expected !== null && expected !== version) throw new Error('TASK_FILTER_CAS_CONFLICT');
      persisted = filters;
      version = 5;
    },
    remove: async () => { version = null; },
  };
  const repository = createTaskFilterPreferenceRepository(remote, local);
  const result = await repository.persist(scope, { ...createDefaultTaskFilters(), keyword: 'v5' }, () => true);
  assert.equal((await result).synced, true);
  assert.equal(version, 5);
  assert.equal(persisted.keyword, 'v5');
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
