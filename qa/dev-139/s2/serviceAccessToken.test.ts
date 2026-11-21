import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { createServiceAccessTokenProvider } from '../../../server/serviceAccessToken.js';

const ENDPOINT = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const ACCESS_TOKEN = 'ya29.synthetic-access-token';

function metadataResponse(overrides: Record<string, unknown> = {}, status = 200): Response {
  return new Response(JSON.stringify({
    access_token: ACCESS_TOKEN,
    token_type: 'Bearer',
    expires_in: 3599,
    ...overrides,
  }), { status, headers: { 'content-type': 'application/json' } });
}

function isUnavailable(error: unknown): boolean {
  return error instanceof KernelError
    && error.code === 'MEETING_STORAGE_UNAVAILABLE'
    && error.httpStatus === 503;
}

test('fetches a bounded OAuth access token from the fixed metadata endpoint without credentials', async () => {
  let calls = 0;
  const provider = createServiceAccessTokenProvider({
    fetchImpl: async (input, init) => {
      calls += 1;
      assert.equal(String(input), ENDPOINT);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal instanceof AbortSignal);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Metadata-Flavor'), 'Google');
      assert.equal(headers.get('accept'), 'application/json');
      assert.equal(headers.get('authorization'), null);
      return metadataResponse();
    },
  });

  assert.equal(await provider(), ACCESS_TOKEN);
  assert.equal(calls, 1);
});

test('coalesces concurrent requests and refreshes the cache at the 60-second expiry margin', async () => {
  let now = 1_800_000_000_000;
  let calls = 0;
  const provider = createServiceAccessTokenProvider({
    now: () => now,
    fetchImpl: async () => {
      calls += 1;
      return metadataResponse({ access_token: `token-${calls}`, expires_in: 120 });
    },
  });

  const [first, concurrent] = await Promise.all([provider(), provider()]);
  assert.equal(first, 'token-1');
  assert.equal(concurrent, first);
  assert.equal(calls, 1);

  now += 59_999;
  assert.equal(await provider(), 'token-1');
  assert.equal(calls, 1, 'a token remains cached until the 60-second refresh margin');

  now += 1;
  assert.equal(await provider(), 'token-2');
  assert.equal(calls, 2, 'the token refreshes when the 60-second margin is reached');
});

test('fails closed without retry or response-body disclosure for invalid metadata responses', async () => {
  const secretDiagnostic = `private-response-${ACCESS_TOKEN}`;
  const failures: Array<{ name: string; fetchImpl: typeof fetch }> = [
    {
      name: 'non-200 status',
      fetchImpl: async () => new Response(secretDiagnostic, { status: 503 }),
    },
    {
      name: 'redirect response',
      fetchImpl: async () => new Response(secretDiagnostic, {
        status: 302,
        headers: { location: 'http://attacker.invalid/token' },
      }),
    },
    {
      name: 'oversized JSON body',
      fetchImpl: async () => new Response('x'.repeat(16 * 1024 + 1), { status: 200 }),
    },
    {
      name: 'oversized declared body',
      fetchImpl: async () => new Response(secretDiagnostic, {
        status: 200,
        headers: { 'content-length': String(16 * 1024 + 1) },
      }),
    },
    {
      name: 'malformed JSON',
      fetchImpl: async () => new Response(secretDiagnostic, { status: 200 }),
    },
    {
      name: 'whitespace or control in access token',
      fetchImpl: async () => metadataResponse({ access_token: `bad\ntoken-${ACCESS_TOKEN}` }),
    },
    {
      name: 'oversized access token',
      fetchImpl: async () => metadataResponse({ access_token: 'x'.repeat(8 * 1024 + 1) }),
    },
    {
      name: 'wrong token type',
      fetchImpl: async () => metadataResponse({ token_type: 'Basic' }),
    },
    {
      name: 'invalid expiry',
      fetchImpl: async () => metadataResponse({ expires_in: 0 }),
    },
    {
      name: 'network error',
      fetchImpl: async () => { throw new Error(secretDiagnostic); },
    },
  ];

  for (const scenario of failures) {
    let calls = 0;
    const provider = createServiceAccessTokenProvider({
      fetchImpl: async (...args) => {
        calls += 1;
        return scenario.fetchImpl(...args);
      },
    });
    await assert.rejects(provider(), error => {
      assert.ok(isUnavailable(error), scenario.name);
      assert.equal(String(error).includes(ACCESS_TOKEN), false, scenario.name);
      assert.equal(String(error).includes('private-response'), false, scenario.name);
      return true;
    }, scenario.name);
    assert.equal(calls, 1, `${scenario.name} must not retry`);
  }
});

test('request timeout aborts a stalled metadata fetch without retry', async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const provider = createServiceAccessTokenProvider({
    timeoutMs: 20,
    fetchImpl: async (_input, init) => {
      calls += 1;
      signal = init?.signal;
      return await new Promise<Response>(() => undefined);
    },
  });

  await assert.rejects(provider(), isUnavailable);
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test('total timeout includes a stalled response body read', async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const provider = createServiceAccessTokenProvider({
    timeoutMs: 20,
    fetchImpl: async (_input, init) => {
      calls += 1;
      signal = init?.signal;
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { streamController = controller; },
      });
      signal?.addEventListener('abort', () => {
        try { streamController?.error(new Error(`private ${ACCESS_TOKEN}`)); } catch { /* Already closed. */ }
      }, { once: true });
      return new Response(body, { status: 200 });
    },
  });

  await assert.rejects(provider(), error => {
    assert.ok(isUnavailable(error));
    assert.equal(String(error).includes(ACCESS_TOKEN), false);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test('invalid timeout configuration is rejected before metadata access', () => {
  let calls = 0;
  assert.throws(() => createServiceAccessTokenProvider({
    timeoutMs: 0,
    fetchImpl: async () => { calls += 1; return metadataResponse(); },
  }), error => error instanceof KernelError && error.code === 'CONFIG_INVALID');
  assert.equal(calls, 0);
});
