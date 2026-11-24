import assert from 'node:assert/strict';
import test from 'node:test';
import { KernelError } from '../../../server/errors.js';
import { createQualifiedCloudRagProvider, type CloudRagProviderOptions } from '../../../server/geminiRagProvider.js';
import { CURRENT_RAG_BINDING, type RagRuntimeBinding } from '../../../server/ragRuntimeBinding.js';

const TOKEN = 'unit-test-rag-token-do-not-log';
const VECTOR = Array.from({ length: 3072 }, (_, index) => index / 3072);
const BINDING: RagRuntimeBinding = {
  projectId: 'jenfu-platform-prod', provider: 'google-cloud-rag', embeddingModel: 'gemini-embedding-001',
  generationModels: ['gemini-3.1-flash-lite', 'gemini-3.5-flash'], abuseMonitoring: 'exempt',
  cache: 'disabled', requestResponseLogging: 'disabled', qualificationEvidenceRef: 'unit-fixture-only',
};
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  status: init.status ?? 200, headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
});
const embedding = (values: unknown = VECTOR, statistics: unknown = { truncated: false, token_count: 4 }) =>
  ({ predictions: [{ embeddings: { values, statistics } }] });
const generation = (modelVersion: string, text = 'answer', overrides = {}) => ({
  modelVersion, usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], ...overrides,
});
function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}
function provider(options: Partial<CloudRagProviderOptions> = {}) {
  const result = createQualifiedCloudRagProvider({ binding: BINDING, getAccessToken: async () => TOKEN, ...options });
  assert.ok(result); return result;
}

test('unpublished RAG qualification performs no calls and rejects missing or different project/model/ZDR proof', () => {
  assert.equal(CURRENT_RAG_BINDING, null);
  let calls = 0;
  const options = { getAccessToken: async () => { calls += 1; return TOKEN; },
    fetcher: async () => { calls += 1; throw new Error('must not fetch'); } };
  assert.equal(createQualifiedCloudRagProvider({ binding: null, ...options }), undefined);
  for (const change of [
    { projectId: 'other-project' }, { provider: 'google-cloud-meeting' }, { embeddingModel: 'other-model' },
    { generationModels: ['gemini-3.5-flash'] }, { generationModels: ['gemini-3.5-flash', 'gemini-3.5-flash'] },
    { cache: 'enabled' }, { abuseMonitoring: 'unknown' }, { requestResponseLogging: 'enabled' },
    { qualificationEvidenceRef: '  ' },
  ]) {
    assert.throws(() => createQualifiedCloudRagProvider({ binding: { ...BINDING, ...change } as RagRuntimeBinding,
      ...options }), hasCode('CONFIG_INVALID'));
  }
  assert.equal(calls, 0);
});

test('Cloud embedding binds project, IAM header, no truncation and finite float32 3072 vector', async () => {
  let calls = 0;
  const client = provider({ fetcher: async (input, init) => {
    calls += 1;
    assert.equal(String(input), 'https://us-central1-aiplatform.googleapis.com/v1/projects/jenfu-platform-prod/locations/us-central1/publishers/google/models/gemini-embedding-001:predict');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${TOKEN}`);
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), null);
    assert.equal(new Headers(init?.headers).get('x-goog-user-project'), 'jenfu-platform-prod');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)), { instances: [{ content: 'retrieval query' }],
      parameters: { autoTruncate: false, outputDimensionality: 3072 } });
    return json(embedding());
  } });
  assert.deepEqual(await client.embed('retrieval query'), VECTOR.map(Math.fround));
  assert.equal(calls, 1);
  for (const content of ['', 'x'.repeat(64 * 1024 + 1), '\ud800']) {
    await assert.rejects(client.embed(content), hasCode('DOMAIN_DATA_INVALID'));
  }
  assert.equal(calls, 1);
});

test('Cloud generation preserves both explicit models, bounded text and optional JSON without fallback', async () => {
  const calls: string[] = [];
  const client = provider({ fetcher: async (input, init) => {
    const url = String(input); calls.push(url);
    const model = url.split('/').at(-1)!.split(':')[0]!;
    assert.deepEqual(JSON.parse(String(init?.body)), { contents: [{ role: 'user', parts: [{ text: 'prompt text' }] }],
      generationConfig: { candidateCount: 1, maxOutputTokens: 8192 } });
    return json(generation(`${model}-001`));
  } });
  for (const model of BINDING.generationModels) {
    assert.equal(await client.generate({ model, prompt: 'prompt text' }), 'answer');
    assert.equal(calls.at(-1), `https://aiplatform.googleapis.com/v1/projects/jenfu-platform-prod/locations/global/publishers/google/models/${model}:generateContent`);
  }
  await assert.rejects(client.generate({ model: 'unapproved-model' as 'gemini-3.5-flash', prompt: 'prompt' }), hasCode('DOMAIN_DATA_INVALID'));
  await assert.rejects(client.generate({ model: 'gemini-3.5-flash', prompt: 'prompt', temperature: Number.NaN }), hasCode('DOMAIN_DATA_INVALID'));
  assert.equal(calls.length, 2);
  const jsonClient = provider({ fetcher: async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)).generationConfig,
      { candidateCount: 1, maxOutputTokens: 8192, responseMimeType: 'application/json', temperature: 0.2 });
    return json(generation('gemini-3.5-flash', '{"safe":true}'));
  } });
  assert.equal(await jsonClient.generate({ model: 'gemini-3.5-flash', prompt: 'prompt',
    responseMimeType: 'application/json', temperature: 0.2 }), '{"safe":true}');
});

