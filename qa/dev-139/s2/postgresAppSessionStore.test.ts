import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { CompleteLoginInput, StoredLoginIntent } from '../../../server/appSessionStore.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import type { ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const TOKEN_HASH = 'a'.repeat(64);
const STATE_HASH = 'b'.repeat(64);
const CLAIM_HASH = 'c'.repeat(64);
const SESSION_HASH = 'd'.repeat(64);
const OLD_SESSION_HASH = 'e'.repeat(64);
const LOCAL_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTEXT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRINCIPAL_ID = 'principal:personal-a';

function identity(overrides: Partial<ProducerVerifiedIdentity> = {}): ProducerVerifiedIdentity {
  return {
    contractVersion: 'jenfu.sso-handoff.v4',
    manifestSha256: 'f'.repeat(64),
    issuer: 'https://identity.example.test/api/sso',
    audience: 'projed',
    identityIssuer: 'https://securetoken.google.com/projed-test',
    identitySubject: 'firebase-subject-a',
    principalId: PRINCIPAL_ID,
    principalKind: 'personal',
    googleSubject: 'google-subject-a',
    employeeId: null,
    authEpoch: 4,
    authenticatedAtMs: NOW - 2_000,
    revokedBeforeMs: null,
    sourceSessionExpiresAtMs: NOW + 8 * 60 * 60 * 1_000,
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    currentStateExpiresAtMs: NOW + 10_000,
    mappingRevision: '12',
    ...overrides,
  };
}

function intent(overrides: Partial<StoredLoginIntent> = {}): StoredLoginIntent {
  return {
    tokenHash: TOKEN_HASH,
    stateHash: STATE_HASH,
    entry: 'main',
    publicOrigin: 'https://projed.example.test',
    returnPath: '/home',
    oldSessionHash: OLD_SESSION_HASH,
    codeVerifier: 'v'.repeat(43),
    status: 'processing',
    claimHash: CLAIM_HASH,
    completedSessionHash: null,
    expiresAtMs: NOW + 180_000,
    ...overrides,
  };
}

function completeInput(overrides: Partial<CompleteLoginInput> = {}): CompleteLoginInput {
  const proof = identity();
  return {
    tokenHash: TOKEN_HASH,
    stateHash: STATE_HASH,
    claimHash: CLAIM_HASH,
    sessionTokenHash: SESSION_HASH,
    entry: 'main',
    contextId: CONTEXT_ID,
    identity: proof,
    nowMs: NOW,
    ...overrides,
  };
}

interface QueryRecord { readonly sql: string; readonly values: readonly unknown[]; }
interface HarnessOptions {
  readonly intent?: StoredLoginIntent;
  readonly guardRevision?: string;
  readonly identity?: ProducerVerifiedIdentity;
  readonly oldSessionIdentity?: ProducerVerifiedIdentity;
  readonly mapStatus?: 'active' | 'missing' | 'inactive' | 'ambiguous' | 'unavailable';
  readonly guardExists?: boolean;
  readonly failOperation?: 'intent-select' | 'guard-insert';
  readonly failCommit?: boolean;
  readonly failRollback?: boolean;
  readonly oldSessionRevokedAtMs?: number | null;
  readonly oldSessionExpiresAtMs?: number;
  readonly revokeRowCount?: number;
}

