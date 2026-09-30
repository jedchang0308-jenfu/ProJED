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
  receipt?: QuickCaptureReceipt | null;
};

export type QuickCaptureReceipt = {
  status: 'committed';
  captureId: string;
  ownerId: string;
  titleHash: string;
  committedAt: number;
};

export type QuickAuthContext = {
  key: 'current';
  projectRef: string;
  accountId: string | null;
  displayLabel: string | null;
  verifiedAt: number | null;
  bindingAllowed: boolean;
  revision: number;
  barrierAt: number | null;
};

export const QUICK_CAPTURE_DB = 'projed-quick-task-v1';
export const QUICK_CAPTURE_STORE = 'captures';
export const QUICK_AUTH_CONTEXT_STORE = 'auth_context';
export const QUICK_CAPTURE_SCHEMA_VERSION = 2;
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
  let uuid: string;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, '$1-$2-$3-$4-$5');
  } else {
    const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
      .padEnd(32, '0').slice(0, 32).split('');
    seed[12] = '4';
    seed[16] = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
    uuid = seed.join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, '$1-$2-$3-$4-$5');
  }
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
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : NaN;
  const combined = `${code} ${message}`.toUpperCase();
  if (status === 401 || status === 403 || /QT_AUTH_REQUIRED|AUTH_REQUIRED|\b401\b|\b403\b|PGRST301/u.test(combined)) return 'failed_auth';
  if ((status >= 400 && status < 500) || /INVALID_TITLE|INVALID_CAPTURE|IDEMPOTENCY_CONFLICT|EXISTING_ROW_INVALID|ORDER_EXHAUSTED|NO_AVAILABLE_WORKSPACE|42501|23505|23514/u.test(combined)) {
    return 'failed_permanent';
  }
  return 'failed_retryable';
};

export const isQuickCaptureReceipt = (value: unknown, record?: Pick<QuickCaptureRecord, 'captureId' | 'accountId' | 'title'>): value is QuickCaptureReceipt => {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<QuickCaptureReceipt>;
  if (receipt.status !== 'committed' || typeof receipt.captureId !== 'string'
    || typeof receipt.ownerId !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.titleHash ?? '')
    || !Number.isFinite(receipt.committedAt) || (receipt.committedAt ?? 0) <= 0) return false;
  if (record && (receipt.captureId !== record.captureId || receipt.ownerId !== record.accountId)) return false;
  return true;
};
