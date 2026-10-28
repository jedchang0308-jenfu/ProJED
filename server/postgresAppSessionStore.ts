import type { PoolClient, QueryResultRow } from 'pg';

import { validateServerActor } from './actorTransaction.js';
import type { AppSessionStore, CompleteLoginInput, LoginIntentStatus, StoredAppSession, StoredLoginIntent } from './appSessionStore.js';
import type { RuntimeDatabase } from './db.js';
import { KernelError } from './errors.js';
import { validateNormalizedIdentity, type ProducerVerifiedIdentity } from './identityConsumer.js';
import { resolveGoogleMappingInTransaction } from './principalMappings.js';

const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const REVISION = /^[1-9][0-9]{0,18}$/u;
const MAX_REVISION = 9_223_372_036_854_775_807n;
const STATUSES: readonly LoginIntentStatus[] = ['pending','processing','consumed','cancelled','rejected'];

function conflict(): never { throw new KernelError('IDENTITY_INVALID', 'Login intent is expired or already settled', 409); }
function unavailable(): never { throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Stored Session state cannot be confirmed', 503); }
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !HASH.test(value)) conflict(); }
function timestamp(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value))) unavailable();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) unavailable();
  return result;
}
function string(value: unknown): string { if (typeof value !== 'string') unavailable(); return value; }
function nullableHash(value: unknown): string | null { if (value === null) return null; hash(value); return value; }

function login(row: QueryResultRow): StoredLoginIntent {
  hash(row.token_hash); hash(row.state_hash);
  if (row.entry !== 'main' && row.entry !== 'quick') unavailable();
  if (!STATUSES.includes(row.status)) unavailable();
  const verifier = row.code_verifier === null ? null : string(row.code_verifier);
  const status = row.status as LoginIntentStatus;
  if ((status === 'pending' || status === 'processing') !== (verifier !== null)) unavailable();
  if (verifier !== null && !/^[A-Za-z0-9_-]{43,128}$/u.test(verifier)) unavailable();
  return Object.freeze({
    tokenHash: row.token_hash, stateHash: row.state_hash, entry: row.entry,
    publicOrigin: string(row.public_origin), returnPath: string(row.return_path),
    oldSessionHash: nullableHash(row.old_session_hash), codeVerifier: verifier, status,
    claimHash: nullableHash(row.claim_hash), completedSessionHash: nullableHash(row.completed_session_hash),
    expiresAtMs: timestamp(row.expires_at_ms),
  });
}

function session(row: QueryResultRow): StoredAppSession {
  hash(row.token_hash);
  if (row.entry !== 'main' && row.entry !== 'quick') unavailable();
  if (!UUID.test(string(row.local_user_id)) || !UUID.test(string(row.context_id))) unavailable();
  const revision = string(row.account_guard_revision);
  if (!REVISION.test(revision) || BigInt(revision) > MAX_REVISION) unavailable();
  const proof = row.identity as ProducerVerifiedIdentity;
  try {
    // Validate the original proof at its original issue time. Future requests
    // re-read current state; they must not re-consume an expired handoff code.
    validateNormalizedIdentity(proof, timestamp(proof?.issuedAtMs));
  } catch { unavailable(); }
  const expiresAtMs = timestamp(row.expires_at_ms);
  if (proof.contractVersion !== 'jenfu.sso-handoff.v4' || proof.audience !== 'projed'
      || proof.googleSubject !== row.google_subject || expiresAtMs > proof.sourceSessionExpiresAtMs) unavailable();
  return Object.freeze({
    tokenHash: row.token_hash, publicOrigin: string(row.public_origin), entry: row.entry,
    localUserId: row.local_user_id, contextId: row.context_id, accountGuardRevision: revision,
    identity: Object.freeze({ ...proof }), expiresAtMs,
    revokedAtMs: row.revoked_at_ms === null ? null : timestamp(row.revoked_at_ms),
  });
}