function harness(options: HarnessOptions = {}) {
  const queries: QueryRecord[] = [];
  const releases: boolean[] = [];
  let checkouts = 0;
  const storedIntent = options.intent ?? intent();
  const proof = options.identity ?? identity();
  const previousProof = options.oldSessionIdentity ?? proof;
  let proofCreated = false;
  let guardCreated = false;
  let createdLocalUserId: string | null = null;
  let commitFailurePending = options.failCommit === true;
  const oldSessionRow = {
    token_hash: OLD_SESSION_HASH,
    public_origin: storedIntent.publicOrigin,
    entry: storedIntent.entry,
    local_user_id: LOCAL_USER_ID,
    google_subject: previousProof.googleSubject,
    context_id: CONTEXT_ID,
    account_guard_revision: options.guardRevision ?? '3',
    identity: previousProof,
    expires_at_ms: String(options.oldSessionExpiresAtMs ?? previousProof.sourceSessionExpiresAtMs),
    revoked_at_ms: options.oldSessionRevokedAtMs == null ? null : String(options.oldSessionRevokedAtMs),
  };
  const sessionRow = () => ({
    token_hash: SESSION_HASH,
    public_origin: storedIntent.publicOrigin,
    entry: storedIntent.entry,
    local_user_id: createdLocalUserId ?? LOCAL_USER_ID,
    google_subject: proof.googleSubject,
    context_id: CONTEXT_ID,
    account_guard_revision: guardCreated ? '1' : options.guardRevision ?? '3',
    identity: proof,
    expires_at_ms: String(proof.sourceSessionExpiresAtMs),
    revoked_at_ms: null,
  });

  const client = {
    async query<R extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []) {
      const normalized = sql.replace(/\s+/gu, ' ').trim();
      queries.push({ sql: normalized, values });
      if (normalized === 'COMMIT' && commitFailurePending) {
        commitFailurePending = false;
        throw new Error('simulated lost commit response');
      }
      if (normalized === 'ROLLBACK' && options.failRollback) throw new Error('simulated rollback failure');
      if (options.failOperation === 'guard-insert' && /INSERT INTO projed_core\.account_authorization_guards/u.test(normalized)) {
        throw new Error('simulated guard insert failure');
      }
      if (/SELECT .*FROM projed_core\.app_login_intents/u.test(normalized)) {
        if (options.failOperation === 'intent-select') throw new Error('simulated operation query failure');
        return result([{
          token_hash: storedIntent.tokenHash,
          state_hash: storedIntent.stateHash,
          entry: storedIntent.entry,
          public_origin: storedIntent.publicOrigin,
          return_path: storedIntent.returnPath,
          old_session_hash: storedIntent.oldSessionHash,
          code_verifier: storedIntent.codeVerifier,
          status: storedIntent.status,
          claim_hash: storedIntent.claimHash,
          completed_session_hash: storedIntent.completedSessionHash,
          expires_at_ms: String(storedIntent.expiresAtMs),
        }] as unknown as R[]);
      }
      if (/SELECT .*FROM projed_core\.app_sessions/u.test(normalized)) return result([oldSessionRow] as unknown as R[]);
      if (/SELECT local_user_id::text FROM projed_core\.google_identity_proofs/u.test(normalized)) {
        if (options.mapStatus === 'unavailable') throw new Error('simulated mapping read failure');
        if (options.mapStatus === 'missing' && !proofCreated) return result([]);
        if (options.mapStatus === 'ambiguous') {
          return result([{ local_user_id: LOCAL_USER_ID }, { local_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }] as unknown as R[]);
        }
        return result([{ local_user_id: createdLocalUserId ?? LOCAL_USER_ID }] as unknown as R[]);
      }
      if (/SELECT active, revision::text FROM projed_core\.account_authorization_guards/u.test(normalized)) {
        if (options.guardExists === false && !guardCreated) return result([]);
        return result([{ active: options.mapStatus !== 'inactive' || guardCreated,
          revision: guardCreated ? '1' : options.guardRevision ?? '3' }] as unknown as R[]);
      }
      if (/INSERT INTO projed_core\.profiles/u.test(normalized)) {
        createdLocalUserId = String(values[0]);
        return result([]);
      }
      if (/INSERT INTO projed_core\.google_identity_proofs/u.test(normalized)) {
        proofCreated = true;
        return result([]);
      }
      if (/INSERT INTO projed_core\.account_authorization_guards/u.test(normalized)) {
        guardCreated = true;
        return result([]);
      }
      if (/INSERT INTO projed_core\.app_sessions/u.test(normalized)) return result([sessionRow()] as unknown as R[]);
      if (/UPDATE projed_core\.app_sessions/u.test(normalized)) return result([], options.revokeRowCount ?? 1);
      if (/UPDATE projed_core\.app_login_intents/u.test(normalized)) return result([], 1);
      return result([]);
    },
  };
  const lease = {
    client: client as unknown as PoolClient,
    release(destroy = false) { releases.push(destroy); },
  };
  const database = {
    async checkout() { checkouts += 1; return lease; },
  } as unknown as RuntimeDatabase;

  return {
    store: new PostgresAppSessionStore(database, { now: () => NOW }),
    queries,
    releases,
    get createdLocalUserId() { return createdLocalUserId; },
    get checkouts() { return checkouts; },
  };
}

