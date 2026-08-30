export type PwaUpdatePhase =
  | 'available'
  | 'applying'
  | 'awaiting-controller'
  | 'verifying'
  | 'recovering'
  | 'failed';

export interface PwaUpdateTransactionV1 {
  schemaVersion: 1;
  transactionId: string;
  sourceVersion: string;
  targetVersion: string;
  phase: PwaUpdatePhase;
  ownerTabId: string;
  ownerFence: number;
  normalReloadReserved: boolean;
  recoveryAttemptCount: 0 | 1;
  createdAt: number;
  updatedAt: number;
  leaseExpiresAt: number;
  errorCode?: string;
}

export const PWA_UPDATE_TRANSACTION_SCHEMA_VERSION = 1 as const;
export const PWA_UPDATE_LEASE_MS = 30_000;
export const PWA_UPDATE_LEASE_RENEW_MS = 10_000;
export const PWA_UPDATE_TRANSACTION_STALE_MS = 5 * 60_000;
export const PWA_UPDATE_CONTROLLER_TIMEOUT_MS = 15_000;
export const PWA_UPDATE_MAX_TARGET_ROUNDS = 2;

const phases = new Set<PwaUpdatePhase>([
  'available',
  'applying',
  'awaiting-controller',
  'verifying',
  'recovering',
  'failed',
]);

const transitions: Record<PwaUpdatePhase, readonly PwaUpdatePhase[]> = {
  available: ['applying', 'failed'],
  applying: ['applying', 'awaiting-controller', 'verifying', 'failed'],
  'awaiting-controller': ['verifying', 'recovering', 'failed'],
  verifying: ['recovering', 'failed'],
  recovering: ['verifying', 'failed'],
  failed: [],
};

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const isValidVersion = (value: unknown) => (
  typeof value === 'string' && value.length > 0 && value.length <= 256
  && !value.includes('\u0000') && !value.includes('\r') && !value.includes('\n')
);

const isValidOwnerForPhase = (phase: PwaUpdatePhase, ownerTabId: string, ownerFence: number) => {
  if (phase === 'available') return ownerTabId === '' && ownerFence === 0;
  return ownerTabId.length > 0 && Number.isInteger(ownerFence) && ownerFence > 0;
};

export const isPwaUpdatePhase = (value: unknown): value is PwaUpdatePhase => (
  typeof value === 'string' && phases.has(value as PwaUpdatePhase)
);

export const isPwaUpdateTransaction = (value: unknown): value is PwaUpdateTransactionV1 => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PwaUpdateTransactionV1>;
  return candidate.schemaVersion === PWA_UPDATE_TRANSACTION_SCHEMA_VERSION
    && typeof candidate.transactionId === 'string'
    && candidate.transactionId.length > 0
    && candidate.transactionId.length <= 128
    && isValidVersion(candidate.sourceVersion)
    && isValidVersion(candidate.targetVersion)
    && isPwaUpdatePhase(candidate.phase)
    && typeof candidate.ownerTabId === 'string'
    && isValidOwnerForPhase(candidate.phase, candidate.ownerTabId, candidate.ownerFence ?? Number.NaN)
    && typeof candidate.normalReloadReserved === 'boolean'
    && (candidate.recoveryAttemptCount === 0 || candidate.recoveryAttemptCount === 1)
    && isFiniteNumber(candidate.createdAt)
    && isFiniteNumber(candidate.updatedAt)
    && isFiniteNumber(candidate.leaseExpiresAt)
    && candidate.createdAt <= candidate.updatedAt
    && (candidate.phase !== 'awaiting-controller' || candidate.normalReloadReserved)
    && (candidate.phase !== 'recovering' || candidate.recoveryAttemptCount === 1)
    && (candidate.errorCode === undefined || (typeof candidate.errorCode === 'string' && candidate.errorCode.length <= 128));
};

