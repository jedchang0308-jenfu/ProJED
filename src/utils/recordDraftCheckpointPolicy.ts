export const CHECKPOINT_IDLE_MS = 20_000;
export const CHECKPOINT_MIN_INTERVAL_MS = 180_000;
export const CHECKPOINT_MAX_STALENESS_MS = 300_000;
export const CHECKPOINT_MAX_ATTEMPTS_PER_HOUR = 20;
export const CHECKPOINT_PAYLOAD_MAX_BYTES = 512 * 1024;
export const CHECKPOINT_BACKOFF_MS = [180_000, 300_000, 900_000, 1_800_000] as const;

export type CheckpointPolicyInput = {
  now: number;
  changedAt: number;
  lastAttemptAt: number | null;
  lastConfirmedAt: number | null;
  retryCount: number;
  attemptTimestamps: number[];
  payloadBytes: number;
  online: boolean;
};

export type CheckpointPolicyDecision = {
  allowed: boolean;
  reason: 'idle' | 'interval' | 'stale' | 'budget' | 'offline' | 'oversize' | 'up_to_date';
  nextAt: number | null;
};

export const getUtf8ByteLength = (value: string): number => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
};

export const getCheckpointBackoffMs = (retryCount: number): number =>
  CHECKPOINT_BACKOFF_MS[Math.min(Math.max(retryCount, 0), CHECKPOINT_BACKOFF_MS.length - 1)];

export const getCheckpointDecision = (input: CheckpointPolicyInput): CheckpointPolicyDecision => {
  if (input.payloadBytes > CHECKPOINT_PAYLOAD_MAX_BYTES) {
    return { allowed: false, reason: 'oversize', nextAt: null };
  }
  if (!input.online) return { allowed: false, reason: 'offline', nextAt: null };
  const attemptTimestamps = input.attemptTimestamps.filter(timestamp => timestamp > input.now - 60 * 60 * 1000);
  if (attemptTimestamps.length >= CHECKPOINT_MAX_ATTEMPTS_PER_HOUR) {
    return { allowed: false, reason: 'budget', nextAt: Math.min(...attemptTimestamps) + 60 * 60 * 1000 };
  }
  if (input.lastConfirmedAt !== null && input.lastConfirmedAt >= input.changedAt) {
    return { allowed: false, reason: 'up_to_date', nextAt: null };
  }
  const idleAt = input.changedAt + CHECKPOINT_IDLE_MS;
  const staleAt = input.changedAt + CHECKPOINT_MAX_STALENESS_MS;
  const intervalAt = input.lastAttemptAt === null
    ? input.now
    : input.lastAttemptAt + CHECKPOINT_MIN_INTERVAL_MS;
  const retryAt = input.lastAttemptAt === null
    ? input.now
    : input.lastAttemptAt + getCheckpointBackoffMs(input.retryCount);
  const nextAt = Math.max(input.now, idleAt, intervalAt, retryAt);
  if (input.now < nextAt) {
    return {
      allowed: false,
      reason: input.now < idleAt ? 'idle' : input.now < intervalAt ? 'interval' : 'stale',
      nextAt,
    };
  }
  return { allowed: true, reason: input.now >= staleAt ? 'stale' : 'idle', nextAt: input.now };
};

export const readCheckpointAttemptLedger = (key: string, now: number): number[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === 'number' && value > now - 60 * 60 * 1000)
      : [];
  } catch {
    return [];
  }
};

export const reserveCheckpointAttempt = (key: string, now: number): number[] | null => {
  const existing = readCheckpointAttemptLedger(key, now);
  if (existing.length >= CHECKPOINT_MAX_ATTEMPTS_PER_HOUR) return null;
  const next = [...existing, now];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // A blocked localStorage should not prevent the checkpoint request itself.
    }
  }
  return next;
};

export const acquireCheckpointLease = (key: string, owner: string, now: number, ttlMs = 30_000): (() => void) | null => {
  if (typeof localStorage === 'undefined') return () => undefined;
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? 'null') as { owner?: string; expiresAt?: number } | null;
    if (current?.owner && current.owner !== owner && (current.expiresAt ?? 0) > now) return null;
    localStorage.setItem(key, JSON.stringify({ owner, expiresAt: now + ttlMs }));
    const confirmed = JSON.parse(localStorage.getItem(key) ?? 'null') as { owner?: string } | null;
    if (confirmed?.owner !== owner) return null;
    return () => {
      try {
        const latest = JSON.parse(localStorage.getItem(key) ?? 'null') as { owner?: string } | null;
        if (latest?.owner === owner) localStorage.removeItem(key);
      } catch {
        // Ignore cleanup failure.
      }
    };
  } catch {
    return () => undefined;
  }
};
