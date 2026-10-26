import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';

const { Client } = pg;
const config = loadRuntimeConfig();
const expected = config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
const database = new RuntimeDatabase(config);
const repository = new DomainReadRepository();
await database.assertRuntimeBoundary(expected);

const actorA: ServerActorV1 = {
  principalId: 'principal:a',
  localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entry: 'main',
  contextId: '51111111-1111-4111-8111-111111111111',
  expiresAtMs: Date.now() + 60_000,
  accountGuardRevision: '1',
};
const actorB: ServerActorV1 = {
  ...actorA,
  principalId: 'principal:b',
  localUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contextId: '52222222-2222-4222-8222-222222222222',
};

const aWorkspaces = await runActorTransaction(database, config, actorA, port => repository.listWorkspaces(port));
assert.deepEqual(aWorkspaces.map(workspace => workspace.id), ['ws-a', 'ws-b']);
assert.deepEqual(aWorkspaces.find(workspace => workspace.id === 'ws-b')?.boards.map(board => board.id), ['board-shared']);
assert.equal(JSON.stringify(aWorkspaces).includes('board-private'), false);
assert.equal(JSON.stringify(aWorkspaces).includes('B secret'), false);

const bWorkspaces = await runActorTransaction(database, config, actorB, port => repository.listWorkspaces(port));
assert.deepEqual(bWorkspaces.map(workspace => workspace.id), ['ws-b']);
assert.deepEqual(bWorkspaces[0]?.boards.map(board => board.id), ['board-shared', 'board-private']);

await assert.rejects(
  runActorTransaction(database, config, actorA, port => repository.listWorkspaceMembers(port, 'ws-b')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
const bTenantMembers = await runActorTransaction(database, config, actorB, port => repository.listWorkspaceMembers(port, 'ws-b'));
assert.deepEqual(bTenantMembers.map(member => member.userId), [actorB.localUserId]);

const sharedMembers = await runActorTransaction(database, config, actorA, port => (
  repository.listBoardMembers(port, 'ws-b', 'board-shared')
));
assert.deepEqual(sharedMembers.map(member => member.userId), [actorB.localUserId, actorA.localUserId]);

const matrix = await runActorTransaction(database, config, actorA, port => (
  repository.getBoardRolePermissions(port, 'ws-b', 'board-shared')
));
assert.deepEqual(matrix.admin, []);
assert.deepEqual(matrix.viewer, ['read_board']);

const sharedTasks = await runActorTransaction(database, config, actorA, port => (
  repository.listTasks(port, 'ws-b', 'board-shared')
));
assert.deepEqual(sharedTasks.map(task => task.id), ['shared-parent', 'shared-child']);
assert.equal(sharedTasks[0]?.startDate, '2026-10-01');
assert.equal(sharedTasks[1]?.parentId, 'shared-parent');
assert.equal(sharedTasks[0]?.assigneeId, actorB.localUserId);

const dependencies = await runActorTransaction(database, config, actorA, port => (
  repository.listDependencies(port, 'ws-b', 'board-shared')
));
assert.deepEqual(dependencies, [{
  id: 'dep-shared', fromId: 'shared-parent', fromSide: 'end',
  toId: 'shared-child', toSide: 'start', offset: 2,
}]);

await assert.rejects(
  runActorTransaction(database, config, actorA, port => repository.listTasks(port, 'ws-b', 'board-private')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
const privateTasks = await runActorTransaction(database, config, actorB, port => (
  repository.listTasks(port, 'ws-b', 'board-private')
));
assert.deepEqual(privateTasks.map(task => task.title), ['B secret']);

const rawClient = new Client({ connectionString: config.databaseUrl });
await rawClient.connect();
try {
  const withoutContext = await rawClient.query('SELECT legacy_workspace_id FROM projed_core.tenants');
  assert.equal(withoutContext.rowCount, 0);
  await assert.rejects(rawClient.query(`
    INSERT INTO projed_core.tenants(id, legacy_workspace_id, title, owner_id)
    VALUES ('19999999-9999-4999-8999-999999999999', 'forged', 'Forged', $1::uuid)
  `, [actorA.localUserId]));
} finally {
  await rawClient.end();
  await database.end();
}

console.log(JSON.stringify({
  status: 'PASS',
  checks: [
    'migration-boundary', 'workspace-board-scope', 'tenant-member-scope', 'board-member-scope',
    'explicit-empty-permissions', 'task-parent-mapping', 'dependency-mapping', 'private-board-deny',
    'missing-context-deny', 'runtime-write-deny',
  ],
}));
