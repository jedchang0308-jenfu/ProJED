import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpRagAdapter } from '../../../src/services/httpApi/ragAdapter';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient';
import type { RagRetrievalRequest } from '../../../src/services/rag/ragContract';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const response = {
  data: {
    answer: '依看板資料，尚有兩項待處理。',
    chunks: [{
      chunkId: 'chunk-a',
      documentId: 'document-a',
      title: 'WBS 任務',
      content: '兩項任務仍在進行。',
      similarity: 0.82,
      citation: {
        documentId: 'document-a',
        chunkId: 'chunk-a',
        sourceTable: 'wbs_items',
        sourceId: 'task-a',
        sourceType: 'wbs_item',
        title: 'WBS 任務',
      },
    }],
  },
};

test('HTTP RAG adapter uses scoped same-origin route, actor binding and only retrieval fields', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    calls.push({ path: String(input), init });
    return json(response);
  });
  client.bindExpectedActor({ accountId: 'user-a', contextId: 'session-a' });
  const adapter = createHttpRagAdapter(client);
  const request = {
    tenantId: 'workspace legacy',
    projectId: 'board?#legacy',
    query: '目前有幾項待處理？',
    generationModel: 'gemini-3.1-flash-lite',
    matchThreshold: 0.35,
    matchCount: 10,
    actorId: 'forged-user',
    provider: 'https://attacker.invalid',
  } as RagRetrievalRequest & Record<string, unknown>;

  assert.deepEqual(await adapter.query(request), response.data);
  assert.equal(calls[0]?.path, '/api/v1/workspaces/workspace%20legacy/rag:query');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    projectId: 'board?#legacy',
    query: '目前有幾項待處理？',
    generationModel: 'gemini-3.1-flash-lite',
    matchThreshold: 0.35,
    matchCount: 10,
  });
  assert.equal(new Headers(calls[0]?.init?.headers).get('x-projed-expected-account-id'), 'user-a');
  assert.equal(new Headers(calls[0]?.init?.headers).get('x-projed-expected-context-id'), 'session-a');
  assert.equal(calls[0]?.init?.credentials, 'same-origin');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(calls[0]?.init?.redirect, 'error');
});

test('adapter accepts legacy workspace/project refs and forwards an abort signal', async () => {
  const controller = new AbortController();
  let path = '';
  let signal: AbortSignal | null | undefined;
  const adapter = createHttpRagAdapter(new HttpApiClient(async (input, init) => {
    path = String(input);
    signal = init?.signal;
    return json(response);
  }));

  await adapter.query({ tenantId: 'ws-legacy', projectId: 'board-legacy', query: 'query' }, controller.signal);
  assert.equal(path, '/api/v1/workspaces/ws-legacy/rag:query');
  assert.equal(signal, controller.signal);
});

test('adapter rejects malformed result shapes and identity/provider/vector fields', async () => {
  const badResponses: unknown[] = [
    { ...response, identity: { userId: 'user-a' } },
    { data: { ...response.data, actorId: 'user-a' } },
    { data: { ...response.data, chunks: [{ ...response.data.chunks[0], vector: [0.1] }] } },
    { data: { ...response.data, chunks: [{ ...response.data.chunks[0], providerUrl: 'https://evil.invalid' }] } },
    { data: { ...response.data, chunks: [{ ...response.data.chunks[0], citation: { ...response.data.chunks[0].citation, provider: 'google' } }] } },
    { data: { ...response.data, chunks: [{ ...response.data.chunks[0], similarity: Number.NaN }] } },
  ];

  for (const bad of badResponses) {
    const adapter = createHttpRagAdapter(new HttpApiClient(async () => json(bad)));
    await assert.rejects(adapter.query({ tenantId: 'ws-a', projectId: null, query: 'query' }), /HTTP_API_INVALID_RAG_/);
  }
});

test('invalid refs and query values are rejected before dispatch', async () => {
  let calls = 0;
  const adapter = createHttpRagAdapter(new HttpApiClient(async () => {
    calls += 1;
    return json(response);
  }));
  const invalid: RagRetrievalRequest[] = [
    { tenantId: '../session', projectId: null, query: 'query' },
    { tenantId: 'ws-a', projectId: 'board/a', query: 'query' },
    { tenantId: 'ws-a', projectId: null, query: ' '.repeat(2) },
    { tenantId: 'ws-a', projectId: null, query: 'query', matchThreshold: Number.NaN },
    { tenantId: 'ws-a', projectId: null, query: 'query', matchCount: 51 },
    { tenantId: 'ws-a', projectId: null, query: 'query', generationModel: 'unapproved' },
  ];
  for (const request of invalid) await assert.rejects(adapter.query(request), /HTTP_API_INVALID_RAG_/);
  assert.equal(calls, 0);
});

test('HTTP authorization failures preserve the stable API code and status', async () => {
  const adapter = createHttpRagAdapter(new HttpApiClient(async () => json({
    error: { code: 'ACCESS_DENIED', requestId: 'request-a', retryable: false },
  }, 403)));
  await assert.rejects(adapter.query({ tenantId: 'ws-a', projectId: 'board-a', query: 'query' }), (error: unknown) => {
    assert.ok(error instanceof HttpApiError);
    assert.equal(error.code, 'ACCESS_DENIED');
    assert.equal(error.status, 403);
    return true;
  });
});
