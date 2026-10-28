import { randomUUID } from 'node:crypto';

import { validateServerActor, type ServerActorV1 } from './actorTransaction.js';
import type { AppEntry } from './config.js';
import { KernelError } from './errors.js';

export interface IdentityContractPin {
  readonly contractVersion: string;
  readonly manifestSha256: string;
  readonly issuer: string;
  readonly audience: 'projed';
}

/**
 * Server-internal normalized output from a future owner-published verifier.
 * It is not a browser DTO and the consumer never treats input as this object
 * without first calling TrustedIdentityVerifier.verify().
 */
export interface ProducerVerifiedIdentity {
  readonly contractVersion: string;
  readonly manifestSha256: string;
  readonly issuer: string;
  readonly audience: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly principalId: string;
  readonly principalKind: 'employee' | 'personal';
  readonly googleSubject: string;
  readonly employeeId: string | null;
  readonly authEpoch: number;
  readonly authenticatedAtMs: number;
  readonly revokedBeforeMs: number | null;
  readonly sourceSessionExpiresAtMs: number;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly currentStateExpiresAtMs: number;
  readonly mappingRevision: string;
}

export interface TrustedIdentityVerifier {
  verify(input: unknown): Promise<ProducerVerifiedIdentity>;
}

export interface ActivePrincipalMapping {
  readonly status: 'active';
  readonly principalId: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly googleSubject: string;
  readonly mappingRevision: string;
  readonly localUserId: string;
  readonly accountGuardRevision: string;
}

export type PrincipalMappingResult =
  | ActivePrincipalMapping
  | { readonly status: 'missing' | 'ambiguous' | 'inactive' | 'unavailable' };

export interface PrincipalMappingResolver {
  resolve(identity: Pick<ProducerVerifiedIdentity,
  'principalId' | 'identityIssuer' | 'identitySubject' | 'googleSubject' | 'mappingRevision'>): Promise<PrincipalMappingResult>;
}

export interface IdentityConsumerDependencies {
  readonly pins: readonly IdentityContractPin[];
  readonly verifier: TrustedIdentityVerifier;
  readonly mappings: PrincipalMappingResolver;
  readonly now?: () => number;
  readonly createContextId?: () => string;
}

// Owner v4 source exists, but formal publication and consumer acceptance are
// pending. Source/CI evidence does not activate a production contract pin.
export const CURRENT_PRODUCTION_IDENTITY_PINS: readonly IdentityContractPin[] = Object.freeze([]);

const SHA256_RE = /^[a-f0-9]{64}$/;
const REVISION_RE = /^[1-9][0-9]{0,18}$/;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

function text(value: unknown, maximum = 255): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maximum && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function revision(value: unknown): value is string {
  return typeof value === 'string' && REVISION_RE.test(value) && BigInt(value) <= MAX_BIGINT;
}

function timestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function validateNormalizedIdentity(identity: ProducerVerifiedIdentity, nowMs: number): void {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new KernelError('IDENTITY_INVALID', 'Verified identity is invalid', 401);
  }
  const employeeValid = identity.employeeId === null || text(identity.employeeId);
  if (!text(identity.contractVersion) || !SHA256_RE.test(identity.manifestSha256)
      || !text(identity.issuer) || !text(identity.audience) || !text(identity.identityIssuer)
      || !text(identity.identitySubject) || !text(identity.principalId) || !employeeValid
      || !text(identity.googleSubject)
      || (identity.principalKind !== 'employee' && identity.principalKind !== 'personal')
      || (identity.principalKind === 'personal' ? identity.employeeId !== null : identity.employeeId === null)
      || !Number.isSafeInteger(identity.authEpoch) || identity.authEpoch < 0
      || !timestamp(identity.authenticatedAtMs) || !timestamp(identity.issuedAtMs)
      || !timestamp(identity.sourceSessionExpiresAtMs) || !timestamp(identity.expiresAtMs)
      || !timestamp(identity.currentStateExpiresAtMs) || !revision(identity.mappingRevision)
      || (identity.revokedBeforeMs !== null && !timestamp(identity.revokedBeforeMs))) {
    throw new KernelError('IDENTITY_INVALID', 'Verified identity shape is invalid', 401);
  }
  if (identity.authenticatedAtMs > identity.issuedAtMs || identity.issuedAtMs > nowMs
      || identity.expiresAtMs <= nowMs || identity.sourceSessionExpiresAtMs <= nowMs
      || identity.currentStateExpiresAtMs <= nowMs
      || (identity.revokedBeforeMs !== null && identity.authenticatedAtMs <= identity.revokedBeforeMs)) {
    throw new KernelError('IDENTITY_INVALID', 'Verified identity is expired, revoked or temporally inconsistent', 401);
  }
}