const LOGIN_COLUMNS = 'token_hash,state_hash,entry,public_origin,return_path,old_session_hash,code_verifier,status,claim_hash,completed_session_hash,expires_at_ms::text';
const SESSION_COLUMNS = 'token_hash,public_origin,entry,local_user_id::text,google_subject,context_id::text,account_guard_revision::text,identity,expires_at_ms::text,revoked_at_ms::text';

/** Durable state machine on the existing runtime pool; no bootstrap or retries. */
export class PostgresAppSessionStore implements AppSessionStore {
  readonly #now: () => number;
  constructor(readonly database: RuntimeDatabase, options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  async #transaction<T>(loginHash: string | null, sessionHash: string | null, readOnly: boolean,
    operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (loginHash !== null) hash(loginHash);
    if (sessionHash !== null) hash(sessionHash);
    const lease = await this.database.checkout();
    let began = false;
    let commitSent = false;
    const deadline = performance.now() + 5_000;
    try {
      await lease.client.query(`BEGIN ISOLATION LEVEL READ COMMITTED${readOnly ? ' READ ONLY' : ''}`);
      began = true;
      await lease.client.query(`SELECT set_config('projed.login_token_hash',$1,true),
        set_config('projed.session_token_hash',$2,true)`, [loginHash ?? '',sessionHash ?? '']);
      const result = await operation(lease.client);
      if (performance.now() >= deadline) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Session transaction deadline exceeded', 503);
      if (readOnly) await lease.client.query('ROLLBACK');
      else { commitSent = true; await lease.client.query('COMMIT'); }
      began = false;
      lease.release();
      return result;
    } catch (error) {
      if (commitSent) {
        lease.release(true);
        throw new KernelError('DB_COMMIT_UNKNOWN', 'Session commit result is unknown', 503);
      }
      let safe = false;
      if (began) { try { await lease.client.query('ROLLBACK'); safe = true; } catch { /* Destroy uncertain client. */ } }
      lease.release(!safe);
      if (error instanceof KernelError) throw error;
      if ((error as { code?: string })?.code === '23505') conflict();
      throw new KernelError('IDENTITY_STATE_UNAVAILABLE', 'Session storage is unavailable', 503);
    }
  }

