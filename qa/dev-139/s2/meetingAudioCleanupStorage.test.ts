import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KernelError } from '../../../server/errors.js';
import { createGcsMeetingAudioStorage } from '../../../server/meetingAudioStorage.js';

const bucket = 'projed-meeting-audio-test';
const key = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'v1/0.webm',
].join('/');
const tokenValue = 'synthetic-access-token-never-log';
const generation = '9007199254740993123';

interface FetchCall {
  url: URL;
  init: RequestInit;
}

function harness(handler: (url: URL, init: RequestInit) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = input instanceof URL ? input : new URL(String(input));
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  };
  const storage = createGcsMeetingAudioStorage({
    bucket,
    getAccessToken: async () => tokenValue,
    fetchImpl,
  });
  return { storage, calls };
}

function metadataResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    bucket,
    name: key,
    generation,
    size: '12',
    contentType: 'audio/webm',
    ...overrides,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function isKernelCode(code: string) {
  return (error: unknown): error is KernelError => error instanceof KernelError && String(error.code) === code;
}

test('cleanup probe fetches only bounded object metadata and pins the requested generation', async () => {
  const { storage, calls } = harness(() => metadataResponse());

  const result = await storage.probe(key, generation);

  assert.deepEqual(result, { kind: 'present', generation, size: 12, contentType: 'audio/webm' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.origin, 'https://storage.googleapis.com');
  assert.equal(calls[0]?.url.pathname, `/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}`);
  assert.equal(calls[0]?.url.searchParams.get('generation'), generation);
  assert.equal(calls[0]?.url.searchParams.has('alt'), false);
  assert.equal(calls[0]?.init.method, 'GET');
  assert.equal(calls[0]?.init.redirect, 'error');
});

test('cleanup probe without a generation requests the current metadata once', async () => {
  const { storage, calls } = harness(() => metadataResponse());

  const result = await storage.probe(key);

  assert.equal(result.kind, 'present');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.searchParams.has('generation'), false);
});

test('cleanup probe classifies only a confirmed 404 as missing', async () => {
  const { storage, calls } = harness(() => new Response(`private ${tokenValue}`, { status: 404 }));

  assert.deepEqual(await storage.probe(key, generation), { kind: 'missing' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.searchParams.get('generation'), generation);
});

test('cleanup probe rejects a replacement generation without falling back', async () => {
  const replacementGeneration = '9007199254740993124';
  const { storage, calls } = harness(() => metadataResponse({ generation: replacementGeneration }));

  await assert.rejects(storage.probe(key, generation), (error: unknown) => {
    assert.ok(isKernelCode('MEETING_STORAGE_CONFLICT')(error));
    assert.equal(error.httpStatus, 409);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.searchParams.get('generation'), generation);
});

test('cleanup probe rejects forbidden responses without exposing body or credentials', async () => {
  const { storage, calls } = harness(() => new Response(`private ${tokenValue}`, { status: 403 }));

  await assert.rejects(storage.probe(key), (error: unknown) => {
    assert.ok(isKernelCode('MEETING_STORAGE_UNAVAILABLE')(error));
    assert.equal(error.message.includes(tokenValue), false);
    assert.equal(error.message.includes('private'), false);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('cleanup probe does not send a request when token acquisition finishes after abort', async () => {
  let resolveToken!: (value: string) => void;
  let calls = 0;
  const token = new Promise<string>((resolve) => { resolveToken = resolve; });
  const storage = createGcsMeetingAudioStorage({
    bucket,
    getAccessToken: () => token,
    fetchImpl: async () => {
      calls += 1;
      return metadataResponse();
    },
  });
  const controller = new AbortController();
  const probe = storage.probe(key, generation, controller.signal);
  controller.abort();
  resolveToken(tokenValue);

  await assert.rejects(probe, isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
  assert.equal(calls, 0);
});

test('cleanup probe rejects oversized metadata bodies and object metadata', async (t) => {
  await t.test('metadata response exceeds 64 KiB', async () => {
    const { storage, calls } = harness(() => new Response('x'.repeat(64 * 1024 + 1), {
      status: 200,
      headers: { 'content-length': String(64 * 1024 + 1) },
    }));
    await assert.rejects(storage.probe(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 1);
  });

  await t.test('object size exceeds 10 MiB', async () => {
    const { storage, calls } = harness(() => metadataResponse({ size: String(10 * 1024 * 1024 + 1) }));
    await assert.rejects(storage.probe(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 1);
  });
});

test('cleanup probe validates the exact bucket, object name, and allowed MIME type', async (t) => {
  for (const [label, overrides] of [
    ['different bucket', { bucket: 'another-bucket' }],
    ['different object', { name: key.replace('/0.webm', '/1.webm') }],
    ['MIME does not match path', { contentType: 'audio/ogg' }],
  ] as const) {
    await t.test(label, async () => {
      const { storage, calls } = harness(() => metadataResponse(overrides));
      await assert.rejects(storage.probe(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
      assert.equal(calls.length, 1);
    });
  }
});

test('cleanup probe does not retry server or network failures', async (t) => {
  await t.test('server error', async () => {
    const { storage, calls } = harness(() => new Response(`private ${tokenValue}`, { status: 503 }));
    await assert.rejects(storage.probe(key), (error: unknown) => {
      assert.ok(isKernelCode('MEETING_STORAGE_UNAVAILABLE')(error));
      assert.equal(error.message.includes(tokenValue), false);
      return true;
    });
    assert.equal(calls.length, 1);
  });

  await t.test('network failure', async () => {
    let calls = 0;
    const storage = createGcsMeetingAudioStorage({
      bucket,
      getAccessToken: async () => tokenValue,
      fetchImpl: async () => {
        calls += 1;
        throw new Error(`network error ${tokenValue}`);
      },
    });
    await assert.rejects(storage.probe(key), (error: unknown) => {
      assert.ok(isKernelCode('MEETING_STORAGE_UNAVAILABLE')(error));
      assert.equal(error.message.includes(tokenValue), false);
      return true;
    });
    assert.equal(calls, 1);
  });
});
