import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHttpMeetingAudioAdapter,
} from '../../../src/services/httpApi/meetingAudioAdapter';
import { HttpApiClient, HttpApiError } from '../../../src/services/httpApi/httpApiClient';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECORD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAPTURE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEGMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const AUDIO_PATH = `/api/v1/meeting-audio/${SEGMENT_ID}`;
const SOURCE_VERSION = 7;
const SEGMENT_INDEX = 3;
const BODY = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm;codecs=opus' });
const SHA256 = 'a'.repeat(64);

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function setActor(client: HttpApiClient, accountId = 'user-a', contextId = 'context-a'): void {
  client.bindExpectedActor({ accountId, contextId });
}

function reserveResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    data: {
      segmentId: SEGMENT_ID,
      sourceVersion: SOURCE_VERSION,
      segmentIndex: SEGMENT_INDEX,
      path: `${TENANT_ID}/${PROJECT_ID}/${RECORD_ID}/${CAPTURE_ID}/v${SOURCE_VERSION}/${SEGMENT_INDEX}.webm`,
      uploadUrl: AUDIO_PATH,
      token: null,
      signedUrl: null,
      expiresAt: Date.now() + 30_000,
      uploadState: 'pending',
      alreadyVerified: false,
      sha256: null,
      bytes: BODY.size,
      ...overrides,
    },
  };
}

function segmentResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    data: {
      segment: {
        id: SEGMENT_ID,
        segment_index: SEGMENT_INDEX,
        source_version: SOURCE_VERSION,
        bytes: BODY.size,
        sha256: SHA256,
        upload_state: 'verified',
        object_path: `${TENANT_ID}/${PROJECT_ID}/${RECORD_ID}/${CAPTURE_ID}/v${SOURCE_VERSION}/${SEGMENT_INDEX}.webm`,
        ...overrides,
      },
    },
  };
}

function expectHttpError(error: unknown, code: string, status: number): boolean {
  assert.ok(error instanceof HttpApiError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
}

test('PUT audio keeps frozen headers and binary body while rejecting a reply after actor change', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (request, init) => {
    calls.push({ path: String(request), init });
    client.bindExpectedActor({ accountId: 'user-b', contextId: 'context-b' });
    return json(segmentResponse());
  });
  setActor(client);

  await assert.rejects(client.putMeetingAudio<unknown>(AUDIO_PATH, BODY, SOURCE_VERSION),
    error=>expectHttpError(error,'ACTOR_CHANGED',409));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, AUDIO_PATH);
  assert.equal(calls[0]?.init?.method, 'PUT');
  assert.equal(calls[0]?.init?.body, BODY);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('content-type'), 'audio/webm');
  assert.equal(headers.get('x-projed-source-version'), String(SOURCE_VERSION));
  assert.equal(headers.get('x-projed-expected-account-id'), 'user-a');
  assert.equal(headers.get('x-projed-expected-context-id'), 'context-a');
  assert.equal(calls[0]?.init?.credentials, 'same-origin');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(calls[0]?.init?.redirect, 'error');
});

test('audio transport rejects noncanonical routes, unsafe versions, oversized, empty, and unsupported blobs before fetch', async () => {
  let calls = 0;
  const client = new HttpApiClient(async () => {
    calls += 1;
    return json(segmentResponse());
  });
  setActor(client);
  const wrongPaths = [
    `//example.test${AUDIO_PATH}`,
    `${AUDIO_PATH}?download=1`,
    AUDIO_PATH.toUpperCase(),
    '/api/v1/meeting-audio/not-a-uuid',
  ];
  for (const path of wrongPaths) {
    await assert.rejects(client.putMeetingAudio(path, BODY, SOURCE_VERSION), error =>
      expectHttpError(error, 'INVALID_API_PATH', 0));
  }
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, BODY, 2_147_483_648), error =>
    expectHttpError(error, 'INVALID_REQUEST', 400));
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, new Blob([]), SOURCE_VERSION), error =>
    expectHttpError(error, 'INVALID_REQUEST', 400));
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH,
    new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'audio/webm' }), SOURCE_VERSION), error =>
    expectHttpError(error, 'INVALID_REQUEST', 400));
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, new Blob(['x'], { type: 'application/json' }), SOURCE_VERSION), error =>
    expectHttpError(error, 'INVALID_REQUEST', 400));
  assert.equal(calls, 0);
});