  async begin(intent: StoredLoginIntent): Promise<void> {
    hash(intent.stateHash);
    if (intent.status !== 'pending' || intent.claimHash !== null || intent.completedSessionHash !== null
        || intent.codeVerifier === null || intent.expiresAtMs <= this.#now()) conflict();
    await this.#transaction(intent.tokenHash,intent.oldSessionHash,false,async client => {
      if (intent.oldSessionHash !== null) {
        // Serialize start/complete on the original Session before locking an
        // intent. A lost begin response is recoverable with the old cookie.
        const old = await client.query(`SELECT ${SESSION_COLUMNS} FROM projed_core.app_sessions
          WHERE token_hash=$1 FOR UPDATE`,[intent.oldSessionHash]);
        if (old.rows.length !== 1) conflict();
        const previous = session(old.rows[0]!);
        if (previous.revokedAtMs !== null || previous.expiresAtMs <= this.#now()
            || previous.publicOrigin !== intent.publicOrigin || previous.entry !== intent.entry) {
          throw new KernelError('ACTOR_CHANGED','Original Session changed before login started',409);
        }
        await client.query(`UPDATE projed_core.app_login_intents
          SET status='cancelled',claim_hash=NULL,code_verifier=NULL
          WHERE old_session_hash=$1 AND status IN ('pending','processing')`,[intent.oldSessionHash]);
      }
      await client.query(`INSERT INTO projed_core.app_login_intents
        (token_hash,state_hash,entry,public_origin,return_path,old_session_hash,code_verifier,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::bigint)`, [intent.tokenHash,intent.stateHash,intent.entry,
        intent.publicOrigin,intent.returnPath,intent.oldSessionHash,intent.codeVerifier,intent.expiresAtMs]);
    });
  }

  async readLogin(tokenHash: string): Promise<StoredLoginIntent | null> {
    return this.#transaction(tokenHash,null,true,async client => {
      const result = await client.query(`SELECT ${LOGIN_COLUMNS} FROM projed_core.app_login_intents WHERE token_hash=$1`,[tokenHash]);
      if (result.rows.length > 1) unavailable();
      return result.rows[0] ? login(result.rows[0]) : null;
    });
  }

  async claim(tokenHash: string,stateHash: string,claimHash: string,nowMs: number): Promise<StoredLoginIntent> {
    hash(stateHash); hash(claimHash);
    return this.#transaction(tokenHash,null,false,async client => {
      const result = await client.query(`UPDATE projed_core.app_login_intents SET status='processing',claim_hash=$3
        WHERE token_hash=$1 AND state_hash=$2 AND status='pending' AND expires_at_ms>$4::bigint
        RETURNING ${LOGIN_COLUMNS}`,[tokenHash,stateHash,claimHash,Math.max(timestamp(nowMs),this.#now())]);
      if (result.rows.length !== 1) conflict();
      return login(result.rows[0]!);
    });
  }

  async cancel(tokenHash: string,publicOrigin: string,_nowMs: number): Promise<StoredLoginIntent | null> {
    return this.#transaction(tokenHash,null,false,async client => {
      const current = await client.query(`SELECT ${LOGIN_COLUMNS} FROM projed_core.app_login_intents WHERE token_hash=$1 FOR UPDATE`,[tokenHash]);
      if (!current.rows[0]) return null;
      const intent = login(current.rows[0]);
      if (intent.publicOrigin !== publicOrigin) conflict();
      if (intent.status === 'consumed') throw new KernelError('ACTOR_CHANGED','Login already completed',409);
      if (intent.status === 'cancelled' || intent.status === 'rejected') return intent;
      const updated = await client.query(`UPDATE projed_core.app_login_intents SET status='cancelled',claim_hash=NULL,code_verifier=NULL
        WHERE token_hash=$1 AND status IN ('pending','processing') RETURNING ${LOGIN_COLUMNS}`,[tokenHash]);
      if (updated.rows.length !== 1) conflict();
      return login(updated.rows[0]!);
    });
  }

  async reject(tokenHash: string,claimHash: string): Promise<void> {
    hash(claimHash);
    await this.#transaction(tokenHash,null,false,async client => {
      await client.query(`UPDATE projed_core.app_login_intents SET status='rejected',claim_hash=NULL,code_verifier=NULL
        WHERE token_hash=$1 AND claim_hash=$2 AND status='processing'`,[tokenHash,claimHash]);
    });
  }

  async complete(input: CompleteLoginInput): Promise<StoredAppSession> {
    hash(input.stateHash); hash(input.claimHash); hash(input.sessionTokenHash);
    if (!UUID.test(input.contextId)) conflict();
    const proof = Object.freeze({ ...input.verified.identity });
    validateNormalizedIdentity(proof,this.#now());
    validateServerActor(input.verified.actor,this.#now());
    return this.#transaction(input.tokenHash,null,false,async client => {
      const initial = await client.query(`SELECT ${LOGIN_COLUMNS} FROM projed_core.app_login_intents
        WHERE token_hash=$1 AND state_hash=$2`,[input.tokenHash,input.stateHash]);
      if (initial.rows.length !== 1) conflict();
      const first = login(initial.rows[0]!);
      if (first.oldSessionHash !== null) {
        await client.query("SELECT set_config('projed.session_token_hash',$1,true)",[first.oldSessionHash]);
        const old = await client.query(`SELECT ${SESSION_COLUMNS} FROM projed_core.app_sessions
          WHERE token_hash=$1 FOR UPDATE`,[first.oldSessionHash]);
        if (old.rows.length !== 1) conflict();
        const previous = session(old.rows[0]!);
        if (previous.revokedAtMs !== null || previous.expiresAtMs <= this.#now()
            || previous.publicOrigin !== first.publicOrigin || previous.entry !== first.entry) {
          throw new KernelError('ACTOR_CHANGED','Original Session changed before login completed',409);
        }
      }
      const current = await client.query(`SELECT ${LOGIN_COLUMNS} FROM projed_core.app_login_intents
        WHERE token_hash=$1 AND state_hash=$2 FOR UPDATE`,[input.tokenHash,input.stateHash]);
      if (current.rows.length !== 1) conflict();
      const intent = login(current.rows[0]!);
      if (intent.status !== 'processing' || intent.claimHash !== input.claimHash || intent.expiresAtMs <= this.#now()
          || intent.entry !== input.verified.actor.entry || input.sessionTokenHash === intent.oldSessionHash) conflict();
      const mapped = await resolveGoogleMappingInTransaction(client,proof);
      if (mapped.status !== 'active') throw new KernelError('ACCESS_DENIED','Original account mapping is unavailable',403);
      if (mapped.localUserId !== input.verified.actor.localUserId || mapped.accountGuardRevision !== input.verified.actor.accountGuardRevision
          || proof.principalId !== input.verified.actor.principalId) conflict();
      await client.query(`SELECT set_config('projed.actor_principal_id',$1,true),set_config('projed.actor_entry',$2,true),
        set_config('projed.actor_context_id',$3,true),set_config('projed.actor_guard_revision',$4,true)`,
      [proof.principalId,intent.entry,input.contextId,mapped.accountGuardRevision]);
      if (intent.oldSessionHash !== null) {
        await client.query("SELECT set_config('projed.session_token_hash',$1,true)",[intent.oldSessionHash]);
        const revoked = await client.query(`UPDATE projed_core.app_sessions SET revoked_at_ms=$2::bigint
          WHERE token_hash=$1 AND public_origin=$3 AND entry=$4 AND revoked_at_ms IS NULL`,
        [intent.oldSessionHash,this.#now(),intent.publicOrigin,intent.entry]);
        if (revoked.rowCount !== 1) throw new KernelError('ACTOR_CHANGED','Original Session changed during login',409);
      }
      await client.query("SELECT set_config('projed.session_token_hash',$1,true)",[input.sessionTokenHash]);
      const result = await client.query(`INSERT INTO projed_core.app_sessions
        (token_hash,public_origin,entry,local_user_id,google_subject,context_id,account_guard_revision,identity,expires_at_ms)
        VALUES($1,$2,$3,$4::uuid,$5,$6::uuid,$7::bigint,$8::jsonb,$9::bigint) RETURNING ${SESSION_COLUMNS}`,
      [input.sessionTokenHash,intent.publicOrigin,intent.entry,mapped.localUserId,proof.googleSubject,input.contextId,
        mapped.accountGuardRevision,JSON.stringify(proof),proof.sourceSessionExpiresAtMs]);
      const consumed = await client.query(`UPDATE projed_core.app_login_intents
        SET status='consumed',claim_hash=NULL,code_verifier=NULL,completed_session_hash=$2
        WHERE token_hash=$1 AND claim_hash=$3 AND status='processing'`,[input.tokenHash,input.sessionTokenHash,input.claimHash]);
      if (consumed.rowCount !== 1 || result.rows.length !== 1 || intent.expiresAtMs <= this.#now()) conflict();
      validateNormalizedIdentity(proof,this.#now());
      validateServerActor(input.verified.actor,this.#now());
      return session(result.rows[0]!);
    });
  }

  async readSession(tokenHash: string): Promise<StoredAppSession | null> {
    return this.#transaction(null,tokenHash,true,async client => {
      const result = await client.query(`SELECT ${SESSION_COLUMNS} FROM projed_core.app_sessions WHERE token_hash=$1`,[tokenHash]);
      if (result.rows.length > 1) unavailable();
      return result.rows[0] ? session(result.rows[0]) : null;
    });
  }

  async revokeSession(tokenHash: string,publicOrigin: string,nowMs: number): Promise<boolean> {
    return this.#transaction(null,tokenHash,false,async client => {
      const revoked = await client.query(`UPDATE projed_core.app_sessions SET revoked_at_ms=$3::bigint
        WHERE token_hash=$1 AND public_origin=$2 AND revoked_at_ms IS NULL`,[tokenHash,publicOrigin,Math.max(timestamp(nowMs),this.#now())]);
      return revoked.rowCount === 1;
    });
  }
}
