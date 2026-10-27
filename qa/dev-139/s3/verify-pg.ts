import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { CollaborationReadRepository } from '../../../server/collaborationRead.js';
import { CollaborationWriteRepository } from '../../../server/collaborationWrite.js';
import { loadRuntimeConfig, sha256 } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { DomainReadRepository } from '../../../server/domainRead.js';
import { DomainWriteRepository } from '../../../server/domainWrite.js';
import { createDomainReadHttpDispatcher } from '../../../server/domainReadHttp.js';
import { createDomainWriteHttpDispatcher } from '../../../server/domainWriteHttp.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { RecordActivityRepository } from '../../../server/recordActivity.js';
import { createRecordActivityHttpDispatcher } from '../../../server/recordActivityHttp.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { createHttpRecordActivityAdapter } from '../../../src/services/httpApi/recordActivityAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createCollaborationWriteHttpDispatcher } from '../../../server/collaborationWriteHttp.js';

const { Client } = pg;
const config = loadRuntimeConfig();
const expected = config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
const database = new RuntimeDatabase(config);
const repository = new DomainReadRepository();
const commands = new DomainWriteRepository(repository);
const collaborationReads = new CollaborationReadRepository();
const collaborationCommands = new CollaborationWriteRepository(repository);
const recordActivity = new RecordActivityRepository();
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
const actorE: ServerActorV1 = {
  ...actorA,
  principalId: 'principal:e',
  localUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contextId: '55555555-5555-4555-8555-555555555555',
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

const initialRevisions = await runActorTransaction(database, config, actorB, port => (
  collaborationReads.listResourceRevisions(port)
));
assert.equal(initialRevisions.some(item => item.workspaceId === 'ws-b' && item.boardId === 'board-shared'), true);

const eWorkspace = await runActorTransaction(database, config, actorE, port => (
  collaborationCommands.createWorkspace(port, { title: 'E personal' })
));
assert.equal(eWorkspace.title, 'E personal');
assert.equal((await runActorTransaction(database, config, actorE, port => (
  repository.listWorkspaceMembers(port, eWorkspace.id)
))).length, 1);
const eBoard = await runActorTransaction(database, config, actorE, port => (
  collaborationCommands.createBoard(port, eWorkspace.id, { title: 'E private board' })
));
assert.equal(eBoard.title, 'E private board');
assert.deepEqual(
  Object.keys(await runActorTransaction(database, config, actorE, port => (
    repository.getBoardRolePermissions(port, eWorkspace.id, eBoard.id)
  ))).sort(),
  ['admin', 'member', 'owner', 'project_manager', 'viewer'],
);

const cBoard = await runActorTransaction(database, config, actorC, port => (
  collaborationCommands.createBoard(port, 'ws-b', { title: 'C managed board' })
));
assert.equal(cBoard.title, 'C managed board');
assert.equal((await runActorTransaction(database, config, actorC, port => (
  collaborationCommands.updateBoard(port, 'ws-b', cBoard.id, { title: 'C renamed board', order: 4 })
))).title, 'C renamed board');
await runActorTransaction(database, config, actorC, port => collaborationCommands.deleteBoard(port, 'ws-b', cBoard.id));

const matrixUpdate = { ...matrix, admin: [] };
const updatedMatrix = await runActorTransaction(database, config, actorB, port => (
  collaborationCommands.updateRolePermissions(port, 'ws-b', 'board-shared', matrixUpdate)
));
assert.deepEqual(updatedMatrix.admin, []);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => collaborationCommands.updateRolePermissions(
    port, 'ws-b', 'board-shared', { ...matrixUpdate, viewer: ['unknown'] },
  )),
  (error: unknown) => (error as { code?: string }).code === 'DOMAIN_DATA_INVALID',
);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => collaborationCommands.upsertBoardMember(
    port, 'ws-b', 'board-shared', actorB.localUserId, 'member',
  )),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => collaborationCommands.removeBoardMember(
    port, 'ws-b', 'board-shared', actorB.localUserId,
  )),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);

