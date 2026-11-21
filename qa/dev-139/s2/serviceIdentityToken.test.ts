import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { createServiceIdentityTokenProvider } from '../../../server/serviceIdentityToken.js';

const BROKER_ORIGIN = 'https://platform.example.test';
const ID_TOKEN = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('{"aud":"platform"}').toString('base64url')}.signature`;

function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('metadata provider accepts only the exact HTTPS broker audience before fetching', async () => {
  let calls = 0;
  assert.throws(() => createServiceIdentityTokenProvider({ brokerOrigin: 'http://platform.example.test' }), hasCode('CONFIG_INVALID'));
  assert.throws(() => createServiceIdentityTokenProvider({ brokerOrigin: 'https://platform.example.test/path' }), hasCode('CONFIG_INVALID'));
  const provider = createServiceIdentityTokenProvider({
    brokerOrigin: BROKER_ORIGIN,
    fetchImpl: async () => { calls += 1; return new Response(ID_TOKEN); },
  });

  await assert.rejects(provider('https://other.example.test'), hasCode('IDENTITY_INVALID'));
  await assert.rejects(provider(`${BROKER_ORIGIN}/`), hasCode('IDENTITY_INVALID'));
  assert.equal(calls, 0);
});

test('fetches one bounded OIDC token from the fixed metadata URL with exact audience and required header', async () => {
  let calls = 0;
  const provider = createServiceIdentityTokenProvider({
    brokerOrigin: BROKER_ORIGIN,
    fetchImpl: async (input, init) => {
      calls += 1;
      const url = new URL(String(input));
      assert.equal(url.origin, 'http://metadata.google.internal');
      assert.equal(url.pathname, '/computeMetadata/v1/instance/service-accounts/default/identity');
      assert.deepEqual([...url.searchParams.entries()], [['audience', BROKER_ORIGIN], ['format', 'full']]);
      assert.equal(init?.method, 'GET');
      assert.equal(new Headers(init?.headers).get('Metadata-Flavor'), 'Google');
      assert.equal(new Headers(init?.headers).get('accept'), 'text/plain');
      assert.equal(new Headers(init?.headers).get('authorization'), null);
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(ID_TOKEN, { status: 200, headers: { 'content-type': 'text/plain' } });
    },
  });

  assert.equal(await provider(BROKER_ORIGIN), ID_TOKEN);
  assert.equal(calls, 1);
});

test('non-200, redirects, network failures, oversized and malformed bodies fail closed without retry or body disclosure', async () => {
  const failureCases: Array<{ name: string; response?: () => Response; failure?: Error }> = [
    { name: 'non-200', response: () => new Response('provider diagnostic', { status: 503 }) },
    { name: 'redirect', response: () => new Response(ID_TOKEN, { status: 302, headers: { location: 'http://attacker.test/token' } }) },
    { name: 'redirected response', response: () => {
      const response = new Response(ID_TOKEN);
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    } },
    { name: 'oversized body', response: () => new Response('x'.repeat(16 * 1024 + 1)) },
    { name: 'malformed token body', response: () => new Response('private-token-body-not-a-jwt') },
    { name: 'network failure', failure: new Error('private network diagnostic') },
  ];

  for (const scenario of failureCases) {
    let calls = 0;
    const provider = createServiceIdentityTokenProvider({
      brokerOrigin: BROKER_ORIGIN,
      fetchImpl: async () => {
        calls += 1;
        if (scenario.failure) throw scenario.failure;
        return scenario.response!();
      },
    });
    await assert.rejects(provider(BROKER_ORIGIN), error => {
      assert.ok(hasCode('IDENTITY_STATE_UNAVAILABLE')(error), scenario.name);
      assert.equal(String(error).includes('private'), false);
      return true;
    }, scenario.name);
    assert.equal(calls, 1, `${scenario.name} must not retry`);
  }
});

test('the total metadata fetch deadline aborts and rejects without retry', async () => {
  let calls = 0;
  let receivedSignal: AbortSignal | null | undefined;
  const provider = createServiceIdentityTokenProvider({
    brokerOrigin: BROKER_ORIGIN,
    timeoutMs: 10,
    fetchImpl: async (_input, init) => {
      calls += 1;
      receivedSignal = init?.signal;
      return await new Promise<Response>(() => undefined);
    },
  });

  await assert.rejects(provider(BROKER_ORIGIN), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  assert.equal(calls, 1);
  assert.equal(receivedSignal?.aborted, true);
});
