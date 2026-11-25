import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient';

const actor = { accountId: 'account-a', contextId: 'session-a' };
const response = () => Response.json({ data: [] });
const yieldToTasks = () => new Promise<void>(resolve => setImmediate(resolve));

test('board reads share one in-flight request and open at most two network slots', async () => {
  const started: string[] = [];
  const pending: Array<() => void> = [];
  const client = new HttpApiClient(input => {
    started.push(String(input));
    return new Promise(resolve => pending.push(() => resolve(response())));
  });
  client.bindExpectedActor(actor);

  const tags = client.request('/api/v1/workspaces/workspace/tags');
  const duplicate = client.request('/api/v1/workspaces/workspace/tags');
  const tasks = client.request('/api/v1/workspaces/workspace/boards/board/tasks');
  const preferences = client.request('/api/v1/preferences/task-filters/board');
  assert.equal(started.length, 2);
  pending.shift()!();
  await yieldToTasks();
  assert.equal(started.length, 3);
  while (pending.length) pending.shift()!();
  await Promise.all([tags, duplicate, tasks, preferences]);
  assert.equal(started.filter(path => path.endsWith('/tags')).length, 1);
});

test('a transport 429 retries a GET once and never resends a write', async () => {
  const seen: string[] = [];
  const client = new HttpApiClient(async (_input, init) => {
    const method = init?.method ?? 'GET';
    seen.push(method);
    return seen.length === 2 ? response() : new Response('busy', { status: 429 });
  });
  client.bindExpectedActor(actor);
  await client.request('/api/v1/task-workbench/unplaced');
  await assert.rejects(client.request('/api/v1/task-workbench/unplaced/task', {
    method: 'PUT', body: { task: {} },
  }), (error: unknown) => error instanceof HttpApiError && error.code === 'REQUEST_THROTTLED');
  assert.deepEqual(seen, ['GET', 'GET', 'PUT']);
});

test('queued requests never use a changed account or send after cancellation', async () => {
  const started: string[] = [];
  const pending: Array<() => void> = [];
  const client = new HttpApiClient(input => {
    started.push(String(input));
    return new Promise(resolve => pending.push(() => resolve(response())));
  });
  client.bindExpectedActor(actor);
  const first = client.request('/api/v1/first');
  const second = client.request('/api/v1/second');
  const beforeSwitch = client.request('/api/v1/old-scope');
  const abort = new AbortController();
  const beforeAbort = client.request('/api/v1/cancelled', { signal: abort.signal });
  const checks = Promise.all([
    ...[first, second, beforeSwitch].map(result => assert.rejects(result, { code: 'ACTOR_CHANGED' })),
    assert.rejects(beforeAbort, { name: 'AbortError' }),
  ]);
  abort.abort();
  client.bindExpectedActor({ accountId: 'account-b', contextId: 'session-b' });
  while (pending.length) pending.shift()!();
  await checks;
  assert.deepEqual(started, ['/api/v1/first', '/api/v1/second']);
});

test('a retry with a long server delay stays bounded', async () => {
  let attempts = 0;
  const client = new HttpApiClient(async () => {
    attempts++;
    return new Response('busy', { status: 429, headers: { 'retry-after': '10' } });
  });
  await assert.rejects(client.request('/api/v1/workspaces'), { code: 'REQUEST_THROTTLED' });
  assert.equal(attempts, 1);
});