test('PUT accepts the inclusive 10 MiB request body limit and requires a current actor binding', async () => {
  let calls = 0;
  const client = new HttpApiClient(async (_request, init) => {
    calls += 1;
    assert.equal((init?.body as Blob).size, 10 * 1024 * 1024);
    return json(segmentResponse());
  });
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, BODY, SOURCE_VERSION), error =>
    expectHttpError(error, 'ACTOR_REQUIRED', 401));
  assert.equal(calls, 0);

  setActor(client);
  await client.putMeetingAudio(AUDIO_PATH,
    new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'audio/webm' }), SOURCE_VERSION);
  assert.equal(calls, 1);
});

test('GET audio streams only bounded allowlisted audio and returns the server expiry', async () => {
  let calls = 0;
  const expiry = Date.now() + 20_000;
  const client = new HttpApiClient(async (request, init) => {
    calls += 1;
    assert.equal(String(request), AUDIO_PATH);
    assert.equal(init?.method, 'GET');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-projed-record-id'), 'legacy-record-42');
    assert.equal(headers.get('x-projed-expected-account-id'), 'user-a');
    assert.equal(headers.get('x-projed-expected-context-id'), 'context-a');
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    return new Response(new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'audio/ogg' }), {
      status: 200,
      headers: { 'content-type': 'audio/ogg; codecs=opus', 'x-projed-expires-at': String(expiry) },
    });
  });
  setActor(client);

  const result = await client.getMeetingAudio(AUDIO_PATH, 'legacy-record-42');
  assert.equal(calls, 1);
  assert.equal(result.blob.size, 10 * 1024 * 1024);
  assert.equal(result.blob.type, 'audio/ogg');
  assert.equal(result.expiresAt, expiry);
});

test('GET audio rejects streamed overflow and detects actor changes after the blob is complete', async () => {
  const boundedClient = new HttpApiClient(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(10 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'content-type': 'audio/webm', 'x-projed-expires-at': String(Date.now() + 20_000) },
  }));
  setActor(boundedClient);
  await assert.rejects(boundedClient.getMeetingAudio(AUDIO_PATH, RECORD_ID), error =>
    expectHttpError(error, 'INVALID_RESPONSE', 502));

  const changedClient = new HttpApiClient(async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      changedClient.bindExpectedActor({ accountId: 'user-b', contextId: 'context-b' });
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  }), {
    status: 200,
    headers: { 'content-type': 'audio/webm', 'x-projed-expires-at': String(Date.now() + 20_000) },
  }));
  setActor(changedClient);
  await assert.rejects(changedClient.getMeetingAudio(AUDIO_PATH, RECORD_ID), error =>
    expectHttpError(error, 'ACTOR_CHANGED', 409));
});

test('audio HTTP errors retain stable code and status without forwarding details', async () => {
  const client = new HttpApiClient(async () => json({
    error: {
      code: 'REVISION_CONFLICT',
      requestId: 'request-7',
      retryable: false,
      details: { token: 'must-not-escape' },
    },
  }, 409));
  setActor(client);

  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, BODY, SOURCE_VERSION), (error: unknown) => {
    assert.ok(error instanceof HttpApiError);
    assert.equal(error.code, 'REVISION_CONFLICT');
    assert.equal(error.status, 409);
    assert.equal(error.requestId, 'request-7');
    assert.equal(error.details, undefined);
    assert.equal(error.message.includes('must-not-escape'), false);
    return true;
  });
});

