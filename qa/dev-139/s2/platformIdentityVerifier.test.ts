import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  CURRENT_PRODUCTION_IDENTITY_PINS,
  IdentityConsumer,
  type IdentityContractPin,
  type PrincipalMappingResult,
  type ProducerVerifiedIdentity,
} from '../../../server/identityConsumer.js';
import { createPlatformIdentityVerifier } from '../../../server/platformIdentityVerifier.js';
import {
  createPlatformPrincipalStateReader,
  PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
  PLATFORM_PROJED_PRINCIPAL_STATE_SQL,
  type PlatformPrincipalStateReader,
  type PlatformPrincipalStateQueryPort,
} from '../../../server/platformPrincipalState.js';
import { type PlatformHandoffBinding, type PlatformHandoffExchangeInput } from '../../../server/platformHandoff.js';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const BINDING: PlatformHandoffBinding = {
  contractVersion: 'jenfu.sso-handoff.v4',
  manifestSha256: 'c5471fa9686566cf2ecb42f6f78f52eed5188e36bcfd8208609a96fc0f829e6a',
  issuer: 'https://platform.example.test/api/sso',
  audience: 'projed',
};
const IDENTITY_PIN: IdentityContractPin = {
  contractVersion: BINDING.contractVersion,
  manifestSha256: BINDING.manifestSha256,
  issuer: BINDING.issuer,
  audience: BINDING.audience,
};
const EXCHANGE_INPUT: PlatformHandoffExchangeInput = {
  entry: 'quick',
  code: 'C'.repeat(43),
  codeVerifier: 'V'.repeat(43),
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
    authState: { authEpoch: 7, revokedBefore: null },
    mappingRevision: '14',
    sourceSessionExpiresAt: '2026-10-29T12:05:00.000Z',
    issuedAt: '2026-10-29T11:59:30.000Z',
    expiresAt: '2026-10-29T12:00:30.000Z',
    ...overrides,
  };
}

