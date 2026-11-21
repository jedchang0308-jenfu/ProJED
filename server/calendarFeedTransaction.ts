import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase, ScopedQuery } from './db.js';
import { KernelError, asKernelError } from './errors.js';
import { captureSessionPermissions } from './sessionPermissions.js';

type FeedPrincipal = { contract_version: string; google_subject: string; principal_id: string | null;
  principal_kind: 'employee' | 'personal' | null; status: 'ACTIVE' | 'INACTIVE' | 'UNREGISTERED' | 'UNAVAILABLE' };
const unavailable = () => new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Calendar owner state cannot be confirmed', 503);

// An old imported bearer may predate central Principal enrollment. Preserve
// only currently authorized resources in workspaces the original UUID owns.
// Missing central proof never reactivates an old shared/external membership.
async function captureLegacyOwnedCalendarPermissions(client: PoolClient) {
  const result = await client.query<{ id: string; tenant_id: string; can_manage: boolean }>(`
    SELECT board.id::text,board.tenant_id::text,
      projed_core.actor_has_board_capability_v1(board.tenant_id,board.id,'manage_board_members') AS can_manage
    FROM projed_core.projects board JOIN projed_core.tenants tenant ON tenant.id=board.tenant_id
    WHERE tenant.owner_id=projed_core.current_actor_user_id_v1()
      AND projed_core.actor_has_board_capability_v1(board.tenant_id,board.id,'read_board')
  `);
  const boards = Object.fromEntries(result.rows.map(row => [row.id, { workspaceId: row.tenant_id,
    role: 'owner', inheritedRole: null, capabilities: ['read_board', ...(row.can_manage ? ['manage_board_members'] : [])] }]));
  const visibleWorkspaces = [...new Set(result.rows.map(row => row.tenant_id))];
  const workspaces = Object.fromEntries(visibleWorkspaces.map(id => [id, { role: 'owner', capabilities: ['read_workspace'] }]));
  return { version: 1, workspaces, boards, visibleWorkspaces };
}

/** Separate machine authority: bearer -> locked subscription -> owner guard ->
 * immutable Google proof -> current publication/Board rights, in one app mutex.
 * This never accepts a browser actor, issues a Session, or caches human rights. */
