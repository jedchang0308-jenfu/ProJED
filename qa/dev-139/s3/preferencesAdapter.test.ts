import assert from 'node:assert/strict';
import test from 'node:test';

import type { TaskFilterQuery } from '../../../src/features/taskFilters';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import { createHttpPreferencesAdapter } from '../../../src/services/httpApi/preferencesAdapter';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const filters: TaskFilterQuery = {
  version: 6,
  statuses: { mode: 'all', values: [] },
  due: { mode: 'all', buckets: [], withinDays: 7 },
  people: { mode: 'all', ids: [], includeUnassigned: false },
  tags: { mode: 'all', ids: [], includeUntagged: false },
  keyword: '',
};

test('preferences adapter keeps actor-bound layout and task-filter routes scoped', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    const path = String(input);
    captures.push({ path, init });
    if (path === '/api/v1/preferences/layout' && (init?.method ?? 'GET') === 'GET') {
      return json({ data: { workspaceSidebarWidth: 288 } });
    }
    if (path === '/api/v1/preferences/layout') {
      return json({ data: { workspaceSidebarWidth: 320, goalCollapsedColumns: ['status'] } });
    }
    if ((init?.method ?? 'GET') === 'GET') {
      return json({ data: {
        accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        projectId: 'board A',
        preferenceVersion: 6,
        filters,
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
      } });
    }
    return json({ data: null });
  });
  client.bindExpectedActor({
    accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contextId: '51111111-1111-4111-8111-111111111111',
  });
  const adapter = createHttpPreferencesAdapter(client);

  assert.equal((await adapter.readLayout()).workspaceSidebarWidth, 288);
  assert.deepEqual(await adapter.updateLayout({ workspaceSidebarWidth: 320, goalCollapsedColumns: ['status'] }), {
    workspaceSidebarWidth: 320,
    goalCollapsedColumns: ['status'],
  });
  assert.equal((await adapter.readTaskFilter('board A'))?.preferenceVersion, 6);
  await adapter.compareAndSetTaskFilter('board A', 6, filters, '2026-10-27T00:00:00.000Z');
  await adapter.removeTaskFilter('board A', 6);

  assert.deepEqual(captures.map(({ path, init }) => [path, init?.method ?? 'GET']), [
    ['/api/v1/preferences/layout', 'GET'],
    ['/api/v1/preferences/layout', 'PATCH'],
    ['/api/v1/preferences/task-filters/board%20A', 'GET'],
    ['/api/v1/preferences/task-filters/board%20A', 'PUT'],
    ['/api/v1/preferences/task-filters/board%20A?expectedVersion=6', 'DELETE'],
  ]);
  assert.deepEqual(JSON.parse(String(captures[3]?.init?.body)), {
    expectedVersion: 6,
    filters,
    expectedUpdatedAt: '2026-10-27T00:00:00.000Z',
  });
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(headers.get('x-projed-expected-context-id'), '51111111-1111-4111-8111-111111111111');
    assert.equal(capture.init?.credentials, 'same-origin');
  }
});

test('preferences adapter rejects malformed remote preference rows', async () => {
  const client = new HttpApiClient(async () => json({ data: {
    accountId: 'a', projectId: 'board-a', preferenceVersion: '6', filters: [], createdAt: '', updatedAt: '',
  } }));
  client.bindExpectedActor({ accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contextId: '51111111-1111-4111-8111-111111111111' });
  await assert.rejects(createHttpPreferencesAdapter(client).readTaskFilter('board-a'), /INVALID_TASK_FILTER_PREFERENCE/u);
});
