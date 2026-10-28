import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  CURRENT_PRODUCTION_IDENTITY_PINS,
  IdentityConsumer,
  type IdentityContractPin,
  type PrincipalMappingResult,
  type ProducerVerifiedIdentity,
  type TrustedIdentityVerifier,
} from '../../../server/identityConsumer.js';

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const PIN: IdentityContractPin = {
  contractVersion: 'SIMULATION.projed.identity.v1',
  manifestSha256: 'a'.repeat(64),
  issuer: 'https://identity.simulation.invalid/api/sso',
  audience: 'projed',
};

function identity(overrides: Partial<ProducerVerifiedIdentity> = {}): ProducerVerifiedIdentity {
  return {
    contractVersion: PIN.contractVersion,
    manifestSha256: PIN.manifestSha256,
    issuer: PIN.issuer,
    audience: PIN.audience,
    identityIssuer: 'https://identity.simulation.invalid/provider',
    identitySubject: 'subject-a',
    principalId: 'principal-a',
    principalKind: 'personal',
    googleSubject: 'google-a',
    employeeId: null,
    authEpoch: 7,
    authenticatedAtMs: NOW - 60_000,
    revokedBeforeMs: null,
    sourceSessionExpiresAtMs: NOW + 300_000,
    issuedAtMs: NOW - 30_000,
    expiresAtMs: NOW + 180_000,
    currentStateExpiresAtMs: NOW + 120_000,
    mappingRevision: '12',
    ...overrides,
  };
}

function mapping(overrides: Partial<Extract<PrincipalMappingResult, { status: 'active' }>> = {}): PrincipalMappingResult {
  return {
    status: 'active',
    principalId: 'principal-a',
    identityIssuer: 'https://identity.simulation.invalid/provider',
    identitySubject: 'subject-a',
    mappingRevision: '12',
    googleSubject: 'google-a',
    localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountGuardRevision: '3',
    ...overrides,
  };
}

