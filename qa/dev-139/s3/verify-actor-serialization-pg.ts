import assert from 'node:assert/strict';
import type { PoolClient, QueryResultRow } from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import type { RuntimeConfig } from '../../../server/config.js';
import type { DatabaseLease, RuntimeDatabase } from '../../../server/db.js';

const RUNTIME_LOCK_MARKER = 'projed:runtime-transaction:v1';
const OBSERVATION_WINDOW_MS = 500;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitBounded(promise: Promise<void>, label: string, timeoutMs = 4_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface ActivityRow extends QueryResultRow {
  readonly pid: number;
  readonly usename: string | null;
  readonly query: string | null;
  readonly wait_event_type: string | null;
  readonly wait_event: string | null;
  readonly query_start: Date | null;
  readonly monitor_role: string;
}

async function findRuntimeLockWaiters(client: PoolClient, marker: Date): Promise<ActivityRow[]> {
  const result = await client.query<ActivityRow>(`
    SELECT activity.pid,
           activity.usename,
           activity.query,
           activity.wait_event_type,
           activity.wait_event,
           activity.query_start,
           current_user::text AS monitor_role
      FROM pg_catalog.pg_stat_activity AS activity
     WHERE activity.pid <> pg_backend_pid()
       AND activity.datname = current_database()
       AND activity.usename = current_user
       AND activity.query LIKE '%' || $1::text || '%'
       AND activity.query_start >= $2::timestamptz
       AND activity.wait_event_type = 'Lock'
       AND activity.wait_event = 'advisory'
  `, [RUNTIME_LOCK_MARKER, marker]);
  return result.rows;
}

/**
 * Native disposable-PostgreSQL proof that the app-wide actor transaction lock
 * serializes different-account callbacks before either callback can run.
 */
export async function verifyActorSerializationPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actorA: ServerActorV1,
  actorB: ServerActorV1,
): Promise<void> {
  assert.equal(config.env, 'disposable', 'actor serialization requires a disposable profile');
  assert.equal(config.profile.environment, 'disposable', 'actor serialization profile must be disposable');
  assert.equal(config.profile.database.host, '127.0.0.1', 'actor serialization must use loopback PostgreSQL');
  assert.equal(config.binding.connectionMode ?? 'loopback', 'loopback', 'actor serialization must use a loopback binding');
  assert.match(config.binding.databaseName, /^dev139_s3_[0-9a-f]{32}$/u, 'actor serialization database must be task-disposable');
  assert.ok(config.profile.runtime.pool.max >= 3, 'actor serialization requires three runtime pool leases');
  assert.notEqual(actorA.localUserId, actorB.localUserId, 'actors must belong to different accounts');

  const enteredA = deferred<void>();
  const releaseA = deferred<void>();
  const events: string[] = [];
  let monitorLease: DatabaseLease | undefined;
  let transactionA: Promise<string> | undefined;
  let transactionB: Promise<string> | undefined;
  let firstFailure: unknown;
  let hasFailure = false;

  try {
    transactionA = runActorTransaction(database, config, actorA, async () => {
      events.push('A-enter');
      enteredA.resolve();
      await releaseA.promise;
      events.push('A-callback-finished');
      return 'A';
    });
    void transactionA.catch(() => undefined);
    await waitBounded(enteredA.promise, 'ACTOR_A_CALLBACK');

    // Reserve the observer connection before B starts so it is the third
    // concurrent lease, independent of A and B's actor transactions.
    monitorLease = await database.checkout();
    const markerResult = await monitorLease.client.query<{ marker: Date } & QueryResultRow>(
      'SELECT clock_timestamp() AS marker',
    );
    const marker = markerResult.rows[0]?.marker;
    assert.ok(marker instanceof Date, 'monitor must obtain a PostgreSQL timestamp marker');

    transactionB = runActorTransaction(database, config, actorB, async () => {
      events.push('B-enter');
      return 'B';
    });
    void transactionB.catch(() => undefined);

    const deadline = performance.now() + OBSERVATION_WINDOW_MS;
    let observedWaiter: ActivityRow | undefined;
    do {
      const waiters = await findRuntimeLockWaiters(monitorLease.client, marker);
      const candidate = waiters.find(row => (
        row.usename === row.monitor_role
        && row.query?.includes(RUNTIME_LOCK_MARKER) === true
        && row.wait_event_type === 'Lock'
        && row.wait_event === 'advisory'
      ));
      observedWaiter = performance.now() <= deadline ? candidate : undefined;
      if (observedWaiter) break;
      const remainingMs = deadline - performance.now();
      if (remainingMs <= 0) break;
      await sleep(Math.min(20, remainingMs));
    } while (performance.now() < deadline);

    assert.ok(observedWaiter, 'B must be visible waiting on the runtime advisory lock within 500 ms');
    assert.equal(events.includes('B-enter'), false, 'B callback must not enter while A holds the transaction lock');

    releaseA.resolve();
    const [resultA, resultB] = await Promise.all([transactionA, transactionB]);
    assert.equal(resultA, 'A');
    assert.equal(resultB, 'B');
    assert.deepEqual(events, ['A-enter', 'A-callback-finished', 'B-enter']);
  } catch (error) {
    firstFailure = error;
    hasFailure = true;
  } finally {
    releaseA.resolve();
    monitorLease?.release();

    const transactions = [transactionA, transactionB].filter(
      (transaction): transaction is Promise<string> => transaction !== undefined,
    );
    const outcomes = await Promise.allSettled(transactions);
    if (!hasFailure) {
      const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (rejected) {
        firstFailure = rejected.reason;
        hasFailure = true;
      }
    }
  }

  if (hasFailure) throw firstFailure;
}
