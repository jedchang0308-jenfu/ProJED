import type { QuickCaptureRecord } from '../../features/quickTaskCapture/model';

export type QuickAuthSnapshot = Readonly<{
  accountId: string;
  accessToken: string;
  authEpoch: number;
}>;

export type QuickTaskCreateResult = {
  status: 'committed';
  captureId: string;
  ownerId: string;
  titleHash: string;
  created: boolean;
  committedAt: number;
};

const parseResult = (value: unknown): QuickTaskCreateResult => {
  if (!value || typeof value !== 'object') throw Object.assign(new Error('INVALID_RECEIPT'), { code: 'INVALID_RECEIPT' });
  const candidate = value as Record<string, unknown>;
  if (candidate.status !== 'committed' || typeof candidate.captureId !== 'string' || typeof candidate.ownerId !== 'string'
    || typeof candidate.titleHash !== 'string' || typeof candidate.created !== 'boolean' || typeof candidate.committedAt !== 'number') {
    throw Object.assign(new Error('INVALID_RECEIPT'), { code: 'INVALID_RECEIPT' });
  }
  return candidate as unknown as QuickTaskCreateResult;
};

export const createQuickUnplacedTask = async (input: {
  capture: QuickCaptureRecord;
  auth: QuickAuthSnapshot;
  signal: AbortSignal;
}) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error('BACKEND_UNSUPPORTED'), { code: 'BACKEND_UNSUPPORTED' });
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_quick_unplaced_task_v1`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${input.auth.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      p_capture_id: input.capture.captureId,
      p_title: input.capture.title,
      p_workspace_hint: input.capture.workspaceHint,
    }),
    signal: input.signal,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw Object.assign(new Error(typeof error.message === 'string' ? error.message : `RPC_${response.status}`), {
      code: typeof error.code === 'string' ? error.code : String(response.status),
      status: response.status,
      retryAfter: response.headers.get('Retry-After'),
    });
  }
  return parseResult(payload);
};
