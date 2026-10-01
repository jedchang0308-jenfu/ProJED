import type { QuickAuthContext } from './model';
import { getQuickAuthContext, saveQuickAuthContext } from './outbox';
import type { QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';
import { configuredSupabaseUrl, supabase } from '../../services/supabase/client';

export type VerifiedQuickAuthSnapshot = QuickAuthSnapshot & { email: string | null; contextRevision: number; contextProjectRef: string };
export type QuickAuthVerification =
  | { status: 'verified'; snapshot: VerifiedQuickAuthSnapshot }
  | { status: 'unauthenticated' | 'unreachable' | 'stale'; snapshot: null };

let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;

const projectRef = (() => {
  try {
    return configuredSupabaseUrl ? new URL(configuredSupabaseUrl).hostname.split('.')[0] ?? 'unknown' : 'unknown';
  } catch {
    return 'unknown';
  }
})();

const setCachedSession = (accountId: string | null, accessToken: string | null) => {
  if (!accountId || !accessToken) {
    if (cachedSnapshot) authEpoch += 1;
    cachedSnapshot = null;
    return null;
  }
  if (cachedSnapshot?.accountId !== accountId || cachedSnapshot.accessToken !== accessToken) authEpoch += 1;
  cachedSnapshot = Object.freeze({ accountId, accessToken, authEpoch });
  return cachedSnapshot;
};

const contextWithVerifiedSession = async (accountId: string, email: string | null) => {
  const current = await getQuickAuthContext().catch(() => undefined);
  if (current && current.projectRef !== projectRef) throw new Error('AUTH_CONTEXT_PROJECT_MISMATCH');
  const sameAccount = current?.accountId === accountId;
  const context: QuickAuthContext = {
    key: 'current',
    projectRef,
    accountId,
    displayLabel: email,
    verifiedAt: Date.now(),
    bindingAllowed: true,
    revision: sameAccount ? current!.revision : (current?.revision ?? 0) + 1,
    barrierAt: null,
  };
  await saveQuickAuthContext(context, current?.revision);
  return context;
};

export const loadQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const session = data.session;
    return setCachedSession(session?.user?.id ?? null, session?.access_token ?? null);
  } catch {
    return null;
  }
};

export const getQuickAuthSnapshot = () => cachedSnapshot;

export const getQuickOfflineAccountId = async () => {
  const context = await getQuickAuthContext().catch(() => undefined);
  return context?.projectRef === projectRef && context.bindingAllowed && context.accountId ? context.accountId : null;
};

export const getQuickBindingContext = async () => {
  const context = await getQuickAuthContext().catch(() => undefined);
  return context?.projectRef === projectRef && context.bindingAllowed && context.accountId ? context : null;
};

export const verifyQuickSessionState = async (expected: QuickAuthSnapshot): Promise<QuickAuthVerification> => {
  if (cachedSnapshot?.accountId !== expected.accountId || cachedSnapshot.authEpoch !== expected.authEpoch) {
    return { status: 'stale', snapshot: null };
  }
  let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>;
  try {
    sessionData = await supabase.auth.getSession();
  } catch {
    return { status: 'unreachable', snapshot: null };
  }
  const session = sessionData.data.session;
  if (sessionData.error) return { status: 'unreachable', snapshot: null };
  if (!session?.user?.id || !session.access_token) return { status: 'unauthenticated', snapshot: null };
  if (session.user.id !== expected.accountId || session.access_token !== expected.accessToken) {
    return { status: 'stale', snapshot: null };
  }
  let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    userData = await supabase.auth.getUser(session.access_token);
  } catch {
    return { status: 'unreachable', snapshot: null };
  }
  if (userData.error) return { status: 'unreachable', snapshot: null };
  if (userData.data.user?.id !== expected.accountId) return { status: 'stale', snapshot: null };
  let latestSessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>;
  try {
    latestSessionData = await supabase.auth.getSession();
  } catch {
    return { status: 'unreachable', snapshot: null };
  }
  const latestSession = latestSessionData.data.session;
  if (latestSessionData.error || latestSession?.user?.id !== expected.accountId
    || latestSession.access_token !== expected.accessToken
    || cachedSnapshot?.accountId !== expected.accountId || cachedSnapshot.authEpoch !== expected.authEpoch) {
    return { status: 'stale', snapshot: null };
  }
  const context = await contextWithVerifiedSession(expected.accountId, userData.data.user.email ?? null).catch(() => null);
  if (!context) return { status: 'unreachable', snapshot: null };
  const verified = Object.freeze({
    accountId: expected.accountId,
    accessToken: expected.accessToken,
    authEpoch: expected.authEpoch,
    email: userData.data.user.email ?? null,
    contextRevision: context.revision,
    contextProjectRef: context.projectRef,
  });
  cachedSnapshot = verified;
  return { status: 'verified', snapshot: verified };
};

export const verifyQuickSession = async (expected: QuickAuthSnapshot) => {
  const result = await verifyQuickSessionState(expected);
  return result.status === 'verified' ? result.snapshot : null;
};

export const bumpQuickAuthEpoch = () => {
  authEpoch += 1;
  cachedSnapshot = null;
};

export const signOutQuickSession = async () => {
  const current = await getQuickAuthContext().catch(() => undefined);
  if (current) {
    await saveQuickAuthContext({
      ...current,
      accountId: null,
      displayLabel: null,
      verifiedAt: null,
      bindingAllowed: false,
      revision: current.revision + 1,
      barrierAt: Date.now(),
    }, current.revision);
  }
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  bumpQuickAuthEpoch();
};

export const startQuickGoogleSignIn = async (redirectTo: string) => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
};

export const completeQuickOAuthCallback = async () => null;
export const consumeQuickOAuthClaimIntent = () => null;

export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  const subscription = supabase.auth.onAuthStateChange((_event, session) => {
    const nextAccountId = session?.user?.id ?? null;
    const nextToken = session?.access_token ?? null;
    setCachedSession(nextAccountId, nextToken);
    onChange(cachedSnapshot);
  });
  return subscription.data.subscription;
};
