import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { DomainWriteRepository } from '../../../server/domainWrite.js';
import { createDomainReadHttpDispatcher } from '../../../server/domainReadHttp.js';
import { createDomainWriteHttpDispatcher } from '../../../server/domainWriteHttp.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';

const { Client } = pg;
const config = loadRuntimeConfig();
const expected = config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
const database = new RuntimeDatabase(config);
const repository = new DomainReadRepository();
const commands = new DomainWriteRepository(repository);
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
const actorC: ServerActorV1 = {
  ...actorA,
  principalId: 'principal:c',
  localUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  contextId: '53333333-3333-4333-8333-333333333333',
};
const actorD: ServerActorV1 = {
  ...actorA,
  principalId: 'principal:d',
  localUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  contextId: '54444444-4444-4444-8444-444444444444',
};

const aWorkspaces = await runActorTransaction(database, config, actorA, port => repository.listWorkspaces(port));
assert.deepEqual(aWorkspaces.map(workspace => workspace.id), ['ws-a', 'ws-b']);
assert.deepEqual(aWorkspaces.find(workspace => workspace.id === 'ws-b')?.boards.map(board => board.id), ['board-shared']);
assert.equal(JSON.stringify(aWorkspaces).includes('board-private'), false);
assert.equal(JSON.stringify(aWorkspaces).includes('B secret'), false);

