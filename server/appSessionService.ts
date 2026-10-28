import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import { validateServerActor, type ServerActorV1 } from './actorTransaction.js';
import type { AppEntry } from './config.js';
import { readJsonBody } from './domainWriteHttp.js';
import { KernelError } from './errors.js';
import { assertExpectedActor } from './expectedActorHttp.js';
import type {
  ActivePrincipalMapping,
  IdentityContractPin,
  IdentityConsumer,
  PrincipalMappingResolver,
  ProducerVerifiedIdentity,
} from './identityConsumer.js';
import type { PlatformHandoffBinding } from './platformHandoff.js';
import {
  PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT,
  PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS,
  type PlatformPrincipalState,
  type PlatformPrincipalStateReader,
} from './platformPrincipalState.js';
import {
  clearSessionCookie,
  parseSessionCookie,
  setSessionCookie,
  type SessionCookieEnvironment,
  type SessionCookieTokens,
} from './sessionCookies.js';
import type {
  AppSessionStore,
  StoredAppSession,
  StoredLoginIntent,
} from './appSessionStore.js';

const LOGIN_PATH = '/api/v1/session/login';
const CANCEL_PATH = '/api/v1/session/login/cancel';
const CALLBACK_PATH = '/api/auth/jenfu-sso/callback';
const CALLBACK_QUERY_KEYS = ['code', 'error', 'state', 'iss'] as const;
const CALLBACK_SUCCESS_QUERY_KEYS = ['code', 'state', 'iss'] as const;
const CALLBACK_CANCEL_QUERY_KEYS = ['error', 'state', 'iss'] as const;
type ParsedCallback =
  | { readonly kind: 'success'; readonly code: string; readonly state: string; readonly issuer: string }
  | { readonly kind: 'cancel'; readonly state: string; readonly issuer: string };
const IDENTITY_BASE_FIELDS = [
  'contractVersion', 'manifestSha256', 'issuer', 'audience', 'identityIssuer', 'identitySubject',
  'principalId', 'principalKind', 'googleSubject', 'employeeId', 'authEpoch', 'authenticatedAtMs',
  'revokedBeforeMs', 'sourceSessionExpiresAtMs', 'issuedAtMs', 'expiresAtMs', 'currentStateExpiresAtMs',
  'mappingRevision',
] as const;
const IDENTITY_FIELDS: readonly (keyof ProducerVerifiedIdentity)[] = [...IDENTITY_BASE_FIELDS, 'verifiedEmail'];
const LOGIN_TTL_MS = 5 * 60 * 1000;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/u;
const REVISION_RE = /^[1-9][0-9]{0,18}$/u;
const MAX_INT64 = 9_223_372_036_854_775_807n;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/iu;
const URL_SENTINEL = 'http://projed.invalid';

export interface AppSessionServiceOptions {
  readonly store: AppSessionStore;
  readonly consumer: Pick<IdentityConsumer, 'verifyIdentity'>;
  readonly states: Pick<PlatformPrincipalStateReader, 'readCurrent'>;
  readonly mappings: PrincipalMappingResolver;
  readonly binding: PlatformHandoffBinding;
  readonly pins: readonly IdentityContractPin[];
  readonly origins: Readonly<{ main: string; quick: string }>;
  readonly environment: SessionCookieEnvironment;
  readonly now?: () => number;
  readonly createContextId?: () => string;
}

type AuthDispatchResult = {
  readonly matched: boolean;
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
};

type ResolvedSession = {
  readonly actor: ServerActorV1;
  readonly session: StoredAppSession;
  readonly sessionToken: string;
  readonly publicOrigin: string;
  readonly expiresAtMs: number;
};

type ResolvedSessionMetadata = {
  readonly session: StoredAppSession;
  readonly loginToken?: string;
  readonly publicOrigin: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key))
    && expected.every((key) => Object.hasOwn(value, key));
}

function onlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key));
}

function text(value: unknown, maximum = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validOpaque(value: unknown): value is string {
  if (typeof value !== 'string' || !TOKEN_RE.test(value)) return false;
  try {
    const bytes = Buffer.from(value, 'base64url');
    return bytes.byteLength === 32 && bytes.toString('base64url') === value;
  } catch {
    return false;
  }
}

function opaque(): string {
  return randomBytes(32).toString('base64url');
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'ascii').digest('base64url');
}

function loopback(hostname: string): boolean {
  const hostnameValue = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (hostnameValue === 'localhost' || hostnameValue === '::1') return true;
  if (!/^127(?:\.\d{1,3}){3}$/u.test(hostnameValue)) return false;
  return hostnameValue.split('.').every((part) => Number(part) <= 255);
}

function validPublicOrigin(value: unknown, environment: SessionCookieEnvironment): value is string {
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const url = new URL(value);
    const secure = url.protocol === 'https:';
    const localHttp = url.protocol === 'http:' && environment !== 'production' && loopback(url.hostname);
    return url.origin === value && (secure || localHttp) && url.username === '' && url.password === ''
      && url.pathname === '/' && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

function validBinding(value: unknown, environment: SessionCookieEnvironment): value is PlatformHandoffBinding {
  if (!exactKeys(value, ['contractVersion', 'manifestSha256', 'issuer', 'audience'])) return false;
  if (value.contractVersion !== 'jenfu.sso-handoff.v4' || value.audience !== 'projed'
      || typeof value.manifestSha256 !== 'string' || !SHA256_RE.test(value.manifestSha256)
      || !text(value.issuer)) return false;
  try {
    const issuer = new URL(value.issuer);
    const secure = issuer.protocol === 'https:';
    const localHttp = issuer.protocol === 'http:' && environment !== 'production' && loopback(issuer.hostname);
    return (secure || localHttp) && issuer.username === '' && issuer.password === ''
      && issuer.pathname === '/api/sso' && issuer.search === '' && issuer.hash === ''
      && value.issuer === `${issuer.origin}/api/sso`;
  } catch {
    return false;
  }
}

function pinMatches(pin: IdentityContractPin, binding: PlatformHandoffBinding): boolean {
  return pin.contractVersion === binding.contractVersion
    && pin.manifestSha256 === binding.manifestSha256
    && pin.issuer === binding.issuer
    && pin.audience === binding.audience;
}

function identityShape(value: unknown, binding: PlatformHandoffBinding): value is ProducerVerifiedIdentity {
  const hasVerifiedEmail = isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'verifiedEmail');
  const keys = hasVerifiedEmail ? IDENTITY_FIELDS : IDENTITY_BASE_FIELDS;
  if (!exactKeys(value, keys)) return false;
  const employeeIdValid = value.employeeId === null || text(value.employeeId);
  const verifiedEmailValid = !hasVerifiedEmail || (text(value.verifiedEmail, 320)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.verifiedEmail));
  const revisionValid = typeof value.mappingRevision === 'string' && REVISION_RE.test(value.mappingRevision)
    && BigInt(value.mappingRevision) <= MAX_INT64;
  return value.contractVersion === binding.contractVersion && value.manifestSha256 === binding.manifestSha256
    && value.issuer === binding.issuer && value.audience === binding.audience
    && text(value.identityIssuer) && text(value.identitySubject) && text(value.principalId)
    && text(value.googleSubject) && employeeIdValid
    && verifiedEmailValid
    && (value.principalKind === 'personal' ? value.employeeId === null : value.principalKind === 'employee' && value.employeeId !== null)
    && Number.isSafeInteger(value.authEpoch) && Number(value.authEpoch) >= 0
    && Number.isSafeInteger(value.authenticatedAtMs) && Number(value.authenticatedAtMs) >= 0
    && (value.revokedBeforeMs === null || Number.isSafeInteger(value.revokedBeforeMs) && Number(value.revokedBeforeMs) >= 0)
    && Number.isSafeInteger(value.sourceSessionExpiresAtMs) && Number(value.sourceSessionExpiresAtMs) >= 0
    && Number.isSafeInteger(value.issuedAtMs) && Number(value.issuedAtMs) >= 0
    && Number.isSafeInteger(value.expiresAtMs) && Number(value.expiresAtMs) >= 0
    && Number.isSafeInteger(value.currentStateExpiresAtMs) && Number(value.currentStateExpiresAtMs) >= 0
    && revisionValid
    && Number(value.authenticatedAtMs) <= Number(value.issuedAtMs)
    && Number(value.issuedAtMs) < Number(value.sourceSessionExpiresAtMs)
    && (value.revokedBeforeMs === null || Number(value.authenticatedAtMs) > Number(value.revokedBeforeMs));
}

