import type { QuickAuthContext } from './model';
import { getQuickAuthContext, saveQuickAuthContext } from './outbox';
import type { QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';
import { configuredSupabaseUrl, supabase } from '../../services/supabase/client';

export type VerifiedQuickAuthSnapshot = QuickAuthSnapshot & { email: string | null; contextRevision: number; contextProjectRef: string };
export type QuickAuthVerification = { status: 'verified'; snapshot: VerifiedQuickAuthSnapshot }
  | { status: 'unauthenticated' | 'unreachable' | 'stale'; snapshot: null };
let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;
let locallyStopped = false;
const LOGIN_INTENT = 'projed-quick-sdk-login-intent';
const projectRef = (() => {
  try { return configuredSupabaseUrl ? new URL(configuredSupabaseUrl).hostname.split('.')[0] ?? 'unknown' : 'unknown'; }
  catch { return 'unknown'; }
})();
// An SDK session UUID is not a credential. Only network getUser verifies identity.
const sessionId = (token: string | null) => {
  try {
    const payload = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch { return null; }
};
const loginIntentAt = () => {
  try { const at = Number(sessionStorage.getItem(LOGIN_INTENT)); return Number.isSafeInteger(at) && at > 0 && Date.now() - at < 15 * 60_000 ? at : 0; }
  catch { return 0; }
};
const canResume = (context: QuickAuthContext | undefined, token: string | null) => {
  if (!context?.barrierAt && !locallyStopped) return true;
  return loginIntentAt() >= (context?.barrierAt ?? Date.now()) && Boolean(sessionId(token)) && sessionId(token) !== context?.sessionId;
};
const validContext = (context: QuickAuthContext | undefined) => !context || (
  context.projectRef === projectRef && Number.isSafeInteger(context.revision) && context.revision >= 0
    && typeof context.bindingAllowed === 'boolean' && (context.accountId === null || typeof context.accountId === 'string')
    && (!context.bindingAllowed || (Boolean(context.accountId) && Number.isSafeInteger(context.verifiedAt)
      && (context.verifiedAt ?? 0) > 0 && (context.barrierAt === null || context.barrierAt === undefined)))
);
const setCachedSession = (accountId: string | null, accessToken: string | null) => {
  if (!accountId || !accessToken) { if (cachedSnapshot) authEpoch += 1; cachedSnapshot = null; return null; }
  if (cachedSnapshot?.accountId !== accountId || cachedSnapshot.accessToken !== accessToken) authEpoch += 1;
  cachedSnapshot = Object.freeze({ accountId, accessToken, authEpoch });
  return cachedSnapshot;
};
export const bumpQuickAuthEpoch = () => { authEpoch += 1; cachedSnapshot = null; };
export const getQuickAuthSnapshot = () => locallyStopped ? null : cachedSnapshot;
const stopBinding = async (barrier: boolean) => {
  const current = await getQuickAuthContext();
  if (!validContext(current)) throw new Error('AUTH_CONTEXT_PROJECT_MISMATCH');
  await saveQuickAuthContext({ key: 'current', projectRef, accountId: null, displayLabel: null, verifiedAt: null,
    bindingAllowed: false, revision: (current?.revision ?? 0) + 1, barrierAt: barrier ? Date.now() : current?.barrierAt ?? null,
    sessionId: current?.sessionId ?? null }, current?.revision ?? null);
};
export const loadQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isAuthFailure(error)) await invalidateQuickAuthentication();
      return null;
    }
    const session = data.session, context = await getQuickAuthContext();
    if (!session?.user?.id || !session.access_token) {
      if (context?.bindingAllowed || cachedSnapshot) await invalidateQuickAuthentication();
      else setCachedSession(null, null);
      return null;
    }
    if (!validContext(context) || !canResume(context, session?.access_token ?? null)) { bumpQuickAuthEpoch(); return null; }
    if (locallyStopped) locallyStopped = false;
    if (context?.bindingAllowed && session?.user.id && context.accountId !== session.user.id) await stopBinding(false);
    return setCachedSession(session?.user?.id ?? null, session?.access_token ?? null);
  } catch (error) {
    if (isAuthFailure(error)) await invalidateQuickAuthentication().catch(() => undefined);
    return null;
  }
};
export const getQuickBindingContext = async () => {
  if (locallyStopped) return null;
  const context = await getQuickAuthContext().catch(() => undefined);
  return validContext(context) && context?.bindingAllowed && context.accountId
    && (!cachedSnapshot || cachedSnapshot.accountId === context.accountId) ? context : null;
};
export const getQuickOfflineAccountId = async () => (await getQuickBindingContext())?.accountId ?? null;
const isAuthFailure = (error: unknown) => {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  return status === 400 || status === 401 || status === 403;
};
const invalidateQuickAuthentication = async () => {
  locallyStopped = true;
  bumpQuickAuthEpoch();
  await stopBinding(true);
};
const withDeadline = async <T>(operation: Promise<T>, deadline: number): Promise<T> => {
  let timeout = 0;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error('AUTH_VERIFY_TIMEOUT')), Math.max(0, deadline - Date.now()));
  })]); } finally { window.clearTimeout(timeout); }
};
export const verifyQuickSessionState = async (expected: QuickAuthSnapshot): Promise<QuickAuthVerification> => {
  const deadline = Date.now() + 15_000;
  const stale = () => locallyStopped || cachedSnapshot?.accountId !== expected.accountId || cachedSnapshot.authEpoch !== expected.authEpoch;
  if (stale()) return { status: 'stale', snapshot: null };
  try {
    const sessionData = await withDeadline(supabase.auth.getSession(), deadline), session = sessionData.data.session;
    if (sessionData.error && !isAuthFailure(sessionData.error)) return { status: 'unreachable', snapshot: null };
    if (sessionData.error || !session?.user?.id || !session.access_token) {
      await invalidateQuickAuthentication(); return { status: 'unauthenticated', snapshot: null };
    }
    if (session.user.id !== expected.accountId || session.access_token !== expected.accessToken || stale()) return { status: 'stale', snapshot: null };
    const current = await getQuickAuthContext();
    if (!validContext(current) || !canResume(current, session.access_token)) return { status: 'unauthenticated', snapshot: null };
    const userData = await withDeadline(supabase.auth.getUser(session.access_token), deadline);
    if (stale()) return { status: 'stale', snapshot: null };
    if (userData.error) {
      if (!isAuthFailure(userData.error)) return { status: 'unreachable', snapshot: null };
      await invalidateQuickAuthentication(); return { status: 'unauthenticated', snapshot: null };
    }
    if (userData.data.user?.id !== expected.accountId) return { status: 'stale', snapshot: null };
    const latestSessionData = await withDeadline(supabase.auth.getSession(), deadline), latest = latestSessionData.data.session;
    if (stale()) return { status: 'stale', snapshot: null };
    if (latestSessionData.error && !isAuthFailure(latestSessionData.error)) return { status: 'unreachable', snapshot: null };
    if (latestSessionData.error || !latest?.user?.id || !latest.access_token) {
      await invalidateQuickAuthentication(); return { status: 'unauthenticated', snapshot: null };
    }
    if (latest.user.id !== expected.accountId || latest.access_token !== expected.accessToken) return { status: 'stale', snapshot: null };
    const context: QuickAuthContext = { key: 'current', projectRef, accountId: expected.accountId,
      displayLabel: userData.data.user.email ?? null, verifiedAt: Date.now(), bindingAllowed: true,
      revision: current?.accountId === expected.accountId && current.bindingAllowed ? current.revision : (current?.revision ?? 0) + 1,
      barrierAt: null, sessionId: sessionId(session.access_token) };
    if (Date.now() >= deadline) return { status: 'unreachable', snapshot: null };
    await saveQuickAuthContext(context, current?.revision ?? null);
    if (stale()) return { status: 'stale', snapshot: null };
    sessionStorage.removeItem(LOGIN_INTENT);
    const verified = Object.freeze({ ...expected, email: userData.data.user.email ?? null, contextRevision: context.revision, contextProjectRef: projectRef });
    cachedSnapshot = verified;
    return { status: 'verified', snapshot: verified };
  } catch { return { status: stale() ? 'stale' : 'unreachable', snapshot: null }; }
};
export const verifyQuickSession = async (expected: QuickAuthSnapshot) => {
  const result = await verifyQuickSessionState(expected); return result.status === 'verified' ? result.snapshot : null;
};
export const signOutQuickSession = async () => {
  locallyStopped = true; bumpQuickAuthEpoch(); sessionStorage.removeItem(LOGIN_INTENT);
  try { await stopBinding(true); } catch { throw new Error('LOGOUT_BARRIER_FAILED'); }
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error('LOGOUT_SDK_FAILED');
};
export const startQuickGoogleSignIn = async (redirectTo: string) => {
  sessionStorage.setItem(LOGIN_INTENT, String(Date.now()));
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } });
  if (error) { sessionStorage.removeItem(LOGIN_INTENT); throw error; }
};
export const completeQuickOAuthCallback = async () => {
  if (new URLSearchParams(window.location.hash.slice(1)).has('error') || new URLSearchParams(window.location.search).has('error')) {
    sessionStorage.removeItem(LOGIN_INTENT); throw new Error('LOGIN_CALLBACK_FAILED');
  }
};
export const consumeQuickOAuthClaimIntent = () => null;
export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  let active = true;
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (event === 'SIGNED_OUT') {
      locallyStopped = true; bumpQuickAuthEpoch(); onChange(null);
      window.setTimeout(() => { void stopBinding(true).catch(() => undefined); }, 0);
      return;
    }
    setCachedSession(session?.user?.id ?? null, session?.access_token ?? null);
    const epoch = authEpoch;
    // Run SDK methods outside onAuthStateChange's lock.
    window.setTimeout(() => { void loadQuickSession().then(snapshot => { if (active && authEpoch >= epoch) onChange(snapshot); }); }, 0);
  }).data.subscription;
  return { unsubscribe: () => { active = false; subscription.unsubscribe(); } };
};
