import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDefaultTaskFilters,
  createDefaultTaskFiltersV5,
  decodePersistedTaskFilters,
  normalizePersistedTaskFiltersV5,
  resolveScopedTaskFilterOptionStatus,
  type AccountBoardTaskFilterScope,
  type LegacyTaskFilterQueryV5,
  type TaskFilterPreferenceCache,
  type TaskFilterPreferenceMutation,
  type TaskFilterQuery,
} from '../src/features/taskFilters';
import { materializeCalendarBoardFilters } from '../src/features/calendarSubscriptions/filters';
import {
  BOARD_TASK_FILTER_CACHE_STORAGE_KEY,
  BOARD_TASK_FILTER_PENDING_STORAGE_KEY,
  LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY,
  LEGACY_BOARD_TASK_FILTER_PENDING_V5_STORAGE_KEY,
  readTaskFilterPreferenceCache,
  readTaskFilterPreferenceCacheState,
  readTaskFilterPreferencePending,
} from '../src/features/taskFilters/storage';
import {
  createTaskFilterPreferenceRepository,
  type TaskFilterPreferenceLocalAdapter,
  type TaskFilterPreferenceRemoteAdapter,
  type TaskFilterPreferenceRemoteRow,
} from '../src/features/taskFilters/preferenceRepository';
import { getAccountBoardScopedStorageKey } from '../src/utils/accountScopedStorage';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const scope: AccountBoardTaskFilterScope = { accountId: 'account-a', boardId: 'board-a' };
const scopeKey = (value: AccountBoardTaskFilterScope) => `${value.accountId}\u0000${value.boardId}`;
const storageKey = (base: string, value = scope) => getAccountBoardScopedStorageKey(base, value.accountId, value.boardId)!;
const selectedV6 = (keyword: string): TaskFilterQuery => ({
  ...createDefaultTaskFilters(),
  statuses: { mode: 'selected', values: ['todo'] },
  people: { mode: 'selected', ids: [], includeUnassigned: true },
  tags: { mode: 'selected', ids: [], includeUntagged: true },
  keyword,
});
const selectedV5 = (keyword: string, due: LegacyTaskFilterQueryV5['due'] = { includeOverdue: true, upcomingWithinDays: 7 }): LegacyTaskFilterQueryV5 => ({
  ...createDefaultTaskFiltersV5(),
  statuses: ['todo'],
  due,
  people: { ids: ['user-a'], includeUnassigned: true },
  tagIds: ['tag-a'],
  keyword,
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failWriteKey: string | null = null;
  get length() { return this.values.size; }
  clear() { this.values.clear(); this.failWriteKey = null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (key === this.failWriteKey) throw new Error('simulated quota failure');
    this.values.set(key, String(value));
  }
}

const browserStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: browserStorage } });

const createMemoryLocal = () => {
  const caches = new Map<string, TaskFilterPreferenceCache>();
  const pending = new Map<string, TaskFilterPreferenceMutation>();
  const locked = new Set<string>();
  const adapter: TaskFilterPreferenceLocalAdapter = {
    readCache: current => clone(caches.get(scopeKey(current)) ?? null),
    readCacheState: current => locked.has(scopeKey(current))
      ? { kind: 'locked', warning: '篩選偏好版本無法支援', raw: { version: 7 } }
      : caches.has(scopeKey(current))
        ? { kind: 'valid', value: clone(caches.get(scopeKey(current))!), warning: null }
        : { kind: 'missing' },
    writeCache: (current, filters) => {
      caches.set(scopeKey(current), { version: 6, filters: clone(filters), updatedAt: Date.now() });
      return true;
    },
    removeCache: current => { caches.delete(scopeKey(current)); return true; },
    readPending: current => clone(pending.get(scopeKey(current)) ?? null),
    readPendingState: current => pending.has(scopeKey(current))
      ? { kind: 'valid', value: clone(pending.get(scopeKey(current))!), warning: null }
      : { kind: 'missing' },
    writePending: (current, mutation) => { pending.set(scopeKey(current), clone(mutation)); return true; },
    removePending: current => { pending.delete(scopeKey(current)); return true; },
  };
  return { adapter, caches, pending, locked };
};

