import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

import { KernelError } from './errors.js';

export type SessionCookieEnvironment = 'production' | 'development' | 'test';

/** Structural subset of node:http IncomingMessage; no Host-derived authority. */
export interface SessionCookieRequest {
  readonly headers: { readonly cookie?: string };
}

export interface SessionCookieTokens {
  readonly sessionToken?: string;
  readonly loginToken?: string;
}

export interface SessionCookieContext {
  readonly environment: SessionCookieEnvironment;
  /** Exact configured public origin for this app; never inferred from Host. */
  readonly publicOrigin: string;
}

export interface SetSessionCookieInput extends SessionCookieContext {
  readonly sessionToken?: string;
  /** A random, opaque browser-binding nonce only; never PKCE, state, or a bearer. */
  readonly loginToken?: string;
  readonly expiresAtMs: number;
  /** Hard cap from the upstream source Session when a local Session is present. */
  readonly sourceSessionExpiresAtMs?: number;
  readonly nowMs?: number;
}

const COOKIE_NAME = '__session';
const ENVELOPE_VERSION = 'v1';
const OPAQUE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/u;
const COOKIE_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const SET_INPUT_KEYS = [
  'sessionToken', 'loginToken', 'expiresAtMs', 'sourceSessionExpiresAtMs', 'nowMs', 'environment', 'publicOrigin',
] as const;

function invalidIdentity(): never {
  throw new KernelError('IDENTITY_INVALID', 'Session cookie is invalid or expired', 401);
}

function invalidConfig(): never {
  throw new KernelError('CONFIG_INVALID', 'Session cookie configuration is invalid', 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key));
}

function validOpaqueToken(value: unknown): boolean {
  if (typeof value !== 'string' || !OPAQUE_TOKEN_RE.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.byteLength === 32 && decoded.toString('base64url') === value;
  } catch {
    return false;
  }
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (host === 'localhost' || (isIP(host) === 6 && host === '::1')) return true;
  if (isIP(host) !== 4) return false;
  return Number(host.split('.', 1)[0]) === 127;
}

function secureAttribute(context: SessionCookieContext): boolean {
  if ((context.environment !== 'production' && context.environment !== 'development' && context.environment !== 'test')
      || typeof context.publicOrigin !== 'string') invalidConfig();
  let origin: URL;
  try {
    origin = new URL(context.publicOrigin);
  } catch {
    invalidConfig();
  }
  if (origin.origin !== context.publicOrigin || origin.username !== '' || origin.password !== ''
      || origin.search !== '' || origin.hash !== '' || origin.pathname !== '/') invalidConfig();
  if (origin.protocol === 'https:') return true;
  if (context.environment !== 'production' && origin.protocol === 'http:' && isLoopback(origin.hostname)) return false;
  invalidConfig();
}

function cookieValue(tokens: SessionCookieTokens): string {
  const sessionToken = tokens.sessionToken;
  const loginToken = tokens.loginToken;
  if (sessionToken !== undefined && !validOpaqueToken(sessionToken)) invalidIdentity();
  if (loginToken !== undefined && !validOpaqueToken(loginToken)) invalidIdentity();
  if (sessionToken === undefined && loginToken === undefined) invalidIdentity();
  if (sessionToken !== undefined && loginToken !== undefined) {
    if (sessionToken === loginToken) invalidIdentity();
    return `${ENVELOPE_VERSION}.${sessionToken}.${loginToken}`;
  }
  if (loginToken !== undefined) return `${ENVELOPE_VERSION}..${loginToken}`;
  return sessionToken!;
}

function parseCookieValue(value: string): SessionCookieTokens {
  if (validOpaqueToken(value)) return Object.freeze({ sessionToken: value });
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) invalidIdentity();
  const sessionToken = parts[1] === '' ? undefined : parts[1];
  const loginToken = parts[2];
  if ((sessionToken !== undefined && !validOpaqueToken(sessionToken)) || !validOpaqueToken(loginToken)
      || (sessionToken !== undefined && sessionToken === loginToken)) invalidIdentity();
  return Object.freeze({ ...(sessionToken ? { sessionToken } : {}), loginToken });
}

function maxAgeSeconds(input: SetSessionCookieInput): number {
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs < 0) {
    invalidIdentity();
  }
  if (input.sessionToken !== undefined && input.sourceSessionExpiresAtMs === undefined) invalidIdentity();
  if (input.sourceSessionExpiresAtMs !== undefined
      && (!Number.isSafeInteger(input.sourceSessionExpiresAtMs) || input.sourceSessionExpiresAtMs < 0)) invalidIdentity();
  const effectiveExpiry = Math.min(input.expiresAtMs, input.sourceSessionExpiresAtMs ?? input.expiresAtMs);
  const remainingMs = effectiveExpiry - nowMs;
  if (!Number.isSafeInteger(remainingMs) || remainingMs <= 0) invalidIdentity();
  const seconds = Math.floor(remainingMs / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 1) invalidIdentity();
  return seconds;
}

function attributes(secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Returns a host-only Hosting-compatible Set-Cookie value. App entry and
 * Principal binding remain server/store responsibilities, never cookie claims.
 */
export function setSessionCookie(input: SetSessionCookieInput): string {
  if (!isRecord(input as unknown as Record<string, unknown>) || !hasOnlyKeys(input as unknown as Record<string, unknown>, SET_INPUT_KEYS)) {
    invalidIdentity();
  }
  const secure = secureAttribute(input);
  const value = cookieValue({ sessionToken: input.sessionToken, loginToken: input.loginToken });
  const maxAge = maxAgeSeconds(input);
  return `${COOKIE_NAME}=${value}; ${attributes(secure)}; Max-Age=${maxAge}`;
}

/** Returns a clearing cookie with the same host-only path/security scope. */
export function clearSessionCookie(context: SessionCookieContext): string {
  if (!isRecord(context as unknown as Record<string, unknown>)
      || !hasOnlyKeys(context as unknown as Record<string, unknown>, ['environment', 'publicOrigin'])) invalidConfig();
  const secure = secureAttribute(context);
  return `${COOKIE_NAME}=; ${attributes(secure)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Reads only request.headers.cookie and returns opaque tokens for store lookup. */
export function parseSessionCookie(request: SessionCookieRequest): SessionCookieTokens {
  const header = request.headers.cookie;
  if (header === undefined || header === '') return Object.freeze({});
  if (typeof header !== 'string') invalidIdentity();
  if (/[\u0000-\u001f\u007f,]/u.test(header)) invalidIdentity();

  let session: SessionCookieTokens | undefined;
  for (const rawPart of header.split(';')) {
    const part = rawPart.trimStart();
    if (part.trim() === '') continue;
    const equalsAt = part.indexOf('=');
    if (equalsAt <= 0) invalidIdentity();
    const name = part.slice(0, equalsAt);
    const value = part.slice(equalsAt + 1);
    if (!COOKIE_NAME_RE.test(name)) invalidIdentity();
    if (name !== COOKIE_NAME) continue;
    if (session !== undefined) invalidIdentity();
    session = parseCookieValue(value);
  }
  return session ?? Object.freeze({});
}