function validStoredSessionShape(value: unknown, binding: PlatformHandoffBinding): value is StoredAppSession {
  if (!exactKeys(value, [
    'tokenHash', 'publicOrigin', 'entry', 'localUserId', 'contextId', 'accountGuardRevision',
    'identity', 'expiresAtMs', 'revokedAtMs',
  ])) return false;
  const revision = value.accountGuardRevision;
  return typeof value.tokenHash === 'string' && SHA256_RE.test(value.tokenHash)
    && (value.entry === 'main' || value.entry === 'quick')
    && UUID_RE.test(String(value.localUserId)) && UUID_RE.test(String(value.contextId))
    && typeof revision === 'string' && REVISION_RE.test(revision) && BigInt(revision) <= MAX_INT64
    && identityShape(value.identity, binding)
    && Number.isSafeInteger(value.expiresAtMs) && Number(value.expiresAtMs) >= 0
    && (value.revokedAtMs === null || Number.isSafeInteger(value.revokedAtMs) && Number(value.revokedAtMs) >= 0);
}

function sameIdentity(left: ProducerVerifiedIdentity, right: ProducerVerifiedIdentity): boolean {
  return IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function validIntentShape(value: unknown): value is StoredLoginIntent {
  return exactKeys(value, [
    'tokenHash', 'stateHash', 'entry', 'publicOrigin', 'returnPath', 'oldSessionHash', 'codeVerifier',
    'status', 'claimHash', 'completedSessionHash', 'expiresAtMs',
  ])
    && typeof value.tokenHash === 'string' && SHA256_RE.test(value.tokenHash)
    && typeof value.stateHash === 'string' && SHA256_RE.test(value.stateHash)
    && (value.entry === 'main' || value.entry === 'quick')
    && typeof value.publicOrigin === 'string' && typeof value.returnPath === 'string'
    && (value.oldSessionHash === null || typeof value.oldSessionHash === 'string' && SHA256_RE.test(value.oldSessionHash))
    && (value.codeVerifier === null || validOpaque(value.codeVerifier))
    && ['pending', 'processing', 'consumed', 'cancelled', 'rejected'].includes(String(value.status))
    && (value.claimHash === null || typeof value.claimHash === 'string' && SHA256_RE.test(value.claimHash))
    && (value.completedSessionHash === null || typeof value.completedSessionHash === 'string' && SHA256_RE.test(value.completedSessionHash))
    && Number.isSafeInteger(value.expiresAtMs) && Number(value.expiresAtMs) >= 0;
}

function stateReadAtMs(value: PlatformPrincipalState): number | null {
  if (typeof value.readAt !== 'string') return null;
  const parsed = Date.parse(value.readAt);
  return Number.isSafeInteger(parsed) && parsed >= 0 && new Date(parsed).toISOString() === value.readAt ? parsed : null;
}

function stateRevokedBeforeMs(value: PlatformPrincipalState): number | null | undefined {
  if (value.revokedBefore === null) return null;
  if (typeof value.revokedBefore !== 'string') return undefined;
  const parsed = Date.parse(value.revokedBefore);
  return Number.isSafeInteger(parsed) && parsed >= 0 && new Date(parsed).toISOString() === value.revokedBefore
    ? parsed
    : undefined;
}

function stateShape(value: unknown): value is PlatformPrincipalState {
  if (!exactKeys(value, [
    'contractVersion', 'principalId', 'principalKind', 'employeeId', 'identityIssuer', 'identitySubject',
    'googleSubject', 'mappingRevision', 'authEpoch', 'revokedBefore', 'readAt',
  ])) return false;
  const revision = value.mappingRevision;
  return value.contractVersion === PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion
    && text(value.principalId) && (value.principalKind === 'employee' || value.principalKind === 'personal')
    && (value.principalKind === 'personal' ? value.employeeId === null : text(value.employeeId))
    && text(value.identityIssuer) && text(value.identitySubject) && text(value.googleSubject)
    && typeof revision === 'string' && REVISION_RE.test(revision) && BigInt(revision) <= MAX_INT64
    && Number.isSafeInteger(value.authEpoch) && Number(value.authEpoch) >= 0
    && (value.revokedBefore === null || typeof value.revokedBefore === 'string')
    && stateReadAtMs(value as unknown as PlatformPrincipalState) !== null
    && stateRevokedBeforeMs(value as unknown as PlatformPrincipalState) !== undefined;
}

function unavailable(): never {
  throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Application session state cannot be confirmed', 503);
}

function invalidSession(): never {
  throw new KernelError('IDENTITY_INVALID', 'Application session is invalid or expired', 401);
}

function changedSession(): never {
  throw new KernelError('ACTOR_CHANGED', 'Application session changed during the request', 409);
}

function conflict(): never {
  throw new KernelError('ACTOR_CHANGED', 'Login attempt is no longer current', 409);
}

function nowFrom(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) unavailable();
  return value;
}

