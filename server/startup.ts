import { setTimeout as timersPromiseSetTimeout } from 'node:timers/promises';

import { KernelError } from './errors.js';

const MAX_STARTUP_TIMEOUT_MS = 150_000;
const RETRYABLE_DATABASE_ERRNOS = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
]);
const RETRYABLE_NODE_PG_TRANSPORT_MESSAGES = new Set([
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Connection terminated due to connection timeout',
  'timeout exceeded when trying to connect',
]);

interface StartupWaitInfo {
  attempt: number;
  delayMs: number;
  remainingMs: number;
}

interface StartupOptions {
  timeoutMs?: number;
  delayMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<unknown>;
  onWait?: (info: Readonly<StartupWaitInfo>) => void;
}

function errnoCause(error: KernelError): NodeJS.ErrnoException | undefined {
  const cause: unknown = error.cause;
  if (!(cause instanceof Error)) return undefined;
  return cause as NodeJS.ErrnoException;
}

/** Only transport failures from the initial, read-only runtime boundary check can be retried. */
export function isRetryableDatabaseStartup(error: unknown): error is KernelError {
  if (!(error instanceof KernelError) || error.code !== 'DB_UNAVAILABLE') return false;
  const cause = errnoCause(error);
  if (!cause) return false;

  if (typeof cause.code === 'string') return RETRYABLE_DATABASE_ERRNOS.has(cause.code);
  if (cause.code !== undefined) return false;
  return RETRYABLE_NODE_PG_TRANSPORT_MESSAGES.has(cause.message ?? '');
}

/** Wait for the read-only startup boundary check within one finite retry window. */
export async function awaitDatabaseStartup(
  check: () => Promise<void>,
  {
    timeoutMs = MAX_STARTUP_TIMEOUT_MS,
    delayMs = 5_000,
    now = Date.now,
    sleep = timersPromiseSetTimeout,
    onWait,
  }: StartupOptions = {},
): Promise<void> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_STARTUP_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be an integer from 1 to ${MAX_STARTUP_TIMEOUT_MS}`);
  }
  if (!Number.isSafeInteger(delayMs) || delayMs <= 0) {
    throw new RangeError('delayMs must be a positive integer');
  }

  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new TypeError('now must return a finite timestamp');
  const deadline = startedAt + timeoutMs;
  let attempt = 0;
  let firstRetryableError: KernelError | undefined;

  while (true) {
    if (attempt > 0 && now() >= deadline) throw firstRetryableError;
    attempt += 1;

    try {
      await check();
      return;
    } catch (error) {
      if (!isRetryableDatabaseStartup(error)) throw error;
      if (firstRetryableError === undefined) firstRetryableError = error;

      const currentTime = now();
      if (!Number.isFinite(currentTime)) throw new TypeError('now must return a finite timestamp');
      const remainingMs = deadline - currentTime;
      if (remainingMs <= 0) throw firstRetryableError;

      const waitMs = Math.min(delayMs, remainingMs);
      onWait?.({ attempt, delayMs: waitMs, remainingMs });
      await sleep(waitMs);
    }
  }
}
