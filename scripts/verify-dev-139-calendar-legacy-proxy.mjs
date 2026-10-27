import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proxyLegacyCalendarFeed } from '../supabase/functions/calendar-feed/compatibilityProxy.mjs';

const token = 'a'.repeat(43);
const expectedTarget = `https://projed-api.example/api/v1/calendar-feeds/${token}.ics`;

let calls = 0;
assert.equal(await proxyLegacyCalendarFeed({
  configuredOrigin: '',
  token,
  fetchImpl: async () => {
    calls += 1;
    return new Response();
  },
}), null);
assert.equal(calls, 0, 'unset proxy config must preserve the legacy data path');

let malformedTokenFetches = 0;
const malformedTokenResponse = await proxyLegacyCalendarFeed({
  configuredOrigin: 'https://projed-api.example',
  token: 'secret/token?not-a-query',
  fetchImpl: async () => {
    malformedTokenFetches += 1;
    return new Response();
  },
});
assert.equal(malformedTokenResponse.status, 404);
assert.equal(malformedTokenFetches, 0, 'malformed token must be rejected before fetch');

let captured;
const success = await proxyLegacyCalendarFeed({
  configuredOrigin: 'https://projed-api.example/',
  token,
  fetchImpl: async (url, init) => {
    captured = { url, init };
    return new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        Authorization: 'must-not-pass-through',
        'Set-Cookie': 'must-not-pass-through',
      },
    });
  },
});
assert.equal(captured.url, expectedTarget);
assert.deepEqual(captured.init.headers, { Accept: 'text/calendar' });
assert.equal(captured.init.redirect, 'error');
assert.equal(success.status, 200);
assert.equal(success.headers.get('content-type'), 'text/calendar; charset=utf-8');
assert.equal(success.headers.get('cache-control'), 'no-store');
assert.equal(success.headers.get('authorization'), null);
assert.equal(success.headers.get('set-cookie'), null);
assert.match(await success.text(), /BEGIN:VCALENDAR/);

for (const [upstreamStatus, expectedStatus, expectedBody] of [
  [404, 404, 'Calendar feed not found'],
  [410, 410, 'Calendar feed is disabled'],
  [302, 503, 'Calendar feed temporarily unavailable'],
  [500, 503, 'Calendar feed temporarily unavailable'],
]) {
  const response = await proxyLegacyCalendarFeed({
    configuredOrigin: 'https://projed-api.example',
    token,
    fetchImpl: async () => new Response(`upstream body includes ${token}`, { status: upstreamStatus }),
  });
  assert.equal(response.status, expectedStatus);
  assert.equal(await response.text(), expectedBody);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

const wrongContentType = await proxyLegacyCalendarFeed({
  configuredOrigin: 'https://projed-api.example',
  token,
  fetchImpl: async () => new Response(`not calendar ${token}`, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  }),
});
assert.equal(wrongContentType.status, 503);
assert.doesNotMatch(await wrongContentType.text(), new RegExp(token));

for (const configuredOrigin of [
  'http://projed-api.example',
  'https://user:password@projed-api.example',
  'https://projed-api.example/base',
  'https://projed-api.example?target=other',
  'https://projed-api.example#fragment',
  'not a URL',
]) {
  let invalidConfigFetches = 0;
  const response = await proxyLegacyCalendarFeed({
    configuredOrigin,
    token,
    fetchImpl: async () => {
      invalidConfigFetches += 1;
      return new Response();
    },
  });
  assert.equal(response.status, 503);
  assert.equal(invalidConfigFetches, 0, `invalid origin must not fetch: ${configuredOrigin}`);
  assert.doesNotMatch(await response.text(), new RegExp(token));
}

let timeoutSignal;
const timeoutResponse = await proxyLegacyCalendarFeed({
  configuredOrigin: 'https://projed-api.example',
  token,
  timeoutMs: 5,
  fetchImpl: async (_url, init) => {
    timeoutSignal = init.signal;
    await new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error(`aborted ${token}`)), { once: true });
    });
  },
});
assert.equal(timeoutResponse.status, 503);
assert.equal(timeoutSignal.aborted, true);
assert.equal(await timeoutResponse.text(), 'Calendar feed temporarily unavailable');

const edgeSource = fs.readFileSync('supabase/functions/calendar-feed/index.ts', 'utf8');
const proxySource = fs.readFileSync('supabase/functions/calendar-feed/compatibilityProxy.mjs', 'utf8');
const extractionIndex = edgeSource.indexOf('const token = extractToken(req)');
const proxyIndex = edgeSource.indexOf('await proxyLegacyCalendarFeed');
const legacyHashIndex = edgeSource.indexOf('const tokenHash = await hashString(token)');
assert.ok(extractionIndex >= 0 && extractionIndex < proxyIndex && proxyIndex < legacyHashIndex,
  'compatibility proxy must run after token extraction and before the legacy database path');
assert.match(edgeSource, /PROJED_CALENDAR_FEED_PROXY_ORIGIN/);
assert.ok(edgeSource.indexOf('initializeLegacySupabase();') > proxyIndex,
  'proxy-only mode must not initialize the legacy Supabase client');
assert.doesNotMatch(
  edgeSource,
  /const supabase = createClient/,
  'the legacy privileged client must not be created at module load',
);
assert.doesNotMatch(proxySource, /console\./, 'proxy failures must not log bearer-token URLs');

console.log('verify:dev-139-calendar-legacy-proxy passed');
