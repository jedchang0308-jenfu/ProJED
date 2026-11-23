import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { request as httpRequest, type Server } from 'node:http';
import test from 'node:test';
import { SignJWT, createLocalJWKSet, exportJWK } from 'jose';

import { createLegacyEntryRelay } from '../../../server/legacyEntryRelay.js';
import { createLegacyEntryRequestPreparer, ENTRY_IDENTITY_HEADER, ENTRY_ORIGIN_HEADER } from '../../../server/legacyEntryOrigin.js';
import { CURRENT_LEGACY_ENTRY_BINDING, LEGACY_ENTRY_ACCOUNT, LEGACY_ENTRY_UPSTREAM,
  LEGACY_MAIN_ORIGIN, LEGACY_QUICK_ORIGIN, type LegacyEntryBinding } from '../../../server/legacyEntryBinding.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createAppSessionService } from '../../../server/appSessionService.js';
import { IdentityConsumer, type ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import type { AppSessionStore, StoredAppSession } from '../../../server/appSessionStore.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import type { PlatformHandoffBinding } from '../../../server/platformHandoff.js';
import { KernelError } from '../../../server/errors.js';

const binding: LegacyEntryBinding = { version: 'projed.legacy-entry.v1', upstreamOrigin: LEGACY_ENTRY_UPSTREAM,
  serviceAccount: LEGACY_ENTRY_ACCOUNT, serviceAccountSubject: '123456789012345678901', qualificationSha256: 'b'.repeat(64) };
const fixtureToken = 'fixture.payload.signature';
const mainHost = new URL(LEGACY_MAIN_ORIGIN).host;
const quickHost = new URL(LEGACY_QUICK_ORIGIN).host;
type Options = NonNullable<Parameters<typeof createLegacyEntryRelay>[1]>;

async function withRelay(options: Options, action: (base: string) => Promise<void>): Promise<void> {
  const server = createLegacyEntryRelay(binding, { getIdentityToken: async () => fixtureToken, ...options });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await close(server);
  }
}
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  });
}
const mainHeaders = { 'x-forwarded-host': mainHost, origin: LEGACY_MAIN_ORIGIN };

test('unpublished relay cannot start or acquire an identity token', () => {
  let calls = 0;
  assert.equal(CURRENT_LEGACY_ENTRY_BINDING, null);
  assert.throws(() => createLegacyEntryRelay(null, { getIdentityToken: async () => { calls++; return fixtureToken; } }), /UNQUALIFIED/);
  assert.throws(() => createLegacyEntryRelay({ ...binding, qualificationSha256: '' }), /UNQUALIFIED/);
  assert.equal(calls, 0);
});

test('relay preserves main/Quick, audio and actor headers; transport credentials never come from the browser', async () => {
  const visited: string[] = [];
  await withRelay({ fetchImpl: async (input, init) => {
    const url = String(input); visited.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(ENTRY_IDENTITY_HEADER), fixtureToken);
    assert.equal(headers.get('x-serverless-authorization'), `Bearer ${fixtureToken}`);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('x-forwarded-host'), null);
    assert.equal(headers.get('cookie'), '__session=opaque');
    assert.equal(headers.get('x-projed-record-id'), 'record:001');
    assert.equal(headers.get('x-projed-source-version'), '7');
    assert.equal(headers.get('x-projed-expected-account-id'), 'account');
    assert.equal(headers.get('x-projed-expected-context-id'), 'context');
    assert.equal(init?.redirect, 'manual'); assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    assert.ok([LEGACY_MAIN_ORIGIN, LEGACY_QUICK_ORIGIN].includes(headers.get(ENTRY_ORIGIN_HEADER)!));
    return new Response('audio', { headers: { 'content-type': 'audio/webm', 'x-projed-expires-at': '123',
      'cache-control': 'public, max-age=3600', 'x-serverless-authorization': 'must-not-leak' } });
  } }, async base => {
    for (const host of [mainHost, quickHost]) {
      const result = await fetch(`${base}/api/v1/meeting-audio/95c1d3df-226a-4e6f-9db5-f0f7f0db9749`, {
        headers: { 'x-forwarded-host': host, authorization: 'Bearer untrusted', cookie: 'other=drop; __session=opaque',
          'x-serverless-authorization': 'Bearer untrusted', 'x-projed-record-id': 'record:001',
          'x-projed-source-version': '7', 'x-projed-expected-account-id': 'account', 'x-projed-expected-context-id': 'context' },
      });
      assert.equal(result.status, 200); assert.equal(await result.text(), 'audio');
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.headers.get('x-projed-expires-at'), '123');
      assert.equal(result.headers.get('x-serverless-authorization'), null);
    }
  });
  assert.equal(visited.length, 2); assert.ok(visited.every(value => value.startsWith(`${LEGACY_ENTRY_UPSTREAM}/api/v1/`)));
});

