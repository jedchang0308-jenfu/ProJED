import type { FirestoreUser } from '../../types';
import { HttpApiClient } from './httpApiClient';

export interface HttpSessionProfile extends FirestoreUser {
  expiresAt: number;
  authContextId: string;
  entry: 'main' | 'quick';
}

export type ProjedAppEntry = 'main' | 'quick';

export interface ProjedSessionAdapter {
  getSession(signal?: AbortSignal): Promise<HttpSessionProfile>;
  startLogin(entry: ProjedAppEntry, returnPath?: string, signal?: AbortSignal): Promise<string>;
  updateDisplayName(displayName: string, signal?: AbortSignal): Promise<HttpSessionProfile>;
  logout(signal?: AbortSignal): Promise<void>;
}

const LOGIN_URL_QUERY_KEYS = [
  'client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state',
] as const;

function currentOrigin(): string {
  if (typeof window === 'undefined') throw new Error('HTTP_API_LOGIN_ORIGIN_UNAVAILABLE');
  return window.location.origin;
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(host);
}

function parseReturnPath(value: string, origin: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048
      || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
      || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('HTTP_API_INVALID_LOGIN_RETURN_PATH');
  }
  let parsed: URL;
  try { parsed = new URL(value, origin); }
  catch { throw new Error('HTTP_API_INVALID_LOGIN_RETURN_PATH'); }
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash) {
    throw new Error('HTTP_API_INVALID_LOGIN_RETURN_PATH');
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function validateLoginAuthorizationUrl(value: unknown, appOrigin: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) {
    throw new Error('HTTP_API_INVALID_LOGIN_URL');
  }
  let app: URL;
  let authorization: URL;
  try {
    app = new URL(appOrigin);
    authorization = new URL(value);
  } catch {
    throw new Error('HTTP_API_INVALID_LOGIN_URL');
  }
  const secureTransport = authorization.protocol === 'https:'
    || (authorization.protocol === 'http:' && app.protocol === 'http:'
      && isLoopback(app.hostname) && isLoopback(authorization.hostname));
  const queryKeys = [...authorization.searchParams.keys()];
  const exactQuery = queryKeys.length === LOGIN_URL_QUERY_KEYS.length
    && LOGIN_URL_QUERY_KEYS.every(key => authorization.searchParams.getAll(key).length === 1)
    && queryKeys.every(key => (LOGIN_URL_QUERY_KEYS as readonly string[]).includes(key));
  const state = authorization.searchParams.get('state') ?? '';
  const challenge = authorization.searchParams.get('code_challenge') ?? '';
  const redirectUri = authorization.searchParams.get('redirect_uri') ?? '';
  let callback: URL | null = null;
  try { callback = new URL(redirectUri); }
  catch { /* Checked below. */ }

  if (!secureTransport || authorization.username || authorization.password || authorization.hash
      || authorization.pathname !== '/api/sso/authorize' || !exactQuery
      || authorization.searchParams.get('client_id') !== 'projed'
      || authorization.searchParams.get('response_type') !== 'code'
      || authorization.searchParams.get('code_challenge_method') !== 'S256'
      || !/^[A-Za-z0-9_-]{43,128}$/u.test(state)
      || !/^[A-Za-z0-9_-]{43}$/u.test(challenge)
      || !callback || callback.origin !== app.origin || callback.pathname !== '/api/auth/jenfu-sso/callback'
      || callback.username || callback.password || callback.search || callback.hash) {
    throw new Error('HTTP_API_INVALID_LOGIN_URL');
  }
  return authorization.toString();
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function parseSession(value: unknown): HttpSessionProfile {
  const envelope = record(value, 'SESSION_ENVELOPE');
  const data = record(envelope.data, 'SESSION_DATA');
  if (typeof data.localUserId !== 'string' || data.localUserId === ''
      || (data.email !== null && typeof data.email !== 'string')
      || (data.displayName !== null && typeof data.displayName !== 'string')
      || !Number.isSafeInteger(data.createdAt) || Number(data.createdAt) < 0
      || !Number.isSafeInteger(data.expiresAt) || Number(data.expiresAt) <= Date.now()
      || typeof data.authContextId !== 'string' || data.authContextId === ''
      || (data.entry !== 'main' && data.entry !== 'quick')) {
    throw new Error('HTTP_API_INVALID_SESSION_DATA');
  }
  return {
    uid: data.localUserId,
    email: data.email,
    displayName: data.displayName,
    createdAt: Number(data.createdAt),
    expiresAt: Number(data.expiresAt),
    authContextId: data.authContextId,
    entry: data.entry,
  };
}

export function createHttpSessionAdapter(client: HttpApiClient): ProjedSessionAdapter {
  return {
    async getSession(signal) {
      try {
        const session = parseSession(await client.request<unknown>('/api/v1/session', { signal }));
        client.bindExpectedActor({ accountId: session.uid, contextId: session.authContextId });
        return session;
      } catch (error) {
        client.clearExpectedActor();
        throw error;
      }
    },
    async startLogin(entry, returnPath = '/', signal) {
      if (entry !== 'main' && entry !== 'quick') throw new Error('HTTP_API_INVALID_LOGIN_ENTRY');
      const origin = currentOrigin();
      const normalizedReturnPath = parseReturnPath(returnPath, origin);
      client.clearExpectedActor();
      const response = record(await client.request<unknown>('/api/v1/session/login', {
        method: 'POST', body: { entry, returnPath: normalizedReturnPath }, signal,
      }), 'LOGIN_ENVELOPE');
      if (Object.keys(response).length !== 1) throw new Error('HTTP_API_INVALID_LOGIN_RESPONSE');
      const data = record(response.data, 'LOGIN_DATA');
      if (Object.keys(data).length !== 1) throw new Error('HTTP_API_INVALID_LOGIN_RESPONSE');
      return validateLoginAuthorizationUrl(data.authorizationUrl, origin);
    },
    async updateDisplayName(displayName, signal) {
      const session = parseSession(await client.request<unknown>('/api/v1/session/profile', {
        method: 'PATCH', body: { displayName }, signal,
      }));
      client.bindExpectedActor({ accountId: session.uid, contextId: session.authContextId });
      return session;
    },
    async logout(signal) {
      await client.request<unknown>('/api/v1/session/logout', { method: 'POST', signal });
      client.clearExpectedActor();
    },
  };
}
