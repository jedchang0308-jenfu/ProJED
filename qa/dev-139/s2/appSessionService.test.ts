import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import test from 'node:test';

import { IdentityConsumer, type IdentityContractPin, type ProducerVerifiedIdentity } from '../../../server/identityConsumer.js';
import { KernelError } from '../../../server/errors.js';
import { createAppSessionService } from '../../../server/appSessionService.js';
import type {
  AppSessionStore,
  CompleteLoginInput,
  StoredAppSession,
  StoredLoginIntent,
} from '../../../server/appSessionStore.js';
import type { PlatformHandoffBinding } from '../../../server/platformHandoff.js';
import { PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT, type PlatformPrincipalState } from '../../../server/platformPrincipalState.js';
import { parseSessionCookie, setSessionCookie } from '../../../server/sessionCookies.js';

const MAIN_ORIGIN = 'http://127.0.0.1:4100';
const QUICK_ORIGIN = 'http://127.0.0.1:4200';
const BROKER_ORIGIN = 'http://127.0.0.1:4300';
const ISSUER = `${BROKER_ORIGIN}/api/sso`;
const USER_ID = '95c1d3df-226a-4e6f-9db5-f0f7f0db9749';
const CONTEXT_ID = '9fcadd06-a3cb-43c2-8d1f-7c17147d0e68';
const BINDING: PlatformHandoffBinding = Object.freeze({
  contractVersion: 'jenfu.sso-handoff.v4',
  manifestSha256: 'a'.repeat(64),
  issuer: ISSUER,
  audience: 'projed',
});
const PIN: IdentityContractPin = Object.freeze({ ...BINDING });
const CODE = Buffer.alloc(32, 17).toString('base64url');

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function identityAt(nowMs: number, overrides: Partial<ProducerVerifiedIdentity> = {}): ProducerVerifiedIdentity {
  return Object.freeze({
    contractVersion: BINDING.contractVersion,
    manifestSha256: BINDING.manifestSha256,
    issuer: BINDING.issuer,
    audience: BINDING.audience,
    identityIssuer: 'https://accounts.google.com',
    identitySubject: 'google-subject-001',
    principalId: 'projed-principal-001',
    principalKind: 'personal',
    googleSubject: 'google-subject-001',
    employeeId: null,
    authEpoch: 4,
    authenticatedAtMs: nowMs - 30_000,
    revokedBeforeMs: null,
    sourceSessionExpiresAtMs: nowMs + 8 * 60 * 60 * 1000,
    issuedAtMs: nowMs - 1_000,
    expiresAtMs: nowMs + 60_000,
    currentStateExpiresAtMs: nowMs + 10_000,
    mappingRevision: '7',
    ...overrides,
  });
}

function stateFor(identity: ProducerVerifiedIdentity, readAtMs: number): PlatformPrincipalState {
  return Object.freeze({
    contractVersion: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion,
    principalId: identity.principalId,
    principalKind: identity.principalKind,
    employeeId: identity.employeeId,
    identityIssuer: identity.identityIssuer,
    identitySubject: identity.identitySubject,
    googleSubject: identity.googleSubject,
    mappingRevision: identity.mappingRevision,
    authEpoch: identity.authEpoch,
    revokedBefore: identity.revokedBeforeMs === null ? null : new Date(identity.revokedBeforeMs).toISOString(),
    readAt: new Date(readAtMs).toISOString(),
  });
}

class FakeAppSessionStore implements AppSessionStore {
  readonly intents = new Map<string, StoredLoginIntent>();
  readonly sessions = new Map<string, StoredAppSession>();
  readonly calls: string[] = [];
  claimUnknownAfterCommit = false;
  completeUnknownAfterCommit = false;
  cancelRaceToConsumed = false;

  async begin(intent: StoredLoginIntent): Promise<void> {
    this.calls.push('begin');
    if (intent.oldSessionHash !== null) {
      for (const [hash, existing] of this.intents) {
        if (existing.oldSessionHash === intent.oldSessionHash
            && (existing.status === 'pending' || existing.status === 'processing')) {
          this.intents.set(hash, { ...existing, status: 'cancelled', claimHash: null, codeVerifier: null });
        }
      }
    }
    if (this.intents.has(intent.tokenHash)) throw new Error('duplicate intent');
    this.intents.set(intent.tokenHash, { ...intent });
  }

  async readLogin(tokenHash: string): Promise<StoredLoginIntent | null> {
    this.calls.push('readLogin');
    const intent = this.intents.get(tokenHash);
    return intent ? { ...intent } : null;
  }

  async claim(tokenHash: string, stateHash: string, claimHash: string, nowMs: number): Promise<StoredLoginIntent> {
    this.calls.push('claim');
    const intent = this.intents.get(tokenHash);
    if (!intent || intent.status !== 'pending' || intent.expiresAtMs <= nowMs || intent.stateHash !== stateHash) {
      throw new KernelError('ACTOR_CHANGED', 'intent lost', 409);
    }
    const claimed = { ...intent, status: 'processing' as const, claimHash };
    this.intents.set(tokenHash, claimed);
    if (this.claimUnknownAfterCommit) {
      this.claimUnknownAfterCommit = false;
      throw new KernelError('DB_COMMIT_UNKNOWN', 'claim result unknown', 503);
    }
    return { ...claimed };
  }