function result<R extends QueryResultRow>(rows: R[], rowCount = rows.length): QueryResult<R> {
  return { rows, rowCount, command: 'SELECT', oid: 0, fields: [] };
}

async function expectKernelCode(action: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof KernelError && error.code === code);
}

function completeQueries(queries: readonly QueryRecord[]): string[] {
  return queries.map(({ sql }) => sql);
}

test('unknown COMMIT outcome destroys the lease without retry or misleading rollback', async () => {
  const db = harness({ failCommit: true });
  await expectKernelCode(db.store.complete(completeInput()), 'DB_COMMIT_UNKNOWN');

  assert.equal(db.checkouts, 1);
  assert.deepEqual(db.releases, [true]);
  const sql = completeQueries(db.queries);
  assert.equal(sql.filter((statement) => statement === 'COMMIT').length, 1);
  assert.equal(sql.includes('ROLLBACK'), false);
});

test('operation failure rolls back and safely releases only after confirmed rollback', async () => {
  const db = harness({ failOperation: 'intent-select' });
  await expectKernelCode(db.store.complete(completeInput()), 'IDENTITY_STATE_UNAVAILABLE');

  assert.deepEqual(db.releases, [false]);
  assert.equal(completeQueries(db.queries).filter((statement) => statement === 'ROLLBACK').length, 1);
  assert.equal(completeQueries(db.queries).includes('COMMIT'), false);
});

test('operation failure with uncertain rollback destroys the lease', async () => {
  const db = harness({ failOperation: 'intent-select', failRollback: true });
  await expectKernelCode(db.store.complete(completeInput()), 'IDENTITY_STATE_UNAVAILABLE');

  assert.deepEqual(db.releases, [true]);
  assert.equal(completeQueries(db.queries).filter((statement) => statement === 'ROLLBACK').length, 1);
  assert.equal(completeQueries(db.queries).includes('COMMIT'), false);
});

test('cancelled intent is settled before any session publish or old-session revoke', async () => {
  const db = harness({ mapStatus: 'missing', intent: intent({ status: 'cancelled', claimHash: null, codeVerifier: null }) });
  await expectKernelCode(db.store.complete(completeInput()), 'IDENTITY_INVALID');

  const sql = completeQueries(db.queries);
  assert.equal(sql.some((statement) => /pg_advisory_xact_lock\(hashtextextended\('projed:google-subject:'/u.test(statement)), false);
  assert.equal(sql.some((statement) => /INSERT INTO projed_core\.(profiles|google_identity_proofs|account_authorization_guards)/u.test(statement)), false);
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)).length, 0);
  assert.equal(sql.filter((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)).length, 0);
  assert.deepEqual(db.releases, [false]);
});

test('expired intent and expired current-state proof are rejected before publishing', async () => {
  const expiredIntentDb = harness({ intent: intent({ expiresAtMs: NOW }) });
  await expectKernelCode(expiredIntentDb.store.complete(completeInput()), 'IDENTITY_INVALID');
  assert.equal(completeQueries(expiredIntentDb.queries).filter((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)).length, 0);
  assert.equal(completeQueries(expiredIntentDb.queries).filter((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)).length, 0);

  const expiredStateDb = harness();
  const invalidInput = completeInput({
    identity: identity({ currentStateExpiresAtMs: NOW }),
  });
  await expectKernelCode(expiredStateDb.store.complete(invalidInput), 'IDENTITY_INVALID');
  assert.equal(expiredStateDb.checkouts, 0);
});

test('active account guard revision is read from the database for the new Session', async () => {
  const db = harness({ guardRevision: '4' });
  const session = await db.store.complete(completeInput());

  const sql = completeQueries(db.queries);
  assert.equal(session.accountGuardRevision, '4');
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)).length, 1);
  assert.deepEqual(db.releases, [false]);
});

test('revoked or expired old AppSession cannot start or complete a replacement login', async () => {
  const revokedDb = harness({ oldSessionRevokedAtMs: NOW - 1 });
  await expectKernelCode(revokedDb.store.begin(intent({ status: 'pending', claimHash: null })), 'ACTOR_CHANGED');
  assert.equal(completeQueries(revokedDb.queries).filter((statement) => /INSERT INTO projed_core\.app_login_intents/u.test(statement)).length, 0);

  const expiredDb = harness({ oldSessionExpiresAtMs: NOW });
  await expectKernelCode(expiredDb.store.complete(completeInput()), 'ACTOR_CHANGED');
  assert.equal(completeQueries(expiredDb.queries).filter((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)).length, 0);
  assert.equal(completeQueries(expiredDb.queries).filter((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)).length, 0);
});

