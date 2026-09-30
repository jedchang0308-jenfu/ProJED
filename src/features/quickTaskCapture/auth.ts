import type { QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';
import {
  completeQuickOAuthCallback as completeOAuthCallback,
  getQuickOAuthConfig,
  isQuickOAuthCallbackPage,
  loadQuickOAuthSession,
  startQuickOAuth,
} from './oauthClient';

export type VerifiedQuickAuthSnapshot = QuickAuthSnapshot & { email: string | null };

let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;
let pendingOAuthClaim: { captureId: string | null; claimNonce: string | null } | null = null;

export const loadQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  if (isQuickOAuthCallbackPage()) {
    const session = await loadQuickOAuthSession();
    if (!session) {
      if (cachedSnapshot) authEpoch += 1;
      cachedSnapshot = null;
      return null;
    }
    if (cachedSnapshot?.accountId !== session.accountId || cachedSnapshot?.clientId !== session.clientId) authEpoch += 1;
    cachedSnapshot = Object.freeze({
      accountId: session.accountId,
      accessToken: session.accessToken,
      authEpoch,
      clientId: session.clientId,
    });
    return cachedSnapshot;
  }

  const { supabase } = await import('../../services/supabase/client');
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user?.id || !session.access_token) {
    if (cachedSnapshot) authEpoch += 1;
    cachedSnapshot = null;
    return null;
  }
  if (cachedSnapshot?.accountId !== session.user.id) authEpoch += 1;
  cachedSnapshot = Object.freeze({ accountId: session.user.id, accessToken: session.access_token, authEpoch });
  return cachedSnapshot;
};

export const getQuickAuthSnapshot = () => cachedSnapshot;

export const verifyQuickSession = async (expected: QuickAuthSnapshot): Promise<VerifiedQuickAuthSnapshot | null> => {
  if (cachedSnapshot?.accountId !== expected.accountId || cachedSnapshot.authEpoch !== expected.authEpoch) return null;

  if (expected.clientId) {
    const config = getQuickOAuthConfig();
    if (!config || !isQuickOAuthCallbackPage() || config.clientId !== expected.clientId) return null;
    const { loadQuickOAuthSession } = await import('./oauthClient');
    const session = await loadQuickOAuthSession();
    if (!session || session.accountId !== expected.accountId || session.clientId !== expected.clientId
      || cachedSnapshot?.accountId !== expected.accountId || cachedSnapshot.authEpoch !== expected.authEpoch) return null;
    const verified = Object.freeze({
      accountId: expected.accountId,
      accessToken: session.accessToken,
      authEpoch: expected.authEpoch,
      clientId: session.clientId,
      email: session.email,
    });
    cachedSnapshot = verified;
    return verified;
  }

  const { supabase } = await import('../../services/supabase/client');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session?.user?.id || !session.access_token || session.user.id !== expected.accountId) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
  if (userError || userData.user?.id !== expected.accountId) return null;

  const { data: latestSessionData, error: latestSessionError } = await supabase.auth.getSession();
  const latestSession = latestSessionData.session;
  if (latestSessionError || latestSession?.user?.id !== expected.accountId
    || latestSession.access_token !== session.access_token
    || cachedSnapshot?.accountId !== expected.accountId
    || cachedSnapshot.authEpoch !== expected.authEpoch) return null;

  const verified = Object.freeze({
    accountId: expected.accountId,
    accessToken: session.access_token,
    authEpoch: expected.authEpoch,
    email: userData.user.email ?? null,
  });
  cachedSnapshot = verified;
  return verified;
};

export const bumpQuickAuthEpoch = () => {
  authEpoch += 1;
  cachedSnapshot = null;
};

export const startQuickGoogleSignIn = async (redirectTo: string) => {
  if (isQuickOAuthCallbackPage()) {
    if (!await startQuickOAuth(redirectTo)) throw new Error('OAUTH_CONFIG_INVALID');
    return;
  }
  const { supabase } = await import('../../services/supabase/client');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
};

export const completeQuickOAuthCallback = async () => {
  if (!isQuickOAuthCallbackPage()) {
    pendingOAuthClaim = null;
    return null;
  }
  pendingOAuthClaim = await completeOAuthCallback();
  return pendingOAuthClaim;
};

export const consumeQuickOAuthClaimIntent = () => {
  const claim = pendingOAuthClaim;
  pendingOAuthClaim = null;
  return claim;
};

export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  if (isQuickOAuthCallbackPage()) {
    const refresh = () => { void loadQuickSession().then(onChange).catch(() => onChange(null)); };
    window.addEventListener('storage', refresh);
    window.addEventListener('quick-oauth-session-change', refresh);
    return { unsubscribe: () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('quick-oauth-session-change', refresh);
    } };
  }

  const { supabase } = await import('../../services/supabase/client');
  const subscription = supabase.auth.onAuthStateChange((_event, session) => {
    const nextAccountId = session?.user?.id ?? null;
    if (cachedSnapshot?.accountId !== nextAccountId) authEpoch += 1;
    cachedSnapshot = nextAccountId && session?.access_token
      ? Object.freeze({ accountId: nextAccountId, accessToken: session.access_token, authEpoch })
      : null;
    onChange(cachedSnapshot);
  });
  return subscription.data.subscription;
};
