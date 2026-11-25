import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, request } from 'node:http';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import { confirmOriginSwitchDestination, createHttpOriginSwitchAdapter, createSourceOriginSwitchConnection,
  parseOriginSwitchConfig, type OriginSwitchConfig } from '../../../src/features/originSwitch/httpOriginSwitch';
import { captureOriginSwitchLocator, locatorStorageKey, readOriginSwitchLocator } from '../../../src/features/originSwitch/locator';

const id = '11111111-1111-4111-8111-111111111111';
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope = { campaign: 'origin-2026', entry: 'quick' as const, accountId,
  sourceOrigin: 'https://old.example.test', targetOrigin: 'https://new.example.test' };
const config: OriginSwitchConfig = { campaign: scope.campaign, routes: [{ entry: 'quick', sourceOrigin: scope.sourceOrigin,
  targetOrigin: scope.targetOrigin, sourceSessionEntry: 'main', targetSessionEntry: 'quick' }] };
const metadata = () => ({ id, ...scope, expiresAt: Date.now() + 60_000 });
const proof = () => ({ sourceOrigin: scope.sourceOrigin, targetOrigin: scope.targetOrigin, accountId,
  entry: scope.entry, workspaceMatched: true, permissionsMatched: true, expiresAt: Date.now() + 50_000 });
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });

test('config is disabled by null and rejects noncanonical origins and malformed route shape', () => {
  assert.equal(parseOriginSwitchConfig({ data: null }), null);
  assert.deepEqual(parseOriginSwitchConfig({ data: config }), config);
  for (const patch of [{ targetOrigin: 'https://new.example.test/' }, { sourceOrigin: 'https://user@old.example.test' },
    { targetOrigin: 'https://new.example.test?' }, { targetOrigin: 'https://new.example.test#' }, { targetSessionEntry: 'other' }]) {
    assert.throws(() => parseOriginSwitchConfig({ data: { ...config, routes: [{ ...config.routes[0], ...patch }] } }));
  }
});

test('locator is stored before stripping only its fragment, keeps safe path/query, and is never proof', () => {
  const storage = memory(); const events: string[] = [];
  captureOriginSwitchLocator('quick', { hash: `#projed-origin-switch=${id}`, pathname: '/quick-task/', search: '?mode=list' },
    { replaceState: (_data, _title, url) => { events.push(String(url)); assert.equal(readOriginSwitchLocator('quick', storage), id); } }, storage);
  assert.deepEqual(events, ['/quick-task/?mode=list']);
  assert.equal(readOriginSwitchLocator('main', storage), null);
  captureOriginSwitchLocator('quick', { hash: '#projed-origin-switch=https://evil.test', pathname: '/quick-task/', search: '' },
    { replaceState() {} }, storage);
  assert.equal(storage.getItem(locatorStorageKey('quick')), '');
  assert.equal(readOriginSwitchLocator('quick', storage), null);
});

