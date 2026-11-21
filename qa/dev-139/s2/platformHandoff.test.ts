import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  createPlatformHandoffClient,
  parsePlatformHandoffV4,
  type PlatformHandoffBinding,
  type PlatformHandoffClientConfig,
} from '../../../server/platformHandoff.js';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const BINDING: PlatformHandoffBinding = {
  contractVersion: 'jenfu.sso-handoff.v4',
  manifestSha256: 'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a',
  issuer: 'https://platform.example.test/api/sso',
  audience: 'projed',
};

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: 'jenfu.sso-handoff.v4',
    issuer: BINDING.issuer,
    audience: 'projed',
    identity: {
      identityIssuer: 'https://securetoken.google.com/jenfu-test',
      identitySubject: 'firebase-uid-123',
      principalId: 'principal-123',
      principalKind: 'personal',
      employeeId: null,
      googleSubject: 'google-sub-456',
    },
    authentication: {
      authenticatedAt: '2026-10-29T11:50:00.000Z',
      email: 'person@example.test',
      emailVerified: true,
      signInProvider: 'google.com',
      secondFactor: null,
      assuranceLevel: 'aal1',
    },
    authState: { authEpoch: 4, revokedBefore: null },
    mappingRevision: '14',
    sourceSessionExpiresAt: '2026-10-29T12:05:00.000Z',
    issuedAt: '2026-10-29T11:59:30.000Z',
    expiresAt: '2026-10-29T12:00:30.000Z',
    ...overrides,
  };
}

