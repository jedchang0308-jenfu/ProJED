import { KernelError } from './errors.js';
import { parsePlatformHandoffV4, type PlatformHandoffBinding, type PlatformHandoffV4 } from './platformHandoff.js';

export const PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT = Object.freeze({
  contractId: 'platform.projed-principal-state',
  contractVersion: 'jenfu.platform.projed-principal-state.v1',
  signatureSha256: 'b72bff48c135a719b8765f8678cf3814e7c445220fc307befd83d26ce0834866',
  payloadSha256: null,
} as const);

export const PLATFORM_PROJED_PRINCIPAL_STATE_SQL =
  'SELECT * FROM platform_contract.read_projed_principal_state_v1($1::text,$2::text,$3::text)' as const;

export const PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS = 10_000;

const MAX_INT64 = 9_223_372_036_854_775_807n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const REVISION_RE = /^[1-9][0-9]{0,18}$/u;
const MAX_TEXT_LENGTH = 255;

export interface PlatformPrincipalStateQueryPort {
  query(text: string, values: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

export type PlatformPrincipalKind = 'employee' | 'personal';

export interface ProjedPrincipalIdentityKey {
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly principalId: string;
}

export interface PlatformPrincipalState {
  readonly contractVersion: typeof PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion;
  readonly principalId: string;
  readonly principalKind: PlatformPrincipalKind;
  readonly employeeId: string | null;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly googleSubject: string;
  readonly mappingRevision: string;
  readonly authEpoch: number;
  readonly revokedBefore: string | null;
  readonly readAt: string;
}

export interface VerifiedProjedHandoffPrincipalState {
  readonly handoff: PlatformHandoffV4;
  readonly state: PlatformPrincipalState;
  readonly stateReadAtMs: number;
}

export interface PlatformPrincipalStateReaderOptions {
  readonly query: PlatformPrincipalStateQueryPort;
  readonly contractBinding: typeof PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT;
  readonly handoffBinding: PlatformHandoffBinding;
  readonly environment?: 'production' | 'development' | 'test';
  readonly now?: () => number;
}

export interface PlatformPrincipalStateReader {
  readCurrent(identity: ProjedPrincipalIdentityKey): Promise<PlatformPrincipalState>;
  readForHandoff(handoff: unknown): Promise<VerifiedProjedHandoffPrincipalState>;
}

function unavailable(): never {
  throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Platform principal state cannot be confirmed', 503);
}

function contractUnavailable(): never {
  throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'Pinned Platform principal state contract is unavailable', 503);
}

function identityInvalid(): never {
  throw new KernelError('IDENTITY_INVALID', 'Platform handoff is invalid, expired, or no longer current', 401);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key))
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function boundedText(value: unknown, maximum = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION_RE.test(value) && BigInt(value) <= MAX_INT64;
}

/** Parse strict ISO timestamps without accepting Date.parse's rollover behavior. */
function parseIsoTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, sign, zoneHourText, zoneMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const millisecondsPart = Number((fraction + '000').slice(0, 3));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecondsPart);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day
      || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute
      || local.getUTCSeconds() !== second || local.getUTCMilliseconds() !== millisecondsPart) return null;
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const offsetHours = Number(zoneHourText);
    const offsetRemainder = Number(zoneMinuteText);
    if (offsetHours > 14 || offsetRemainder > 59 || (offsetHours === 14 && offsetRemainder !== 0)) return null;
    offsetMinutes = (offsetHours * 60 + offsetRemainder) * (sign === '+' ? 1 : -1);
  }
  const result = local.getTime() - offsetMinutes * 60_000;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const milliseconds = parseIsoTimestamp(value);
  return milliseconds === null ? null : new Date(milliseconds).toISOString();
}

function validHttpsIssuer(value: unknown): value is string {
  if (!boundedText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      && url.search === '' && url.hash === '';
  } catch {
    return false;
  }
}

function parseHandoff(
  value: unknown,
  nowMs: number,
  binding: PlatformHandoffBinding,
  environment: 'production' | 'development' | 'test',
): PlatformHandoffV4 {
  return parsePlatformHandoffV4(value, binding, nowMs, environment);
}

const STATE_ROW_KEYS = [
  'contract_version', 'principal_id', 'principal_kind', 'employee_id', 'identity_issuer',
  'identity_subject', 'google_subject', 'mapping_revision', 'auth_epoch', 'revoked_before', 'read_at',
] as const;