const bWorkspaces = await runActorTransaction(database, config, actorB, port => repository.listWorkspaces(port));
assert.deepEqual(bWorkspaces.map(workspace => workspace.id), ['ws-b']);
assert.deepEqual(bWorkspaces[0]?.boards.map(board => board.id), ['board-shared', 'board-private']);
const cWorkspaces = await runActorTransaction(database, config, actorC, port => repository.listWorkspaces(port));
assert.deepEqual(cWorkspaces.map(workspace => [workspace.id, workspace.boards.length]), [['ws-b', 0]]);
const dWorkspaces = await runActorTransaction(database, config, actorD, port => repository.listWorkspaces(port));
assert.deepEqual(dWorkspaces, []);
await assert.rejects(
  runActorTransaction(database, config, actorD, port => repository.listTags(port, 'ws-b')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);

await assert.rejects(
  runActorTransaction(database, config, actorA, port => repository.listWorkspaceMembers(port, 'ws-b')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
const bTenantMembers = await runActorTransaction(database, config, actorB, port => repository.listWorkspaceMembers(port, 'ws-b'));
assert.deepEqual(bTenantMembers.map(member => member.userId), [
  actorB.localUserId, actorA.localUserId, actorC.localUserId, actorD.localUserId,
]);

const sharedMembers = await runActorTransaction(database, config, actorA, port => (
  repository.listBoardMembers(port, 'ws-b', 'board-shared')
));
assert.deepEqual(sharedMembers.map(member => member.userId), [actorB.localUserId, actorA.localUserId, actorD.localUserId]);

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

const initialTags = await runActorTransaction(database, config, actorA, port => repository.listTags(port, 'ws-a'));
assert.deepEqual(initialTags.map(tag => tag.id), ['tag-a']);
const initialATasks = await runActorTransaction(database, config, actorA, port => repository.listTasks(port, 'ws-a', 'board-a'));
assert.deepEqual(initialATasks[0]?.tagIds, ['tag-a']);

const createdTag = await runActorTransaction(database, config, actorA, port => commands.createTag(port, 'ws-a', {
  id: 'tag-new', name: 'New tag', color: 'blue', order: 2,
}));
assert.equal(createdTag.id, 'tag-new');
const createdTask = await runActorTransaction(database, config, actorA, port => commands.createTask(port, 'ws-a', 'board-a', {
  id: 'task-new', parentId: 'task-a', title: 'New task', status: 'todo', order: 2,
  assigneeIds: [actorA.localUserId], collaboratorIds: [actorA.localUserId], tagIds: ['tag-new'],
}));
assert.equal(createdTask.parentId, 'task-a');
assert.deepEqual(createdTask.assigneeIds, [actorA.localUserId]);
assert.deepEqual(createdTask.collaboratorIds, []);
assert.deepEqual(createdTask.tagIds, ['tag-new']);

const createdDependency = await runActorTransaction(database, config, actorA, port => commands.setDependency(
  port, 'ws-a', 'board-a', {
    id: 'dep-new', fromId: 'task-a', fromSide: 'end', toId: 'task-new', toSide: 'start', offset: 1,
  },
));
assert.equal(createdDependency.id, 'dep-new');

await runActorTransaction(database, config, actorA, port => commands.setTaskTags(
  port, 'ws-a', 'board-a', 'task-new', [],
));
assert.deepEqual(
  (await runActorTransaction(database, config, actorA, port => repository.listTasks(port, 'ws-a', 'board-a')))
    .find(task => task.id === 'task-new')?.tagIds,
  [],
);

await assert.rejects(
  runActorTransaction(database, config, actorA, port => commands.batchUpdateTasks(port, 'ws-a', 'board-a', [
    { id: 'task-a', data: { title: 'Must roll back' } },
    { id: 'task-new', data: { startDate: '2026-10-03', endDate: '2026-10-02' } },
  ])),
);
assert.equal(
  (await runActorTransaction(database, config, actorA, port => repository.listTasks(port, 'ws-a', 'board-a')))
    .find(task => task.id === 'task-a')?.title,
  'A task',
);

await assert.rejects(
  runActorTransaction(database, config, actorA, port => commands.setDependency(port, 'ws-a', 'board-a', {
    id: 'dep-invalid', fromId: 'task-a', fromSide: 'end', toId: 'task-a', toSide: 'end',
  })),
);
await assert.rejects(
  runActorTransaction(database, config, actorA, port => commands.createTask(port, 'ws-b', 'board-shared', {
    id: 'viewer-write', parentId: null, title: 'Denied', status: 'todo', order: 3,
  })),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await assert.rejects(
  runActorTransaction(database, config, actorA, port => commands.createTag(port, 'ws-b', {
    id: 'board-scoped-tag', name: 'Denied', color: 'red', order: 3,
  })),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => commands.createTask(port, 'ws-b', 'board-shared', {
    id: 'cross-board-parent', parentId: 'private-task', title: 'Denied', status: 'todo', order: 3,
  })),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
await runActorTransaction(database, config, actorA, port => commands.deleteTask(port, 'ws-a', 'board-a', 'task-a'));
assert.equal(
  (await runActorTransaction(database, config, actorA, port => repository.listTasks(port, 'ws-a', 'board-a')))
    .find(task => task.id === 'task-new')?.parentId,
  null,
);
assert.deepEqual(
  await runActorTransaction(database, config, actorA, port => repository.listDependencies(port, 'ws-a', 'board-a')),
  [],
);

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
}

const disabledDispatcher = createDomainReadHttpDispatcher(config, database);
const disabledResult = await disabledDispatcher({
  method: 'GET', url: '/api/v1/workspaces', headers: {},
} as IncomingMessage, 'qa-disabled');
assert.equal(disabledResult.status, 404);
assert.deepEqual(disabledResult.body, {
  error: { code: 'ENDPOINT_UNAVAILABLE', requestId: 'qa-disabled', retryable: false },
});
const disabledWriteDispatcher = createDomainWriteHttpDispatcher(config, database);
const disabledWrite = await disabledWriteDispatcher({
  method: 'POST', url: '/api/v1/workspaces/ws-a/boards/board-a/tasks',
  headers: { 'content-type': 'application/json' }, resume() {},
} as unknown as IncomingMessage, 'qa-write-disabled');
assert.equal(disabledWrite.status, 404);

const http = createKernelHttpServer(config, database, expected, {
  resolveActor: async (request) => {
    if (request.headers.cookie === '__session=qa-a') return actorA;
    if (request.headers.cookie === '__session=qa-b') return actorB;
    throw new KernelError('ACTOR_INVALID', 'QA session is unavailable', 401);
  },
});
const address = await http.listen();
const base = `http://${address.host}:${address.port}`;
const fetchFor = (session: 'qa-a' | 'qa-b'): HttpApiFetch => async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('cookie', `__session=${session}`);
  return fetch(`${base}${String(input)}`, { ...init, headers });
};
try {
  const httpA = createHttpDomainReadAdapter(new HttpApiClient(fetchFor('qa-a')));
  const httpB = createHttpDomainReadAdapter(new HttpApiClient(fetchFor('qa-b')));
  const writeA = createHttpDomainWriteAdapter(new HttpApiClient(fetchFor('qa-a')));
  const writeB = createHttpDomainWriteAdapter(new HttpApiClient(fetchFor('qa-b')));
  assert.deepEqual((await httpA.listWorkspaces()).map(workspace => workspace.id), ['ws-a', 'ws-b']);
  assert.deepEqual((await httpB.listWorkspaceMembers('ws-b')).map(member => member.userId), [
    actorB.localUserId, actorA.localUserId, actorC.localUserId, actorD.localUserId,
  ]);
  assert.deepEqual((await httpA.listBoardMembers('ws-b', 'board-shared')).map(member => member.userId), [
    actorB.localUserId, actorA.localUserId, actorD.localUserId,
  ]);
  assert.deepEqual((await httpA.listTasks('ws-b', 'board-shared')).map(task => task.id), ['shared-parent', 'shared-child']);
  assert.deepEqual((await httpA.listTags('ws-a')).map(tag => tag.id), ['tag-a', 'tag-new']);
  assert.deepEqual((await httpA.listDependencies('ws-b', 'board-shared')).map(dependency => dependency.id), ['dep-shared']);
  assert.deepEqual((await httpB.listTasks('ws-b', 'board-private')).map(task => task.title), ['B secret']);
  assert.deepEqual((await httpA.getBoardRolePermissions('ws-b', 'board-shared')).admin, []);
  await assert.rejects(httpA.listTasks('ws-b', 'board-private'), (error: unknown) => (
    error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND'
  ));

  const httpTag = await writeB.createTag('ws-b', {
    id: 'http-tag', workspaceId: 'ws-b', name: 'HTTP tag', color: 'purple', order: 1,
  });
  assert.equal(httpTag.id, 'http-tag');
  const httpTask = await writeB.createTask('ws-b', 'board-shared', {
    id: 'http-task', workspaceId: 'ws-b', boardId: 'board-shared', parentId: 'shared-parent',
    title: 'HTTP task', status: 'todo', assigneeIds: [actorB.localUserId], collaboratorIds: [],
    tagIds: ['http-tag'], order: 3,
  });
  assert.deepEqual(httpTask.tagIds, ['http-tag']);
  assert.equal((await writeB.updateTask('ws-b', 'board-shared', 'http-task', { title: 'HTTP updated' })).title, 'HTTP updated');
  assert.equal((await writeB.createDependency('ws-b', 'board-shared', {
    fromId: 'shared-child', fromSide: 'end', toId: 'http-task', toSide: 'start', offset: 0,
  })).toId, 'http-task');
  await assert.rejects(
    writeA.updateTask('ws-b', 'board-shared', 'http-task', { title: 'Viewer forged' }),
    (error: unknown) => error instanceof HttpApiError && error.status === 403 && error.code === 'ACCESS_DENIED',
  );
  const crossSite = await fetch(`${base}/api/v1/workspaces/ws-b/boards/board-shared/tasks/http-task`, {
    method: 'PATCH',
    headers: { cookie: '__session=qa-b', origin: 'https://evil.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Cross-site forged' }),
  });
  assert.equal(crossSite.status, 403);
  assert.equal(
    (await httpB.listTasks('ws-b', 'board-shared')).find(task => task.id === 'http-task')?.title,
    'HTTP updated',
  );

  const missingSession = await fetch(`${base}/api/v1/workspaces`);
  assert.equal(missingSession.status, 401);
  assert.equal(missingSession.headers.get('cache-control'), 'no-store');
  assert.equal((await missingSession.json() as { error: { code: string } }).error.code, 'ACTOR_INVALID');
  const wrongMethod = await fetch(`${base}/api/v1/workspaces`, { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  const unknownApi = await fetch(`${base}/api/v1/session`, { headers: { cookie: '__session=qa-a' } });
  assert.equal(unknownApi.status, 404);
  assert.match(unknownApi.headers.get('content-type') ?? '', /^application\/json/);
} finally {
  await http.shutdown();
}

console.log(JSON.stringify({
  status: 'PASS',
  checks: [
    'migration-boundary', 'workspace-board-scope', 'tenant-member-scope', 'board-member-scope',
    'tenant-scope-does-not-imply-board-read', 'suspended-member-deny',
    'explicit-empty-permissions', 'task-parent-mapping', 'dependency-mapping', 'private-board-deny',
    'tag-authority', 'task-command', 'assignment-normalization', 'dependency-command',
    'empty-tag-replacement', 'batch-rollback', 'date-and-dependency-constraints',
    'board-capability-write-deny', 'board-scope-tag-definition-deny',
    'task-delete-parent-detach-and-dependency-cascade',
    'missing-context-deny', 'runtime-write-deny', 'production-route-disabled', 'production-write-disabled',
    'http-session-route', 'http-private-board-deny', 'http-missing-session-deny', 'http-api-no-static-fallback',
    'http-domain-write', 'http-capability-deny', 'http-cross-site-deny',
  ],
}));