const row = (filters: unknown, preferenceVersion: number, updatedAt = '2026-10-19T01:00:00.000Z'): TaskFilterPreferenceRemoteRow => ({
  accountId: scope.accountId,
  projectId: scope.boardId,
  preferenceVersion,
  filters: clone(filters),
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt,
});

const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) }); }
};

await check('decoder distinguishes missing, valid V4/V5/V6, invalid and unsupported without guessing', () => {
  assert.deepEqual(decodePersistedTaskFilters(null, null), { kind: 'missing' });
  const v4 = decodePersistedTaskFilters({
    statusFilters: { todo: true, completed: false },
    dueWithinDays: 7,
    overdueOnly: false,
    selectedAssigneeIds: ['user-a', '__unassigned__'],
    selectedTagIds: ['tag-a'],
    keyword: ' legacy ',
  }, 4);
  assert.equal(v4.kind, 'valid');
  if (v4.kind === 'valid') {
    assert.equal(v4.version, 4);
    assert.deepEqual(v4.sourceFilters?.due, { includeOverdue: true, upcomingWithinDays: 7 });
    assert.equal(v4.filters.due.mode, 'legacy-v5');
  }
  const v5 = decodePersistedTaskFilters(selectedV5('v5'), 5);
  assert.equal(v5.kind, 'valid');
  if (v5.kind === 'valid') {
    assert.equal(v5.version, 5);
    assert.deepEqual(v5.sourceFilters, selectedV5('v5'));
    assert.equal(v5.filters.keyword, 'v5');
  }
  assert.equal(decodePersistedTaskFilters(selectedV6('v6'), 6).kind, 'valid');
  assert.equal(decodePersistedTaskFilters({ ...selectedV6('bad'), extra: true }, 6).kind, 'invalid');
  assert.equal(decodePersistedTaskFilters({ ...selectedV6('bad'), version: 5 }, 6).kind, 'invalid');
  assert.equal(decodePersistedTaskFilters(selectedV6('future'), 7).kind, 'unsupported');
  assert.equal(decodePersistedTaskFilters(selectedV6('unknown'), null).kind, 'unsupported');
});

await check('Calendar V5 boundary preserves valid V5 and rejects V6 in global, snapshot and override paths', () => {
  assert.deepEqual(normalizePersistedTaskFiltersV5(selectedV5('calendar-v5')), selectedV5('calendar-v5'));
  assert.throws(() => normalizePersistedTaskFiltersV5(selectedV6('not-calendar')), /INVALID_LEGACY_TASK_FILTER_V5/);
  const boards = [{ id: 'board-a', workspaceId: 'workspace-a' }];
  const expectReject = (filters: unknown) => assert.throws(
    () => materializeCalendarBoardFilters(boards, filters as never, 'account-a'),
    /INVALID_LEGACY_TASK_FILTER_V5/,
  );
  expectReject({ version: 1, scope_type: 'workspace', workspace_ids: ['workspace-a'], global_filter: selectedV6('global') });
  expectReject({
    version: 4,
    v4_scope_type: 'per_board_filter_snapshot',
    board_filters: { 'board-a': { included: true, date_types: ['due_date'], filters: selectedV6('snapshot') } },
  });
  expectReject({
    version: 2,
    v2_scope_type: 'all_accessible_boards_snapshot',
    project_ids: ['board-a'],
    global_filter: selectedV5('fallback'),
    board_overrides: { 'board-a': { enabled: true, ...selectedV6('override') } },
  });
});