function assertPinned(identity: ProducerVerifiedIdentity, pins: readonly IdentityContractPin[]): void {
  const match = pins.some((pin) => pin.contractVersion === identity.contractVersion
    && pin.manifestSha256 === identity.manifestSha256
    && pin.issuer === identity.issuer
    && pin.audience === identity.audience);
  if (!match) {
    throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'No pinned ProJED identity contract matches the verified input', 503);
  }
}

function mappingError(status: Exclude<PrincipalMappingResult['status'], 'active'>): KernelError {
  if (status === 'unavailable') {
    return new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Principal mapping state cannot be confirmed', 503);
  }
  if (status === 'inactive') return new KernelError('ACCESS_DENIED', 'Principal mapping is inactive', 403);
  return new KernelError('IDENTITY_MAPPING_CONFLICT', 'Principal mapping is missing or ambiguous', 409);
}

export class IdentityConsumer {
  readonly #dependencies: IdentityConsumerDependencies;

  constructor(dependencies: IdentityConsumerDependencies) {
    this.#dependencies = dependencies;
  }

  async consume(input: unknown, entry: AppEntry): Promise<ServerActorV1> {
    return (await this.consumeVerified(input, entry)).actor;
  }

  /** Retains the single-use verification result for subsequent Session creation. */
  async consumeVerified(input: unknown, entry: AppEntry): Promise<{
    readonly actor: ServerActorV1;
    readonly identity: ProducerVerifiedIdentity;
  }> {
    if (this.#dependencies.pins.length === 0) {
      throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE', 'No ProJED identity contract is published', 503);
    }

    let identity: ProducerVerifiedIdentity;
    try {
      identity = Object.freeze({ ...await this.#dependencies.verifier.verify(input) });
    } catch (error) {
      if (error instanceof KernelError
          && (error.code === 'IDENTITY_INVALID'
            || error.code === 'IDENTITY_STATE_UNAVAILABLE'
            || error.code === 'IDENTITY_CONTRACT_UNAVAILABLE')) throw error;
      throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Identity verification state cannot be confirmed', 503, { cause: error });
    }

    const nowMs = this.#dependencies.now?.() ?? Date.now();
    validateNormalizedIdentity(identity, nowMs);
    assertPinned(identity, this.#dependencies.pins);

    let mapping: PrincipalMappingResult;
    try {
      mapping = await this.#dependencies.mappings.resolve({
        principalId: identity.principalId,
        identityIssuer: identity.identityIssuer,
        identitySubject: identity.identitySubject,
        googleSubject: identity.googleSubject,
        mappingRevision: identity.mappingRevision,
      });
    } catch (error) {
      throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Principal mapping state cannot be confirmed', 503, { cause: error });
    }
    if (mapping.status !== 'active') throw mappingError(mapping.status);
    if (mapping.principalId !== identity.principalId
        || mapping.identityIssuer !== identity.identityIssuer
        || mapping.identitySubject !== identity.identitySubject
        || mapping.googleSubject !== identity.googleSubject
        || mapping.mappingRevision !== identity.mappingRevision) {
      throw new KernelError('IDENTITY_MAPPING_CONFLICT', 'Principal mapping does not match verified identity', 409);
    }

    const actorNowMs = this.#dependencies.now?.() ?? Date.now();
    validateNormalizedIdentity(identity, actorNowMs);

    const actor: ServerActorV1 = {
      principalId: identity.principalId,
      localUserId: mapping.localUserId,
      entry,
      contextId: this.#dependencies.createContextId?.() ?? randomUUID(),
      expiresAtMs: Math.min(
        identity.expiresAtMs,
        identity.sourceSessionExpiresAtMs,
        identity.currentStateExpiresAtMs,
      ),
      accountGuardRevision: mapping.accountGuardRevision,
    };
    validateServerActor(actor, actorNowMs);
    return Object.freeze({ actor: Object.freeze(actor), identity: Object.freeze({ ...identity }) });
  }
}