test('provider quota, unavailable, gateway timeout, auth and missing model responses are safe and never retried', async () => {
  for (const scenario of [
    { status: 429, code: 'RAG_QUOTA_EXCEEDED' }, { status: 503, code: 'RAG_PROVIDER_UNAVAILABLE' },
    { status: 504, code: 'RAG_TIMEOUT' }, { status: 401, code: 'RAG_PROVIDER_UNAVAILABLE' },
    { status: 404, code: 'RAG_MODEL_UNAVAILABLE' },
  ]) {
    let calls = 0;
    const client = provider({ fetcher: async () => { calls += 1; return new Response('private provider body', { status: scenario.status }); } });
    await assert.rejects(client.generate({ model: 'gemini-3.1-flash-lite', prompt: 'prompt' }), error => {
      assert.ok(hasCode(scenario.code)(error)); assert.doesNotMatch(String(error), /private|do-not-log/); return true;
    });
    assert.equal(calls, 1);
  }
  let calls = 0;
  const client = provider({ fetcher: async () => { calls += 1; throw new Error('private unknown outcome'); } });
  await assert.rejects(client.generate({ model: 'gemini-3.5-flash', prompt: 'prompt' }), hasCode('RAG_PROVIDER_UNAVAILABLE'));
  assert.equal(calls, 1);
});

test('invalid credentials and parameters do not become model fallback signals', async () => {
  for (const scenario of [
    { message: 'Invalid credentials.', code: 'RAG_PROVIDER_UNAVAILABLE' },
    { message: 'Malformed generation parameters.', code: 'RAG_PROVIDER_UNAVAILABLE' },
    { message: 'Model gemini-example is not supported for generateContent.', code: 'RAG_MODEL_UNAVAILABLE' },
  ]) {
    let calls = 0;
    const client = provider({ fetcher: async () => {
      calls += 1; return json({ error: { status: 'INVALID_ARGUMENT', message: scenario.message } }, { status: 400 });
    } });
    await assert.rejects(client.generate({ model: 'gemini-3.5-flash', prompt: 'prompt' }), hasCode(scenario.code));
    assert.equal(calls, 1);
  }
});

