import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient';
import type { TaskNode } from '../../../src/types';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const task: TaskNode = {
  id: 'task-a', workspaceId: 'ws-a', boardId: 'board-a', parentId: null,
  title: 'Task', detailNotes: [], status: 'todo', assigneeIds: [], collaboratorIds: [], tagIds: [],
  order: 1, isArchived: false,
};

test('atomic ordering and notes use scoped HTTP bodies, canonical metadata and abort signals', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const snapshot = { detailNotes: [{ id:'note',title:'Title',content:'Text' }],description:null,updatedAt:123 };
  const patch = { id:task.id,parentId:null,order:1024,status:'todo',storageId:'canonical-task',createdAt:10,updatedAt:123 };
  const adapter = createHttpDomainWriteAdapter(new HttpApiClient(async (input,init) => {
    captures.push({ path:String(input),init });
    return json({ data:String(input).endsWith('tasks:commit-order') ? { nodes:[patch],reopenedParent:false } : { status:'conflict',snapshot } });
  }));
  const signal = new AbortController().signal;
  const result = await adapter.commitBoardOrder({ kind:'create',workspaceId:'ws-a',boardId:'board-a',node:{...task,storageId:'untrusted',updatedAt:999},destination:{parentId:null,position:'append'},protectedTaskIds:[],reopenParent:true },signal);
  assert.deepEqual(result.nodes,[patch]);
  await adapter.commitBoardOrder({ kind:'move',workspaceId:'ws-a',boardId:'board-a',taskId:task.id,sourceParentId:null,destination:{parentId:null,position:'before',anchorId:'other'},protectedTaskIds:['pending'] },signal);
  const cas = await adapter.compareAndSetNotes('ws-a','board-a','task-a',snapshot,snapshot,signal);
  assert.deepEqual(cas,{status:'conflict',snapshot});
  assert.deepEqual(captures.map(value => value.path),[
    '/api/v1/workspaces/ws-a/boards/board-a/tasks:commit-order',
    '/api/v1/workspaces/ws-a/boards/board-a/tasks:commit-order',
    '/api/v1/workspaces/ws-a/boards/board-a/tasks/task-a/notes:compare-and-set',
  ]);
  const body = JSON.parse(String(captures[0]!.init!.body));
  assert.equal(body.node.workspaceId,undefined);
  assert.equal(body.node.storageId,undefined);
  assert.equal(body.node.updatedAt,undefined);
  assert.equal(body.canEdit,undefined);
  assert.equal(body.reopenParent,true);
  assert.deepEqual(JSON.parse(String(captures[1]!.init!.body)), { kind:'move',taskId:task.id,sourceParentId:null,destination:{parentId:null,position:'before',anchorId:'other'},protectedTaskIds:['pending'] });
  assert.deepEqual(JSON.parse(String(captures[2]!.init!.body)),{expected:snapshot,next:snapshot});
  assert.ok(captures.every(value => value.init?.signal === signal));
});

test('atomic write adapters reject malformed results and preserve permission failures', async () => {
  const command = { kind:'move' as const,workspaceId:'ws-a',boardId:'board-a',taskId:task.id,sourceParentId:null,destination:{parentId:null,position:'append' as const},protectedTaskIds:[] };
  const patch = { id:task.id,parentId:null,order:1,status:'todo',storageId:'canonical',createdAt:1,updatedAt:2 };
  for (const result of [{nodes:[],reopenedParent:false},{nodes:[patch,patch],reopenedParent:false},{nodes:[{...patch,order:null}],reopenedParent:false}]) {
    const adapter = createHttpDomainWriteAdapter(new HttpApiClient(async () => json({data:result})));
    await assert.rejects(adapter.commitBoardOrder(command),/HTTP_API_INVALID_TASK_ORDER/);
  }
  const empty = {detailNotes:[],description:null};
  for (const result of [{status:'unknown',snapshot:{...empty,updatedAt:2}},{status:'persisted',snapshot:{detailNotes:[{id:'invalid'}],description:null,updatedAt:2}}]) {
    const adapter = createHttpDomainWriteAdapter(new HttpApiClient(async () => json({data:result})));
    await assert.rejects(adapter.compareAndSetNotes('ws-a','board-a','task-a',empty,empty),/HTTP_API_INVALID_/);
  }
  const denied = createHttpDomainWriteAdapter(new HttpApiClient(async () => json({error:{code:'ACCESS_DENIED',requestId:'qa',retryable:false}},403)));
  await assert.rejects(denied.commitBoardOrder(command),(error:unknown) => error instanceof HttpApiError && error.status === 403);
});