function sameOriginForHost(host: unknown, origins: Readonly<{ main: string; quick: string }>): string {
  if (typeof host !== 'string' || host.length === 0 || /[\u0000-\u0020\u007f,/@\\]/u.test(host)) {
    throw new KernelError('ACCESS_DENIED', 'Request origin is not allowed', 403);
  }
  const matches = [...new Set([origins.main, origins.quick].filter((origin) => new URL(origin).host === host))];
  if (matches.length !== 1) throw new KernelError('ACCESS_DENIED', 'Request origin is not allowed', 403);
  return matches[0]!;
}

function requestPostOrigin(
  request: IncomingMessage,
  origins: Readonly<{ main: string; quick: string }>,
): string {
  const origin = request.headers.origin;
  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof origin !== 'string' || (fetchSite !== undefined && typeof fetchSite !== 'string')
      || fetchSite === 'cross-site' || (origin !== origins.main && origin !== origins.quick)) {
    throw new KernelError('ACCESS_DENIED', 'Request origin is not allowed', 403);
  }
  const hostOrigin = sameOriginForHost(request.headers.host, origins);
  if (hostOrigin !== origin) throw new KernelError('ACCESS_DENIED', 'Request origin is not allowed', 403);
  return origin;
}

function requestTarget(request: IncomingMessage): URL | null {
  const raw = request.url;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8 * 1024
      || /[\u0000-\u001f\u007f]/u.test(raw) || !raw.startsWith('/')) return null;
  try {
    const url = new URL(raw, URL_SENTINEL);
    if (url.origin !== URL_SENTINEL || url.hash !== '') return null;
    return url;
  } catch {
    return null;
  }
}

function rawPath(request: IncomingMessage): string | null {
  const raw = request.url;
  if (typeof raw !== 'string' || !raw.startsWith('/') || /[\u0000-\u001f\u007f#]/u.test(raw)) return null;
  const queryAt = raw.indexOf('?');
  return queryAt < 0 ? raw : raw.slice(0, queryAt);
}

function validateReturnPath(value: unknown, publicOrigin: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024
      || Buffer.byteLength(value, 'utf8') > 1024 || !value.startsWith('/') || value.startsWith('//')
      || value.includes('\\') || value.includes('#') || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'returnPath is invalid', 400);
  }
  let decoded: string;
  let decodedPath: string;
  let target: URL;
  try {
    decoded = decodeURIComponent(value);
    target = new URL(value, publicOrigin);
    decodedPath = decodeURIComponent(target.pathname);
  } catch {
    throw new KernelError('DOMAIN_DATA_INVALID', 'returnPath is invalid', 400);
  }
  if (decoded.includes('\\') || /[\u0000-\u001f\u007f]/u.test(decoded)
      || decodedPath.includes('\\') || /[\u0000-\u001f\u007f]/u.test(decodedPath)
      || decoded.startsWith('//') || decodedPath.startsWith('//') || target.origin !== publicOrigin
      || decodedPath === '/api' || decodedPath.startsWith('/api/')) {
    throw new KernelError('DOMAIN_DATA_INVALID', 'returnPath is invalid', 400);
  }
  return `${target.pathname}${target.search}`;
}

function identityInvalidOrUnavailable(error: unknown): never {
  if (error instanceof KernelError) throw error;
  unavailable();
}

function checkCurrentState(
  identity: ProducerVerifiedIdentity,
  stateInput: unknown,
  nowMs: number,
): { state: PlatformPrincipalState; readAtMs: number } {
  if (!stateShape(stateInput)) unavailable();
  const state = stateInput;
  const readAtMs = stateReadAtMs(state);
  const revokedBeforeMs = stateRevokedBeforeMs(state);
  if (readAtMs === null || revokedBeforeMs === undefined
      || readAtMs > nowMs || nowMs - readAtMs > PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS) unavailable();
  if (state.principalId !== identity.principalId || state.principalKind !== identity.principalKind
      || state.employeeId !== identity.employeeId || state.identityIssuer !== identity.identityIssuer
      || state.identitySubject !== identity.identitySubject || state.googleSubject !== identity.googleSubject
      || state.mappingRevision !== identity.mappingRevision || state.authEpoch !== identity.authEpoch
      || revokedBeforeMs !== identity.revokedBeforeMs || identity.authenticatedAtMs > readAtMs
      || (revokedBeforeMs !== null && identity.authenticatedAtMs <= revokedBeforeMs)) invalidSession();
  return { state, readAtMs };
}

function mappingForSession(
  identity: ProducerVerifiedIdentity,
  mapping: unknown,
): ActivePrincipalMapping {
  if (!isRecord(mapping) || mapping.status !== 'active') {
    if (isRecord(mapping) && mapping.status === 'unavailable') unavailable();
    if (isRecord(mapping) && mapping.status === 'inactive') {
      throw new KernelError('ACCESS_DENIED', 'Principal mapping is inactive', 403);
    }
    throw new KernelError('IDENTITY_MAPPING_CONFLICT', 'Principal mapping is missing or ambiguous', 409);
  }
  if (!exactKeys(mapping, [
    'status', 'principalId', 'identityIssuer', 'identitySubject', 'googleSubject', 'mappingRevision',
    'localUserId', 'accountGuardRevision',
  ])) unavailable();
  const guardRevision = mapping.accountGuardRevision;
  if (mapping.principalId !== identity.principalId || mapping.identityIssuer !== identity.identityIssuer
      || mapping.identitySubject !== identity.identitySubject || mapping.googleSubject !== identity.googleSubject
      || mapping.mappingRevision !== identity.mappingRevision || !UUID_RE.test(String(mapping.localUserId))
      || typeof guardRevision !== 'string' || !REVISION_RE.test(guardRevision)
      || BigInt(guardRevision) > MAX_INT64) {
    throw new KernelError('IDENTITY_MAPPING_CONFLICT', 'Principal mapping no longer matches the session', 409);
  }
  return mapping as unknown as ActivePrincipalMapping;
}

function errorResponse(error: unknown, requestId: string): AuthDispatchResult {
  const safe = error instanceof KernelError
    ? error
    : new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Application session operation failed', 503);
  return {
    matched: true,
    status: safe.httpStatus,
    body: { error: { code: safe.code, requestId, retryable: safe.httpStatus >= 500 } },
  };
}

function response(
  status: number,
  _requestId: string,
  body: unknown,
  headers?: Readonly<Record<string, string>>,
): AuthDispatchResult {
  return { matched: true, status, body, headers };
}