export const parsePwaUpdateTransaction = (raw: string | null): PwaUpdateTransactionV1 | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPwaUpdateTransaction(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const serializePwaUpdateTransaction = (transaction: PwaUpdateTransactionV1): string => {
  if (!isPwaUpdateTransaction(transaction)) throw new Error('Invalid PWA update transaction.');
  return JSON.stringify(transaction);
};

export const createPwaUpdateTransaction = ({
  transactionId,
  sourceVersion,
  targetVersion,
  now,
}: {
  transactionId: string;
  sourceVersion: string;
  targetVersion: string;
  now: number;
}): PwaUpdateTransactionV1 => {
  const transaction: PwaUpdateTransactionV1 = {
    schemaVersion: PWA_UPDATE_TRANSACTION_SCHEMA_VERSION,
    transactionId,
    sourceVersion,
    targetVersion,
    phase: 'available',
    ownerTabId: '',
    ownerFence: 0,
    normalReloadReserved: false,
    recoveryAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
    leaseExpiresAt: 0,
  };
  if (!isPwaUpdateTransaction(transaction)) throw new Error('Cannot create PWA update transaction.');
  return transaction;
};

export const transitionPwaUpdateTransaction = (
  transaction: PwaUpdateTransactionV1,
  phase: PwaUpdatePhase,
  now: number,
  updates: Partial<Pick<PwaUpdateTransactionV1, 'normalReloadReserved' | 'recoveryAttemptCount' | 'errorCode'>> = {},
): PwaUpdateTransactionV1 => {
  if (!isPwaUpdateTransaction(transaction)) throw new Error('Invalid PWA update transaction.');
  if (phase !== transaction.phase && !transitions[transaction.phase].includes(phase)) {
    throw new Error(`Illegal PWA update transition: ${transaction.phase} -> ${phase}`);
  }
  const next: PwaUpdateTransactionV1 = {
    ...transaction,
    ...updates,
    phase,
    updatedAt: now,
  };
  if (!isPwaUpdateTransaction(next)) throw new Error('Invalid next PWA update transaction.');
  return next;
};

export const retargetPwaUpdateTransaction = (
  transaction: PwaUpdateTransactionV1,
  targetVersion: string,
  now: number,
): PwaUpdateTransactionV1 => {
  if (!isPwaUpdateTransaction(transaction) || !isValidVersion(targetVersion)) {
    throw new Error('Invalid PWA update retarget.');
  }
  if (transaction.phase !== 'applying' || transaction.normalReloadReserved) {
    throw new Error('PWA update target is immutable after apply preflight.');
  }
  const next = { ...transaction, targetVersion, updatedAt: now };
  if (!isPwaUpdateTransaction(next)) throw new Error('Invalid retargeted PWA update transaction.');
  return next;
};

export const claimPwaUpdateTransaction = (
  transaction: PwaUpdateTransactionV1,
  ownerTabId: string,
  ownerFence: number,
  now: number,
): PwaUpdateTransactionV1 => {
  if (!isPwaUpdateTransaction(transaction) || !ownerTabId || !Number.isInteger(ownerFence) || ownerFence <= 0) {
    throw new Error('Invalid PWA update owner claim.');
  }
  const next = {
    ...transaction,
    phase: 'applying' as const,
    ownerTabId,
    ownerFence,
    updatedAt: now,
    leaseExpiresAt: now + PWA_UPDATE_LEASE_MS,
    errorCode: undefined,
  };
  if (!isPwaUpdateTransaction(next)) throw new Error('Invalid claimed PWA update transaction.');
  return next;
};

export const renewPwaUpdateTransactionLease = (
  transaction: PwaUpdateTransactionV1,
  ownerTabId: string,
  ownerFence: number,
  now: number,
): PwaUpdateTransactionV1 => {
  if (!ownsPwaUpdateTransaction(transaction, ownerTabId, ownerFence, now)) {
    throw new Error('PWA update lease is not owned by this tab.');
  }
  return {
    ...transaction,
    updatedAt: now,
    leaseExpiresAt: now + PWA_UPDATE_LEASE_MS,
  };
};

export const ownsPwaUpdateTransaction = (
  transaction: PwaUpdateTransactionV1,
  ownerTabId: string,
  ownerFence: number,
  now: number,
) => (
  isPwaUpdateTransaction(transaction)
  && transaction.phase !== 'failed'
  && transaction.ownerTabId === ownerTabId
  && transaction.ownerFence === ownerFence
  && transaction.leaseExpiresAt > now
);

export const isPwaUpdateTransactionStale = (transaction: PwaUpdateTransactionV1, now: number) => (
  isPwaUpdateTransaction(transaction) && now - transaction.updatedAt > PWA_UPDATE_TRANSACTION_STALE_MS
);