const inviteToken = 'dev139-e-invite-token-0001';
const inviteHash = createHash('sha256').update(inviteToken).digest('hex');
const eInvite = await runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
  port, 'ws-b', 'board-shared', {
    email: ' E@EXAMPLE.INVALID ', tokenHash: inviteHash,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, defaultRole: 'viewer',
  },
));
assert.equal(eInvite.email, 'e@example.invalid');
assert.equal(eInvite.defaultRole, 'viewer');
assert.deepEqual((await runActorTransaction(database, config, actorB, port => (
  collaborationReads.listPendingInvites(port, 'ws-b', 'board-shared')
))).map(invite => invite.id), [eInvite.id]);
await assert.rejects(
  runActorTransaction(database, config, actorA, port => collaborationCommands.acceptInvite(port, inviteToken)),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
    port, 'ws-b', 'board-shared', {
      email: 'e@example.invalid', tokenHash: createHash('sha256').update('duplicate-token-0002').digest('hex'),
      expiresAt: Date.now() + 60_000, defaultRole: 'member',
    },
  )),
  (error: unknown) => (error as { code?: string }).code === 'DOMAIN_DATA_INVALID',
);
await assert.rejects(
  runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
    port, 'ws-b', 'board-shared', {
      email: 'owner@example.invalid', tokenHash: createHash('sha256').update('owner-token-0000003').digest('hex'),
      expiresAt: Date.now() + 60_000, defaultRole: 'owner',
    },
  )),
  (error: unknown) => (error as { code?: string }).code === 'DOMAIN_DATA_INVALID',
);
await assert.rejects(
  runActorTransaction(database, config, actorA, port => collaborationCommands.createInvite(
    port, 'ws-b', 'board-shared', {
      email: 'nobody@example.invalid', tokenHash: createHash('sha256').update('viewer-denied-token').digest('hex'),
      expiresAt: Date.now() + 60_000, defaultRole: 'member',
    },
  )),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);