await check('V5 empty means dynamic all while explicit snapshots and legacy dates remain explicit', () => {
  const empty = decodePersistedTaskFilters(createDefaultTaskFiltersV5(), 5);
  assert.equal(empty.kind, 'valid');
  if (empty.kind === 'valid') {
    assert.equal(empty.filters.statuses.mode, 'all');
    assert.equal(empty.filters.due.mode, 'all');
    assert.equal(empty.filters.people.mode, 'all');
    assert.equal(empty.filters.tags.mode, 'all');
  }
  const explicit = decodePersistedTaskFilters(selectedV5('snapshot', { includeOverdue: false, upcomingWithinDays: 8 }), 5);
  assert.equal(explicit.kind, 'valid');
  if (explicit.kind === 'valid') {
    assert.deepEqual(explicit.filters.statuses, { mode: 'selected', values: ['todo'] });
    assert.deepEqual(explicit.filters.people, { mode: 'selected', ids: ['user-a'], includeUnassigned: true });
    assert.deepEqual(explicit.filters.tags, { mode: 'selected', ids: ['tag-a'], includeUntagged: false });
    assert.deepEqual(explicit.filters.due, { mode: 'legacy-v5', includeOverdue: false, upcomingWithinDays: 8 });
  }
});

await check('legacy V5 cache and pending upsert migrate only after V6 readback and then remove their source', () => {
  browserStorage.clear();
  const legacyCacheKey = storageKey(LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY);
  const legacyPendingKey = storageKey(LEGACY_BOARD_TASK_FILTER_PENDING_V5_STORAGE_KEY);
  browserStorage.setItem(legacyCacheKey, JSON.stringify({ version: 5, filters: selectedV5('cache'), updatedAt: 1 }));
  browserStorage.setItem(legacyPendingKey, JSON.stringify({ id: 'pending-v5', version: 5, kind: 'upsert', filters: selectedV5('pending'), updatedAt: 2 }));
  const cache = readTaskFilterPreferenceCache(scope);
  const pending = readTaskFilterPreferencePending(scope);
  assert.equal(cache?.version, 6);
  assert.equal(cache?.filters.keyword, 'cache');
  assert.equal(pending?.version, 6);
  assert.equal(pending?.kind, 'upsert');
  assert.equal(pending?.filters?.keyword, 'pending');
  assert.ok(browserStorage.getItem(storageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY)));
  assert.ok(browserStorage.getItem(storageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY)));
  assert.equal(browserStorage.getItem(legacyCacheKey), null);
  assert.equal(browserStorage.getItem(legacyPendingKey), null);
});

await check('legacy delete journal stays delete and a failed V6 write preserves the legacy source', () => {
  browserStorage.clear();
  const legacyPendingKey = storageKey(LEGACY_BOARD_TASK_FILTER_PENDING_V5_STORAGE_KEY);
  browserStorage.setItem(legacyPendingKey, JSON.stringify({ id: 'delete-v5', version: 5, kind: 'delete', updatedAt: 3 }));
  assert.deepEqual(readTaskFilterPreferencePending(scope), { id: 'delete-v5', version: 6, kind: 'delete', updatedAt: 3 });
  assert.equal(browserStorage.getItem(legacyPendingKey), null);

  browserStorage.clear();
  const legacyCacheKey = storageKey(LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY);
  const currentCacheKey = storageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY);
  browserStorage.setItem(legacyCacheKey, JSON.stringify({ version: 5, filters: selectedV5('retain-me'), updatedAt: 4 }));
  browserStorage.failWriteKey = currentCacheKey;
  const state = readTaskFilterPreferenceCacheState(scope);
  assert.equal(state.kind, 'valid');
  if (state.kind === 'valid') assert.match(state.warning ?? '', /尚未儲存/);
  assert.ok(browserStorage.getItem(legacyCacheKey));
  assert.equal(browserStorage.getItem(currentCacheKey), null);
});

