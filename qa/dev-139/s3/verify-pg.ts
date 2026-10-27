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
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createCollaborationWriteHttpDispatcher } from '../../../server/collaborationWriteHttp.js';
import { createSessionHttpDispatcher } from '../../../server/sessionHttp.js';
import { createQuickTaskHttpDispatcher } from '../../../server/quickTaskHttp.js';
import { createHttpQuickTaskAdapter } from '../../../src/services/httpApi/quickTaskAdapter.js';
import { createHttpTaskWorkbenchAdapter } from '../../../src/services/httpApi/taskWorkbenchAdapter.js';
import { createHttpTaskTrackingAdapter } from '../../../src/services/httpApi/taskTrackingAdapter.js';
import { createHttpBackupAdapter } from '../../../src/services/httpApi/backupAdapter.js';
import { createBackupPackage } from '../../../src/features/backup/package.js';
import { BackupError } from '../../../src/features/backup/types.js';
import { TaskTrackingError } from '../../../src/features/taskTracking/errors.js';
import type { QuickCaptureRecord } from '../../../src/features/quickTaskCapture/model.js';
import type { MoveTaskSubtreeCommand } from '../../../src/features/taskWorkbench/taskPlacementCommand.js';
import type { BoardRolePermissionMatrix } from '../../../src/types/index.js';

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
const actorBQuick: ServerActorV1 = {
  ...actorB,
  entry: 'quick',
  contextId: '56666666-6666-4666-8666-666666666666',
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

const matrixUpdate = { ...matrix, admin: [] } as BoardRolePermissionMatrix;
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
  const taskWorkbenchRls = await rawClient.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'projed_core'
       AND c.relname IN (
         'unplaced_tasks', 'task_workbench_placement_operations',
         'task_tracking_references', 'task_tracking_reference_staging',
         'task_tracking_reference_operations', 'backup_import_executions'
       )
     ORDER BY c.relname
  `);
  assert.deepEqual(taskWorkbenchRls.rows, [
    { relname: 'backup_import_executions', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'task_tracking_reference_operations', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'task_tracking_reference_staging', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'task_tracking_references', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'task_workbench_placement_operations', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'unplaced_tasks', relrowsecurity: true, relforcerowsecurity: true },
  ]);
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
const disabledSessionDispatcher = createSessionHttpDispatcher(config, database);
const disabledSession = await disabledSessionDispatcher({
  method: 'GET', url: '/api/v1/session', headers: {},
} as IncomingMessage, 'qa-session-disabled');
assert.equal(disabledSession.status, 404);
let disabledQuickResumed = false;
const disabledQuickDispatcher = createQuickTaskHttpDispatcher(config, database);
const disabledQuick = await disabledQuickDispatcher({
  method: 'POST', url: '/api/v1/quick-tasks', headers: { 'content-type': 'application/json' },
  resume() { disabledQuickResumed = true; },
} as unknown as IncomingMessage, 'qa-quick-disabled');
assert.equal(disabledQuick.status, 404);
assert.equal(disabledQuickResumed, true);

let destroyedSessionCount = 0;
const http = createKernelHttpServer(config, database, expected, {
  resolveActor: async (request) => {
    if (request.headers.cookie === '__session=qa-a') return actorA;
    if (request.headers.cookie === '__session=qa-b') return actorB;
    if (request.headers.cookie === '__session=qa-b-quick') return actorBQuick;
    if (request.headers.cookie === '__session=qa-c') return actorC;
    if (request.headers.cookie === '__session=qa-e') return actorE;
    throw new KernelError('ACTOR_INVALID', 'QA session is unavailable', 401);
  },
  destroySession: async () => { destroyedSessionCount += 1; },
});
const address = await http.listen();
const base = `http://${address.host}:${address.port}`;
const fetchFor = (session: 'qa-a' | 'qa-b' | 'qa-b-quick' | 'qa-c' | 'qa-e'): HttpApiFetch => async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('cookie', `__session=${session}`);
  headers.set('origin', base);
  return fetch(`${base}${String(input)}`, { ...init, headers });
};
const clientFor = (
  session: 'qa-a' | 'qa-b' | 'qa-b-quick' | 'qa-c' | 'qa-e',
  actor: ServerActorV1,
) => {
  const client = new HttpApiClient(fetchFor(session));
  client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
  return client;
};
try {
  const httpA = createHttpDomainReadAdapter(clientFor('qa-a', actorA));
  const httpB = createHttpDomainReadAdapter(clientFor('qa-b', actorB));
  const httpE = createHttpDomainReadAdapter(clientFor('qa-e', actorE));
  const writeA = createHttpDomainWriteAdapter(clientFor('qa-a', actorA));
  const writeB = createHttpDomainWriteAdapter(clientFor('qa-b', actorB));
  const collaborationB = createHttpCollaborationAdapter(clientFor('qa-b', actorB));
  const collaborationC = createHttpCollaborationAdapter(clientFor('qa-c', actorC));
  const collaborationE = createHttpCollaborationAdapter(clientFor('qa-e', actorE));
  const recordsB = createHttpRecordActivityAdapter(clientFor('qa-b', actorB));
  const recordsA = createHttpRecordActivityAdapter(clientFor('qa-a', actorA));
  const sessionB = createHttpSessionAdapter(clientFor('qa-b', actorB));
  const quickB = createHttpQuickTaskAdapter(clientFor('qa-b-quick', actorBQuick));
  const taskWorkbenchARaw = createHttpTaskWorkbenchAdapter(clientFor('qa-a', actorA));
  const taskWorkbenchBRaw = createHttpTaskWorkbenchAdapter(clientFor('qa-b', actorB));
  const trackingA = createHttpTaskTrackingAdapter(clientFor('qa-a', actorA));
  const trackingB = createHttpTaskTrackingAdapter(clientFor('qa-b', actorB));
  const staleActorClient = clientFor('qa-b', actorA);
  const staleActorRead = createHttpDomainReadAdapter(staleActorClient);
  const staleActorWrite = createHttpDomainWriteAdapter(staleActorClient);
  const taskWorkbenchAActor = { accountId: actorA.localUserId, contextId: actorA.contextId };
  const taskWorkbenchBActor = { accountId: actorB.localUserId, contextId: actorB.contextId };
  const taskWorkbenchA = {
    list: () => taskWorkbenchARaw.list(taskWorkbenchAActor),
    upsert: (task: Parameters<typeof taskWorkbenchARaw.upsert>[0]) => taskWorkbenchARaw.upsert(task, taskWorkbenchAActor),
    remove: (taskId: string) => taskWorkbenchARaw.remove(taskId, taskWorkbenchAActor),
    place: (command: MoveTaskSubtreeCommand) => taskWorkbenchARaw.place(command, taskWorkbenchAActor),
  };
  const taskWorkbenchB = {
    list: () => taskWorkbenchBRaw.list(taskWorkbenchBActor),
    upsert: (task: Parameters<typeof taskWorkbenchBRaw.upsert>[0]) => taskWorkbenchBRaw.upsert(task, taskWorkbenchBActor),
    remove: (taskId: string) => taskWorkbenchBRaw.remove(taskId, taskWorkbenchBActor),
    place: (command: MoveTaskSubtreeCommand) => taskWorkbenchBRaw.place(command, taskWorkbenchBActor),
  };
  const sessionProfile = await sessionB.getSession();
  assert.equal(sessionProfile.uid, actorB.localUserId);
  assert.equal(sessionProfile.email, 'b@example.invalid');
  assert.equal(sessionProfile.authContextId, actorB.contextId);
  assert.equal(sessionProfile.entry, 'main');
  assert.equal((await sessionB.updateDisplayName('B HTTP')).displayName, 'B HTTP');
  await assert.rejects(
    staleActorRead.listWorkspaces(),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'ACTOR_CHANGED',
  );
  await assert.rejects(
    staleActorWrite.updateTask('ws-b', 'board-shared', 'shared-child', { title: 'Wrong actor write' }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'ACTOR_CHANGED',
  );
  const missingProfileOrigin = await fetch(`${base}/api/v1/session/profile`, {
    method: 'PATCH', headers: { cookie: '__session=qa-b', 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Forged without origin' }),
  });
  assert.equal(missingProfileOrigin.status, 403);
  const mainEntryQuickWrite = await fetch(`${base}/api/v1/quick-tasks`, {
    method: 'POST',
    headers: { cookie: '__session=qa-b', origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({
      captureId: 'task_workbench_unplaced_80000000-0000-4000-8000-000000000000',
      title: 'Wrong entry',
      workspaceHint: null,
    }),
  });
  assert.equal(mainEntryQuickWrite.status, 403);
  const quickCapture: QuickCaptureRecord = {
    schemaVersion: 1,
    captureId: 'task_workbench_unplaced_81111111-1111-4111-8111-111111111111',
    accountId: actorB.localUserId,
    title: 'HTTP quick capture',
    workspaceHint: 'ws-b',
    clientCreatedAt: Date.now(),
    updatedAt: Date.now(),
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    leaseId: null,
    leaseExpiresAt: null,
    claimIntent: null,
  };
  const quickReceipt = await quickB.create(quickCapture, new AbortController().signal);
  assert.equal(quickReceipt.created, true);
  assert.equal(quickReceipt.ownerId, actorB.localUserId);
  const replayedQuickReceipt = await quickB.create(quickCapture, new AbortController().signal);
  assert.equal(replayedQuickReceipt.created, false);
  assert.equal(replayedQuickReceipt.committedAt, quickReceipt.committedAt);
  const quickRowsB = await runActorTransaction(database, config, actorB, port => port.query<{
    legacy_task_id: string; workspace_legacy_id: string; title: string;
  }>(`
    SELECT legacy_task_id, workspace_legacy_id, task->>'title' AS title
      FROM projed_core.unplaced_tasks ORDER BY sort_order
  `));
  assert.deepEqual(quickRowsB.rows, [{
    legacy_task_id: quickCapture.captureId,
    workspace_legacy_id: 'ws-b',
    title: quickCapture.title,
  }]);
  const quickRowsA = await runActorTransaction(database, config, actorA, port => port.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM projed_core.unplaced_tasks
  `));
  assert.equal(quickRowsA.rows[0]?.count, '0');
  const quickConflict = await fetch(`${base}/api/v1/quick-tasks`, {
    method: 'POST',
    headers: {
      cookie: '__session=qa-b-quick', origin: base, 'content-type': 'application/json',
      'x-projed-expected-account-id': actorBQuick.localUserId,
      'x-projed-expected-context-id': actorBQuick.contextId,
    },
    body: JSON.stringify({
      captureId: quickCapture.captureId,
      title: 'Different title',
      workspaceHint: null,
    }),
  });
  assert.equal(quickConflict.status, 409);
  assert.equal((await quickConflict.json() as { error: { code: string } }).error.code, 'QUICK_TASK_IDEMPOTENCY_CONFLICT');
  const quickCrossSite = await fetch(`${base}/api/v1/quick-tasks`, {
    method: 'POST',
    headers: { cookie: '__session=qa-b-quick', origin: 'https://evil.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({
      captureId: 'task_workbench_unplaced_82222222-2222-4222-8222-222222222222',
      title: 'Cross-site forged',
      workspaceHint: null,
    }),
  });
  assert.equal(quickCrossSite.status, 403);
  const quickEntryWorkbenchRead = await fetch(`${base}/api/v1/task-workbench/unplaced`, {
    headers: { cookie: '__session=qa-b-quick' },
  });
  assert.equal(quickEntryWorkbenchRead.status, 403);
  const unplacedRoot = {
    id: 'placement-root', workspaceId: 'ws-b', boardId: '__task_workbench_unplaced__', parentId: null,
    title: 'Placement root', detailNotes: [], status: 'todo' as const,
    assigneeIds: [actorB.localUserId], collaboratorIds: [], tagIds: [], nodeType: 'group' as const,
    order: 1, createdAt: Date.now(), updatedAt: Date.now(), isArchived: false,
  };
  const unplacedChild = {
    ...unplacedRoot,
    id: 'placement-child', parentId: unplacedRoot.id, title: 'Placement child',
    nodeType: 'task' as const, order: 0.5,
  };
  await assert.rejects(
    taskWorkbenchBRaw.upsert(unplacedRoot, taskWorkbenchAActor),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'ACTOR_CHANGED',
  );
  await assert.rejects(
    taskWorkbenchBRaw.list(taskWorkbenchAActor),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'ACTOR_CHANGED',
  );
  assert.deepEqual((await taskWorkbenchB.list()).map(task => task.id), [quickCapture.captureId]);
  await taskWorkbenchB.upsert(unplacedRoot);
  await taskWorkbenchB.upsert(unplacedChild);
  const stagedUnplaced = await taskWorkbenchB.list();
  assert.deepEqual(stagedUnplaced.map(task => task.id).sort(), [
    quickCapture.captureId, unplacedRoot.id, unplacedChild.id,
  ].sort());
  assert.equal(stagedUnplaced.find(task => task.id === unplacedChild.id)?.parentId, unplacedRoot.id);
  assert.equal(stagedUnplaced.find(task => task.id === unplacedChild.id)?.order, 0.5);
  await assert.rejects(
    taskWorkbenchB.upsert({ ...unplacedRoot, parentId: unplacedChild.id }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 400 && error.code === 'DOMAIN_DATA_INVALID',
  );
  await assert.rejects(
    taskWorkbenchB.upsert({ ...unplacedRoot, id: 'placement-archived', isArchived: true }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 400 && error.code === 'DOMAIN_DATA_INVALID',
  );
  assert.deepEqual(await taskWorkbenchA.list(), []);
  await assert.rejects(
    taskWorkbenchA.place({
      commandVersion: 2,
      operationId: 'placement_v2_viewer_denied',
      rootTaskId: 'shared-parent',
      expectedSubtreeIds: ['shared-parent', 'shared-child'],
      source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
      destination: {
        ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
      },
      clientPlatform: 'desktop',
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 403 && error.code === 'ACCESS_DENIED',
  );
  const toBoardCommand: MoveTaskSubtreeCommand = {
    commandVersion: 2,
    operationId: 'placement_v2_http_to_board',
    rootTaskId: unplacedRoot.id,
    expectedSubtreeIds: [unplacedRoot.id, unplacedChild.id],
    source: { kind: 'account_unplaced' },
    destination: {
      ownership: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-private' },
      parentId: null,
      anchorTaskId: 'private-task',
      position: 'before',
    },
    clientPlatform: 'desktop',
  };
  await assert.rejects(
    taskWorkbenchB.place({ ...toBoardCommand, operationId: 'placement_v2_partial', expectedSubtreeIds: [unplacedRoot.id] }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 400 && error.code === 'DOMAIN_DATA_INVALID',
  );
  assert.equal((await taskWorkbenchB.list()).some(task => task.id === unplacedChild.id), true);
  const toBoard = await taskWorkbenchB.place(toBoardCommand);
  assert.deepEqual(toBoard.movedTaskIds, [unplacedRoot.id, unplacedChild.id]);
  assert.equal(toBoard.activityLoggedRemotely, true);
  const placedBoardTasks = new Map((await httpB.listTasks('ws-b', 'board-private')).map(task => [task.id, task]));
  assert.deepEqual([...placedBoardTasks.keys()].sort(), [unplacedRoot.id, unplacedChild.id, 'private-task'].sort());
  assert.deepEqual(
    [placedBoardTasks.get(unplacedRoot.id)?.parentId, placedBoardTasks.get(unplacedRoot.id)?.order],
    [null, 0],
  );
  assert.deepEqual(
    [placedBoardTasks.get(unplacedChild.id)?.parentId, placedBoardTasks.get(unplacedChild.id)?.order],
    [unplacedRoot.id, 0.5],
  );
  assert.deepEqual([placedBoardTasks.get('private-task')?.parentId, placedBoardTasks.get('private-task')?.order], [null, 1]);
  assert.deepEqual(await taskWorkbenchB.place(toBoardCommand), toBoard);
  await assert.rejects(
    taskWorkbenchB.place({
      ...toBoardCommand,
      destination: { ...toBoardCommand.destination, anchorTaskId: null, position: 'append' },
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'TASK_PLACEMENT_IDEMPOTENCY_CONFLICT',
  );
  const crossSitePlacement = await fetch(`${base}/api/v1/task-workbench/placements`, {
    method: 'POST',
    headers: { cookie: '__session=qa-b', origin: 'https://evil.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ ...toBoardCommand, operationId: 'placement_v2_cross_site' }),
  });
  assert.equal(crossSitePlacement.status, 403);
  const toUnplacedCommand: MoveTaskSubtreeCommand = {
    commandVersion: 2,
    operationId: 'placement_v2_http_to_unplaced',
    rootTaskId: unplacedRoot.id,
    expectedSubtreeIds: [unplacedRoot.id, unplacedChild.id],
    source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-private' },
    destination: {
      ownership: { kind: 'account_unplaced' },
      parentId: null,
      anchorTaskId: null,
      position: 'append',
    },
    clientPlatform: 'mobile',
  };
  const toUnplaced = await taskWorkbenchB.place(toUnplacedCommand);
  assert.equal(toUnplaced.direction, 'to_unplaced');
  assert.deepEqual((await httpB.listTasks('ws-b', 'board-private')).map(task => task.id), ['private-task']);
  const returnedUnplaced = new Map((await taskWorkbenchB.list()).map(task => [task.id, task]));
  assert.deepEqual([...returnedUnplaced.keys()].sort(), [quickCapture.captureId, unplacedRoot.id, unplacedChild.id].sort());
  assert.equal(returnedUnplaced.get(quickCapture.captureId)?.parentId, null);
  assert.equal(returnedUnplaced.get(unplacedRoot.id)?.parentId, null);
  assert.equal(returnedUnplaced.get(unplacedChild.id)?.parentId, unplacedRoot.id);
  assert.equal(returnedUnplaced.get(unplacedChild.id)?.order, 0.5);
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
  await writeB.createTask('ws-b', 'board-shared', {
    id: 'archived-placement-task', workspaceId: 'ws-b', boardId: 'board-shared', parentId: null,
    title: 'Archived placement task', status: 'todo', assigneeIds: [actorB.localUserId], collaboratorIds: [],
    tagIds: [], nodeType: 'task', order: 8, isArchived: true,
  });
  await assert.rejects(
    taskWorkbenchB.place({
      commandVersion: 2,
      operationId: 'placement_v2_archived_rejected',
      rootTaskId: 'archived-placement-task',
      expectedSubtreeIds: ['archived-placement-task'],
      source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
      destination: {
        ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
      },
      clientPlatform: 'desktop',
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 400 && error.code === 'DOMAIN_DATA_INVALID',
  );
  await writeB.deleteTask('ws-b', 'board-shared', 'archived-placement-task');
  assert.equal((await writeB.createDependency('ws-b', 'board-shared', {
    fromId: 'shared-child', fromSide: 'end', toId: 'http-task', toSide: 'start', offset: 0,
  })).toId, 'http-task');
  await assert.rejects(
    taskWorkbenchB.place({
      commandVersion: 2,
      operationId: 'placement_v2_linked_rollback',
      rootTaskId: 'http-task',
      expectedSubtreeIds: ['http-task'],
      source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
      destination: {
        ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
      },
      clientPlatform: 'desktop',
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'TASK_PLACEMENT_LINKED',
  );
  assert.equal((await httpB.listTasks('ws-b', 'board-shared')).some(task => task.id === 'http-task'), true);
  await writeB.createTask('ws-b', 'board-shared', {
    id: 'replay-revocation-task', workspaceId: 'ws-b', boardId: 'board-shared', parentId: null,
    title: 'Replay revocation task', status: 'todo', assigneeIds: [actorB.localUserId], collaboratorIds: [],
    tagIds: [], nodeType: 'task', order: 9, isArchived: false,
  });
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', {
    ...matrixUpdate,
    member: [...matrixUpdate.member, 'move_task'],
  });
  const revokedReplayCommand: MoveTaskSubtreeCommand = {
    commandVersion: 2,
    operationId: 'placement_v2_revoked_replay',
    rootTaskId: 'replay-revocation-task',
    expectedSubtreeIds: ['replay-revocation-task'],
    source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
    destination: {
      ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
    },
    clientPlatform: 'desktop',
  };
  assert.equal((await taskWorkbenchA.place(revokedReplayCommand)).status, 'committed');
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', matrixUpdate);
  await assert.rejects(
    taskWorkbenchA.place(revokedReplayCommand),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 403 && error.code === 'ACCESS_DENIED',
  );
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

  await writeB.createTask('ws-b', 'board-shared', {
    id: 'record-linked-placement-task', workspaceId: 'ws-b', boardId: 'board-shared', parentId: null,
    title: 'Record linked placement task', status: 'todo', assigneeIds: [actorB.localUserId], collaboratorIds: [],
    tagIds: [], nodeType: 'task', order: 10, isArchived: false,
  });
  const httpRecord = await recordsB.upsertRecord('ws-b', 'board-shared', {
    type: 'meeting', title: 'HTTP meeting', content: 'HTTP body', status: 'draft',
    visibility: 'project', occurredAt: Date.now(), taskLinks: [{ nodeId: 'record-linked-placement-task', role: 'related' }],
  });
  assert.equal(httpRecord.title, 'HTTP meeting');
  await assert.rejects(
    taskWorkbenchB.place({
      commandVersion: 2,
      operationId: 'placement_v2_record_linked_rollback',
      rootTaskId: 'record-linked-placement-task',
      expectedSubtreeIds: ['record-linked-placement-task'],
      source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
      destination: {
        ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
      },
      clientPlatform: 'desktop',
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'TASK_PLACEMENT_LINKED',
  );
  await recordsB.upsertRecord('ws-b', 'board-shared', {
    id: httpRecord.id, type: 'meeting', title: 'HTTP meeting', content: 'HTTP body', status: 'draft',
    visibility: 'project', occurredAt: Date.now(), taskLinks: [{ nodeId: 'shared-child', role: 'related' }],
  });
  await writeB.deleteTask('ws-b', 'board-shared', 'record-linked-placement-task');
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

  assert.deepEqual(await trackingB.getCapability(), { supported: true });
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', {
    ...matrixUpdate,
    member: [...matrixUpdate.member, 'manage_task_reference'],
  });
  const rootReferenceInput = {
    operationId: '91000000-0000-4000-8000-000000000001',
    sourcePlacementId: 'primary:shared-parent',
    clientPlatform: 'web' as const,
  };
  const rootReference = await trackingA.create('ws-b', rootReferenceInput);
  assert.equal(rootReference.taskId, 'shared-parent');
  assert.equal(rootReference.boardId, 'board-shared');
  assert.deepEqual(await trackingA.create('ws-b', rootReferenceInput), rootReference);
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', matrixUpdate);
  await assert.rejects(
    trackingA.create('ws-b', rootReferenceInput),
    (error: unknown) => error instanceof TaskTrackingError && error.code === 'PERMISSION_DENIED',
  );
  await assert.rejects(
    trackingB.create('ws-b', {
      ...rootReferenceInput,
      sourcePlacementId: 'primary:shared-child',
    }),
    (error: unknown) => error instanceof TaskTrackingError && error.code === 'OPERATION_ID_CONFLICT',
  );
  const childReference = await trackingB.create('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000002',
    sourcePlacementId: 'primary:shared-child',
    clientPlatform: 'web',
  });
  const nestedChildReference = await trackingB.move('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000003',
    sourcePlacementId: childReference.id,
    expectedRevision: childReference.revision,
    targetBoardId: 'board-shared',
    targetParentPlacementId: rootReference.id,
    position: 'append',
    clientPlatform: 'web',
  });
  assert.equal(nestedChildReference.parentPlacementId, rootReference.id);
  const stagedReference = await trackingB.stage('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000004',
    sourcePlacementId: rootReference.id,
    expectedRevision: rootReference.revision,
    clientPlatform: 'web',
  });
  assert.equal(stagedReference.referenceId, rootReference.id);
  assert.equal((await trackingB.listByWorkspace('ws-b')).some(item => item.id === rootReference.id), false);
  assert.deepEqual((await trackingB.listStagedByWorkspace('ws-b')).map(item => item.referenceId), [rootReference.id]);
  const placedReference = await trackingB.placeStaged('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000005',
    sourcePlacementId: rootReference.id,
    expectedRevision: stagedReference.revision,
    targetBoardId: 'board-shared',
    targetParentPlacementId: null,
    position: 'append',
    clientPlatform: 'web',
  });
  assert.equal(placedReference.id, rootReference.id);
  const nestedAfterPlace = (await trackingB.listByWorkspace('ws-b')).find(item => item.id === childReference.id);
  assert.equal(nestedAfterPlace?.parentPlacementId, rootReference.id);
  await trackingB.remove('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000006',
    sourcePlacementId: rootReference.id,
    expectedRevision: placedReference.revision,
    clientPlatform: 'web',
  });
  assert.equal((await trackingB.listByWorkspace('ws-b')).some(item => item.id === rootReference.id), false);
  const restoredReference = await trackingB.restore('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000007',
    sourcePlacementId: rootReference.id,
    expectedRevision: placedReference.revision + 1,
    clientPlatform: 'web',
  });
  assert.equal(restoredReference.id, rootReference.id);
  assert.equal((await trackingB.listByWorkspace('ws-b')).filter(item => (
    item.id === rootReference.id || item.id === childReference.id
  )).length, 2);

  const privateReference = await trackingB.create('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000008',
    sourcePlacementId: 'primary:private-task',
    clientPlatform: 'web',
  });
  const sharedPrivateReference = await trackingB.move('ws-b', {
    operationId: '91000000-0000-4000-8000-000000000009',
    sourcePlacementId: privateReference.id,
    expectedRevision: privateReference.revision,
    targetBoardId: 'board-shared',
    targetParentPlacementId: null,
    position: 'append',
    clientPlatform: 'web',
  });
  const visibleToViewer = await trackingA.listByWorkspace('ws-b');
  assert.equal(visibleToViewer.some(item => item.id === sharedPrivateReference.id), true);
  const derivedPrivateTask = await trackingA.listCanonicalTasksByIds?.('ws-b', ['private-task']);
  assert.deepEqual(derivedPrivateTask?.map(task => [task.id, task.title, task.boardId]), [
    ['private-task', 'B secret', 'board-private'],
  ]);
  await assert.rejects(
    trackingA.create('ws-b', {
      operationId: '91000000-0000-4000-8000-00000000000a',
      sourcePlacementId: 'primary:shared-parent',
      clientPlatform: 'web',
    }),
    (error: unknown) => error instanceof TaskTrackingError && error.code === 'PERMISSION_DENIED',
  );
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', {
    ...matrixUpdate,
    member: ['manage_task_reference'],
  });
  await trackingA.remove('ws-b', {
    operationId: '91000000-0000-4000-8000-00000000000b',
    sourcePlacementId: sharedPrivateReference.id,
    expectedRevision: sharedPrivateReference.revision,
    clientPlatform: 'web',
  });
  await collaborationB.updateRolePermissions('ws-b', 'board-shared', matrixUpdate);
  await assert.rejects(
    taskWorkbenchB.place({
      commandVersion: 2,
      operationId: 'placement_v2_tracking_reference_blocked',
      rootTaskId: 'shared-parent',
      expectedSubtreeIds: ['shared-parent', 'shared-child', 'http-task'],
      source: { kind: 'board', workspaceId: 'ws-b', boardId: 'board-shared' },
      destination: {
        ownership: { kind: 'account_unplaced' }, parentId: null, anchorTaskId: null, position: 'append',
      },
      clientPlatform: 'desktop',
    }),
    (error: unknown) => error instanceof HttpApiError
      && error.status === 409 && error.code === 'TRACKING_REFERENCE_BLOCKS_UNPLACED',
  );

  const transferTarget = await collaborationB.createWorkspace('HTTP transfer target');
  const targetEquivalentTag = await writeB.createTag(transferTarget.id, {
    id: 'target-http-tag', workspaceId: transferTarget.id,
    name: 'HTTP tag', color: 'purple', order: 1,
  });
  const transferInvite = await collaborationB.createInvite('ws-b', 'board-shared', {
    email: 'transfer-pending@example.invalid',
    tokenHash: createHash('sha256').update('dev139-transfer-pending-token').digest('hex'),
    expiresAt: Date.now() + 60_000,
    defaultRole: 'member',
  });
  assert.equal(transferInvite.status, 'pending');
  const transferPreview = await collaborationB.previewBoardTransfer('ws-b', 'board-shared', transferTarget.id);
  assert.equal(transferPreview.blocked, false);
  assert.equal(transferPreview.counts.preservedMembers, 1);
  assert.equal(transferPreview.counts.removedMembers, 2);
  assert.equal(transferPreview.counts.pendingInvitesToRevoke, 1);
  assert.equal(transferPreview.counts.tasks, 3);
  assert.equal(transferPreview.counts.records, 4);
  await assert.rejects(
    collaborationB.moveBoardToWorkspace('ws-b', 'board-shared', transferTarget.id, 'Wrong title'),
    (error: unknown) => error instanceof HttpApiError && error.status === 409 && error.code === 'DOMAIN_DATA_INVALID',
  );
  assert.equal((await httpB.listTasks('ws-b', 'board-shared')).some(task => task.id === 'http-task'), true);
  const transferResult = await collaborationB.moveBoardToWorkspace(
    'ws-b', 'board-shared', transferTarget.id, transferPreview.boardTitle,
  );
  assert.equal(transferResult.counts.revokedInvites, 1);
  assert.equal((transferResult.counts.remappedTags ?? 0) >= 1, true);
  await assert.rejects(
    httpB.listTasks('ws-b', 'board-shared'),
    (error: unknown) => error instanceof HttpApiError && error.status === 404 && error.code === 'RESOURCE_NOT_FOUND',
  );
  const transferredTasks = await httpB.listTasks(transferTarget.id, 'board-shared');
  assert.deepEqual(transferredTasks.map(task => task.id), ['shared-parent', 'shared-child', 'http-task']);
  assert.deepEqual(
    transferredTasks.find(task => task.id === 'http-task')?.tagIds,
    [targetEquivalentTag.id],
  );
  const transferredReferences = await trackingB.listByWorkspace(transferTarget.id);
  assert.equal(transferredReferences.some(item => item.id === rootReference.id), true);
  assert.equal(transferredReferences.some(item => item.id === childReference.id), true);
  assert.equal(transferredReferences.some(item => item.id === sharedPrivateReference.id), false);
  assert.deepEqual(
    (await httpB.listBoardMembers(transferTarget.id, 'board-shared')).map(member => member.userId),
    [actorB.localUserId],
  );
  assert.equal((await recordsB.listRecords(transferTarget.id, 'board-shared')).length, 2);
  assert.equal((await recordsB.listRecordsByTask(
    transferTarget.id, 'board-shared', 'shared-child', { includeArchived: true },
  )).some(record => record.id === httpRecord.id && record.status === 'archived'), true);
  const movedRecordCount = await runActorTransaction(database, config, actorB, async port => {
    const result = await port.query<{ count: string }>(`
      SELECT count(*)::text AS count
        FROM projed_core.knowledge_records record
        JOIN projed_core.projects project
          ON project.tenant_id = record.tenant_id AND project.id = record.project_id
        JOIN projed_core.tenants tenant ON tenant.id = project.tenant_id
       WHERE tenant.legacy_workspace_id = $1 AND project.legacy_board_id = $2
    `, [transferTarget.id, 'board-shared']);
    return Number(result.rows[0]!.count);
  });
  assert.equal(movedRecordCount, 4);
  assert.equal((await recordsB.listActivity({
    workspaceId: transferTarget.id, boardId: 'board-shared', scope: 'board',
    startedAt: 0, endedAt: Date.now() + 1_000, eventTypes: ['project_workspace_transferred'],
  })).length, 1);
  const postTransferRevisions = await collaborationB.listResourceRevisions();
  assert.equal(postTransferRevisions.some(item => item.workspaceId === 'ws-b' && item.boardId === 'board-shared'), false);
  assert.equal(postTransferRevisions.some(item => (
    item.workspaceId === transferTarget.id && item.boardId === 'board-shared'
  )), true);

  const backupA = createHttpBackupAdapter(clientFor('qa-a', actorA));
  const backupC = createHttpBackupAdapter(clientFor('qa-c', actorC));
  const sourcePackage = await createBackupPackage(
    await backupA.readBoardSource('ws-a', 'board-a'),
    'http',
    'dev139-w11',
  );
  const tamperedPackage = structuredClone(sourcePackage);
  tamperedPackage.payload.board.title = `${tamperedPackage.payload.board.title} tampered`;
  await assert.rejects(
    backupA.planImport({
      package: tamperedPackage,
      mode: 'copy_to_new_board',
      target: { workspaceId: 'ws-a', workspaceTitle: 'A', boardTitle: tamperedPackage.payload.board.title },
    }),
    (error: unknown) => error instanceof BackupError && error.code === 'CHECKSUM_MISMATCH',
  );
  const deniedPlan = await backupC.planImport({
    package: sourcePackage,
    mode: 'copy_to_new_board',
    target: { workspaceId: 'ws-a', workspaceTitle: 'A', boardTitle: sourcePackage.payload.board.title },
  });
  assert.equal(deniedPlan.allowed, false);
  assert.equal(deniedPlan.blockers.some(blocker => blocker.code === 'PERMISSION_DENIED'), true);
  const copyPlan = await backupA.planImport({
    package: sourcePackage,
    mode: 'copy_to_new_board',
    target: { workspaceId: 'ws-a', workspaceTitle: 'A', boardTitle: sourcePackage.payload.board.title },
  });
  assert.equal(copyPlan.allowed, true);
  const copyResult = await backupA.executeImport({
    package: sourcePackage,
    plan: copyPlan,
    newBoardTitle: 'DEV-139 backup copy',
  });
  assert.equal(copyResult.idempotentReplay, false);
  assert.equal(copyResult.targetBoardTitle, 'DEV-139 backup copy');
  assert.equal((await backupA.readBoardSource('ws-a', copyResult.targetBoardId)).tasks.length, sourcePackage.payload.tasks.length);
  assert.equal(await backupA.readBoardFingerprint('ws-a', copyResult.targetBoardId), copyResult.postWriteFingerprint);
  const replayedCopy = await backupA.executeImport({
    package: sourcePackage,
    plan: copyPlan,
    newBoardTitle: 'DEV-139 backup copy',
  });
  assert.equal(replayedCopy.idempotentReplay, true);
  assert.equal(replayedCopy.targetBoardId, copyResult.targetBoardId);
  await assert.rejects(
    backupA.executeImport({ package: sourcePackage, plan: copyPlan, newBoardTitle: 'Changed replay title' }),
    (error: unknown) => error instanceof BackupError && error.code === 'IMPORT_ROLLED_BACK',
  );

  const staleReplacePlan = await backupA.planImport({
    package: sourcePackage,
    mode: 'replace_current_board',
    target: { workspaceId: 'ws-a', workspaceTitle: 'A', boardId: 'board-a', boardTitle: sourcePackage.payload.board.title },
  });
  assert.equal(staleReplacePlan.allowed, true);
  await writeA.createTask('ws-a', 'board-a', {
    id: 'backup-stale-change', workspaceId: 'ws-a', boardId: 'board-a', parentId: null,
    title: 'Must survive stale plan', status: 'todo', order: 999,
    assigneeIds: [], collaboratorIds: [], tagIds: [],
  });
  await assert.rejects(
    backupA.executeImport({ package: sourcePackage, plan: staleReplacePlan }),
    (error: unknown) => error instanceof BackupError && error.code === 'TARGET_CHANGED',
  );
  assert.equal((await backupA.readBoardSource('ws-a', 'board-a')).tasks.some(task => task.id === 'backup-stale-change'), true);
  const replacePlan = await backupA.planImport({
    package: sourcePackage,
    mode: 'replace_current_board',
    target: { workspaceId: 'ws-a', workspaceTitle: 'A', boardId: 'board-a', boardTitle: sourcePackage.payload.board.title },
  });
  assert.equal(replacePlan.allowed, true);
  assert.equal(replacePlan.counts.delete, 1);
  const replaceResult = await backupA.executeImport({ package: sourcePackage, plan: replacePlan });
  assert.equal(replaceResult.idempotentReplay, false);
  assert.equal((await backupA.readBoardSource('ws-a', 'board-a')).tasks.some(task => task.id === 'backup-stale-change'), false);
  assert.equal(await backupA.readBoardFingerprint('ws-a', 'board-a'), replaceResult.postWriteFingerprint);
  assert.equal((await backupA.executeImport({ package: sourcePackage, plan: replacePlan })).idempotentReplay, true);
  const missingBackupOrigin = await fetch(`${base}/api/v1/backup/import/plan`, {
    method: 'POST',
    headers: { cookie: '__session=qa-a', 'content-type': 'application/json' },
    body: JSON.stringify({ package: sourcePackage, mode: 'copy_to_new_board', target: copyPlan.target }),
  });
  assert.equal(missingBackupOrigin.status, 403);

  const missingSession = await fetch(`${base}/api/v1/workspaces`);
  assert.equal(missingSession.status, 401);
  assert.equal(missingSession.headers.get('cache-control'), 'no-store');
  assert.equal((await missingSession.json() as { error: { code: string } }).error.code, 'ACTOR_INVALID');
  const wrongMethod = await fetch(`${base}/api/v1/workspaces`, { method: 'PUT' });
  assert.equal(wrongMethod.status, 405);
  await sessionB.logout();
  assert.equal(destroyedSessionCount, 1);
  const unknownApi = await fetch(`${base}/api/v1/not-supported`, { headers: { cookie: '__session=qa-a' } });
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
    'production-collaboration-disabled', 'production-quick-task-disabled',
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
    'http-quick-task-idempotency-owner-isolation-and-origin-deny',
    'http-workbench-owner-crud-entry-isolation-and-atomic-bidirectional-placement',
    'http-workbench-permission-partial-subtree-idempotency-linked-rollback-and-origin-deny',
    'http-tracking-reference-subtree-staging-idempotency-derived-read-and-unplaced-guard',
    'http-board-transfer-preview-confirmation-rollback-data-permission-and-revision-continuity',
    'http-backup-copy-replace-stale-rollback-idempotency-rls-and-origin',
  ],
}));
