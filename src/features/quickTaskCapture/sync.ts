import {
  acquireQuickCaptureLease,
  finishQuickCaptureLease,
  listQuickCaptures,
  updateQuickCapture,
} from './outbox';
import { classifyQuickSyncError } from './model';
import { createQuickUnplacedTask, type QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';

const parseRetryAfter = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(15 * 60_000, seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(15 * 60_000, date - Date.now())) : 0;
};

export const flushQuickTaskOutbox = async (auth: QuickAuthSnapshot, onProgress?: (captureId: string, state: string) => void) => {
  const records = await listQuickCaptures(auth.accountId);
  for (const record of records) {
    if (record.state === 'synced' || record.state === 'failed_auth' || record.state === 'failed_permanent') continue;
    const leased = await acquireQuickCaptureLease(record.captureId, auth.accountId);
    if (!leased || leased.accountId !== auth.accountId) continue;
    if (auth.authEpoch !== (await import('./auth')).getQuickAuthSnapshot()?.authEpoch) {
      await finishQuickCaptureLease(leased.captureId, leased.leaseId!, 'failed_auth', 'ACCOUNT_SWITCHED');
      continue;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await createQuickUnplacedTask({ capture: leased, auth, signal: controller.signal });
      if (result.captureId !== leased.captureId || result.ownerId !== auth.accountId) throw Object.assign(new Error('INVALID_RECEIPT'), { code: 'INVALID_RECEIPT' });
      await finishQuickCaptureLease(leased.captureId, leased.leaseId!, 'synced');
      onProgress?.(leased.captureId, 'synced');
    } catch (error) {
      const state = classifyQuickSyncError(error);
      const retryAfter = parseRetryAfter(error && typeof error === 'object' && 'retryAfter' in error ? (error as { retryAfter?: unknown }).retryAfter : null);
      await finishQuickCaptureLease(leased.captureId, leased.leaseId!, state, error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'SYNC_FAILED');
      if (retryAfter > 0 && state === 'failed_retryable') {
        await updateQuickCapture(leased.captureId, { nextAttemptAt: Date.now() + retryAfter });
      }
      onProgress?.(leased.captureId, state);
    } finally {
      window.clearTimeout(timeout);
    }
  }
};
