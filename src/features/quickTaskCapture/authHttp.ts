import type { QuickAuthSnapshot } from './contract';
import { httpSessionService } from '../../services/httpApi/backend';
import { HttpApiError } from '../../services/httpApi/httpApiClient';
import { isQuickProductionOrigin } from './origins';
import { getQuickAuthContext, saveQuickAuthContext } from './outbox';
import type { QuickAuthContext } from './model';
import { installForegroundSessionRenewal } from '../../services/httpApi/foregroundSession';

export type VerifiedQuickAuthSnapshot = QuickAuthSnapshot & {
  email: string | null;
  contextRevision: number;
  contextProjectRef: string;
};
export type QuickBindingContext = QuickAuthContext & {
  accountId: string;
  authEpoch: number;
  loadRevision: number;
};
export type QuickAuthVerification = { status: 'verified'; snapshot: VerifiedQuickAuthSnapshot }
  | { status: 'unauthenticated' | 'unreachable' | 'stale'; snapshot: null };

let authEpoch = 0;
let cachedSnapshot: QuickAuthSnapshot | null = null;
let locallyStopped = false;
let sessionLoadRevision = 0;
let sessionLoadState: 'checking' | 'authenticated' | 'unauthenticated' | 'unreachable' = 'checking';
let rememberedDevice = false;

const projectRef = typeof window === 'undefined' ? 'projed-http' : `http:${window.location.origin}`;
const sessionIdentity = (contextId: string) => `http:${contextId}`;
const isAuthFailure = (error: unknown) => error instanceof HttpApiError && (error.status === 401 || error.status === 403 || error.status === 404);
const validContext = (context: QuickAuthContext | undefined) => !context || (
  context.projectRef === projectRef
  && Number.isSafeInteger(context.revision)
  && context.revision >= 0
  && typeof context.bindingAllowed === 'boolean'
  && (context.accountId === null || typeof context.accountId === 'string')
  && (!context.bindingAllowed || (Boolean(context.accountId) && Number.isSafeInteger(context.verifiedAt)
    && (context.verifiedAt ?? 0) > 0 && (context.barrierAt === null || context.barrierAt === undefined)))
);
const validStoredContext = (context: QuickAuthContext | undefined) => !context || (
  typeof context.projectRef === 'string'
  && context.projectRef.length > 0
  && Number.isSafeInteger(context.revision)
  && context.revision >= 0
  && typeof context.bindingAllowed === 'boolean'
  && (context.accountId === null || typeof context.accountId === 'string')
);

const setCachedSession = (accountId: string | null, identity: string | null) => {
  if (!accountId || !identity) {
    if (cachedSnapshot) authEpoch += 1;
    cachedSnapshot = null;
    return null;
  }
  if (cachedSnapshot?.accountId !== accountId || cachedSnapshot.accessToken !== identity) authEpoch += 1;
  cachedSnapshot = Object.freeze({ accountId, accessToken: identity, authEpoch });
  return cachedSnapshot;
};

export const bumpQuickAuthEpoch = () => {
  authEpoch += 1;
  cachedSnapshot = null;
};
export const getQuickAuthSnapshot = () => locallyStopped ? null : cachedSnapshot;
export const getQuickSessionLoadState = () => sessionLoadState;

const stopBinding = async (
  barrier: boolean,
  isCurrent: () => boolean = () => true,
  stoppedSessionId: string | null = null,
  observed?: QuickAuthContext,
) => {
  const current = observed ?? await getQuickAuthContext();
  if (!isCurrent()) return false;
  if (!validContext(current)) throw new Error('AUTH_CONTEXT_PROJECT_MISMATCH');
  await saveQuickAuthContext({
    key: 'current',
    projectRef,
    accountId: null,
    displayLabel: null,
    verifiedAt: null,
    bindingAllowed: false,
    revision: (current?.revision ?? 0) + 1,
    barrierAt: barrier ? Date.now() : current?.barrierAt ?? null,
    sessionId: stoppedSessionId ?? current?.sessionId ?? null,
  }, current?.revision ?? null, isCurrent);
  return true;
};

const rejectSession = async (observed: QuickAuthContext | undefined) => {
  locallyStopped = true;
  bumpQuickAuthEpoch();
  sessionLoadState = 'unauthenticated';
  const stoppedEpoch = authEpoch;
  if (observed?.bindingAllowed && validContext(observed)) {
    // Revoke only the binding seen before the request. Another tab may already
    // have completed a new login and advanced its IndexedDB revision.
    await stopBinding(true, () => locallyStopped && authEpoch === stoppedEpoch,
      observed.sessionId, observed).catch(() => undefined);
  }
};