await check('unknown current local version locks controls and preserves both current and legacy bytes', () => {
  browserStorage.clear();
  const currentKey = storageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY);
  const legacyKey = storageKey(LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY);
  const currentRaw = JSON.stringify({ version: 7, filters: { future: true }, updatedAt: 5 });
  const legacyRaw = JSON.stringify({ version: 5, filters: selectedV5('must-not-restore'), updatedAt: 4 });
  browserStorage.setItem(currentKey, currentRaw);
  browserStorage.setItem(legacyKey, legacyRaw);
  const state = readTaskFilterPreferenceCacheState(scope);
  assert.equal(state.kind, 'locked');
  assert.equal(browserStorage.getItem(currentKey), currentRaw);
  assert.equal(browserStorage.getItem(legacyKey), legacyRaw);
  assert.equal(browserStorage.getItem(storageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY)), null);
});

await check('current V6 delete journal rejects mixed or unknown envelope fields without remote delete', async () => {
  for (const invalidDelete of [
    { id: 'mixed-delete', version: 6, kind: 'delete', filters: selectedV5('must-not-coerce'), updatedAt: 6 },
    { id: 'unknown-delete', version: 6, kind: 'delete', unexpected: true, updatedAt: 7 },
  ]) {
    browserStorage.clear();
    const pendingKey = storageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY);
    const raw = JSON.stringify(invalidDelete);
    browserStorage.setItem(pendingKey, raw);
    let deletes = 0;
    const remote: TaskFilterPreferenceRemoteAdapter = {
      enabled: true,
      read: async () => null,
      compareAndSet: async () => undefined,
      remove: async () => { deletes += 1; },
    };
    const repository = createTaskFilterPreferenceRepository(remote);
    const hydrated = await repository.hydrate(scope, () => true);
    assert.equal(hydrated.controlsLocked, true, invalidDelete.id);
    const retried = await repository.retryPending(scope, () => true);
    assert.equal(retried.synced, false, invalidDelete.id);
    assert.equal(retried.controlsLocked, true, invalidDelete.id);
    assert.equal(deletes, 0, invalidDelete.id);
    assert.equal(browserStorage.getItem(pendingKey), raw, invalidDelete.id);
  }
});

await check('remote V5 upgrade CAS binds both old version and updated_at before accepting V6 readback', async () => {
  const local = createMemoryLocal();
  let remoteRow: TaskFilterPreferenceRemoteRow | null = row(selectedV5('remote-old'), 5, 'old-etag');
  const calls: Array<{ version: number | null; updatedAt?: string }> = [];
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => clone(remoteRow),
    compareAndSet: async (_accountId, _boardId, expectedVersion, filters, expectedUpdatedAt) => {
      calls.push({ version: expectedVersion, updatedAt: expectedUpdatedAt });
      assert.equal(expectedVersion, 5);
      assert.equal(expectedUpdatedAt, 'old-etag');
      remoteRow = row(filters, 6, 'new-etag');
    },
    remove: async () => undefined,
  };
  const hydrated = await createTaskFilterPreferenceRepository(remote, local.adapter).hydrate(scope, () => true);
  assert.deepEqual(calls, [{ version: 5, updatedAt: 'old-etag' }]);
  assert.equal(hydrated.remoteVersion, 6);
  assert.equal(hydrated.filters.keyword, 'remote-old');
  assert.equal(hydrated.filters.due.mode, 'legacy-v5');
  assert.equal(local.adapter.readCache(scope)?.version, 6);
});

