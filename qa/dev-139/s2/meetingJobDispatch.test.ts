import assert from 'node:assert/strict';
import test from 'node:test';

import { createMeetingJobDispatcher, type MeetingJobDispatchOptions } from '../../../server/meetingJobDispatch.js';
import { KernelError } from '../../../server/errors.js';
import { CURRENT_MEETING_JOB_BINDING, MEETING_ANALYSIS_JOB_RESOURCE,
  type MeetingJobRuntimeBinding } from '../../../server/meetingJobRuntimeBinding.js';

const TOKEN = 'fixture.oauth.token';
const OPERATION = 'projects/projed-cc78d/locations/asia-east1/operations/exec-123';
const ENDPOINT = 'https://run.googleapis.com/v2/projects/projed-cc78d/locations/asia-east1/jobs/projed-meeting-analysis:run';
const BINDING: MeetingJobRuntimeBinding = {
  resource: MEETING_ANALYSIS_JOB_RESOURCE,
  qualificationEvidenceRef: 'qualification/meeting-job-invocation-v1',
};

type FetchInput = Parameters<typeof fetch>[0];
interface RecordedRequest { readonly url: string; readonly init: RequestInit; }

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function options(fetchImpl: typeof fetch, extra: Partial<MeetingJobDispatchOptions> = {}): MeetingJobDispatchOptions {
  return { getAccessToken: async () => TOKEN, fetchImpl, ...extra };
}

function scriptedFetch(responses: readonly (() => Response | Promise<Response>)[]): {
  readonly fetchImpl: typeof fetch;
  readonly requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(input), init: init ?? {} });
    const next = responses[requests.length - 1];
    if (!next) throw new Error('unexpected job dispatch request');
    return next();
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('null binding does no token or request work; invalid qualification target is rejected', async () => {
  assert.equal(CURRENT_MEETING_JOB_BINDING, null);
  let tokenCalls = 0;
  let requestCalls = 0;
  const dispatch = createMeetingJobDispatcher(null, {
    getAccessToken: async () => { tokenCalls++; return TOKEN; },
    fetchImpl: (async () => { requestCalls++; return jsonResponse({ name: OPERATION }); }) as typeof fetch,
  });

  assert.equal(dispatch, undefined);
  assert.equal(tokenCalls, 0);
  assert.equal(requestCalls, 0);
  assert.throws(() => createMeetingJobDispatcher({ ...BINDING, resource: `${BINDING.resource}-other` },
    options(fetch)), (error: unknown) => error instanceof KernelError && error.code === 'CONFIG_INVALID');
  assert.throws(() => createMeetingJobDispatcher({ ...BINDING, qualificationEvidenceRef: '  ' },
    options(fetch)), (error: unknown) => error instanceof KernelError && error.code === 'CONFIG_INVALID');
});

test('uses one fixed POST without overrides and returns only a bounded matching Operation name', async () => {
  const fake = scriptedFetch([() => jsonResponse({ name: OPERATION, metadata: { ignored: true } })]);
  const dispatch = createMeetingJobDispatcher(BINDING, options(fake.fetchImpl));
  assert.ok(dispatch);

  const result = await dispatch.run();
  assert.deepEqual(result, { kind: 'accepted', operationName: OPERATION });
  assert.equal(fake.requests.length, 1);
  const request = fake.requests[0]!;
  assert.equal(request.url, ENDPOINT);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.body, '{}');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.credentials, 'omit');
  assert.ok(request.init.signal instanceof AbortSignal);
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(headers.get('x-goog-user-project'), 'projed-cc78d');
  assert.equal(headers.get('accept'), 'application/json');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(request.init.body)), {});
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('abort or timeout while waiting for a token is not_sent and a late token cannot POST', async () => {
  const delayedToken = deferred<string>();
  const fake = scriptedFetch([]);
  let tokenCalls = 0;
  const dispatch = createMeetingJobDispatcher(BINDING, {
    getAccessToken: () => { tokenCalls++; return delayedToken.promise; }, fetchImpl: fake.fetchImpl, timeoutMs: 100,
  });
  assert.ok(dispatch);
  const controller = new AbortController();
  const pending = dispatch.run(controller.signal);
  controller.abort();
  assert.deepEqual(await pending, { kind: 'not_sent' });
  delayedToken.resolve(TOKEN);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tokenCalls, 1);
  assert.equal(fake.requests.length, 0);

  const lateTimeoutToken = deferred<string>();
  const timed = createMeetingJobDispatcher(BINDING, {
    getAccessToken: () => lateTimeoutToken.promise, fetchImpl: fake.fetchImpl, timeoutMs: 10,
  });
  assert.ok(timed);
  assert.deepEqual(await timed.run(), { kind: 'not_sent' });
  lateTimeoutToken.resolve(TOKEN);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.requests.length, 0);
});

