import assert from 'node:assert/strict';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { readFileSync } from 'node:fs';

const { Client } = pg;
const config = loadRuntimeConfig();
const expected = config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
const database = new RuntimeDatabase(config);
await database.assertRuntimeBoundary(expected);

const actorA: ServerActorV1 = {
  principalId: 'principal:a',
  localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entry: config.entry,
  contextId: '11111111-1111-4111-8111-111111111111',
  expiresAtMs: Date.now() + 60_000,
  accountGuardRevision: '1',
};
const actorB: ServerActorV1 = {
  ...actorA,
  principalId: 'principal:b',
  localUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contextId: '22222222-2222-4222-8222-222222222222',
};

await runActorTransaction(database, config, actorA, async ({ query }) => {
  const own = await query<{ id: string }>('SELECT id FROM projed_core.profiles WHERE id = $1', [actorA.localUserId]);
  assert.equal(own.rows[0]?.id, actorA.localUserId);
  await query('UPDATE projed_core.profiles SET display_name = $1, updated_at = now() WHERE id = $2', ['A updated', actorA.localUserId]);
});
await runActorTransaction(database, config, actorB, async ({ query }) => {
  const other = await query('SELECT id FROM projed_core.profiles WHERE id = $1', [actorA.localUserId]);
  assert.equal(other.rowCount, 0);
});
await assert.rejects(
  runActorTransaction(database, config, { ...actorA, accountGuardRevision: '2' }, async () => undefined),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);

const rawClient = new Client({ connectionString: config.databaseUrl });
await rawClient.connect();
try {
  const withoutContext = await rawClient.query('SELECT id FROM projed_core.profiles');
  assert.equal(withoutContext.rowCount, 0);
  await assert.rejects(rawClient.query("INSERT INTO projed_core.profiles(id) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc')"));
} finally {
  await rawClient.end();
}

const http = createKernelHttpServer(config, database, expected);
const address = await http.listen();
try {
  const base = `http://${address.host}:${address.port}`;
  const live = await fetch(`${base}/health/live`);
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('cache-control'), 'no-store');
  const ready = await fetch(`${base}/health/ready`);
  assert.equal(ready.status, 200);
  const staticPage = await fetch(`${base}/`);
  assert.equal(staticPage.status, 200);
  assert.match(await staticPage.text(), /DEV-139 S1/);
  const unknown = await fetch(`${base}/api/tasks`);
  assert.equal(unknown.status, 404);
  assert.deepEqual((await unknown.json() as { error: { code: string } }).error.code, 'ENDPOINT_UNAVAILABLE');
  const forged = await fetch(`${base}/api/tasks`, { headers: { 'x-principal-id': actorA.principalId, cookie: 'session=fake' } });
  assert.equal(forged.status, 404);
} finally {
  await http.shutdown();
}

console.log(JSON.stringify({ status: 'PASS', checks: ['boundary', 'actor-rls', 'guard-deny', 'runtime-deny', 'http-fail-closed'] }));
