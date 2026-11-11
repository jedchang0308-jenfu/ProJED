import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { awaitDatabaseStartup, isRetryableDatabaseStartup } from '../../../server/startup.js';

function transportError(code?: string, message = 'connect failed'): Error {
  const error = new Error(message);
  if (code !== undefined) Object.assign(error, { code });
  return error;
}

function unavailable(cause: Error): KernelError {
  return new KernelError('DB_UNAVAILABLE', 'Database checkout failed', 503, { cause });
}

function fakeClock() {
  let current = 0;
  const waits: number[] = [];
  return {
    now: () => current,
    waits,
    async sleep(delayMs: number) {
      waits.push(delayMs);
      current += delayMs;
    },
  };
}

test('retry classifier accepts only the startup network errno allowlist and exact code-less transport EOFs', () => {
  for (const code of [
    'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND',
  ]) {
    assert.equal(isRetryableDatabaseStartup(unavailable(transportError(code))), true, code);
  }
  const codeLessRetryableMessages = [
    'Connection terminated unexpectedly',
    'Connection terminated',
    'Connection terminated due to connection timeout',
    'timeout exceeded when trying to connect',
  ];
  for (const message of codeLessRetryableMessages) {
    assert.equal(isRetryableDatabaseStartup(unavailable(transportError(undefined, message))), true, message);
    assert.equal(isRetryableDatabaseStartup(unavailable(transportError('28P01', message))), false, message);
  }

  assert.equal(isRetryableDatabaseStartup(unavailable(transportError('28P01'))), false);
  assert.equal(isRetryableDatabaseStartup(unavailable(transportError('28000'))), false);
  assert.equal(isRetryableDatabaseStartup(unavailable(transportError('42501'))), false);
  assert.equal(isRetryableDatabaseStartup(unavailable(transportError('ECONNREFUSED', 'Connection terminated'))), true);
  assert.equal(isRetryableDatabaseStartup(unavailable(transportError('XX000', 'Connection terminated'))), false);
  assert.equal(isRetryableDatabaseStartup(new Error('connect failed')), false);
  assert.equal(isRetryableDatabaseStartup(new KernelError('DB_BOUNDARY_INVALID', 'role mismatch', 503, {
    cause: transportError('ECONNREFUSED'),
  })), false);
  assert.equal(isRetryableDatabaseStartup(new KernelError('CONFIG_INVALID', 'bad binding', 503, {
    cause: transportError('ECONNREFUSED'),
  })), false);
});

test('a transient network checkout failure is retried until the boundary check succeeds', async () => {
  const clock = fakeClock();
  const waitInfo: Array<{ attempt: number; delayMs: number; remainingMs: number }> = [];
  let checks = 0;

  await awaitDatabaseStartup(async () => {
    checks += 1;
    if (checks === 1) throw unavailable(transportError('ECONNREFUSED'));
  }, {
    timeoutMs: 20,
    delayMs: 5,
    now: clock.now,
    sleep: clock.sleep,
    onWait: info => waitInfo.push({ ...info }),
  });

  assert.equal(checks, 2);
  assert.deepEqual(clock.waits, [5]);
  assert.deepEqual(waitInfo, [{ attempt: 1, delayMs: 5, remainingMs: 20 }]);
});

test('auth, role, configuration, and unknown errors fail without retry', async () => {
  const failures = [
    unavailable(transportError('28P01')),
    unavailable(transportError('28000')),
    unavailable(transportError('42501')),
    new KernelError('DB_BOUNDARY_INVALID', 'runtime role mismatch', 503),
    new KernelError('CONFIG_INVALID', 'runtime binding mismatch', 503),
    new Error('unknown startup failure'),
  ];

  for (const failure of failures) {
    const clock = fakeClock();
    let checks = 0;
    await assert.rejects(awaitDatabaseStartup(async () => {
      checks += 1;
      throw failure;
    }, { now: clock.now, sleep: clock.sleep }), error => error === failure);
    assert.equal(checks, 1);
    assert.deepEqual(clock.waits, []);
  }
});

test('a denial after one transient failure fails immediately without another wait', async () => {
  const clock = fakeClock();
  const transientFailure = unavailable(transportError('ECONNREFUSED'));
  const denial = unavailable(transportError('28P01', 'timeout exceeded when trying to connect'));
  let checks = 0;

  await assert.rejects(awaitDatabaseStartup(async () => {
    checks += 1;
    throw checks === 1 ? transientFailure : denial;
  }, { now: clock.now, sleep: clock.sleep }), error => error === denial);

  assert.equal(checks, 2);
  assert.deepEqual(clock.waits, [5_000]);
});

test('deadline caps sleep and rejects with the first transient failure', async () => {
  const clock = fakeClock();
  const firstFailure = unavailable(transportError('ECONNREFUSED'));
  const laterFailure = unavailable(transportError('ETIMEDOUT'));
  let checks = 0;
  const waitInfo: Array<{ attempt: number; delayMs: number; remainingMs: number }> = [];

  await assert.rejects(awaitDatabaseStartup(async () => {
    checks += 1;
    throw checks === 1 ? firstFailure : laterFailure;
  }, {
    timeoutMs: 12,
    delayMs: 5,
    now: clock.now,
    sleep: clock.sleep,
    onWait: info => waitInfo.push({ ...info }),
  }), error => error === firstFailure);

  assert.equal(checks, 3);
  assert.deepEqual(clock.waits, [5, 5, 2]);
  assert.deepEqual(waitInfo, [
    { attempt: 1, delayMs: 5, remainingMs: 12 },
    { attempt: 2, delayMs: 5, remainingMs: 7 },
    { attempt: 3, delayMs: 2, remainingMs: 2 },
  ]);
});

test('startup retry timeout cannot exceed its fixed 150 second bound', async () => {
  await assert.rejects(awaitDatabaseStartup(async () => {}, { timeoutMs: 150_001 }), /timeoutMs/u);
  await assert.rejects(awaitDatabaseStartup(async () => {}, { timeoutMs: Number.POSITIVE_INFINITY }), /timeoutMs/u);
  await assert.rejects(awaitDatabaseStartup(async () => {}, { delayMs: 0 }), /delayMs/u);
});
