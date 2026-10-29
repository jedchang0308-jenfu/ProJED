import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGoogleCloudSpeechProvider,
  GoogleCloudSpeechProviderError,
  type GoogleCloudSpeechProviderErrorCode,
} from '../../../server/googleCloudSpeechProvider.js';

const TOKEN = 'fixture.access-token';
const PCM = new Uint8Array(32_000);

function wire(overrides: Record<string, unknown> = {}) {
  return {
    results: [{
      alternatives: [{
        transcript: '你好',
        words: [
          { word: '你', startTime: '0s', endTime: '0.4s' },
          { word: '好', startTime: '0.4s', endTime: '0.9s' },
        ],
      }],
    }],
    totalBilledTime: '1.2s',
    requestId: '12345',
    ...overrides,
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status });
}

function isProviderError(code?: GoogleCloudSpeechProviderErrorCode) {
  return (error: unknown): error is GoogleCloudSpeechProviderError => error instanceof GoogleCloudSpeechProviderError
    && (code === undefined || error.code === code);
}

function provider(fetchImpl: typeof fetch, getAccessToken: () => Promise<string> = async () => TOKEN, timeoutMs?: number) {
  return createGoogleCloudSpeechProvider({ getAccessToken, fetchImpl, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}

test('sends one fixed V1 inline PCM request and preserves transcript, word precision, and provider metadata', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const subject = provider(async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return response(wire());
  });

  const result = await subject.transcribe({ pcm16le: PCM });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://speech.googleapis.com/v1/speech:recognize');
  assert.equal(calls[0]?.init.method, 'POST');
  assert.equal(calls[0]?.init.redirect, 'error');
  assert.ok(calls[0]?.init.signal instanceof AbortSignal);
  const headers = new Headers(calls[0]?.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('x-goog-user-project'), 'projed-cc78d');
  const requestBody = JSON.parse(String(calls[0]?.init.body)) as {
    config: Record<string, unknown>;
    audio: { content: string };
  };
  assert.deepEqual(requestBody.config, {
    encoding: 'LINEAR16',
    sampleRateHertz: 16_000,
    audioChannelCount: 1,
    languageCode: 'cmn-Hant-TW',
    model: 'default',
    enableWordTimeOffsets: true,
  });
  assert.equal(requestBody.audio.content, Buffer.from(PCM).toString('base64'));
  assert.deepEqual(result, {
    transcript: '你好',
    words: [
      { text: '你', startMs: 0, endMs: 400 },
      { text: '好', startMs: 400, endMs: 900 },
    ],
    // Deliberately greater than the one-second PCM duration; keep provider billing metadata raw.
    totalBilledTime: '1.2s',
    requestId: '12345',
  });
});

test('accepts a no-speech response and does not invent billing metadata', async () => {
  for (const value of [{ results: [] }, {}]) {
    const subject = provider(async () => response(value));
    const result = await subject.transcribe({ pcm16le: PCM });
    assert.deepEqual(result, { transcript: '', words: [] });
    assert.equal(Object.hasOwn(result, 'totalBilledTime'), false);
    assert.equal(Object.hasOwn(result, 'requestId'), false);
  }
});

test('parses protobuf timestamp precision, defaults omitted startTime to zero, and allows a small overlap', async () => {
  const subject = provider(async () => response({
    results: [{ alternatives: [{
      transcript: 'AB',
      words: [
        { word: 'A', endTime: '0.000000002s' },
        { word: 'B', startTime: '0.000000001s', endTime: '0.000000003s' },
      ],
    }] }],
  }));

  const result = await subject.transcribe({ pcm16le: PCM });

  assert.deepEqual(result.words, [
    { text: 'A', startMs: 0, endMs: 0.000002 },
    { text: 'B', startMs: 0.000001, endMs: 0.000003 },
  ]);
});

