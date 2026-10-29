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
  let tokenCalls = 0;
  const storage = createGcsMeetingAudioStorage({
    bucket,
    getAccessToken: async () => {
      tokenCalls += 1;
      return tokenValue;
    },
    fetchImpl,
  });
  return { storage, calls, tokenCalls: () => tokenCalls };
}

function metadataResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    name: key,
    generation,
    size: '12',
    contentType: 'audio/webm',
    ...overrides,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function isKernelCode(code: string) {
  return (error: unknown): boolean => error instanceof KernelError && String(error.code) === code;
}

test('upload uses fixed GCS media endpoint and create-only generation precondition', async () => {
  const { storage, calls } = harness(() => metadataResponse());
  const audio = new TextEncoder().encode('sample audio');

  const result = await storage.upload(key, audio, 'audio/webm;codecs=opus');

  assert.deepEqual(result, { contentType: 'audio/webm', generation, size: audio.byteLength });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.url.origin, 'https://storage.googleapis.com');
  assert.equal(call.url.pathname, '/upload/storage/v1/b/projed-meeting-audio-test/o');
  assert.equal(call.url.searchParams.get('uploadType'), 'media');
  assert.equal(call.url.searchParams.get('name'), key);
  assert.equal(call.url.searchParams.get('ifGenerationMatch'), '0');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.redirect, 'error');
  const headers = new Headers(call.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${tokenValue}`);
  assert.equal(headers.get('content-type'), 'audio/webm');
  assert.deepEqual(Array.from(call.init.body as Uint8Array), Array.from(audio));
});

test('invalid bucket and arbitrary or traversal object paths fail before token lookup', async () => {
  const { storage, calls, tokenCalls } = harness(() => metadataResponse());

  await assert.rejects(
    storage.upload(`https://storage.googleapis.com/${key}`, new Uint8Array([1]), 'audio/webm'),
    isKernelCode('DOMAIN_DATA_INVALID'),
  );
  await assert.rejects(
    storage.upload(key.replace('/v1/0.webm', '/v1/../0.webm'), new Uint8Array([1]), 'audio/webm'),
    isKernelCode('DOMAIN_DATA_INVALID'),
  );
  assert.equal(calls.length, 0);
  assert.equal(tokenCalls(), 0);
  assert.throws(
    () => createGcsMeetingAudioStorage({ bucket: 'https://storage.googleapis.com/bucket', getAccessToken: async () => tokenValue }),
    isKernelCode('CONFIG_INVALID'),
  );
});

