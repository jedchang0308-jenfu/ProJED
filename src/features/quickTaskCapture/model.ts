export type QuickCaptureState =
  | 'awaiting_auth'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed_auth'
  | 'failed_retryable'
  | 'failed_permanent';

export type QuickCaptureRecord = {
  schemaVersion: 1;
  captureId: string;
  accountId: string | null;
  title: string;
  workspaceHint: string | null;
  clientCreatedAt: number;
  updatedAt: number;
  state: QuickCaptureState;
  attemptCount: number;
  nextAttemptAt: number | null;
  lastErrorCode: string | null;
  leaseId: string | null;
  leaseExpiresAt: number | null;
  claimIntent: {
    nonceHash: string;
    captureId: string;
    expiresAt: number;
  } | null;
};

export const QUICK_CAPTURE_DB = 'projed-quick-task-v1';
export const QUICK_CAPTURE_STORE = 'captures';
export const QUICK_CAPTURE_SCHEMA_VERSION = 1;
export const QUICK_CAPTURE_LEASE_MS = 30_000;
export const QUICK_CAPTURE_MAX_AUTOMATIC_ATTEMPTS = 8;
export const QUICK_CAPTURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const OUTER_TRIM_START = /^\s+/u;
const OUTER_TRIM_END = /\s+$/u;

export const normalizeQuickTitle = (value: string) => value
  .replace(OUTER_TRIM_START, '')
  .replace(OUTER_TRIM_END, '');

export const quickTitleCodePointLength = (value: string) => Array.from(value).length;

export const isQuickTitleValid = (value: string) => {
  const normalized = normalizeQuickTitle(value);
  return normalized.length > 0 && quickTitleCodePointLength(normalized) <= 500;
};

export const createQuickCaptureId = () => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `task_workbench_unplaced_${uuid}`;
};

export const insertFinalTranscript = (input: {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  transcript: string;
}) => {
  const value = input.value;
  const transcript = input.transcript;
  const start = Number.isInteger(input.selectionStart) ? Math.max(0, Math.min(value.length, input.selectionStart!)) : value.length;
  const end = Number.isInteger(input.selectionEnd) ? Math.max(start, Math.min(value.length, input.selectionEnd!)) : start;
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  const needsSpace = Boolean(prefix && suffix && /[A-Za-z0-9]$/u.test(prefix) && /^[A-Za-z0-9]/u.test(suffix));
  const inserted = `${needsSpace ? ' ' : ''}${transcript}`;
  return { value: `${prefix}${inserted}${suffix}`, caret: start + inserted.length };
};

export const classifyQuickSyncError = (error: unknown): QuickCaptureState => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const combined = `${code} ${message}`;
  if (/QT_AUTH_REQUIRED|AUTH_REQUIRED|(?:^|\s)401(?:\s|$)/u.test(combined)) return 'failed_auth';
  if (/INVALID_TITLE|INVALID_CAPTURE|IDEMPOTENCY_CONFLICT|EXISTING_ROW_INVALID|ORDER_EXHAUSTED|NO_AVAILABLE_WORKSPACE|42501/u.test(combined)) {
    return 'failed_permanent';
  }
  return 'failed_retryable';
};
