import { KernelError } from './errors.js';

export type PlatformHandoffEntry = 'main' | 'quick';

export interface PlatformHandoffBinding {
  readonly contractVersion: 'jenfu.sso-handoff.v4';
  /** Out-of-band deployment pin. The v4 response does not carry a manifest digest. */
  readonly manifestSha256: string;
  readonly issuer: string;
  readonly audience: 'projed';
}

export interface PlatformHandoffV4 {
  readonly contractVersion: 'jenfu.sso-handoff.v4';
  readonly issuer: string;
  readonly audience: 'projed';
  readonly identity: Readonly<{
    identityIssuer: string;
    identitySubject: string;
    principalId: string;
    principalKind: 'employee' | 'personal';
    employeeId: string | null;
    googleSubject: string;
  }>;
  readonly authentication: Readonly<{
    authenticatedAt: string;
    email: string;
    emailVerified: true;
    signInProvider: 'google.com';
    secondFactor: 'totp' | null;
    assuranceLevel: 'aal1' | 'aal2';
  }>;
  readonly authState: Readonly<{
    authEpoch: number;
    revokedBefore: string | null;
  }>;
  readonly mappingRevision: string;
  readonly sourceSessionExpiresAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface PlatformHandoffClientConfig {
  readonly environment: 'production' | 'development' | 'test';
  readonly brokerOrigin: string;
  readonly callbacks: Readonly<Record<PlatformHandoffEntry, string>>;
  readonly binding: PlatformHandoffBinding;
  /** Supplies the Platform service identity token for the exact broker origin/audience. */
  readonly tokenProvider: (brokerOrigin: string) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

export interface PlatformHandoffExchangeInput {
  readonly entry: PlatformHandoffEntry;
  readonly code: string;
  readonly codeVerifier: string;
}

const MAX_INT64 = 9_223_372_036_854_775_807n;
const MAX_SERVICE_TOKEN_LENGTH = 16 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const REVISION_RE = /^[1-9][0-9]{0,18}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;

function failIdentity(): never {
  throw new KernelError('IDENTITY_INVALID', 'Platform handoff is invalid or expired', 401);
}

function failContract(): never {
  throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'Pinned ProJED handoff contract is unavailable', 503);
}

function failUnavailable(): never {
  throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Platform handoff state cannot be confirmed', 503);
}

function failConfig(): never {
  throw new KernelError('CONFIG_INVALID', 'Platform handoff client configuration is invalid', 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION_RE.test(value) && BigInt(value) <= MAX_INT64;
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, sign, zoneHourText, zoneMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const milliseconds = Number((fraction + '000').slice(0, 3));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day
      || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute
      || local.getUTCSeconds() !== second || local.getUTCMilliseconds() !== milliseconds) return false;
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const zoneHours = Number(zoneHourText);
    const zoneMinutes = Number(zoneMinuteText);
    if (zoneHours > 14 || zoneMinutes > 59 || (zoneHours === 14 && zoneMinutes !== 0)) return false;
    offsetMinutes = (zoneHours * 60 + zoneMinutes) * (sign === '+' ? 1 : -1);
  }
  const epoch = local.getTime() - offsetMinutes * 60_000;
  return Number.isSafeInteger(epoch) && epoch >= 0;
}

function timestamp(value: string): number {
  return Date.parse(value);
}