function parseStateRow(
  value: unknown,
  expected: ProjedPrincipalIdentityKey,
): PlatformPrincipalState {
  if (!hasExactKeys(value, STATE_ROW_KEYS)) unavailable();
  if (value.contract_version !== PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion) contractUnavailable();
  const kind = value.principal_kind;
  const employeeId = value.employee_id;
  const revokedBefore = value.revoked_before === null ? null : canonicalTimestamp(value.revoked_before);
  const readAt = canonicalTimestamp(value.read_at);
  if (!boundedText(value.principal_id) || (kind !== 'employee' && kind !== 'personal')
      || (kind === 'personal' ? employeeId !== null : !boundedText(employeeId))
      || !validHttpsIssuer(value.identity_issuer) || !boundedText(value.identity_subject)
      || !boundedText(value.google_subject) || !isRevision(value.mapping_revision)
      || typeof value.auth_epoch !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value.auth_epoch)
      || BigInt(value.auth_epoch) > MAX_SAFE_BIGINT
      || (value.revoked_before !== null && revokedBefore === null) || readAt === null) unavailable();

  if (value.principal_id !== expected.principalId || value.identity_issuer !== expected.identityIssuer
      || value.identity_subject !== expected.identitySubject) unavailable();

  return Object.freeze({
    contractVersion: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion,
    principalId: value.principal_id,
    principalKind: kind,
    employeeId: employeeId as string | null,
    identityIssuer: value.identity_issuer,
    identitySubject: value.identity_subject,
    googleSubject: value.google_subject,
    mappingRevision: value.mapping_revision,
    authEpoch: Number(BigInt(value.auth_epoch)),
    revokedBefore,
    readAt,
  });
}

function validateStateShape(value: unknown): PlatformPrincipalState {
  if (!hasExactKeys(value, [
    'contractVersion', 'principalId', 'principalKind', 'employeeId', 'identityIssuer', 'identitySubject',
    'googleSubject', 'mappingRevision', 'authEpoch', 'revokedBefore', 'readAt',
  ]) || value.contractVersion !== PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion) unavailable();
  const kind = value.principalKind;
  const employeeId = value.employeeId;
  const revokedBefore = value.revokedBefore === null ? null : canonicalTimestamp(value.revokedBefore);
  const readAt = canonicalTimestamp(value.readAt);
  if (!boundedText(value.principalId) || (kind !== 'employee' && kind !== 'personal')
      || (kind === 'personal' ? employeeId !== null : !boundedText(employeeId))
      || !validHttpsIssuer(value.identityIssuer) || !boundedText(value.identitySubject)
      || !boundedText(value.googleSubject) || !isRevision(value.mappingRevision)
      || !Number.isSafeInteger(value.authEpoch) || Number(value.authEpoch) < 0
      || (value.revokedBefore !== null && revokedBefore === null) || readAt === null) unavailable();
  return Object.freeze({
    contractVersion: PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion,
    principalId: value.principalId,
    principalKind: kind,
    employeeId: employeeId as string | null,
    identityIssuer: value.identityIssuer,
    identitySubject: value.identitySubject,
    googleSubject: value.googleSubject,
    mappingRevision: value.mappingRevision,
    authEpoch: Number(value.authEpoch),
    revokedBefore,
    readAt,
  });
}

function bindingMatches(value: unknown): value is typeof PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT {
  return hasExactKeys(value, ['contractId', 'contractVersion', 'signatureSha256', 'payloadSha256'])
    && value.contractId === PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractId
    && value.contractVersion === PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.contractVersion
    && value.signatureSha256 === PLATFORM_PROJED_PRINCIPAL_STATE_CONTRACT.signatureSha256
    && value.payloadSha256 === null;
}

