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
  const client = new HttpApiClient(async (input, init) => {
    requests.push({ path: String(input), init });
    return new Response(JSON.stringify({ data: {
      status: 'committed',
      captureId: capture.captureId,
      ownerId: capture.accountId,
      titleHash: 'a'.repeat(64),
      created: true,
      committedAt: 1,
    } }), { status: 201, headers: { 'content-type': 'application/json' } });
  });
  client.bindExpectedActor({ accountId: capture.accountId!, contextId: 'quick-context-1' });
  const adapter = createHttpQuickTaskAdapter(client);
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
  assert.equal(headers.get('x-projed-expected-account-id'), capture.accountId);
  assert.equal(headers.get('x-projed-expected-context-id'), 'quick-context-1');
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

test('receipt read uses only GET with the original id and a fresh Session binding', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    requests.push({ path: String(input), init });
    return new Response(JSON.stringify({ data: { status: 'committed', captureId: capture.captureId,
      ownerId: capture.accountId, titleHash: 'a'.repeat(64), created: false, committedAt: 1 } }),
    { headers: { 'content-type': 'application/json' } });
  });
  client.bindExpectedActor({ accountId: capture.accountId!, contextId: 'quick-receipt-context' });
  assert.equal((await createHttpQuickTaskAdapter(client).readReceipt(capture.captureId, new AbortController().signal))?.created, false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, `/api/v1/quick-tasks/${capture.captureId}/receipt`);
  assert.equal(requests[0].init?.method, 'GET');
  assert.equal(requests[0].init?.body, undefined);
  assert.equal(requests[0].init?.cache, 'no-store');
  assert.equal(new Headers(requests[0].init?.headers).get('x-projed-expected-account-id'), capture.accountId);
});

test('missing receipt and failed read never fall back to POST', async () => {
  for (const status of [200, 401, 503]) {
    let calls = 0;
    const client = new HttpApiClient(async (_input, init) => {
      calls++; assert.equal(init?.method, 'GET');
      return new Response(JSON.stringify(status === 200 ? { data: null } : { error: { code: 'READ_UNAVAILABLE' } }),
        { status, headers: { 'content-type': 'application/json' } });
    });
    const read = createHttpQuickTaskAdapter(client).readReceipt(capture.captureId, new AbortController().signal);
    if (status === 200) assert.equal(await read, null); else await assert.rejects(read);
    assert.equal(calls, 1);
  }
});

test('receipt read rejects invalid paths, wrong capture and creation responses', async () => {
  let calls = 0;
  const client = new HttpApiClient(async () => {
    calls++;
    return new Response(JSON.stringify({ data: { status: 'committed', captureId: capture.captureId,
      ownerId: capture.accountId, titleHash: 'a'.repeat(64), created: true, committedAt: 1 } }),
    { headers: { 'content-type': 'application/json' } });
  });
  const adapter = createHttpQuickTaskAdapter(client);
  await assert.rejects(adapter.readReceipt('../foreign?token=secret', new AbortController().signal), /INVALID_CAPTURE/u);
  assert.equal(calls, 0);
  await assert.rejects(adapter.readReceipt(capture.captureId, new AbortController().signal), /INVALID_RECEIPT/u);
  await assert.rejects(adapter.readReceipt('task_workbench_unplaced_22222222-2222-4222-8222-222222222222', new AbortController().signal), /INVALID_RECEIPT/u);
});
