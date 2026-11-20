import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { createQuickUpgradeApiProxy } from '../../../scripts/lib/dev139-quick-upgrade-proxy.mjs';

const listen = (server: Server) => new Promise<string>((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    done(`http://127.0.0.1:${address.port}`);
  });
});
const close = (server: Server) => new Promise<void>((done, reject) => {
  server.close(error => error ? reject(error) : done());
  server.closeAllConnections();
});

test('A06 relay preserves the real browser cookie, actor, body and Host/Origin pair', async () => {
  let observed: Record<string, unknown> | null = null;
  const target = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    observed = { path: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') };
    response.writeHead(201, { 'content-type': 'application/json' });
    response.end('{"unmodified":true}');
  });
  const endpoint = await listen(target);
  const proxy = createQuickUpgradeApiProxy(endpoint);
  const surface = createServer(async (request, response) => { await proxy(request, response); });
  try {
    const origin = await listen(surface);
    const body = '{"captureId":"original-key","title":"original title","workspaceHint":null}';
    const response = await fetch(origin + '/api/v1/quick-tasks', { method: 'POST', headers: {
      origin, cookie: '__session=synthetic-fixture-only', 'content-type': 'application/json',
      'x-projed-expected-account-id': 'original-account', 'x-projed-expected-context-id': 'original-context',
    }, body });
    assert.equal(response.status, 201);
    assert.equal(await response.text(), '{"unmodified":true}');
    assert.deepEqual(observed && Object.fromEntries(Object.entries(observed).filter(([key]) => key !== 'headers')),
      { path: '/api/v1/quick-tasks', body });
    const headers = (observed as unknown as { headers: Record<string, string> }).headers;
    assert.equal(headers.host, new URL(origin).host);
    assert.equal(headers.origin, origin);
    assert.equal(headers.cookie, '__session=synthetic-fixture-only');
    assert.equal(headers['x-projed-expected-context-id'], 'original-context');
    assert.equal(headers['x-projed-expected-account-id'], 'original-account');
  } finally { await close(surface); await close(target); }
});

test('A06 relay rejects foreign targets, cross-origin writes and unrelated API paths', async () => {
  for (const target of ['https://example.invalid', 'http://127.0.0.1:7000/private', 'http://user:secret@127.0.0.1:7000']) {
    assert.throws(() => createQuickUpgradeApiProxy(target));
  }
  let calls = 0;
  const target = createServer((_request, response) => { calls++; response.end('{}'); });
  const endpoint = await listen(target);
  const proxy = createQuickUpgradeApiProxy(endpoint);
  const surface = createServer(async (request, response) => { await proxy(request, response); });
  try {
    const origin = await listen(surface);
    const foreign = await fetch(origin + '/api/v1/quick-tasks', { method: 'POST', headers: { origin: 'https://foreign.invalid' }, body: '{}' });
    assert.equal(foreign.status, 403); await foreign.body?.cancel();
    const unrelated = await fetch(origin + '/api/v1/not-allowed');
    assert.equal(unrelated.status, 404); await unrelated.body?.cancel();
    const wrongMethod = await fetch(origin + '/api/v1/session', { method: 'POST', body: '{}' });
    assert.equal(wrongMethod.status, 405); await wrongMethod.body?.cancel();
    assert.equal(calls, 0);
  } finally { await close(surface); await close(target); }
});
