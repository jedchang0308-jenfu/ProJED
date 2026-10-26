import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
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
