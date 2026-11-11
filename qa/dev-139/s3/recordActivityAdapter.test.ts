import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpRecordActivityAdapter } from '../../../src/services/httpApi/recordActivityAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

test('record adapter scopes update identity to the path and strips server-owned fields', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const adapter = createHttpRecordActivityAdapter(new HttpApiClient(async (input, init) => {
    captures.push({ path: String(input), init });
    return json({
      data: {
        id: 'record A', workspaceId: 'workspace A', boardId: 'board?#B', type: 'meeting',
        title: 'Review', content: '', status: 'draft', visibility: 'private', ragEnabled: false,
        createdAt: 1, updatedAt: 1, taskLinks: [],
      },
    });
  }));

  await adapter.upsertRecord('workspace A', 'board?#B', {
    id: 'record A', type: 'meeting', title: 'Review', content: '', status: 'draft',
    visibility: 'private', occurredAt: 1, taskLinks: [],
  });

  assert.equal(captures[0]?.path, '/api/v1/workspaces/workspace%20A/boards/board%3F%23B/records/record%20A');
  assert.equal(captures[0]?.init?.method, 'PUT');
  assert.deepEqual(JSON.parse(String(captures[0]?.init?.body)), {
    id: 'record A', type: 'meeting', title: 'Review', content: '', status: 'draft',
    visibility: 'private', occurredAt: 1, taskLinks: [],
  });
});

test('activity adapter rejects an unknown event type from the server', async () => {
  const adapter = createHttpRecordActivityAdapter(new HttpApiClient(async () => json({ data: [{
    id: 'event-a', workspaceId: 'ws-a', boardId: 'board-a', actorId: null,
    eventType: 'task_updated', entityTable: 'wbs_items', entityId: 'task-a', payload: {}, createdAt: 1,
  }] })));

  await assert.rejects(adapter.listActivity({
    workspaceId: 'ws-a', boardId: 'board-a', scope: 'board', startedAt: 0, endedAt: 1,
  }), /HTTP_API_INVALID_ACTIVITY_EVENT_TYPE/);
});
