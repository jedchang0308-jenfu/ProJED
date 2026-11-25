import type { QuickCaptureRecord } from '../../features/quickTaskCapture/model';
import type { QuickTaskCreateResult } from '../../features/quickTaskCapture/contract';
import { HttpApiClient } from './httpApiClient';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function parseReceipt(value: unknown): QuickTaskCreateResult {
  const envelope = record(value, 'QUICK_TASK_ENVELOPE');
  const data = record(envelope.data, 'QUICK_TASK_RECEIPT');
  if (data.status !== 'committed'
      || typeof data.captureId !== 'string'
      || typeof data.ownerId !== 'string'
      || typeof data.titleHash !== 'string'
      || !/^[a-f0-9]{64}$/u.test(data.titleHash)
      || typeof data.created !== 'boolean'
      || !Number.isSafeInteger(data.committedAt)
      || Number(data.committedAt) <= 0) {
    throw Object.assign(new Error('INVALID_RECEIPT'), { code: 'INVALID_RECEIPT' });
  }
  return data as unknown as QuickTaskCreateResult;
}

export function createHttpQuickTaskAdapter(client: HttpApiClient) {
  return {
    /** A miss remains unresolved; this method never falls back to POST. */
    async readReceipt(captureId: string, signal: AbortSignal): Promise<QuickTaskCreateResult | null> {
      if (!/^task_workbench_unplaced_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(captureId)) {
        throw Object.assign(new Error('INVALID_CAPTURE'), { code: 'INVALID_CAPTURE' });
      }
      const value = await client.request<unknown>(`/api/v1/quick-tasks/${captureId}/receipt`, { signal });
      const envelope = record(value, 'QUICK_TASK_ENVELOPE');
      if (envelope.data === null) return null;
      const result = parseReceipt(value);
      if (result.captureId !== captureId || result.created !== false) {
        throw Object.assign(new Error('INVALID_RECEIPT'), { code: 'INVALID_RECEIPT' });
      }
      return result;
    },
    async create(capture: QuickCaptureRecord, signal: AbortSignal): Promise<QuickTaskCreateResult> {
      return parseReceipt(await client.request<unknown>('/api/v1/quick-tasks', {
        method: 'POST',
        body: {
          captureId: capture.captureId,
          title: capture.title,
          workspaceHint: capture.workspaceHint,
        },
        signal,
      }));
    },
  };
}