await check('V5 CAS conflict rereads and converts the latest old row rather than overwriting it', async () => {
  const local = createMemoryLocal();
  let remoteRow: TaskFilterPreferenceRemoteRow | null = row(selectedV5('stale'), 5, 'etag-1');
  let casCalls = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => clone(remoteRow),
    compareAndSet: async (_accountId, _boardId, expectedVersion, filters, expectedUpdatedAt) => {
      casCalls += 1;
      if (casCalls === 1) {
        assert.equal(expectedUpdatedAt, 'etag-1');
        remoteRow = row(selectedV5('concurrent-winner'), 5, 'etag-2');
        throw new Error('TASK_FILTER_CAS_CONFLICT:stale');
      }
      assert.equal(expectedVersion, 5);
      assert.equal(expectedUpdatedAt, 'etag-2');
      remoteRow = row(filters, 6, 'etag-3');
    },
    remove: async () => undefined,
  };
  const hydrated = await createTaskFilterPreferenceRepository(remote, local.adapter).hydrate(scope, () => true);
  assert.equal(casCalls, 2);
  assert.equal(hydrated.filters.keyword, 'concurrent-winner');
  assert.equal(hydrated.remoteVersion, 6);
});

await check('unsupported remote version blocks pending replay, persist and reset without writes', async () => {
  const local = createMemoryLocal();
  local.adapter.writeCache(scope, selectedV6('safe-cache'));
  local.adapter.writePending(scope, { id: 'pending', version: 6, kind: 'upsert', filters: selectedV6('do-not-send'), updatedAt: 1 });
  let writes = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => row({ future: true }, 7),
    compareAndSet: async () => { writes += 1; },
    remove: async () => { writes += 1; },
  };
  const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
  const hydrated = await repository.hydrate(scope, () => true);
  assert.equal(hydrated.controlsLocked, true);
  assert.equal(hydrated.filters.keyword, 'safe-cache');
  assert.match(hydrated.warning ?? '', /版本較新/);
  assert.equal((await repository.persist(scope, selectedV6('blocked'), () => true)).synced, false);
  assert.equal((await repository.reset(scope, () => true)).synced, false);
  assert.equal(writes, 0);
  assert.equal(local.adapter.readPending(scope)?.id, 'pending');
});

await check('initial invalid V6 row blocks a valid pending journal before any remote write', async () => {
  const local = createMemoryLocal();
  local.adapter.writeCache(scope, selectedV6('safe-invalid-cache'));
  local.adapter.writePending(scope, { id: 'valid-pending', version: 6, kind: 'upsert', filters: selectedV6('must-stay-pending'), updatedAt: 1 });
  let writes = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => row({ ...selectedV6('invalid'), unexpected: true }, 6),
    compareAndSet: async () => { writes += 1; },
    remove: async () => { writes += 1; },
  };
  const hydrated = await createTaskFilterPreferenceRepository(remote, local.adapter).hydrate(scope, () => true);
  assert.equal(hydrated.controlsLocked, true);
  assert.equal(hydrated.filters.keyword, 'safe-invalid-cache');
  assert.equal(writes, 0);
  assert.equal(local.adapter.readPending(scope)?.id, 'valid-pending');
});

await check('write outcome unknown uses remote readback to acknowledge the exact pending value', async () => {
  const local = createMemoryLocal();
  let remoteRow: TaskFilterPreferenceRemoteRow | null = null;
  let writes = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => clone(remoteRow),
    compareAndSet: async (_accountId, _boardId, _expectedVersion, filters) => {
      writes += 1;
      remoteRow = row(filters, 6, 'readback-etag');
      throw new Error('network outcome unknown');
    },
    remove: async () => undefined,
  };
  const result = await createTaskFilterPreferenceRepository(remote, local.adapter)
    .persist(scope, selectedV6('confirmed-by-readback'), () => true);
  assert.equal(result.synced, true);
  assert.equal(writes, 1);
  assert.equal(local.adapter.readPending(scope), null);
  assert.equal(local.adapter.readCache(scope)?.filters.keyword, 'confirmed-by-readback');
});

