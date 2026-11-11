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
