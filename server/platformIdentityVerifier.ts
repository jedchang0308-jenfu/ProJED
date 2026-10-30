import { KernelError } from './errors.js';
import type { ProducerVerifiedIdentity, TrustedIdentityVerifier } from './identityConsumer.js';
import {
  parsePlatformHandoffV4,
  type PlatformHandoffBinding,
  type PlatformHandoffExchangeInput,
  type PlatformHandoffV4,
} from './platformHandoff.js';
import {
  PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS,
  verifyProjedHandoffPrincipalState,
  type PlatformPrincipalStateReader,
} from './platformPrincipalState.js';

export interface PlatformIdentityVerifierOptions {
  readonly handoffs: Readonly<{
    exchange(input: PlatformHandoffExchangeInput): Promise<unknown>;
  }>;
  readonly stateReader: Pick<PlatformPrincipalStateReader, 'readForHandoff'>;
  /** Exact out-of-band v4 deployment binding; the v4 wire contains no manifest hash. */
  readonly binding: PlatformHandoffBinding;
  readonly environment?: 'production' | 'development' | 'test';
  readonly now?: () => number;
}

const MANIFEST_RE = /^[a-f0-9]{64}$/u;

function unavailable(): never {
  throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Platform identity state cannot be confirmed', 503);
}

function invalid(): never {
  throw new KernelError('IDENTITY_INVALID', 'Platform identity is invalid, expired, or no longer current', 401);
}

function contractUnavailable(): never {
  throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'Pinned ProJED handoff contract is unavailable', 503);
}

function configInvalid(): never {
  throw new KernelError('CONFIG_INVALID', 'Platform identity verifier configuration is invalid', 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === 'string' && expected.includes(key))
    && expected.every((key) => Object.hasOwn(value, key));
}

function validBindingMetadata(value: PlatformHandoffBinding): boolean {
  if (!isRecord(value as unknown as Record<string, unknown>)
      || !exactKeys(value as unknown as Record<string, unknown>, ['contractVersion', 'manifestSha256', 'issuer', 'audience'])
      || value.contractVersion !== 'jenfu.sso-handoff.v4' || value.audience !== 'projed'
      || !MANIFEST_RE.test(value.manifestSha256)
      || typeof value.issuer !== 'string' || value.issuer.length < 1 || value.issuer.length > 512) return false;
  return true;
}

function parseTimestamp(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) invalid();
  return milliseconds;
}

function mapDependencyFailure(error: unknown): never {
  if (error instanceof KernelError
      && (error.code === 'IDENTITY_INVALID'
        || error.code === 'IDENTITY_STATE_UNAVAILABLE'
        || error.code === 'IDENTITY_CONTRACT_UNAVAILABLE')) throw error;
  return unavailable();
}

function sampleNow(now: () => number): number {
  try {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) return unavailable();
    return value;
  } catch {
    return unavailable();
  }
}

function sameCanonicalHandoff(left: PlatformHandoffV4, right: PlatformHandoffV4): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Composes the one-time HTTP exchange and one current-state read into the
 * normalized verifier consumed by IdentityConsumer. This does not create an
 * actor or App Session; the 10-second current-state lease is only for the
 * just-verified handoff, while sourceSessionExpiresAtMs remains unshortened.
 */
export function createPlatformIdentityVerifier(
  options: PlatformIdentityVerifierOptions,
): TrustedIdentityVerifier {
  if (!options || typeof options !== 'object'
      || (options.environment !== undefined
        && options.environment !== 'production' && options.environment !== 'development' && options.environment !== 'test')
      || typeof options.now !== 'undefined' && typeof options.now !== 'function'
      || !options.handoffs || typeof options.handoffs.exchange !== 'function'
      || !options.stateReader || typeof options.stateReader.readForHandoff !== 'function') configInvalid();
  const environment = options.environment ?? 'production';
  if (!validBindingMetadata(options.binding)) contractUnavailable();
  const now = options.now ?? Date.now;

  return Object.freeze({
    async verify(input: unknown): Promise<ProducerVerifiedIdentity> {
      let rawHandoff: unknown;
      try {
        // The concrete one-time HTTP client owns the exact callback/code/PKCE parser.
        rawHandoff = await options.handoffs.exchange(input as PlatformHandoffExchangeInput);
      } catch (error) {
        return mapDependencyFailure(error);
      }

      const afterExchangeMs = sampleNow(now);
      const handoff = parsePlatformHandoffV4(rawHandoff, options.binding, afterExchangeMs, environment);

      let stateResult: Awaited<ReturnType<PlatformPrincipalStateReader['readForHandoff']>>;
      try {
        stateResult = await options.stateReader.readForHandoff(handoff);
      } catch (error) {
        return mapDependencyFailure(error);
      }

      const verifiedAtMs = sampleNow(now);
      if (!isRecord(stateResult as unknown as Record<string, unknown>)
          || !exactKeys(stateResult as unknown as Record<string, unknown>, ['handoff', 'state', 'stateReadAtMs'])) unavailable();
      if (!sameCanonicalHandoff(handoff, stateResult.handoff)) invalid();

      let verifiedState: ReturnType<typeof verifyProjedHandoffPrincipalState>;
      try {
        verifiedState = verifyProjedHandoffPrincipalState(handoff, stateResult.state, verifiedAtMs);
      } catch (error) {
        return mapDependencyFailure(error);
      }
      if (!Number.isSafeInteger(stateResult.stateReadAtMs)
          || stateResult.stateReadAtMs !== verifiedState.stateReadAtMs) unavailable();

      const authenticatedAtMs = parseTimestamp(handoff.authentication.authenticatedAt);
      const issuedAtMs = parseTimestamp(handoff.issuedAt);
      const expiresAtMs = parseTimestamp(handoff.expiresAt);
      const sourceSessionExpiresAtMs = parseTimestamp(handoff.sourceSessionExpiresAt);
      const revokedBeforeMs = handoff.authState.revokedBefore === null
        ? null
        : parseTimestamp(handoff.authState.revokedBefore);
      const currentStateExpiresAtMs = Math.min(
        expiresAtMs,
        sourceSessionExpiresAtMs,
        verifiedState.stateReadAtMs + PLATFORM_PRINCIPAL_STATE_MAX_READ_AGE_MS,
      );
      if (!Number.isSafeInteger(currentStateExpiresAtMs) || currentStateExpiresAtMs <= verifiedAtMs) invalid();

      return Object.freeze({
        contractVersion: handoff.contractVersion,
        manifestSha256: options.binding.manifestSha256,
        issuer: handoff.issuer,
        audience: handoff.audience,
        identityIssuer: handoff.identity.identityIssuer,
        identitySubject: handoff.identity.identitySubject,
        principalId: handoff.identity.principalId,
        principalKind: handoff.identity.principalKind,
        googleSubject: handoff.identity.googleSubject,
        employeeId: handoff.identity.employeeId,
        verifiedEmail: handoff.authentication.email.trim().toLowerCase(),
        authEpoch: verifiedState.state.authEpoch,
        authenticatedAtMs,
        revokedBeforeMs,
        sourceSessionExpiresAtMs,
        issuedAtMs,
        expiresAtMs,
        currentStateExpiresAtMs,
        mappingRevision: handoff.mappingRevision,
      });
    },
  });
}
