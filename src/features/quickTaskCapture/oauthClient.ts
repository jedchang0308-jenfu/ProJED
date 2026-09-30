const OAUTH_TRANSACTION_KEY = 'projed.quick-task.oauth-transaction.v1';
export const QUICK_OAUTH_SESSION_KEY = 'projed.quick-task.oauth-session.v1';
const OAUTH_TRANSACTION_TTL_MS = 10 * 60_000;

type QuickOAuthConfig = {
  supabaseUrl: string;
  anonKey: string;
  clientId: string;
  redirectUri: string;
};

type OAuthTransaction = {
  state: string;
  verifier: string;
  redirectUri: string;
  expiresAt: number;
  captureId: string | null;
  claimNonce: string | null;
};

export type QuickOAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  accountId: string;
  email: string | null;
};

const configured = (): QuickOAuthConfig | null => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const clientId = import.meta.env.VITE_QUICK_TASK_OAUTH_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_QUICK_TASK_OAUTH_REDIRECT_URI;
  if (!supabaseUrl || !anonKey || !clientId || !redirectUri) return null;

  try {
    const api = new URL(supabaseUrl);
    const callback = new URL(redirectUri);
    if (!['https:', 'http:'].includes(api.protocol) || !['https:', 'http:'].includes(callback.protocol)
      || callback.username || callback.password || callback.search || callback.hash
      || (api.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(api.hostname))
      || callback.pathname !== '/quick-task/' || (callback.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(callback.hostname))) {
      return null;
    }
    return { supabaseUrl: api.origin, anonKey, clientId, redirectUri: callback.toString() };
  } catch {
    return null;
  }
};

export const getQuickOAuthConfig = configured;
export const isQuickOAuthBuildEnabled = () => Boolean(import.meta.env.VITE_QUICK_TASK_OAUTH_CLIENT_ID);

export const isQuickOAuthCallbackPage = () => {
  const config = configured();
  if (!config || typeof window === 'undefined') return false;
  const callback = new URL(config.redirectUri);
  return window.location.origin === callback.origin && window.location.pathname === callback.pathname;
};

const authEndpoint = (config: QuickOAuthConfig, pathname: string) => new URL(`/auth/v1/${pathname}`, config.supabaseUrl).toString();

const randomUrlToken = (size: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const sha256Base64Url = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const parseTransaction = (): OAuthTransaction | null => {
  try {
    const value = sessionStorage.getItem(OAUTH_TRANSACTION_KEY);
    if (!value) return null;
    const transaction = JSON.parse(value) as Partial<OAuthTransaction>;
    if (typeof transaction.state !== 'string' || typeof transaction.verifier !== 'string'
      || typeof transaction.redirectUri !== 'string' || typeof transaction.expiresAt !== 'number'
      || !Number.isFinite(transaction.expiresAt)) return null;
    return {
      state: transaction.state,
      verifier: transaction.verifier,
      redirectUri: transaction.redirectUri,
      expiresAt: transaction.expiresAt,
      captureId: typeof transaction.captureId === 'string' ? transaction.captureId : null,
      claimNonce: typeof transaction.claimNonce === 'string' ? transaction.claimNonce : null,
    };
  } catch {
    return null;
  }
};

export const startQuickOAuth = async (redirectTo: string): Promise<boolean> => {
  const config = configured();
  if (!config || !isQuickOAuthCallbackPage()) return false;

  const requestedCallback = new URL(redirectTo, window.location.href);
  const registeredCallback = new URL(config.redirectUri);
  if (requestedCallback.origin !== registeredCallback.origin || requestedCallback.pathname !== registeredCallback.pathname) {
    throw new Error('OAUTH_REDIRECT_MISMATCH');
  }
  const captureId = requestedCallback.searchParams.get('capture');
  const claimNonce = requestedCallback.searchParams.get('claim');
  if ((captureId && !/^task_workbench_unplaced_[A-Za-z0-9_-]{1,120}$/u.test(captureId))
    || (claimNonce && !/^[a-f0-9]{32}$/u.test(claimNonce)) || Boolean(captureId) !== Boolean(claimNonce)) {
    throw new Error('OAUTH_CLAIM_INTENT_INVALID');
  }

  const state = randomUrlToken(32);
  const verifier = randomUrlToken(48);
  const codeChallenge = await sha256Base64Url(verifier);
  const transaction: OAuthTransaction = {
    state,
    verifier,
    redirectUri: config.redirectUri,
    expiresAt: Date.now() + OAUTH_TRANSACTION_TTL_MS,
    captureId,
    claimNonce,
  };
  sessionStorage.setItem(OAUTH_TRANSACTION_KEY, JSON.stringify(transaction));

  const authorizationUrl = new URL(authEndpoint(config, 'oauth/authorize'));
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('scope', 'email');
  window.location.assign(authorizationUrl.toString());
  return true;
};

const decodeAccessTokenClaims = (token: string): Record<string, unknown> | null => {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
    const payload = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const parseTokenResponse = (value: unknown, config: QuickOAuthConfig): QuickOAuthSession | null => {
  if (!value || typeof value !== 'object') return null;
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string'
    || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) return null;
  const claims = decodeAccessTokenClaims(token.access_token);
  if (!claims || claims.client_id !== config.clientId || typeof claims.sub !== 'string' || !claims.sub) return null;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    clientId: config.clientId,
    accountId: claims.sub,
    email: null,
  };
};

