import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient';

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  status: init.status ?? 200,
  headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
});

test('transport uses only same-origin cookie requests with private caching disabled', async () => {
  const captures: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    captures.push({ input, init });
    return json({ data: [] });
  });
  await client.request('/api/v1/workspaces');
  const captured = captures[0];
  assert.ok(captured);
  assert.equal(captured.input, '/api/v1/workspaces');
  assert.equal(captured.init?.credentials, 'same-origin');
  assert.equal(captured.init?.cache, 'no-store');
  assert.equal(captured.init?.redirect, 'error');
  assert.equal(new Headers(captured.init?.headers).get('authorization'), null);
});

test('transport freezes the bound actor on private API requests but not session discovery', async () => {
  const captures: RequestInit[] = [];
  const client = new HttpApiClient(async (_input, init) => {
    captures.push(init ?? {});
    return json({ data: [] });
  });
  client.bindExpectedActor({ accountId: 'user-a', contextId: 'context-a' });
  await client.request('/api/v1/session');
  await client.request('/api/v1/workspaces');
  assert.equal(new Headers(captures[0]?.headers).get('x-projed-expected-account-id'), null);
  assert.equal(new Headers(captures[1]?.headers).get('x-projed-expected-account-id'), 'user-a');
  assert.equal(new Headers(captures[1]?.headers).get('x-projed-expected-context-id'), 'context-a');
});

test('transport rejects absolute, cross-origin and non-v1 paths before fetch', async () => {
  let calls = 0;
  const client = new HttpApiClient(async () => { calls += 1; return json({}); });
  for (const path of [
    'https://evil.invalid/api/v1/workspaces',
    '//evil.invalid/api/v1/workspaces',
    '/api/v2/workspaces',
    '/index.html',
    '/api/v1/workspaces/../session',
    '/api/v1/workspaces/%2e%2e/session',
  ]) {
    await assert.rejects(client.request(path), (error: unknown) => error instanceof HttpApiError && error.code === 'INVALID_API_PATH');
  }
  assert.equal(calls, 0);
});

test('structured API errors preserve stable recovery fields', async () => {
  const client = new HttpApiClient(async () => json({
    error: { code: 'IDENTITY_STATE_UNAVAILABLE', requestId: 'req-7', retryable: true, retryAfterMs: 900 },
  }, { status: 503 }));
  await assert.rejects(client.request('/api/v1/workspaces'), (error: unknown) => {
    assert.ok(error instanceof HttpApiError);
    assert.equal(error.code, 'IDENTITY_STATE_UNAVAILABLE');
    assert.equal(error.status, 503);
    assert.equal(error.requestId, 'req-7');
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterMs, 900);
    return true;
  });
});

test('network failures become retryable dependency errors while AbortError is preserved', async () => {
  const failed = new HttpApiClient(async () => { throw new Error('offline'); });
  await assert.rejects(failed.request('/api/v1/workspaces'), (error: unknown) => (
    error instanceof HttpApiError && error.code === 'DEPENDENCY_UNAVAILABLE' && error.retryable
  ));
  const aborted = new HttpApiClient(async () => { throw new DOMException('aborted', 'AbortError'); });
  await assert.rejects(aborted.request('/api/v1/workspaces'), (error: unknown) => (
    error instanceof DOMException && error.name === 'AbortError'
  ));
});