function validHttpsIdentityIssuer(value: unknown): value is string {
  if (!boundedText(value, 255)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

function validBinding(binding: PlatformHandoffBinding, environment: PlatformHandoffClientConfig['environment']): boolean {
  if (!isRecord(binding as unknown as Record<string, unknown>)
      || !exactKeys(binding as unknown as Record<string, unknown>, ['contractVersion', 'manifestSha256', 'issuer', 'audience'])
      || binding.contractVersion !== 'jenfu.sso-handoff.v4' || binding.audience !== 'projed'
      || !SHA256_RE.test(binding.manifestSha256)) return false;
  try {
    const url = new URL(binding.issuer);
    const secureTransport = url.protocol === 'https:'
      || (environment !== 'production' && url.protocol === 'http:' && isLoopback(url.hostname));
    return secureTransport && url.pathname === '/api/sso' && url.search === '' && url.hash === ''
      && url.username === '' && url.password === '' && url.href === binding.issuer;
  } catch {
    return false;
  }
}

/**
 * Parses only the Platform v4 wire DTO. It does not create an actor or claim
 * that the response itself contains the out-of-band manifest digest.
 */
export function parsePlatformHandoffV4(
  input: unknown,
  binding: PlatformHandoffBinding,
  nowMs = Date.now(),
  environment: PlatformHandoffClientConfig['environment'] = 'production',
): PlatformHandoffV4 {
  if ((environment !== 'production' && environment !== 'development' && environment !== 'test')
      || !validBinding(binding, environment)) failContract();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !isRecord(input)
      || !exactKeys(input, ['contractVersion', 'issuer', 'audience', 'identity', 'authentication', 'authState', 'mappingRevision', 'sourceSessionExpiresAt', 'issuedAt', 'expiresAt'])) {
    failIdentity();
  }
  if (input.contractVersion !== binding.contractVersion || input.issuer !== binding.issuer || input.audience !== binding.audience) {
    failContract();
  }

  const identity = input.identity;
  const authentication = input.authentication;
  const authState = input.authState;
  if (!isRecord(identity) || !exactKeys(identity, ['identityIssuer', 'identitySubject', 'principalId', 'principalKind', 'employeeId', 'googleSubject'])
      || !isRecord(authentication) || !exactKeys(authentication, ['authenticatedAt', 'email', 'emailVerified', 'signInProvider', 'secondFactor', 'assuranceLevel'])
      || !isRecord(authState) || !exactKeys(authState, ['authEpoch', 'revokedBefore'])) {
    failIdentity();
  }

  const principalKind = identity.principalKind;
  const employeeId = identity.employeeId;
  if (!validHttpsIdentityIssuer(identity.identityIssuer)
      || !boundedText(identity.identitySubject, 255) || !boundedText(identity.principalId, 255)
      || !boundedText(identity.googleSubject, 255)
      || (principalKind !== 'employee' && principalKind !== 'personal')
      || (principalKind === 'personal' ? employeeId !== null : !boundedText(employeeId, 255))) {
    failIdentity();
  }

  const authenticationTime = authentication.authenticatedAt;
  const email = authentication.email;
  const secondFactor = authentication.secondFactor;
  const assuranceLevel = authentication.assuranceLevel;
  if (!isIsoDateTime(authenticationTime) || !boundedText(email, 320)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
      || authentication.emailVerified !== true || authentication.signInProvider !== 'google.com'
      || (secondFactor !== null && secondFactor !== 'totp')
      || (assuranceLevel !== 'aal1' && assuranceLevel !== 'aal2')) {
    failIdentity();
  }

  const authEpoch = authState.authEpoch;
  const revokedBefore = authState.revokedBefore;
  const mappingRevision = input.mappingRevision;
  const sourceSessionExpiresAt = input.sourceSessionExpiresAt;
  const issuedAt = input.issuedAt;
  const expiresAt = input.expiresAt;
  if (!Number.isSafeInteger(authEpoch) || Number(authEpoch) < 0
      || (revokedBefore !== null && !isIsoDateTime(revokedBefore))
      || !isRevision(mappingRevision)
      || !isIsoDateTime(sourceSessionExpiresAt) || !isIsoDateTime(issuedAt) || !isIsoDateTime(expiresAt)) {
    failIdentity();
  }

  const authenticatedAtMs = timestamp(authenticationTime);
  const revokedBeforeMs = revokedBefore === null ? null : timestamp(revokedBefore);
  const sourceExpiresAtMs = timestamp(sourceSessionExpiresAt);
  const issuedAtMs = timestamp(issuedAt);
  const expiresAtMs = timestamp(expiresAt);
  if (authenticatedAtMs > issuedAtMs || issuedAtMs > nowMs || expiresAtMs <= nowMs
      || sourceExpiresAtMs <= nowMs || expiresAtMs > sourceExpiresAtMs
      || expiresAtMs - issuedAtMs > 60_000
      || (revokedBeforeMs !== null && authenticatedAtMs <= revokedBeforeMs)) {
    failIdentity();
  }

  return Object.freeze({
    contractVersion: 'jenfu.sso-handoff.v4',
    issuer: binding.issuer,
    audience: 'projed',
    identity: Object.freeze({
      identityIssuer: identity.identityIssuer,
      identitySubject: identity.identitySubject,
      principalId: identity.principalId,
      principalKind: principalKind as 'employee' | 'personal',
      employeeId: employeeId as string | null,
      googleSubject: identity.googleSubject,
    }),
    authentication: Object.freeze({
      authenticatedAt: authenticationTime,
      email,
      emailVerified: true,
      signInProvider: 'google.com',
      secondFactor,
      assuranceLevel,
    }),
    authState: Object.freeze({ authEpoch: Number(authEpoch), revokedBefore }),
    mappingRevision,
    sourceSessionExpiresAt,
    issuedAt,
    expiresAt,
  });
}

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) && octets[0] === 127;
}

