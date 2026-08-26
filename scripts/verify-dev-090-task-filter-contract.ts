import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countActiveTaskFilters,
  createDefaultTaskFilters,
} from '../src/features/taskFilters/index';
import {
  createTaskFilterPreferenceRepository,
  type TaskFilterPreferenceLocalAdapter,
  type TaskFilterPreferenceRemoteAdapter,
  type TaskFilterPreferenceRemoteRow,
} from '../src/features/taskFilters/preferenceRepository';
import type {
  AccountBoardTaskFilterScope,
  TaskFilterPreferenceCache,
  TaskFilterPreferenceMutation,
  TaskFilterState,
} from '../src/features/taskFilters/types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const browserStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage: browserStorage },
});

const storage = await import('../src/features/taskFilters/storage');
const workbenchStorage = await import('../src/features/taskWorkbench/preferences');
const accountStorage = await import('../src/utils/accountScopedStorage');

const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = async (name: string, run: () => void | Promise<void>) => {
  try {
    await run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) });
  }
};

const scopeKey = (scope: AccountBoardTaskFilterScope) => `${scope.accountId}\u0000${scope.boardId}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const filteredState = (keyword: string): TaskFilterState => ({
  ...createDefaultTaskFilters(),
  statusFilters: { ...createDefaultTaskFilters().statusFilters, completed: false },
  selectedAssigneeIds: ['member-a'],
  selectedTagIds: ['tag-a'],
  keyword,
});

const createMemoryLocal = () => {
  const caches = new Map<string, TaskFilterPreferenceCache>();
  const pending = new Map<string, TaskFilterPreferenceMutation>();
  const adapter: TaskFilterPreferenceLocalAdapter = {
    readCache: scope => clone(caches.get(scopeKey(scope)) ?? null),
    writeCache: (scope, filters) => {
      caches.set(scopeKey(scope), { version: 4, filters: clone(filters), updatedAt: Date.now() });
      return true;
    },
    removeCache: scope => {
      caches.delete(scopeKey(scope));
      return true;
    },
    readPending: scope => clone(pending.get(scopeKey(scope)) ?? null),
    writePending: (scope, mutation) => {
      pending.set(scopeKey(scope), clone(mutation));
      return true;
    },
    removePending: scope => {
      pending.delete(scopeKey(scope));
      return true;
    },
  };
  return { adapter, caches, pending };
};

const toRemoteRow = (
  scope: AccountBoardTaskFilterScope,
  filters: TaskFilterState,
  preferenceVersion = 4,
): TaskFilterPreferenceRemoteRow => ({
  accountId: scope.accountId,
  projectId: scope.boardId,
  preferenceVersion,
  filters: clone(filters),
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date().toISOString(),
});

await check('S01 default and reset source show every status with zero active filters', () => {
  const defaults = createDefaultTaskFilters();
  assert.deepEqual(defaults.statusFilters, {
    todo: true,
    in_progress: true,
    delayed: true,
    completed: true,
    unsure: true,
    onhold: true,
  });
  assert.equal(defaults.dueWithinDays, null);
  assert.equal(defaults.overdueOnly, false);
  assert.deepEqual(defaults.selectedAssigneeIds, []);
  assert.deepEqual(defaults.selectedTagIds, []);
  assert.equal(defaults.keyword, '');
  assert.equal(countActiveTaskFilters(defaults), 0);
});

await check('S01 normalization fills status keys, clamps dates, trims and deduplicates', () => {
  const normalized = storage.normalizeTaskFilters({
    statusFilters: { todo: false } as TaskFilterState['statusFilters'],
    dueWithinDays: 900,
    selectedAssigneeIds: ['a', 'a', ''],
    selectedTagIds: ['t', 't'],
    keyword: '  鉦富  ',
  });
  assert.equal(normalized.statusFilters.todo, false);
  assert.equal(normalized.statusFilters.completed, true);
  assert.equal(normalized.dueWithinDays, 365);
  assert.deepEqual(normalized.selectedAssigneeIds, ['a']);
  assert.deepEqual(normalized.selectedTagIds, ['t']);
  assert.equal(normalized.keyword, '鉦富');
});

await check('S02 board v1-v3 migration preserves display only and is idempotent', () => {
  browserStorage.clear();
  const accountId = 'account-a';
  const scopedLegacy = accountStorage.getAccountScopedStorageKey(
    storage.ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY,
    accountId,
  );
  assert.ok(scopedLegacy);
  browserStorage.setItem(scopedLegacy, JSON.stringify({
    version: 3,
    filters: filteredState('legacy must be discarded'),
    displaySettings: {
      showDependencies: false,
      showStartDate: false,
      showTags: true,
      showTagNames: false,
    },
  }));
  assert.equal(storage.migrateLegacyBoardTaskFilterPrefs(accountId), true);
  assert.deepEqual(storage.readBoardTaskDisplaySettings(accountId), {
    showDependencies: false,
    showStartDate: false,
    showTags: true,
    showTagNames: false,
  });
  assert.equal(browserStorage.getItem(scopedLegacy), null);
  assert.deepEqual(storage.readBoardTaskFilterPrefs(accountId).filters, createDefaultTaskFilters());
  const snapshot = Array.from({ length: browserStorage.length }, (_, index) => {
    const key = browserStorage.key(index)!;
    return [key, browserStorage.getItem(key)];
  });
  assert.equal(storage.migrateLegacyBoardTaskFilterPrefs(accountId), true);
  assert.deepEqual(Array.from({ length: browserStorage.length }, (_, index) => {
    const key = browserStorage.key(index)!;
    return [key, browserStorage.getItem(key)];
  }), snapshot);
});

await check('S02 workbench v1-v3 migration preserves selected board and clears filter map', () => {
  browserStorage.clear();
  const accountId = 'account-a';
  const legacyKey = accountStorage.getAccountScopedStorageKey(
    workbenchStorage.LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY,
    accountId,
  );
  assert.ok(legacyKey);
  browserStorage.setItem(legacyKey, JSON.stringify({
    selectedBoardId: 'board-preserved',
    filtersByBoardId: { 'board-preserved': filteredState('discard') },
  }));
  const migrated = workbenchStorage.readTaskWorkbenchFilterPrefs(accountId);
  assert.equal(migrated.selectedBoardId, 'board-preserved');
  assert.deepEqual(migrated.filtersByBoardId, {});
  assert.equal(browserStorage.getItem(legacyKey), null);
  const currentKey = accountStorage.getAccountScopedStorageKey(
    workbenchStorage.TASK_WORKBENCH_FILTER_PREFS_KEY,
    accountId,
  );
  const current = JSON.parse(browserStorage.getItem(currentKey!)!);
  assert.equal(current.version, 4);
  assert.deepEqual(current.filtersByBoardId, {});
});

await check('S03 remote row absence is authoritative default and clears exact stale cache', async () => {
  const scope = { accountId: 'a', boardId: 'board-1' };
  const local = createMemoryLocal();
  local.adapter.writeCache(scope, filteredState('stale'));
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => null,
    upsert: async () => undefined,
    remove: async () => undefined,
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const hydrated = await repository.hydrate(scope, () => true);
  assert.equal(hydrated.source, 'default');
  assert.deepEqual(hydrated.filters, createDefaultTaskFilters());
  assert.equal(local.adapter.readCache(scope), null);
});

await check('S03 pending write replays only after a compatible remote version check', async () => {
  const scope = { accountId: 'a', boardId: 'board-1' };
  const local = createMemoryLocal();
  const pendingFilters = filteredState('pending-wins');
  local.adapter.writeCache(scope, pendingFilters);
  local.adapter.writePending(scope, {
    id: 'pending-1', version: 4, kind: 'upsert', filters: pendingFilters, updatedAt: 1,
  });
  let remoteFilters = createDefaultTaskFilters();
  const calls: string[] = [];
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => {
      calls.push('read');
      return toRemoteRow(scope, remoteFilters);
    },
    upsert: async (_accountId, _boardId, filters) => {
      calls.push('upsert');
      remoteFilters = clone(filters);
    },
    remove: async () => undefined,
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const hydrated = await repository.hydrate(scope, () => true);
  assert.deepEqual(calls, ['read', 'upsert', 'read']);
  assert.equal(hydrated.filters.keyword, 'pending-wins');
  assert.equal(local.adapter.readPending(scope), null);
});

await check('S03/S07 newer remote versions block pending, reset and later writes', async () => {
  const scope = { accountId: 'a', boardId: 'board-1' };
  const local = createMemoryLocal();
  local.adapter.writeCache(scope, filteredState('local-safe'));
  local.adapter.writePending(scope, {
    id: 'old-pending', version: 4, kind: 'upsert', filters: filteredState('old'), updatedAt: 1,
  });
  let writes = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => toRemoteRow(scope, filteredState('future'), 5),
    upsert: async () => { writes += 1; },
    remove: async () => { writes += 1; },
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const hydrated = await repository.hydrate(scope, () => true);
  assert.equal(hydrated.remoteVersion, 5);
  assert.match(hydrated.warning ?? '', /版本較新/);
  assert.equal(writes, 0);
  assert.equal((await repository.persist(scope, filteredState('do-not-send'), () => true)).synced, false);
  assert.equal((await repository.reset(scope, () => true)).synced, false);
  assert.equal(writes, 0);
});

await check('S03 remote read failure uses exact cache and never another scope', async () => {
  const scopeA = { accountId: 'a', boardId: 'board-1' };
  const scopeB = { accountId: 'a', boardId: 'board-2' };
  const local = createMemoryLocal();
  local.adapter.writeCache(scopeA, filteredState('scope-a'));
  local.adapter.writeCache(scopeB, filteredState('scope-b'));
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => { throw new Error('offline'); },
    upsert: async () => undefined,
    remove: async () => undefined,
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const originalWarn = console.warn;
  console.warn = () => undefined;
  const result = await repository.hydrate(scopeB, () => true).finally(() => {
    console.warn = originalWarn;
  });
  assert.equal(result.filters.keyword, 'scope-b');
  assert.equal(result.source, 'cache');
  assert.match(result.warning ?? '', /此裝置設定/);
});

await check('S07 scope-keyed coalescing commits the last complete object', async () => {
  const scope = { accountId: 'a', boardId: 'board-1' };
  const local = createMemoryLocal();
  const committed: TaskFilterState[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  let call = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => null,
    upsert: async (_accountId, _boardId, filters) => {
      call += 1;
      if (call === 1) await firstGate;
      committed.push(clone(filters));
    },
    remove: async () => undefined,
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const first = repository.persist(scope, filteredState('first'), () => true);
  const second = repository.persist(scope, filteredState('second'), () => true);
  const third = repository.persist(scope, filteredState('last'), () => true);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.equal(committed.at(-1)?.keyword, 'last');
  assert.equal(committed.some(filters => filters.keyword === 'second'), false);
  assert.equal(local.adapter.readPending(scope), null);
});

await check('S06/S04 source ownership and consumer boundaries are singular', () => {
  const read = (path: string) => readFileSync(resolve(path), 'utf8');
  const boardStore = read('src/store/useBoardStore.ts');
  const tagStore = read('src/store/useTagStore.ts');
  const service = read('src/services/supabase/taskFilterPreferenceService.ts');
  const migration = read('supabase/migrations/20260826104321_dev_090_account_board_task_filter_preferences.sql');
  const consumers = [
    'src/components/BoardView.tsx',
    'src/components/Wbs/WbsListView.tsx',
    'src/components/MindMap/MindMapView.tsx',
    'src/components/GanttView.tsx',
    'src/components/CalendarView.tsx',
  ].map(read);
  assert.equal(/statusFilters|dueWithinDays|overdueOnly|selectedAssigneeIds/.test(boardStore), false);
  assert.equal(/selectedTagIds|toggleTagFilter|clearTagFilters/.test(tagStore), false);
  consumers.forEach(source => {
    assert.match(source, /useTaskFilterStore/);
    assert.match(source, /projectTaskFilterResults/);
    assert.equal(source.includes('matchesTaskFilters'), false);
  });
  assert.equal(service.includes('ui_preferences'), false);
  assert.equal(migration.toLowerCase().includes('publication'), false);
  assert.equal(migration.toLowerCase().includes('create function'), false);
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