const readQuickSession = async (): Promise<QuickAuthSnapshot | null> => {
  const loadRevision = ++sessionLoadRevision;
  const expectedEpoch = authEpoch;
  const isCurrent = () => loadRevision === sessionLoadRevision && authEpoch === expectedEpoch;
  const staleResult = () => getQuickAuthSnapshot();
  sessionLoadState = 'checking';
  let observed: QuickAuthContext | undefined;
  try {
    observed = await getQuickAuthContext();
    if (!isCurrent()) return staleResult();
    const profile = await httpSessionService.getSession();
    if (!isCurrent()) return staleResult();
    rememberedDevice = profile.rememberedDevice === true;
    const identity = sessionIdentity(profile.authContextId);
    const context = await getQuickAuthContext();
    if (!isCurrent()) return staleResult();
    if (!validStoredContext(context)) {
      sessionLoadState = 'unauthenticated';
      bumpQuickAuthEpoch();
      return null;
    }
    const currentContext = context?.projectRef === projectRef ? context : undefined;
    if (currentContext && !currentContext.bindingAllowed && currentContext.sessionId === identity) {
      sessionLoadState = 'unauthenticated';
      return setCachedSession(null, null);
    }
    if (locallyStopped) locallyStopped = false;
    if (currentContext?.bindingAllowed && (currentContext.accountId !== profile.uid || currentContext.sessionId !== identity)) {
      if (!await stopBinding(false, isCurrent)) return staleResult();
    }
    if (!isCurrent()) return staleResult();
    sessionLoadState = 'authenticated';
    return setCachedSession(profile.uid, identity);
  } catch (error) {
    if (!isCurrent()) return staleResult();
    if (isAuthFailure(error)) {
      await rejectSession(observed);
      return null;
    }
    sessionLoadState = 'unreachable';
    return staleResult();
  }
};

let currentLoad: { epoch: number; result: Promise<QuickAuthSnapshot | null> } | null = null;
export const loadQuickSession = () => {
  // Startup, visibility and the recovery panel can ask for the same cookie
  // concurrently. They must all observe the same completed authorization read.
  if (currentLoad?.epoch === authEpoch) return currentLoad.result;
  const read = { epoch: authEpoch, result: readQuickSession() };
  currentLoad = read;
  return read.result.finally(() => {
    if (currentLoad === read) currentLoad = null;
  });
};

export const isQuickBindingContextCurrent = (context: QuickBindingContext) => !locallyStopped
  && authEpoch === context.authEpoch
  && (cachedSnapshot
    ? cachedSnapshot.accountId === context.accountId && cachedSnapshot.accessToken === context.sessionId
    : sessionLoadState === 'unreachable' && sessionLoadRevision === context.loadRevision);

export const getQuickBindingContext = async (): Promise<QuickBindingContext | null> => {
  if (locallyStopped) return null;
  const epoch = authEpoch;
  const revision = sessionLoadRevision;
  const context = await getQuickAuthContext().catch(() => undefined);
  if (locallyStopped || epoch !== authEpoch || revision !== sessionLoadRevision) return null;
  if (!validContext(context) || !context?.bindingAllowed || !context.accountId) return null;
  if (cachedSnapshot && (cachedSnapshot.accountId !== context.accountId
      || cachedSnapshot.accessToken !== context.sessionId)) return null;
  if (!cachedSnapshot && sessionLoadState !== 'unreachable') return null;
  return {
    ...context,
    accountId: context.accountId,
    authEpoch,
    loadRevision: sessionLoadRevision,
  };
};

export const getQuickOfflineAccountId = async () => (await getQuickBindingContext())?.accountId ?? null;

const withDeadline = async <T>(operation: Promise<T>, deadline: number): Promise<T> => {
  let timeout = 0;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => reject(new Error('AUTH_VERIFY_TIMEOUT')), Math.max(0, deadline - Date.now()));
    })]);
  } finally {
    window.clearTimeout(timeout);
  }
};