test('classifies definite 4xx as rejected but 503 and transport failure as unknown without retries', async () => {
  for (const status of [400, 403, 429]) {
    const fake = scriptedFetch([() => new Response('private response text', { status })]);
    const dispatch = createMeetingJobDispatcher(BINDING, options(fake.fetchImpl));
    assert.ok(dispatch);
    assert.deepEqual(await dispatch.run(), { kind: 'rejected', httpStatus: status });
    assert.equal(fake.requests.length, 1);
  }

  const unavailable = scriptedFetch([() => new Response('private response text', { status: 503 })]);
  const unavailableDispatch = createMeetingJobDispatcher(BINDING, options(unavailable.fetchImpl));
  assert.ok(unavailableDispatch);
  assert.deepEqual(await unavailableDispatch.run(), { kind: 'unknown' });
  assert.equal(unavailable.requests.length, 1);

  const transport = scriptedFetch([() => Promise.reject(new Error('private transport detail'))]);
  const transportDispatch = createMeetingJobDispatcher(BINDING, options(transport.fetchImpl));
  assert.ok(transportDispatch);
  assert.deepEqual(await transportDispatch.run(), { kind: 'unknown' });
  assert.equal(transport.requests.length, 1);
});

test('invalid or oversized success bodies stay unknown and never leak their contents', async () => {
  const oversized = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(128 * 1024 + 1));
      controller.close();
    },
  }), { status: 200 });
  const responses = [
    () => jsonResponse({ name: 'projects/other/locations/asia-east1/operations/exec-123' }),
    () => jsonResponse({ name: 'projects/projed-cc78d/locations/us-central1/operations/exec-123' }),
    () => new Response('private body that is not JSON', { status: 200 }),
    () => oversized,
  ];
  for (const response of responses) {
    const fake = scriptedFetch([response]);
    const dispatch = createMeetingJobDispatcher(BINDING, options(fake.fetchImpl));
    assert.ok(dispatch);
    const result = await dispatch.run();
    assert.deepEqual(result, { kind: 'unknown' });
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(fake.requests.length, 1);
  }
});

test('timeout or abort after POST start returns unknown and sends only once', async () => {
  const hangingFetch = scriptedFetch([() => new Promise<Response>(() => undefined)]);
  const timed = createMeetingJobDispatcher(BINDING, options(hangingFetch.fetchImpl, { timeoutMs: 15 }));
  assert.ok(timed);
  assert.deepEqual(await timed.run(), { kind: 'unknown' });
  assert.equal(hangingFetch.requests.length, 1);

  let responseCancelled = false;
  const hangingBody = new Response(new ReadableStream<Uint8Array>({
    pull() { return new Promise<void>(() => undefined); },
    cancel() { responseCancelled = true; },
  }), { status: 200 });
  const bodyFetch = scriptedFetch([() => hangingBody]);
  const bodyTimed = createMeetingJobDispatcher(BINDING, options(bodyFetch.fetchImpl, { timeoutMs: 15 }));
  assert.ok(bodyTimed);
  assert.deepEqual(await bodyTimed.run(), { kind: 'unknown' });
  assert.equal(responseCancelled, true);
  assert.equal(bodyFetch.requests.length, 1);

  const abortedFetch = scriptedFetch([() => new Promise<Response>(() => undefined)]);
  const dispatch = createMeetingJobDispatcher(BINDING, options(abortedFetch.fetchImpl));
  assert.ok(dispatch);
  const controller = new AbortController();
  const pending = dispatch.run(controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.deepEqual(await pending, { kind: 'unknown' });
  assert.equal(abortedFetch.requests.length, 1);
});
