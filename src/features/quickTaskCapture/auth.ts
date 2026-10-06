import type { QuickAuthContext } from './model';
import { getQuickAuthContext, saveQuickAuthContext } from './outbox';
import type { QuickAuthSnapshot } from '../../services/supabase/quickTaskCaptureService';
import { configuredSupabaseUrl, supabase } from '../../services/supabase/client';

export type VerifiedQuickAuthSnapshot = QuickAuthSnapshot & { email: string | null; contextRevision: number; contextProjectRef: string };
export type QuickBindingContext = QuickAuthContext & { accountId: string; authEpoch: number; loadRevision: number };
export type QuickAuthVerification = { status: 'verified'; snapshot: VerifiedQuickAuthSnapshot }
  | { status: 'unauthenticated' | 'unreachable' | 'stale'; snapshot: null };
let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;
let locallyStopped = false;
let localBarrierAt = 0;
let sessionLoadRevision = 0;
let sessionLoadState: 'checking' | 'authenticated' | 'unauthenticated' | 'unreachable' = 'checking';
const LOGIN_INTENT = 'projed-quick-sdk-login-intent';
const LOGIN_PRIOR_SESSION = 'projed-quick-sdk-login-prior-session';
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
  const id = sessionId(token), prior = sessionStorage.getItem(LOGIN_PRIOR_SESSION);
  return loginIntentAt() >= Math.max(context?.barrierAt ?? 0, localBarrierAt) && Boolean(id)
    && id !== context?.sessionId && (prior === 'none' || (prior?.startsWith('id:') === true && prior !== `id:${id}`));
};
const clearLoginIntent = () => { sessionStorage.removeItem(LOGIN_INTENT); sessionStorage.removeItem(LOGIN_PRIOR_SESSION); };
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
export const getQuickSessionLoadState = () => sessionLoadState;
const stopBinding = async (barrier: boolean, isCurrent: () => boolean = () => true, stoppedSessionId: string | null = null) => {
  const current = await getQuickAuthContext();
  if (!isCurrent()) return false;
  if (!validContext(current)) throw new Error('AUTH_CONTEXT_PROJECT_MISMATCH');
  await saveQuickAuthContext({ key: 'current', projectRef, accountId: null, displayLabel: null, verifiedAt: null,
    bindingAllowed: false, revision: (current?.revision ?? 0) + 1, barrierAt: barrier ? Date.now() : current?.barrierAt ?? null,
    sessionId: stoppedSessionId ?? current?.sessionId ?? null }, current?.revision ?? null, isCurrent);
  return true;
};
export const loadQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  const loadRevision = ++sessionLoadRevision;
  const expectedEpoch = authEpoch;
  const isCurrent = () => loadRevision === sessionLoadRevision && authEpoch === expectedEpoch;
  const staleResult = () => getQuickAuthSnapshot();
  sessionLoadState = 'checking';
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!isCurrent()) return staleResult();
    if (error) {
      if (!isAuthFailure(error)) {
        sessionLoadState = 'unreachable';
        return staleResult();
      }
      sessionLoadState = 'unauthenticated';
      await invalidateQuickAuthentication(isCurrent).catch(() => undefined);
      return staleResult();
    }
    const session = data.session, context = await getQuickAuthContext();
    if (!isCurrent()) return staleResult();
    if (!session?.user?.id || !session.access_token) {
      sessionLoadState = 'unauthenticated';
      if (context?.bindingAllowed || cachedSnapshot) {
        await invalidateQuickAuthentication(isCurrent).catch(() => undefined);
        return staleResult();
      }
      return setCachedSession(null, null);
    }
    if (!validContext(context) || !canResume(context, session.access_token)) {
      sessionLoadState = 'unauthenticated';
      bumpQuickAuthEpoch();
      return null;
    }
    if (locallyStopped) { locallyStopped = false; localBarrierAt = 0; }
    if (context?.bindingAllowed && context.accountId !== session.user.id
      && !await stopBinding(false, isCurrent)) return staleResult();
    if (!isCurrent()) return staleResult();
    const snapshot = setCachedSession(session.user.id, session.access_token);
    sessionLoadState = 'authenticated';
    return snapshot;
  } catch (error) {
    if (!isCurrent()) return staleResult();
    if (isAuthFailure(error)) {
      sessionLoadState = 'unauthenticated';
      await invalidateQuickAuthentication(isCurrent).catch(() => undefined);
      return staleResult();
    }
    sessionLoadState = 'unreachable';
    return staleResult();
  }
};
export const isQuickBindingContextCurrent = (context: QuickBindingContext) => !locallyStopped && authEpoch === context.authEpoch
  && (cachedSnapshot ? cachedSnapshot.accountId === context.accountId
    : sessionLoadState === 'unreachable' && sessionLoadRevision === context.loadRevision);