test('upload maps precondition failure to conflict without retry or exposing response content', async () => {
  const { storage, calls } = harness(() => new Response(`private ${tokenValue}`, { status: 412 }));

  await assert.rejects(storage.upload(key, new Uint8Array([1]), 'audio/webm'), (error: unknown) => {
    assert.ok(error instanceof KernelError);
    assert.equal(String(error.code), 'MEETING_STORAGE_CONFLICT');
    assert.equal(error.httpStatus, 409);
    assert.equal(error.message.includes(tokenValue), false);
    assert.equal(error.message.includes('private'), false);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('read pins media download to the exact metadata generation string', async () => {
  const audioText = 'sample audio';
  const { storage, calls } = harness((url) => {
    if (url.searchParams.has('alt')) {
      return new Response(audioText, {
        status: 200,
        headers: {
          'content-type': 'audio/webm',
          'content-length': String(new TextEncoder().encode(audioText).byteLength),
          'x-goog-generation': generation,
        },
      });
    }
    return metadataResponse();
  });

  const result = await storage.read(key);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url.pathname, `/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}`);
  assert.equal(calls[1]?.url.searchParams.get('alt'), 'media');
  assert.equal(calls[1]?.url.searchParams.get('generation'), generation);
  assert.equal(calls[0]?.init.redirect, 'error');
  assert.equal(calls[1]?.init.redirect, 'error');
  assert.deepEqual(Array.from(result.bytes), Array.from(new TextEncoder().encode(audioText)));
  assert.equal(result.contentType, 'audio/webm');
  assert.equal(result.generation, generation);
  assert.equal(result.size, result.bytes.byteLength);
});

test('read rejects object metadata above the 10 MiB limit before downloading media', async () => {
  const { storage, calls } = harness(() => metadataResponse({ size: String(10 * 1024 * 1024 + 1) }));

  await assert.rejects(storage.read(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
  assert.equal(calls.length, 1);
});

test('read rejects metadata MIME/path mismatch and media byte-size mismatch', async (t) => {
  await t.test('metadata MIME does not match the reserved extension', async () => {
    const { storage, calls } = harness(() => metadataResponse({ contentType: 'audio/ogg' }));
    await assert.rejects(storage.read(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 1);
  });

  await t.test('media body differs from the metadata size', async () => {
    const { storage, calls } = harness((url) => url.searchParams.has('alt')
      ? new Response('short', { status: 200, headers: { 'content-type': 'audio/webm' } })
      : metadataResponse());
    await assert.rejects(storage.read(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 2);
  });
});

test('read does not consume oversized metadata or media response bodies', async (t) => {
  await t.test('metadata JSON body', async () => {
    const { storage, calls } = harness(() => new Response('x'.repeat(64 * 1024 + 1), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await assert.rejects(storage.read(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 1);
  });

  await t.test('media stream body', async () => {
    const { storage, calls } = harness((url) => url.searchParams.has('alt')
      ? new Response('x'.repeat(10 * 1024 * 1024 + 1), { status: 200, headers: { 'content-type': 'audio/webm' } })
      : metadataResponse({ size: '12' }));
    await assert.rejects(storage.read(key), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
    assert.equal(calls.length, 2);
  });
});

test('delete binds the exact generation and treats absence as already deleted', async (t) => {
  await t.test('success carries ifGenerationMatch as the original string', async () => {
    const { storage, calls } = harness(() => new Response(null, { status: 204 }));
    await storage.delete(key, generation);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init.method, 'DELETE');
    assert.equal(calls[0]?.url.searchParams.get('ifGenerationMatch'), generation);
  });

  await t.test('404 is idempotent success', async () => {
    const { storage } = harness(() => new Response(null, { status: 404 }));
    await assert.doesNotReject(storage.delete(key, generation));
  });

  await t.test('412 is a generation conflict', async () => {
    const { storage, calls } = harness(() => new Response('do not expose', { status: 412 }));
    await assert.rejects(storage.delete(key, generation), (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(String(error.code), 'MEETING_STORAGE_CONFLICT');
      assert.equal(error.httpStatus, 409);
      assert.equal(error.message.includes('do not expose'), false);
      return true;
    });
    assert.equal(calls.length, 1);
  });
});

test('pre-aborted calls avoid credentials and fetch, and network errors are redacted', async (t) => {
  const aborted = new AbortController();
  aborted.abort();
  const preAborted = harness(() => new Response(null, { status: 200 }));
  await assert.rejects(preAborted.storage.upload(key, new Uint8Array([1]), 'audio/webm', aborted.signal), isKernelCode('MEETING_STORAGE_UNAVAILABLE'));
  assert.equal(preAborted.tokenCalls(), 0);
  assert.equal(preAborted.calls.length, 0);

  await t.test('in-flight abort signal is forwarded and its failure is redacted', async () => {
    const controller = new AbortController();
    let forwardedSignal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (...args: Parameters<typeof fetch>) => {
      forwardedSignal = args[1]?.signal;
      controller.abort();
      throw new DOMException(`aborted ${tokenValue}`, 'AbortError');
    };
    const storage = createGcsMeetingAudioStorage({ bucket, getAccessToken: async () => tokenValue, fetchImpl });
    await assert.rejects(storage.delete(key, generation, controller.signal), (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(String(error.code), 'MEETING_STORAGE_UNAVAILABLE');
      assert.equal(error.message.includes(tokenValue), false);
      return true;
    });
    assert.equal(forwardedSignal, controller.signal);
  });

  await t.test('fetch rejection does not expose its message or token', async () => {
    const calls: URL[] = [];
    const fetchImpl: typeof fetch = async (...args: Parameters<typeof fetch>) => {
      calls.push(new URL(String(args[0])));
      throw new Error(`failure includes ${tokenValue}`);
    };
    const storage = createGcsMeetingAudioStorage({ bucket, getAccessToken: async () => tokenValue, fetchImpl });
    await assert.rejects(storage.read(key), (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(String(error.code), 'MEETING_STORAGE_UNAVAILABLE');
      assert.equal(error.message.includes(tokenValue), false);
      assert.equal(error.message.includes('failure includes'), false);
      return true;
    });
    assert.equal(calls.length, 1);
  });
});
