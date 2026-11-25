import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import type { ActorQueryPort, ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { QuickTaskRepository } from '../../../server/quickTask.js';
import { createQuickTaskReceiptHttpDispatcher } from '../../../server/quickTaskReceiptHttp.js';

const captureId = 'task_workbench_unplaced_11111111-1111-4111-8111-111111111111';
const actor: ServerActorV1 = { principalId: 'fixture', localUserId: '11111111-1111-4111-8111-111111111111',
  contextId: '22222222-2222-4222-8222-222222222222', entry: 'quick', expiresAtMs: Date.now() + 60_000, accountGuardRevision: '1' };
const stored = { capture_id: captureId, owner_id: actor.localUserId, title_hash: 'a'.repeat(64), committed_at_ms: '10' };
const repository = new QuickTaskRepository();
const config = { profile: { runtime: { timeouts: { transactionMillis: 5000, statementMillis: 2000,
  lockMillis: 1000, idleInTransactionMillis: 5000 } } } } as unknown as RuntimeConfig;

test('receipt repository makes one actor-scoped parameterized SELECT and never creates or locks', async () => {
  const queries: string[] = [];
  const port = { query: async (sql: string, values: unknown[]) => {
    queries.push(sql); assert.deepEqual(values, [captureId]); return { rows: [stored] };
  } } as unknown as ActorQueryPort;
  assert.deepEqual(await repository.readReceipt(port, captureId), { status: 'committed', captureId,
    ownerId: actor.localUserId, titleHash: stored.title_hash, committedAt: 10, created: false });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /owner_id = projed_core.current_actor_user_id_v1\(\)/u);
  assert.doesNotMatch(queries[0], /INSERT|UPDATE|DELETE|advisory|FOR UPDATE/iu);
});

test('absent receipt is null and malformed ids do not query', async () => {
  let calls = 0;
  const port = { query: async () => { calls++; return { rows: [] }; } } as unknown as ActorQueryPort;
  assert.equal(await repository.readReceipt(port, captureId), null);
  await assert.rejects(repository.readReceipt(port, "id' OR true--"), /invalid/u);
  assert.equal(calls, 1);
});

test('corrupt stored receipt is refused instead of certifying a saved draft', async () => {
  for (const row of [{ ...stored, title_hash: 'invalid' }, { ...stored, committed_at_ms: '0' },
    { ...stored, capture_id: captureId + '-other' }, { ...stored, owner_id: 'not-an-owner' }]) {
    const port = { query: async () => ({ rows: [row] }) } as unknown as ActorQueryPort;
    await assert.rejects(repository.readReceipt(port, captureId), /invalid/u);
  }
});

test('HTTP receipt reader refuses missing Session, changed actor and mutation methods before checkout', async () => {
  let checkouts = 0;
  const database = { checkout: async () => { checkouts++; throw new Error('unexpected checkout'); } } as unknown as RuntimeDatabase;
  const request = (method: string) => ({ url: `/api/v1/quick-tasks/${captureId}/receipt`, method,
    headers: {}, resume() {} }) as IncomingMessage;
  assert.equal((await createQuickTaskReceiptHttpDispatcher(config, database)(request('GET'), 'r1')).status, 404);
  const dispatch = createQuickTaskReceiptHttpDispatcher(config, database, async () => actor);
  assert.equal((await dispatch(request('GET'), 'r2')).status, 409);
  assert.equal((await dispatch(request('POST'), 'r3')).status, 405);
  assert.deepEqual(await dispatch({ ...request('GET'), url: '/api/v1/quick-tasks' } as IncomingMessage, 'r4'), { matched: false });
  assert.equal(checkouts, 0);
});