await check('unknown write outcome with future or invalid readback quarantines the scope and preserves journal', async () => {
  for (const candidate of [
    row({ future: true }, 7, 'future-etag'),
    row({ ...selectedV6('invalid-readback'), extra: true }, 6, 'invalid-etag'),
  ]) {
    const local = createMemoryLocal();
    let writes = 0;
    let deletes = 0;
    const remote: TaskFilterPreferenceRemoteAdapter = {
      enabled: true,
      read: async () => clone(candidate),
      compareAndSet: async () => { writes += 1; throw new Error('network outcome unknown'); },
      remove: async () => { deletes += 1; },
    };
    const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
    const first = await repository.persist(scope, selectedV6(`journal-${candidate.preferenceVersion}`), () => true);
    assert.equal(first.synced, false);
    assert.equal(first.controlsLocked, true, `version=${candidate.preferenceVersion}`);
    assert.equal(writes, 1, `version=${candidate.preferenceVersion}`);
    assert.ok(local.adapter.readPending(scope), `version=${candidate.preferenceVersion}`);
    const pendingId = local.adapter.readPending(scope)?.id;
    assert.equal((await repository.retryPending(scope, () => true)).synced, false);
    assert.equal((await repository.persist(scope, selectedV6('must-not-write'), () => true)).synced, false);
    assert.equal((await repository.reset(scope, () => true)).synced, false);
    assert.equal(writes, 1, `version=${candidate.preferenceVersion}`);
    assert.equal(deletes, 0, `version=${candidate.preferenceVersion}`);
    assert.equal(local.adapter.readPending(scope)?.id, pendingId, `version=${candidate.preferenceVersion}`);
  }
});

await check('mutation timeout with unavailable readback sends once and preserves pending without retry', async () => {
  const local = createMemoryLocal();
  let writes = 0;
  let reads = 0;
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => { reads += 1; throw new Error('readback unavailable'); },
    compareAndSet: async () => { writes += 1; throw new Error('network timeout'); },
    remove: async () => undefined,
  };
  const originalWarn = console.warn;
  console.warn = () => undefined;
  const result = await createTaskFilterPreferenceRepository(remote, local.adapter)
    .persist(scope, selectedV6('timeout-journal'), () => true)
    .finally(() => { console.warn = originalWarn; });
  assert.equal(result.synced, false);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  assert.equal(local.adapter.readPending(scope)?.filters?.keyword, 'timeout-journal');
});

await check('failed current journal writes retain volatile upsert and delete intent until a real retry succeeds', async () => {
  {
    const local = createMemoryLocal();
    let allowPending = false;
    const baseWritePending = local.adapter.writePending;
    local.adapter.writePending = (current, mutation) => allowPending && baseWritePending(current, mutation);
    let writes = 0;
    const remote: TaskFilterPreferenceRemoteAdapter = {
      enabled: true,
      read: async () => null,
      compareAndSet: async () => { writes += 1; },
      remove: async () => undefined,
    };
    const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
    const first = await repository.persist(scope, selectedV6('volatile-upsert'), () => true);
    assert.equal(first.synced, false);
    assert.ok(first.warning);
    assert.equal(writes, 0);
    assert.equal(local.adapter.readPending(scope), null);
    allowPending = true;
    const retried = await repository.retryPending(scope, () => true);
    assert.equal(retried.synced, true);
    assert.equal(writes, 1);
    assert.equal(local.adapter.readPending(scope), null);
    assert.equal(local.adapter.readCache(scope)?.filters.keyword, 'volatile-upsert');
  }

  {
    const local = createMemoryLocal();
    local.adapter.writeCache(scope, selectedV6('remove-on-ack'));
    let allowPending = false;
    const baseWritePending = local.adapter.writePending;
    local.adapter.writePending = (current, mutation) => allowPending && baseWritePending(current, mutation);
    let deletes = 0;
    const remote: TaskFilterPreferenceRemoteAdapter = {
      enabled: true,
      read: async () => null,
      compareAndSet: async () => undefined,
      remove: async () => { deletes += 1; },
    };
    const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
    const first = await repository.reset(scope, () => true);
    assert.equal(first.synced, false);
    assert.ok(first.warning);
    assert.equal(deletes, 0);
    assert.equal(local.adapter.readCache(scope)?.filters.keyword, 'remove-on-ack');
    allowPending = true;
    const retried = await repository.retryPending(scope, () => true);
    assert.equal(retried.synced, true);
    assert.equal(deletes, 1);
    assert.equal(local.adapter.readPending(scope), null);
    assert.equal(local.adapter.readCache(scope), null);
  }

  {
    const local = createMemoryLocal();
    local.adapter.writePending = () => false;
    let writes = 0;
    const remote: TaskFilterPreferenceRemoteAdapter = {
      enabled: true,
      read: async () => null,
      compareAndSet: async () => { writes += 1; },
      remove: async () => undefined,
    };
    const repository = createTaskFilterPreferenceRepository(remote, local.adapter);
    assert.equal((await repository.persist(scope, selectedV6('still-volatile'), () => true)).synced, false);
    const retried = await repository.retryPending(scope, () => true);
    assert.equal(retried.synced, false);
    assert.ok(retried.warning);
    assert.equal(writes, 0);
  }

  {
    const local = createMemoryLocal();
    let remoteMutations = 0;
    const repository = createTaskFilterPreferenceRepository({
      enabled: true,
      read: async () => null,
      compareAndSet: async () => { remoteMutations += 1; },
      remove: async () => { remoteMutations += 1; },
    }, local.adapter);
    assert.deepEqual(await repository.retryPending(scope, () => true), { synced: true, warning: null });
    assert.equal(remoteMutations, 0);
  }
});