export function createAppSessionService(options: AppSessionServiceOptions) {
  const now = options?.now ?? Date.now;
  const pins = Array.isArray(options?.pins) ? Object.freeze([...options.pins]) : [];
  const contractPinned = Array.isArray(pins) && !!options?.binding
    && pins.some((pin) => isRecord(pin) && pinMatches(pin as unknown as IdentityContractPin, options.binding));
  if (!options || typeof options !== 'object'
      || !options.store || typeof options.store.begin !== 'function' || typeof options.store.readLogin !== 'function'
      || typeof options.store.claim !== 'function' || typeof options.store.cancel !== 'function'
      || typeof options.store.reject !== 'function' || typeof options.store.complete !== 'function'
      || typeof options.store.readSession !== 'function' || typeof options.store.revokeSession !== 'function'
      || !options.consumer || typeof options.consumer.verifyIdentity !== 'function'
      || !options.states || typeof options.states.readCurrent !== 'function'
      || !options.mappings || typeof options.mappings.resolve !== 'function'
      || !validBinding(options.binding, options.environment)
      || !Array.isArray(options.pins)
      || (options.environment !== 'production' && options.environment !== 'development' && options.environment !== 'test')
      || (options.now !== undefined && typeof options.now !== 'function')
      || (options.createContextId !== undefined && typeof options.createContextId !== 'function')
      || !exactKeys(options.origins, ['main', 'quick'])
      || !validPublicOrigin(options.origins.main, options.environment)
      || !validPublicOrigin(options.origins.quick, options.environment)) {
    throw new KernelError('CONFIG_INVALID', 'Application session service configuration is invalid', 503);
  }
  const hostValues = new Map<string, string>();
  for (const publicOrigin of new Set([options.origins.main, options.origins.quick])) {
    const host = new URL(publicOrigin).host;
    const previous = hostValues.get(host);
    if (previous && previous !== publicOrigin) {
      throw new KernelError('CONFIG_INVALID', 'Application origins cannot share a Host with different schemes', 503);
    }
    hostValues.set(host, publicOrigin);
  }
  const binding = Object.freeze({ ...options.binding });
  const originByEntry = Object.freeze({ main: options.origins.main, quick: options.origins.quick });
  const environment = options.environment;
  const requestResolutions = new WeakMap<IncomingMessage, Promise<ResolvedSession>>();
  const logoutResolutions = new WeakMap<IncomingMessage, Promise<ResolvedSessionMetadata>>();

  const readSessionMetadata = async (
    sessionToken: string,
    publicOrigin: string,
  ): Promise<StoredAppSession | null> => {
    if (!contractPinned) throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'No ProJED identity contract is pinned', 503);
    let stored: StoredAppSession | null;
    try {
      stored = await options.store.readSession(hash(sessionToken));
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (!stored) return null;
    if (!validStoredSessionShape(stored, binding) || !safeEqual(stored.tokenHash, hash(sessionToken))
        || stored.publicOrigin !== publicOrigin || stored.publicOrigin !== originByEntry[stored.entry]
        || stored.expiresAtMs > stored.identity.sourceSessionExpiresAtMs) invalidSession();
    if (!pins.some((pin) => pinMatches(pin, binding))) {
      throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'No ProJED identity contract is pinned', 503);
    }
    return stored;
  };

  const readStoredSession = async (sessionToken: string, publicOrigin: string): Promise<ResolvedSession> => {
    const nowMs = nowFrom(now);
    const stored = await readSessionMetadata(sessionToken, publicOrigin);
    if (!stored || stored.revokedAtMs !== null
        || stored.expiresAtMs <= nowMs || stored.identity.sourceSessionExpiresAtMs <= nowMs
    ) {
      invalidSession();
    }
    const identity = stored.identity;
    let stateInput: PlatformPrincipalState;
    try {
      stateInput = await options.states.readCurrent({
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        principalId: identity.principalId,
      });
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    const checked = checkCurrentState(identity, stateInput, nowFrom(now));
    let mappingResult: unknown;
    try {
      mappingResult = await options.mappings.resolve({
        principalId: identity.principalId,
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        googleSubject: identity.googleSubject,
        mappingRevision: identity.mappingRevision,
      });
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    const mapping = mappingForSession(identity, mappingResult);
    if (mapping.localUserId !== stored.localUserId || mapping.accountGuardRevision !== stored.accountGuardRevision) {
      throw new KernelError('IDENTITY_MAPPING_CONFLICT', 'Principal mapping no longer matches the session', 409);
    }
    const actorNowMs = nowFrom(now);
    const actor: ServerActorV1 = Object.freeze({
      principalId: identity.principalId,
      localUserId: stored.localUserId,
      entry: stored.entry,
      contextId: stored.contextId,
      expiresAtMs: Math.min(
        stored.expiresAtMs,
        identity.sourceSessionExpiresAtMs,
        checked.readAtMs + PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS,
      ),
      accountGuardRevision: stored.accountGuardRevision,
    });
    validateServerActor(actor, actorNowMs);
    return Object.freeze({
      actor,
      session: stored,
      sessionToken,
      publicOrigin,
      expiresAtMs: stored.expiresAtMs,
    });
  };

  const consumedIntentRecovery = async (
    intent: StoredLoginIntent,
    tokens: SessionCookieTokens,
    publicOrigin: string,
    requestId: string,
  ): Promise<AuthDispatchResult | null> => {
    const expectedOldSessionHash = tokens.sessionToken ? hash(tokens.sessionToken) : null;
    if (!validIntentShape(intent) || intent.status !== 'consumed'
        || !safeEqual(intent.tokenHash, tokens.loginToken ? hash(tokens.loginToken) : '')
        || intent.publicOrigin !== publicOrigin || intent.publicOrigin !== originByEntry[intent.entry]
        || intent.oldSessionHash !== expectedOldSessionHash) conflict();
    const clearCookie = () => response(409, requestId, {
      error: { code: 'ACTOR_CHANGED', requestId, retryable: false },
    }, { 'set-cookie': clearSessionCookie({ environment, publicOrigin }) });
    if (intent.oldSessionHash === null) return clearCookie();
    if (!tokens.sessionToken) conflict();

    let stored: StoredAppSession | null;
    try {
      stored = await options.store.readSession(intent.oldSessionHash);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (!stored) return clearCookie();
    if (!validStoredSessionShape(stored, binding) || !safeEqual(stored.tokenHash, intent.oldSessionHash)
        || stored.publicOrigin !== publicOrigin || stored.publicOrigin !== originByEntry[stored.entry]) return null;
    const currentNowMs = nowFrom(now);
    if (stored.revokedAtMs !== null || stored.expiresAtMs <= currentNowMs
        || stored.identity.sourceSessionExpiresAtMs <= currentNowMs) return clearCookie();
    return null;
  };

  const resolveRequest = (request: IncomingMessage, refresh = false): Promise<ResolvedSession> => {
    if (refresh) requestResolutions.delete(request);
    const cached = requestResolutions.get(request);
    if (cached) return cached;
    const pending = (async () => {
      const publicOrigin = sameOriginForHost(request.headers.host, originByEntry);
      let tokens: SessionCookieTokens;
      try {
        tokens = parseSessionCookie(request);
      } catch (error) {
        identityInvalidOrUnavailable(error);
      }
      if (!tokens.sessionToken) invalidSession();
      return readStoredSession(tokens.sessionToken, publicOrigin);
    })();
    requestResolutions.set(request, pending);
    return pending;
  };

  const resolveActor = async (
    request: IncomingMessage, options?: { readonly refresh?: boolean },
  ): Promise<ServerActorV1> => (await resolveRequest(request,options?.refresh)).actor;

  const resolveSessionInfo = async (request: IncomingMessage, actor: ServerActorV1) => {
    const resolved = await resolveRequest(request);
    if (resolved.actor !== actor) changedSession();
    return { expiresAtMs: resolved.expiresAtMs };
  };

  const resolveLogoutMetadata = (request: IncomingMessage): Promise<ResolvedSessionMetadata> => {
    const cached = logoutResolutions.get(request);
    if (cached) return cached;
    const pending = (async () => {
      const publicOrigin = sameOriginForHost(request.headers.host, originByEntry);
      let tokens: SessionCookieTokens;
      try {
        tokens = parseSessionCookie(request);
      } catch (error) {
        identityInvalidOrUnavailable(error);
      }
      if (!tokens.sessionToken) invalidSession();
      const session = await readSessionMetadata(tokens.sessionToken, publicOrigin);
      if (!session) invalidSession();
      return Object.freeze({
        session,
        ...(tokens.loginToken ? { loginToken: tokens.loginToken } : {}),
        publicOrigin,
      });
    })();
    logoutResolutions.set(request, pending);
    return pending;
  };

  const resolveLogoutIdentity = async (request: IncomingMessage) => {
    const resolved = await resolveLogoutMetadata(request);
    return Object.freeze({
      localUserId: resolved.session.localUserId,
      contextId: resolved.session.contextId,
    });
  };

  const cancelIntent = async (
    loginToken: string,
    publicOrigin: string,
    expectedOldSessionHash: string | null,
    currentNowMs: number,
    allowMissing: boolean,
  ): Promise<StoredLoginIntent | null> => {
    const tokenHash = hash(loginToken);
    let intent: StoredLoginIntent | null;
    try {
      intent = await options.store.readLogin(tokenHash);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (!intent) {
      if (allowMissing) return null;
      conflict();
    }
    if (!validIntentShape(intent) || !safeEqual(intent.tokenHash, tokenHash)
        || intent.publicOrigin !== publicOrigin || intent.oldSessionHash !== expectedOldSessionHash) conflict();
    if (intent.status === 'consumed') conflict();
    if (intent.status === 'cancelled' || intent.status === 'rejected') return intent;
    let cancelled: StoredLoginIntent | null;
    try {
      cancelled = await options.store.cancel(tokenHash, publicOrigin, currentNowMs);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (cancelled && validIntentShape(cancelled) && cancelled.status === 'cancelled'
        && safeEqual(cancelled.tokenHash, tokenHash) && cancelled.publicOrigin === publicOrigin
        && cancelled.oldSessionHash === expectedOldSessionHash) return cancelled;
    let latest: StoredLoginIntent | null;
    try {
      latest = await options.store.readLogin(tokenHash);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (latest && validIntentShape(latest) && latest.status === 'cancelled'
        && safeEqual(latest.tokenHash, tokenHash) && latest.publicOrigin === publicOrigin
        && latest.oldSessionHash === expectedOldSessionHash) return latest;
    conflict();
  };

  const startLogin = async (request: IncomingMessage, requestId: string): Promise<AuthDispatchResult> => {
    if (request.method !== 'POST') {
      request.resume();
      return response(405, requestId, { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } });
    }
    const publicOrigin = requestPostOrigin(request, originByEntry);
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(request, 32 * 1024);
    } catch (error) {
      request.resume();
      throw error;
    }
    if (!onlyAllowedKeys(body, ['entry', 'returnPath'])
        || (body.entry !== 'main' && body.entry !== 'quick')
        || (Object.hasOwn(body, 'returnPath') && typeof body.returnPath !== 'string')) {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Session login request is invalid', 400);
    }
    const requestedEntry = body.entry as AppEntry;
    if (publicOrigin !== originByEntry[requestedEntry]) {
      throw new KernelError('ACCESS_DENIED', 'Request origin does not match the selected entry', 403);
    }
    const target = requestTarget(request);
    if (!target || target.pathname !== LOGIN_PATH || target.search !== '') {
      throw new KernelError('DOMAIN_DATA_INVALID', 'Session login request target is invalid', 400);
    }
    const returnPath = validateReturnPath(body.returnPath === undefined ? '/' : body.returnPath, publicOrigin);
    if (!contractPinned) return response(404, requestId, { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } });

    let tokens: SessionCookieTokens;
    try {
      tokens = parseSessionCookie(request);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    const oldSessionHash = tokens.sessionToken ? hash(tokens.sessionToken) : null;
    if (tokens.loginToken) {
      let previousIntent: StoredLoginIntent | null;
      try {
        previousIntent = await options.store.readLogin(hash(tokens.loginToken));
      } catch (error) {
        identityInvalidOrUnavailable(error);
      }
      if (previousIntent?.status === 'consumed') {
        const recovered = await consumedIntentRecovery(previousIntent, tokens, publicOrigin, requestId);
        if (recovered) return recovered;
        conflict();
      }
      await cancelIntent(tokens.loginToken, publicOrigin, oldSessionHash, nowFrom(now), false);
    }
    const currentNowMs = nowFrom(now);
    let oldSession: StoredAppSession | null = null;
    if (tokens.sessionToken) {
      oldSession = await readSessionMetadata(tokens.sessionToken, publicOrigin);
      const oldExpiry = oldSession
        ? Math.min(oldSession.expiresAtMs, oldSession.identity.sourceSessionExpiresAtMs)
        : 0;
      if (!oldSession || oldSession.revokedAtMs !== null || oldExpiry - currentNowMs < 1_000) {
        return response(409, requestId, {
          error: { code: 'ACTOR_CHANGED', requestId, retryable: false },
        }, { 'set-cookie': clearSessionCookie({ environment, publicOrigin }) });
      }
    }
    const entry = oldSession?.entry ?? requestedEntry;
    if (publicOrigin !== originByEntry[entry]) {
      throw new KernelError('ACCESS_DENIED', 'Stored Session entry does not match this origin', 403);
    }

    const state = opaque();
    const loginToken = opaque();
    const codeVerifier = opaque();
    const intentExpiresAtMs = currentNowMs + LOGIN_TTL_MS;
    if (!Number.isSafeInteger(intentExpiresAtMs)) unavailable();
    const intent: StoredLoginIntent = Object.freeze({
      tokenHash: hash(loginToken),
      stateHash: hash(state),
      entry,
      publicOrigin,
      returnPath,
      oldSessionHash,
      codeVerifier,
      status: 'pending',
      claimHash: null,
      completedSessionHash: null,
      expiresAtMs: intentExpiresAtMs,
    });
    const cookie = setSessionCookie({
      environment,
      publicOrigin,
      ...(oldSession ? { sessionToken: tokens.sessionToken } : {}),
      loginToken,
      expiresAtMs: oldSession?.expiresAtMs ?? intentExpiresAtMs,
      ...(oldSession ? { sourceSessionExpiresAtMs: oldSession.identity.sourceSessionExpiresAtMs } : {}),
      nowMs: currentNowMs,
    });
    const authorizationUrl = new URL(`${binding.issuer}/authorize`);
    authorizationUrl.search = new URLSearchParams([
      ['response_type', 'code'],
      ['client_id', 'projed'],
      ['redirect_uri', `${publicOrigin}${CALLBACK_PATH}`],
      ['state', state],
      ['code_challenge', sha256Base64Url(codeVerifier)],
      ['code_challenge_method', 'S256'],
    ]).toString();
    const authorizationUrlValue = authorizationUrl.toString();
    if (Buffer.byteLength(authorizationUrlValue, 'utf8') > 1024) unavailable();
    try {
      await options.store.begin(intent);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    return response(200, requestId, { data: { authorizationUrl: authorizationUrlValue } }, { 'set-cookie': cookie });
  };

  const parseCallback = (request: IncomingMessage): ParsedCallback => {
    const target = requestTarget(request);
    const raw = request.url;
    if (!target || target.pathname !== CALLBACK_PATH || typeof raw !== 'string'
        || raw.slice(0, raw.indexOf('?') < 0 ? raw.length : raw.indexOf('?')) !== CALLBACK_PATH
        || !target.search || Buffer.byteLength(raw, 'utf8') > 8 * 1024) invalidSession();
    const rawQuery = target.search.slice(1).split('&');
    const rawKeys = rawQuery.map((part) => {
      const equals = part.indexOf('=');
      if (equals <= 0) invalidSession();
      const key = part.slice(0, equals);
      if (!CALLBACK_QUERY_KEYS.includes(key as typeof CALLBACK_QUERY_KEYS[number])) invalidSession();
      return key;
    });
    const successShape = rawKeys.length === CALLBACK_SUCCESS_QUERY_KEYS.length
      && CALLBACK_SUCCESS_QUERY_KEYS.every((key) => rawKeys.includes(key));
    const cancelShape = rawKeys.length === CALLBACK_CANCEL_QUERY_KEYS.length
      && CALLBACK_CANCEL_QUERY_KEYS.every((key) => rawKeys.includes(key));
    if ((!successShape && !cancelShape) || new Set(rawKeys).size !== rawKeys.length) {
      invalidSession();
    }
    const params = target.searchParams;
    const codeValues = params.getAll('code');
    const errorValues = params.getAll('error');
    const stateValues = params.getAll('state');
    const issuerValues = params.getAll('iss');
    if (stateValues.length !== 1 || issuerValues.length !== 1
        || !validOpaque(stateValues[0]) || issuerValues[0] !== binding.issuer) {
      invalidSession();
    }
    if (successShape) {
      if (codeValues.length !== 1 || errorValues.length !== 0 || !validOpaque(codeValues[0])) invalidSession();
      return { kind: 'success', code: codeValues[0]!, state: stateValues[0]!, issuer: issuerValues[0]! };
    }
    if (errorValues.length !== 1 || codeValues.length !== 0 || errorValues[0] !== 'access_denied') invalidSession();
    return { kind: 'cancel', state: stateValues[0]!, issuer: issuerValues[0]! };
  };

  const callback = async (request: IncomingMessage, requestId: string): Promise<AuthDispatchResult> => {
    if (request.method !== 'GET') {
      request.resume();
      return response(405, requestId, { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } });
    }
    const parsed = parseCallback(request);
    const publicOrigin = sameOriginForHost(request.headers.host, originByEntry);
    let tokens: SessionCookieTokens;
    try {
      tokens = parseSessionCookie(request);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (!tokens.loginToken) invalidSession();
    const tokenHash = hash(tokens.loginToken);
    let intent: StoredLoginIntent | null;
    try {
      intent = await options.store.readLogin(tokenHash);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    const currentNowMs = nowFrom(now);
    if (!intent || !validIntentShape(intent) || !safeEqual(intent.tokenHash, tokenHash)
        || !safeEqual(intent.stateHash, hash(parsed.state))
        || intent.publicOrigin !== originByEntry[intent.entry]
        || intent.oldSessionHash !== (tokens.sessionToken ? hash(tokens.sessionToken) : null)) invalidSession();
    if (publicOrigin !== intent.publicOrigin || parsed.issuer !== binding.issuer) invalidSession();
    if (intent.status === 'consumed') {
      const recovered = await consumedIntentRecovery(intent, tokens, publicOrigin, requestId);
      if (recovered) return recovered;
      conflict();
    }
    try {
      if (validateReturnPath(intent.returnPath, intent.publicOrigin) !== intent.returnPath) invalidSession();
    } catch {
      invalidSession();
    }
    if (parsed.kind === 'cancel') {
      if (intent.status !== 'pending' && intent.status !== 'processing' && intent.status !== 'cancelled') conflict();
      let cancelled: StoredLoginIntent | null;
      try {
        cancelled = await cancelIntent(tokens.loginToken!, publicOrigin, intent.oldSessionHash, currentNowMs, false);
      } catch (error) {
        if (!(error instanceof KernelError) || (error.code !== 'ACTOR_CHANGED' && error.code !== 'DB_COMMIT_UNKNOWN')) throw error;
        let latest: StoredLoginIntent | null;
        try {
          latest = await options.store.readLogin(tokenHash);
        } catch (readbackError) {
          identityInvalidOrUnavailable(readbackError);
        }
        if (!latest || !validIntentShape(latest) || !safeEqual(latest.tokenHash, tokenHash)
            || !safeEqual(latest.stateHash, intent.stateHash) || latest.entry !== intent.entry
            || latest.publicOrigin !== intent.publicOrigin || latest.oldSessionHash !== intent.oldSessionHash) throw error;
        if (latest.status === 'consumed') {
          const recovered = await consumedIntentRecovery(latest, tokens, publicOrigin, requestId);
          if (recovered) return recovered;
          conflict();
        }
        if (latest.status !== 'cancelled') throw error;
        cancelled = latest;
      }
      if (!cancelled || !validIntentShape(cancelled) || cancelled.status !== 'cancelled'
          || !safeEqual(cancelled.tokenHash, tokenHash) || !safeEqual(cancelled.stateHash, intent.stateHash)
          || cancelled.entry !== intent.entry || cancelled.publicOrigin !== intent.publicOrigin
          || cancelled.oldSessionHash !== intent.oldSessionHash) conflict();

      const cookieNowMs = nowFrom(now);
      let cookie: string;
      if (tokens.sessionToken) {
        const session = await readSessionMetadata(tokens.sessionToken, publicOrigin);
        const effectiveExpiry = session
          ? Math.min(session.expiresAtMs, session.identity.sourceSessionExpiresAtMs)
          : 0;
        if (!session || session.revokedAtMs !== null || session.entry !== intent.entry || effectiveExpiry - cookieNowMs < 1_000) {
          cookie = clearSessionCookie({ environment, publicOrigin });
        } else {
          cookie = setSessionCookie({
            environment,
            publicOrigin,
            sessionToken: tokens.sessionToken,
            expiresAtMs: session.expiresAtMs,
            sourceSessionExpiresAtMs: session.identity.sourceSessionExpiresAtMs,
            nowMs: cookieNowMs,
          });
        }
      } else {
        cookie = clearSessionCookie({ environment, publicOrigin });
      }
      return response(303, requestId, { data: null }, {
        location: `${intent.publicOrigin}${intent.returnPath}`,
        'set-cookie': cookie,
        'referrer-policy': 'no-referrer',
      });
    }
    if (intent.status !== 'pending' || intent.claimHash !== null || intent.completedSessionHash !== null
        || intent.expiresAtMs <= currentNowMs
        || publicOrigin !== originByEntry[intent.entry]
        || !intent.codeVerifier || !validOpaque(intent.codeVerifier)) invalidSession();

    const claimHash = hash(opaque());
    let claimed: StoredLoginIntent;
    try {
      claimed = await options.store.claim(tokenHash, intent.stateHash, claimHash, currentNowMs);
    } catch (error) {
      if (!(error instanceof KernelError) || error.code !== 'DB_COMMIT_UNKNOWN') {
        identityInvalidOrUnavailable(error);
      }
      let claimReadback: StoredLoginIntent | null;
      try {
        claimReadback = await options.store.readLogin(tokenHash);
      } catch (readbackError) {
        identityInvalidOrUnavailable(readbackError);
      }
      if (!claimReadback || !validIntentShape(claimReadback) || claimReadback.status !== 'processing'
          || !safeEqual(claimReadback.tokenHash, tokenHash) || !safeEqual(claimReadback.stateHash, intent.stateHash)
          || !safeEqual(claimReadback.claimHash ?? '', claimHash) || claimReadback.entry !== intent.entry
          || claimReadback.publicOrigin !== intent.publicOrigin || claimReadback.oldSessionHash !== intent.oldSessionHash
          || claimReadback.returnPath !== intent.returnPath
          || claimReadback.completedSessionHash !== intent.completedSessionHash
          || claimReadback.codeVerifier !== intent.codeVerifier || claimReadback.expiresAtMs !== intent.expiresAtMs
          || claimReadback.expiresAtMs <= nowFrom(now)) {
        identityInvalidOrUnavailable(error);
      }
      claimed = claimReadback;
    }
    if (!validIntentShape(claimed) || claimed.status !== 'processing' || !safeEqual(claimed.tokenHash, tokenHash)
        || !safeEqual(claimed.stateHash, intent.stateHash) || !safeEqual(claimed.claimHash ?? '', claimHash)
        || claimed.publicOrigin !== intent.publicOrigin || claimed.entry !== intent.entry
        || claimed.oldSessionHash !== intent.oldSessionHash || claimed.codeVerifier !== intent.codeVerifier) conflict();

    let verified: ProducerVerifiedIdentity;
    try {
      verified = await options.consumer.verifyIdentity({
        entry: claimed.entry,
        code: parsed.code,
        codeVerifier: claimed.codeVerifier,
      });
    } catch (error) {
      try {
        await options.store.reject(tokenHash, claimHash);
      } catch {
        unavailable();
      }
      identityInvalidOrUnavailable(error);
    }
    const completeNowMs = nowFrom(now);
    if (!identityShape(verified, binding) || verified.expiresAtMs <= completeNowMs
        || verified.sourceSessionExpiresAtMs <= completeNowMs || verified.currentStateExpiresAtMs <= completeNowMs) {
      try {
        await options.store.reject(tokenHash, claimHash);
      } catch {
        unavailable();
      }
      invalidSession();
    }
    const contextId = options.createContextId?.() ?? randomUUID();
    if (!UUID_RE.test(contextId)) unavailable();
    const sessionToken = opaque();
    let completed: StoredAppSession;
    try {
      completed = await options.store.complete({
        tokenHash,
        stateHash: intent.stateHash,
        claimHash,
        sessionTokenHash: hash(sessionToken),
        contextId,
        identity: verified,
        entry: claimed.entry,
        nowMs: completeNowMs,
      });
    } catch (error) {
      if (!(error instanceof KernelError) || error.code !== 'DB_COMMIT_UNKNOWN') {
        // Complete may have an unknown commit result. Never retry or reject it.
        identityInvalidOrUnavailable(error);
      }
      let completedIntent: StoredLoginIntent | null;
      let completedSession: StoredAppSession | null;
      try {
        completedIntent = await options.store.readLogin(tokenHash);
        completedSession = await options.store.readSession(hash(sessionToken));
      } catch (readbackError) {
        identityInvalidOrUnavailable(readbackError);
      }
      const readbackNowMs = nowFrom(now);
      if (!completedIntent || !validIntentShape(completedIntent) || completedIntent.status !== 'consumed'
          || !safeEqual(completedIntent.tokenHash, tokenHash) || !safeEqual(completedIntent.stateHash, intent.stateHash)
          || completedIntent.claimHash !== null || completedIntent.codeVerifier !== null
          || completedIntent.returnPath !== intent.returnPath || completedIntent.expiresAtMs !== intent.expiresAtMs
          || completedIntent.completedSessionHash !== hash(sessionToken)
          || completedIntent.publicOrigin !== intent.publicOrigin || completedIntent.entry !== intent.entry
          || completedIntent.oldSessionHash !== intent.oldSessionHash || !completedSession
          || !validStoredSessionShape(completedSession, binding)
          || !safeEqual(completedSession.tokenHash, hash(sessionToken)) || completedSession.revokedAtMs !== null
          || completedSession.publicOrigin !== intent.publicOrigin || completedSession.entry !== intent.entry
          || completedSession.contextId !== contextId
          || !sameIdentity(completedSession.identity, verified)
          || completedSession.expiresAtMs <= readbackNowMs
          || completedSession.expiresAtMs > verified.sourceSessionExpiresAtMs) {
        identityInvalidOrUnavailable(error);
      }
      completed = completedSession;
    }
    if (!validStoredSessionShape(completed, binding)
        || !safeEqual(completed.tokenHash, hash(sessionToken))
        || completed.publicOrigin !== intent.publicOrigin || completed.entry !== intent.entry
        || completed.contextId !== contextId
        || !sameIdentity(completed.identity, verified)
        || completed.expiresAtMs <= completeNowMs
        || completed.expiresAtMs > verified.sourceSessionExpiresAtMs) unavailable();
    // Resolve the canonical account after the atomic completion. A first login
    // has no local UUID before that transaction; unknown commits only read back
    // the exact intent/Session and mapping, never replay the exchange or writes.
    const mapped = mappingForSession(verified, await options.mappings.resolve({
      principalId: verified.principalId, identityIssuer: verified.identityIssuer,
      identitySubject: verified.identitySubject, googleSubject: verified.googleSubject,
      mappingRevision: verified.mappingRevision,
    }));
    if (completed.localUserId !== mapped.localUserId
        || completed.accountGuardRevision !== mapped.accountGuardRevision) unavailable();
    validateServerActor({
      principalId: verified.principalId, localUserId: mapped.localUserId, entry: claimed.entry,
      contextId, accountGuardRevision: mapped.accountGuardRevision,
      expiresAtMs: Math.min(verified.expiresAtMs, verified.sourceSessionExpiresAtMs, verified.currentStateExpiresAtMs),
    }, nowFrom(now));
    const cookieNowMs = nowFrom(now);
    if (completed.expiresAtMs <= cookieNowMs) invalidSession();
    const cookie = setSessionCookie({
      environment,
      publicOrigin: completed.publicOrigin,
      sessionToken,
      expiresAtMs: completed.expiresAtMs,
      sourceSessionExpiresAtMs: verified.sourceSessionExpiresAtMs,
      nowMs: cookieNowMs,
    });
    return response(303, requestId, { data: null }, {
      location: `${completed.publicOrigin}${intent.returnPath}`,
      'set-cookie': cookie,
      'referrer-policy': 'no-referrer',
    });
  };

  const cancelLogin = async (request: IncomingMessage, requestId: string): Promise<AuthDispatchResult> => {
    if (request.method !== 'POST') {
      request.resume();
      return response(405, requestId, { error: { code: 'METHOD_NOT_ALLOWED', requestId, retryable: false } });
    }
    const publicOrigin = requestPostOrigin(request, originByEntry);
    request.resume();
    let tokens: SessionCookieTokens;
    try {
      tokens = parseSessionCookie(request);
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (!tokens.loginToken) return response(200, requestId, { data: null });
    const currentNowMs = nowFrom(now);
    let currentIntent: StoredLoginIntent | null;
    try {
      currentIntent = await options.store.readLogin(hash(tokens.loginToken));
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    if (currentIntent?.status === 'consumed') {
      const recovered = await consumedIntentRecovery(currentIntent, tokens, publicOrigin, requestId);
      if (recovered) return recovered;
      conflict();
    }
    const cancelled = await cancelIntent(
      tokens.loginToken,
      publicOrigin,
      tokens.sessionToken ? hash(tokens.sessionToken) : null,
      currentNowMs,
      false,
    );
    if (tokens.sessionToken) {
      const session = await readSessionMetadata(tokens.sessionToken, publicOrigin);
      const cookieNowMs = nowFrom(now);
      const effectiveExpiry = session
        ? Math.min(session.expiresAtMs, session.identity.sourceSessionExpiresAtMs)
        : 0;
      if (!session || session.revokedAtMs !== null || effectiveExpiry - cookieNowMs < 1_000) {
        return response(200, requestId, { data: null }, {
          'set-cookie': clearSessionCookie({ environment, publicOrigin }),
        });
      }
      const cookie = setSessionCookie({
        environment,
        publicOrigin,
        sessionToken: tokens.sessionToken,
        expiresAtMs: session.expiresAtMs,
        sourceSessionExpiresAtMs: session.identity.sourceSessionExpiresAtMs,
        nowMs: cookieNowMs,
      });
      return response(200, requestId, { data: null }, { 'set-cookie': cookie });
    }
    if (!cancelled) conflict();
    return response(200, requestId, { data: null }, { 'set-cookie': clearSessionCookie({ environment, publicOrigin }) });
  };

  const dispatchAuth = async (request: IncomingMessage, requestId: string): Promise<AuthDispatchResult> => {
    const path = rawPath(request);
    if (path !== LOGIN_PATH && path !== CANCEL_PATH && path !== CALLBACK_PATH) return { matched: false };
    if (pins.length === 0) {
      if (request.method !== 'GET') request.resume();
      return response(404, requestId, { error: { code: 'ENDPOINT_UNAVAILABLE', requestId, retryable: false } });
    }
    if (!contractPinned) {
      if (request.method !== 'GET') request.resume();
      return response(503, requestId, { error: { code: 'IDENTITY_CONTRACT_UNAVAILABLE', requestId, retryable: true } });
    }
    try {
      if (path === LOGIN_PATH) {
        const target = requestTarget(request);
        if (!target || target.search !== '') throw new KernelError('DOMAIN_DATA_INVALID', 'Session login target is invalid', 400);
        return await startLogin(request, requestId);
      }
      if (path === CANCEL_PATH) {
        const target = requestTarget(request);
        if (!target || target.search !== '') throw new KernelError('DOMAIN_DATA_INVALID', 'Session cancellation target is invalid', 400);
        return await cancelLogin(request, requestId);
      }
      return await callback(request, requestId);
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };

  const destroySession = async (request: IncomingMessage): Promise<{ readonly clearCookie: string }> => {
    requestPostOrigin(request, originByEntry);
    const resolved = await resolveLogoutMetadata(request);
    assertExpectedActor(request, resolved.session);
    if (resolved.loginToken) {
      await cancelIntent(
        resolved.loginToken,
        resolved.publicOrigin,
        resolved.session.tokenHash,
        nowFrom(now),
        true,
      );
    }
    try {
      const revoked = await options.store.revokeSession(resolved.session.tokenHash, resolved.publicOrigin, nowFrom(now));
      if (!revoked) changedSession();
    } catch (error) {
      identityInvalidOrUnavailable(error);
    }
    return { clearCookie: clearSessionCookie({ environment, publicOrigin: resolved.publicOrigin }) };
  };

  return Object.freeze({ dispatchAuth, resolveActor, resolveSessionInfo, resolveLogoutIdentity, destroySession });
}
