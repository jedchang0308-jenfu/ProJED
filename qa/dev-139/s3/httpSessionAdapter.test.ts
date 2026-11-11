import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpApiClient, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter, validateLoginAuthorizationUrl } from '../../../src/services/httpApi/sessionAdapter.js';

const future = Date.now() + 60_000;
const appOrigin = 'https://projed.example.test';
const state = 'S'.repeat(43);
const challenge = 'C'.repeat(43);

const authorizationUrl = (overrides: Record<string, string> = {}) => {
  const query = new URLSearchParams({
    client_id: 'projed',
    redirect_uri: `${appOrigin}/api/auth/jenfu-sso/callback`,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...overrides,
  });
  return `https://broker.example.test/api/sso/authorize?${query}`;
};

function installWindowOrigin(origin: string): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin } },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  };
}

test('session adapter binds mutations to the session actor and parses the profile', async () => {
  const calls: Array<{ path: string; method: string; body?: string; headers: Headers }> = [];
  const fetcher: HttpApiFetch = async (input, init) => {
    calls.push({
      path: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined,
      headers: new Headers(init?.headers),
    });
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
  assert.equal(calls[0]!.headers.get('x-projed-expected-account-id'), null);
  for (const call of calls.slice(1)) {
    assert.equal(call.headers.get('x-projed-expected-account-id'), 'user-1');
    assert.equal(call.headers.get('x-projed-expected-context-id'), 'context-1');
  }
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

test('session adapter starts same-origin login with the selected app entry and validates the broker URL', async () => {
  const restoreWindow = installWindowOrigin(appOrigin);
  try {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const client = new HttpApiClient(async (input, init) => {
      calls.push({ path: String(input), init });
      return Response.json({ data: { authorizationUrl: authorizationUrl() } });
    });
    client.bindExpectedActor({ accountId: 'stale-account', contextId: 'stale-context' });
    const adapter = createHttpSessionAdapter(client);

    assert.equal(await adapter.startLogin('quick', '/quick-task/?capture=clean'), authorizationUrl());
    assert.equal(await adapter.startLogin('main', '/?board=one'), authorizationUrl());
    assert.deepEqual(calls.map(call => [call.path, call.init?.method]), [
      ['/api/v1/session/login', 'POST'], ['/api/v1/session/login', 'POST'],
    ]);
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      entry: 'quick', returnPath: '/quick-task/?capture=clean',
    });
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
      entry: 'main', returnPath: '/?board=one',
    });
    assert.equal(calls[0]?.init?.credentials, 'same-origin');
    assert.equal(calls[0]?.init?.cache, 'no-store');
    for (const call of calls) {
      assert.equal(new Headers(call.init?.headers).get('x-projed-expected-account-id'), null);
    }
    assert.equal(validateLoginAuthorizationUrl(
      'http://127.0.0.1:4174/api/sso/authorize?client_id=projed'
        + `&redirect_uri=${encodeURIComponent('http://localhost:4173/api/auth/jenfu-sso/callback')}`
        + `&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`,
      'http://localhost:4173',
    ).startsWith('http://127.0.0.1:4174/'), true);
  } finally {
    restoreWindow();
  }
});

test('login URL and return path reject cross-client, duplicate, extra, malformed, and external values', async () => {
  const restoreWindow = installWindowOrigin(appOrigin);
  try {
    const invalidUrls = [
      'javascript:alert(1)',
      authorizationUrl({ client_id: 'platform' }),
      `${authorizationUrl()}&state=${state}`,
      `${authorizationUrl()}&scope=openid`,
      authorizationUrl({ code_challenge: 'short' }),
      authorizationUrl({ state: 'short' }),
      authorizationUrl({ redirect_uri: 'https://other.example.test/api/auth/jenfu-sso/callback' }),
      authorizationUrl().replace('https://broker.example.test', 'http://broker.example.test'),
    ];
    for (const value of invalidUrls) {
      assert.throws(() => validateLoginAuthorizationUrl(value, appOrigin), /HTTP_API_INVALID_LOGIN_URL/);
    }

    let requests = 0;
    const adapter = createHttpSessionAdapter(new HttpApiClient(async () => {
      requests += 1;
      return Response.json({ data: { authorizationUrl: authorizationUrl() } });
    }));
    await assert.rejects(adapter.startLogin('main', 'https://evil.example.test/'), /HTTP_API_INVALID_LOGIN_RETURN_PATH/);
    await assert.rejects(adapter.startLogin('main', '//evil.example.test/'), /HTTP_API_INVALID_LOGIN_RETURN_PATH/);
    assert.equal(requests, 0);
  } finally {
    restoreWindow();
  }
});