test('untrusted host/path/method/origin, duplicate cookies and reserved headers never reach upstream', async () => {
  let tokens = 0, calls = 0;
  await withRelay({ getIdentityToken: async () => { tokens++; return fixtureToken; },
    fetchImpl: async () => { calls++; return new Response('unexpected'); } }, async base => {
    for (const headers of [
      { 'x-forwarded-host': 'attacker.invalid' },
      { 'x-forwarded-host': `${mainHost},${quickHost}` },
      { 'x-forwarded-host': mainHost, 'x-fh-requested-host': quickHost },
      { ...mainHeaders, [ENTRY_IDENTITY_HEADER]: fixtureToken },
      { ...mainHeaders, cookie: '__session=one; __session=two' },
    ]) {
      const result = await fetch(`${base}/api/v1/session`, { headers });
      assert.equal(result.status, 403); await result.arrayBuffer();
    }
    for (const path of ['/rest/v1/tasks', '/rpc/arbitrary', '//attacker.invalid/api/v1/session', '/assets/%2fsecret', '/assets/%2e%2e/private']) {
      const result = await fetch(`${base}${path}`, { headers: mainHeaders });
      assert.equal(result.status, 403); await result.arrayBuffer();
    }
    for (const headers of [{ ...mainHeaders, origin: LEGACY_QUICK_ORIGIN }, { ...mainHeaders, 'sec-fetch-site': 'cross-site' }]) {
      const result = await fetch(`${base}/api/v1/quick-captures`, { method: 'POST', headers, body: '{}' });
      assert.equal(result.status, 403); await result.arrayBuffer();
    }
    const result = await fetch(`${base}/sw.js`, { method: 'POST', headers: mainHeaders, body: 'x' });
    assert.equal(result.status, 403); await result.arrayBuffer();
    const options = await fetch(`${base}/api/v1/session`, { method: 'OPTIONS', headers: mainHeaders });
    assert.equal(options.status, 405); await options.arrayBuffer();
  });
  assert.equal(calls, 0);
  assert.equal(tokens, 0);
});

test('legal Chinese record and 12 MiB import envelopes survive relay; oversized bodies do not dispatch', async () => {
  const record = JSON.stringify({ content: '中'.repeat(4 * 1024 * 1024 - 10) });
  const backup = 'b'.repeat(12 * 1024 * 1024);
  const seen: number[] = [];
  await withRelay({ fetchImpl: async (_url, init) => {
    const body = init?.body as Uint8Array;
    seen.push(body.byteLength);
    return Response.json({ data: { bytes: body.byteLength } });
  } }, async base => {
    for (const [path, body] of [['/api/v1/records', record], ['/api/v1/backup/import/plan', backup]]) {
      const result = await fetch(`${base}${path}`, { method: 'POST', headers: mainHeaders, body });
      assert.equal(result.status, 200); assert.deepEqual(await result.json(), { data: { bytes: Buffer.byteLength(body!) } });
    }
    // Reject a declared oversized envelope before receiving/allocating it.
    // A browser sending the entire oversized body can observe a reset while
    // the server closes that rejected upload; it must never reach the writer.
    await new Promise<void>((resolve, reject) => {
      const request = httpRequest(`${base}/api/v1/records`, { method: 'POST',
        headers: { ...mainHeaders, 'content-length': String(32 * 1024 * 1024 + 1) } }, response => {
        assert.equal(response.statusCode, 413);
        let body = ''; response.on('data', chunk => { body += String(chunk); });
        response.once('end', () => { assert.match(body, /PAYLOAD_TOO_LARGE/); resolve(); });
      });
      request.once('error', reject); request.flushHeaders();
    });
  });
  assert.deepEqual(seen, [Buffer.byteLength(record), Buffer.byteLength(backup)]);
});

