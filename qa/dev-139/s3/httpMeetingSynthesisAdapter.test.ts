import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeterministicMeetingSynthesis,
  type MeetingSynthesisInput,
} from '../../../src/utils/meetingRecordSynthesis';
import { createHttpMeetingSynthesisAdapter } from '../../../src/services/httpApi/meetingSynthesisAdapter';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const input: MeetingSynthesisInput = {
  title: '例行會議',
  participantsText: '甲、乙',
  rawContent: '確認本週交付進度。',
  taskLinks: [],
  tasks: [],
  activities: [],
  occurredAt: 1_798_000_000_000,
};

const responseData = buildDeterministicMeetingSynthesis(input);

test('HTTP meeting synthesis uses scoped same-origin route, actor binding, and v2 contract', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (request, init) => {
    calls.push({ path: String(request), init });
    return json({ data: responseData });
  });
  client.bindExpectedActor({ accountId: 'user-a', contextId: 'session-a' });

  const result = await createHttpMeetingSynthesisAdapter(client).synthesize(input, {
    workspaceId: 'workspace A',
    boardId: 'board?#legacy',
  });

  assert.deepEqual(result, responseData);
  assert.equal(calls[0]?.path, '/api/v1/workspaces/workspace%20A/boards/board%3F%23legacy/meeting:synthesize');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    ...input,
    requiredContractVersion: 'meeting-synthesis-v2',
  });
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('x-projed-expected-account-id'), 'user-a');
  assert.equal(headers.get('x-projed-expected-context-id'), 'session-a');
  assert.equal(calls[0]?.init?.credentials, 'same-origin');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(calls[0]?.init?.redirect, 'error');
});

test('adapter forwards the caller abort signal and rejects missing or unsafe scope before fetch', async () => {
  const controller = new AbortController();
  let calls = 0;
  let observedSignal: AbortSignal | null | undefined;
  const adapter = createHttpMeetingSynthesisAdapter(new HttpApiClient(async (_request, init) => {
    calls += 1;
    observedSignal = init?.signal;
    return json({ data: responseData });
  }));

  await adapter.synthesize(input, { workspaceId: 'ws-a', boardId: 'board-a', signal: controller.signal });
  assert.equal(observedSignal, controller.signal);
  await assert.rejects(adapter.synthesize(input, { workspaceId: '', boardId: 'board-a' }), /INVALID_WORKSPACE_REF/u);
  await assert.rejects(adapter.synthesize(input, { workspaceId: 'ws-a', boardId: 'board/a' }), /INVALID_BOARD_REF/u);
  assert.equal(calls, 1);
});

test('adapter rejects malformed envelope, trace, contract, and quality responses', async () => {
  const invalidResponses: unknown[] = [
    {},
    { data: responseData, extra: true },
    { data: { ...responseData, contractVersion: 'meeting-synthesis-v1' } },
    { data: { ...responseData, runId: '' } },
    { data: { ...responseData, normalization: { receivedActivityCount: 1, acceptedActivityCount: 1, droppedActivityCount: 1 } } },
    { data: { ...responseData, quality: { ...responseData.quality, passed: false, violations: ['INCOMPLETE_TASK_PATH'] } } },
    { data: { ...responseData, content: '' } },
  ];

  for (const invalid of invalidResponses) {
    const adapter = createHttpMeetingSynthesisAdapter(new HttpApiClient(async () => json(invalid)));
    await assert.rejects(adapter.synthesize(input, { workspaceId: 'ws-a', boardId: 'board-a' }), error => {
      assert.ok(error instanceof HttpApiError);
      return true;
    });
  }
});

test('HTTP failures preserve stable code, status, and quality-safe details', async () => {
  const adapter = createHttpMeetingSynthesisAdapter(new HttpApiClient(async () => json({
    error: {
      code: 'QUALITY_GATE_FAILED',
      requestId: 'request-a',
      retryable: false,
      details: {
        runId: 'run-a',
        functionVersion: 'meeting-v2',
        violations: ['INCOMPLETE_TASK_PATH'],
        affectedTaskIds: ['task-a'],
        unexpected: 'ignored by the service parser',
      },
    },
  }, 422)));

  await assert.rejects(adapter.synthesize(input, { workspaceId: 'ws-a', boardId: 'board-a' }), (error: unknown) => {
    assert.ok(error instanceof HttpApiError);
    assert.equal(error.code, 'QUALITY_GATE_FAILED');
    assert.equal(error.status, 422);
    assert.equal(error.requestId, 'request-a');
    assert.deepEqual(error.details, {
      runId: 'run-a',
      functionVersion: 'meeting-v2',
      violations: ['INCOMPLETE_TASK_PATH'],
      affectedTaskIds: ['task-a'],
      unexpected: 'ignored by the service parser',
    });
    return true;
  });
});
