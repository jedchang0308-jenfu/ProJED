import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { sha256, type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase, type ExpectedMigration } from '../../../server/db.js';
import { resolveBoard } from '../../../server/domainRead.js';
import { KernelError } from '../../../server/errors.js';
import { createKernelHttpServer } from '../../../server/http.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';
import type { TaskNode } from '../../../src/types/index.js';

type SessionLabel = 'qa-meeting-capture-owner' | 'qa-meeting-capture-reader' | 'qa-meeting-capture-outsider';
type JsonObject = Record<string, unknown>;

interface FinanceFixture {
  readonly budgetMonth: string;
  readonly budgetLimit: string;
  readonly queuedRunId: string;
  readonly runningRunId: string;
  readonly retryableRunId: string;
  readonly reservedAttemptId: string;
  readonly unknownAttemptId: string;
  readonly legacyAttemptId: string;
  readonly retryablePendingAttemptId: string;
  readonly cleanupObligationId: string;
  readonly storageSegmentId: string;
  readonly storageCleanupAttemptId: string;
  readonly storageObjectPath: string;
  readonly storageReservationKey: string;
  readonly queuedReserve: string;
  readonly runningReserve: string;
  readonly legacyReserve: string;
  readonly retryableReserve: string;
  readonly totalReserve: string;
}

function migrationSet(config: RuntimeConfig): ExpectedMigration[] {
  return config.profile.migrations.map(({ version, path }) => ({ version, checksum: sha256(readFileSync(path)) }));
}