test('redirect, malformed, oversized, truncated and invalid embeddings fail without leaking bodies', async () => {
  const scenarios = [
    { response: () => new Response('private redirect body', { status: 302, headers: { location: 'https://evil.invalid/' } }), code: 'RAG_PROVIDER_UNAVAILABLE' },
    ...[
      () => new Response('private malformed body', { headers: { 'content-type': 'application/json' } }),
      () => json(embedding(VECTOR.slice(1))), () => json(embedding([...VECTOR.slice(0, -1), null])),
      () => json(embedding([...VECTOR.slice(0, -1), Number.MAX_VALUE])), () => json(embedding(VECTOR.map(() => 0))),
      () => json(embedding(VECTOR, { truncated: true, token_count: 4 })), () => json(embedding(VECTOR, {})),
      () => json(embedding(VECTOR, { truncated: false, token_count: 2049 })),
      () => new Response(`{"x":"${'x'.repeat(2 * 1024 * 1024)}"}`, { headers: { 'content-type': 'application/json' } }),
    ].map(response => ({ response, code: 'RAG_PROVIDER_INVALID_RESPONSE' })),
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const client = provider({ fetcher: async () => { calls += 1; return scenario.response(); } });
    await assert.rejects(client.embed('safe input'), error => {
      assert.ok(hasCode(scenario.code)(error)); assert.doesNotMatch(String(error), /private|do-not-log/); return true;
    });
    assert.equal(calls, 1);
  }
});

test('cached content, model drift, blocked output and tool parts never become accepted answers', async () => {
  for (const response of [
    generation('other-model'), generation('gemini-3.5-flash', 'answer', { usageMetadata: { cachedContentTokenCount: 1 } }),
    generation('gemini-3.5-flash', 'answer', { usageMetadata: null }),
    generation('gemini-3.5-flash', 'answer', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }),
    generation('gemini-3.5-flash', 'answer', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private', functionCall: {} }] } }] }),
    generation('gemini-3.5-flash', 'x'.repeat(256 * 1024 + 1)), generation('gemini-3.5-flash', '\ud800'),
  ]) {
    const client = provider({ fetcher: async () => json(response) });
    await assert.rejects(client.generate({ model: 'gemini-3.5-flash', prompt: 'prompt' }), hasCode('RAG_PROVIDER_INVALID_RESPONSE'));
  }
  const client = provider({ fetcher: async () => json(generation('gemini-3.5-flash', 'answer', {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private thought', thought: true }, { text: 'answer' }] } }],
  })) });
  assert.equal(await client.generate({ model: 'gemini-3.5-flash', prompt: 'prompt' }), 'answer');
});

test('invalid or failed IAM token retrieval never sends content or leaks credential errors', async () => {
  let calls = 0;
  for (const getAccessToken of [async () => '', async () => 'unsafe token', async () => { throw new Error(TOKEN); },
    async () => { throw new KernelError('CONFIG_INVALID', TOKEN, 503); }]) {
    const client = provider({ getAccessToken, fetcher: async () => { calls += 1; return json(embedding()); } });
    await assert.rejects(client.embed('private content'), error => {
      assert.ok(hasCode('RAG_PROVIDER_UNAVAILABLE')(error)); assert.equal(String(error).includes(TOKEN), false); return true;
    });
  }
  assert.equal(calls, 0);
});

test('caller cancellation before or during IAM retrieval prevents a late content dispatch', async () => {
  const controller = new AbortController();
  let releaseToken!: (value: string) => void;
  let calls = 0;
  const client = provider({ getAccessToken: () => new Promise(resolve => { releaseToken = resolve; }),
    fetcher: async () => { calls += 1; return json(embedding()); } });
  const pending = client.embed('private content', controller.signal);
  await new Promise<void>(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(pending, hasCode('RAG_TIMEOUT'));
  releaseToken(TOKEN); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  await assert.rejects(client.embed('private content', controller.signal), hasCode('RAG_TIMEOUT'));
});

test('caller signal cancels in-flight Cloud requests', async () => {
  const controller = new AbortController();
  let capturedSignal: AbortSignal | null | undefined;
  const client = provider({ fetcher: async (_input, init) => {
    capturedSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  } });
  const pending = client.embed('safe test input', controller.signal);
  await new Promise<void>(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(pending, hasCode('RAG_TIMEOUT'));
  assert.ok(capturedSignal instanceof AbortSignal); assert.equal(capturedSignal.aborted, true);
});

test('embedding request keeps its fixed eight-second deadline', async () => {
  let capturedSignal: AbortSignal | null | undefined;
  const client = provider({ fetcher: async (_input, init) => {
    capturedSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  } });
  await assert.rejects(client.embed('safe timeout test'), hasCode('RAG_TIMEOUT'));
  assert.ok(capturedSignal instanceof AbortSignal); assert.equal(capturedSignal.aborted, true);
});