const requestUserInfo = async (accessToken: string, config: QuickOAuthConfig) => {
  const response = await fetch(authEndpoint(config, 'oauth/userinfo'), {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`OAUTH_USERINFO_${response.status}`);
  const value = await response.json() as Record<string, unknown>;
  if (typeof value.sub !== 'string' || !value.sub) throw new Error('OAUTH_USERINFO_INVALID');
  return { accountId: value.sub, email: typeof value.email === 'string' ? value.email : null };
};

const saveSession = (session: QuickOAuthSession) => {
  localStorage.setItem(QUICK_OAUTH_SESSION_KEY, JSON.stringify(session));
};

export const clearQuickOAuthSession = () => {
  localStorage.removeItem(QUICK_OAUTH_SESSION_KEY);
  window.dispatchEvent(new Event('quick-oauth-session-change'));
};

const readStoredSession = (): QuickOAuthSession | null => {
  try {
    const value = localStorage.getItem(QUICK_OAUTH_SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<QuickOAuthSession>;
    if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string'
      || typeof session.expiresAt !== 'number' || typeof session.clientId !== 'string'
      || typeof session.accountId !== 'string' || !session.accountId
      || (session.email !== null && typeof session.email !== 'string')) return null;
    return session as QuickOAuthSession;
  } catch {
    return null;
  }
};

const refreshSession = async (config: QuickOAuthConfig) => {
  const initial = readStoredSession();
  if (!initial || initial.clientId !== config.clientId) return null;
  if (initial.expiresAt > Date.now() + 60_000) return initial;
  if (!navigator.locks?.request) throw new Error('OAUTH_REFRESH_LOCK_UNAVAILABLE');

  return navigator.locks.request(`projed-quick-oauth-refresh:${config.clientId}`, async () => {
    const latest = readStoredSession();
    if (!latest || latest.clientId !== config.clientId) return null;
    if (latest.expiresAt > Date.now() + 60_000) return latest;
    const response = await fetch(authEndpoint(config, 'oauth/token'), {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: latest.refreshToken, client_id: config.clientId }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) {
      clearQuickOAuthSession();
      throw new Error(`OAUTH_REFRESH_${response.status}`);
    }
    const tokenSession = parseTokenResponse(await response.json(), config);
    if (!tokenSession || tokenSession.accountId !== latest.accountId) {
      clearQuickOAuthSession();
      throw new Error('OAUTH_REFRESH_ACCOUNT_MISMATCH');
    }
    const user = await requestUserInfo(tokenSession.accessToken, config);
    if (user.accountId !== latest.accountId) {
      clearQuickOAuthSession();
      throw new Error('OAUTH_REFRESH_ACCOUNT_MISMATCH');
    }
    const refreshed = { ...tokenSession, ...user };
    saveSession(refreshed);
    return refreshed;
  });
};

export const loadQuickOAuthSession = async (): Promise<QuickOAuthSession | null> => {
  const config = configured();
  if (!config || !isQuickOAuthCallbackPage()) return null;
  const session = await refreshSession(config);
  if (!session) return null;
  const user = await requestUserInfo(session.accessToken, config);
  const claims = decodeAccessTokenClaims(session.accessToken);
  if (user.accountId !== session.accountId || claims?.sub !== user.accountId || claims.client_id !== config.clientId) {
    clearQuickOAuthSession();
    throw new Error('OAUTH_SESSION_ACCOUNT_MISMATCH');
  }
  const verified = { ...session, ...user };
  saveSession(verified);
  return verified;
};

export const completeQuickOAuthCallback = async (): Promise<{ captureId: string | null; claimNonce: string | null } | null> => {
  const config = configured();
  if (!isQuickOAuthBuildEnabled()) return null;
  if (!config || !isQuickOAuthCallbackPage()) throw new Error('OAUTH_CONFIG_INVALID');

  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  if (!code && !state && !oauthError) return null;
  for (const key of ['code', 'state', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);

  const transaction = parseTransaction();
  sessionStorage.removeItem(OAUTH_TRANSACTION_KEY);
  if (!transaction || transaction.expiresAt < Date.now() || !state || state !== transaction.state
    || transaction.redirectUri !== config.redirectUri) throw new Error('OAUTH_STATE_INVALID');
  if (oauthError || !code) throw new Error(oauthError === 'access_denied' ? 'OAUTH_ACCESS_DENIED' : 'OAUTH_AUTHORIZATION_FAILED');

  const response = await fetch(authEndpoint(config, 'oauth/token'), {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.verifier,
    }),
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`OAUTH_EXCHANGE_${response.status}`);
  const tokenSession = parseTokenResponse(await response.json(), config);
  if (!tokenSession) throw new Error('OAUTH_TOKEN_INVALID');
  const user = await requestUserInfo(tokenSession.accessToken, config);
  if (user.accountId !== tokenSession.accountId) throw new Error('OAUTH_USERINFO_ACCOUNT_MISMATCH');
  saveSession({ ...tokenSession, ...user });
  return { captureId: transaction.captureId, claimNonce: transaction.claimNonce };
};

export const isQuickOAuthRpcEnabled = (auth: { clientId?: string }) => {
  const clientId = import.meta.env.VITE_QUICK_TASK_OAUTH_CLIENT_ID;
  return import.meta.env.VITE_QUICK_TASK_OAUTH_RPC_ENABLED === 'true'
    && Boolean(clientId && auth.clientId && auth.clientId === clientId);
};