function stateRow(proof: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const identity = proof.identity as Record<string, unknown>;
  const authState = proof.authState as Record<string, unknown>;
  return {
    contract_version: 'jenfu.platform.projed-principal-state.v1',
    principal_id: identity.principalId,
    principal_kind: identity.principalKind,
    employee_id: identity.employeeId,
    identity_issuer: identity.identityIssuer,
    identity_subject: identity.identitySubject,
    google_subject: identity.googleSubject,
    mapping_revision: proof.mappingRevision,
    auth_epoch: String(authState.authEpoch),
    revoked_before: authState.revokedBefore,
    read_at: '2026-10-29T11:59:55.000Z',
    ...overrides,
  };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

function consumerHarness(input: {
  wire?: Record<string, unknown>;
  rows?: unknown[];
  now?: () => number;
  pins?: readonly IdentityContractPin[];
  onQuery?: () => void;
} = {}) {
  const proof = input.wire ?? wire();
  let exchangeCalls = 0;
  let readForHandoffCalls = 0;
  let mappingCalls = 0;
  const query: PlatformPrincipalStateQueryPort = {
    async query(sql, values) {
      input.onQuery?.();
      assert.equal(sql, PLATFORM_PROJED_PRINCIPAL_STATE_SQL);
      assert.deepEqual(values, ['https://securetoken.google.com/jenfu-test', 'firebase-uid-123', 'principal-123']);
      return { rows: input.rows ?? [stateRow(proof)] };
    },
  };
  const reader: PlatformPrincipalStateReader = createPlatformPrincipalStateReader({
    query,
    contractBinding: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
    handoffBinding: BINDING,
    environment: 'test',
    now: input.now ?? (() => NOW),
  });
  const countedReader = {
    async readForHandoff(handoff: unknown) {
      readForHandoffCalls += 1;
      return reader.readForHandoff(handoff);
    },
  };
  const verifier = createPlatformIdentityVerifier({
    handoffs: {
      async exchange(value) {
        exchangeCalls += 1;
        assert.deepEqual(value, EXCHANGE_INPUT);
        return proof;
      },
    },
    stateReader: countedReader,
    binding: BINDING,
    environment: 'test',
    now: input.now ?? (() => NOW),
  });
  const mappings = {
    async resolve(identity: Pick<ProducerVerifiedIdentity, 'principalId' | 'identityIssuer' | 'identitySubject' | 'googleSubject' | 'mappingRevision'>): Promise<PrincipalMappingResult> {
      mappingCalls += 1;
      assert.equal(identity.googleSubject, 'google-sub-456');
      return {
        status: 'active',
        principalId: identity.principalId,
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        googleSubject: identity.googleSubject,
        mappingRevision: identity.mappingRevision,
        localUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        accountGuardRevision: '3',
      };
    },
  };
  const consumer = new IdentityConsumer({
    pins: input.pins ?? [IDENTITY_PIN],
    verifier,
    mappings,
    now: input.now ?? (() => NOW),
    createContextId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  return {
    consumer,
    calls: () => ({ exchangeCalls, readForHandoffCalls, mappingCalls }),
  };
}

test('one exchange and one state read produce a retained verified result through consumeVerified', async () => {
  const subject = consumerHarness();
  const result = await subject.consumer.consumeVerified(EXCHANGE_INPUT, 'quick');

  assert.deepEqual(subject.calls(), { exchangeCalls: 1, readForHandoffCalls: 1, mappingCalls: 1 });
  assert.equal(result.identity.issuer, BINDING.issuer);
  assert.equal(result.identity.audience, 'projed');
  assert.equal(result.identity.manifestSha256, BINDING.manifestSha256);
  assert.equal(result.identity.principalKind, 'personal');
  assert.equal(result.identity.employeeId, null);
  assert.equal(result.identity.googleSubject, 'google-sub-456');
  assert.equal(result.identity.authEpoch, 7);
  assert.equal(result.identity.mappingRevision, '14');
  assert.equal(result.identity.expiresAtMs, Date.parse('2026-10-29T12:00:30.000Z'));
  assert.equal(result.identity.sourceSessionExpiresAtMs, Date.parse('2026-10-29T12:05:00.000Z'));
  assert.equal(result.identity.currentStateExpiresAtMs, Date.parse('2026-10-29T12:00:05.000Z'));
  assert.equal(result.actor.entry, 'quick');
  assert.equal(result.actor.expiresAtMs, Date.parse('2026-10-29T12:00:05.000Z'));
  assert.equal(Object.isFrozen(result.identity), true);
  assert.equal('code' in result.identity, false);
  assert.equal('codeVerifier' in result.identity, false);
});

test('exact v4 issuer/audience and out-of-band manifest pin fail closed on mismatch', async () => {
  for (const proof of [
    wire({ issuer: 'https://other.example.test/api/sso' }),
    wire({ audience: 'orgmaster' }),
  ]) {
    const subject = consumerHarness({ wire: proof });
    await assert.rejects(subject.consumer.consumeVerified(EXCHANGE_INPUT, 'quick'), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
    assert.deepEqual(subject.calls(), { exchangeCalls: 1, readForHandoffCalls: 0, mappingCalls: 0 });
  }

  const pinMismatch = consumerHarness({ pins: [{ ...IDENTITY_PIN, manifestSha256: 'a'.repeat(64) }] });
  await assert.rejects(pinMismatch.consumer.consumeVerified(EXCHANGE_INPUT, 'quick'), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  assert.deepEqual(pinMismatch.calls(), { exchangeCalls: 1, readForHandoffCalls: 1, mappingCalls: 0 });
});

test('current state pair, Google subject, mapping revision, epoch, barrier, or freshness drift denies before mapping', async () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['identity pair', { identity_subject: 'other-firebase-uid' }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['Google proof', { google_subject: 'other-google-subject' }, 'IDENTITY_INVALID'],
    ['mapping revision', { mapping_revision: '15' }, 'IDENTITY_INVALID'],
    ['auth epoch', { auth_epoch: '8' }, 'IDENTITY_INVALID'],
    ['revocation barrier', { revoked_before: '2026-10-29T11:55:00.000Z' }, 'IDENTITY_INVALID'],
    ['state read older than ten seconds', { read_at: '2026-10-29T11:59:49.999Z' }, 'IDENTITY_STATE_UNAVAILABLE'],
  ];
  for (const [name, rowChanges, code] of cases) {
    const proof = wire();
    const subject = consumerHarness({ wire: proof, rows: [stateRow(proof, rowChanges)] });
    await assert.rejects(subject.consumer.consumeVerified(EXCHANGE_INPUT, 'quick'), hasCode(code), name);
    assert.deepEqual(subject.calls(), { exchangeCalls: 1, readForHandoffCalls: 1, mappingCalls: 0 }, name);
  }
});

test('handoff expiry during exchange fails before current-state read or mapping', async () => {
  let now = NOW;
  let exchangeCalls = 0;
  let readForHandoffCalls = 0;
  let mappingCalls = 0;
  const expiredNowSubject = createPlatformIdentityVerifier({
    handoffs: {
      async exchange(input) {
        exchangeCalls += 1;
        assert.deepEqual(input, EXCHANGE_INPUT);
        now = Date.parse('2026-10-29T12:00:30.000Z');
        return wire();
      },
    },
    stateReader: { async readForHandoff() { readForHandoffCalls += 1; throw new Error('must not read expired handoff'); } },
    binding: BINDING,
    environment: 'test',
    now: () => now,
  });
  const blocked = new IdentityConsumer({
    pins: [IDENTITY_PIN],
    verifier: expiredNowSubject,
    mappings: { async resolve() { mappingCalls += 1; throw new Error('must not map expired handoff'); } },
    now: () => now,
  });
  await assert.rejects(blocked.consumeVerified(EXCHANGE_INPUT, 'quick'), hasCode('IDENTITY_INVALID'));
  assert.deepEqual({ exchangeCalls, readForHandoffCalls, mappingCalls }, { exchangeCalls: 1, readForHandoffCalls: 0, mappingCalls: 0 });
});

test('empty production pins reject before one-time exchange or state access', async () => {
  let exchangeCalls = 0;
  let mappingCalls = 0;
  const verifier = createPlatformIdentityVerifier({
    handoffs: { async exchange() { exchangeCalls += 1; return wire(); } },
    stateReader: { async readForHandoff() { throw new Error('must not read with empty pins'); } },
    binding: BINDING,
    now: () => NOW,
  });
  const consumer = new IdentityConsumer({
    pins: CURRENT_PRODUCTION_IDENTITY_PINS,
    verifier,
    mappings: { async resolve() { mappingCalls += 1; return { status: 'missing' }; } },
    now: () => NOW,
  });
  await assert.rejects(consumer.consumeVerified(EXCHANGE_INPUT, 'main'), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  assert.equal(exchangeCalls, 0);
  assert.equal(mappingCalls, 0);
});