const expiringInviteToken = 'dev139-expiring-token-0006';
const expiringInvite = await runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
  port, 'ws-b', 'board-shared', {
    email: 'a@example.invalid', tokenHash: createHash('sha256').update(expiringInviteToken).digest('hex'),
    expiresAt: Date.now() + 1_000, defaultRole: 'viewer',
  },
));
await new Promise(resolve => setTimeout(resolve, 1_200));
await assert.rejects(
  runActorTransaction(database, config, actorA, port => collaborationCommands.acceptInvite(port, expiringInviteToken)),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
await runActorTransaction(database, config, actorB, port => collaborationCommands.revokeInvite(
  port, 'ws-b', 'board-shared', expiringInvite.id,
));

const suspendedInviteToken = 'dev139-suspended-token-0007';
const suspendedInvite = await runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
  port, 'ws-b', 'board-shared', {
    email: 'd@example.invalid', tokenHash: createHash('sha256').update(suspendedInviteToken).digest('hex'),
    expiresAt: Date.now() + 60_000, defaultRole: 'viewer',
  },
));
await assert.rejects(
  runActorTransaction(database, config, actorD, port => collaborationCommands.acceptInvite(port, suspendedInviteToken)),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await runActorTransaction(database, config, actorB, port => collaborationCommands.revokeInvite(
  port, 'ws-b', 'board-shared', suspendedInvite.id,
));

const acceptedInvite = await runActorTransaction(database, config, actorE, port => (
  collaborationCommands.acceptInvite(port, inviteToken)
));
assert.equal(acceptedInvite.status, 'accepted');
assert.equal((await runActorTransaction(database, config, actorE, port => (
  repository.listTasks(port, 'ws-b', 'board-shared')
))).length > 0, true);
await assert.rejects(
  runActorTransaction(database, config, actorE, port => collaborationCommands.acceptInvite(port, inviteToken)),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
await assert.rejects(
  runActorTransaction(database, config, actorE, port => repository.listWorkspaceMembers(port, 'ws-b')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);

const cInviteToken = 'dev139-c-revoke-token-0004';
const cInvite = await runActorTransaction(database, config, actorB, port => collaborationCommands.createInvite(
  port, 'ws-b', 'board-shared', {
    email: 'c@example.invalid', tokenHash: createHash('sha256').update(cInviteToken).digest('hex'),
    expiresAt: Date.now() + 60_000, defaultRole: 'admin',
  },
));
await runActorTransaction(database, config, actorB, port => collaborationCommands.revokeInvite(
  port, 'ws-b', 'board-shared', cInvite.id,
));
await assert.rejects(
  runActorTransaction(database, config, actorC, port => collaborationCommands.acceptInvite(port, cInviteToken)),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);

await runActorTransaction(database, config, actorB, port => collaborationCommands.removeBoardMember(
  port, 'ws-b', 'board-shared', actorE.localUserId,
));
await assert.rejects(
  runActorTransaction(database, config, actorE, port => repository.listTasks(port, 'ws-b', 'board-shared')),
  (error: unknown) => (error as { code?: string }).code === 'RESOURCE_NOT_FOUND',
);
const eWorkspacesAfterRemoval = await runActorTransaction(database, config, actorE, port => repository.listWorkspaces(port));
assert.equal(eWorkspacesAfterRemoval.some(workspace => workspace.id === 'ws-b'), false);
assert.equal(eWorkspacesAfterRemoval
  .some(workspace => workspace.id === eWorkspace.id && workspace.boards.some(board => board.id === eBoard.id)), true);
assert.deepEqual(await runActorTransaction(database, config, actorE, async port => (
  (await port.query<{ active: boolean }>(`
    SELECT active FROM projed_core.actor_scope_access
     WHERE local_user_id = projed_core.current_actor_user_id_v1()
       AND tenant_id = '12222222-2222-4222-8222-222222222222'::uuid
       AND project_id = '22222222-2222-4222-8222-222222222222'::uuid
  `)).rows.map(row => row.active)
)), [false]);
await runActorTransaction(database, config, actorB, port => collaborationCommands.upsertBoardMember(
  port, 'ws-b', 'board-shared', actorE.localUserId, 'viewer',
));
assert.equal((await runActorTransaction(database, config, actorE, port => (
  repository.listTasks(port, 'ws-b', 'board-shared')
))).length > 0, true);
await runActorTransaction(database, config, actorB, port => collaborationCommands.removeBoardMember(
  port, 'ws-b', 'board-shared', actorE.localUserId,
));
const boardManagerBoard = await runActorTransaction(database, config, actorB, port => (
  collaborationCommands.createBoard(port, 'ws-b', { title: 'Board manager scope' })
));
await runActorTransaction(database, config, actorB, port => collaborationCommands.upsertBoardMember(
  port, 'ws-b', boardManagerBoard.id, actorA.localUserId, 'admin',
));
assert.equal((await runActorTransaction(database, config, actorA, port => collaborationCommands.upsertBoardMember(
  port, 'ws-b', boardManagerBoard.id, actorE.localUserId, 'viewer',
))).userId, actorE.localUserId);
await runActorTransaction(database, config, actorA, port => collaborationCommands.deleteBoard(
  port, 'ws-b', boardManagerBoard.id,
));
assert.equal((await runActorTransaction(database, config, actorB, port => repository.listWorkspaces(port)))
  .find(workspace => workspace.id === 'ws-b')?.boards.some(board => board.id === boardManagerBoard.id), false);
assert.equal((await runActorTransaction(database, config, actorB, port => collaborationReads.listResourceRevisions(port)))
  .find(item => item.workspaceId === 'ws-b' && item.boardId === 'board-shared')?.revision !== '1', true);

const privateRecord = await runActorTransaction(database, config, actorB, port => recordActivity.upsertRecord(
  port, 'ws-b', 'board-shared', {
    id: 'private-meeting', type: 'meeting', title: 'Private meeting', content: 'Private body',
    status: 'draft', visibility: 'private', occurredAt: Date.now(), metadata: { owner: 'b' },
    taskLinks: [{ nodeId: 'shared-parent', role: 'main' }],
  },
));
assert.equal(privateRecord.id, 'private-meeting');
assert.equal(privateRecord.ragEnabled, false);
assert.deepEqual(privateRecord.taskLinks.map(link => [link.nodeId, link.role]), [['shared-parent', 'main']]);
const projectRecord = await runActorTransaction(database, config, actorB, port => recordActivity.upsertRecord(
  port, 'ws-b', 'board-shared', {
    id: 'project-work-log', type: 'work_log', title: 'Project work', content: 'Shared body',
    status: 'published', visibility: 'project', startedAt: Date.now() - 1_000, endedAt: Date.now(),
    taskLinks: [{ nodeId: 'shared-parent', role: 'related' }],
  },
));
assert.equal(projectRecord.id, 'project-work-log');
assert.deepEqual(
  (await runActorTransaction(database, config, actorA, port => recordActivity.listRecords(
    port, 'ws-b', 'board-shared',
  ))).map(record => record.id),
  ['project-work-log'],
);
await assert.rejects(
  runActorTransaction(database, config, actorA, port => recordActivity.upsertRecord(
    port, 'ws-b', 'board-shared', {
      id: 'viewer-record', type: 'meeting', title: 'Denied', content: '', status: 'draft',
      visibility: 'project', occurredAt: Date.now(), taskLinks: [],
    },
  )),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await runActorTransaction(database, config, actorB, port => recordActivity.archiveRecord(
  port, 'ws-b', 'board-shared', 'project-work-log',
));
assert.deepEqual(
  (await runActorTransaction(database, config, actorB, port => recordActivity.listRecords(
    port, 'ws-b', 'board-shared',
  ))).map(record => record.id),
  ['private-meeting'],
);
assert.deepEqual(
  (await runActorTransaction(database, config, actorB, port => recordActivity.listRecordsByTask(
    port, 'ws-b', 'board-shared', 'shared-parent', true,
  ))).map(record => record.id).sort(),
  ['private-meeting', 'project-work-log'],
);

const activityStart = Date.now() - 1_000;
await runActorTransaction(database, config, actorB, port => recordActivity.logActivity(port, {
  workspaceId: 'ws-b', boardId: 'board-shared', eventType: 'task_collected',
  entityTable: 'wbs_items', entityId: 'shared-parent', payload: { title: 'Shared parent' },
}));
const activities = await runActorTransaction(database, config, actorB, port => recordActivity.listActivity(port, {
  workspaceId: 'ws-b', boardId: 'board-shared', scope: 'board',
  startedAt: activityStart, endedAt: Date.now() + 1_000, eventTypes: ['task_collected'],
}));
assert.deepEqual(activities.map(event => [event.eventType, event.entityId]), [['task_collected', 'shared-parent']]);
assert.deepEqual(await runActorTransaction(database, config, actorA, port => recordActivity.listActivity(port, {
  workspaceId: 'ws-b', boardId: 'board-shared', scope: 'board',
  startedAt: activityStart, endedAt: Date.now() + 1_000,
})), []);
await runActorTransaction(database, config, actorB, port => recordActivity.logActivity(port, {
  workspaceId: 'ws-b', boardId: null, eventType: 'task_created',
  entityTable: 'wbs_items', entityId: 'workspace-event', payload: { source: 'workspace' },
}));
assert.equal((await runActorTransaction(database, config, actorC, port => recordActivity.listActivity(port, {
  workspaceId: 'ws-b', scope: 'workspace', startedAt: activityStart, endedAt: Date.now() + 1_000,
}))).some(event => event.entityId === 'workspace-event'), true);
await runActorTransaction(database, config, actorB, port => recordActivity.logAudit(port, {
  workspaceId: 'ws-b', boardId: null, action: 'workspace_deleted', entityTable: 'tenants', entityId: 'ws-b',
  beforeData: { state: 'active' }, afterData: null,
}));
await assert.rejects(
  runActorTransaction(database, config, actorC, port => recordActivity.logAudit(port, {
    workspaceId: 'ws-b', boardId: null, action: 'workspace_deleted', entityTable: 'tenants', entityId: 'ws-b',
  })),
  (error: unknown) => (error as { code?: string }).code === 'ACCESS_DENIED',
);
await runActorTransaction(database, config, actorB, port => recordActivity.logAudit(port, {
  workspaceId: 'ws-b', boardId: 'board-shared', action: 'member_role_changed',
  entityTable: 'project_members', entityId: actorA.localUserId,
  beforeData: { role: 'viewer' }, afterData: { role: 'viewer' },
}));
const auditCount = await runActorTransaction(database, config, actorB, port => (
  port.query<{ count: string }>(`SELECT count(*)::text AS count FROM projed_core.audit_logs
    WHERE tenant_id = '12222222-2222-4222-8222-222222222222'::uuid`)
));
assert.equal(auditCount.rows[0]?.count, '2');

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
let disabledCollaborationResumed = false;
const disabledCollaborationDispatcher = createCollaborationWriteHttpDispatcher(config, database);
const disabledCollaboration = await disabledCollaborationDispatcher({
  method: 'POST', url: '/api/v1/invites:accept', headers: { 'content-type': 'application/json' },
  resume() { disabledCollaborationResumed = true; },
} as unknown as IncomingMessage, 'qa-collaboration-disabled');
assert.equal(disabledCollaboration.status, 404);
assert.equal(disabledCollaborationResumed, true);
const disabledRecordDispatcher = createRecordActivityHttpDispatcher(config, database);
const disabledRecord = await disabledRecordDispatcher({
  method: 'POST', url: '/api/v1/workspaces/ws-b/boards/board-shared/records',
  headers: { 'content-type': 'application/json' }, resume() {},
} as unknown as IncomingMessage, 'qa-record-disabled');
assert.equal(disabledRecord.status, 404);

const http = createKernelHttpServer(config, database, expected, {
  resolveActor: async (request) => {
    if (request.headers.cookie === '__session=qa-a') return actorA;
    if (request.headers.cookie === '__session=qa-b') return actorB;
    if (request.headers.cookie === '__session=qa-c') return actorC;
    if (request.headers.cookie === '__session=qa-e') return actorE;
    throw new KernelError('ACTOR_INVALID', 'QA session is unavailable', 401);
  },
});
const address = await http.listen();
const base = `http://${address.host}:${address.port}`;
const fetchFor = (session: 'qa-a' | 'qa-b' | 'qa-c' | 'qa-e'): HttpApiFetch => async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('cookie', `__session=${session}`);
  headers.set('origin', base);
  return fetch(`${base}${String(input)}`, { ...init, headers });
};
try {
  const httpA = createHttpDomainReadAdapter(new HttpApiClient(fetchFor('qa-a')));
  const httpB = createHttpDomainReadAdapter(new HttpApiClient(fetchFor('qa-b')));
  const httpE = createHttpDomainReadAdapter(new HttpApiClient(fetchFor('qa-e')));
  const writeA = createHttpDomainWriteAdapter(new HttpApiClient(fetchFor('qa-a')));
  const writeB = createHttpDomainWriteAdapter(new HttpApiClient(fetchFor('qa-b')));
  const collaborationB = createHttpCollaborationAdapter(new HttpApiClient(fetchFor('qa-b')));
  const collaborationC = createHttpCollaborationAdapter(new HttpApiClient(fetchFor('qa-c')));
  const collaborationE = createHttpCollaborationAdapter(new HttpApiClient(fetchFor('qa-e')));
  const recordsB = createHttpRecordActivityAdapter(new HttpApiClient(fetchFor('qa-b')));
  const recordsA = createHttpRecordActivityAdapter(new HttpApiClient(fetchFor('qa-a')));
  assert.deepEqual((await httpA.listWorkspaces()).map(workspace => workspace.id), ['ws-a', 'ws-b']);
  assert.deepEqual((await httpB.listWorkspaceMembers('ws-b')).map(member => member.userId), [
    actorB.localUserId, actorA.localUserId, actorC.localUserId, actorD.localUserId, actorE.localUserId,
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
  const missingOrigin = await fetch(`${base}/api/v1/workspaces/ws-b/boards/board-shared/tasks/http-task`, {
    method: 'PATCH', headers: { cookie: '__session=qa-b', 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Missing origin forged' }),
  });
  assert.equal(missingOrigin.status, 403);
  const wrongScheme = await fetch(`${base}/api/v1/workspaces/ws-b/boards/board-shared/tasks/http-task`, {
    method: 'PATCH',
    headers: { cookie: '__session=qa-b', origin: base.replace('http://', 'https://'), 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Wrong scheme forged' }),
  });
  assert.equal(wrongScheme.status, 403);
  assert.equal(
    (await httpB.listTasks('ws-b', 'board-shared')).find(task => task.id === 'http-task')?.title,
    'HTTP updated',
  );

  const httpManagedBoard = await collaborationC.createBoard('ws-b', 'HTTP managed board');
  assert.equal(httpManagedBoard.title, 'HTTP managed board');
  assert.equal((await collaborationC.updateBoard('ws-b', httpManagedBoard.id, { title: 'HTTP renamed board' })).title, 'HTTP renamed board');
  await collaborationC.deleteBoard('ws-b', httpManagedBoard.id);
  const httpInviteToken = 'dev139-http-e-token-0005';
  const httpInvite = await collaborationB.createInvite('ws-b', 'board-shared', {
    email: 'e@example.invalid',
    tokenHash: createHash('sha256').update(httpInviteToken).digest('hex'),
    expiresAt: Date.now() + 60_000,
    defaultRole: 'admin',
  });
  assert.equal((await collaborationB.listPendingInvites('ws-b', 'board-shared'))[0]?.id, httpInvite.id);
  const httpAccepted = await collaborationE.acceptInvite({
    token: httpInviteToken,
    userId: actorA.localUserId,
    email: 'forged@example.invalid',
    displayName: 'Forged',
  });
  assert.equal(httpAccepted.defaultRole, 'admin');
  assert.equal((await httpB.listBoardMembers('ws-b', 'board-shared'))
    .find(member => member.userId === actorE.localUserId)?.role, 'admin');
  await collaborationB.removeBoardMember('ws-b', 'board-shared', actorE.localUserId);
  assert.equal((await httpE.listWorkspaces()).some(workspace => workspace.id === 'ws-b'), false);
  assert.equal((await collaborationE.listResourceRevisions())
    .some(item => item.workspaceId === 'ws-b' && item.boardId === 'board-shared'), false);
  assert.equal((await collaborationB.listResourceRevisions())
    .some(item => item.workspaceId === 'ws-b' && item.boardId === 'board-shared'), true);

  const httpRecord = await recordsB.upsertRecord('ws-b', 'board-shared', {
    type: 'meeting', title: 'HTTP meeting', content: 'HTTP body', status: 'draft',
    visibility: 'project', occurredAt: Date.now(), taskLinks: [{ nodeId: 'shared-child', role: 'related' }],
  });
  assert.equal(httpRecord.title, 'HTTP meeting');
  const largeHttpRecord = await recordsB.upsertRecord('ws-b', 'board-shared', {
    type: 'meeting', title: 'HTTP large meeting', content: 'x'.repeat(70 * 1024), status: 'draft',
    visibility: 'private', occurredAt: Date.now(), taskLinks: [],
  });
  assert.equal(largeHttpRecord.content.length, 70 * 1024);
  assert.equal((await recordsA.listRecords('ws-b', 'board-shared')).some(record => record.id === httpRecord.id), true);
  const updatedHttpRecord = await recordsB.upsertRecord('ws-b', 'board-shared', {
    id: httpRecord.id, type: 'meeting', title: 'HTTP updated meeting', content: 'HTTP body', status: 'published',
    visibility: 'project', occurredAt: Date.now(), taskLinks: [{ nodeId: 'shared-child', role: 'decision' }],
  });
  assert.equal(updatedHttpRecord.title, 'HTTP updated meeting');
  await recordsB.logActivity({
    workspaceId: 'ws-b', boardId: 'board-shared', eventType: 'task_status_changed',
    entityTable: 'wbs_items', entityId: 'shared-child', payload: { status: 'completed' },
  });
  assert.equal((await recordsB.listActivity({
    workspaceId: 'ws-b', boardId: 'board-shared', scope: 'board',
    startedAt: 0, endedAt: Date.now() + 1_000, eventTypes: ['task_status_changed'],
  })).some(event => event.entityId === 'shared-child'), true);
  await recordsB.archiveRecord('ws-b', 'board-shared', httpRecord.id);
  assert.equal((await recordsB.listRecordsByTask(
    'ws-b', 'board-shared', 'shared-child', { includeArchived: true },
  )).some(record => record.id === httpRecord.id && record.status === 'archived'), true);

  const missingSession = await fetch(`${base}/api/v1/workspaces`);
  assert.equal(missingSession.status, 401);
  assert.equal(missingSession.headers.get('cache-control'), 'no-store');
  assert.equal((await missingSession.json() as { error: { code: string } }).error.code, 'ACTOR_INVALID');
  const wrongMethod = await fetch(`${base}/api/v1/workspaces`, { method: 'PUT' });
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
    'production-collaboration-disabled',
    'http-session-route', 'http-private-board-deny', 'http-missing-session-deny', 'http-api-no-static-fallback',
    'http-domain-write', 'http-capability-deny', 'http-origin-bound-write-deny',
    'workspace-board-command', 'project-manager-create-board', 'five-role-matrix-atomic',
    'board-only-manager-add-and-delete', 'owner-immutable',
    'invite-role-email-hash-expiry-suspension-one-time-revoke',
    'external-board-scope-private-retention', 'resource-revision',
    'http-collaboration-command', 'client-identity-claims-ignored',
    'record-private-and-project-read', 'record-link-atomic-upsert-and-archive',
    'activity-read-write-capability', 'workspace-activity-audit-capability', 'audit-write-capability',
    'production-record-activity-disabled', 'http-record-activity',
  ],
}));
