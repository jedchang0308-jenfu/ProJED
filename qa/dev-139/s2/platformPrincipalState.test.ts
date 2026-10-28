import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  createPlatformPrincipalStateReader,
  PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
  PLATFORM_PROJED_PRINCIPAL_STATE_SQL,
  PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS,
  verifyProjedHandoffPrincipalState,
  type PlatformPrincipalState,
  type PlatformPrincipalStateQueryPort,
} from '../../../server/platformPrincipalState.js';
import {
  parsePlatformHandoffV4,
  type PlatformHandoffBinding,
  type PlatformHandoffV4,
} from '../../../server/platformHandoff.js';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const CONTRACT_BINDING = PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT;
const HANDOFF_BINDING: PlatformHandoffBinding = {
  contractVersion: 'jenfu.sso-handoff.v4',
  manifestSha256: 'a'.repeat(64),
  issuer: 'https://platform.example.test/api/sso',
  audience: 'projed',
};

function handoff(overrides: Record<string, unknown> = {}): PlatformHandoffV4 {
  return {
    contractVersion: 'jenfu.sso-handoff.v4',
    issuer: 'https://platform.example.test/api/sso',
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
  } as PlatformHandoffV4;
}

function stateRow(proof = handoff(), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion,
    principal_id: proof.identity.principalId,
    principal_kind: proof.identity.principalKind,
    employee_id: proof.identity.employeeId,
    identity_issuer: proof.identity.identityIssuer,
    identity_subject: proof.identity.identitySubject,
    google_subject: proof.identity.googleSubject,
    mapping_revision: proof.mappingRevision,
    auth_epoch: String(proof.authState.authEpoch),
    revoked_before: proof.authState.revokedBefore,
    read_at: '2026-10-29T11:59:59.000Z',
    ...overrides,
  };
}

function queryPort(rows: unknown[], record?: (text: string, values: readonly unknown[]) => void): PlatformPrincipalStateQueryPort {
  return {
    async query(text, values) {
      record?.(text, values);
      return { rows };
    },
  };
}