test('source uses real HTTP, fixed same UUID readback after unknown POST, bound headers and no source install prompt', async () => {
  let created = false; let posts = 0; let uuidCalls = 0;
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    calls.push({ method: req.method!, path: req.url!, body });
    assert.equal(req.headers['x-projed-expected-account-id'], accountId);
    assert.equal(req.headers['x-projed-expected-context-id'], 'source-context');
    if (req.method === 'POST') { posts++; created = true; req.socket.destroy(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: created ? { ...metadata(), destination: null } : null }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const client = new HttpApiClient((path, init) => new Promise((resolve, reject) => {
      const connection = request(`http://127.0.0.1:${address.port}${path}`, {
        method: init?.method, headers: Object.fromEntries(new Headers(init?.headers)), signal: init?.signal ?? undefined,
      }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode,
          headers: { 'content-type': 'application/json' } })));
      });
      connection.on('error', reject);
      if (init?.body) connection.write(String(init.body));
      connection.end();
    }));
    client.bindExpectedActor({ accountId, contextId: 'source-context' });
    const opened: string[] = []; const storage = memory();
    const source = createSourceOriginSwitchConnection(scope, client, storage, url => opened.push(url), () => { uuidCalls++; return id; });
    assert.equal(await source.inspectDestination(), null); assert.equal(calls.length, 0);
    await source.openDestination();
    assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'GET']);
    assert.deepEqual(calls[1].body, { id, campaign: scope.campaign, entry: 'quick', targetOrigin: scope.targetOrigin });
    assert.equal(opened[0], `${scope.targetOrigin}/quick-task/#projed-origin-switch=${id}`);
    assert.equal(await source.requestInstall(), 'unavailable');
    assert.equal(posts, 1); assert.equal(uuidCalls, 1);
    assert.equal(await source.inspectDestination(), null);
    assert.equal(calls.at(-1)?.method, 'GET');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('unknown source submit with no committed record keeps the same UUID on explicit retry', async () => {
  let posts = 0; let ids = 0; const storage = memory();
  const client = new HttpApiClient(async (_path, init) => {
    if (init?.method === 'POST') { posts++; throw new Error('network'); }
    return json(null);
  });
  client.bindExpectedActor({ accountId, contextId: 'source' });
  const first = createSourceOriginSwitchConnection(scope, client, storage, () => assert.fail('must not navigate'), () => { ids++; return id; });
  await assert.rejects(first.openDestination());
  const resumed = createSourceOriginSwitchConnection(scope, client, storage, () => assert.fail('must not navigate'), () => { ids++; return id; });
  await assert.rejects(resumed.openDestination());
  assert.equal(ids, 1); assert.equal(posts, 2);
});

test('source intent identity includes the exact context while guide progress stays account-scoped', async () => {
  const storage = memory(); let generated = 0;
  const client = new HttpApiClient(async (_path, init) => init?.method === 'POST'
    ? json({ ...metadata(), id: JSON.parse(String(init.body)).id }) : json(null));
  client.bindExpectedActor({ accountId, contextId: 'first-context' });
  await createSourceOriginSwitchConnection(scope, client, storage, () => undefined, () => { generated++; return id; }).openDestination();
  client.bindExpectedActor({ accountId, contextId: 'second-context' });
  await createSourceOriginSwitchConnection(scope, client, storage, () => undefined,
    () => { generated++; return '22222222-2222-4222-8222-222222222222'; }).openDestination();
  assert.equal(generated, 2);
});

test('only authoritative GET REVISION_CONFLICT permits a fresh id on explicit open', async () => {
  for (const status of [409, 403, 503]) {
    const storage = memory(); let generated = 0; let invalidated = false; let postCount = 0;
    const replacement = '22222222-2222-4222-8222-222222222222';
    const client = new HttpApiClient(async (path, init) => {
      if (init?.method === 'POST') {
        postCount++; return json({ ...metadata(), id: JSON.parse(String(init.body)).id });
      }
      if (invalidated && String(path).endsWith(id)) return new Response(JSON.stringify({ error: {
        code: status === 409 ? 'REVISION_CONFLICT' : 'DEPENDENCY_UNAVAILABLE',
      } }), { status, headers: { 'content-type': 'application/json' } });
      return json(null);
    });
    client.bindExpectedActor({ accountId, contextId: 'source' });
    const source = createSourceOriginSwitchConnection(scope, client, storage, () => undefined,
      () => ++generated === 1 ? id : replacement);
    await source.openDestination(); invalidated = true;
    await assert.rejects(source.inspectDestination()); // A read alone never rotates an id.
    assert.equal(generated, 1);
    if (status === 409) { await source.openDestination(); assert.equal(generated, 2); assert.equal(postCount, 2); }
    else { await assert.rejects(source.openDestination()); assert.equal(generated, 1); assert.equal(postCount, 1); }
  }
});