  async cancel(tokenHash: string, publicOrigin: string, _nowMs: number): Promise<StoredLoginIntent | null> {
    this.calls.push('cancel');
    const intent = this.intents.get(tokenHash);
    if (!intent || intent.publicOrigin !== publicOrigin) return null;
    if (this.cancelRaceToConsumed) {
      this.cancelRaceToConsumed = false;
      const consumed = {
        ...intent,
        status: 'consumed' as const,
        claimHash: null,
        codeVerifier: null,
        completedSessionHash: 'f'.repeat(64),
      };
      this.intents.set(tokenHash, consumed);
      return { ...consumed };
    }
    if (intent.status === 'pending' || intent.status === 'processing') {
      const cancelled = { ...intent, status: 'cancelled' as const, claimHash: null, codeVerifier: null };
      this.intents.set(tokenHash, cancelled);
      return { ...cancelled };
    }
    return { ...intent };
  }

  async reject(tokenHash: string, claimHash: string): Promise<void> {
    this.calls.push('reject');
    const intent = this.intents.get(tokenHash);
    if (intent?.status === 'processing' && intent.claimHash === claimHash) {
      this.intents.set(tokenHash, { ...intent, status: 'rejected' });
    }
  }

  async complete(input: CompleteLoginInput): Promise<StoredAppSession> {
    this.calls.push('complete');
    const intent = this.intents.get(input.tokenHash);
    if (!intent || intent.status !== 'processing' || intent.stateHash !== input.stateHash
        || intent.claimHash !== input.claimHash || intent.expiresAtMs <= input.nowMs) {
      throw new KernelError('ACTOR_CHANGED', 'completion lost cancellation fence', 409);
    }
    if (intent.oldSessionHash) {
      const oldSession = this.sessions.get(intent.oldSessionHash);
      if (!oldSession || oldSession.revokedAtMs !== null || oldSession.publicOrigin !== intent.publicOrigin) {
        throw new KernelError('ACTOR_CHANGED', 'old session changed', 409);
      }
      if (oldSession.entry !== intent.entry) throw new KernelError('ACTOR_CHANGED', 'old Session entry changed', 409);
      this.sessions.set(intent.oldSessionHash, { ...oldSession, revokedAtMs: input.nowMs });
    }
    const session: StoredAppSession = Object.freeze({
      tokenHash: input.sessionTokenHash,
      publicOrigin: intent.publicOrigin,
      entry: intent.entry,
      localUserId: input.verified.actor.localUserId,
      contextId: input.contextId,
      accountGuardRevision: input.verified.actor.accountGuardRevision,
      identity: input.verified.identity,
      expiresAtMs: input.verified.identity.sourceSessionExpiresAtMs,
      revokedAtMs: null,
    });
    this.sessions.set(session.tokenHash, session);
    this.intents.set(input.tokenHash, {
      ...intent,
      status: 'consumed',
      claimHash: null,
      codeVerifier: null,
      completedSessionHash: session.tokenHash,
    });
    if (this.completeUnknownAfterCommit) {
      this.completeUnknownAfterCommit = false;
      throw new KernelError('DB_COMMIT_UNKNOWN', 'completion result unknown', 503);
    }
    return { ...session };
  }

  async readSession(tokenHash: string): Promise<StoredAppSession | null> {
    this.calls.push('readSession');
    const session = this.sessions.get(tokenHash);
    return session ? { ...session } : null;
  }

  async revokeSession(tokenHash: string, publicOrigin: string, nowMs: number): Promise<boolean> {
    this.calls.push('revokeSession');
    const session = this.sessions.get(tokenHash);
    if (!session || session.publicOrigin !== publicOrigin || session.revokedAtMs !== null) {
      return false;
    }
    this.sessions.set(tokenHash, { ...session, revokedAtMs: nowMs });
    return true;
  }

  seedSession(session: StoredAppSession): void {
    this.sessions.set(session.tokenHash, { ...session });
  }
}

type Fixture = ReturnType<typeof fixture>;

function fixture(input: { pins?: readonly IdentityContractPin[]; origins?: { main: string; quick: string } } = {}) {
  let nowMs = Date.now();
  let identity = identityAt(nowMs);
  let state = stateFor(identity, nowMs);
  let stateUnavailable = false;
  let stateReadCount = 0;
  let mappingReadCount = 0;
  let producerCallCount = 0;
  const producerInputs: unknown[] = [];
  let contextCallCount = 0;
  let verifyGate: (() => Promise<void>) | null = null;
  const store = new FakeAppSessionStore();
  const pins = input.pins ?? [PIN];
  const origins = input.origins ?? { main: MAIN_ORIGIN, quick: QUICK_ORIGIN };
  const mappings = {
    async resolve(key: Pick<ProducerVerifiedIdentity, 'principalId' | 'identityIssuer' | 'identitySubject' | 'googleSubject' | 'mappingRevision'>) {
      mappingReadCount += 1;
      assert.deepEqual(key, {
        principalId: identity.principalId,
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        googleSubject: identity.googleSubject,
        mappingRevision: identity.mappingRevision,
      });
      return {
        status: 'active' as const,
        principalId: identity.principalId,
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        googleSubject: identity.googleSubject,
        mappingRevision: identity.mappingRevision,
        localUserId: USER_ID,
        accountGuardRevision: '3',
      };
    },
  };
  const consumer = new IdentityConsumer({
    pins,
    verifier: {
      async verify(producerInput) {
        producerCallCount += 1;
        producerInputs.push(producerInput);
        if (verifyGate) await verifyGate();
        return identity;
      },
    },
    mappings,
    now: () => nowMs,
    createContextId: () => {
      contextCallCount += 1;
      return CONTEXT_ID;
    },
  });
  const states = {
    async readCurrent(key: { identityIssuer: string; identitySubject: string; principalId: string }) {
      stateReadCount += 1;
      if (stateUnavailable) throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'state unavailable', 503);
      assert.deepEqual(key, {
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        principalId: identity.principalId,
      });
      return state;
    },
  };
  const service = createAppSessionService({
    store,
    consumer,
    states,
    mappings,
    binding: BINDING,
    pins,
    origins,
    environment: 'test',
    now: () => nowMs,
  });

  return {
    service,
    store,
    origins,
    setNow(value: number) {
      nowMs = value;
      state = stateFor(identity, nowMs);
    },
    setIdentity(next: ProducerVerifiedIdentity) {
      identity = next;
      state = stateFor(identity, nowMs);
    },
    setState(next: PlatformPrincipalState) { state = next; },
    setStateUnavailable(value: boolean) { stateUnavailable = value; },
    setVerifyGate(gate: (() => Promise<void>) | null) { verifyGate = gate; },
    counts: () => ({ stateReadCount, mappingReadCount, producerCallCount, contextCallCount }),
    producerInputs,
    identity: () => identity,
    now: () => nowMs,
  };
}