function record(value: unknown, label: string): JsonObject {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function responseData(value: unknown, label: string): JsonObject {
  const envelope = record(value, `${label} envelope`);
  return record(envelope.data, `${label} data`);
}

function requireHttpError(error: unknown, code: string, status: number): boolean {
  assert.ok(error instanceof HttpApiError);
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
}

function adminUrlFor(config: RuntimeConfig): URL {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!raw) throw new Error('MEETING_FINANCE_ADMIN_FIXTURE_UNAVAILABLE');
  if (config.env !== 'disposable' || config.profile.environment !== 'disposable') {
    throw new Error('MEETING_FINANCE_ADMIN_REQUIRES_DISPOSABLE_PROFILE');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('MEETING_FINANCE_ADMIN_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port) !== config.binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== config.binding.databaseName
      || !/^dev139_s3_[0-9a-f]{32}$/u.test(config.binding.databaseName)
      || decodeURIComponent(url.username) !== 'postgres'
      || !url.password
      || url.search !== ''
      || url.hash !== '') {
    throw new Error('MEETING_FINANCE_ADMIN_BINDING_MISMATCH');
  }
  return url;
}

async function seedFinanceFixture(
  admin: pg.Client,
  captureId: string,
  onAllocated?: (fixture: FinanceFixture) => void,
  onBudgetInserted?: () => void,
): Promise<FinanceFixture> {
  const queuedReserve = '12345';
  const runningReserve = '67890';
  const legacyReserve = '55555';
  const retryableReserve = '24680';
  const totalReserve = String(BigInt(queuedReserve) + BigInt(runningReserve)
    + BigInt(legacyReserve) + BigInt(retryableReserve));
  // Use a far-future month only after confirming that it is absent. It is an
  // isolated QA ledger key, never a mutation to the active/global month.
  let budgetMonth = '';
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const year = 3000 + randomBytes(2).readUInt16BE(0) % 6990;
    const month = 1 + randomBytes(1).readUInt8(0) % 12;
    const candidate = `${year}-${String(month).padStart(2, '0')}-01`;
    const existing = await admin.query(
      'SELECT 1 FROM projed_core.meeting_ai_budget_months WHERE budget_month=$1::date', [candidate],
    );
    if (existing.rowCount === 0) {
      budgetMonth = candidate;
      break;
    }
  }
  if (!budgetMonth) throw new Error('MEETING_FINANCE_MONTH_COLLISION');

  const captureResult = await admin.query<{ tenant_id: string; project_id: string; record_id: string }>(`
    SELECT tenant_id::text,project_id::text,record_id::text
      FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid
  `, [captureId]);
  assert.equal(captureResult.rowCount, 1, 'the cleanup fixture must use its own capture scope');
  const captureScope = captureResult.rows[0];
  assert.ok(captureScope, 'the cleanup fixture capture must exist');
  const storageObjectPath = `${captureScope.tenant_id}/${captureScope.project_id}/${captureScope.record_id}/${captureId}/v1/0.webm`;
  const storageCleanupAttemptId = `storage:${captureId}:v1:segment:0`;

  const fixture: FinanceFixture = {
    budgetMonth,
    budgetLimit: (9_000_000_000_000_000_000n - BigInt(randomBytes(6).readUIntBE(0, 6))).toString(),
    queuedRunId: randomUUID(),
    runningRunId: randomUUID(),
    retryableRunId: randomUUID(),
    reservedAttemptId: `qa-meeting-capture-reserved-${randomUUID()}`,
    unknownAttemptId: `qa-meeting-capture-unknown-${randomUUID()}`,
    legacyAttemptId: `qa-meeting-capture-legacy-${randomUUID()}`,
    retryablePendingAttemptId: `qa-meeting-capture-retryable-pending-${randomUUID()}`,
    cleanupObligationId: randomUUID(),
    storageSegmentId: randomUUID(),
    storageCleanupAttemptId,
    storageObjectPath,
    storageReservationKey: `qa-meeting-capture-reservation-${randomUUID()}`,
    queuedReserve,
    runningReserve,
    legacyReserve,
    retryableReserve,
    totalReserve,
  };
  onAllocated?.(fixture);

  await admin.query('BEGIN');
  let committed = false;
  try {
    const budget = await admin.query(`
      INSERT INTO projed_core.meeting_ai_budget_months
        (budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros)
      VALUES($1::date,$2::bigint,$3::bigint,0)
      ON CONFLICT (budget_month) DO NOTHING
      RETURNING budget_month::text
    `, [fixture.budgetMonth, fixture.budgetLimit, fixture.totalReserve]);
    if (budget.rowCount !== 1) throw new Error('MEETING_FINANCE_MONTH_COLLISION');
    onBudgetInserted?.();

    const priorStorageCleanup = await admin.query(`
      SELECT 1 FROM projed_core.meeting_artifact_cleanup
       WHERE attempt_id=$1
    `, [fixture.storageCleanupAttemptId]);
    assert.equal(priorStorageCleanup.rowCount, 0, 'the storage obligation must be created by cancellation');
    const segment = await admin.query<{ id: string }>(`
      INSERT INTO projed_core.meeting_capture_segments
        (id,capture_id,segment_index,epoch,start_offset_ms,end_offset_ms,object_path,mime,bytes,
         upload_state,source_version,reservation_key,upload_token_expires_at,storage_backend)
      VALUES($1::uuid,$2::uuid,0,0,0,100,$3,'audio/webm',0,'pending',1,$4,now()+interval '2 hours','gcs')
      RETURNING id::text
    `, [fixture.storageSegmentId, captureId, fixture.storageObjectPath, fixture.storageReservationKey]);
    assert.equal(segment.rowCount, 1);
    assert.equal(segment.rows[0]?.id, fixture.storageSegmentId);

    const createdAt = new Date().toISOString();
    await admin.query(`
      INSERT INTO projed_core.meeting_analysis_runs
        (id,capture_id,source_version,request_key,config_version,state,budget_month,
         reserved_twd_micros,provider_mode,created_at,updated_at)
      VALUES
        ($1::uuid,$4::uuid,1,$5,'qa-capture-cancel-v1','queued',$6::date,$7::bigint,'fake',$10::timestamptz,$10::timestamptz),
        ($2::uuid,$4::uuid,1,$8,'qa-capture-cancel-v1','running',$6::date,$9::bigint,'fake',$10::timestamptz,$10::timestamptz),
        ($3::uuid,$4::uuid,1,$11,'qa-capture-cancel-v1','failed_retryable',$6::date,$12::bigint,'fake',$10::timestamptz,$10::timestamptz)
    `, [fixture.queuedRunId, fixture.runningRunId, fixture.retryableRunId, captureId,
      `queued-${fixture.queuedRunId}`, fixture.budgetMonth, fixture.queuedReserve,
      `running-${fixture.runningRunId}`, fixture.runningReserve, createdAt,
      `retryable-${fixture.retryableRunId}`, fixture.retryableReserve]);
    await admin.query(`
      INSERT INTO projed_core.meeting_ai_usage_attempts
        (attempt_id,capture_id,run_id,unit_identity,dispatch_month,provider,model,price_version,
         reserved_twd_micros,actual_twd_micros,usage_state,dispatch_state,outcome,created_at,updated_at)
      VALUES
        ($1,$5::uuid,$6::uuid,'qa-local-synthetic-unit',$9::date,'google','gemini-qa','qa-price-v1',$10::bigint,NULL,'reserved','pending',NULL,$14::timestamptz,$14::timestamptz),
        ($3,$5::uuid,$7::uuid,'qa-local-synthetic-unit',$9::date,'google','gemini-qa','qa-price-v1',$12::bigint,NULL,'unknown','dispatched',NULL,$14::timestamptz,$14::timestamptz),
        ($2,$5::uuid,$6::uuid,'qa-local-synthetic-unit',$9::date,'google','gemini-qa','qa-price-v1',$11::bigint,NULL,'reserved',NULL,NULL,$14::timestamptz,$14::timestamptz),
        ($4,$5::uuid,$8::uuid,'qa-local-synthetic-unit',$9::date,'google','gemini-qa','qa-price-v1',$13::bigint,NULL,'reserved','pending',NULL,$14::timestamptz,$14::timestamptz)
    `, [fixture.reservedAttemptId, fixture.legacyAttemptId, fixture.unknownAttemptId,
      fixture.retryablePendingAttemptId, captureId, fixture.queuedRunId,
      fixture.runningRunId, fixture.retryableRunId, fixture.budgetMonth, fixture.queuedReserve,
      fixture.legacyReserve, fixture.runningReserve, fixture.retryableReserve, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.meeting_artifact_cleanup
        (obligation_id,capture_id,run_id,attempt_id,kind,object_locator,state,due_at,created_at,updated_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,'storage','qa://meeting-capture/retention-check','pending',
        $5::timestamptz,$5::timestamptz,$5::timestamptz)
    `, [fixture.cleanupObligationId, captureId, fixture.queuedRunId,
      `qa-meeting-cleanup-${fixture.cleanupObligationId}`, createdAt]);
    await admin.query('COMMIT');
    committed = true;
  } finally {
    if (!committed) await admin.query('ROLLBACK');
  }
  return fixture;
}

async function readFinanceAfterCancel(admin: pg.Client, fixture: FinanceFixture, captureId: string): Promise<void> {
  const runs = await admin.query<{ id: string; state: string; error_code: string | null }>(`
    SELECT id::text,state,error_code FROM projed_core.meeting_analysis_runs
     WHERE id=ANY($1::uuid[])
  `, [[fixture.queuedRunId, fixture.runningRunId, fixture.retryableRunId]]);
  assert.equal(runs.rowCount, 3);
  const runsById = new Map(runs.rows.map(row => [row.id, row]));
  assert.deepEqual([runsById.get(fixture.queuedRunId)?.state, runsById.get(fixture.queuedRunId)?.error_code],
    ['cancelled', 'CANCELLED_BEFORE_DISPATCH']);
  assert.deepEqual([runsById.get(fixture.runningRunId)?.state, runsById.get(fixture.runningRunId)?.error_code],
    ['cancelled', 'CANCELLED_IN_FLIGHT']);
  assert.deepEqual([runsById.get(fixture.retryableRunId)?.state, runsById.get(fixture.retryableRunId)?.error_code],
    ['cancelled', 'CANCELLED_IN_FLIGHT'], 'failed_retryable is treated as potentially dispatched');

  const usage = await admin.query<{
    attempt_id: string; usage_state: string; dispatch_state: string | null;
    actual_twd_micros: string | null; outcome: string | null;
  }>(`
    SELECT attempt_id,usage_state,dispatch_state,actual_twd_micros::text,outcome
      FROM projed_core.meeting_ai_usage_attempts
     WHERE attempt_id=ANY($1::text[]) ORDER BY attempt_id
  `, [[fixture.reservedAttemptId, fixture.unknownAttemptId, fixture.legacyAttemptId, fixture.retryablePendingAttemptId]]);
  assert.equal(usage.rowCount, 4);
  const usageById = new Map(usage.rows.map(row => [row.attempt_id, row]));
  assert.deepEqual(usageById.get(fixture.reservedAttemptId), {
    attempt_id: fixture.reservedAttemptId,
    usage_state: 'known',
    dispatch_state: 'pending',
    actual_twd_micros: '0',
    outcome: 'cancelled_before_dispatch',
  });
  assert.deepEqual(usageById.get(fixture.unknownAttemptId), {
    attempt_id: fixture.unknownAttemptId,
    usage_state: 'unknown',
    dispatch_state: 'dispatched',
    actual_twd_micros: null,
    outcome: null,
  });
  assert.deepEqual(usageById.get(fixture.legacyAttemptId), {
    attempt_id: fixture.legacyAttemptId,
    usage_state: 'reserved',
    dispatch_state: null,
    actual_twd_micros: null,
    outcome: null,
  }, 'legacy unknown-dispatch state must never be refunded');
  assert.deepEqual(usageById.get(fixture.retryablePendingAttemptId), {
    attempt_id: fixture.retryablePendingAttemptId,
    usage_state: 'reserved',
    dispatch_state: 'pending',
    actual_twd_micros: null,
    outcome: null,
  }, 'failed_retryable reservations are retained even when the attempt says pending');

  const budget = await admin.query<{ reserved_twd_micros: string; spent_twd_micros: string }>(`
    SELECT reserved_twd_micros::text,spent_twd_micros::text
      FROM projed_core.meeting_ai_budget_months WHERE budget_month=$1::date
  `, [fixture.budgetMonth]);
  assert.equal(budget.rowCount, 1);
  assert.equal(budget.rows[0]?.reserved_twd_micros,
    String(BigInt(fixture.runningReserve) + BigInt(fixture.legacyReserve) + BigInt(fixture.retryableReserve)),
    'only the queued attempt proven pending before dispatch is refunded');
  assert.equal(budget.rows[0]?.spent_twd_micros, '0');

  const cleanup = await admin.query<{ capture_id: string | null; run_id: string | null; state: string }>(`
    SELECT capture_id::text,run_id::text,state FROM projed_core.meeting_artifact_cleanup
     WHERE obligation_id=$1::uuid
  `, [fixture.cleanupObligationId]);
  assert.equal(cleanup.rowCount, 1);
  assert.deepEqual(cleanup.rows[0], {
    capture_id: captureId,
    run_id: fixture.queuedRunId,
    state: 'pending',
  });

  const storageCleanup = await admin.query<{
    attempt_id: string;
    capture_id: string | null;
    kind: string;
    object_locator: string | null;
    state: string;
    storage_backend: string | null;
    upload_token_expires_at: Date | null;
    due_at: Date;
    segment_id: string | null;
    segment_object_path: string | null;
    segment_upload_state: string | null;
    segment_storage_backend: string | null;
    segment_upload_token_expires_at: Date | null;
  }>(`
    SELECT obligation.attempt_id,obligation.capture_id::text,obligation.kind,obligation.object_locator,
      obligation.state,obligation.storage_backend,obligation.upload_token_expires_at,obligation.due_at,
      segment.id::text AS segment_id,segment.object_path AS segment_object_path,
      segment.upload_state AS segment_upload_state,segment.storage_backend AS segment_storage_backend,
      segment.upload_token_expires_at AS segment_upload_token_expires_at
      FROM projed_core.meeting_artifact_cleanup obligation
      LEFT JOIN projed_core.meeting_capture_segments segment
        ON segment.capture_id=obligation.capture_id AND segment.id=$2::uuid
     WHERE obligation.attempt_id=$1
  `, [fixture.storageCleanupAttemptId, fixture.storageSegmentId]);
  assert.equal(storageCleanup.rowCount, 1, 'cancelling a pending segment creates one cleanup obligation');
  const generated = storageCleanup.rows[0];
  assert.ok(generated, 'the generated storage cleanup obligation must be readable');
  assert.equal(generated.attempt_id, fixture.storageCleanupAttemptId);
  assert.equal(generated.capture_id, captureId);
  assert.equal(generated.kind, 'storage');
  assert.equal(generated.object_locator, fixture.storageObjectPath);
  assert.equal(generated.state, 'pending');
  assert.equal(generated.storage_backend, 'gcs');
  assert.equal(generated.segment_id, fixture.storageSegmentId);
  assert.equal(generated.segment_object_path, fixture.storageObjectPath);
  assert.equal(generated.segment_upload_state, 'pending');
  assert.equal(generated.segment_storage_backend, 'gcs');
  assert.ok(generated.upload_token_expires_at instanceof Date);
  assert.ok(generated.segment_upload_token_expires_at instanceof Date);
  assert.equal(generated.upload_token_expires_at.getTime(), generated.segment_upload_token_expires_at.getTime());
  assert.ok(generated.due_at.getTime() >= generated.upload_token_expires_at.getTime(),
    'cleanup must wait until the pending upload token expires');
}

async function cleanupFinanceFixture(admin: pg.Client, fixture: FinanceFixture, budgetWasInserted: boolean): Promise<void> {
  await admin.query('BEGIN');
  let committed = false;
  try {
    await admin.query('DELETE FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$1::uuid',
      [fixture.cleanupObligationId]);
    await admin.query('DELETE FROM projed_core.meeting_artifact_cleanup WHERE attempt_id=$1 AND kind=\'storage\'',
      [fixture.storageCleanupAttemptId]);
    await admin.query('DELETE FROM projed_core.meeting_capture_segments WHERE id=$1::uuid',
      [fixture.storageSegmentId]);
    await admin.query('DELETE FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=ANY($1::text[])',
      [[fixture.reservedAttemptId, fixture.unknownAttemptId, fixture.legacyAttemptId, fixture.retryablePendingAttemptId]]);
    await admin.query('DELETE FROM projed_core.meeting_analysis_runs WHERE id=ANY($1::uuid[])',
      [[fixture.queuedRunId, fixture.runningRunId, fixture.retryableRunId]]);
    if (budgetWasInserted) {
      const budget = await admin.query(`
        DELETE FROM projed_core.meeting_ai_budget_months
         WHERE budget_month=$1::date AND limit_twd_micros=$2::bigint
        RETURNING budget_month
      `, [fixture.budgetMonth, fixture.budgetLimit]);
      if (budget.rowCount !== 0 && budget.rowCount !== 1) throw new Error('MEETING_FINANCE_CLEANUP_SCOPE_INVALID');
    }
    await admin.query('COMMIT');
    committed = true;
  } finally {
    if (!committed) await admin.query('ROLLBACK');
  }
}

/**
 * Local-native HTTP/SQL rehearsal for the meeting capture control plane.
 * Any optional finance rows are synthetic and are written only through the
 * disposable database's separately guarded local admin URL.
 */
export async function verifyMeetingCapturePostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  reader: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  const expected: ExpectedMigration[] = migrationSet(config);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const adminUrl = adminUrlFor(config);
  const admin = adminUrl ? new pg.Client({ connectionString: adminUrl.toString(), application_name: 'projed-dev139-meeting-capture-qa' }) : null;
  const httpDatabase = new RuntimeDatabase(httpConfig);
  const actors: Readonly<Record<SessionLabel, ServerActorV1>> = {
    'qa-meeting-capture-owner': owner,
    'qa-meeting-capture-reader': reader,
    'qa-meeting-capture-outsider': outsider,
  };
  let base = '';
  let serverStarted = false;
  let financeBudgetInserted = false;
  let financeFixture: FinanceFixture | null = null;
  const workspaceIds: string[] = [];
  const cleanupErrors: unknown[] = [];
  let failed = false;
  let failure: unknown;

  const server = createKernelHttpServer(httpConfig, httpDatabase, expected, {
    resolveActor: async (request: IncomingMessage) => {
      const cookie = request.headers.cookie;
      if (typeof cookie !== 'string' || !Object.prototype.hasOwnProperty.call(actors, cookie)) {
        throw new KernelError('ACTOR_INVALID', 'QA session is unavailable', 401);
      }
      return actors[cookie as SessionLabel];
    },
  });
  const fetchFor = (session: SessionLabel, originOverride?: string): HttpApiFetch => async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('cookie', session);
    headers.set('origin', originOverride ?? base);
    return fetch(new URL(String(input), base), { ...init, headers });
  };
  const clientFor = (session: SessionLabel, actor: ServerActorV1, originOverride?: string): HttpApiClient => {
    const client = new HttpApiClient(fetchFor(session, originOverride));
    client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
    return client;
  };

  const ownerClient = clientFor('qa-meeting-capture-owner', owner);
  const ownerCollaboration = createHttpCollaborationAdapter(ownerClient);
  const ownerRead = createHttpDomainReadAdapter(ownerClient);
  const ownerWrite = createHttpDomainWriteAdapter(ownerClient);
  const readerClient = clientFor('qa-meeting-capture-reader', reader);
  const readerCollaboration = createHttpCollaborationAdapter(readerClient);
  const readerSessionClient = new HttpApiClient(fetchFor('qa-meeting-capture-reader'));
  const readerSession = createHttpSessionAdapter(readerSessionClient);
  const outsiderClient = clientFor('qa-meeting-capture-outsider', outsider);

  const post = (client: HttpApiClient, body: JsonObject): Promise<unknown> => client.request<unknown>(
    '/api/v1/meeting-control', { method: 'POST', body },
  );

  try {
    if (owner.entry !== 'main' || reader.entry !== 'main' || outsider.entry !== 'main') {
      throw new Error('MEETING_CAPTURE_FIXTURE_REQUIRES_MAIN_ENTRY_ACTORS');
    }
    if (admin) {
      await admin.connect();
    }
    const address = await server.listen();
    serverStarted = true;
    base = `http://${address.host}:${address.port}`;

    const readerProfile = await readerSession.getSession();
    assert.equal(readerProfile.uid, reader.localUserId);
    assert.ok(readerProfile.email, 'reader must have a synthetic profile email for the local invite');

    const workspace = await ownerCollaboration.createWorkspace(`DEV-139 capture ${randomUUID()}`);
    workspaceIds.push(workspace.id);
    const board = await ownerCollaboration.createBoard(workspace.id, 'Meeting capture fixture');
    const taskId = randomUUID();
    const task: TaskNode = {
      id: taskId,
      workspaceId: workspace.id,
      boardId: board.id,
      parentId: null,
      title: 'Synthetic meeting capture pointer target',
      status: 'todo',
      order: 0,
      assigneeIds: [],
      collaboratorIds: [],
      tagIds: [],
    };
    await ownerWrite.createTask(workspace.id, board.id, task);

    const inviteToken = randomBytes(32).toString('base64url');
    await ownerCollaboration.createInvite(workspace.id, board.id, {
      email: readerProfile.email,
      tokenHash: createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt: Date.now() + 10 * 60 * 1000,
      defaultRole: 'member',
    });
    await readerCollaboration.acceptInvite({
      token: inviteToken,
      userId: readerProfile.uid,
      email: readerProfile.email,
      displayName: readerProfile.displayName,
    });
    const readerMember = (await ownerRead.listBoardMembers(workspace.id, board.id))
      .find(member => member.userId === reader.localUserId);
    assert.equal(readerMember?.role, 'member', 'the second actor must be a board editor');

    const recordId = randomUUID();
    await runActorTransaction(database, config, owner, async port => {
      const boardScope = await resolveBoard(port, workspace.id, board.id);
      const inserted = await port.query<{ id: string }>(`
        INSERT INTO projed_core.knowledge_records
          (id,tenant_id,project_id,record_type,title,content,occurred_at,status,visibility,rag_enabled,
           metadata,created_by,updated_by)
        VALUES($1::uuid,$2::uuid,$3::uuid,'meeting','DEV-139 private capture fixture',
          'Synthetic local capture fixture only',now(),'draft','private',false,'{}'::jsonb,
          projed_core.current_actor_user_id_v1(),projed_core.current_actor_user_id_v1())
        RETURNING id::text
      `, [recordId, boardScope.tenantId, boardScope.id]);
      assert.equal(inserted.rowCount, 1);
      return undefined;
    });

    const beginBody = {
      operation: 'begin',
      tenantId: workspace.id,
      projectId: board.id,
      recordId,
      idempotencyKey: `qa-meeting-capture-${randomUUID()}`,
    };
    const begin = responseData(await post(ownerClient, beginBody), 'capture begin');
    assert.equal(begin.state, 'recording');
    assert.equal(begin.idempotent, false);
    assert.equal(typeof begin.captureId, 'string');
    const captureId = String(begin.captureId);

    const replay = responseData(await post(ownerClient, beginBody), 'capture begin replay');
    assert.equal(replay.captureId, captureId);
    assert.equal(replay.idempotent, true);
    await assert.rejects(
      post(ownerClient, { ...beginBody, idempotencyKey: `qa-meeting-capture-other-${randomUUID()}` }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );

    const epochZero = [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 1000, durationMs: 100, gapBeforeMs: 0 }];
    const progressZero = responseData(await post(ownerClient, {
      operation: 'progress', captureId, expectedSourceVersion: 1, epochManifest: epochZero,
      lastProgressAt: Date.now(),
    }), 'capture progress epoch zero');
    assert.equal(progressZero.state, 'recording');
    assert.equal(progressZero.sourceVersion, 1);
    assert.equal(Array.isArray(progressZero.sourceGaps), true);

    const paused = responseData(await post(ownerClient, {
      operation: 'pause', captureId, expectedSourceVersion: 1,
    }), 'capture pause');
    assert.equal(paused.state, 'paused');
    const epochOne = [
      ...epochZero,
      { epoch: 1, captureOffsetMs: 100, monotonicStart: 5000, durationMs: 0, gapBeforeMs: 20 },
    ];
    const resumed = responseData(await post(ownerClient, {
      operation: 'resume', captureId, expectedSourceVersion: 1, epochManifest: epochOne,
    }), 'capture resume');
    assert.equal(resumed.state, 'recording');
    await assert.rejects(
      post(ownerClient, {
        operation: 'progress', captureId, expectedSourceVersion: 1, epochManifest: epochZero,
        lastProgressAt: Date.now(),
      }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );

    const emptyStopStartedAt = Date.now();
    const forgedEmptyStop = Date.UTC(2001, 0, 1);
    const stoppedWithoutPointers = responseData(await post(ownerClient, {
      operation: 'stop', captureId, expectedSourceVersion: 1, stoppedAt: forgedEmptyStop,
      pointerLoss: false, epochManifest: epochOne, finalPointerSequence: -1, gaps: [], reason: 'qa-stop-empty',
    }), 'capture stop with empty pointer sentinel');
    const emptyStopFinishedAt = Date.now();
    assert.equal(stoppedWithoutPointers.state, 'stopped');
    assert.equal(stoppedWithoutPointers.finalPointerSequence, -1);
    assert.ok(typeof stoppedWithoutPointers.stoppedAt === 'number');
    assert.ok(Number(stoppedWithoutPointers.stoppedAt) >= emptyStopStartedAt - 60_000
      && Number(stoppedWithoutPointers.stoppedAt) <= emptyStopFinishedAt + 60_000,
    'empty-pointer stop time is server anchored');
    assert.notEqual(stoppedWithoutPointers.stoppedAt, forgedEmptyStop);
    assert.equal(Number(stoppedWithoutPointers.audioExpiresAt) - Number(stoppedWithoutPointers.stoppedAt),
      7 * 24 * 60 * 60 * 1000);

    const pointerIntervals = [{
      captureId,
      clockEpoch: 1,
      sequence: 1,
      canonicalTaskId: taskId,
      surfaceKind: 'qa-native',
      startedOffsetMs: 120,
      endedOffsetMs: 180,
      visible: true,
      terminationReason: 'flush',
    }];
    const pointerDigest = createHash('sha256').update(JSON.stringify(pointerIntervals), 'utf8').digest('hex');
    const pointerBody = {
      operation: 'append-pointer',
      captureId,
      expectedSourceVersion: 1,
      batchKey: `qa-meeting-pointer-${randomUUID()}`,
      digest: pointerDigest,
      intervals: pointerIntervals,
    };
    const pointer = responseData(await post(ownerClient, pointerBody), 'capture pointer append');
    assert.equal(pointer.ackSequence, 1);
    const pointerReplay = responseData(await post(ownerClient, pointerBody), 'capture pointer replay');
    assert.equal(pointerReplay.ackSequence, 1);
    const conflictingIntervals = [{ ...pointerIntervals[0]!, surfaceKind: 'conflicting-qa' }];
    const conflictingDigest = createHash('sha256').update(JSON.stringify(conflictingIntervals), 'utf8').digest('hex');
    await assert.rejects(
      post(ownerClient, {
        ...pointerBody,
        batchKey: `qa-meeting-pointer-conflict-${randomUUID()}`,
        digest: conflictingDigest,
        intervals: conflictingIntervals,
      }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );

    const stopStartedAt = Date.now();
    const forgedClientStop = Date.UTC(2001, 0, 1);
    const stopped = responseData(await post(ownerClient, {
      operation: 'stop', captureId, expectedSourceVersion: 1, stoppedAt: forgedClientStop,
      pointerLoss: false, epochManifest: epochOne, finalPointerSequence: 1, gaps: [], reason: 'qa-stop',
    }), 'capture stop');
    const stopFinishedAt = Date.now();
    assert.equal(stopped.state, 'stopped');
    assert.equal(stopped.finalPointerSequence, 1);
    assert.ok(typeof stopped.stoppedAt === 'number');
    assert.ok(Number(stopped.stoppedAt) >= stopStartedAt - 60_000
      && Number(stopped.stoppedAt) <= stopFinishedAt + 60_000, 'stop time is server anchored');
    assert.notEqual(stopped.stoppedAt, forgedClientStop);
    assert.equal(stopped.stoppedAt, stoppedWithoutPointers.stoppedAt,
      'a second stop must preserve the first server-anchored stop time');
    assert.equal(stopped.audioExpiresAt, stoppedWithoutPointers.audioExpiresAt,
      'a second stop must not extend the original audio retention');
    assert.equal(Number(stopped.audioExpiresAt) - Number(stopped.stoppedAt), 7 * 24 * 60 * 60 * 1000);

    if (admin) {
      financeFixture = await seedFinanceFixture(
        admin,
        captureId,
        fixture => { financeFixture = fixture; },
        () => { financeBudgetInserted = true; },
      );
      // An inconsistent ledger must reject the entire cancellation, including
      // earlier run changes and the newly generated cleanup obligation.
      const fixture=financeFixture;
      await admin.query(`UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=0
        WHERE budget_month=$1::date AND limit_twd_micros=$2::bigint`,[fixture.budgetMonth,fixture.budgetLimit]);
      await assert.rejects(post(ownerClient,{
        operation:'cancel',captureId,expectedSourceVersion:1,reason:'qa-ledger-rollback',
      }),error=>requireHttpError(error,'DB_UNAVAILABLE',503));
      const afterRollback=await admin.query<{state:string;runs_unchanged:boolean;cleanup_absent:boolean;usage_unchanged:boolean}>(`
        SELECT capture.state,
          (SELECT count(*)=3 FROM projed_core.meeting_analysis_runs WHERE id=ANY($2::uuid[])
            AND state IN ('queued','running','failed_retryable')) AS runs_unchanged,
          NOT EXISTS(SELECT 1 FROM projed_core.meeting_artifact_cleanup
            WHERE attempt_id=$3 AND kind='storage') AS cleanup_absent,
          (SELECT count(*)=3 FROM projed_core.meeting_ai_usage_attempts WHERE attempt_id=ANY($4::text[])
            AND usage_state='reserved' AND actual_twd_micros IS NULL) AS usage_unchanged
        FROM projed_core.meeting_capture_sessions capture WHERE capture.id=$1::uuid`,
      [captureId,[fixture.queuedRunId,fixture.runningRunId,fixture.retryableRunId],fixture.storageCleanupAttemptId,
        [fixture.reservedAttemptId,fixture.legacyAttemptId,fixture.retryablePendingAttemptId]]);
      assert.deepEqual(afterRollback.rows,[{state:'stopped',runs_unchanged:true,cleanup_absent:true,usage_unchanged:true}]);
      await admin.query(`UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=$3::bigint
        WHERE budget_month=$1::date AND limit_twd_micros=$2::bigint`,
      [fixture.budgetMonth,fixture.budgetLimit,fixture.totalReserve]);
    }
    const cancelled = responseData(await post(ownerClient, {
      operation: 'cancel', captureId, expectedSourceVersion: 1, reason: 'qa-native-cancel',
    }), 'capture cancel');
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.idempotent, false);
    const cancelReplay = responseData(await post(ownerClient, {
      operation: 'cancel', captureId, expectedSourceVersion: 1, reason: 'qa-native-cancel',
    }), 'capture cancel replay');
    assert.equal(cancelReplay.state, 'cancelled');
    assert.equal(cancelReplay.idempotent, true);
    if (admin && financeFixture) await readFinanceAfterCancel(admin, financeFixture, captureId);

    await assert.rejects(
      post(ownerClient, {
        operation: 'progress', captureId, expectedSourceVersion: 1, epochManifest: epochOne,
        lastProgressAt: Date.now(),
      }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );
    await assert.rejects(
      post(ownerClient, pointerBody),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );

    const wrongActorClient = clientFor('qa-meeting-capture-owner', reader);
    await assert.rejects(
      post(wrongActorClient, { operation: 'status', captureId }),
      error => requireHttpError(error, 'ACTOR_CHANGED', 409),
    );
    const wrongOriginClient = clientFor('qa-meeting-capture-owner', owner, 'https://other.invalid');
    await assert.rejects(
      post(wrongOriginClient, { operation: 'status', captureId }),
      error => requireHttpError(error, 'ACCESS_DENIED', 403),
    );
    await assert.rejects(
      post(outsiderClient, { operation: 'status', captureId }),
      error => requireHttpError(error, 'RESOURCE_NOT_FOUND', 404),
    );
    await assert.rejects(
      post(readerClient, { operation: 'status', captureId }),
      error => requireHttpError(error, 'RESOURCE_NOT_FOUND', 404),
    );
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    for (const workspaceId of [...workspaceIds].reverse()) {
      try { await ownerCollaboration.deleteWorkspace(workspaceId); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (admin && financeFixture) {
      try { await cleanupFinanceFixture(admin, financeFixture, financeBudgetInserted); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (serverStarted) {
      try { await server.shutdown(); }
      catch (error) { cleanupErrors.push(error); }
    } else {
      try { await httpDatabase.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (admin) {
      try { await admin.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
  }

  if (failed) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError([failure, ...cleanupErrors], 'Meeting capture verification and cleanup failed');
    }
    throw failure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Meeting capture cleanup failed');
  }
}