test('zero-row old-session revoke rejects replacement before new session insert', async () => {
  const db = harness({ revokeRowCount: 0 });
  await expectKernelCode(db.store.complete(completeInput()), 'ACTOR_CHANGED');

  const sql = completeQueries(db.queries);
  assert.equal(sql.filter((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)).length, 1);
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)).length, 0);
  assert.deepEqual(db.releases, [false]);
});

test('a new start after an unknown begin cancels orphan intents before inserting its nonce', async () => {
  const db = harness({ failCommit: true });
  const first = intent({ status: 'pending', claimHash: null, tokenHash: TOKEN_HASH, stateHash: STATE_HASH });
  await expectKernelCode(db.store.begin(first), 'DB_COMMIT_UNKNOWN');

  const second = intent({
    status: 'pending',
    claimHash: null,
    tokenHash: 'f'.repeat(64),
    stateHash: '0'.repeat(64),
  });
  await db.store.begin(second);

  const sql = completeQueries(db.queries);
  const secondBegin = sql.lastIndexOf('BEGIN ISOLATION LEVEL READ COMMITTED');
  const oldSessionLock = sql.findIndex((statement, index) => index > secondBegin
    && /SELECT .*FROM projed_core\.app_sessions.*FOR UPDATE/u.test(statement));
  const orphanCancel = sql.findIndex((statement, index) => index > oldSessionLock
    && /UPDATE projed_core\.app_login_intents SET status='cancelled'.*old_session_hash=\$1.*status IN \('pending','processing'\)/u.test(statement));
  const insert = sql.findIndex((statement, index) => index > orphanCancel
    && /INSERT INTO projed_core\.app_login_intents/u.test(statement));
  const secondCommit = sql.findIndex((statement, index) => index > insert && statement === 'COMMIT');
  assert.ok(secondBegin >= 0 && oldSessionLock > secondBegin);
  assert.ok(orphanCancel > oldSessionLock && insert > orphanCancel && secondCommit > insert);
  assert.deepEqual(db.releases, [true, false]);
});