function request(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body = '',
): IncomingMessage {
  const stream = Readable.from(body.length > 0 ? [Buffer.from(body)] : []);
  return Object.assign(stream, { method, url, headers }) as unknown as IncomingMessage;
}

function host(origin: string): string {
  return new URL(origin).host;
}

function cookieValue(result: { headers?: Readonly<Record<string, string>> }): string {
  const setCookie = result.headers?.['set-cookie'];
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0]!;
}

function tokensFromCookie(cookie: string) {
  return parseSessionCookie({ headers: { cookie } });
}

function loginRequest(
  publicOrigin: string,
  entry: 'main' | 'quick',
  cookie?: string,
  returnPath?: string,
): IncomingMessage {
  const body = JSON.stringify({ entry, ...(returnPath === undefined ? {} : { returnPath }) });
  return request('POST', '/api/v1/session/login', {
    origin: publicOrigin,
    host: host(publicOrigin),
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
    ...(cookie ? { cookie } : {}),
  }, body);
}

function callbackRequest(publicOrigin: string, cookie: string, state: string, issuer = ISSUER): IncomingMessage {
  return callbackQueryRequest(publicOrigin, cookie, [['code', CODE], ['state', state], ['iss', issuer]]);
}

function callbackQueryRequest(
  publicOrigin: string,
  cookie: string,
  entries: readonly (readonly [string, string])[],
): IncomingMessage {
  const query = new URLSearchParams(entries.map(([name, value]): [string, string] => [name, value]));
  return request('GET', `/api/auth/jenfu-sso/callback?${query}`, {
    host: host(publicOrigin),
    cookie,
  });
}

function callbackCancelRequest(publicOrigin: string, cookie: string, state: string, issuer = ISSUER): IncomingMessage {
  return callbackQueryRequest(publicOrigin, cookie, [['error', 'access_denied'], ['state', state], ['iss', issuer]]);
}

function logoutRequest(publicOrigin: string, cookie: string): IncomingMessage {
  return request('POST', '/api/v1/session/logout', {
    host: host(publicOrigin),
    origin: publicOrigin,
    'sec-fetch-site': 'same-origin',
    cookie,
    'x-projed-expected-account-id': USER_ID,
    'x-projed-expected-context-id': CONTEXT_ID,
  });
}

async function start(f: Fixture, entry: 'main' | 'quick' = 'main', cookie?: string, returnPath?: string) {
  const result = await f.service.dispatchAuth(
    loginRequest(f.origins[entry], entry, cookie, returnPath),
    'login-request',
  );
  return result;
}

function authorizationFrom(result: Awaited<ReturnType<Fixture['service']['dispatchAuth']>>): URL {
  assert.equal(result.status, 200);
  const body = result.body as { data: { authorizationUrl: string } };
  return new URL(body.data.authorizationUrl);
}

function intentFrom(f: Fixture, cookie: string): StoredLoginIntent {
  const tokens = tokensFromCookie(cookie);
  assert.ok(tokens.loginToken);
  const intent = f.store.intents.get(digest(tokens.loginToken));
  assert.ok(intent);
  return intent;
}

