import type { RuntimeDatabase } from './db.js';
import type { PoolClient } from 'pg';
import { KernelError } from './errors.js';
import type { PrincipalMappingResolver, PrincipalMappingResult } from './identityConsumer.js';

type MappingIdentity = Parameters<PrincipalMappingResolver['resolve']>[0];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const REVISION = /^[1-9][0-9]{0,18}$/u;

/** Fixed, read-only lookup; the caller owns this already-open transaction. */
export async function resolveGoogleMappingInTransaction(
  client: Pick<PoolClient, 'query'>,
  identity: MappingIdentity,
): Promise<PrincipalMappingResult> {
  if (typeof identity.googleSubject !== 'string' || identity.googleSubject.trim() !== identity.googleSubject
      || identity.googleSubject.length < 1 || identity.googleSubject.length > 255
      || /[\u0000-\u001f\u007f]/u.test(identity.googleSubject)) {
    throw new KernelError('IDENTITY_INVALID', 'Verified Google identity is invalid', 401);
  }
  await client.query("SELECT set_config('projed.verified_google_subject', $1, true)", [identity.googleSubject]);
  const proof = await client.query<{ local_user_id: string }>(
    'SELECT local_user_id::text FROM projed_core.google_identity_proofs WHERE google_subject = $1', [identity.googleSubject],
  );
  if (proof.rows.length === 0) return { status: 'missing' };
  if (proof.rows.length !== 1 || !UUID.test(proof.rows[0]!.local_user_id)) return { status: 'ambiguous' };
  const localUserId = proof.rows[0]!.local_user_id;
  await client.query("SELECT set_config('projed.actor_local_user_id', $1, true)", [localUserId]);
  await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('projed:account:' || $1, 0))", [localUserId]);
  const guards = await client.query<{ active: boolean; revision: string }>(
    'SELECT active, revision::text FROM projed_core.account_authorization_guards WHERE local_user_id = $1::uuid', [localUserId],
  );
  const row = guards.rows[0];
  if (guards.rows.length !== 1 || !row || row.active !== true) return { status: 'inactive' };
  if (!REVISION.test(row.revision) || BigInt(row.revision) > 9_223_372_036_854_775_807n) {
    throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Account guard cannot be confirmed', 503);
  }
  return Object.freeze({
    status: 'active', principalId: identity.principalId, identityIssuer: identity.identityIssuer,
    identitySubject: identity.identitySubject, googleSubject: identity.googleSubject,
    mappingRevision: identity.mappingRevision, localUserId, accountGuardRevision: row.revision,
  });
}

/** Resolves the verified owner Principal -> Google ID -> original UUID chain.
 * It never creates users, activates guards, rewrites a mapping, or uses email.
 */
export class GooglePrincipalMappingResolver implements PrincipalMappingResolver {
  constructor(readonly database: RuntimeDatabase) {}

  async resolve(identity: MappingIdentity): Promise<PrincipalMappingResult> {
    const lease = await this.database.checkout();
    let begun = false;
    try {
      await lease.client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
      begun = true;
      const result = await resolveGoogleMappingInTransaction(lease.client, identity);
      // Read-only transaction: rollback clears all lookup GUCs before pool reuse.
      await lease.client.query('ROLLBACK');
      begun = false;
      lease.release();
      return result;
    } catch (error) {
      let safe = false;
      if (begun) {
        try { await lease.client.query('ROLLBACK'); safe = true; } catch { /* Destroy an uncertain client. */ }
      }
      lease.release(!safe);
      if (error instanceof KernelError) throw error;
      throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Principal mapping cannot be confirmed', 503);
    }
  }
}
