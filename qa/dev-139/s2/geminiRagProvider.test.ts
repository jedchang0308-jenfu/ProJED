import assert from 'node:assert/strict';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import { createGeminiRagProvider } from '../../../server/geminiRagProvider.js';

const API_KEY = 'unit-test-rag-key-do-not-log';
const VECTOR = Array.from({ length: 3072 }, (_, index) => index / 3072);

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), {
  status: init.status ?? 200,
  headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
});

function hasCode(code: string) {
  return (error: unknown) => error instanceof KernelError && error.code === code;
}

test('Gemini embedding uses the fixed model, API-key header and finite 3072 vector', async () => {
  let calls = 0;
  const provider = createGeminiRagProvider({
    apiKey: API_KEY,
    fetcher: async (input, init) => {
      calls += 1;
      assert.equal(String(input), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent');
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('x-goog-api-key'), API_KEY);
      assert.equal(new Headers(init?.headers).get('authorization'), null);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-store');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: 'retrieval query' }] },
        output_dimensionality: 3072,
      });
      return json({ embedding: { values: VECTOR } });
    },
  });

  const result = await provider.embed('retrieval query');
  assert.equal(result.length, 3072);
  assert.equal(result.every(Number.isFinite), true);
  assert.equal(calls, 1);
});

test('Gemini generation uses only an allowed model and returns bounded text', async () => {
  let url = '';
  let body: unknown;
  const provider = createGeminiRagProvider({
    apiKey: API_KEY,
    fetcher: async (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body));
      return json({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] });
    },
  });

  assert.equal(await provider.generate({ model: 'gemini-3.5-flash', prompt: 'prompt text' }), 'answer');
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
  assert.deepEqual(body, { contents: [{ role: 'user', parts: [{ text: 'prompt text' }] }] });
  await assert.rejects(provider.generate({ model: 'unapproved-model' as 'gemini-3.5-flash', prompt: 'prompt' }), hasCode('DOMAIN_DATA_INVALID'));

  const oversizedTextProvider = createGeminiRagProvider({
    apiKey: API_KEY,
    fetcher: async () => json({ candidates: [{ content: { parts: [{ text: 'x'.repeat(256 * 1024 + 1) }] } }] }),
  });
  await assert.rejects(
    oversizedTextProvider.generate({ model: 'gemini-3.1-flash-lite', prompt: 'prompt' }),
    hasCode('RAG_PROVIDER_INVALID_RESPONSE'),
  );
});

test('provider quota, unavailable and gateway timeout responses are safe and never retried', async () => {
  const scenarios = [
    { status: 429, code: 'RAG_QUOTA_EXCEEDED' },
    { status: 503, code: 'RAG_PROVIDER_UNAVAILABLE' },
    { status: 504, code: 'RAG_TIMEOUT' },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const provider = createGeminiRagProvider({
      apiKey: API_KEY,
      fetcher: async () => {
        calls += 1;
        return new Response('provider-secret-response-body', { status: scenario.status });
      },
    });
    await assert.rejects(provider.generate({ model: 'gemini-3.1-flash-lite', prompt: 'prompt' }), error => {
      assert.ok(hasCode(scenario.code)(error));
      assert.equal(String(error).includes(API_KEY), false);
      assert.equal(String(error).includes('provider-secret-response-body'), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('meeting generation uses JSON mode and an unavailable model is distinct from transient failures', async () => {
  let calls=0;
  const provider=createGeminiRagProvider({apiKey:API_KEY,fetcher:async(_input,init)=>{
    calls+=1;
    assert.deepEqual(JSON.parse(String(init?.body)).generationConfig,{responseMimeType:'application/json',temperature:0.2});
    return new Response('private provider detail',{status:404});
  }});
  await assert.rejects(provider.generate({model:'gemini-3.5-flash',prompt:'meeting source',responseMimeType:'application/json',temperature:0.2}),hasCode('RAG_MODEL_UNAVAILABLE'));
  assert.equal(calls,1);
  await assert.rejects(provider.generate({model:'gemini-3.5-flash',prompt:'meeting source',temperature:Number.NaN}),hasCode('DOMAIN_DATA_INVALID'));
  assert.equal(calls,1);
});

test('invalid generation credentials or parameters are not model fallback signals', async () => {
  for(const scenario of [
    {message:'API key not valid. Please pass a valid API key.',code:'RAG_PROVIDER_UNAVAILABLE'},
    {message:'Malformed generation parameters.',code:'RAG_PROVIDER_UNAVAILABLE'},
    {message:'Model gemini-example is not supported for generateContent.',code:'RAG_MODEL_UNAVAILABLE'},
  ]){
    let calls=0;
    const provider=createGeminiRagProvider({apiKey:API_KEY,fetcher:async()=>{
      calls+=1;return json({error:{status:'INVALID_ARGUMENT',message:scenario.message}},{status:400});
    }});
    await assert.rejects(provider.generate({model:'gemini-3.5-flash',prompt:'meeting source'}),hasCode(scenario.code));
    assert.equal(calls,1);
  }
});

test('redirect, malformed, oversized and invalid provider responses fail closed without leaking bodies', async () => {
  const scenarios: Array<{ response: () => Response; code: string }> = [
    { response: () => new Response('private redirect body', { status: 302, headers: { location: 'https://evil.invalid/' } }), code: 'RAG_PROVIDER_UNAVAILABLE' },
    { response: () => new Response('private malformed body', { headers: { 'content-type': 'application/json' } }), code: 'RAG_PROVIDER_INVALID_RESPONSE' },
    { response: () => json({ embedding: { values: VECTOR.slice(1) } }), code: 'RAG_PROVIDER_INVALID_RESPONSE' },
    { response: () => json({ embedding: { values: [...VECTOR.slice(0, -1), null] } }), code: 'RAG_PROVIDER_INVALID_RESPONSE' },
    { response: () => new Response(`{"x":"${'x'.repeat(2 * 1024 * 1024)}"}`, { headers: { 'content-type': 'application/json' } }), code: 'RAG_PROVIDER_INVALID_RESPONSE' },
  ];

  for (const scenario of scenarios) {
    let calls = 0;
    const provider = createGeminiRagProvider({
      apiKey: API_KEY,
      fetcher: async () => { calls += 1; return scenario.response(); },
    });
    await assert.rejects(provider.embed('safe test input'), error => {
      assert.ok(hasCode(scenario.code)(error));
      assert.equal(String(error).includes(API_KEY), false);
      assert.equal(String(error).includes('private'), false);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('caller timeout signal is forwarded and cancels the Gemini request', async () => {
  const controller = new AbortController();
  let capturedSignal: AbortSignal | null | undefined;
  const provider = createGeminiRagProvider({
    apiKey: API_KEY,
    fetcher: async (_input, init) => {
      capturedSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    },
  });

  const pending = provider.embed('safe test input', controller.signal);
  await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, hasCode('RAG_TIMEOUT'));
  assert.ok(capturedSignal instanceof AbortSignal);
  assert.equal(capturedSignal.aborted, true);
});

test('embedding request is cancelled at its fixed eight-second deadline', async () => {
  let capturedSignal: AbortSignal | null | undefined;
  const provider = createGeminiRagProvider({
    apiKey: API_KEY,
    fetcher: async (_input, init) => {
      capturedSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    },
  });

  await assert.rejects(provider.embed('safe timeout test'), hasCode('RAG_TIMEOUT'));
  assert.ok(capturedSignal instanceof AbortSignal);
  assert.equal(capturedSignal.aborted, true);
});
