import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { createQuickTaskReceiptHttpDispatcher } from '../../../server/quickTaskReceiptHttp.js';
import type { QuickTaskCreateReceipt } from '../../../server/quickTask.js';
import { createHttpQuickTaskAdapter } from '../../../src/services/httpApi/quickTaskAdapter.js';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient.js';

/** Test-only registration. No production router or feature activation. */
export async function verifyQuickReceiptPostgres(database: RuntimeDatabase, config: RuntimeConfig,
  owner: ServerActorV1, other: ServerActorV1, expected: QuickTaskCreateReceipt) {
  const dispatch = createQuickTaskReceiptHttpDispatcher(config, database, async request => {
    if (request.headers.cookie === 'fixture=owner') return owner;
    if (request.headers.cookie === 'fixture=other') return other;
    if (request.headers.cookie === 'fixture=expired') return { ...owner, expiresAtMs: 1 };
    throw new KernelError('ACTOR_INVALID', 'Fixture Session missing', 401);
  });
  const server = createServer(async (request, response) => {
    const result = await dispatch(request, 'isolated-receipt-read');
    response.writeHead(result.matched ? result.status! : 404,
      { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const path = `/api/v1/quick-tasks/${expected.captureId}/receipt`;
  const headers = (actor: ServerActorV1, cookie: string) => ({ cookie,
    'x-projed-expected-account-id': actor.localUserId, 'x-projed-expected-context-id': actor.contextId });
  const counts = (actor: ServerActorV1) => runActorTransaction(database, config, actor, async port => {
    const rows = await port.query(`SELECT
      (SELECT count(*)::text FROM projed_core.quick_task_capture_receipts) AS receipts,
      (SELECT count(*)::text FROM projed_core.unplaced_tasks) AS tasks`);
    return rows.rows;
  });
  try {
    const before = [await counts(owner), await counts(other)];
    const client = new HttpApiClient((input, init) => fetch(new URL(String(input), base), {
      ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), cookie: 'fixture=owner' },
    }));
    client.bindExpectedActor({ accountId: owner.localUserId, contextId: owner.contextId });
    const adapter = createHttpQuickTaskAdapter(client);
    assert.deepEqual(await adapter.readReceipt(expected.captureId, new AbortController().signal), { ...expected, created: false });
    const crossAccount = await fetch(base + path, { headers: headers(other, 'fixture=other') });
    assert.equal(crossAccount.status, 200);
    assert.deepEqual(await crossAccount.json(), { data: null });
    const missingId = 'task_workbench_unplaced_99999999-9999-4999-8999-999999999999';
    assert.equal(await adapter.readReceipt(missingId, new AbortController().signal), null);
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: headers(owner, 'fixture=expired') })).status, 401);
    assert.equal((await fetch(base + path, { headers: headers(other, 'fixture=owner') })).status, 409);
    assert.equal((await fetch(base + path, { method: 'POST' })).status, 405);
    const malformed = await fetch(base + '/api/v1/quick-tasks/bad-id/receipt', { headers: headers(owner, 'fixture=owner') });
    assert.equal(malformed.status, 400);
    const response = await fetch(base + path, { headers: headers(owner, 'fixture=owner') });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    await response.arrayBuffer();
    assert.deepEqual([await counts(owner), await counts(other)], before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(server.listening, false);
  }
}
