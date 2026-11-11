import type { PoolClient, QueryResultRow } from 'pg';

import type { RuntimeConfig } from './config.js';
import type { RuntimeDatabase, ScopedQuery } from './db.js';
import { KernelError, asKernelError } from './errors.js';

export interface ServerActorV1 {
  readonly principalId: string;
  readonly localUserId: string;
  readonly entry: 'main' | 'quick';
  readonly contextId: string;
  readonly expiresAtMs: number;
  readonly accountGuardRevision: string;
}

export type BoardMutationAuthorization = 'bootstrap' | 'edit-settings' | 'manage-members' | 'configure-permissions';

export interface ActorQueryPort {
  query: ScopedQuery;
  authorizeWorkspaceBootstrap(tenantId: string): Promise<void>;
  authorizeBoardMutation(
    tenantId: string,
    projectId: string,
    authorization: BoardMutationAuthorization,
  ): Promise<void>;
  authorizeBoardTransfer(sourceTenantId: string, projectId: string, targetTenantId: string): Promise<void>;
  authorizeTaskPlacement(
    tenantId: string,
    projectId: string,
    direction: 'to_board' | 'to_unplaced',
  ): Promise<void>;
  authorizeTaskTrackingDerivedRead(tenantId: string): Promise<void>;
  authorizeBackupGuard(tenantId: string, projectId: string): Promise<void>;
  authorizeRecordRagMutation(tenantId: string, projectId: string, recordId: string): Promise<void>;
  authorizeRagJobMutation(tenantId: string, documentId: string, jobId: string, claimToken?: string): Promise<void>;
  authorizeMeetingCaptureMutation(recordId: string, captureId: string): Promise<void>;
  authorizeMeetingAudioMutation(captureId: string, segmentId: string, phase: 'reserve' | 'claim' | 'verify'): Promise<void>;
  authorizeMeetingReviewMutation(captureId: string, resolutionId: string): Promise<void>;
  authorizeMeetingProjectionMutation(recordId: string, captureId: string): Promise<void>;
}

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const REVISION_RE = /^[1-9][0-9]{0,18}$/;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

export function validateServerActor(actor: ServerActorV1, nowMs = Date.now()): void {
  if (typeof actor.principalId !== 'string' || actor.principalId.length < 1 || actor.principalId.length > 255
      || !UUID_RE.test(actor.localUserId) || !UUID_RE.test(actor.contextId)
      || (actor.entry !== 'main' && actor.entry !== 'quick')
      || !Number.isSafeInteger(actor.expiresAtMs) || actor.expiresAtMs <= nowMs
      || !REVISION_RE.test(actor.accountGuardRevision)
      || BigInt(actor.accountGuardRevision) > MAX_BIGINT) {
    throw new KernelError('ACTOR_INVALID', 'Server actor is invalid or expired', 401);
  }
}

async function rollback(client: PoolClient): Promise<boolean> {
  try {
    await client.query('ROLLBACK');
    return true;
  } catch {
    return false;
  }
}