test('non-JSON success is rejected instead of becoming empty data', async () => {
  const client = new HttpApiClient(async () => new Response('<html>fallback</html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  }));
  await assert.rejects(client.request('/api/v1/workspaces'), (error: unknown) => (
    error instanceof HttpApiError && error.code === 'INVALID_RESPONSE' && error.status === 502 && error.retryable
  ));
});

test('non-JSON denial keeps its HTTP status without inventing an auth error code', async () => {
  const client = new HttpApiClient(async () => new Response('<html>denied</html>', {
    status: 403,
    headers: { 'content-type': 'text/html', 'x-request-id': 'req-html' },
  }));
  await assert.rejects(client.request('/api/v1/workspaces'), (error: unknown) => (
    error instanceof HttpApiError && error.code === 'INVALID_RESPONSE' && error.status === 403
      && error.requestId === 'req-html' && !error.retryable
  ));
});

test('seven read operations use scoped paths and preserve domain identifiers', async () => {
  const paths: string[] = [];
  const responses: Record<string, unknown> = {
    '/api/v1/workspaces': { data: [{ id: 'ws-legacy', title: '私人', boards: [{ id: 'board-legacy', title: '看板', dependencies: [] }] }] },
    '/api/v1/workspaces/ws-legacy/members': { data: [{ workspaceId: 'ws-legacy', userId: 'user-a', role: 'owner', status: 'active' }] },
    '/api/v1/workspaces/ws-legacy/tags': { data: [{ id: 'tag-a', workspaceId: 'ws-legacy', name: 'Tag', color: 'green', order: 1 }] },
    '/api/v1/workspaces/ws-legacy/boards/board-legacy/members': { data: [{ workspaceId: 'ws-legacy', boardId: 'board-legacy', userId: 'guest-a', role: 'viewer' }] },
    '/api/v1/workspaces/ws-legacy/boards/board-legacy/role-permissions': { data: {
      owner: [
        'read_board', 'edit_board_settings', 'move_board_between_workspaces', 'manage_board_members',
        'create_task', 'edit_task', 'move_task', 'delete_task', 'manage_task_reference', 'assign_task',
        'create_dependency', 'delete_dependency', 'read_activity', 'write_activity', 'read_audit', 'write_audit',
      ],
      admin: [], project_manager: ['read_board'], member: ['read_board'], viewer: [],
    } },
    '/api/v1/workspaces/ws-legacy/boards/board-legacy/tasks': { data: [{
      id: 'task-a', workspaceId: 'ws-legacy', boardId: 'board-legacy', parentId: null,
      title: '任務', status: 'todo', order: 1, tagIds: [],
    }] },
    '/api/v1/workspaces/ws-legacy/boards/board-legacy/dependencies': { data: [{
      id: 'dep-a', fromId: 'task-a', fromSide: 'end', toId: 'task-b', toSide: 'start', offset: 0,
    }] },
  };
  const client = new HttpApiClient(async (input) => {
    const path = String(input);
    paths.push(path);
    return json(responses[path]);
  });
  const adapter = createHttpDomainReadAdapter(client);
  assert.equal((await adapter.listWorkspaces())[0]?.id, 'ws-legacy');
  assert.equal((await adapter.listWorkspaceMembers('ws-legacy'))[0]?.status, 'active');
  assert.equal((await adapter.listTags('ws-legacy'))[0]?.id, 'tag-a');
  assert.equal((await adapter.listBoardMembers('ws-legacy', 'board-legacy'))[0]?.userId, 'guest-a');
  const matrix = await adapter.getBoardRolePermissions('ws-legacy', 'board-legacy');
  assert.deepEqual(matrix.admin, []);
  assert.deepEqual(matrix.viewer, []);
  assert.equal((await adapter.listTasks('ws-legacy', 'board-legacy'))[0]?.id, 'task-a');
  assert.equal((await adapter.listDependencies('ws-legacy', 'board-legacy'))[0]?.id, 'dep-a');
  assert.deepEqual(paths, Object.keys(responses));
});

test('resource refs are path-encoded and blank refs fail before dispatch', async () => {
  const paths: string[] = [];
  const adapter = createHttpDomainReadAdapter(new HttpApiClient(async (input) => {
    paths.push(String(input));
    return json({ data: [] });
  }));
  await adapter.listBoardMembers('workspace A', 'board?#B');
  assert.equal(paths[0], '/api/v1/workspaces/workspace%20A/boards/board%3F%23B/members');
  await assert.rejects(adapter.listTasks('workspace/A', 'board-a'), /WORKSPACE_REF/);
  await assert.rejects(adapter.listTasks('', 'board-a'), /WORKSPACE_REF/);
  await assert.rejects(adapter.listTasks('ws', '..'), /BOARD_REF/);
  assert.equal(paths.length, 1);
});

test('malformed DTO and permission capability fail closed', async () => {
  const malformedTask = createHttpDomainReadAdapter(new HttpApiClient(async () => json({ data: [{ id: 'task-a' }] })));
  await assert.rejects(malformedTask.listTasks('ws', 'board'), /TASK_STATUS/);
  const malformedMatrix = createHttpDomainReadAdapter(new HttpApiClient(async () => json({ data: {
    owner: ['read_board'], admin: ['invented_capability'], project_manager: [], member: [], viewer: [],
  } })));
  await assert.rejects(malformedMatrix.getBoardRolePermissions('ws', 'board'), /ROLE_PERMISSIONS_ADMIN/);
  const emptyOwner = createHttpDomainReadAdapter(new HttpApiClient(async () => json({ data: {
    owner: [], admin: [], project_manager: [], member: [], viewer: [],
  } })));
  await assert.rejects(emptyOwner.getBoardRolePermissions('ws', 'board'), /OWNER_FIXED/);
  const invalidRichContent = createHttpDomainReadAdapter(new HttpApiClient(async () => json({ data: [{
    id: 'task-a', workspaceId: 'ws', boardId: 'board', parentId: null, title: '任務', status: 'todo', order: 1,
    detailNotes: [{ id: 'note-a', title: '筆記', content: '內容', richContent: { schema: 'wrong', editorState: 5 } }],
  }] })));
  await assert.rejects(invalidRichContent.listTasks('ws', 'board'), /TASK_DETAIL_NOTES/);
});

test('caller AbortSignal is forwarded to fetch', async () => {
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  const fetcher: HttpApiFetch = async (_input, init) => {
    received = init?.signal;
    return json({ data: [] });
  };
  const adapter = createHttpDomainReadAdapter(new HttpApiClient(fetcher));
  await adapter.listWorkspaces(controller.signal);
  assert.equal(received, controller.signal);
});