test('audio network failures are not automatically retried', async () => {
  let calls = 0;
  const client = new HttpApiClient(async () => {
    calls += 1;
    throw new TypeError('network unavailable');
  });
  setActor(client);
  await assert.rejects(client.putMeetingAudio(AUDIO_PATH, BODY, SOURCE_VERSION), error =>
    expectHttpError(error, 'DEPENDENCY_UNAVAILABLE', 503));
  assert.equal(calls, 1);
});

test('reserve validates scoped IDs and upload URL, sends expected version, and never returns service tokens', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (request, init) => {
    calls.push({ path: String(request), init });
    return json(reserveResponse());
  });
  setActor(client);
  const adapter = createHttpMeetingAudioAdapter(client);
  const payload = {
    captureId: CAPTURE_ID,
    expectedSourceVersion: SOURCE_VERSION,
    segmentIndex: SEGMENT_INDEX,
    mime: BODY.type,
    bytes: BODY.size,
    startOffsetMs: 100,
    endOffsetMs: 200,
  };
  const reservation = await adapter.reserve(payload);
  assert.deepEqual(reservation, {
    segmentId: SEGMENT_ID,
    sourceVersion: SOURCE_VERSION,
    segmentIndex: SEGMENT_INDEX,
    uploadUrl: AUDIO_PATH,
    expiresAt: reservation.expiresAt,
    uploadState: 'pending',
    alreadyVerified: false,
    sha256: null,
    bytes: BODY.size,
  });
  assert.equal('token' in reservation, false);
  assert.equal('signedUrl' in reservation, false);
  assert.equal(calls[0]?.path, '/api/v1/meeting-control');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    operation: 'reserve-segment', ...payload, mime: 'audio/webm',
  });

  for (const invalidPayload of [
    { ...payload, captureId: 'not-a-uuid' },
    { ...payload, expectedSourceVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...payload, segmentIndex: 4096 },
    { ...payload, uploadUrl: 'https://storage.example/signed' },
  ]) {
    await assert.rejects(adapter.reserve(invalidPayload as never), error =>
      expectHttpError(error, 'INVALID_MEETING_AUDIO_REQUEST', 400));
  }
  assert.equal(calls.length, 1);
});

test('reserve accepts the inclusive source-version and segment-index limits', async () => {
  const maxVersion = 2_147_483_647;
  const maxIndex = 4095;
  const client = new HttpApiClient(async () => json(reserveResponse({
    sourceVersion: maxVersion,
    segmentIndex: maxIndex,
    path: `${TENANT_ID}/${PROJECT_ID}/${RECORD_ID}/${CAPTURE_ID}/v${maxVersion}/${maxIndex}.mp3`,
  })));
  setActor(client);
  const result = await createHttpMeetingAudioAdapter(client).reserve({
    captureId: CAPTURE_ID,
    expectedSourceVersion: maxVersion,
    segmentIndex: maxIndex,
    mime: 'audio/mpeg',
  });
  assert.equal(result.sourceVersion, maxVersion);
  assert.equal(result.segmentIndex, maxIndex);
});

test('reserve rejects remote upload URLs and nonnull operation tokens without exposing them', async () => {
  for (const override of [
    { uploadUrl: 'https://storage.example/signed-upload' },
    { token: 'cleanup-operation-secret' },
    { signedUrl: 'https://storage.example/signed-upload' },
  ]) {
    const client = new HttpApiClient(async () => json(reserveResponse(override)));
    setActor(client);
    await assert.rejects(createHttpMeetingAudioAdapter(client).reserve({
      captureId: CAPTURE_ID,
      expectedSourceVersion: SOURCE_VERSION,
      segmentIndex: SEGMENT_INDEX,
      mime: 'audio/webm',
    }), (error: unknown) => {
      assert.ok(error instanceof HttpApiError);
      assert.equal(error.code, 'INVALID_MEETING_AUDIO_RESPONSE');
      assert.equal(error.message.includes('cleanup-operation-secret'), false);
      return true;
    });
  }
});

