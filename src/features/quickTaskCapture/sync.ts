import {
  acquireQuickCaptureLease,
  finishQuickCaptureLease,
  listQuickCaptures,
  getQuickAuthContext,
  prepareQuickCapturesForSync,
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
  const authApi = await import('./auth');
  const allowed = async () => {
    const context = await getQuickAuthContext();
    const latest = authApi.getQuickAuthSnapshot();
    return latest?.accountId === auth.accountId && latest.authEpoch === auth.authEpoch
      && context?.bindingAllowed && context.accountId === auth.accountId
      && context.revision === auth.contextRevision && context.projectRef === auth.contextProjectRef;
  };
  if (!await allowed()) return false;
  await prepareQuickCapturesForSync(auth.accountId);
  const records = await listQuickCaptures(auth.accountId);
  for (const record of records) {
    if (record.state === 'synced' || record.state === 'failed_permanent') continue;
    if (!await allowed()) return false;
    const leased = await acquireQuickCaptureLease(record.captureId, auth.accountId,
      { revision: auth.contextRevision!, projectRef: auth.contextProjectRef! });
    if (!leased || leased.accountId !== auth.accountId) continue;
    if (!await allowed()) {
      await finishQuickCaptureLease(leased.captureId, leased.leaseId!, 'failed_auth', 'ACCOUNT_SWITCHED');
      return false;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await createQuickUnplacedTask({ capture: leased, auth, signal: controller.signal });
      const finished = await finishQuickCaptureLease(leased.captureId, leased.leaseId!, 'synced', null, 0, result);
      if (finished?.state === 'synced' && await allowed()) onProgress?.(leased.captureId, 'synced');
    } catch (error) {
      const state = classifyQuickSyncError(error);
      const retryAfter = parseRetryAfter(error && typeof error === 'object' && 'retryAfter' in error ? (error as { retryAfter?: unknown }).retryAfter : null);
      await finishQuickCaptureLease(
        leased.captureId,
        leased.leaseId!,
        state,
        error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'SYNC_FAILED',
        retryAfter,
      );
      if (await allowed()) onProgress?.(leased.captureId, state);
      if (state === 'failed_auth') return true;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return false;
};