export async function runActorTransaction<T>(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  actor: ServerActorV1,
  callback: (port: ActorQueryPort) => Promise<T>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<T> {
  const checkCancellation = () => {
    if (options.signal?.aborted) throw new KernelError('TRANSACTION_USAGE_INVALID','Operation was cancelled',409);
  };
  checkCancellation();
  validateServerActor(actor);
  const deadline = performance.now() + config.profile.runtime.timeouts.transactionMillis;
  const lease = await database.checkout();
  const client = lease.client;
  let transactionStarted = false;
  let beginSent = false;
  let commitSent = false;
  let confirmedCommitRejection: KernelError | undefined;
  let portClosed = false;
  let inFlight = false;

  const guardedClientQuery = async <R extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
    checkCancellation();
    if (portClosed || performance.now() >= deadline) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Transaction query port is closed or expired');
    }
    if (inFlight) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Parallel queries are not allowed');
    inFlight = true;
    try {
      return await client.query<R>(text, [...values]);
    } finally {
      inFlight = false;
    }
  };

  const query: ScopedQuery = async <R extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
    if (/\b(?:begin|commit|rollback|set\s+(?:local|session|role)|reset|discard)\b/i.test(text)
        || /\bset_config\s*\(/i.test(text)
        || /(?:^|;)\s*(?:(?:--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)\s*)*set\b/iu.test(text)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Transaction control is owned by the kernel');
    }
    return guardedClientQuery<R>(text, values);
  };

  const authorizeBoardMutation = async (
    tenantId: string,
    projectId: string,
    authorization: BoardMutationAuthorization,
  ): Promise<void> => {
    if (!UUID_RE.test(tenantId) || !UUID_RE.test(projectId)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Board mutation scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT CASE $3::text
          WHEN 'bootstrap' THEN projed_core.actor_has_workspace_capability_v1($1::uuid, 'create_board')
          WHEN 'edit-settings' THEN projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'edit_board_settings')
          WHEN 'manage-members' THEN projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'manage_board_members')
          WHEN 'configure-permissions' THEN projed_core.actor_can_configure_role_permissions_v1($1::uuid, $2::uuid)
          ELSE false
        END AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed
               THEN set_config('projed.authorized_board_mutation', $1::text || '/' || $2::text, true)
               ELSE ''
             END AS configured
        FROM authz
    `, [tenantId, projectId, authorization]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeWorkspaceBootstrap = async (tenantId: string): Promise<void> => {
    if (!UUID_RE.test(tenantId)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Workspace bootstrap scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT EXISTS (
          SELECT 1 FROM projed_core.tenants tenant
           WHERE tenant.id = $1::uuid
             AND tenant.owner_id = projed_core.current_actor_user_id_v1()
        ) AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed
               THEN set_config('projed.authorized_workspace_bootstrap', $1::text, true)
               ELSE ''
             END AS configured
        FROM authz
    `, [tenantId]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeBoardTransfer = async (
    sourceTenantId: string,
    projectId: string,
    targetTenantId: string,
  ): Promise<void> => {
    if (![sourceTenantId, projectId, targetTenantId].every(value => UUID_RE.test(value))
        || sourceTenantId === targetTenantId) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Board transfer scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'move_board_between_workspaces')
          AND projed_core.actor_has_workspace_capability_v1($3::uuid, 'manage_workspace_settings') AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed THEN set_config(
               'projed.authorized_board_mutation', $1::text || '/' || $2::text, true
             ) ELSE '' END AS board_configured,
             CASE WHEN allowed THEN set_config(
               'projed.authorized_board_transfer', $1::text || '/' || $2::text || '/' || $3::text, true
             ) ELSE '' END AS transfer_configured
        FROM authz
    `, [sourceTenantId, projectId, targetTenantId]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeTaskPlacement = async (
    tenantId: string,
    projectId: string,
    direction: 'to_board' | 'to_unplaced',
  ): Promise<void> => {
    if (!UUID_RE.test(tenantId) || !UUID_RE.test(projectId)
        || (direction !== 'to_board' && direction !== 'to_unplaced')) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Task placement scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'move_task') AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed THEN set_config(
               'projed.authorized_task_placement', $1::text || '/' || $2::text || '/' || $3::text, true
             ) ELSE '' END AS configured
        FROM authz
    `, [tenantId, projectId, direction]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeTaskTrackingDerivedRead = async (tenantId: string): Promise<void> => {
    if (!UUID_RE.test(tenantId)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Tracking derived-read scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT EXISTS (
          SELECT 1 FROM projed_core.tenant_members member
           WHERE member.tenant_id = $1::uuid
             AND member.user_id = projed_core.current_actor_user_id_v1()
             AND member.status = 'active'
        ) AND projed_core.actor_context_valid_v1() AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed THEN set_config('projed.authorized_tracking_derived_read', $1::text, true)
               ELSE '' END AS configured
        FROM authz
    `, [tenantId]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeBackupGuard = async (tenantId: string, projectId: string): Promise<void> => {
    if (!UUID_RE.test(tenantId) || !UUID_RE.test(projectId)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Backup guard scope is invalid');
    }
    const result = await guardedClientQuery<{ allowed: boolean }>(`
      WITH authz AS (
        SELECT projed_core.actor_has_board_capability_v1($1::uuid, $2::uuid, 'delete_task')
          AND projed_core.actor_context_valid_v1() AS allowed
      )
      SELECT allowed,
             CASE WHEN allowed THEN set_config(
               'projed.authorized_backup_guard', $1::text || '/' || $2::text, true
             ) ELSE '' END AS configured
        FROM authz
    `, [tenantId, projectId]);
    if (result.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    }
  };

  const authorizeRecordRagMutation = async (tenantId: string, projectId: string, recordId: string): Promise<void> => {
    if (![tenantId, projectId, recordId].every(value => UUID_RE.test(value))) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Record index scope is invalid');
    }
    const allowed = await guardedClientQuery<{ allowed: boolean }>(`
      SELECT projed_core.actor_can_write_record_v1(tenant_id,project_id,visibility,created_by,recorded_by) AS allowed
        FROM projed_core.knowledge_records WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND id=$3::uuid
    `, [tenantId,projectId,recordId]);
    if (allowed.rows.length !== 1 || allowed.rows[0]?.allowed !== true) {
      throw new KernelError('ACCESS_DENIED', 'Record index source is not writable', 403);
    }
    await guardedClientQuery(`SELECT set_config('projed.rag_record_id',$1,true),
      set_config('projed.rag_document_id','',true),set_config('projed.rag_job_id','',true),
      set_config('projed.rag_job_claim','',true)`, [recordId]);
  };

  const authorizeRagJobMutation = async (
    tenantId: string, documentId: string, jobId: string, claimToken?: string,
  ): Promise<void> => {
    if (![tenantId,documentId,jobId].every(value => UUID_RE.test(value))
        || (claimToken !== undefined && !/^[a-f0-9]{64}$/u.test(claimToken))) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Index job scope is invalid');
    }
    const visible = await guardedClientQuery<{ id: string }>(`
      SELECT id::text FROM projed_core.documents WHERE tenant_id=$1::uuid AND id=$2::uuid
    `, [tenantId,documentId]);
    if (visible.rows.length !== 1) throw new KernelError('ACCESS_DENIED', 'Index source is not available', 403);
    await guardedClientQuery(`SELECT set_config('projed.rag_document_id',$1,true),
      set_config('projed.rag_job_id',$2,true),set_config('projed.rag_job_claim',$3,true)`,
    [documentId,jobId,claimToken ?? '']);
  };

  const authorizeMeetingCaptureMutation = async (recordId: string, captureId: string): Promise<void> => {
    if (![recordId, captureId].every(value => UUID_RE.test(value))) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Meeting mutation scope is invalid');
    }
    const record = await guardedClientQuery<{ allowed: boolean }>(`SELECT
      projed_core.actor_can_write_record_v1(tenant_id,project_id,visibility,created_by,recorded_by) AS allowed
      FROM projed_core.knowledge_records WHERE id=$1::uuid AND record_type='meeting' FOR UPDATE`, [recordId]);
    if (record.rows.length !== 1 || record.rows[0]?.allowed !== true) {
      throw new KernelError('RESOURCE_NOT_FOUND', 'Meeting record is unavailable', 404);
    }
    await guardedClientQuery(`SELECT set_config('projed.meeting_record_id',$1,true),
      set_config('projed.meeting_capture_id',$2,true)`, [recordId, captureId]);
  };

  const authorizeMeetingAudioMutation = async (captureId: string, segmentId: string, phase: 'reserve' | 'claim' | 'verify'): Promise<void> => {
    if (![captureId, segmentId].every(value => UUID_RE.test(value)) || !['reserve','claim','verify'].includes(phase)) {
      throw new KernelError('TRANSACTION_USAGE_INVALID', 'Meeting audio scope is invalid');
    }
    await guardedClientQuery(`SELECT set_config('projed.meeting_audio_segment_id',$1,true),
      set_config('projed.meeting_audio_phase',$2,true)
      WHERE current_setting('projed.meeting_capture_id',true)=$3`, [segmentId,phase,captureId]);
  };

  const authorizeMeetingReviewMutation = async (captureId: string, resolutionId: string): Promise<void> => {
    if (![captureId,resolutionId].every(value => UUID_RE.test(value))) {
      throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting review scope is invalid');
    }
    const result=await guardedClientQuery(`SELECT set_config('projed.meeting_resolution_id',$1,true)
      WHERE current_setting('projed.meeting_capture_id',true)=$2`,[resolutionId,captureId]);
    if(result.rows.length!==1)throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting capture scope is not authorized');
  };
  const authorizeMeetingProjectionMutation = async (recordId: string, captureId: string): Promise<void> => {
    if (![recordId,captureId].every(value => UUID_RE.test(value))) {
      throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting projection scope is invalid');
    }
    const result=await guardedClientQuery(`SELECT set_config('projed.meeting_projection_record_id',$1,true)
      WHERE current_setting('projed.meeting_capture_id',true)=$2
        AND current_setting('projed.meeting_record_id',true)=$1`,[recordId,captureId]);
    if(result.rows.length!==1)throw new KernelError('TRANSACTION_USAGE_INVALID','Meeting record scope is not authorized');
  };

  try {
    checkCancellation();
    validateServerActor(actor);
    beginSent = true;
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    transactionStarted = true;
    await client.query(`
      SELECT set_config('projed.actor_principal_id', $1, true),
             set_config('projed.actor_local_user_id', $2, true),
             set_config('projed.actor_entry', $3, true),
             set_config('projed.actor_context_id', $4, true),
             set_config('projed.actor_guard_revision', $5, true),
             set_config('statement_timeout', $6, true),
             set_config('lock_timeout', $7, true),
             set_config('idle_in_transaction_session_timeout', $8, true)
    `, [actor.principalId, actor.localUserId, actor.entry, actor.contextId, actor.accountGuardRevision,
      `${config.profile.runtime.timeouts.statementMillis}ms`, `${config.profile.runtime.timeouts.lockMillis}ms`,
      `${config.profile.runtime.timeouts.idleInTransactionMillis}ms`]);
    // One app lock gives the internal app a clear order for record/privacy,
    // membership and Board changes, including callers outside HTTP dispatch.
    // Provider/storage work stays outside these short transactions.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('projed:runtime-transaction:v1', 0))");
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('projed:account:' || $1, 0))", [actor.localUserId]);
    const guard = await client.query<{ valid: boolean }>('SELECT projed_core.actor_context_valid_v1() AS valid');
    if (guard.rows[0]?.valid !== true) throw new KernelError('ACCESS_DENIED', 'Actor is not authorized', 403);
    const result = await callback({
      query,
      authorizeWorkspaceBootstrap,
      authorizeBoardMutation,
      authorizeBoardTransfer,
      authorizeTaskPlacement,
      authorizeTaskTrackingDerivedRead,
      authorizeBackupGuard,
      authorizeRecordRagMutation,
      authorizeRagJobMutation,
      authorizeMeetingCaptureMutation,
      authorizeMeetingAudioMutation,
      authorizeMeetingReviewMutation, authorizeMeetingProjectionMutation,
    });
    portClosed = true;
    if (inFlight) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Callback returned with an unfinished query');
    validateServerActor(actor);
    checkCancellation();
    if (performance.now() >= deadline) throw new KernelError('TRANSACTION_USAGE_INVALID', 'Transaction deadline exceeded');
    commitSent = true;
    try {
      await client.query('COMMIT');
    } catch (error) {
      const sqlState = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      // A server constraint error confirms that COMMIT rolled the transaction
      // back. It must not turn an invalid delete into an ambiguous/retryable
      // write. Transport failures and other unclassified results stay unknown.
      if (typeof sqlState === 'string' && /^23[0-9A-Z]{3}$/u.test(sqlState)) {
        confirmedCommitRejection = new KernelError('DOMAIN_DATA_INVALID', 'Transaction violates data constraints', 409, { cause: error });
        throw confirmedCommitRejection;
      }
      throw new KernelError('DB_COMMIT_UNKNOWN', 'Commit result is unknown', 503, { cause: error });
    }
    transactionStarted = false;
    lease.release();
    return result;
  } catch (error) {
    portClosed = true;
    if (commitSent) {
      lease.release(true);
      if (confirmedCommitRejection && error === confirmedCommitRejection) throw confirmedCommitRejection;
      throw error instanceof KernelError && error.code === 'DB_COMMIT_UNKNOWN'
        ? error
        : new KernelError('DB_COMMIT_UNKNOWN', 'Commit result is unknown', 503, { cause: error });
    }
    const rolledBack = transactionStarted ? await rollback(client) : true;
    lease.release((beginSent && !transactionStarted) || !rolledBack || inFlight);
    throw asKernelError(error);
  }
}