await check('account and board scope isolation prevents cross-scope restore', async () => {
  const scopeA = { accountId: 'account-a', boardId: 'board-a' };
  const scopeB = { accountId: 'account-a', boardId: 'board-b' };
  const local = createMemoryLocal();
  local.adapter.writeCache(scopeA, selectedV6('scope-a'));
  local.adapter.writeCache(scopeB, selectedV6('scope-b'));
  const remote: TaskFilterPreferenceRemoteAdapter = {
    enabled: true,
    read: async () => { throw new Error('offline'); },
    compareAndSet: async () => undefined,
    remove: async () => undefined,
  };
  const originalWarn = console.warn;
  console.warn = () => undefined;
  const hydrated = await createTaskFilterPreferenceRepository(remote, local.adapter)
    .hydrate(scopeB, () => true)
    .finally(() => { console.warn = originalWarn; });
  assert.equal(hydrated.filters.keyword, 'scope-b');
  assert.equal(local.adapter.readCache(scopeA)?.filters.keyword, 'scope-a');
});

await check('store consumer binds every async preference operation to auth, scope and captured generation', () => {
  const source = readFileSync(resolve('src/store/useTaskFilterStore.ts'), 'utf8');
  const boardSource = readFileSync(resolve('src/components/BoardView.tsx'), 'utf8');
  const resultStateSource = readFileSync(resolve('src/components/ui/TaskFilterResultState.tsx'), 'utf8');
  assert.match(source, /const canSendScoped = \(scope: AccountBoardTaskFilterScope, generation: number\)/);
  assert.match(source, /isAccountSessionCurrent\(scope\) && sameScope\(current, scope\) && current\.generation === generation/);
  assert.match(source, /taskFilterPreferenceRepository\.hydrate\([\s\S]*?canSendScoped\(scope, generation\)/);
  assert.match(source, /taskFilterPreferenceRepository\.persist\(scope, normalized, \(\) => canSendScoped\(scope, generation\)\)/);
  assert.match(source, /taskFilterPreferenceRepository\.reset\(scope, \(\) => canSendScoped\(scope, generation\)\)/);
  assert.match(source, /taskFilterPreferenceRepository\.retryPending\([\s\S]*?canSendScoped\(scope, generation\)/);
  assert.match(source, /if \(!sameScope\(current, scope\) \|\| current\.generation !== generation\) return/);
  assert.match(source, /generation: state\.generation \+ 1/);
  assert.match(source, /const settleMutation = async[\s\S]*?\.\.\.\(result\.controlsLocked \? \{ controlsLocked: true \} : \{\}\)/);
  assert.match(source, /retrySync: async[\s\S]*?retryPending\([\s\S]*?\.\.\.\(result\.controlsLocked \? \{ controlsLocked: true \} : \{\}\)/);
  assert.match(boardSource, /taskFiltersLocked \? taskFilterWarning \|\| '篩選偏好無法載入' : null/);
  assert.match(boardSource, /<TaskFilterResultState[\s\S]*?error=\{taskResultError\}/);
  assert.ok(resultStateSource.indexOf("if (error) return 'error'") < resultStateSource.indexOf("if (matchedTaskCount === 0) return 'filtered-zero'"));
});

await check('people and tag all-to-selected actions stay disabled until selected task and option sources match exactly', () => {
  const controls = readFileSync(resolve('src/components/ui/TaskConditionFilterControls.tsx'), 'utf8');
  const board = readFileSync(resolve('src/components/ui/StatusFilterBar.tsx'), 'utf8');
  const workbench = readFileSync(resolve('src/components/TaskWorkbenchPanel.tsx'), 'utf8');
  const scoped = (overrides: Partial<Parameters<typeof resolveScopedTaskFilterOptionStatus>[0]> = {}) => resolveScopedTaskFilterOptionStatus({
    selectedWorkspaceId: 'workspace-a',
    selectedBoardId: 'board-b',
    taskSourceStatus: 'ready',
    loadedTaskBoardIds: ['board-b'],
    optionSourceStatus: 'ready',
    optionSourceWorkspaceId: 'workspace-a',
    optionSourceBoardId: 'board-b',
    ...overrides,
  });
  assert.equal(scoped(), 'ready');
  assert.equal(scoped({ taskSourceStatus: 'loading' }), 'loading');
  assert.equal(scoped({ taskSourceStatus: 'error' }), 'error');
  assert.equal(scoped({ loadedTaskBoardIds: ['board-a'] }), 'loading');
  assert.equal(scoped({ optionSourceStatus: 'loading' }), 'loading');
  assert.equal(scoped({ optionSourceStatus: 'error' }), 'error');
  assert.equal(scoped({ optionSourceWorkspaceId: 'workspace-other', optionSourceStatus: 'error' }), 'loading');
  assert.equal(scoped({ optionSourceBoardId: 'board-a', optionSourceStatus: 'error' }), 'loading');
  assert.match(controls, /if \(peopleOptionsStatus !== 'ready'\) return/);
  assert.match(controls, /if \(tagOptionsStatus !== 'ready'\) return/);
  assert.match(controls, /disabled=\{disabled \|\| peopleOptionsStatus !== 'ready'\}/);
  assert.match(controls, /disabled=\{disabled \|\| tagOptionsStatus !== 'ready'\}/);
  assert.match(board, /taskSourceError[\s\S]*?taskSourceLoading \|\| !activeBoardId \|\| !loadedTaskBoardIds\.includes\(activeBoardId\)/);
  assert.match(board, /membersLoadedWorkspaceId !== activeWorkspaceId \|\| membersLoadedBoardId !== activeBoardId/);
  assert.match(board, /tagsLoadedWorkspaceId !== activeWorkspaceId/);
  assert.match(workbench, /selectedWorkspaceId: selectedBoardOption\?\.workspaceId \?\? null/);
  assert.match(workbench, /optionSourceWorkspaceId: filterOptionSource\.workspaceId/);
  assert.match(workbench, /optionSourceBoardId: filterOptionSource\.boardId/);
  assert.match(workbench, /peopleOptionsStatus=\{selectedOptionStatus\}/);
  assert.match(workbench, /tagOptionsStatus=\{selectedOptionStatus\}/);
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