export const verifyQuickSessionState = async (expected: QuickAuthSnapshot): Promise<QuickAuthVerification> => {
  const stale = () => locallyStopped || cachedSnapshot?.accountId !== expected.accountId
    || cachedSnapshot.authEpoch !== expected.authEpoch || cachedSnapshot.accessToken !== expected.accessToken;
  if (stale()) return { status: 'stale', snapshot: null };
  const loadRevision = sessionLoadRevision;
  let observed: QuickAuthContext | undefined;
  try {
    observed = await getQuickAuthContext();
    if (stale()) return { status: 'stale', snapshot: null };
    const profile = await withDeadline(httpSessionService.getSession(), Date.now() + 15_000);
    if (stale()) return { status: 'stale', snapshot: null };
    const identity = sessionIdentity(profile.authContextId);
    if (profile.uid !== expected.accountId || identity !== expected.accessToken) {
      return { status: 'stale', snapshot: null };
    }
    const current = await getQuickAuthContext();
    if (stale() || !validStoredContext(current)) return { status: 'stale', snapshot: null };
    const currentProjectContext = current?.projectRef === projectRef ? current : undefined;
    const context: QuickAuthContext = {
      key: 'current',
      projectRef,
      accountId: expected.accountId,
      displayLabel: profile.email,
      verifiedAt: Date.now(),
      bindingAllowed: true,
      revision: currentProjectContext?.accountId === expected.accountId && currentProjectContext.bindingAllowed
        && currentProjectContext.sessionId === identity
        ? currentProjectContext.revision
        : (current?.revision ?? 0) + 1,
      barrierAt: null,
      sessionId: identity,
    };
    await saveQuickAuthContext(context, current?.revision ?? null, () => !stale());
    if (stale()) return { status: 'stale', snapshot: null };
    const verified = Object.freeze({
      ...expected,
      email: profile.email,
      contextRevision: context.revision,
      contextProjectRef: projectRef,
    });
    cachedSnapshot = verified;
    return { status: 'verified', snapshot: verified };
  } catch (error) {
    if (stale()) return { status: 'stale', snapshot: null };
    if (isAuthFailure(error)) {
      if (loadRevision !== sessionLoadRevision) return { status: 'stale', snapshot: null };
      await rejectSession(observed?.sessionId === expected.accessToken ? observed : undefined);
      return { status: 'unauthenticated', snapshot: null };
    }
    return { status: 'unreachable', snapshot: null };
  }
};

export const verifyQuickSession = async (expected: QuickAuthSnapshot) => {
  const result = await verifyQuickSessionState(expected);
  return result.status === 'verified' ? result.snapshot : null;
};

export const signOutQuickSession = async () => {
  const stoppedSessionId = cachedSnapshot?.accessToken ?? null;
  locallyStopped = true;
  bumpQuickAuthEpoch();
  sessionLoadState = 'unauthenticated';
  const barrierEpoch = authEpoch;
  const isCurrent = () => locallyStopped && authEpoch === barrierEpoch;
  try {
    await stopBinding(true, isCurrent, stoppedSessionId);
  } catch {
    if (isCurrent()) throw new Error('LOGOUT_BARRIER_FAILED');
  }
  if (!isCurrent()) return;
  await httpSessionService.logout();
};

export const startQuickGoogleSignIn = async (redirectTo: string, rememberDevice = false) => {
  const origin = window.location.origin;
  const target = new URL(redirectTo, origin);
  if (target.origin !== origin || target.hash) throw new Error('LOGIN_RETURN_PATH_INVALID');
  const returnPath = `${target.pathname}${target.search}`;
  const entry = isQuickProductionOrigin(origin) ? 'quick' : 'main';
  const authorizationUrl = await httpSessionService.startLogin(entry, returnPath, undefined, rememberDevice);
  window.location.assign(authorizationUrl);
};
export const completeQuickOAuthCallback = async () => undefined;
export const consumeQuickOAuthClaimIntent = () => null;
export const subscribeQuickAuth = async (onChange: (snapshot: QuickAuthSnapshot | null) => void) => {
  const stop = installForegroundSessionRenewal(async signal => {
    const expected = getQuickAuthSnapshot();
    if (!rememberedDevice || !expected) return;
    const revision = sessionLoadRevision;
    const isCurrent = () => getQuickAuthSnapshot() === expected && sessionLoadRevision === revision;
    const observed = await getQuickAuthContext();
    if (!isCurrent() || signal.aborted) return;
    try {
      await httpSessionService.renew(signal);
    } catch (error) {
      if (isCurrent() && !signal.aborted && isAuthFailure(error)) {
        await rejectSession(observed?.sessionId === expected.accessToken ? observed : undefined);
        onChange(null);
      }
      throw error;
    }
  });
  return { unsubscribe: stop };
};