test('large legal record lists stream past 16 MiB without changing bytes or retaining the whole response', async () => {
  const expected = createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024, 65);
  const chunks = 18;
  for (let index = 0; index < chunks; index++) expected.update(chunk);
  let pulls = 0;
  await withRelay({ fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { if (pulls++ < chunks) controller.enqueue(chunk); else controller.close(); },
  }), { headers: { 'content-type': 'application/json' } }) }, async base => {
    const response = await fetch(`${base}/api/v1/records`, { headers: mainHeaders });
    assert.equal(response.status, 200);
    const digest = createHash('sha256'); let size = 0;
    for await (const part of response.body!) { size += part.byteLength; digest.update(part); }
    assert.equal(size, chunks * chunk.byteLength);
    assert.equal(digest.digest('hex'), expected.digest('hex'));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('callbacks preserve host-only secure cookies and no-referrer; unsafe redirects/cookies are refused without following them', async () => {
  let calls = 0;
  const safeCookie = '__session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax';
  const results = [
    { location: '/?task=task-001', 'set-cookie': safeCookie },
    { location: 'https://attacker.invalid/exfiltrate' },
    { location: '//attacker.invalid/exfiltrate' },
    { location: '/', 'set-cookie': `${safeCookie}; Domain=projed-cc78d.web.app` },
    { location: '/', 'set-cookie': '__session=opaque; Path=/quick-task; HttpOnly; Secure; SameSite=Lax' },
    { location: '/', 'set-cookie': '__session=opaque; Path=/; HttpOnly; SameSite=Lax' },
    { location: '/', 'set-cookie': `${safeCookie}; SameSite=None` },
  ];
  await withRelay({ fetchImpl: async () => new Response(null, { status: 303, headers: results[calls++] }) }, async base => {
    for (let index = 0; index < results.length; index++) {
      const response = await fetch(`${base}/api/auth/jenfu-sso/callback?code=isolated-code`, { headers: mainHeaders, redirect: 'manual' });
      assert.equal(response.status, index === 0 ? 303 : 503);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      if (index === 0) {
        assert.equal(response.headers.get('set-cookie'), safeCookie);
        assert.equal(response.headers.get('location'), '/?task=task-001');
      } else {
        assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('location'), null);
        assert.deepEqual(await response.json(), { error: { code: 'DB_COMMIT_UNKNOWN', retryable: false } });
      }
    }
  });
  assert.equal(calls, results.length);
});

test('ambiguous dispatched mutations and callback GETs are never retried or reported as committed', async () => {
  let calls = 0;
  await withRelay({ fetchImpl: async () => { calls++; throw new Error('private upstream token and content'); } }, async base => {
    for (const [path, method] of [['/api/v1/quick-captures', 'POST'], ['/api/auth/jenfu-sso/callback?code=fixture', 'GET']]) {
      const response = await fetch(`${base}${path}`, { method, headers: mainHeaders });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: { code: 'DB_COMMIT_UNKNOWN', retryable: false } });
    }
  });
  assert.equal(calls, 2);
});

test('whole-request deadline bounds stalled identity and fetch providers without late dispatch', async () => {
  for (const stage of ['identity', 'fetch'] as const) {
    let calls = 0;
    let resolve!: (value: never) => void;
    const pending = new Promise<never>(done => { resolve = done; });
    await withRelay({ timeoutMs: 80,
      getIdentityToken: async () => stage === 'identity' ? pending : fixtureToken,
      fetchImpl: async () => { calls++; return pending; },
    }, async base => {
      const response = await fetch(`${base}/api/v1/quick-captures`, { method: 'POST', headers: mainHeaders, body: '{}' });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: { code: stage === 'fetch' ? 'DB_COMMIT_UNKNOWN' : 'DEPENDENCY_UNAVAILABLE', retryable: false } });
      // Resolve the uncooperative fixture after timeout; it must not dispatch.
      resolve((stage === 'identity' ? fixtureToken : new Response('late')) as never);
      await new Promise<void>(done => setImmediate(done));
    });
    assert.equal(calls, stage === 'fetch' ? 1 : 0);
  }
});