function clientConfig(overrides: Partial<PlatformHandoffClientConfig> = {}): PlatformHandoffClientConfig {
  return {
    environment: 'test',
    brokerOrigin: 'https://platform.example.test',
    callbacks: {
      main: 'https://projed.example.test/api/auth/jenfu-sso/callback',
      quick: 'https://quick.projed.example.test/api/auth/jenfu-sso/callback',
    },
    binding: BINDING,
    tokenProvider: async (audience) => {
      assert.equal(audience, 'https://platform.example.test');
      return 'fixture-service-token.not-real';
    },
    now: () => NOW,
    ...overrides,
  };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('v4 parser accepts personal null Employee and employee string without creating an actor', () => {
  const personal = parsePlatformHandoffV4(wire(), BINDING, NOW);
  assert.equal(personal.identity.principalKind, 'personal');
  assert.equal(personal.identity.employeeId, null);
  assert.equal(personal.identity.googleSubject, 'google-sub-456');
  assert.equal('assignmentVersion' in personal, false);

  const employeeWire = wire({
    identity: {
      identityIssuer: 'https://securetoken.google.com/jenfu-test',
      identitySubject: 'firebase-employee-uid',
      principalId: 'employee-principal',
      principalKind: 'employee',
      employeeId: 'EMP-42',
      googleSubject: 'google-employee-sub',
    },
    authentication: { ...wire().authentication as object, secondFactor: null, assuranceLevel: 'aal2' },
  });
  const employee = parsePlatformHandoffV4(employeeWire, BINDING, NOW);
  assert.equal(employee.identity.principalKind, 'employee');
  assert.equal(employee.identity.employeeId, 'EMP-42');
  assert.equal(Object.isFrozen(employee), true);
});

test('v4 parser rejects int64 overflow and inconsistent principal kind/Employee pairs', () => {
  assert.throws(() => parsePlatformHandoffV4(wire({ mappingRevision: '9223372036854775808' }), BINDING, NOW), hasCode('IDENTITY_INVALID'));
  assert.throws(() => parsePlatformHandoffV4(wire({ mappingRevision: '0' }), BINDING, NOW), hasCode('IDENTITY_INVALID'));

  const personalWithEmployee = wire({
    identity: { ...wire().identity as object, employeeId: 'EMP-42' },
  });
  const employeeWithoutEmployee = wire({
    identity: { ...wire().identity as object, principalKind: 'employee', employeeId: null },
  });
  assert.throws(() => parsePlatformHandoffV4(personalWithEmployee, BINDING, NOW), hasCode('IDENTITY_INVALID'));
  assert.throws(() => parsePlatformHandoffV4(employeeWithoutEmployee, BINDING, NOW), hasCode('IDENTITY_INVALID'));
});

test('v4 parser rejects wrong issuer/audience, non-Google proof and extra business assignment fields', () => {
  assert.throws(() => parsePlatformHandoffV4(wire({ issuer: 'https://wrong.example/api/sso' }), BINDING, NOW), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  assert.throws(() => parsePlatformHandoffV4(wire({ audience: 'orgmaster' }), BINDING, NOW), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));

  const wrongProvider = wire({ authentication: { ...wire().authentication as object, signInProvider: 'password' } });
  const missingGoogleSubject = wire({ identity: { ...wire().identity as object, googleSubject: '' } });
  assert.throws(() => parsePlatformHandoffV4(wrongProvider, BINDING, NOW), hasCode('IDENTITY_INVALID'));
  assert.throws(() => parsePlatformHandoffV4(missingGoogleSubject, BINDING, NOW), hasCode('IDENTITY_INVALID'));
  assert.throws(() => parsePlatformHandoffV4(wire({ assignmentVersion: 'employee-role-v1' }), BINDING, NOW), hasCode('IDENTITY_INVALID'));
});

test('v4 parser rejects expired, revoked, future-issued and source-expiry-inconsistent assertions', () => {
  const expired = wire({ expiresAt: '2026-10-29T11:59:59.000Z' });
  const sourceExpired = wire({ sourceSessionExpiresAt: '2026-10-29T11:59:59.000Z' });
  const revoked = wire({ authState: { authEpoch: 4, revokedBefore: '2026-10-29T11:50:00.000Z' } });
  const futureIssued = wire({ issuedAt: '2026-10-29T12:00:01.000Z' });
  const exceedsSourceExpiry = wire({ sourceSessionExpiresAt: '2026-10-29T12:00:10.000Z', expiresAt: '2026-10-29T12:00:30.000Z' });
  for (const candidate of [expired, sourceExpired, revoked, futureIssued, exceedsSourceExpiry]) {
    assert.throws(() => parsePlatformHandoffV4(candidate, BINDING, NOW), hasCode('IDENTITY_INVALID'));
  }
});

test('client posts exact ProJED forms with server-selected main/quick callbacks and service audience', async () => {
  let tokenAudience = '';
  let calls = 0;
  const subject = createPlatformHandoffClient(clientConfig({
    tokenProvider: async (audience) => { tokenAudience = audience; return 'fixture-service-token.not-real'; },
    fetchImpl: async (input, init) => {
      calls += 1;
      assert.equal(String(input), 'https://platform.example.test/api/sso/token');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.credentials, 'omit');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('content-type'), 'application/x-www-form-urlencoded');
      assert.equal(headers.get('x-jenfu-service-identity'), 'Bearer fixture-service-token.not-real');
      assert.equal(headers.get('authorization'), null);
      const form = new URLSearchParams(String(init?.body));
      assert.deepEqual([...form.keys()], ['grant_type', 'code', 'client_id', 'redirect_uri', 'code_verifier']);
      const selectedCallback = calls === 1
        ? 'https://quick.projed.example.test/api/auth/jenfu-sso/callback'
        : 'https://projed.example.test/api/auth/jenfu-sso/callback';
      assert.deepEqual([...form.values()], [
        'authorization_code', calls === 1 ? 'C'.repeat(43) : 'D'.repeat(43), 'projed', selectedCallback,
        calls === 1 ? 'V'.repeat(43) : 'W'.repeat(43),
      ]);
      assert.equal(form.getAll('client_id').length, 1);
      return new Response(JSON.stringify(wire()), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }));

  const result = await subject.exchange({ entry: 'quick', code: 'C'.repeat(43), codeVerifier: 'V'.repeat(43) });
  assert.equal(result.audience, 'projed');
  await subject.exchange({ entry: 'main', code: 'D'.repeat(43), codeVerifier: 'W'.repeat(43) });
  assert.equal(tokenAudience, 'https://platform.example.test');
  assert.equal(calls, 2);
});

test('caller cannot override the selected callback and invalid callback input is rejected before token/fetch', async () => {
  let tokenCalls = 0;
  let fetchCalls = 0;
  const subject = createPlatformHandoffClient(clientConfig({
    tokenProvider: async () => { tokenCalls += 1; return 'fixture-service-token.not-real'; },
    fetchImpl: async () => { fetchCalls += 1; return new Response(JSON.stringify(wire()), { status: 200 }); },
  }));
  const requestWithRedirect = { entry: 'main', code: 'C'.repeat(43), codeVerifier: 'V'.repeat(43), redirectUri: 'https://attacker.invalid/callback' };
  await assert.rejects(subject.exchange(requestWithRedirect as never), hasCode('IDENTITY_INVALID'));
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('code and PKCE verifier use the producer’s exact accepted alphabet and lengths', async () => {
  let tokenCalls = 0;
  let fetchCalls = 0;
  const subject = createPlatformHandoffClient(clientConfig({
    tokenProvider: async () => { tokenCalls += 1; return 'fixture-service-token.not-real'; },
    fetchImpl: async () => { fetchCalls += 1; return new Response(JSON.stringify(wire()), { status: 200 }); },
  }));
  await assert.rejects(subject.exchange({ entry: 'main', code: 'C'.repeat(42), codeVerifier: 'V'.repeat(43) }), hasCode('IDENTITY_INVALID'));
  await assert.rejects(subject.exchange({ entry: 'main', code: 'C'.repeat(43), codeVerifier: '.'.repeat(43) }), hasCode('IDENTITY_INVALID'));
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('oversized, redirected and malformed upstream responses fail closed', async () => {
  for (const response of [
    new Response('x'.repeat(32 * 1024 + 1), { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }),
    new Response('{bad json', { status: 200, headers: { 'content-type': 'application/json' } }),
  ]) {
    const subject = createPlatformHandoffClient(clientConfig({ fetchImpl: async () => response }));
    await assert.rejects(subject.exchange({ entry: 'main', code: 'C'.repeat(43), codeVerifier: 'V'.repeat(43) }));
  }
});

test('network failure and timeout are not retried', async () => {
  let calls = 0;
  const failed = createPlatformHandoffClient(clientConfig({
    fetchImpl: async () => { calls += 1; throw new Error('fixture network error'); },
  }));
  await assert.rejects(failed.exchange({ entry: 'main', code: 'C'.repeat(43), codeVerifier: 'V'.repeat(43) }), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  assert.equal(calls, 1);

  const timedOut = createPlatformHandoffClient(clientConfig({
    timeoutMs: 10,
    fetchImpl: async () => { calls += 1; return await new Promise<Response>(() => undefined); },
  }));
  await assert.rejects(timedOut.exchange({ entry: 'main', code: 'C'.repeat(43), codeVerifier: 'V'.repeat(43) }), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  assert.equal(calls, 2);
});

test('plain HTTP is allowed only for explicit loopback development/test endpoints', () => {
  const local = clientConfig({
    environment: 'development',
    brokerOrigin: 'http://127.0.0.1:8080',
    binding: { ...BINDING, issuer: 'http://127.0.0.1:8080/api/sso' },
    callbacks: {
      main: 'http://localhost:4173/api/auth/jenfu-sso/callback',
      quick: 'http://[::1]:4174/api/auth/jenfu-sso/callback',
    },
  });
  assert.doesNotThrow(() => createPlatformHandoffClient(local));
  const localBinding = { ...BINDING, issuer: 'http://127.0.0.1:8080/api/sso' } as const;
  assert.throws(() => parsePlatformHandoffV4(wire({ issuer: localBinding.issuer }), localBinding, NOW), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  assert.doesNotThrow(() => parsePlatformHandoffV4(wire({ issuer: localBinding.issuer }), localBinding, NOW, 'development'));
  assert.throws(() => createPlatformHandoffClient(clientConfig({
    environment: 'production',
    brokerOrigin: 'http://127.0.0.1:8080',
    binding: { ...BINDING, issuer: 'http://127.0.0.1:8080/api/sso' },
  })), hasCode('CONFIG_INVALID'));
  assert.throws(() => createPlatformHandoffClient(clientConfig({
    environment: 'test',
    brokerOrigin: 'http://platform.example.test',
    binding: { ...BINDING, issuer: 'http://platform.example.test/api/sso' },
  })), hasCode('CONFIG_INVALID'));
});

test('callback config matches Platform’s fixed callback route and optional shared quick callback', () => {
  assert.doesNotThrow(() => createPlatformHandoffClient(clientConfig({
    callbacks: {
      main: 'https://projed.example.test/api/auth/jenfu-sso/callback',
      quick: 'https://projed.example.test/api/auth/jenfu-sso/callback',
    },
  })));
  assert.throws(() => createPlatformHandoffClient(clientConfig({
    callbacks: {
      main: 'https://projed.example.test/api/auth/jenfu-sso/main/callback',
      quick: 'https://quick.projed.example.test/api/auth/jenfu-sso/callback',
    },
  })), hasCode('CONFIG_INVALID'));
  assert.throws(() => createPlatformHandoffClient(clientConfig({
    callbacks: {
      main: 'https://platform.example.test/api/auth/jenfu-sso/callback',
      quick: 'https://quick.projed.example.test/api/auth/jenfu-sso/callback',
    },
  })), hasCode('CONFIG_INVALID'));
});