function reader(rows: unknown[], options: {
  now?: () => number;
  binding?: unknown;
  handoffBinding?: PlatformHandoffBinding;
  environment?: 'production' | 'development' | 'test';
  query?: PlatformPrincipalStateQueryPort;
} = {}) {
  return createPlatformPrincipalStateReader({
    query: options.query ?? queryPort(rows),
    contractBinding: (options.binding ?? CONTRACT_BINDING) as typeof CONTRACT_BINDING,
    handoffBinding: options.handoffBinding ?? HANDOFF_BINDING,
    environment: options.environment,
    now: options.now ?? (() => NOW),
  });
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('reads the fixed current-state contract and verifies a personal handoff without Employee', async () => {
  const proof = handoff();
  let queryText = '';
  let queryValues: readonly unknown[] = [];
  const result = await reader([stateRow(proof)], {
    query: queryPort([stateRow(proof)], (text, values) => { queryText = text; queryValues = values; }),
  }).readForHandoff(proof);

  assert.equal(queryText, PLATFORM_PROJED_PRINCIPAL_STATE_SQL);
  assert.deepEqual(queryValues, [proof.identity.identityIssuer, proof.identity.identitySubject, proof.identity.principalId]);
  assert.equal(result.state.principalKind, 'personal');
  assert.equal(result.state.employeeId, null);
  assert.equal(result.state.googleSubject, 'google-sub-456');
  assert.equal(result.state.mappingRevision, '14');
  assert.equal(result.state.authEpoch, 4);
  assert.equal(result.stateReadAtMs, Date.parse('2026-10-29T11:59:59.000Z'));
});

test('reads current state for an existing long-lived source Session without applying handoff expiry', async () => {
  const proof = handoff();
  const laterNow = NOW + 8 * 60 * 60_000;
  const currentRow = stateRow(proof, { read_at: new Date(laterNow - 1_000).toISOString() });
  const result = await reader([currentRow], { now: () => laterNow }).readCurrent({
    identityIssuer: proof.identity.identityIssuer,
    identitySubject: proof.identity.identitySubject,
    principalId: proof.identity.principalId,
  });
  assert.equal(result.principalId, proof.identity.principalId);
  assert.equal(result.authEpoch, proof.authState.authEpoch);
});

test('reads current state on every request and rejects stale or future read_at', async () => {
  const proof = handoff();
  const identity = {
    identityIssuer: proof.identity.identityIssuer,
    identitySubject: proof.identity.identitySubject,
    principalId: proof.identity.principalId,
  };
  let calls = 0;
  const uncached: PlatformPrincipalStateQueryPort = {
    async query() {
      calls += 1;
      return { rows: [stateRow(proof)] };
    },
  };
  const currentReader = reader([], { query: uncached });
  await currentReader.readCurrent(identity);
  await currentReader.readCurrent(identity);
  assert.equal(calls, 2);

  await assert.rejects(reader([stateRow(proof, {
    read_at: new Date(NOW - PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS - 1).toISOString(),
  })]).readCurrent(identity), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  await assert.rejects(reader([stateRow(proof, {
    read_at: new Date(NOW + 1).toISOString(),
  })]).readCurrent(identity), hasCode('IDENTITY_STATE_UNAVAILABLE'));
});

test('accepts a current employee handoff and preserves the signed int64 mapping revision as text', async () => {
  const proof = handoff({
    identity: {
      identityIssuer: 'https://securetoken.google.com/jenfu-test',
      identitySubject: 'firebase-employee-uid',
      principalId: 'employee-principal',
      principalKind: 'employee',
      employeeId: 'EMP-42',
      googleSubject: 'google-employee-sub',
    },
    mappingRevision: '9223372036854775807',
    authState: { authEpoch: Number.MAX_SAFE_INTEGER, revokedBefore: null },
  });
  const result = await reader([stateRow(proof)]).readForHandoff(proof);
  assert.equal(result.state.principalKind, 'employee');
  assert.equal(result.state.employeeId, 'EMP-42');
  assert.equal(result.state.mappingRevision, '9223372036854775807');
  assert.equal(result.state.authEpoch, Number.MAX_SAFE_INTEGER);
});

test('rejects contract-binding drift before querying', async () => {
  let calls = 0;
  const query: PlatformPrincipalStateQueryPort = {
    async query() { calls += 1; return { rows: [] }; },
  };
  assert.throws(() => reader([], {
    query,
    binding: { ...CONTRACT_BINDING, signatureSha256: '0'.repeat(64) },
  }), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  await assert.rejects(reader([], {
    query,
    handoffBinding: { ...HANDOFF_BINDING, issuer: 'https://wrong.example.test/api/sso' },
  }).readForHandoff(handoff()), hasCode('IDENTITY_CONTRACT_UNAVAILABLE'));
  assert.equal(calls, 0);
});

test('treats zero rows, ambiguous rows, and query failures as unavailable state', async () => {
  const proof = handoff();
  await assert.rejects(reader([]).readForHandoff(proof), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  await assert.rejects(reader([stateRow(proof), stateRow(proof)]).readForHandoff(proof), hasCode('IDENTITY_STATE_UNAVAILABLE'));
  const failed: PlatformPrincipalStateQueryPort = { async query() { throw new Error('private db details'); } };
  await assert.rejects(reader([], { query: failed }).readForHandoff(proof), hasCode('IDENTITY_STATE_UNAVAILABLE'));
});

test('rejects malformed, drifted, extra-column, and precision-losing database rows', async () => {
  const proof = handoff();
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['contract drift', { contract_version: 'jenfu.platform.projed-principal-state.v2' }, 'IDENTITY_CONTRACT_UNAVAILABLE'],
    ['missing column', { google_subject: undefined }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['unexpected column', { published_at: '2026-10-29T11:58:00.000Z' }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['revision returned as Number', { mapping_revision: 14 }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['int64 overflow', { mapping_revision: '9223372036854775808' }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['unsafe epoch', { auth_epoch: '9007199254740992' }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['malformed timestamp', { read_at: '2026-02-30T11:59:31.000Z' }, 'IDENTITY_STATE_UNAVAILABLE'],
    ['query key mismatch', { identity_subject: 'another-subject' }, 'IDENTITY_STATE_UNAVAILABLE'],
  ];
  for (const [name, overrides, code] of cases) {
    await assert.rejects(reader([stateRow(proof, overrides)]).readForHandoff(proof), hasCode(code), name);
  }
});

test('denies stale proof after current Google, kind, Employee, mapping, epoch, or revocation drift', () => {
  const proof = handoff();
  const cases: Array<[string, Record<string, unknown>]> = [
    ['Google subject', { google_subject: 'google-subject-changed' }],
    ['principal kind', { principal_kind: 'employee', employee_id: 'EMP-9' }],
    ['Employee ID', { principal_kind: 'employee', employee_id: 'EMP-42' }],
    ['mapping revision', { mapping_revision: '15' }],
    ['auth epoch', { auth_epoch: '5' }],
    ['revocation barrier', { revoked_before: '2026-10-29T11:49:00.000Z' }],
  ];
  for (const [name, overrides] of cases) {
    const currentState = stateRow(proof, overrides);
    const parsed: PlatformPrincipalState = {
      contractVersion: String(currentState.contract_version) as PlatformPrincipalState['contractVersion'],
      principalId: String(currentState.principal_id),
      principalKind: currentState.principal_kind as PlatformPrincipalState['principalKind'],
      employeeId: currentState.employee_id as string | null,
      identityIssuer: String(currentState.identity_issuer),
      identitySubject: String(currentState.identity_subject),
      googleSubject: String(currentState.google_subject),
      mappingRevision: String(currentState.mapping_revision),
      authEpoch: Number(currentState.auth_epoch),
      revokedBefore: currentState.revoked_before as string | null,
      readAt: String(currentState.read_at),
    };
    const parsedProof = parsePlatformHandoffV4(proof, HANDOFF_BINDING, NOW);
    assert.throws(() => verifyProjedHandoffPrincipalState(parsedProof, parsed, NOW), hasCode('IDENTITY_INVALID'), name);
  }
});

test('denies expired, future-issued, overlong, stale-read, and revoked authentication proofs', async () => {
  const expired = handoff({ expiresAt: '2026-10-29T11:59:59.000Z' });
  const futureIssued = handoff({ issuedAt: '2026-10-29T12:00:01.000Z' });
  const overlong = handoff({ expiresAt: '2026-10-29T12:01:00.001Z' });
  const sourceExpiresFirst = handoff({ sourceSessionExpiresAt: '2026-10-29T12:00:10.000Z' });
  const authAtBarrier = handoff({
    authentication: { ...handoff().authentication, authenticatedAt: '2026-10-29T11:50:00.000Z' },
    authState: { authEpoch: 4, revokedBefore: '2026-10-29T11:50:00.000Z' },
  });
  for (const proof of [expired, futureIssued, overlong, sourceExpiresFirst, authAtBarrier]) {
    await assert.rejects(reader([stateRow(proof)]).readForHandoff(proof), hasCode('IDENTITY_INVALID'));
  }

  const current = handoff();
  await assert.rejects(
    reader([stateRow(current, { read_at: '2026-10-29T11:59:29.999Z' })]).readForHandoff(current),
    hasCode('IDENTITY_STATE_UNAVAILABLE'),
  );
  await assert.rejects(
    reader([stateRow(current, { read_at: '2026-10-29T12:00:01.000Z' })]).readForHandoff(current),
    hasCode('IDENTITY_STATE_UNAVAILABLE'),
  );
  const recentIssue = handoff({ issuedAt: '2026-10-29T11:59:58.000Z' });
  await assert.rejects(
    reader([stateRow(recentIssue, { read_at: '2026-10-29T11:59:57.999Z' })]).readForHandoff(recentIssue),
    hasCode('IDENTITY_INVALID'),
  );
});

test('rejects malformed handoff proof before making a state query', async () => {
  let calls = 0;
  const query: PlatformPrincipalStateQueryPort = {
    async query() { calls += 1; return { rows: [] }; },
  };
  const proof = handoff({ extra: 'unexpected' });
  await assert.rejects(reader([], { query }).readForHandoff(proof), hasCode('IDENTITY_INVALID'));
  assert.equal(calls, 0);
});
