import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpApiClient, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';

const future = Date.now() + 60_000;

test('session adapter uses same-origin session endpoints and parses the profile', async () => {
  const calls: Array<{ path: string; method: string; body?: string }> = [];
  const fetcher: HttpApiFetch = async (input, init) => {
    calls.push({ path: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    return Response.json({ data: {
      localUserId: 'user-1', email: 'user@example.invalid', displayName: 'User', createdAt: 1,
      expiresAt: future, authContextId: 'context-1', entry: 'main',
    } });
  };
  const adapter = createHttpSessionAdapter(new HttpApiClient(fetcher));

  assert.equal((await adapter.getSession()).uid, 'user-1');
  assert.equal((await adapter.updateDisplayName('Renamed')).displayName, 'User');
  await adapter.logout();

  assert.deepEqual(calls.map(call => [call.method, call.path]), [
    ['GET', '/api/v1/session'],
    ['PATCH', '/api/v1/session/profile'],
    ['POST', '/api/v1/session/logout'],
  ]);
  assert.deepEqual(JSON.parse(calls[1]!.body!), { displayName: 'Renamed' });
});

test('session adapter rejects expired or malformed server identity', async () => {
  const fetcher: HttpApiFetch = async () => Response.json({ data: {
    localUserId: 'user-1', email: null, displayName: null, createdAt: 1,
    expiresAt: Date.now() - 1, authContextId: 'context-1', entry: 'main',
  } });
  await assert.rejects(
    createHttpSessionAdapter(new HttpApiClient(fetcher)).getSession(),
    /HTTP_API_INVALID_SESSION_DATA/,
  );
});