test('target confirms with its own Quick Session before GET, then later only reads the same id', async () => {
  const methods: string[] = []; const storage = memory();
  const client = new HttpApiClient(async (path, init) => {
    methods.push(`${init?.method} ${path}`);
    if (String(path) === '/api/v1/session') return json({ localUserId: accountId, email: null, displayName: null,
      createdAt: 1, expiresAt: Date.now() + 60_000, authContextId: 'target', entry: 'quick' });
    return json({ ...metadata(), destination: proof() });
  });
  client.bindExpectedActor({ accountId, contextId: 'target' });
  await confirmOriginSwitchDestination(id, config, 'quick', client, scope.targetOrigin, storage);
  assert.deepEqual(methods, ['GET /api/v1/session', `POST /api/v1/origin-switch/intents/${id}/confirm`]);
  await confirmOriginSwitchDestination(id, config, 'quick', client, scope.targetOrigin, storage);
  assert.deepEqual(methods.slice(2), ['GET /api/v1/session', `GET /api/v1/origin-switch/intents/${id}`]);
});

test('unknown target confirmation stays unconfirmed on denied readback and never blindly rePOSTs', async () => {
  let posts = 0; let reads = 0; const storage = memory();
  const client = new HttpApiClient(async (path, init) => {
    if (String(path) === '/api/v1/session') return json({ localUserId: accountId, email: null, displayName: null,
      createdAt: 1, expiresAt: Date.now() + 60_000, authContextId: 'target', entry: 'quick' });
    if (init?.method === 'POST') { posts++; throw new Error('unknown'); }
    reads++; return new Response(JSON.stringify({ error: { code: 'ACCESS_DENIED' } }), { status: 403, headers: { 'content-type': 'application/json' } });
  });
  client.bindExpectedActor({ accountId, contextId: 'target' });
  await assert.rejects(confirmOriginSwitchDestination(id, config, 'quick', client, scope.targetOrigin, storage));
  await assert.rejects(confirmOriginSwitchDestination(id, config, 'quick', client, scope.targetOrigin, storage));
  assert.equal(posts, 1); assert.ok(reads >= 2);
});

test('target wrong Session entry and unconfigured target are denied before confirmation', async () => {
  let posts = 0;
  const client = new HttpApiClient(async (_path, init) => {
    if (init?.method === 'POST') posts++;
    return json({ localUserId: accountId, email: null, displayName: null,
      createdAt: 1, expiresAt: Date.now() + 60_000, authContextId: 'target', entry: 'main' });
  });
  client.bindExpectedActor({ accountId, contextId: 'target' });
  await assert.rejects(confirmOriginSwitchDestination(id, config, 'quick', client, scope.targetOrigin, memory()));
  await assert.rejects(confirmOriginSwitchDestination(id, config, 'quick', client, 'https://lookalike.example.test', memory()));
  assert.equal(posts, 0);
});

test('actor changes and mismatching receipt metadata never authorize destination completion', async () => {
  const client = new HttpApiClient(async () => json({ ...metadata(), accountId: 'other', destination: proof() }));
  client.bindExpectedActor({ accountId, contextId: 'source' });
  const adapter = createHttpOriginSwitchAdapter(client);
  await assert.rejects(adapter.read(id));
  client.bindExpectedActor({ accountId: 'other', contextId: 'other-context' });
  await assert.rejects(adapter.read(id), /ACTOR_CHANGED/u);
});

test('binding observers see same-account context changes, fence clear and can unsubscribe', () => {
  const client = new HttpApiClient(async () => json(null));
  const contexts: Array<string | null> = [];
  const unsubscribe = client.subscribeExpectedActor(() => contexts.push(client.getExpectedActor()?.contextId ?? null));
  client.bindExpectedActor({ accountId, contextId: 'first' });
  const initial = client.getExpectedActor();
  client.bindExpectedActor({ accountId, contextId: 'first' });
  assert.equal(client.getExpectedActor(), initial);
  client.bindExpectedActor({ accountId, contextId: 'second' });
  client.clearExpectedActor(); unsubscribe();
  client.bindExpectedActor({ accountId, contextId: 'third' });
  assert.deepEqual(contexts, ['first', 'second', null]);
});