test('stalled incoming body times out before token/upstream; a disconnected browser aborts one dispatched request', async () => {
  let tokens = 0, calls = 0;
  await withRelay({ timeoutMs: 80, getIdentityToken: async () => { tokens++; return fixtureToken; },
    fetchImpl: async () => { calls++; return new Response(); } }, async base => {
    await new Promise<void>((resolve, reject) => {
      const request = httpRequest(`${base}/api/v1/records`, { method: 'POST', headers: { ...mainHeaders, 'content-length': '100' } }, response => {
        assert.equal(response.statusCode, 503); response.resume(); response.once('end', resolve);
      });
      request.on('error', reject); request.write('partial');
    });
  });
  assert.equal(tokens, 0); assert.equal(calls, 0);

  let dispatched!: () => void;
  const started = new Promise<void>(resolve => { dispatched = resolve; });
  let aborted!: () => void;
  const cancelled = new Promise<void>(resolve => { aborted = resolve; });
  await withRelay({ fetchImpl: async (_url, init) => {
    calls++; dispatched();
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted(); reject(new Error('aborted')); }, { once: true });
    });
  } }, async base => {
    const request = httpRequest(`${base}/api/v1/quick-captures`, { method: 'POST', headers: mainHeaders });
    request.on('error', () => undefined); request.end('{}');
    await started; request.destroy(); await cancelled;
  });
  assert.equal(calls, 1);
});

test('HEAD, conditional static responses and decompressed bodies retain their existing protocol', async () => {
  await withRelay({ fetchImpl: async (_url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '2048', 'cache-control': 'no-cache' } });
    if (headers.get('if-none-match') === '"v1"') return new Response(null, { status: 304, headers: { etag: '"v1"' } });
    return new Response('decoded', { headers: { 'content-encoding': 'gzip', 'content-length': '100', 'service-worker-allowed': '/' } });
  } }, async base => {
    const head = await fetch(`${base}/sw.js`, { method: 'HEAD', headers: mainHeaders });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '2048'); assert.equal(await head.text(), '');
    const cached = await fetch(`${base}/sw.js`, { headers: { ...mainHeaders, 'if-none-match': '"v1"' } });
    assert.equal(cached.status, 304); assert.equal(cached.headers.get('etag'), '"v1"');
    const decoded = await fetch(`${base}/sw.js`, { headers: mainHeaders });
    assert.equal(decoded.headers.get('content-encoding'), null); assert.equal(decoded.headers.get('content-length'), null);
    assert.equal(decoded.headers.get('service-worker-allowed'), '/'); assert.equal(await decoded.text(), 'decoded');
  });
});

test('a stalled response stream is cancelled and never presented as a complete successful mutation', async () => {
  let calls = 0, cancelled = 0;
  await withRelay({ timeoutMs: 150, fetchImpl: async () => {
    calls++;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); },
      cancel() { cancelled++; },
    }), { headers: { 'content-type': 'application/json' } });
  } }, async base => {
    const result = await fetch(`${base}/api/v1/quick-captures`, { method: 'POST', headers: mainHeaders, body: '{}' });
    await assert.rejects(result.json());
  });
  assert.equal(calls, 1); assert.equal(cancelled, 1);
});