/** Match a DTO already returned by parsePlatformHandoffV4 against one current-state read. */
export function verifyProjedHandoffPrincipalState(
  handoff: PlatformHandoffV4,
  state: PlatformPrincipalState,
  nowMs: number,
): VerifiedProjedHandoffPrincipalState {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) identityInvalid();
  const currentState = validateStateShape(state);
  const stateReadAtMs = parseIsoTimestamp(currentState.readAt);
  const revokedBeforeMs = currentState.revokedBefore === null ? null : parseIsoTimestamp(currentState.revokedBefore);
  const authenticatedAtMs = parseIsoTimestamp(handoff.authentication.authenticatedAt);
  const issuedAtMs = parseIsoTimestamp(handoff.issuedAt);
  const expiresAtMs = parseIsoTimestamp(handoff.expiresAt);
  if (stateReadAtMs === null || authenticatedAtMs === null || issuedAtMs === null || expiresAtMs === null
      || handoff.contractVersion !== 'jenfu.sso-handoff.v4' || handoff.audience !== 'projed'
      || !Number.isSafeInteger(handoff.authState.authEpoch) || handoff.authState.authEpoch < 0
      || currentState.principalId !== handoff.identity.principalId
      || currentState.principalKind !== handoff.identity.principalKind
      || currentState.employeeId !== handoff.identity.employeeId
      || currentState.identityIssuer !== handoff.identity.identityIssuer
      || currentState.identitySubject !== handoff.identity.identitySubject
      || currentState.googleSubject !== handoff.identity.googleSubject
      || currentState.mappingRevision !== handoff.mappingRevision
      || currentState.authEpoch !== handoff.authState.authEpoch) identityInvalid();
  if (stateReadAtMs > nowMs || nowMs - stateReadAtMs > PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS) unavailable();
  const handoffRevokedBeforeMs = handoff.authState.revokedBefore === null
    ? null
    : parseIsoTimestamp(handoff.authState.revokedBefore);
  if (handoff.authState.revokedBefore !== null && handoffRevokedBeforeMs === null) identityInvalid();
  if (revokedBeforeMs !== handoffRevokedBeforeMs) identityInvalid();
  if (stateReadAtMs < issuedAtMs || stateReadAtMs > expiresAtMs
      || authenticatedAtMs > stateReadAtMs
      || expiresAtMs <= nowMs || issuedAtMs > nowMs
      || (revokedBeforeMs !== null && authenticatedAtMs <= revokedBeforeMs)) identityInvalid();
  return Object.freeze({ handoff, state: currentState, stateReadAtMs });
}

export function createPlatformPrincipalStateReader(
  options: PlatformPrincipalStateReaderOptions,
): PlatformPrincipalStateReader {
  if (!options || typeof options !== 'object' || !bindingMatches(options.contractBinding)
      || !options.query || typeof options.query.query !== 'function'
      || !options.handoffBinding || typeof options.handoffBinding !== 'object'
      || (options.environment !== undefined
        && options.environment !== 'production' && options.environment !== 'development' && options.environment !== 'test')
      || (options.now !== undefined && typeof options.now !== 'function')) contractUnavailable();

  const now = options.now ?? Date.now;
  async function readCurrent(identityInput: ProjedPrincipalIdentityKey): Promise<PlatformPrincipalState> {
    if (!hasExactKeys(identityInput, ['identityIssuer', 'identitySubject', 'principalId'])
        || !validHttpsIssuer(identityInput.identityIssuer) || !boundedText(identityInput.identitySubject)
        || !boundedText(identityInput.principalId)) identityInvalid();
    const identity: ProjedPrincipalIdentityKey = {
      identityIssuer: identityInput.identityIssuer,
      identitySubject: identityInput.identitySubject,
      principalId: identityInput.principalId,
    };
    const startedAtMs = now();
    if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) unavailable();
    let result: { rows: unknown[] };
    try {
      result = await options.query.query(PLATFORM_PROJED_PRINCIPAL_STATE_SQL, [
        identity.identityIssuer,
        identity.identitySubject,
        identity.principalId,
      ]);
    } catch {
      return unavailable();
    }
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) unavailable();
    const state = parseStateRow(result.rows[0], identity);
    const completedAtMs = now();
    const stateReadAtMs = parseIsoTimestamp(state.readAt);
    if (!Number.isSafeInteger(completedAtMs) || completedAtMs < startedAtMs || stateReadAtMs === null
        || stateReadAtMs > completedAtMs || completedAtMs - stateReadAtMs > PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS) {
      unavailable();
    }
    return state;
  }

  return Object.freeze({
    readCurrent,
    async readForHandoff(handoffInput: unknown): Promise<VerifiedProjedHandoffPrincipalState> {
      const initialNowMs = now();
      if (!Number.isSafeInteger(initialNowMs) || initialNowMs < 0) identityInvalid();
      const handoff = parseHandoff(handoffInput, initialNowMs, options.handoffBinding, options.environment ?? 'production');
      const state = await readCurrent({
        identityIssuer: handoff.identity.identityIssuer,
        identitySubject: handoff.identity.identitySubject,
        principalId: handoff.identity.principalId,
      });
      return verifyProjedHandoffPrincipalState(handoff, state, now());
    },
  });
}