function parseOrigin(value: string, environment: PlatformHandoffClientConfig['environment']): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    failConfig();
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
      || url.pathname !== '/' || url.origin !== value) failConfig();
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && environment !== 'production' && isLoopback(url.hostname))) {
    failConfig();
  }
  return url;
}

function validateCallback(value: string, environment: PlatformHandoffClientConfig['environment']): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    failConfig();
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== ''
      || url.pathname !== '/api/auth/jenfu-sso/callback' || url.href !== value) failConfig();
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && environment !== 'production' && isLoopback(url.hostname))) {
    failConfig();
  }
  return value;
}

function isExchangeInput(value: unknown): value is PlatformHandoffExchangeInput {
  return isRecord(value) && exactKeys(value, ['entry', 'code', 'codeVerifier'])
    && (value.entry === 'main' || value.entry === 'quick')
    && typeof value.code === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value.code)
    && typeof value.codeVerifier === 'string' && /^[A-Za-z0-9_-]{43,128}$/u.test(value.codeVerifier);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const lengthHeader = response.headers.get('content-length');
  if (lengthHeader !== null && /^\d+$/u.test(lengthHeader) && Number(lengthHeader) > MAX_RESPONSE_BYTES) failUnavailable();
  if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json' || !response.body) {
    failUnavailable();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        failUnavailable();
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(source) as unknown;
  } catch {
    failUnavailable();
  }
}

/** Creates a single-attempt server-side exchange client for the Platform v4 endpoint. */
export function createPlatformHandoffClient(config: PlatformHandoffClientConfig) {
  if (!config || (config.environment !== 'production' && config.environment !== 'development' && config.environment !== 'test')
      || typeof config.tokenProvider !== 'function' || !validBinding(config.binding, config.environment)) failConfig();
  const broker = parseOrigin(config.brokerOrigin, config.environment);
  if (config.binding.issuer !== `${broker.origin}/api/sso`) failConfig();
  if (!isRecord(config.callbacks as unknown as Record<string, unknown>)
      || !exactKeys(config.callbacks as unknown as Record<string, unknown>, ['main', 'quick'])) failConfig();
  const mainCallback = validateCallback(config.callbacks.main, config.environment);
  const quickCallback = validateCallback(config.callbacks.quick, config.environment);
  if (new URL(mainCallback).origin === broker.origin || new URL(quickCallback).origin === broker.origin) failConfig();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) failConfig();
  const endpoint = new URL('/api/sso/token', broker).toString();
  const callbacks: Readonly<Record<PlatformHandoffEntry, string>> = Object.freeze({ main: mainCallback, quick: quickCallback });

  return Object.freeze({
    async exchange(input: PlatformHandoffExchangeInput): Promise<PlatformHandoffV4> {
      if (!isExchangeInput(input)) failIdentity();
      const controller = new AbortController();
      let rejectTimeout!: (reason: KernelError) => void;
      const timeoutPromise = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
      const timeout = setTimeout(() => {
        controller.abort();
        rejectTimeout(new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Platform handoff request timed out', 503));
      }, timeoutMs);
      try {
        let token: string;
        try {
          token = await Promise.race([Promise.resolve().then(() => config.tokenProvider(broker.origin)), timeoutPromise]);
        } catch {
          failUnavailable();
        }
        if (typeof token !== 'string' || token.length < 1 || token.length > MAX_SERVICE_TOKEN_LENGTH
            || /[\s\u0000-\u001f\u007f]/u.test(token)) failUnavailable();

        const body = new URLSearchParams([
          ['grant_type', 'authorization_code'],
          ['code', input.code],
          ['client_id', 'projed'],
          ['redirect_uri', callbacks[input.entry]],
          ['code_verifier', input.codeVerifier],
        ]).toString();
        let response: Response;
        try {
          response = await Promise.race([
            (config.fetchImpl ?? fetch)(endpoint, {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/x-www-form-urlencoded',
                'x-jenfu-service-identity': `Bearer ${token}`,
              },
              body,
              cache: 'no-store',
              credentials: 'omit',
              redirect: 'error',
              signal: controller.signal,
            }),
            timeoutPromise,
          ]);
        } catch (error) {
          if (error instanceof KernelError) throw error;
          failUnavailable();
        }
        if (response.status !== 200 || response.redirected || response.type === 'opaqueredirect') {
          if (response.status >= 500) failUnavailable();
          failIdentity();
        }
        let wire: unknown;
        try {
          wire = await Promise.race([readBoundedJson(response), timeoutPromise]);
        } catch (error) {
          if (error instanceof KernelError) throw error;
          failUnavailable();
        }
        return parsePlatformHandoffV4(wire, config.binding, config.now?.() ?? Date.now(), config.environment);
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
