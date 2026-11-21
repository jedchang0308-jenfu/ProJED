import assert from 'node:assert/strict';
import test from 'node:test';
import { createRagConversationStore, type RagConversationScope } from '../../../src/store/ragConversationStore';
import { createHttpRagAdapter } from '../../../src/services/httpApi/ragAdapter';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import type { RagRetrievalResponse } from '../../../src/services/rag/ragContract';

const original: RagConversationScope = { accountId: 'a', contextId: 'a-session', workspaceId: 'ws', boardId: 'board' };
const answer: RagRetrievalResponse = { answer: 'Synthetic scoped answer', chunks: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('opening HTTP assistant does not query; one explicit submit uses scoped HTTP and retains unqualified question', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (path, init) => {
    calls.push({ path: String(path), init });
    return new Response(JSON.stringify({ error: { code: 'RAG_PROVIDER_UNAVAILABLE', retryable: true } }),
      { status: 503, headers: { 'content-type': 'application/json' } });
  });
  client.bindExpectedActor({ accountId: original.accountId, contextId: original.contextId! });
  const store = createRagConversationStore({ readScope: () => original, query: createHttpRagAdapter(client).query });
  store.getState().togglePanel();
  store.getState().setGenerationModel('gemini-3.5-flash');
  assert.equal(calls.length, 0);
  store.getState().setQueryDraft('保留問題');
  await store.getState().submitQuery('保留問題', 'ws', 'board');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.path, '/api/v1/workspaces/ws/rag:query');
  const headers = new Headers(calls[0]!.init?.headers);
  assert.equal(headers.get('x-projed-expected-context-id'), 'a-session');
  assert.equal(JSON.parse(String(calls[0]!.init?.body)).generationModel, 'gemini-3.5-flash');
  assert.equal(store.getState().queryDraft, '保留問題');
  assert.match(store.getState().error!, /尚未開放/);
  assert.deepEqual(store.getState().chatHistory.map(message => message.role), ['user']);
  assert.equal(store.getState().isLoading, false);
});

for (const change of ['account', 'session', 'workspace', 'board'] as const) {
  test(`a ${change} switch aborts old query and isolates its draft/history even after returning to A`, async () => {
    let scope = { ...original };
    const pending = deferred<RagRetrievalResponse>();
    let signal: AbortSignal | undefined;
    const store = createRagConversationStore({ readScope: () => scope,
      query: (_request, requestSignal) => { signal = requestSignal; return pending.promise; } });
    store.getState().setIsOpen(true);
    const request = store.getState().submitQuery('A private question', 'ws', 'board');
    const field = { account: 'accountId', session: 'contextId', workspace: 'workspaceId', board: 'boardId' }[change];
    scope = { ...scope, [field]: 'different' };
    store.getState().syncScope();
    assert.equal(signal?.aborted, true);
    assert.equal(store.getState().chatHistory.length, 0);
    assert.equal(store.getState().isLoading, false);
    store.getState().setQueryDraft('B draft');
    scope = { ...original };
    store.getState().syncScope();
    assert.equal(store.getState().queryDraft, '');
    assert.equal(store.getState().chatHistory[0]?.content, 'A private question');
    pending.resolve(answer);
    await request;
    assert.equal(store.getState().chatHistory.length, 1, 'late A answer was published after A-B-A');
    assert.equal(store.getState().error, null);
  });
}

test('double submit shares one request; clear history aborts it and rejects its late answer', async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const pending = deferred<RagRetrievalResponse>();
  const store = createRagConversationStore({ readScope: () => original,
    query: (_request, requestSignal) => { calls++; signal = requestSignal; return pending.promise; } });
  const first = store.getState().submitQuery('one', 'ws', 'board');
  await store.getState().submitQuery('two', 'ws', 'board');
  assert.equal(calls, 1);
  store.getState().setQueryDraft('keep draft');
  store.getState().clearHistory();
  pending.resolve(answer);
  await first;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(store.getState().chatHistory, []);
  assert.equal(store.getState().queryDraft, 'keep draft');
});

test('no account or mismatched resource cannot dispatch; successful exact scope displays the actual response', async () => {
  let scope: RagConversationScope | null = null;
  let calls = 0;
  const store = createRagConversationStore({ readScope: () => scope, query: async () => { calls++; return answer; } });
  await store.getState().submitQuery('question', 'ws', 'board');
  scope = original;
  await store.getState().submitQuery('question', 'ws', 'different');
  assert.equal(calls, 0);
  await store.getState().submitQuery('question', 'ws', 'board');
  assert.equal(calls, 1);
  assert.equal(store.getState().chatHistory[1]?.content, answer.answer);
});

test('board changes retain each exact scope draft without dispatch or exposing another scope', () => {
  let scope = { ...original };
  const store = createRagConversationStore({ readScope: () => scope,
    query: async () => { throw new Error('No query may be sent'); } });
  store.getState().setQueryDraft('Board A draft');
  scope = { ...original, boardId: 'second-board' };
  store.getState().syncScope();
  assert.equal(store.getState().queryDraft, '');
  store.getState().setQueryDraft('Board B draft');
  scope = { ...original };
  store.getState().syncScope();
  assert.equal(store.getState().queryDraft, 'Board A draft');
  assert.deepEqual(store.getState().chatHistory, []);
});
