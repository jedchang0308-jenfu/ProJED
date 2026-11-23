import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { legacyEntryCheck, legacyEntryMain, legacyEntryPort, stopLegacyEntry } from '../../../server/legacyEntryMain.js';

test('entry check-only ignores runtime/credential env and never contacts a provider', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Check-only must not contact a provider'); };
  try {
    assert.deepEqual(legacyEntryCheck(), { event: 'projed_legacy_entry_check', status: 'CHECK_ONLY',
      transport: 'UNPUBLISHED', upstream: 'NOT_CONTACTED', userAuthority: 'APP_SESSION_REQUIRED', database: 'NOT_CONNECTED', models: 'NOT_RUN' });
    await legacyEntryMain(['--check-only'], { PORT: 'invalid', PROJED_RUNTIME_BINDING_JSON: '{"enabled":true}', PROJED_DATABASE_URL: 'not-a-database' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('unpublished default entry refuses before listen; arguments/env cannot publish it', async () => {
  await assert.rejects(legacyEntryMain([], { PORT: '8080', PROJED_LEGACY_ENTRY_BINDING: '{"enabled":true}' }), /UNQUALIFIED/);
  for (const args of [['--binding=enabled'], ['--check-only', '--listen'], ['unexpected']]) {
    await assert.rejects(legacyEntryMain(args, {}), /ARGUMENT_INVALID/);
  }
  assert.equal(legacyEntryPort(), 8080); assert.equal(legacyEntryPort('65535'), 65535);
  for (const value of ['0', '-1', '65536', '8080.0', ' 8080', '8080/path']) assert.throws(() => legacyEntryPort(value), /PORT_INVALID/);
});

test('entry shutdown lets a normal active response finish and closes its owned listener', async () => {
  let started!: () => void;
  const active = new Promise<void>(resolve => { started = resolve; });
  const server = createServer((_request, response) => { response.write('draft'); started(); setTimeout(() => response.end('-saved'), 30); });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const client = fetch(`http://127.0.0.1:${address.port}`).then(response => response.text());
    await active;
    await stopLegacyEntry(server, 500);
    assert.equal(await client, 'draft-saved'); assert.equal(server.listening, false);
  } finally { server.closeAllConnections(); if (server.listening) await stopLegacyEntry(server, 1); }
});

test('entry shutdown bounds a stalled response and never completes its partial body', async () => {
  const server = createServer((_request, response) => { response.write('partial'); });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    const body = response.text();
    const rejected = assert.rejects(body);
    await stopLegacyEntry(server, 30); await rejected;
    assert.equal(server.listening, false);
  } finally { server.closeAllConnections(); if (server.listening) await stopLegacyEntry(server, 1); }
});