export const getQuickBindingContext = async (): Promise<QuickBindingContext | null> => {
  const expectedSnapshot = cachedSnapshot;
  const expectedEpoch = authEpoch;
  const expectedLoadRevision = sessionLoadRevision;
  const offlineReload = !expectedSnapshot && sessionLoadState === 'unreachable';
  if (locallyStopped || (!expectedSnapshot && !offlineReload)) return null;
  const isCurrent = () => !locallyStopped && authEpoch === expectedEpoch && cachedSnapshot === expectedSnapshot
    && (!offlineReload || (sessionLoadState === 'unreachable' && sessionLoadRevision === expectedLoadRevision));
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
  let sessionReadUnavailable = false;
  try {
    const result = await supabase.auth.getSession();
    if (result.error) {
      if (isAuthFailure(result.error)) { await invalidateQuickAuthentication(isCurrent); return null; }
      sessionReadUnavailable = true;
    }
    session = result.data.session;
  } catch (error) {
    if (isAuthFailure(error)) { await invalidateQuickAuthentication(isCurrent); return null; }
    sessionReadUnavailable = true;
  }
  // A candidate returned alongside a transport error still rules out another owner.
  if (session && expectedSnapshot && (session.user.id !== expectedSnapshot.accountId
    || session.access_token !== expectedSnapshot.accessToken)) return null;
  if (!sessionReadUnavailable && !session) { await invalidateQuickAuthentication(isCurrent); return null; }
  if (!isCurrent()) return null;
  const context = await getQuickAuthContext().catch(() => undefined);
  if (!isCurrent() || !validContext(context) || !context?.bindingAllowed || !context.accountId
    || (expectedSnapshot && context.accountId !== expectedSnapshot.accountId)
    || (session && context.accountId !== session.user.id)) return null;
  return { ...context, accountId: context.accountId, authEpoch: expectedEpoch, loadRevision: expectedLoadRevision };
};
export const getQuickOfflineAccountId = async () => (await getQuickBindingContext())?.accountId ?? null;
const isAuthFailure = (error: unknown) => {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  return status === 400 || status === 401 || status === 403;
};
const invalidateQuickAuthentication = async (isCurrent: () => boolean = () => true) => {
  if (!isCurrent()) return;
  const stoppedSessionId = sessionId(cachedSnapshot?.accessToken ?? null);
  locallyStopped = true;
  localBarrierAt = Date.now();
  bumpQuickAuthEpoch();
  sessionLoadState = 'unauthenticated';
  const barrierEpoch = authEpoch;
  await stopBinding(true, () => locallyStopped && authEpoch === barrierEpoch, stoppedSessionId);
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
    if (stale()) return { status: 'stale', snapshot: null };
    if (sessionData.error && !isAuthFailure(sessionData.error)) return { status: 'unreachable', snapshot: null };
    if (sessionData.error || !session?.user?.id || !session.access_token) {
      await invalidateQuickAuthentication(() => !stale()); return { status: 'unauthenticated', snapshot: null };
    }
    if (session.user.id !== expected.accountId || session.access_token !== expected.accessToken || stale()) return { status: 'stale', snapshot: null };
    const current = await getQuickAuthContext();
    if (stale()) return { status: 'stale', snapshot: null };
    if (!validContext(current) || !canResume(current, session.access_token)) return { status: 'unauthenticated', snapshot: null };
    const userData = await withDeadline(supabase.auth.getUser(session.access_token), deadline);
    if (stale()) return { status: 'stale', snapshot: null };
    if (userData.error) {
      if (!isAuthFailure(userData.error)) return { status: 'unreachable', snapshot: null };
      await invalidateQuickAuthentication(() => !stale()); return { status: 'unauthenticated', snapshot: null };
    }
    if (userData.data.user?.id !== expected.accountId) return { status: 'stale', snapshot: null };
    const latestSessionData = await withDeadline(supabase.auth.getSession(), deadline), latest = latestSessionData.data.session;
    if (stale()) return { status: 'stale', snapshot: null };
    if (latestSessionData.error && !isAuthFailure(latestSessionData.error)) return { status: 'unreachable', snapshot: null };
    if (latestSessionData.error || !latest?.user?.id || !latest.access_token) {
      await invalidateQuickAuthentication(() => !stale()); return { status: 'unauthenticated', snapshot: null };
    }
    if (latest.user.id !== expected.accountId || latest.access_token !== expected.accessToken) return { status: 'stale', snapshot: null };
    const context: QuickAuthContext = { key: 'current', projectRef, accountId: expected.accountId,
      displayLabel: userData.data.user.email ?? null, verifiedAt: Date.now(), bindingAllowed: true,
      revision: current?.accountId === expected.accountId && current.bindingAllowed ? current.revision : (current?.revision ?? 0) + 1,
      barrierAt: null, sessionId: sessionId(session.access_token) };
    if (Date.now() >= deadline) return { status: 'unreachable', snapshot: null };
    await saveQuickAuthContext(context, current?.revision ?? null, () => !stale());
    if (stale()) return { status: 'stale', snapshot: null };
    clearLoginIntent();
    const verified = Object.freeze({ ...expected, email: userData.data.user.email ?? null, contextRevision: context.revision, contextProjectRef: projectRef });
    cachedSnapshot = verified;
    return { status: 'verified', snapshot: verified };
  } catch { return { status: stale() ? 'stale' : 'unreachable', snapshot: null }; }
};
export const verifyQuickSession = async (expected: QuickAuthSnapshot) => {
  const result = await verifyQuickSessionState(expected); return result.status === 'verified' ? result.snapshot : null;
};
export const signOutQuickSession = async () => {
  const stoppedSessionId = sessionId(cachedSnapshot?.accessToken ?? null);
  locallyStopped = true; localBarrierAt = Date.now(); bumpQuickAuthEpoch(); clearLoginIntent(); sessionLoadState = 'unauthenticated';
  const barrierEpoch = authEpoch;
  const isCurrent = () => locallyStopped && authEpoch === barrierEpoch;
  try { await stopBinding(true, isCurrent, stoppedSessionId); } catch { if (isCurrent()) throw new Error('LOGOUT_BARRIER_FAILED'); }
  if (!isCurrent()) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error('LOGOUT_SDK_FAILED');
};
export const startQuickGoogleSignIn = async (redirectTo: string) => {
  let prior = 'unknown';
  try {
    const { data, error } = await withDeadline(supabase.auth.getSession(), Date.now() + 15_000);
    if (!error) prior = data.session ? (sessionId(data.session.access_token) ? `id:${sessionId(data.session.access_token)}` : 'unknown') : 'none';
  } catch { /* An unknown previous session must not bypass a logout barrier. */ }
  sessionStorage.setItem(LOGIN_PRIOR_SESSION, prior);
  sessionStorage.setItem(LOGIN_INTENT, String(Date.now()));
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } });
  if (error) { clearLoginIntent(); throw error; }
};
export const completeQuickOAuthCallback = async () => {
  if (new URLSearchParams(window.location.hash.slice(1)).has('error') || new URLSearchParams(window.location.search).has('error')) {
    clearLoginIntent(); throw new Error('LOGIN_CALLBACK_FAILED');
  }
};
export const consumeQuickOAuthClaimIntent = () => null;
export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  let active = true;
  let eventRevision = 0;
  const sameSnapshot = (left: QuickAuthSnapshot | null, right: QuickAuthSnapshot | null) => left === null || right === null
    ? left === right
    : left.accountId === right.accountId && left.accessToken === right.accessToken && left.authEpoch === right.authEpoch;
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    if (!active) return;
    const revision = ++eventRevision;
    if (event === 'SIGNED_OUT') {
      const stoppedSessionId = sessionId(cachedSnapshot?.accessToken ?? null);
      locallyStopped = true; localBarrierAt = Date.now(); bumpQuickAuthEpoch(); sessionLoadState = 'unauthenticated'; onChange(null);
      const barrierEpoch = authEpoch;
      window.setTimeout(() => {
        void stopBinding(true, () => revision === eventRevision && locallyStopped && authEpoch === barrierEpoch, stoppedSessionId).catch(() => undefined);
      }, 0);
      return;
    }
    setCachedSession(session?.user?.id ?? null, session?.access_token ?? null);
    // Run SDK methods outside onAuthStateChange's lock.
    window.setTimeout(() => {
      if (!active || revision !== eventRevision) return;
      void loadQuickSession().then(snapshot => {
        if (active && revision === eventRevision && sameSnapshot(snapshot, getQuickAuthSnapshot())) onChange(snapshot);
      });
    }, 0);
  }).data.subscription;
  return { unsubscribe: () => { active = false; subscription.unsubscribe(); } };
};