test('real signed transport through HTTP still requires the existing host-bound, unrevoked App Session', async () => {
  const now = Date.now(), seconds = Math.floor(now / 1000);
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = await exportJWK(keys.publicKey);
  const getKey = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'isolated-relay' }] });
  const proof = await new SignJWT({ email: binding.serviceAccount, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'isolated-relay' }).setIssuer('https://accounts.google.com')
    .setAudience(binding.upstreamOrigin).setSubject(binding.serviceAccountSubject).setIssuedAt(seconds).setExpirationTime(seconds + 600).sign(keys.privateKey);
  const identityBinding: PlatformHandoffBinding = { contractVersion: 'jenfu.sso-handoff.v4', issuer: 'https://platform.example.invalid/api/sso',
    manifestSha256: 'c'.repeat(64), audience: 'projed' };
  const identity: ProducerVerifiedIdentity = { ...identityBinding, identityIssuer: 'https://accounts.google.com', identitySubject: 'fixture-person',
    principalId: 'fixture-principal', principalKind: 'personal', googleSubject: 'fixture-person', employeeId: null,
    authEpoch: 1, authenticatedAtMs: now - 2000, revokedBeforeMs: null, sourceSessionExpiresAtMs: now + 3600000,
    issuedAtMs: now - 1000, expiresAtMs: now + 60000, currentStateExpiresAtMs: now + 10000, mappingRevision: '1' };
  const sessionToken = Buffer.alloc(32, 12).toString('base64url');
  let stored: StoredAppSession = { tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
    publicOrigin: LEGACY_MAIN_ORIGIN, entry: 'main', localUserId: '95c1d3df-226a-4e6f-9db5-f0f7f0db9749',
    contextId: '9fcadd06-a3cb-43c2-8d1f-7c17147d0e68', accountGuardRevision: '1', identity, expiresAtMs: now + 600000, revokedAtMs: null };
  const unused = async (): Promise<never> => { throw new Error('This test must not create a login or write data'); };
  const store: AppSessionStore = { begin: unused, readLogin: unused, claim: unused, cancel: unused, reject: unused, complete: unused,
    revokeSession: unused, readSession: async hash => hash === stored.tokenHash ? stored : null };
  const mappings = { resolve: async () => ({ status: 'active' as const, principalId: identity.principalId, identityIssuer: identity.identityIssuer,
    identitySubject: identity.identitySubject, googleSubject: identity.googleSubject, mappingRevision: '1', localUserId: stored.localUserId, accountGuardRevision: '1' }) };
  const consumer = new IdentityConsumer({ pins: [identityBinding], mappings, verifier: { verify: unused } });
  const auth = createAppSessionService({ store, consumer, mappings, binding: identityBinding, pins: [identityBinding],
    origins: { main: LEGACY_MAIN_ORIGIN, quick: LEGACY_QUICK_ORIGIN }, environment: 'production', now: () => now });
  const config = { env: 'disposable', entry: 'main', host: '127.0.0.1', port: 0, staticRoot: process.cwd(),
    profile: { runtime: { timeouts: { requestMillis: 2000 } } } } as unknown as RuntimeConfig;
  const database = { end: async () => undefined } as unknown as RuntimeDatabase;
  const kernel = createKernelHttpServer(config, database, [], {
    prepareLegacyEntry: createLegacyEntryRequestPreparer(binding, { getKey }),
    dispatchAuth: async request => {
      try { const actor = await auth.resolveActor(request); return { matched: true, status: 200, body: { userId: actor.localUserId, entry: actor.entry } }; }
      catch (error) { assert.ok(error instanceof KernelError); return { matched: true, status: error.httpStatus, body: { error: error.code } }; }
    },
  });
  try {
    const address = await kernel.listen();
    await withRelay({ getIdentityToken: async () => proof, fetchImpl: async (input, init) => {
      assert.equal(new URL(String(input)).origin, binding.upstreamOrigin);
      return fetch(`http://${address.host}:${address.port}${new URL(String(input)).pathname}`, init);
    } }, async base => {
      const path = `${base}/api/v1/relay-session-test`;
      const missing = await fetch(path, { headers: mainHeaders }); assert.equal(missing.status, 401); await missing.arrayBuffer();
      const headers = { ...mainHeaders, cookie: `__session=${sessionToken}` };
      const main = await fetch(path, { headers }); assert.equal(main.status, 200);
      assert.deepEqual(await main.json(), { userId: stored.localUserId, entry: 'main' });
      const quick = await fetch(path, { headers: { ...headers, 'x-forwarded-host': quickHost } });
      assert.equal(quick.status, 401); await quick.arrayBuffer();
      stored = { ...stored, revokedAtMs: now };
      const revoked = await fetch(path, { headers }); assert.equal(revoked.status, 401); await revoked.arrayBuffer();
      stored = { ...stored, revokedAtMs: null, accountGuardRevision: '2' };
      const changed = await fetch(path, { headers }); assert.equal(changed.status, 409); await changed.arrayBuffer();
    });
  } finally { await kernel.shutdown(); }
});