export async function runCalendarFeedTransaction<T>(database: RuntimeDatabase, config: RuntimeConfig,
  tokenHash: string, callback: (port: { query: ScopedQuery }, subscriptionId: string) => Promise<T>): Promise<T> {
  if (!/^[a-f0-9]{64}$/u.test(tokenHash)) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
  const lease = await database.checkout();
  const client = lease.client;
  const deadline = performance.now() + config.profile.runtime.timeouts.transactionMillis;
  let began = false; let commitSent = false; let closed = false; let inFlight = false;
  const query: ScopedQuery = async <R extends QueryResultRow>(sql: string, values: readonly unknown[] = []) => {
    if (closed || inFlight || performance.now() >= deadline || !/^\s*SELECT\b/iu.test(sql)
      || /;/u.test(sql) || /\b(?:set_config|pg_advisory\w*|dblink\w*)\s*\(/iu.test(sql)) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Calendar read port is unavailable', 409);
    inFlight = true;
    try { return await client.query<R>(sql, [...values]); } finally { inFlight = false; }
  };
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
    await client.query(`SELECT set_config('projed.calendar_feed_token_hash',$1,true),
      set_config('projed.session_permissions','',true),set_config('projed.session_token_hash','',true),
      set_config('statement_timeout',$2,true),set_config('lock_timeout',$3,true),set_config('idle_in_transaction_session_timeout',$4,true)`,
    [tokenHash,`${config.profile.runtime.timeouts.statementMillis}ms`,`${config.profile.runtime.timeouts.lockMillis}ms`,`${config.profile.runtime.timeouts.idleInTransactionMillis}ms`]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1',0))");
    const row = (await client.query<{ id: string; owner_user_id: string; is_active: boolean; expires_at: Date | null }>(`
      SELECT id::text,owner_user_id::text,is_active,expires_at FROM projed_core.calendar_subscriptions
      WHERE token_hash=$1`, [tokenHash])).rows[0];
    if (!row) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
    if (!row.is_active || row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
    await client.query(`SELECT set_config('projed.calendar_feed_owner_user_id',$1,true),
      set_config('projed.calendar_feed_subscription_id',$2,true),set_config('projed.actor_local_user_id',$1,true),
      set_config('projed.actor_principal_id',$3,true),set_config('projed.actor_entry','main',true),
      set_config('projed.actor_context_id',$4,true)`, [row.owner_user_id,row.id,`calendar-feed:${row.id}`,randomUUID()]);
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('projed:account:' || $1,0))", [row.owner_user_id]);
    const guard = (await client.query<{ active: boolean; revision: string }>(`
      SELECT active,revision::text FROM projed_core.account_authorization_guards WHERE local_user_id=$1::uuid`, [row.owner_user_id])).rows[0];
    if (!guard?.active || !/^[1-9][0-9]{0,18}$/u.test(guard.revision)) throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
    await client.query("SELECT set_config('projed.actor_guard_revision',$1,true)", [guard.revision]);
    // PostgreSQL applies UPDATE RLS to row-locking SELECT. Resolve via the
    // bearer policy first, then lock/recheck under the proven owner's context.
    const locked = (await client.query<{ is_active: boolean; expires_at: Date | null }>(`
      SELECT is_active,expires_at FROM projed_core.calendar_subscriptions
       WHERE id=$1::uuid AND token_hash=$2 AND owner_user_id=projed_core.current_actor_user_id_v1() FOR SHARE`, [row.id,tokenHash])).rows[0];
    if (!locked) throw new KernelError('RESOURCE_NOT_FOUND', 'Calendar feed is unavailable', 404);
    if (!locked.is_active || locked.expires_at && new Date(locked.expires_at).getTime() <= Date.now()) throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
    if (config.env === 'managed') {
      const proofs = await client.query<{ google_subject: string }>(`
        SELECT google_subject FROM projed_core.google_identity_proofs WHERE local_user_id=$1::uuid`, [row.owner_user_id]);
      if (proofs.rows.length !== 1) throw unavailable();
      const googleSubject = proofs.rows[0]!.google_subject;
      const principals = await client.query<FeedPrincipal>(
        'SELECT * FROM orgmaster_contract.read_projed_calendar_principal_v1($1::text)', [googleSubject]);
      const principal = principals.rows[0];
      if (principals.rows.length !== 1 || !principal || principal.contract_version !== 'orgmaster.projed-calendar-principal.v1'
        || principal.google_subject !== googleSubject || !['ACTIVE','INACTIVE','UNREGISTERED'].includes(principal.status)) throw unavailable();
      if (principal.status === 'INACTIVE') throw new KernelError('ACCESS_DENIED', 'Calendar feed is disabled', 410);
      let permissions;
      if (principal.status === 'ACTIVE') {
        if (!principal.principal_id || !['employee','personal'].includes(principal.principal_kind ?? '')) throw unavailable();
        await client.query("SELECT set_config('projed.actor_principal_id',$1,true)", [principal.principal_id]);
        permissions = await captureSessionPermissions(client, { principalId: principal.principal_id,
          principalKind: principal.principal_kind!, googleSubject });
      } else permissions = await captureLegacyOwnedCalendarPermissions(client);
      await client.query("SELECT set_config('projed.session_permissions',$1,true)", [JSON.stringify(permissions)]);
    }
    if ((await client.query<{ valid: boolean }>('SELECT projed_core.actor_context_valid_v1() AS valid')).rows[0]?.valid !== true) throw unavailable();
    const result = await callback({ query }, row.id);
    closed = true;
    if (inFlight || performance.now() >= deadline) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Calendar transaction expired', 409);
    await client.query('UPDATE projed_core.calendar_subscriptions SET last_accessed_at=now() WHERE id=$1::uuid AND token_hash=$2', [row.id,tokenHash]);
    commitSent = true; await client.query('COMMIT'); began = false; lease.release(); return result;
  } catch (error) {
    closed = true;
    if (commitSent) { lease.release(true); throw new KernelError('DB_COMMIT_UNKNOWN', 'Calendar commit result is unknown', 503, { cause: error }); }
    let safe = !began;
    if (began) try { await client.query('ROLLBACK'); safe = true; } catch { /* discard uncertain connection */ }
    lease.release(!safe || inFlight); throw asKernelError(error);
  }
}
