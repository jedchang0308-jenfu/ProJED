import assert from 'node:assert/strict';
import test from 'node:test';

import { TaskTrackingError } from '../../../src/features/taskTracking/errors';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import { createHttpTaskTrackingAdapter } from '../../../src/services/httpApi/taskTrackingAdapter';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const expectedActor = {
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contextId: '51111111-1111-4111-8111-111111111111',
};

const rootId = '10000000-0000-4000-8000-000000000001';
const childId = '10000000-0000-4000-8000-000000000002';
const operationId = '20000000-0000-4000-8000-000000000001';

const reference = (id = rootId, parentPlacementId: string | null = null) => ({
  id,
  taskId: id === rootId ? 'task-root' : 'task-child',
  workspaceId: 'ws-a',
  boardId: 'board-a',
  sourceBoardId: 'source-board',
  parentPlacementId,
  order: id === rootId ? 1 : 2,
  revision: 3,
  createdAt: 100,
  updatedAt: 200,
});

function clientWithCapture(
  responder: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    const path = String(input);
    captures.push({ path, init });
    return responder(path, init);
  });
  client.bindExpectedActor(expectedActor);
  return { client, captures };
}

test('tracking adapter reads capability, active references and staged references with validated shapes', async () => {
  const { client, captures } = clientWithCapture(path => {
    if (path.endsWith('/capability')) return json({ data: { supported: true } });
    if (path.endsWith('/staged')) return json({ data: [{
      referenceId: rootId,
      taskId: 'task-root',
      workspaceId: 'ws-a',
      sourceBoardId: 'source-board',
      originalBoardId: 'board-a',
      originalParentPlacementId: null,
      originalOrder: 4,
      order: 0,
      revision: 4,
      stagedAt: 300,
      updatedAt: 301,
    }] });
    return json({ data: [reference()] });
  });
  const adapter = createHttpTaskTrackingAdapter(client);

  assert.deepEqual(await adapter.getCapability(), { supported: true });
  assert.deepEqual(await adapter.listByWorkspace('ws-a'), [reference()]);
  assert.deepEqual(await adapter.listStagedByWorkspace('ws-a'), [{
    referenceId: rootId,
    taskId: 'task-root',
    workspaceId: 'ws-a',
    sourceBoardId: 'source-board',
    originalBoardId: 'board-a',
    originalParentPlacementId: null,
    originalOrder: 4,
    order: 0,
    revision: 4,
    stagedAt: 300,
    updatedAt: 301,
  }]);
  assert.deepEqual(captures.map(({ path }) => path), [
    '/api/v1/task-tracking/capability',
    '/api/v1/workspaces/ws-a/tracking-references',
    '/api/v1/workspaces/ws-a/tracking-references/staged',
  ]);
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), expectedActor.accountId);
    assert.equal(headers.get('x-projed-expected-context-id'), expectedActor.contextId);
    assert.equal(capture.init?.credentials, 'same-origin');
  }
});

test('create uses the workspace reference path and preserves operation identity', async () => {
  const { client, captures } = clientWithCapture(() => json({ data: reference() }));
  const adapter = createHttpTaskTrackingAdapter(client);
  const created = await adapter.create('ws A', {
    operationId,
    sourcePlacementId: 'primary:task root',
    clientPlatform: 'web',
  });

  assert.equal(created.id, rootId);
  assert.equal(captures[0]?.path, '/api/v1/workspaces/ws%20A/tracking-references');
  assert.equal(captures[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(captures[0]?.init?.body)), {
    operationId,
    sourcePlacementId: 'primary:task root',
    clientPlatform: 'web',
  });
});

test('move includes the exact reference subtree and uses the path placement id', async () => {
  const { client, captures } = clientWithCapture((path) => {
    if (path.endsWith('/tracking-references')) return json({ data: [reference(), reference(childId, rootId)] });
    return json({ data: { ...reference(), boardId: 'board-b', parentPlacementId: null } });
  });
  const adapter = createHttpTaskTrackingAdapter(client);
  await adapter.move('ws-a', {
    operationId,
    sourcePlacementId: rootId,
    expectedRevision: 3,
    targetBoardId: 'board-b',
    targetParentPlacementId: null,
    anchorPlacementId: null,
    position: 'append',
    clientPlatform: 'web',
  });

  assert.deepEqual(captures.map(capture => [capture.path, capture.init?.method]), [
    ['/api/v1/workspaces/ws-a/tracking-references', 'GET'],
    [`/api/v1/workspaces/ws-a/tracking-references/${rootId}/move`, 'POST'],
  ]);
  assert.deepEqual(JSON.parse(String(captures[1]?.init?.body)), {
    operationId,
    sourcePlacementId: rootId,
    expectedRevision: 3,
    targetBoardId: 'board-b',
    targetParentPlacementId: null,
    anchorPlacementId: null,
    position: 'append',
    clientPlatform: 'web',
    expectedSubtreeIds: [rootId, childId],
  });
});

test('tracking adapter maps authorization and stable domain errors', async () => {
  const denied = createHttpTaskTrackingAdapter(new HttpApiClient(async () => json({
    error: { code: 'ACCESS_DENIED', requestId: 'req-1', retryable: false },
  }, 403)));
  await assert.rejects(denied.create('ws-a', { operationId, sourcePlacementId: 'primary:task-root' }), (error: unknown) => (
    error instanceof TaskTrackingError && error.code === 'PERMISSION_DENIED'
  ));

  const duplicate = createHttpTaskTrackingAdapter(new HttpApiClient(async () => json({
    error: { code: 'DUPLICATE_REFERENCE', requestId: 'req-2', retryable: false },
  }, 409)));
  await assert.rejects(duplicate.create('ws-a', { operationId, sourcePlacementId: 'primary:task-root' }), (error: unknown) => (
    error instanceof TaskTrackingError && error.code === 'DUPLICATE_REFERENCE'
  ));
});