test('personal login creates exact authorize URL and one callback yields an eight-hour AppSession', async () => {
  const f = fixture();
  const login = await start(f, 'main', undefined, '/boards?view=mine');
  const authorize = authorizationFrom(login);
  assert.equal(authorize.origin, BROKER_ORIGIN);
  assert.equal(authorize.pathname, '/api/sso/authorize');
  assert.deepEqual([...authorize.searchParams.keys()], [
    'response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method',
  ]);
  assert.equal(authorize.searchParams.get('client_id'), 'projed');
  assert.equal(authorize.searchParams.get('response_type'), 'code');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${MAIN_ORIGIN}/api/auth/jenfu-sso/callback`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(Buffer.byteLength(authorize.toString()), authorize.toString().length);
  assert.ok(Buffer.byteLength(authorize.toString()) <= 1024);

  const cookie = cookieValue(login);
  const tokens = tokensFromCookie(cookie);
  assert.ok(tokens.loginToken);
  assert.equal(tokens.sessionToken, undefined);
  const intent = intentFrom(f, cookie);
  assert.equal(intent.status, 'pending');
  assert.equal(intent.expiresAtMs, f.now() + 5 * 60 * 1000);
  assert.ok(intent.codeVerifier);
  assert.equal(authorize.searchParams.get('state')?.length, 43);
  assert.equal(authorize.searchParams.get('code_challenge'), createHash('sha256').update(intent.codeVerifier!, 'ascii').digest('base64url'));
  assert.equal((login.body as { data: { authorizationUrl: string } }).data.authorizationUrl.includes(intent.codeVerifier!), false);
  assert.equal(JSON.stringify(login.body).includes(tokens.loginToken!), false);

  const callback = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookie, authorize.searchParams.get('state')!),
    'callback-request',
  );
  assert.equal(callback.status, 303);
  assert.equal(callback.headers?.location, `${MAIN_ORIGIN}/boards?view=mine`);
  assert.match(callback.headers?.['set-cookie'] ?? '', /^__session=[A-Za-z0-9_-]{43};/u);
  const newCookie = cookieValue(callback);
  const sessionToken = tokensFromCookie(newCookie).sessionToken;
  assert.ok(sessionToken);
  assert.equal(tokensFromCookie(newCookie).loginToken, undefined);
  const stored = f.store.sessions.get(digest(sessionToken));
  assert.ok(stored);
  assert.equal(stored.identity.principalKind, 'personal');
  assert.equal(stored.identity.employeeId, null);
  assert.equal(stored.expiresAtMs, f.identity().sourceSessionExpiresAtMs);
  assert.equal(stored.contextId, CONTEXT_ID);
  assert.equal(f.store.intents.get(intent.tokenHash)?.status, 'consumed');
  assert.equal(f.counts().producerCallCount, 1);
  assert.deepEqual(f.producerInputs[0], {
    entry: 'main', code: CODE, codeVerifier: intent.codeVerifier,
  });

  const replay = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookie, authorize.searchParams.get('state')!),
    'callback-replay',
  );
  assert.equal(replay.status, 409);
  assert.match(replay.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(f.counts().producerCallCount, 1);
});

test('owner-v4 verified email survives Session shape and unknown-completion readback', async () => {
  const f = fixture();
  f.setIdentity(identityAt(f.now(), { verifiedEmail: 'person@example.test' }));
  f.store.completeUnknownAfterCommit = true;
  const login = await start(f);
  const authorize = authorizationFrom(login);
  const callback = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'verified-email-callback',
  );

  assert.equal(callback.status, 303);
  const sessionToken = tokensFromCookie(cookieValue(callback)).sessionToken;
  assert.ok(sessionToken);
  assert.equal(f.store.sessions.get(digest(sessionToken))?.identity.verifiedEmail, 'person@example.test');
  assert.equal(f.counts().producerCallCount, 1);
});

test('broker access_denied callback cancels the pending intent and returns to the exact app path', async () => {
  const f = fixture();
  const login = await start(f, 'main', undefined, '/boards?view=mine');
  const authorize = authorizationFrom(login);
  const intent = intentFrom(f, cookieValue(login));
  const before = f.counts();

  const cancelled = await f.service.dispatchAuth(
    callbackCancelRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'cancel-callback',
  );

  assert.equal(cancelled.status, 303);
  assert.equal(cancelled.headers?.location, `${MAIN_ORIGIN}/boards?view=mine`);
  assert.match(cancelled.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(f.store.intents.get(intent.tokenHash)?.status, 'cancelled');
  assert.ok(f.store.calls.includes('cancel'));
  assert.deepEqual(f.counts(), before);
});

test('broker access_denied callback cancels a processing intent before it can complete', async () => {
  const f = fixture();
  const login = await start(f);
  const authorize = authorizationFrom(login);
  const intent = intentFrom(f, cookieValue(login));
  const claimHash = digest('in-flight-callback');
  const processing = await f.store.claim(intent.tokenHash, intent.stateHash, claimHash, f.now());
  assert.equal(processing.status, 'processing');

  const cancelled = await f.service.dispatchAuth(
    callbackCancelRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'cancel-processing-callback',
  );

  assert.equal(cancelled.status, 303);
  const stored = f.store.intents.get(intent.tokenHash);
  assert.equal(stored?.status, 'cancelled');
  assert.equal(stored?.claimHash, null);
  assert.equal(stored?.codeVerifier, null);
  assert.equal(f.store.calls.filter((call) => call === 'cancel').length, 1);
  assert.equal(f.store.calls.includes('complete'), false);
  assert.equal(f.counts().producerCallCount, 0);
});

test('broker cancellation preserves a valid existing Session without checking current account state', async () => {
  const f = fixture();
  const oldToken = Buffer.alloc(32, 121).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity: f.identity(),
    expiresAtMs: f.now() + 60 * 60 * 1000, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const login = await start(f, 'main', `__session=${oldToken}`, '/tasks');
  const authorize = authorizationFrom(login);
  const intent = intentFrom(f, cookieValue(login));
  const before = f.counts();

  const cancelled = await f.service.dispatchAuth(
    callbackCancelRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'cancel-existing-session',
  );

  assert.equal(cancelled.status, 303);
  assert.equal(cancelled.headers?.location, `${MAIN_ORIGIN}/tasks`);
  const returnedTokens = tokensFromCookie(cookieValue(cancelled));
  assert.equal(returnedTokens.sessionToken, oldToken);
  assert.equal(returnedTokens.loginToken, undefined);
  assert.equal(f.store.sessions.get(intent.oldSessionHash!)?.revokedAtMs, null);
  assert.equal(f.store.intents.get(intent.tokenHash)?.status, 'cancelled');
  assert.deepEqual(f.counts(), before);
});

test('broker cancellation accepts only exact access_denied callback keys and issuer', async () => {
  const invalidCaseNames = ['unknown error', 'mixed success and cancel', 'duplicate state', 'extra field', 'wrong issuer'];
  for (const [index, name] of invalidCaseNames.entries()) {
    const f = fixture();
    const login = await start(f);
    const authorize = authorizationFrom(login);
    const state = authorize.searchParams.get('state')!;
    const invalidQueries: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
      [['error', 'consent_required'], ['state', state], ['iss', ISSUER]],
      [['error', 'access_denied'], ['code', CODE], ['state', state], ['iss', ISSUER]],
      [['error', 'access_denied'], ['state', state], ['state', state], ['iss', ISSUER]],
      [['error', 'access_denied'], ['state', state], ['iss', ISSUER], ['extra', 'value']],
      [['error', 'access_denied'], ['state', state], ['iss', `${ISSUER}/wrong`]],
    ];
    const rejected = await f.service.dispatchAuth(
      callbackQueryRequest(MAIN_ORIGIN, cookieValue(login), invalidQueries[index]!),
      `invalid-cancel-${index}`,
    );
    assert.equal(rejected.status, 401, name);
    assert.equal(f.store.intents.get(intentFrom(f, cookieValue(login)).tokenHash)?.status, 'pending', name);
    assert.equal(f.store.calls.includes('cancel'), false, name);
    assert.equal(f.counts().producerCallCount, 0, name);
  }
});

test('cancellation race with a consumed intent uses consumed recovery and never reports cancel success', async () => {
  const f = fixture();
  const login = await start(f);
  const authorize = authorizationFrom(login);
  const intent = intentFrom(f, cookieValue(login));
  f.store.cancelRaceToConsumed = true;

  const result = await f.service.dispatchAuth(
    callbackCancelRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'cancel-consumed-race',
  );

  assert.equal(result.status, 409);
  assert.match(result.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(result.headers?.location, undefined);
  assert.equal(f.store.intents.get(intent.tokenHash)?.status, 'consumed');
  assert.equal(f.counts().producerCallCount, 0);
});

test('claim and complete commit-unknown readbacks resume once without retry or duplicate exchange', async () => {
  const f = fixture();
  f.store.claimUnknownAfterCommit = true;
  f.store.completeUnknownAfterCommit = true;
  const login = await start(f);
  const authorize = authorizationFrom(login);
  const callback = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'unknown-commit-callback',
  );
  assert.equal(callback.status, 303);
  assert.equal(f.store.calls.filter((call) => call === 'claim').length, 1);
  assert.equal(f.store.calls.filter((call) => call === 'complete').length, 1);
  assert.equal(f.store.calls.filter((call) => call === 'readLogin').length, 3);
  assert.equal(f.store.calls.filter((call) => call === 'readSession').length, 1);
  assert.equal(f.counts().producerCallCount, 1);
  assert.ok(f.store.sessions.has(digest(tokensFromCookie(cookieValue(callback)).sessionToken!)));
});

test('login preserves a valid same-origin Session cookie and cancellation removes only the pending nonce', async () => {
  const f = fixture({ origins: { main: MAIN_ORIGIN, quick: MAIN_ORIGIN } });
  const oldToken = Buffer.alloc(32, 31).toString('base64url');
  const oldIdentity = f.identity();
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken),
    publicOrigin: MAIN_ORIGIN,
    entry: 'main',
    localUserId: USER_ID,
    contextId: CONTEXT_ID,
    accountGuardRevision: '3',
    identity: oldIdentity,
    expiresAtMs: f.now() + 60 * 60 * 1000,
    revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const oldCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: oldToken,
    expiresAtMs: oldSession.expiresAtMs, sourceSessionExpiresAtMs: oldIdentity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;

  const login = await start(f, 'quick', oldCookie);
  assert.equal(login.status, 200);
  const pendingCookie = cookieValue(login);
  assert.equal(intentFrom(f, pendingCookie).entry, 'main');
  assert.equal(tokensFromCookie(pendingCookie).sessionToken, oldToken);
  assert.ok(tokensFromCookie(pendingCookie).loginToken);
  assert.match(login.headers?.['set-cookie'] ?? '', /Max-Age=3600/u);

  const tokens = tokensFromCookie(pendingCookie);
  const cancelled = await f.service.dispatchAuth(request('POST', '/api/v1/session/login/cancel', {
    origin: MAIN_ORIGIN,
    host: host(MAIN_ORIGIN),
    'sec-fetch-site': 'same-origin',
    cookie: pendingCookie,
  }), 'cancel-request');
  assert.equal(cancelled.status, 200);
  const afterCancel = tokensFromCookie(cookieValue(cancelled));
  assert.equal(afterCancel.sessionToken, oldToken);
  assert.equal(afterCancel.loginToken, undefined);
  assert.equal(f.store.sessions.get(digest(oldToken))?.revokedAtMs, null);
  assert.equal(f.store.intents.get(digest(tokens.loginToken!))?.status, 'cancelled');

  const replacementLogin = await start(f, 'quick', cookieValue(cancelled));
  const replacementUrl = authorizationFrom(replacementLogin);
  assert.equal(intentFrom(f, cookieValue(replacementLogin)).entry, 'main');
  const replacement = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookieValue(replacementLogin), replacementUrl.searchParams.get('state')!),
    'replacement-callback',
  );
  assert.equal(replacement.status, 303);
  const replacementToken = tokensFromCookie(cookieValue(replacement)).sessionToken!;
  assert.equal(f.store.sessions.get(digest(replacementToken))?.entry, 'main');
  assert.notEqual(f.store.sessions.get(digest(oldToken))?.revokedAtMs, null);
});

test('bad origin, state or issuer fails without consuming producer proof or replacing the old cookie', async () => {
  const f = fixture();
  const forgedOrigin = await f.service.dispatchAuth(loginRequest(QUICK_ORIGIN, 'main'), 'bad-origin');
  assert.equal(forgedOrigin.status, 403);
  assert.equal(f.store.calls.includes('begin'), false);

  const oldToken = Buffer.alloc(32, 51).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity: f.identity(),
    expiresAtMs: f.now() + 2 * 60 * 60 * 1000, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const oldCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: oldToken,
    expiresAtMs: oldSession.expiresAtMs, sourceSessionExpiresAtMs: oldSession.identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;
  const login = await start(f, 'main', oldCookie);
  const authorize = authorizationFrom(login);
  const cookie = cookieValue(login);
  const wrongIssuer = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookie, authorize.searchParams.get('state')!, `${ISSUER}/wrong`),
    'wrong-issuer',
  );
  assert.equal(wrongIssuer.status, 401);
  assert.equal(wrongIssuer.headers?.['set-cookie'], undefined);
  assert.equal(f.store.sessions.get(digest(oldToken))?.revokedAtMs, null);
  assert.equal(f.counts().producerCallCount, 0);

  const wrongOriginCallback = await f.service.dispatchAuth(
    callbackRequest(QUICK_ORIGIN, cookie, authorize.searchParams.get('state')!),
    'wrong-callback-origin',
  );
  assert.equal(wrongOriginCallback.status, 401);
  assert.equal(wrongOriginCallback.headers?.['set-cookie'], undefined);
  assert.equal(f.counts().producerCallCount, 0);

  const wrongState = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookie, Buffer.alloc(32, 44).toString('base64url')),
    'wrong-state',
  );
  assert.equal(wrongState.status, 401);
  assert.equal(wrongState.headers?.['set-cookie'], undefined);
  assert.equal(f.counts().producerCallCount, 0);
});

test('an existing login nonce is cancelled before a replacement starts and fences an in-flight callback', async () => {
  const f = fixture();
  const first = await start(f);
  const firstUrl = authorizationFrom(first);
  const firstCookie = cookieValue(first);
  const firstTokens = tokensFromCookie(firstCookie);
  assert.ok(firstTokens.loginToken);

  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  f.setVerifyGate(async () => { markStarted(); await gate; });
  const callbackPromise = f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, firstCookie, firstUrl.searchParams.get('state')!),
    'callback-racing',
  );
  await started;

  const second = await start(f, 'main', firstCookie);
  assert.equal(second.status, 200);
  const secondCookie = cookieValue(second);
  const secondTokens = tokensFromCookie(secondCookie);
  assert.ok(secondTokens.loginToken);
  assert.notEqual(secondTokens.loginToken, firstTokens.loginToken);
  assert.equal(f.store.intents.get(digest(firstTokens.loginToken))?.status, 'cancelled');

  release();
  const firstCallback = await callbackPromise;
  assert.equal(firstCallback.status, 409);
  assert.equal(f.store.sessions.size, 0);
  assert.equal(f.counts().producerCallCount, 1);
  assert.equal(intentFrom(f, secondCookie).status, 'pending');
});

test('Session requests reread current state once per request and preserve stored entry/context and long expiry', async () => {
  const f = fixture({ origins: { main: MAIN_ORIGIN, quick: MAIN_ORIGIN } });
  const login = await start(f, 'quick');
  const authorize = authorizationFrom(login);
  const callback = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, cookieValue(login), authorize.searchParams.get('state')!),
    'callback-quick',
  );
  assert.equal(callback.status, 303);
  const sessionCookie = cookieValue(callback);
  const token = tokensFromCookie(sessionCookie).sessionToken!;
  const session = f.store.sessions.get(digest(token))!;

  const requestOne = request('GET', '/api/v1/session', { host: host(MAIN_ORIGIN), cookie: sessionCookie });
  const actorOne = await f.service.resolveActor(requestOne);
  const infoOne = await f.service.resolveSessionInfo(requestOne, actorOne);
  assert.equal(actorOne.entry, 'quick');
  assert.equal(actorOne.contextId, session.contextId);
  assert.ok(actorOne.expiresAtMs > f.now());
  assert.ok(actorOne.expiresAtMs <= f.now() + 10_000);
  assert.equal(infoOne.expiresAtMs, session.expiresAtMs);
  assert.equal(infoOne.expiresAtMs, f.identity().sourceSessionExpiresAtMs);
  assert.equal(f.counts().stateReadCount, 1);
  const mappingCountAfterRequestOne = f.counts().mappingReadCount;

  const nextNow = f.now() + 1_000;
  f.setNow(nextNow);
  const requestTwo = request('GET', '/api/v1/session', { host: host(MAIN_ORIGIN), cookie: sessionCookie });
  const actorTwo = await f.service.resolveActor(requestTwo);
  assert.equal(actorTwo.contextId, actorOne.contextId);
  assert.equal(f.counts().stateReadCount, 2);
  assert.equal(f.counts().mappingReadCount, mappingCountAfterRequestOne + 1);

  const beforeMapping = f.counts().mappingReadCount;
  const changedIdentity = identityAt(nextNow, { authEpoch: f.identity().authEpoch + 1 });
  f.setState(stateFor(changedIdentity, nextNow));
  const driftRequest = request('GET', '/api/v1/session', { host: host(MAIN_ORIGIN), cookie: sessionCookie });
  await assert.rejects(f.service.resolveActor(driftRequest), (error: unknown) =>
    error instanceof KernelError && error.code === 'IDENTITY_INVALID');
  assert.equal(f.counts().stateReadCount, 3);
  assert.equal(f.counts().mappingReadCount, beforeMapping);
});

test('wrong-origin prior Session stays untouched while confirmed revoked or missing rows clear for re-login', async () => {
  const f = fixture();
  const sessionToken = Buffer.alloc(32, 77).toString('base64url');
  const identity = f.identity();
  const foreign: StoredAppSession = {
    tokenHash: digest(sessionToken), publicOrigin: QUICK_ORIGIN, entry: 'quick', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity,
    expiresAtMs: f.now() + 60_000, revokedAtMs: null,
  };
  f.store.seedSession(foreign);
  const cookie = setSessionCookie({
    environment: 'test', publicOrigin: QUICK_ORIGIN, sessionToken,
    expiresAtMs: foreign.expiresAtMs, sourceSessionExpiresAtMs: identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;
  const foreignResult = await start(f, 'main', cookie);
  assert.equal(foreignResult.status, 401);
  assert.equal(foreignResult.headers?.['set-cookie'], undefined);
  assert.equal(f.store.calls.includes('begin'), false);

  f.store.seedSession({ ...foreign, publicOrigin: MAIN_ORIGIN, entry: 'main', revokedAtMs: f.now() });
  const revokedResult = await start(f, 'main', cookie);
  assert.equal(revokedResult.status, 409);
  assert.match(revokedResult.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(f.store.calls.includes('begin'), false);

  const missingToken = Buffer.alloc(32, 78).toString('base64url');
  const missingCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: missingToken,
    expiresAtMs: f.now() + 60_000, sourceSessionExpiresAtMs: identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;
  const missingResult = await start(f, 'main', missingCookie);
  assert.equal(missingResult.status, 409);
  assert.match(missingResult.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(f.store.calls.includes('begin'), false);
});

test('global epoch drift blocks private reads but not login start or pending-login cancellation', async () => {
  const f = fixture();
  const identity = f.identity();
  const oldToken = Buffer.alloc(32, 111).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity,
    expiresAtMs: identity.sourceSessionExpiresAtMs, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const oldCookie = `__session=${oldToken}`;
  f.setState(stateFor(identityAt(f.now(), { authEpoch: identity.authEpoch + 1 }), f.now()));

  await assert.rejects(f.service.resolveActor(request('GET', '/api/v1/session', {
    host: host(MAIN_ORIGIN), cookie: oldCookie,
  })), (error: unknown) => error instanceof KernelError && error.code === 'IDENTITY_INVALID');
  const before = f.counts();
  const login = await start(f, 'main', oldCookie);
  assert.equal(login.status, 200);
  assert.deepEqual(f.counts(), before);

  const cancelled = await f.service.dispatchAuth(request('POST', '/api/v1/session/login/cancel', {
    host: host(MAIN_ORIGIN), origin: MAIN_ORIGIN, 'sec-fetch-site': 'same-origin',
    cookie: cookieValue(login),
  }), 'cancel-after-epoch-drift');
  assert.equal(cancelled.status, 200);
  const remaining = tokensFromCookie(cookieValue(cancelled));
  assert.equal(remaining.sessionToken, oldToken);
  assert.equal(remaining.loginToken, undefined);
  assert.deepEqual(f.counts(), before);
});

test('expired source Session can be locally logged out without current-state lookup', async () => {
  const f = fixture();
  const identity = f.identity();
  const oldToken = Buffer.alloc(32, 112).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity,
    expiresAtMs: identity.sourceSessionExpiresAtMs, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  f.setNow(identity.sourceSessionExpiresAtMs + 1);
  f.setStateUnavailable(true);
  const req = logoutRequest(MAIN_ORIGIN, `__session=${oldToken}`);
  const logoutIdentity = await f.service.resolveLogoutIdentity(req);
  assert.deepEqual(logoutIdentity, { localUserId: USER_ID, contextId: CONTEXT_ID });
  const expiredLogin = await start(f, 'main', `__session=${oldToken}`);
  assert.equal(expiredLogin.status, 409);
  assert.match(expiredLogin.headers?.['set-cookie'] ?? '', /^__session=;/u);
  assert.equal(f.store.calls.includes('begin'), false);
  assert.equal((await start(f)).status, 200);
  const result = await f.service.destroySession(req);
  assert.match(result.clearCookie, /^__session=;/u);
  assert.equal(f.store.sessions.get(oldSession.tokenHash)?.revokedAtMs, f.now());
  assert.equal(f.counts().stateReadCount, 0);
  assert.equal(f.counts().mappingReadCount, 0);
});

test('local logout ignores unavailable current-state service and a lost revoke fence never clears', async () => {
  const f = fixture();
  const oldToken = Buffer.alloc(32, 113).toString('base64url');
  const identity = f.identity();
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity,
    expiresAtMs: identity.sourceSessionExpiresAtMs, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const req = logoutRequest(MAIN_ORIGIN, `__session=${oldToken}`);
  f.setStateUnavailable(true);
  await assert.rejects(f.service.resolveActor(request('GET', '/api/v1/session', {
    host: host(MAIN_ORIGIN), cookie: `__session=${oldToken}`,
  })), (error: unknown) => error instanceof KernelError && error.code === 'IDENTITY_STATE_UNAVAILABLE');
  const stateReads = f.counts().stateReadCount;
  await f.service.resolveLogoutIdentity(req);
  const result = await f.service.destroySession(req);
  assert.match(result.clearCookie, /^__session=;/u);
  assert.equal(f.counts().stateReadCount, stateReads);

  const staleToken = Buffer.alloc(32, 114).toString('base64url');
  const staleSession = { ...oldSession, tokenHash: digest(staleToken), revokedAtMs: null };
  f.store.seedSession(staleSession);
  const staleReq = logoutRequest(MAIN_ORIGIN, `__session=${staleToken}`);
  await f.service.resolveLogoutIdentity(staleReq);
  f.store.sessions.set(staleSession.tokenHash, { ...staleSession, revokedAtMs: f.now() });
  await assert.rejects(f.service.destroySession(staleReq), (error: unknown) =>
    error instanceof KernelError && error.code === 'ACTOR_CHANGED' && error.httpStatus === 409);
  assert.equal(f.store.sessions.get(staleSession.tokenHash)?.revokedAtMs, f.now());
});

test('a new login retires an expired orphan intent for the same existing Session', async () => {
  const f = fixture();
  const oldToken = Buffer.alloc(32, 62).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity: f.identity(),
    expiresAtMs: f.now() + 60 * 60 * 1000, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const orphanToken = Buffer.alloc(32, 63).toString('base64url');
  const orphanState = Buffer.alloc(32, 64).toString('base64url');
  const orphan: StoredLoginIntent = {
    tokenHash: digest(orphanToken), stateHash: digest(orphanState), entry: 'main', publicOrigin: MAIN_ORIGIN,
    returnPath: '/', oldSessionHash: oldSession.tokenHash, codeVerifier: Buffer.alloc(32, 65).toString('base64url'),
    status: 'pending', claimHash: null, completedSessionHash: null, expiresAtMs: f.now() - 1,
  };
  await f.store.begin(orphan);
  const oldCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: oldToken,
    expiresAtMs: oldSession.expiresAtMs, sourceSessionExpiresAtMs: oldSession.identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;

  const replacement = await start(f, 'main', oldCookie);
  assert.equal(replacement.status, 200);
  assert.equal(f.store.intents.get(orphan.tokenHash)?.status, 'cancelled');
  assert.ok(tokensFromCookie(cookieValue(replacement)).loginToken);
  assert.equal(f.counts().producerCallCount, 0);
});

test('logout cancels pending Login before revoking and only then returns the scoped clear-cookie value', async () => {
  const f = fixture();
  const oldToken = Buffer.alloc(32, 83).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity: f.identity(),
    expiresAtMs: f.now() + 60 * 60 * 1000, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const oldCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: oldToken,
    expiresAtMs: oldSession.expiresAtMs, sourceSessionExpiresAtMs: oldSession.identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;
  const login = await start(f, 'main', oldCookie);
  const pendingCookie = cookieValue(login);
  const pendingToken = tokensFromCookie(pendingCookie).loginToken!;
  const logoutRequestValue = logoutRequest(MAIN_ORIGIN, pendingCookie);
  await f.service.resolveLogoutIdentity(logoutRequestValue);
  const callsBefore = f.store.calls.length;
  const result = await f.service.destroySession(logoutRequestValue);
  assert.match(result.clearCookie, /^__session=;/u);
  assert.match(result.clearCookie, /Max-Age=0/u);
  const calls = f.store.calls.slice(callsBefore);
  assert.ok(calls.indexOf('cancel') >= 0 && calls.indexOf('revokeSession') > calls.indexOf('cancel'));
  assert.equal(f.store.intents.get(digest(pendingToken))?.status, 'cancelled');
  assert.notEqual(f.store.sessions.get(digest(oldToken))?.revokedAtMs, null);
});

test('logout cancel loses to a completed callback without revoking the new Session or returning a clear cookie', async () => {
  const f = fixture();
  const oldToken = Buffer.alloc(32, 92).toString('base64url');
  const oldSession: StoredAppSession = {
    tokenHash: digest(oldToken), publicOrigin: MAIN_ORIGIN, entry: 'main', localUserId: USER_ID,
    contextId: CONTEXT_ID, accountGuardRevision: '3', identity: f.identity(),
    expiresAtMs: f.now() + 60 * 60 * 1000, revokedAtMs: null,
  };
  f.store.seedSession(oldSession);
  const oldCookie = setSessionCookie({
    environment: 'test', publicOrigin: MAIN_ORIGIN, sessionToken: oldToken,
    expiresAtMs: oldSession.expiresAtMs, sourceSessionExpiresAtMs: oldSession.identity.sourceSessionExpiresAtMs,
    nowMs: f.now(),
  }).split(';', 1)[0]!;
  const login = await start(f, 'main', oldCookie);
  const authorize = authorizationFrom(login);
  const pendingCookie = cookieValue(login);
  const logoutRequestValue = logoutRequest(MAIN_ORIGIN, pendingCookie);
  const logoutIdentity = await f.service.resolveLogoutIdentity(logoutRequestValue);
  assert.equal(logoutIdentity.localUserId, USER_ID);

  const callback = await f.service.dispatchAuth(
    callbackRequest(MAIN_ORIGIN, pendingCookie, authorize.searchParams.get('state')!),
    'callback-before-logout',
  );
  assert.equal(callback.status, 303);
  const newToken = tokensFromCookie(cookieValue(callback)).sessionToken!;
  const beforeCalls = [...f.store.calls];
  await assert.rejects(f.service.destroySession(logoutRequestValue), (error: unknown) =>
    error instanceof KernelError && error.code === 'ACTOR_CHANGED' && error.httpStatus === 409);
  assert.deepEqual(f.store.calls.slice(beforeCalls.length), ['readLogin']);
  assert.equal(f.store.sessions.get(digest(newToken))?.revokedAtMs, null);
});

test('empty production pins expose 404 without store or producer access', async () => {
  const f = fixture({ pins: [] });
  const result = await start(f);
  assert.equal(result.status, 404);
  assert.equal(f.store.calls.length, 0);
  assert.equal(f.counts().producerCallCount, 0);
});
