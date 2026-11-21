import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';

import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createSessionHttpDispatcher } from '../../../server/sessionHttp.js';
import type { ServerActorV1 } from '../../../server/actorTransaction.js';

const config = {
  env: 'disposable',
  entry: 'main',
  host: '127.0.0.1',
  port: 0,
  staticRoot: process.cwd(),
  profile: { runtime: { timeouts: { requestMillis: 2_000, transactionMillis: 2_000,
    statementMillis: 1_000, lockMillis: 1_000, idleInTransactionMillis: 1_000 } } },
} as unknown as RuntimeConfig;

async function withKernel(
  dispatchAuth: NonNullable<Parameters<typeof createKernelHttpServer>[3]>['dispatchAuth'],
  action: (base: string) => Promise<void>,
): Promise<void> {
  const database = { end: async () => undefined } as unknown as RuntimeDatabase;
  const kernel = createKernelHttpServer(config, database, [], { dispatchAuth });
  try {
    const address = await kernel.listen();
    await action(`http://${address.host}:${address.port}`);
  } finally {
    await kernel.shutdown();
  }
}

test('kernel auth dispatcher runs before session and private API fallback and keeps no-store', async () => {
  const visited: string[] = [];
  await withKernel(async (request) => {
    visited.push(request.url ?? '');
    if (request.url !== '/api/v1/session/logout') return { matched: false };
    return {
      matched: true,
      status: 303,
      body: { status: 'redirecting' },
      headers: {
        'Set-Cookie': '__session=opaque; Path=/; HttpOnly; SameSite=Lax',
        Location: '/api/auth/complete',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'public, max-age=3600',
        'X-Not-Allowed': 'discard-me',
      },
    };
  }, async (base) => {
    const response = await fetch(`${base}/api/v1/session/logout`, { method: 'POST', redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/api/auth/complete');
    assert.match(response.headers.get('set-cookie') ?? '', /^__session=opaque;/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-not-allowed'), null);
    assert.deepEqual(await response.json(), { status: 'redirecting' });

    const unknown = await fetch(`${base}/api/v1/not-a-real-route`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(visited, ['/api/v1/session/logout', '/api/v1/not-a-real-route']);
  });
});

test('kernel auth dispatcher errors and unsafe response headers become safe 503 JSON', async () => {
  await withKernel(async (request) => {
    if (request.url === '/api/auth/throws') throw new Error('sensitive token material');
    if (request.url === '/api/auth/unsafe') {
      return { matched: true, status: 303, body: { ok: true }, headers: { Location: '/done\r\nX-Injected: yes' } };
    }
    return { matched: false };
  }, async (base) => {
    const thrown = await fetch(`${base}/api/auth/throws`);
    assert.equal(thrown.status, 503);
    const thrownBody = await thrown.text();
    assert.match(thrownBody, /AUTH_UNAVAILABLE/);
    assert.doesNotMatch(thrownBody, /sensitive token material/);
    assert.equal(thrown.headers.get('cache-control'), 'no-store');

    const unsafe = await fetch(`${base}/api/auth/unsafe`, { redirect: 'manual' });
    assert.equal(unsafe.status, 503);
    assert.equal(unsafe.headers.get('location'), null);
    assert.doesNotMatch(await unsafe.text(), /X-Injected/);
  });
});

test('kernel keeps existing 404 behavior when the auth dispatcher is not configured', async () => {
  await withKernel(undefined, async (base) => {
    const response = await fetch(`${base}/api/auth/not-configured`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

const actor: ServerActorV1 = {
  principalId: 'google:subject',
  localUserId: '95c1d3df-226a-4e6f-9db5-f0f7f0db9749',
  entry: 'main',
  contextId: '9fcadd06-a3cb-43c2-8d1f-7c17147d0e68',
  expiresAtMs: Date.now() + 10_000,
  accountGuardRevision: '1',
};

function incomingRequest(url: string, method: string, headers: Record<string, string>, body = ''): IncomingMessage {
  const stream = Readable.from(body.length > 0 ? [Buffer.from(body)] : []);
  return Object.assign(stream, { url, method, headers }) as unknown as IncomingMessage;
}

function fakeDatabase(): RuntimeDatabase {
  const client = {
    async query(text: string) {
      if (text.includes('actor_context_valid_v1')) return { rows: [{ valid: true }] };
      if (text.includes('FROM projed_core.profiles') || text.includes('UPDATE projed_core.profiles')) {
        return { rows: [{ id: actor.localUserId, email: 'user@example.invalid', display_name: 'User', created_at_ms: '1700000000000' }] };
      }
      return { rows: [] };
    },
  };
  return {
    checkout: async () => ({ client, release: () => undefined }),
  } as unknown as RuntimeDatabase;
}

test('session profile GET and PATCH report AppSession expiry while legacy mode keeps actor expiry', async () => {
  const appSessionExpiry = Date.now() + 60 * 60 * 1000;
  const infoCalls: ServerActorV1[] = [];
  const dispatcher = createSessionHttpDispatcher(
    config,
    fakeDatabase(),
    async () => actor,
    undefined,
    async (_request, resolvedActor) => {
      infoCalls.push(resolvedActor);
      return { expiresAtMs: appSessionExpiry };
    },
  );

  const get = await dispatcher(incomingRequest('/api/v1/session', 'GET', {}), 'get-request');
  assert.equal(get.status, 200);
  assert.equal((get.body as { data: { expiresAt: number } }).data.expiresAt, appSessionExpiry);

  const updateBody = JSON.stringify({ displayName: 'Renamed' });
  const patch = await dispatcher(incomingRequest('/api/v1/session/profile', 'PATCH', {
    origin: 'http://localhost',
    host: 'localhost',
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(updateBody)),
    'x-projed-expected-account-id': actor.localUserId,
    'x-projed-expected-context-id': actor.contextId,
  }, updateBody), 'patch-request');
  assert.equal(patch.status, 200);
  assert.equal((patch.body as { data: { expiresAt: number } }).data.expiresAt, appSessionExpiry);
  assert.equal(infoCalls.length, 2);
  assert.ok(infoCalls.every(value => value === actor));

  const legacy = await createSessionHttpDispatcher(config, fakeDatabase(), async () => actor)(
    incomingRequest('/api/v1/session', 'GET', {}), 'legacy-request',
  );
  assert.equal(legacy.status, 200);
  assert.equal((legacy.body as { data: { expiresAt: number } }).data.expiresAt, actor.expiresAtMs);
});

test('kernel logout clears the cookie only after destroy succeeds and keeps legacy destroyers compatible', async () => {
  const database = { end: async () => undefined } as unknown as RuntimeDatabase;
  let mode: 'clear' | 'legacy' | 'fail' = 'clear';
  const kernel = createKernelHttpServer(config, database, [], {
    resolveActor: async () => actor,
    destroySession: async () => {
      if (mode === 'fail') throw new KernelError('ACTOR_CHANGED', 'stale', 409);
      if (mode === 'legacy') return undefined;
      return { clearCookie: '__session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' };
    },
  });
  try {
    const address = await kernel.listen();
    const base = `http://${address.host}:${address.port}`;
    const logout = () => fetch(`${base}/api/v1/session/logout`, {
      method: 'POST',
      headers: {
        origin: base,
        'x-projed-expected-account-id': actor.localUserId,
        'x-projed-expected-context-id': actor.contextId,
      },
    });

    const cleared = await logout();
    assert.equal(cleared.status, 200);
    assert.match(cleared.headers.get('set-cookie') ?? '', /^__session=;/);
    assert.equal(cleared.headers.get('cache-control'), 'no-store');

    mode = 'legacy';
    const legacy = await logout();
    assert.equal(legacy.status, 200);
    assert.equal(legacy.headers.get('set-cookie'), null);

    mode = 'fail';
    const failed = await logout();
    assert.equal(failed.status, 409);
    assert.equal(failed.headers.get('set-cookie'), null);
  } finally {
    await kernel.shutdown();
  }
});

test('kernel logout uses stored identity metadata when fresh actor validation is revoked', async () => {
  const database = { end: async () => undefined } as unknown as RuntimeDatabase;
  let actorCalls = 0;
  let logoutIdentityCalls = 0;
  let destroyCalls = 0;
  const kernel = createKernelHttpServer(config, database, [], {
    resolveActor: async () => {
      actorCalls += 1;
      throw new KernelError('IDENTITY_INVALID', 'stale identity', 401);
    },
    resolveLogoutIdentity: async () => {
      logoutIdentityCalls += 1;
      return { localUserId: actor.localUserId, contextId: actor.contextId };
    },
    destroySession: async () => {
      destroyCalls += 1;
      return { clearCookie: '__session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' };
    },
  });
  try {
    const address = await kernel.listen();
    const base = `http://${address.host}:${address.port}`;
    const logout = (expectedAccountId: string) => fetch(`${base}/api/v1/session/logout`, {
      method: 'POST',
      headers: {
        origin: base,
        'x-projed-expected-account-id': expectedAccountId,
        'x-projed-expected-context-id': actor.contextId,
      },
    });

    const cleared = await logout(actor.localUserId);
    assert.equal(cleared.status, 200);
    assert.match(cleared.headers.get('set-cookie') ?? '', /^__session=;/u);
    assert.equal(actorCalls, 0);
    assert.equal(logoutIdentityCalls, 1);
    assert.equal(destroyCalls, 1);

    const mismatch = await logout('00000000-0000-4000-8000-000000000001');
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.headers.get('set-cookie'), null);
    assert.equal(destroyCalls, 1);

    const privateRead = await fetch(`${base}/api/v1/session`);
    assert.equal(privateRead.status, 401);
    assert.equal(actorCalls, 1);
  } finally {
    await kernel.shutdown();
  }
});
