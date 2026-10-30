import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeConfig } from '../../../server/config.js';
import type { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';

const actor: ServerActorV1 = {
  principalId: 'fixture-principal',
  localUserId: '11111111-1111-4111-8111-111111111111',
  entry: 'main',
  contextId: '22222222-2222-4222-8222-222222222222',
  expiresAtMs: Date.now() + 60_000,
  accountGuardRevision: '1',
};

const config = {
  profile: {
    runtime: {
      timeouts: {
        transactionMillis: 5_000,
        statementMillis: 2_000,
        lockMillis: 1_000,
        idleInTransactionMillis: 5_000,
      },
    },
  },
} as unknown as RuntimeConfig;

type CommitResult = 'success' | '23503' | 'ECONNRESET' | '40001';

function fakeDatabase(commitResult: CommitResult) {
  const statements: string[] = [];
  const releases: boolean[] = [];
  const client = {
    async query(text: string) {
      statements.push(text.trim());
      if (text.trim() === 'COMMIT' && commitResult !== 'success') {
        const error = new Error('synthetic ' + commitResult);
        Object.assign(error, { code: commitResult });
        throw error;
      }
      if (text.includes('actor_context_valid_v1')) return { rows: [{ valid: true }] };
      return { rows: [] };
    },
  };
  const database = {
    async checkout() {
      return {
        client,
        release(destroy = false) {
          releases.push(destroy);
        },
      };
    },
  } as unknown as RuntimeDatabase;

  return { database, statements, releases };
}

function errorWith(code: string, httpStatus: number) {
  return (error: unknown): boolean => error instanceof KernelError
    && error.code === code
    && error.httpStatus === httpStatus;
}

function commitCount(statements: readonly string[]): number {
  return statements.filter(statement => statement === 'COMMIT').length;
}

test('COMMIT 23503 is a confirmed 409 rejection and destroys its lease without retry', async () => {
  const fake = fakeDatabase('23503');
  let callbackCount = 0;

  await assert.rejects(
    runActorTransaction(fake.database, config, actor, async () => {
      callbackCount += 1;
      return 'callback-result';
    }),
    errorWith('DOMAIN_DATA_INVALID', 409),
  );

  assert.equal(callbackCount, 1);
  assert.equal(commitCount(fake.statements), 1);
  assert.deepEqual(fake.releases, [true]);
  assert.equal(fake.statements.filter(statement => statement === 'ROLLBACK').length, 0);
});

test('COMMIT ECONNRESET remains unknown and never returns the callback result', async () => {
  const fake = fakeDatabase('ECONNRESET');
  let callbackCount = 0;

  await assert.rejects(
    runActorTransaction(fake.database, config, actor, async () => {
      callbackCount += 1;
      return 'must-not-return';
    }),
    errorWith('DB_COMMIT_UNKNOWN', 503),
  );

  assert.equal(callbackCount, 1);
  assert.equal(commitCount(fake.statements), 1);
  assert.deepEqual(fake.releases, [true]);
  assert.equal(fake.statements.filter(statement => statement === 'ROLLBACK').length, 0);
});

test('COMMIT 40001 stays unknown rather than broadening the confirmed rejection class', async () => {
  const fake = fakeDatabase('40001');
  let callbackCount = 0;

  await assert.rejects(
    runActorTransaction(fake.database, config, actor, async () => {
      callbackCount += 1;
      return 'must-not-return';
    }),
    errorWith('DB_COMMIT_UNKNOWN', 503),
  );

  assert.equal(callbackCount, 1);
  assert.equal(commitCount(fake.statements), 1);
  assert.deepEqual(fake.releases, [true]);
  assert.equal(fake.statements.filter(statement => statement === 'ROLLBACK').length, 0);
});

test('successful COMMIT returns the callback result and safely releases the lease', async () => {
  const fake = fakeDatabase('success');
  let callbackCount = 0;

  const result = await runActorTransaction(fake.database, config, actor, async () => {
    callbackCount += 1;
    return { value: 'committed-result' };
  });

  assert.deepEqual(result, { value: 'committed-result' });
  assert.equal(callbackCount, 1);
  assert.equal(commitCount(fake.statements), 1);
  assert.deepEqual(fake.releases, [false]);
});

test('callback query port blocks bare SET statements but allows UPDATE SET clauses', async () => {
  const forbiddenStatements = [
    "SET projed.meeting_ledger_phase='cancel'",
    "/* caller comment */ SET projed.meeting_ledger_phase='cancel'",
    "SELECT 1; SET projed.meeting_ledger_phase='cancel'",
  ];

  for (const statement of forbiddenStatements) {
    const fake = fakeDatabase('success');
    let callbackCount = 0;

    await assert.rejects(
      runActorTransaction(fake.database, config, actor, async port => {
        callbackCount += 1;
        await port.query(statement);
        return 'must-not-return';
      }),
      errorWith('TRANSACTION_USAGE_INVALID', 500),
    );

    assert.equal(callbackCount, 1);
    assert.equal(fake.statements.includes(statement), false, `forbidden SQL was sent: ${statement}`);
    assert.equal(commitCount(fake.statements), 0);
  }

  const fake = fakeDatabase('success');
  const update = 'UPDATE projed_core.meeting_analysis_runs SET state = $1 WHERE id = $2';
  const result = await runActorTransaction(fake.database, config, actor, async port => (
    port.query(update, ['cancelled', 'a4234567-1234-4234-8234-123456789001'])
  ));

  assert.deepEqual(result.rows, []);
  assert.equal(fake.statements.includes(update), true);
  assert.equal(commitCount(fake.statements), 1);
});