test('meeting-control stale-source errors preserve code/status without exposing error details', async () => {
  const client = new HttpApiClient(async () => json({
    error: {
      code: 'REVISION_CONFLICT',
      requestId: 'stale-source-7',
      retryable: false,
      details: { token: 'must-not-escape' },
    },
  }, 409));
  setActor(client);
  await assert.rejects(createHttpMeetingAudioAdapter(client).reserve({
    captureId: CAPTURE_ID,
    expectedSourceVersion: SOURCE_VERSION,
    segmentIndex: SEGMENT_INDEX,
    mime: 'audio/webm',
  }), (error: unknown) => {
    assert.ok(error instanceof HttpApiError);
    assert.equal(error.code, 'REVISION_CONFLICT');
    assert.equal(error.status, 409);
    assert.equal(error.requestId, 'stale-source-7');
    assert.equal(error.details, undefined);
    assert.equal(error.message.includes('must-not-escape'), false);
    return true;
  });
});

test('upload and verify parse the scoped data.segment DTO and preserve one-shot stale errors', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (request, init) => {
    calls.push({ path: String(request), init });
    if (init?.method === 'PUT') return json(segmentResponse());
    return json(segmentResponse());
  });
  setActor(client);
  const adapter = createHttpMeetingAudioAdapter(client);
  const uploadResult = await adapter.upload({ segmentId: SEGMENT_ID, uploadUrl: AUDIO_PATH, sourceVersion: SOURCE_VERSION }, BODY);
  assert.deepEqual(uploadResult, {
    id: SEGMENT_ID,
    segmentIndex: SEGMENT_INDEX,
    sourceVersion: SOURCE_VERSION,
    bytes: BODY.size,
    sha256: SHA256,
    uploadState: 'verified',
  });
  assert.equal(calls[0]?.path, AUDIO_PATH);
  assert.equal(calls[0]?.init?.body, BODY);

  calls.length = 0;
  const verifyResult = await adapter.verify({
    captureId: CAPTURE_ID,
    expectedSourceVersion: SOURCE_VERSION,
    segmentIndex: SEGMENT_INDEX,
  });
  assert.deepEqual(verifyResult, uploadResult);
  assert.equal(calls[0]?.path, '/api/v1/meeting-control');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    operation: 'verify-segment', captureId: CAPTURE_ID,
    expectedSourceVersion: SOURCE_VERSION, segmentIndex: SEGMENT_INDEX,
  });

  await assert.rejects(adapter.upload({
    segmentId: SEGMENT_ID,
    uploadUrl: 'https://storage.example/upload',
    sourceVersion: SOURCE_VERSION,
  }, BODY), error => expectHttpError(error, 'INVALID_MEETING_AUDIO_REQUEST', 400));
});

test('playback uses record-bound GET and returns only segment ID, blob, and expiry', async () => {
  const expiry = Date.now() + 10_000;
  const client = new HttpApiClient(async (_request, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-projed-record-id'), 'record-legacy-8');
    return new Response(new Blob([new Uint8Array([5, 6])], { type: 'audio/webm' }), {
      status: 200,
      headers: { 'content-type': 'audio/webm', 'x-projed-expires-at': String(expiry) },
    });
  });
  setActor(client);
  const playback = await createHttpMeetingAudioAdapter(client).playback('record-legacy-8', SEGMENT_ID);
  assert.equal(playback.segmentId, SEGMENT_ID);
  assert.equal(playback.blob.size, 2);
  assert.equal(playback.expiresAt, expiry);
  assert.equal(Object.keys(playback).sort().join(','), 'blob,expiresAt,segmentId');
});

test('audio body must match a declared content length before returning a Blob',async()=>{
  const client=new HttpApiClient(async()=>new Response(new Uint8Array([1,2]),{status:200,headers:{
    'content-type':'audio/webm','content-length':'3','x-projed-expires-at':String(Date.now()+10_000),
  }}));
  setActor(client);
  await assert.rejects(client.getMeetingAudio(AUDIO_PATH,RECORD_ID),error=>expectHttpError(error,'INVALID_RESPONSE',502));
});
