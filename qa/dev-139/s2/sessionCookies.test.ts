import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { KernelError } from '../../../server/errors.js';
import {
  clearSessionCookie,
  parseSessionCookie,
  setSessionCookie,
  type SessionCookieContext,
  type SessionCookieRequest,
} from '../../../server/sessionCookies.js';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const SESSION = Buffer.alloc(32, 1).toString('base64url');
const LOGIN = Buffer.alloc(32, 2).toString('base64url');
const PROD: SessionCookieContext = { environment: 'production', publicOrigin: 'https://projed.example.test' };

function expectCode(action: () => unknown, code: string) {
  assert.throws(action, (error: unknown) => error instanceof KernelError && error.code === code);
}

function request(cookie?: string, options: { url?: string; headers?: Record<string, string>; body?: string } = {}): SessionCookieRequest {
  const native = {
    headers: { ...options.headers, ...(cookie === undefined ? {} : { cookie }) },
    url: options.url,
    body: options.body,
  };
  return native;
}

test('legacy opaque Session cookie and versioned pending login decode to only the two opaque tokens', () => {
  assert.deepEqual(parseSessionCookie(request(`__session=${SESSION}`)), { sessionToken: SESSION });
  assert.deepEqual(parseSessionCookie(request(`__session=v1.${SESSION}.${LOGIN}`)), { sessionToken: SESSION, loginToken: LOGIN });
  assert.deepEqual(parseSessionCookie(request(`__session=v1..${LOGIN}`)), { loginToken: LOGIN });
  assert.deepEqual(parseSessionCookie(request()), {});
});

test('starting and cancelling login preserves the existing opaque Session token', () => {
  const original = setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    expiresAtMs: NOW + 30_000,
    sourceSessionExpiresAtMs: NOW + 60_000,
    nowMs: NOW,
  });
  const pending = setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    loginToken: LOGIN,
    expiresAtMs: NOW + 8_000,
    sourceSessionExpiresAtMs: NOW + 60_000,
    nowMs: NOW,
  });
  assert.deepEqual(parseSessionCookie(request(original.split(';', 1)[0])), { sessionToken: SESSION });
  assert.deepEqual(parseSessionCookie(request(pending.split(';', 1)[0])), { sessionToken: SESSION, loginToken: LOGIN });

  const cancelled = setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    expiresAtMs: NOW + 30_000,
    sourceSessionExpiresAtMs: NOW + 60_000,
    nowMs: NOW,
  });
  assert.equal(cancelled, original);
  assert.deepEqual(parseSessionCookie(request(cancelled.split(';', 1)[0])), { sessionToken: SESSION });
});

test('duplicate __session cookies fail closed even when both values match', () => {
  expectCode(() => parseSessionCookie(request(`__session=${SESSION}; __session=${SESSION}`)), 'IDENTITY_INVALID');
  expectCode(() => parseSessionCookie(request(`__session=${SESSION}; __session=${LOGIN}`)), 'IDENTITY_INVALID');
});

test('percent, malformed version, invalid alphabet and noncanonical opaque tokens are rejected', () => {
  for (const value of [
    `${SESSION}%2E${LOGIN}`,
    `v2.${SESSION}.${LOGIN}`,
    `v1.${SESSION}.bad%token`,
    `v1.${SESSION}.` + 'B'.repeat(43),
    `${SESSION}+`,
    'A'.repeat(42) + 'B',
  ]) {
    expectCode(() => parseSessionCookie(request(`__session=${value}`)), 'IDENTITY_INVALID');
  }
  expectCode(() => parseSessionCookie(request(`__session =${SESSION}`)), 'IDENTITY_INVALID');
  const trailingSpace = { headers: { cookie: `__session=${SESSION} ` } };
  expectCode(() => parseSessionCookie(trailingSpace), 'IDENTITY_INVALID');
  expectCode(() => parseSessionCookie({ headers: { cookie: [SESSION] } } as never), 'IDENTITY_INVALID');
});

