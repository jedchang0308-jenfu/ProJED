import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCoalescedAsyncRefresh } from '../src/utils/coalescedAsyncRefresh';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const verifyBurstCoalescing = async () => {
  let calls = 0;
  const refresh = createCoalescedAsyncRefresh(async () => {
    calls += 1;
  }, { delayMs: 5 });

  refresh.request();
  refresh.request();
  refresh.request();
  await wait(20);
  refresh.cancel();
  assert.equal(calls, 1, 'A burst should collapse into one refresh.');
};

const verifySingleFlightAndTrailingRead = async () => {
  let calls = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  let releaseFirst!: () => void;
  let markStarted!: () => void;
  const firstStarted = new Promise<void>(resolve => { markStarted = resolve; });
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

  const refresh = createCoalescedAsyncRefresh(async () => {
    calls += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    if (calls === 1) {
      markStarted();
      await firstGate;
    }
    concurrent -= 1;
  }, { delayMs: 5 });

  refresh.request({ immediate: true });
  await firstStarted;
  refresh.request();
  refresh.request();
  releaseFirst();
  await wait(25);
  refresh.cancel();

  assert.equal(calls, 2, 'Events during a read should cause exactly one trailing refresh.');
  assert.equal(maxConcurrent, 1, 'Refreshes must never overlap.');
};

const verifyCancellation = async () => {
  let calls = 0;
  const refresh = createCoalescedAsyncRefresh(async () => {
    calls += 1;
  }, { delayMs: 10 });
  refresh.request();
  refresh.cancel();
  await wait(20);
  assert.equal(calls, 0, 'Cleanup should cancel a pending refresh.');
};

const verifyRuntimeContract = async () => {
  const [hook, tagHook, memberHook, migration] = await Promise.all([
    readFile('src/hooks/useSupabaseSync.ts', 'utf8'),
    readFile('src/hooks/useTagSync.ts', 'utf8'),
    readFile('src/hooks/useMemberSync.ts', 'utf8'),
    readFile('supabase/migrations/20260820080310_board_realtime_collaboration.sql', 'utf8'),
  ]);

  for (const required of [
    'createCoalescedAsyncRefresh',
    "status === 'SUBSCRIBED'",
    "table: 'wbs_item_tags'",
    "event: 'DELETE'",
    "window.addEventListener('online'",
    "document.addEventListener('visibilitychange'",
  ]) {
    assert.ok(hook.includes(required), `Realtime hook is missing: ${required}`);
  }

  for (const [name, source] of [['tag', tagHook], ['member', memberHook]] as const) {
    for (const required of [
      'createCoalescedAsyncRefresh',
      "status === 'SUBSCRIBED'",
      "window.addEventListener('online'",
      "document.addEventListener('visibilitychange'",
    ]) {
      assert.ok(source.includes(required), `${name} realtime hook is missing: ${required}`);
    }
  }

  for (const table of [
    'tenants',
    'projects',
    'tenant_members',
    'project_members',
    'board_role_permissions',
    'profiles',
    'wbs_items',
    'wbs_dependencies',
    'task_tags',
    'wbs_item_tags',
  ]) {
    assert.ok(migration.includes(`'${table}'`), `Realtime publication is missing ${table}.`);
  }
  assert.ok(migration.includes('pg_publication_tables'), 'Migration must be idempotent.');
};

await verifyBurstCoalescing();
await verifySingleFlightAndTrailingRead();
await verifyCancellation();
await verifyRuntimeContract();

console.log(JSON.stringify({
  dev: 'DEV-082',
  passed: true,
  checks: [
    'burst-coalescing',
    'single-flight-trailing-read',
    'cleanup-cancellation',
    'subscription-race-closure',
    'delete-and-tag-assignment-coverage',
    'publication-contract',
  ],
}, null, 2));
