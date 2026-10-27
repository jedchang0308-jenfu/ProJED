import assert from 'node:assert/strict';
import test from 'node:test';

import type { CalendarSubscriptionInput } from '../../../src/services/supabase/calendarSubscriptionService';
import { createHttpCalendarAdapter } from '../../../src/services/httpApi/calendarAdapter';
import type { ProjedDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';

const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const subscription = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '工作行事曆',
  filters: { version: 4, v4_scope_type: 'per_board_filter_snapshot', workspace_ids: ['ws'], project_ids: ['board'], board_filters: {} },
  isActive: true,
  expiresAt: null,
  lastAccessedAt: null,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

const reads: ProjedDomainReadAdapter = {
  async listWorkspaces() { return []; },
  async listWorkspaceMembers(workspaceRef) {
    return [{ workspaceId: workspaceRef, userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'owner', status: 'active',
      profile: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test', displayName: 'A' } }];
  },
  async listTags() { return []; },
  async listBoardMembers() { return []; },
  async getBoardRolePermissions() { throw new Error('not used'); },
  async listTasks() { return []; },
  async listDependencies() { return []; },
};

test('calendar adapter uses actor-bound lifecycle routes and reveals feed URLs only on create or rotate', async () => {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    const path = String(input);
    captures.push({ path, init });
    if (path.endsWith('/references')) return json({ data: {
      workspaces: [{ id: 'aaaaaaaa-1000-4000-8000-000000000001', appWorkspaceId: 'ws-a', name: 'A' }],
      boards: [{ id: 'bbbbbbbb-1000-4000-8000-000000000001', appBoardId: 'board-a', name: 'Board',
        workspaceId: 'aaaaaaaa-1000-4000-8000-000000000001', appWorkspaceId: 'ws-a', workspaceName: 'A', path: 'A / Board' }],
    } });
    if (path === '/api/v1/calendar-subscriptions' && (init?.method ?? 'GET') === 'GET') {
      return json({ data: [subscription] });
    }
    if (path === '/api/v1/calendar-subscriptions' && init?.method === 'POST') {
      return json({ data: { subscription, feedUrl: '/api/v1/calendar-feeds/abcdefghijklmnopqrstuvwxyzABCDEFGH123456789.ics' } });
    }
    if (path.endsWith('/rotate-token')) {
      return json({ data: '/api/v1/calendar-feeds/ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210abcdefg.ics' });
    }
    if (init?.method === 'PATCH') return json({ data: { ...subscription, name: '更新' } });
    return json({ data: null });
  });
  client.bindExpectedActor({
    accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contextId: '51111111-1111-4111-8111-111111111111',
  });
  const adapter = createHttpCalendarAdapter(client, reads);
  const input = { name: '工作行事曆', filters: subscription.filters } as CalendarSubscriptionInput;

  assert.equal((await adapter.list())[0]?.name, '工作行事曆');
  assert.equal((await adapter.listWorkspaceRefs())[0]?.appWorkspaceId, 'ws-a');
  assert.equal((await adapter.listBoardRefs(['ws-a']))[0]?.appBoardId, 'board-a');
  assert.equal((await adapter.listWorkspaceMembers(['ws-a']))[0]?.displayName, 'A');
  assert.match((await adapter.create(input)).feedUrl, /^\/api\/v1\/calendar-feeds\//u);
  assert.equal((await adapter.update(subscription.id, { ...input, name: '更新' })).name, '更新');
  await adapter.setActive(subscription.id, false);
  await adapter.setActive(subscription.id, true);
  assert.match(await adapter.rotate(subscription.id), /^\/api\/v1\/calendar-feeds\//u);
  await adapter.delete(subscription.id);

  assert.deepEqual(captures.map(({ path, init }) => [path, init?.method ?? 'GET']), [
    ['/api/v1/calendar-subscriptions', 'GET'],
    ['/api/v1/calendar-subscriptions/references', 'GET'],
    ['/api/v1/calendar-subscriptions/references', 'GET'],
    ['/api/v1/calendar-subscriptions/references', 'GET'],
    ['/api/v1/calendar-subscriptions', 'POST'],
    [`/api/v1/calendar-subscriptions/${subscription.id}`, 'PATCH'],
    [`/api/v1/calendar-subscriptions/${subscription.id}/disable`, 'POST'],
    [`/api/v1/calendar-subscriptions/${subscription.id}/enable`, 'POST'],
    [`/api/v1/calendar-subscriptions/${subscription.id}/rotate-token`, 'POST'],
    [`/api/v1/calendar-subscriptions/${subscription.id}`, 'DELETE'],
  ]);
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal(headers.get('x-projed-expected-context-id'), '51111111-1111-4111-8111-111111111111');
  }
});

test('calendar adapter rejects any management row that exposes malformed data', async () => {
  const client = new HttpApiClient(async () => json({ data: [{ ...subscription, tokenHash: 'secret', isActive: 'yes' }] }));
  client.bindExpectedActor({ accountId: 'a', contextId: 'b' });
  await assert.rejects(createHttpCalendarAdapter(client, reads).list(), /INVALID_CALENDAR_SUBSCRIPTION/u);
});