test('rejects invalid PCM and pre-dispatch cancellation without obtaining credentials or fetching', async () => {
  let tokenCalls = 0;
  let fetchCalls = 0;
  const subject = provider(async () => {
    fetchCalls += 1;
    return response(wire());
  }, async () => {
    tokenCalls += 1;
    return TOKEN;
  });

  await assert.rejects(subject.transcribe({ pcm16le: new Uint8Array() }), isProviderError('ASR_INVALID_INPUT'));
  await assert.rejects(subject.transcribe({ pcm16le: new Uint8Array([1]) }), isProviderError('ASR_INVALID_INPUT'));
  await assert.rejects(subject.transcribe({ pcm16le: new Uint8Array(1_600_002) }), isProviderError('ASR_INVALID_INPUT'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(subject.transcribe({ pcm16le: PCM, signal: controller.signal }), (error: unknown) => {
    assert.ok(isProviderError('ASR_REQUEST_ABORTED')(error));
    assert.equal(error.requestSent, false);
    assert.equal(error.usageUnknown, false);
    return true;
  });
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('maps token failures and invalid tokens without exposing credential text', async () => {
  const privateToken = 'private token value must-not-escape';
  let fetchCalls = 0;
  for (const getAccessToken of [
    async () => { throw new Error(privateToken); },
    async () => privateToken,
  ]) {
    const subject = provider(async () => {
      fetchCalls += 1;
      return response(wire());
    }, getAccessToken);
    await assert.rejects(subject.transcribe({ pcm16le: PCM }), (error: unknown) => {
      assert.ok(isProviderError('ASR_AUTH_UNAVAILABLE')(error));
      assert.equal(error.requestSent, false);
      assert.equal(error.usageUnknown, false);
      assert.equal(error.message.includes(privateToken), false);
      return true;
    });
  }
  assert.equal(fetchCalls, 0);
});

test('distinguishes timeout while credentials are pending from timeout after dispatch', async () => {
  let beforeDispatchCalls = 0;
  const beforeDispatch = provider(async () => {
    beforeDispatchCalls += 1;
    return response(wire());
  }, () => new Promise<string>(() => undefined), 5);
  await assert.rejects(beforeDispatch.transcribe({ pcm16le: PCM }), (error: unknown) => {
    assert.ok(isProviderError('ASR_REQUEST_TIMEOUT')(error));
    assert.equal(error.requestSent, false);
    assert.equal(error.usageUnknown, false);
    return true;
  });
  assert.equal(beforeDispatchCalls, 0);

  let afterDispatchCalls = 0;
  const afterDispatch = provider((_input, init) => {
    afterDispatchCalls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private transport detail')), { once: true });
    });
  }, async () => TOKEN, 5);
  await assert.rejects(afterDispatch.transcribe({ pcm16le: PCM }), (error: unknown) => {
    assert.ok(isProviderError('ASR_REQUEST_TIMEOUT')(error));
    assert.equal(error.requestSent, true);
    assert.equal(error.usageUnknown, true);
    assert.equal(error.message.includes('private transport detail'), false);
    return true;
  });
  assert.equal(afterDispatchCalls, 1);
});

test('cancellation and transport errors after dispatch remain unknown and are never retried', async () => {
  let fetchCalls = 0;
  const controller = new AbortController();
  const cancelled = provider((_input, init) => {
    fetchCalls += 1;
    setImmediate(() => controller.abort());
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private network detail')), { once: true });
    });
  });
  await assert.rejects(cancelled.transcribe({ pcm16le: PCM, signal: controller.signal }), (error: unknown) => {
    assert.ok(isProviderError('ASR_REQUEST_ABORTED')(error));
    assert.equal(error.requestSent, true);
    assert.equal(error.usageUnknown, true);
    assert.equal(error.message.includes('private network detail'), false);
    return true;
  });
  assert.equal(fetchCalls, 1);

  const transport = provider(async () => {
    fetchCalls += 1;
    throw new Error('response includes secret data');
  });
  await assert.rejects(transport.transcribe({ pcm16le: PCM }), (error: unknown) => {
    assert.ok(isProviderError('ASR_TRANSPORT_UNKNOWN')(error));
    assert.equal(error.requestSent, true);
    assert.equal(error.usageUnknown, true);
    assert.equal(error.message.includes('secret data'), false);
    return true;
  });
  assert.equal(fetchCalls, 2);
});

test('preserves provider HTTP status and distinguishes free server errors from conservative 4xx outcomes', async () => {
  const privateBody = 'sensitive transcript and credential-like response text';
  for (const status of [401, 403, 429, 500, 503, 599]) {
    let fetchCalls = 0;
    const subject = provider(async () => {
      fetchCalls += 1;
      return response(privateBody, status);
    });
    const usageUnknown = status < 500 || status > 599;
    await assert.rejects(subject.transcribe({ pcm16le: PCM }), (error: unknown) => {
      assert.ok(isProviderError('ASR_PROVIDER_REJECTED')(error));
      assert.equal(error.httpStatus, status);
      assert.equal(error.requestSent, true);
      assert.equal(error.usageUnknown, usageUnknown);
      assert.equal(error.message.includes(privateBody), false);
      return true;
    });
    assert.equal(fetchCalls, 1);
  }
});

test('rejects malformed, unordered, out-of-range, and oversized provider replies with bounded safe errors', async () => {
  const malformed: unknown[] = [
    'not json',
    { unrelated: true },
    { error: { code: 500 } },
    { results: null },
    { results: [{ alternatives: [] }] },
    { results: [{ alternatives: [{ transcript: 'text without requested offsets' }] }] },
    { results: [{ alternatives: [{ transcript: 'text with empty requested offsets', words: [] }] }] },
    { results: [{ alternatives: [{ transcript: 'x', words: [{ word: 'x', startTime: 'bad', endTime: '1s' }] }] }] },
    { results: [{ alternatives: [{ transcript: 'xy', words: [
      { word: 'x', startTime: '0.5s', endTime: '0.7s' },
      { word: 'y', startTime: '0.4s', endTime: '0.8s' },
    ] }] }] },
    { results: [{ alternatives: [{ transcript: 'x', words: [{ word: 'x', startTime: '0s', endTime: '2s' }] }] }] },
    { results: [{ alternatives: [{ transcript: '\uD800', words: [] }] }] },
    { results: [], requestId: 123 },
  ];
  for (const value of malformed) {
    const subject = provider(async () => response(value));
    await assert.rejects(subject.transcribe({ pcm16le: PCM }), (error: unknown) => {
      assert.ok(isProviderError('ASR_PROVIDER_INVALID_RESPONSE')(error));
      assert.equal(error.requestSent, true);
      assert.equal(error.usageUnknown, true);
      assert.equal(error.message.includes('not json'), false);
      return true;
    });
  }

  const oversized = provider(async () => response('x'.repeat(512 * 1024 + 1)));
  await assert.rejects(oversized.transcribe({ pcm16le: PCM }), isProviderError('ASR_PROVIDER_INVALID_RESPONSE'));
});
