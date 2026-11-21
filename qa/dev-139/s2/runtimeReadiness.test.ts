import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase, type DatabaseLease, type ExpectedMigration } from '../../../server/db.js';

const config = {
  entry: 'main',
  databaseUrl: 'postgres://projed:projed@127.0.0.1:1/projed',
  binding: { databaseName: 'projed', runtimeRole: 'projed_runtime' },
  profile: {
    runtime: {
      pool: { max: 1, min: 0, idleTimeoutMillis: 1_000, connectionTimeoutMillis: 100, maxWaiting: 1 },
      timeouts: { statementMillis: 1_000, lockMillis: 1_000, idleInTransactionMillis: 1_000 },
    },
  },
} as RuntimeConfig;

const expected: readonly ExpectedMigration[] = [{ version: '0001', checksum: 'a'.repeat(64) }];

function readinessFixture(input: { checkoutError?: Error; queryError?: Error; ok?: boolean } = {}) {
  const database = new RuntimeDatabase(config);
  const releases: boolean[] = [];
  let checkoutCalls = 0;
  let queryCalls = 0;
  const lease: DatabaseLease = {
    client: {
      async query() {
        queryCalls += 1;
        if (input.queryError) throw input.queryError;
        return { rows: [{ ok: input.ok === true }] };
      },
    } as unknown as DatabaseLease['client'],
    release(destroy = false) {
      releases.push(destroy);
    },
  };

  Object.defineProperty(database, 'checkout', {
    configurable: true,
    value: async () => {
      checkoutCalls += 1;
      if (input.checkoutError) throw input.checkoutError;
      return lease;
    },
  });

  return { database, checkoutCalls: () => checkoutCalls, queryCalls: () => queryCalls, releases };
}

test('checkout rejection returns false without an acquired lease to release', async () => {
  const fixture = readinessFixture({ checkoutError: new Error('synthetic checkout failure') });
  try {
    assert.equal(await fixture.database.readiness(expected), false);
    assert.equal(fixture.checkoutCalls(), 1);
    assert.equal(fixture.queryCalls(), 0);
    assert.deepEqual(fixture.releases, []);
  } finally {
    await fixture.database.end();
  }
});

test('query failure returns false and destroys the acquired lease exactly once', async () => {
  const fixture = readinessFixture({ queryError: new Error('synthetic query failure') });
  try {
    assert.equal(await fixture.database.readiness(expected), false);
    assert.equal(fixture.checkoutCalls(), 1);
    assert.equal(fixture.queryCalls(), 1);
    assert.deepEqual(fixture.releases, [true]);
  } finally {
    await fixture.database.end();
  }
});

test('successful ready result returns true and normally releases the lease once', async () => {
  const fixture = readinessFixture({ ok: true });
  try {
    assert.equal(await fixture.database.readiness(expected), true);
    assert.equal(fixture.queryCalls(), 1);
    assert.deepEqual(fixture.releases, [false]);
  } finally {
    await fixture.database.end();
  }
});

test('successful not-ready result returns false and normally releases the lease once', async () => {
  const fixture = readinessFixture({ ok: false });
  try {
    assert.equal(await fixture.database.readiness(expected), false);
    assert.equal(fixture.queryCalls(), 1);
    assert.deepEqual(fixture.releases, [false]);
  } finally {
    await fixture.database.end();
  }
});
