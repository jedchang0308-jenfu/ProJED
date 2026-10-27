import assert from 'node:assert/strict';
import test from 'node:test';

import type { QuickCaptureRecord } from '../../../src/features/quickTaskCapture/model';
import { createHttpQuickTaskAdapter } from '../../../src/services/httpApi/quickTaskAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';

const capture: QuickCaptureRecord = {
  schemaVersion: 1,
  captureId: 'task_workbench_unplaced_11111111-1111-4111-8111-111111111111',
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Quick task',
  workspaceHint: null,
  clientCreatedAt: 1,
  updatedAt: 1,
  state: 'pending',
  attemptCount: 0,
  nextAttemptAt: null,
  lastErrorCode: null,
  leaseId: null,
  leaseExpiresAt: null,
  claimIntent: null,
};

test('quick task HTTP adapter uses same-origin Session and preserves the compact receipt', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const adapter = createHttpQuickTaskAdapter(new HttpApiClient(async (input, init) => {
    requests.push({ path: String(input), init });
    return new Response(JSON.stringify({ data: {
      status: 'committed',
      captureId: capture.captureId,
      ownerId: capture.accountId,
      titleHash: 'a'.repeat(64),
      created: true,
      committedAt: 1,
    } }), { status: 201, headers: { 'content-type': 'application/json' } });
  }));
  const result = await adapter.create(capture, new AbortController().signal);
  assert.equal(result.created, true);
  assert.deepEqual(requests.map(request => [request.init?.method, request.path]), [
    ['POST', '/api/v1/quick-tasks'],
  ]);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    captureId: capture.captureId,
    title: capture.title,
    workspaceHint: null,
  });
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get('authorization'), null);
  assert.equal(requests[0]?.init?.credentials, 'same-origin');
  assert.equal(requests[0]?.init?.cache, 'no-store');
});

test('quick task HTTP adapter rejects a malformed receipt', async () => {
  const adapter = createHttpQuickTaskAdapter(new HttpApiClient(async () => new Response(
    JSON.stringify({ data: { status: 'committed' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )));
  await assert.rejects(
    adapter.create(capture, new AbortController().signal),
    (error: unknown) => error instanceof Error && error.message === 'INVALID_RECEIPT',
  );
});
