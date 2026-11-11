import assert from 'node:assert/strict';
import test from 'node:test';

import type { TaskNode } from '../../../src/types';
import type { MoveTaskSubtreeCommand } from '../../../src/features/taskWorkbench/taskPlacementCommand';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import { createHttpTaskWorkbenchAdapter } from '../../../src/services/httpApi/taskWorkbenchAdapter';

const task: TaskNode = {
  id: 'unplaced-root', workspaceId: 'ws-a', boardId: '__task_workbench_unplaced__', parentId: null,
  title: 'Unplaced root', status: 'todo', nodeType: 'task', order: 0, createdAt: 1, updatedAt: 1,
};

const command: MoveTaskSubtreeCommand = {
  commandVersion: 2,
  operationId: 'placement_v2_unit',
  rootTaskId: task.id,
  expectedSubtreeIds: [task.id],
  source: { kind: 'account_unplaced' },
  destination: {
    ownership: { kind: 'board', workspaceId: 'ws-a', boardId: 'board-a' },
    parentId: null,
    anchorTaskId: null,
    position: 'append',
  },
  clientPlatform: 'desktop',
};

const expectedActor = {
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contextId: '51111111-1111-4111-8111-111111111111',
};

test('task workbench adapter uses owner-free same-origin CRUD and placement commands', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const adapter = createHttpTaskWorkbenchAdapter(new HttpApiClient(async (input, init) => {
    requests.push({ path: String(input), init });
    const path = String(input);
    if (path.endsWith('/placements')) {
      return new Response(JSON.stringify({ data: {
        operationId: command.operationId,
        status: 'committed',
        direction: 'to_board',
        movedTaskIds: [task.id],
        canonicalNodes: [{ ...task, workspaceId: 'ws-a', boardId: 'board-a', updatedAt: 2 }],
        affectedScopes: [
          { ownership: { kind: 'account_unplaced' }, parentId: null },
          { ownership: command.destination.ownership, parentId: null },
        ],
        activityLoggedRemotely: true,
      } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (init?.method === 'PUT') {
      return new Response(JSON.stringify({ data: task }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: [task] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));

  assert.deepEqual(await adapter.list(expectedActor), [task]);
  assert.equal((await adapter.upsert(task, expectedActor)).id, task.id);
  await adapter.remove(task.id, expectedActor);
  assert.equal((await adapter.place(command, expectedActor)).activityLoggedRemotely, true);
  assert.deepEqual(requests.map(request => [request.init?.method, request.path]), [
    ['GET', '/api/v1/task-workbench/unplaced'],
    ['PUT', '/api/v1/task-workbench/unplaced/unplaced-root'],
    ['DELETE', '/api/v1/task-workbench/unplaced/unplaced-root'],
    ['POST', '/api/v1/task-workbench/placements'],
  ]);
  for (const request of requests) {
    assert.equal(request.init?.credentials, 'same-origin');
    assert.equal(new Headers(request.init?.headers).get('authorization'), null);
  }
  for (const request of requests) {
    assert.equal(new Headers(request.init?.headers).get('x-projed-expected-account-id'), expectedActor.accountId);
    assert.equal(new Headers(request.init?.headers).get('x-projed-expected-context-id'), expectedActor.contextId);
  }
  assert.equal(JSON.stringify(JSON.parse(String(requests[1]?.init?.body))).includes('ownerId'), false);
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), command);
});

test('task workbench adapter rejects malformed committed results', async () => {
  const adapter = createHttpTaskWorkbenchAdapter(new HttpApiClient(async () => new Response(
    JSON.stringify({ data: { status: 'committed', operationId: command.operationId } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )));
  await assert.rejects(adapter.place(command, expectedActor), /HTTP_API_INVALID_PLACEMENT_RESULT/u);
});