test('write adapter sends scoped JSON commands without bearer credentials', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    captures.push({ path: String(input), init });
    const path = String(input);
    if (path === '/api/v1/workspaces/ws-a/tags') {
      return json({ data: { id: 'tag-a', workspaceId: 'ws-a', name: 'Tag', color: 'green', order: 1 } }, 201);
    }
    return json({ data: task }, path.endsWith('/tasks') ? 201 : 200);
  });
  const adapter = createHttpDomainWriteAdapter(client);
  await adapter.createTask('ws-a', 'board-a', task);
  await adapter.updateTask('ws-a', 'board-a', 'task-a', { title: 'Updated', storageId: 'ignored' });
  await adapter.setTaskTags('ws-a', 'board-a', 'task-a', ['tag-a']);
  await adapter.createTag('ws-a', { id: 'tag-a', workspaceId: 'ws-a', name: 'Tag', color: 'green', order: 1 });

  assert.deepEqual(captures.map(item => [item.init?.method, item.path]), [
    ['POST', '/api/v1/workspaces/ws-a/boards/board-a/tasks'],
    ['PATCH', '/api/v1/workspaces/ws-a/boards/board-a/tasks/task-a'],
    ['PUT', '/api/v1/workspaces/ws-a/boards/board-a/tasks/task-a/tags'],
    ['POST', '/api/v1/workspaces/ws-a/tags'],
  ]);
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.match(headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(headers.get('authorization'), null);
    assert.equal(capture.init?.credentials, 'same-origin');
  }
  assert.deepEqual(JSON.parse(String(captures[1]?.init?.body)), { title: 'Updated' });
});

test('batch commands preserve one request and delete commands send no body', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const adapter = createHttpDomainWriteAdapter(new HttpApiClient(async (input, init) => {
    captures.push({ path: String(input), init });
    return json(String(input).endsWith('tasks:batch-update') ? { data: [task] } : { data: null });
  }));
  const updated = await adapter.batchUpdateTasks('ws-a', 'board-a', [
    { id: 'task-a', data: { order: 2 } },
  ]);
  await adapter.deleteTask('ws-a', 'board-a', 'task-a');
  assert.equal(updated[0]?.id, 'task-a');
  assert.deepEqual(JSON.parse(String(captures[0]?.init?.body)), {
    updates: [{ id: 'task-a', data: { order: 2 } }],
  });
  assert.equal(captures[1]?.init?.method, 'DELETE');
  assert.equal(captures[1]?.init?.body, undefined);
});

test('write adapter encodes resource refs before dispatch', async () => {
  const paths: string[] = [];
  const adapter = createHttpDomainWriteAdapter(new HttpApiClient(async (input) => {
    paths.push(String(input));
    return json({ data: task });
  }));
  await adapter.updateTask('workspace A', 'board?#B', 'task one', { title: 'Updated' });
  assert.equal(paths[0], '/api/v1/workspaces/workspace%20A/boards/board%3F%23B/tasks/task%20one');
  await assert.rejects(adapter.updateTask('workspace/A', 'board-a', 'task-a', { title: 'No' }), /WORKSPACE_REF/);
  await assert.rejects(adapter.deleteTask('', 'board-a', 'task-a'), /WORKSPACE_REF/);
  assert.equal(paths.length, 1);
});

test('board transfer adapter uses explicit preview and confirmed move commands', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const preview = {
    blocked: false, reasons: [], sourceWorkspaceId: 'ws-a', sourceWorkspaceTitle: 'A',
    targetWorkspaceId: 'ws-b', targetWorkspaceTitle: 'B', boardId: 'board-a', boardTitle: 'Board',
    transferLocked: false,
    counts: {
      targetActiveMembers: 1, preservedMembers: 1, removedMembers: 0, tasks: 2,
      dependencies: 1, tagsToMap: 1, documents: 0, records: 1,
      pendingInvitesToRevoke: 0, ragDocumentsToResync: 0,
    },
  };
  const adapter = createHttpCollaborationAdapter(new HttpApiClient(async (input, init) => {
    captures.push({ path: String(input), init });
    return json({ data: preview });
  }));
  assert.equal((await adapter.previewBoardTransfer('ws-a', 'board-a', 'ws-b')).counts.tasks, 2);
  assert.equal((await adapter.moveBoardToWorkspace('ws-a', 'board-a', 'ws-b', 'Board')).boardTitle, 'Board');
  assert.deepEqual(captures.map(item => [item.init?.method, item.path]), [
    ['POST', '/api/v1/workspaces/ws-a/boards/board-a/transfer:preview'],
    ['POST', '/api/v1/workspaces/ws-a/boards/board-a/transfer'],
  ]);
  assert.deepEqual(JSON.parse(String(captures[0]?.init?.body)), { targetWorkspaceId: 'ws-b' });
  assert.deepEqual(JSON.parse(String(captures[1]?.init?.body)), {
    targetWorkspaceId: 'ws-b', expectedBoardTitle: 'Board',
  });
});