function consumer(options: {
  verified?: ProducerVerifiedIdentity;
  mapped?: PrincipalMappingResult;
  verifier?: TrustedIdentityVerifier;
  pins?: readonly IdentityContractPin[];
} = {}) {
  return new IdentityConsumer({
    pins: options.pins ?? [PIN],
    verifier: options.verifier ?? { verify: async () => options.verified ?? identity() },
    mappings: { resolve: async () => options.mapped ?? mapping() },
    now: () => NOW,
    createContextId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
}

async function expectCode(action: Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => error instanceof KernelError && error.code === code);
}

test('production pins stay empty and reject current handoff v2 before a verifier runs', async () => {
  let calls = 0;
  const currentV2 = {
    contractVersion: 'jenfu.sso-handoff.v2',
    audience: 'orgmaster',
    identity: { employeeId: 'employee-required-by-current-v2' },
  };
  const subject = consumer({
    pins: CURRENT_PRODUCTION_IDENTITY_PINS,
    verifier: { verify: async () => { calls += 1; return identity(); } },
  });
  await expectCode(subject.consume(currentV2, 'main'), 'IDENTITY_CONTRACT_UNAVAILABLE');
  assert.equal(calls, 0);
});

test('QA-only simulated nonemployee identity resolves to a bounded server actor', async () => {
  const actor = await consumer().consume({ opaqueHandoff: 'simulation-only' }, 'quick');
  assert.deepEqual(actor, {
    principalId: 'principal-a',
    localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entry: 'quick',
    contextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expiresAtMs: NOW + 120_000,
    accountGuardRevision: '3',
  });
  assert.equal(Object.isFrozen(actor), true);
});

test('wire verification cannot be bypassed by a forged normalized-looking payload', async () => {
  const subject = consumer({
    verifier: {
      verify: async () => { throw new KernelError('IDENTITY_INVALID', 'signature invalid', 401); },
    },
  });
  await expectCode(subject.consume(identity(), 'main'), 'IDENTITY_INVALID');
});

test('untyped verifier transport failure is treated as state unavailable', async () => {
  const subject = consumer({ verifier: { verify: async () => { throw new Error('producer timeout'); } } });
  await expectCode(subject.consume({}, 'main'), 'IDENTITY_STATE_UNAVAILABLE');
});

test('contract version, manifest, issuer and audience must match one exact pin', async () => {
  const changes: Partial<ProducerVerifiedIdentity>[] = [
    { contractVersion: 'jenfu.sso-handoff.v2' },
    { manifestSha256: 'b'.repeat(64) },
    { issuer: 'https://wrong.invalid/api/sso' },
    { audience: 'orgmaster' },
  ];
  for (const change of changes) {
    await expectCode(consumer({ verified: identity(change) }).consume({}, 'main'), 'IDENTITY_CONTRACT_UNAVAILABLE');
  }
});

test('expired, future-issued and revoked identity states are rejected', async () => {
  const changes: Partial<ProducerVerifiedIdentity>[] = [
    { expiresAtMs: NOW },
    { sourceSessionExpiresAtMs: NOW - 1 },
    { currentStateExpiresAtMs: NOW },
    { issuedAtMs: NOW + 1 },
    { revokedBeforeMs: NOW - 60_000 },
  ];
  for (const change of changes) {
    await expectCode(consumer({ verified: identity(change) }).consume({}, 'main'), 'IDENTITY_INVALID');
  }
});

test('optional verified email uses the owner-v4 email shape and length', async () => {
  for (const verifiedEmail of ['', 'not-an-email', ' person@example.test', 'x'.repeat(313) + '@example.test']) {
    await expectCode(
      consumer({ verified: identity({ verifiedEmail }) }).consume({}, 'main'),
      'IDENTITY_INVALID',
    );
  }
});

test('missing or ambiguous mapping fails closed without creating a local owner', async () => {
  for (const status of ['missing', 'ambiguous'] as const) {
    await expectCode(consumer({ mapped: { status } }).consume({}, 'main'), 'IDENTITY_MAPPING_CONFLICT');
  }
});

test('inactive and unavailable mapping states remain distinct', async () => {
  await expectCode(consumer({ mapped: { status: 'inactive' } }).consume({}, 'main'), 'ACCESS_DENIED');
  await expectCode(consumer({ mapped: { status: 'unavailable' } }).consume({}, 'main'), 'IDENTITY_STATE_UNAVAILABLE');
});

test('mapping transport failure is converted to unavailable rather than allow or raw failure', async () => {
  const subject = new IdentityConsumer({
    pins: [PIN],
    verifier: { verify: async () => identity() },
    mappings: { resolve: async () => { throw new Error('dependency timeout'); } },
    now: () => NOW,
  });
  await expectCode(subject.consume({}, 'main'), 'IDENTITY_STATE_UNAVAILABLE');
});

test('identity state is rechecked after mapping resolution before an actor is returned', async () => {
  let now = NOW;
  const subject = new IdentityConsumer({
    pins: [PIN],
    verifier: { verify: async () => identity({ currentStateExpiresAtMs: NOW + 1 }) },
    mappings: {
      resolve: async () => {
        now = NOW + 1;
        return mapping();
      },
    },
    now: () => now,
  });
  await expectCode(subject.consume({}, 'main'), 'IDENTITY_INVALID');
});

test('mapping identity and revision must match the verified producer result', async () => {
  await expectCode(consumer({ mapped: mapping({ principalId: 'principal-b' }) }).consume({}, 'main'), 'IDENTITY_MAPPING_CONFLICT');
  await expectCode(consumer({ mapped: mapping({ mappingRevision: '13' }) }).consume({}, 'main'), 'IDENTITY_MAPPING_CONFLICT');
  await expectCode(consumer({ mapped: mapping({ googleSubject: 'google-b' }) }).consume({}, 'main'), 'IDENTITY_MAPPING_CONFLICT');
});

test('consumeVerified retains one immutable verification result without replaying the code', async () => {
  let calls = 0;
  const original = identity();
  const subject = consumer({ verifier: { verify: async () => { calls += 1; return original; } } });
  const result = await subject.consumeVerified({ code: 'one-use-fixture' }, 'main');
  assert.equal(calls, 1);
  assert.equal(result.identity.googleSubject, 'google-a');
  assert.equal(result.actor.localUserId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(Object.isFrozen(result.identity), true);
  assert.notEqual(result.identity, original);
});

test('verified kind, Employee and Google ID must form a consistent identity', async () => {
  for (const change of [
    { googleSubject: '' }, { googleSubject: 'bad\nsubject' },
    { principalKind: 'personal' as const, employeeId: 'fake-employee' },
    { principalKind: 'employee' as const, employeeId: null },
  ]) await expectCode(consumer({ verified: identity(change) }).consume({}, 'main'), 'IDENTITY_INVALID');
});

test('invalid local UUID or guard revision is rejected by the S1 actor kernel', async () => {
  await expectCode(consumer({ mapped: mapping({ localUserId: 'not-a-uuid' }) }).consume({}, 'main'), 'ACTOR_INVALID');
  await expectCode(consumer({ mapped: mapping({ accountGuardRevision: '01' }) }).consume({}, 'main'), 'ACTOR_INVALID');
});