test('successful completion consumes the claim and revokes the old session in one transaction', async () => {
  const db = harness();
  const input = completeInput();
  const session = await db.store.complete(input);
  const sql = completeQueries(db.queries);
  const beginIndex = sql.findIndex((statement) => statement.startsWith('BEGIN ISOLATION LEVEL READ COMMITTED'));
  const initialIntentReadIndex = sql.findIndex((statement) => /SELECT .*FROM projed_core\.app_login_intents/u.test(statement));
  const oldSessionLockIndex = sql.findIndex((statement) => /SELECT .*FROM projed_core\.app_sessions.*FOR UPDATE/u.test(statement));
  const lockedIntentIndex = sql.findIndex((statement, index) => index > oldSessionLockIndex
    && /SELECT .*FROM projed_core\.app_login_intents.*FOR UPDATE/u.test(statement));
  const googleLockIndex = sql.findIndex((statement) => /pg_advisory_xact_lock\(hashtextextended\('projed:google-subject:'/u.test(statement));
  const accountLockIndex = sql.findIndex((statement) => /pg_advisory_xact_lock_shared\(hashtextextended\('projed:account:'/u.test(statement));
  const revokeIndex = sql.findIndex((statement) => /UPDATE projed_core\.app_sessions/u.test(statement));
  const insertIndex = sql.findIndex((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement));
  const consumeIndex = sql.findIndex((statement) => /UPDATE projed_core\.app_login_intents/u.test(statement));
  const commitIndex = sql.findIndex((statement) => statement === 'COMMIT');
  assert.ok(beginIndex >= 0 && beginIndex < initialIntentReadIndex);
  assert.ok(initialIntentReadIndex < oldSessionLockIndex && oldSessionLockIndex < lockedIntentIndex);
  assert.ok(lockedIntentIndex < googleLockIndex && googleLockIndex < accountLockIndex && accountLockIndex < revokeIndex);
  assert.ok(revokeIndex < insertIndex && insertIndex < consumeIndex && consumeIndex < commitIndex);
  assert.equal(sql.filter((statement) => statement === 'COMMIT').length, 1);
  assert.equal(db.checkouts, 1);
  assert.deepEqual(db.releases, [false]);

  assert.equal(session.contextId, CONTEXT_ID);
  assert.equal(session.expiresAtMs, input.identity.sourceSessionExpiresAtMs);
  assert.equal(input.identity.expiresAtMs - NOW, 60_000);
  assert.equal(input.identity.sourceSessionExpiresAtMs - NOW, 8 * 60 * 60 * 1_000);
  const insert = db.queries.find(({ sql: statement }) => /INSERT INTO projed_core\.app_sessions/u.test(statement));
  assert.ok(insert);
  assert.equal(insert.values[5], CONTEXT_ID);
  assert.equal(insert.values[8], input.identity.sourceSessionExpiresAtMs);
});

test('first login creates a profile, Google proof, active guard and Session for personal and employee admissions', async () => {
  const proofs = [
    identity({ verifiedEmail: 'personal@example.test' }),
    identity({ principalId: 'principal:employee-42', principalKind: 'employee', employeeId: 'E-42',
      verifiedEmail: 'employee@example.test' }),
  ];
  for (const proof of proofs) {
    const db = harness({ mapStatus: 'missing', identity: proof,
      oldSessionIdentity: identity({ principalId: 'principal:previous', googleSubject: 'previous-google-subject' }) });
    const session = await db.store.complete(completeInput({ identity: proof, entry: 'main' }));
    const sql = completeQueries(db.queries);
    const profileIndex = sql.findIndex((statement) => /INSERT INTO projed_core\.profiles/u.test(statement));
    const proofIndex = sql.findIndex((statement) => /INSERT INTO projed_core\.google_identity_proofs/u.test(statement));
    const guardIndex = sql.findIndex((statement) => /INSERT INTO projed_core\.account_authorization_guards/u.test(statement));
    const oldSessionLockIndex = sql.findIndex((statement) => /SELECT .*FROM projed_core\.app_sessions.*FOR UPDATE/u.test(statement));
    const lockedIntentIndex = sql.findIndex((statement, index) => index > oldSessionLockIndex
      && /SELECT .*FROM projed_core\.app_login_intents.*FOR UPDATE/u.test(statement));
    const googleLockIndex = sql.findIndex((statement) => /pg_advisory_xact_lock\(hashtextextended\('projed:google-subject:'/u.test(statement));
    const accountLockIndex = sql.findIndex((statement) => /pg_advisory_xact_lock_shared\(hashtextextended\('projed:account:'/u.test(statement));
    const revokeIndex = sql.findIndex((statement) => /UPDATE projed_core\.app_sessions/u.test(statement));
    const sessionIndex = sql.findIndex((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement));
    const consumeIndex = sql.findIndex((statement) => /UPDATE projed_core\.app_login_intents/u.test(statement));
    const commitIndex = sql.findIndex((statement) => statement === 'COMMIT');
    assert.ok(oldSessionLockIndex >= 0 && oldSessionLockIndex < lockedIntentIndex);
    assert.ok(lockedIntentIndex < googleLockIndex && googleLockIndex < profileIndex);
    assert.ok(profileIndex < proofIndex && proofIndex < guardIndex && guardIndex < accountLockIndex);
    assert.ok(accountLockIndex < revokeIndex && revokeIndex < sessionIndex && sessionIndex < consumeIndex && consumeIndex < commitIndex);
    assert.equal(session.localUserId, db.createdLocalUserId);
    assert.notEqual(session.localUserId, LOCAL_USER_ID);
    assert.match(session.localUserId, /^[a-f0-9-]{36}$/u);
    assert.equal(session.accountGuardRevision, '1');
    assert.deepEqual(session.identity, proof);
    assert.equal(db.queries[profileIndex]!.values[1], proof.verifiedEmail);
    const profileQuery = db.queries[profileIndex]!;
    assert.match(profileQuery.sql, /\(id,email,display_name\).*VALUES\(\$1::uuid,\$2,\$2\)/u);
    assert.deepEqual(db.queries[proofIndex]!.values, [proof.googleSubject, db.createdLocalUserId]);
    assert.deepEqual(db.queries[guardIndex]!.values, [db.createdLocalUserId]);
    assert.match(db.queries[guardIndex]!.sql, /\(local_user_id,active,revision\)/u);
    assert.equal(/RETURNING|ON CONFLICT/u.test(profileQuery.sql + db.queries[proofIndex]!.sql + db.queries[guardIndex]!.sql), false);
    const registration = db.queries.find(({ sql: statement }) => statement.includes("set_config('projed.registration_user_id'"));
    assert.ok(registration);
    assert.deepEqual(registration.values, [proof.googleSubject, db.createdLocalUserId, proof.verifiedEmail, CLAIM_HASH]);
  }
});

test('missing verified email denies first-login bootstrap before any insert', async () => {
  const db = harness({ mapStatus: 'missing', intent: intent({ oldSessionHash: null }) });
  await expectKernelCode(db.store.complete(completeInput()), 'ACCESS_DENIED');

  const sql = completeQueries(db.queries);
  assert.equal(sql.some((statement) => /INSERT INTO projed_core\.(profiles|google_identity_proofs|account_authorization_guards|app_sessions)/u.test(statement)), false);
  assert.equal(sql.some((statement) => /UPDATE projed_core\.app_login_intents SET status='consumed'/u.test(statement)), false);
  assert.deepEqual(db.releases, [false]);
});

test('existing proof with missing or inactive guard is denied without bootstrap or reactivation', async () => {
  for (const options of [{ mapStatus: 'inactive' as const }, { guardExists: false }]) {
    const proof = identity({ verifiedEmail: 'existing@example.test' });
    const db = harness({ ...options, identity: proof });
    await expectKernelCode(db.store.complete(completeInput({ identity: proof })), 'ACCESS_DENIED');
    const sql = completeQueries(db.queries);
    assert.equal(sql.some((statement) => /INSERT INTO projed_core\.(profiles|google_identity_proofs|account_authorization_guards|app_sessions)/u.test(statement)), false);
    assert.equal(sql.some((statement) => /UPDATE projed_core\.account_authorization_guards/u.test(statement)), false);
    assert.equal(sql.some((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)), false);
    assert.deepEqual(db.releases, [false]);
  }
});

test('ambiguous or unavailable mapping state never falls through to first-login creation', async () => {
  for (const scenario of [
    { mapStatus: 'ambiguous' as const, error: 'ACCESS_DENIED' },
    { mapStatus: 'unavailable' as const, error: 'IDENTITY_STATE_UNAVAILABLE' },
  ]) {
    const proof = identity({ verifiedEmail: 'not-a-link-key@example.test' });
    const db = harness({ ...scenario, identity: proof });
    await expectKernelCode(db.store.complete(completeInput({ identity: proof })), scenario.error);
    const sql = completeQueries(db.queries);
    assert.equal(sql.some((statement) => /INSERT INTO projed_core\.(profiles|google_identity_proofs|account_authorization_guards|app_sessions)/u.test(statement)), false);
    assert.equal(sql.some((statement) => /UPDATE projed_core\.app_sessions/u.test(statement)), false);
    assert.equal(sql.some((statement) => /UPDATE projed_core\.app_login_intents SET status='consumed'/u.test(statement)), false);
  }
});

test('bootstrap insert failure rolls back before publishing Session or consuming the intent', async () => {
  const proof = identity({ verifiedEmail: 'rollback@example.test' });
  const db = harness({ mapStatus: 'missing', identity: proof, intent: intent({ oldSessionHash: null }), failOperation: 'guard-insert' });
  await expectKernelCode(db.store.complete(completeInput({ identity: proof })), 'IDENTITY_STATE_UNAVAILABLE');

  const sql = completeQueries(db.queries);
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.profiles/u.test(statement)).length, 1);
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.google_identity_proofs/u.test(statement)).length, 1);
  assert.equal(sql.filter((statement) => /INSERT INTO projed_core\.account_authorization_guards/u.test(statement)).length, 1);
  assert.equal(sql.some((statement) => /INSERT INTO projed_core\.app_sessions/u.test(statement)), false);
  assert.equal(sql.some((statement) => /UPDATE projed_core\.app_login_intents SET status='consumed'/u.test(statement)), false);
  assert.equal(sql.includes('COMMIT'), false);
  assert.equal(sql.includes('ROLLBACK'), true);
  assert.deepEqual(db.releases, [false]);
});