test('Cookie claims from URL, body, Authorization and other headers are ignored', () => {
  const forged = request(undefined, {
    url: 'https://projed.example.test/api/v1/session?sessionToken=attacker&principalId=forged',
    headers: {
      authorization: `Bearer ${SESSION}`,
      'x-principal-id': 'forged-principal',
      'x-session-token': SESSION,
    },
    body: JSON.stringify({ sessionToken: SESSION, principalId: 'forged-principal' }),
  });
  assert.deepEqual(parseSessionCookie(forged), {});

  const cookieOnly = request(`__session=${SESSION}`, {
    url: 'https://projed.example.test/api/v1/session?principalId=forged',
    headers: { authorization: 'Bearer another-token', 'x-principal-id': 'forged-principal' },
  });
  assert.deepEqual(parseSessionCookie(cookieOnly), { sessionToken: SESSION });
});

test('Set-Cookie uses host-only HttpOnly SameSite Lax scope and Secure in production', () => {
  const cookie = setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    expiresAtMs: NOW + 15_900,
    sourceSessionExpiresAtMs: NOW + 60_000,
    nowMs: NOW,
  });
  assert.equal(cookie, `__session=${SESSION}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=15`);
  assert.doesNotMatch(cookie, /(?:^|;\s*)Domain=/iu);
});

test('Max-Age floors expiry delta and is capped by the source Session expiry', () => {
  const cookie = setSessionCookie({
    ...PROD,
    loginToken: LOGIN,
    expiresAtMs: NOW + 15_900,
    sourceSessionExpiresAtMs: NOW + 7_999,
    nowMs: NOW,
  });
  assert.match(cookie, /; Max-Age=7$/u);
  expectCode(() => setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    expiresAtMs: NOW + 60_000,
    sourceSessionExpiresAtMs: NOW + 999,
    nowMs: NOW,
  }), 'IDENTITY_INVALID');
});

test('clear cookie expires the same host-only path and preserves production Secure', () => {
  const cookie = clearSessionCookie(PROD);
  assert.equal(cookie, '__session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  assert.doesNotMatch(cookie, /(?:^|;\s*)Domain=/iu);
});

test('HTTP is limited to explicit loopback development/test and Secure remains enabled on HTTPS', () => {
  const localHttp = setSessionCookie({
    environment: 'development',
    publicOrigin: 'http://127.0.0.1:8080',
    loginToken: LOGIN,
    expiresAtMs: NOW + 10_000,
    nowMs: NOW,
  });
  assert.match(localHttp, /; HttpOnly; SameSite=Lax; Max-Age=10$/u);
  assert.doesNotMatch(localHttp, /; Secure(?:;|$)/u);

  const devHttps = setSessionCookie({
    environment: 'test',
    publicOrigin: 'https://localhost:4173',
    sessionToken: SESSION,
    expiresAtMs: NOW + 10_000,
    sourceSessionExpiresAtMs: NOW + 20_000,
    nowMs: NOW,
  });
  assert.match(devHttps, /; SameSite=Lax; Secure; Max-Age=10$/u);
  expectCode(() => setSessionCookie({
    environment: 'production',
    publicOrigin: 'http://127.0.0.1:8080',
    sessionToken: SESSION,
    expiresAtMs: NOW + 10_000,
    sourceSessionExpiresAtMs: NOW + 20_000,
    nowMs: NOW,
  }), 'CONFIG_INVALID');
  expectCode(() => setSessionCookie({
    environment: 'test',
    publicOrigin: 'http://example.test',
    loginToken: LOGIN,
    expiresAtMs: NOW + 10_000,
    nowMs: NOW,
  }), 'CONFIG_INVALID');
});

test('setter rejects nonopaque or self-describing caller fields', () => {
  expectCode(() => setSessionCookie({
    ...PROD,
    sessionToken: `principalId=${SESSION}`,
    expiresAtMs: NOW + 10_000,
    sourceSessionExpiresAtMs: NOW + 20_000,
    nowMs: NOW,
  }), 'IDENTITY_INVALID');
  expectCode(() => setSessionCookie({
    ...PROD,
    sessionToken: SESSION,
    principalId: 'forged-principal',
    expiresAtMs: NOW + 10_000,
    sourceSessionExpiresAtMs: NOW + 20_000,
    nowMs: NOW,
  } as never), 'IDENTITY_INVALID');
});
