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
import type { MeetingAudioStorage } from '../../../server/meetingAudioStorage.js';
import { PostgresAppSessionStore } from '../../../server/postgresAppSessionStore.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { createHttpDomainReadAdapter } from '../../../src/services/httpApi/domainReadAdapter.js';
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';
import type { TaskNode } from '../../../src/types/index.js';

type SessionLabel = 'qa-meeting-upload-owner' | 'qa-meeting-upload-reader' | 'qa-meeting-upload-outsider';
type JsonObject = Record<string, unknown>;
type CompletionEntry = {
  segmentIndex: number;
  epoch: number;
  bytes: number;
  startOffsetMs: number;
  endOffsetMs: number;
  overlapMs: number;
  gapBeforeMs: number;
  mime: string;
  sha256: string;
  objectPath: string;
};
type SegmentSeed = Omit<CompletionEntry, 'objectPath'> & { uploadState: 'verified' | 'pending' };

const DEFAULT_BUDGET_MICROS = '1000000000';
const RESERVED_BUDGET_MICROS = '10000000';
const PREEXHAUSTED_BUDGET_MICROS = '10000000';

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

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function adminUrlFor(config: RuntimeConfig): URL {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!raw) throw new Error('MEETING_UPLOAD_ADMIN_FIXTURE_UNAVAILABLE');
  if (config.env !== 'disposable' || config.profile.environment !== 'disposable') {
    throw new Error('MEETING_UPLOAD_ADMIN_REQUIRES_DISPOSABLE_PROFILE');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('MEETING_UPLOAD_ADMIN_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port) !== config.binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== config.binding.databaseName
      || !/^dev139_s3_[0-9a-f]{32}$/u.test(config.binding.databaseName)
      || decodeURIComponent(url.username) !== 'postgres'
      || !url.password
      || url.search !== ''
      || url.hash !== '') {
    throw new Error('MEETING_UPLOAD_ADMIN_BINDING_MISMATCH');
  }
  return url;
}

async function readCurrentMonth(admin: pg.Client): Promise<string> {
  const result = await admin.query<{ budget_month: string }>(`
    SELECT date_trunc('month',now() AT TIME ZONE 'Asia/Taipei')::date::text AS budget_month
  `);
  assert.equal(result.rowCount, 1);
  assert.ok(result.rows[0]?.budget_month);
  return result.rows[0].budget_month;
}

async function createPrivateMeeting(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  tenantId: string,
  projectId: string,
  title: string,
): Promise<string> {
  const recordId = randomUUID();
  await runActorTransaction(database, config, owner, async port => {
    const board = await resolveBoard(port, tenantId, projectId);
    const inserted = await port.query<{ id: string }>(`
      INSERT INTO projed_core.knowledge_records
        (id,tenant_id,project_id,record_type,title,content,occurred_at,status,visibility,rag_enabled,
         metadata,created_by,updated_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,'meeting',$4,'Synthetic local upload-completion fixture',now(),
        'draft','private',false,'{}'::jsonb,projed_core.current_actor_user_id_v1(),
        projed_core.current_actor_user_id_v1())
      RETURNING id::text
    `, [recordId, board.tenantId, board.id, title]);
    assert.equal(inserted.rowCount, 1);
    assert.equal(inserted.rows[0]?.id, recordId);
  });
  return recordId;
}

async function beginAndStopCapture(
  post: (client: HttpApiClient, body: JsonObject) => Promise<unknown>,
  client: HttpApiClient,
  tenantId: string,
  projectId: string,
  recordId: string,
): Promise<string> {
  const begun = responseData(await post(client, {
    operation: 'begin', tenantId, projectId, recordId,
    idempotencyKey: `qa-meeting-upload-${randomUUID()}`,
  }), 'meeting upload capture begin');
  assert.equal(begun.state, 'recording');
  assert.equal(begun.idempotent, false);
  assert.equal(typeof begun.captureId, 'string');
  const captureId = String(begun.captureId);
  const stopped = responseData(await post(client, {
    operation: 'stop', captureId, expectedSourceVersion: 1,
    epochManifest: [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 1000, durationMs: 200, gapBeforeMs: 0 }],
    finalPointerSequence: -1, gaps: [], pointerLoss: false, reason: 'qa-upload-completion-stop',
  }), 'meeting upload capture stop');
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.sourceVersion, 1);
  return captureId;
}

async function seedSegments(
  admin: pg.Client,
  input: {
    tenantId: string;
    projectId: string;
    recordId: string;
    captureId: string;
    segments: readonly SegmentSeed[];
    onCleanupAttempt?: (attemptId: string) => void;
  },
): Promise<CompletionEntry[]> {
  const entries: CompletionEntry[] = [];
  await admin.query('BEGIN');
  let committed = false;
  try {
    for (const value of input.segments) {
      const objectPath = `${input.tenantId}/${input.projectId}/${input.recordId}/${input.captureId}/v1/${value.segmentIndex}.webm`;
      const attemptId = `storage:${input.captureId}:v1:segment:${value.segmentIndex}`;
      input.onCleanupAttempt?.(attemptId);
      const existing = await admin.query(
        'SELECT 1 FROM projed_core.meeting_artifact_cleanup WHERE attempt_id=$1 AND kind=\'storage\'',
        [attemptId],
      );
      assert.equal(existing.rowCount, 0, 'the synthetic segment cleanup key must be new');
      const segmentId = randomUUID();
      const cleanupId = randomUUID();
      const operationToken = value.uploadState === 'verified' ? randomUUID() : null;
      const generation = value.uploadState === 'verified' ? String(700_000 + value.segmentIndex) : null;
      const cleanupProof = value.uploadState === 'verified'
        ? { outcome: 'uploaded', sha256: value.sha256, bytes: value.bytes }
        : { outcome: null, sha256: null, bytes: null };
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const obligation = await admin.query<{ obligation_id: string }>(`
        INSERT INTO projed_core.meeting_artifact_cleanup
          (obligation_id,capture_id,attempt_id,kind,object_locator,state,upload_token_expires_at,due_at,
           storage_backend,upload_operation_token,upload_outcome,storage_generation,upload_sha256,upload_bytes)
        VALUES($1::uuid,$2::uuid,$3,'storage',$4,'pending',$5::timestamptz,now()+interval '8 days',
          'gcs',$6::uuid,$7,$8,$9,$10::bigint)
        RETURNING obligation_id::text
      `, [cleanupId, input.captureId, attemptId, objectPath, expiresAt, operationToken,
        cleanupProof.outcome, generation, cleanupProof.sha256, cleanupProof.bytes]);
      assert.equal(obligation.rowCount, 1);
      const segment = await admin.query<{ id: string }>(`
        INSERT INTO projed_core.meeting_capture_segments
          (id,capture_id,segment_index,epoch,start_offset_ms,end_offset_ms,overlap_ms,gap_before_ms,
           object_path,mime,bytes,sha256,upload_state,source_version,reservation_key,
           upload_token_expires_at,verified_at,storage_backend,storage_generation)
        VALUES($1::uuid,$2::uuid,$3,$4,$5::bigint,$6::bigint,$7,$8,$9,$10,$11::bigint,$12,$13,1,$14,
          $15::timestamptz,$16::timestamptz,'gcs',$17)
        RETURNING id::text
      `, [segmentId, input.captureId, value.segmentIndex, value.epoch, value.startOffsetMs,
        value.endOffsetMs, value.overlapMs, value.gapBeforeMs, objectPath, value.mime, value.bytes,
        value.uploadState === 'verified' ? value.sha256 : null, value.uploadState,
        `qa-meeting-upload-reservation-${randomUUID()}`, expiresAt,
        value.uploadState === 'verified' ? new Date() : null, generation]);
      assert.equal(segment.rowCount, 1);
      assert.equal(segment.rows[0]?.id, segmentId);
      if (value.uploadState === 'verified') {
        entries.push({
          segmentIndex: value.segmentIndex,
          epoch: value.epoch,
          bytes: value.bytes,
          startOffsetMs: value.startOffsetMs,
          endOffsetMs: value.endOffsetMs,
          overlapMs: value.overlapMs,
          gapBeforeMs: value.gapBeforeMs,
          mime: value.mime,
          sha256: value.sha256,
          objectPath,
        });
      }
    }
    await admin.query('COMMIT');
    committed = true;
  } finally {
    if (!committed) await admin.query('ROLLBACK');
  }
  return entries;
}

function completionBody(captureId: string, manifest: readonly CompletionEntry[], suffix: string): JsonObject {
  return {
    operation: 'complete-upload',
    captureId,
    expectedSourceVersion: 1,
    audioManifestHash: digest(`${JSON.stringify(manifest)}:${suffix}`),
    pointerManifestHash: digest('[]'),
    sourceCompleteness: 'complete',
    audioManifest: manifest,
  };
}

async function captureState(admin: pg.Client, captureId: string): Promise<{
  state: string;
  source_version: number;
  source_completeness: string;
  audio_manifest_hash: string | null;
  pointer_manifest_hash: string | null;
  frozen: boolean;
  epoch_manifest: unknown;
  run_count: number;
  usage_count: number;
  segment_count: number;
  pointer_count: number;
}> {
  const result = await admin.query<{
    state: string; source_version: number; source_completeness: string;
    audio_manifest_hash: string | null; pointer_manifest_hash: string | null;
    frozen: boolean; epoch_manifest: unknown; run_count: number; usage_count: number;
    segment_count: number; pointer_count: number;
  }>(`
    SELECT capture.state,capture.source_version,capture.source_completeness,capture.audio_manifest_hash,
      capture.pointer_manifest_hash,capture.source_frozen_at IS NOT NULL AS frozen,capture.epoch_manifest,
      (SELECT count(*)::integer FROM projed_core.meeting_analysis_runs run WHERE run.capture_id=capture.id) AS run_count,
      (SELECT count(*)::integer FROM projed_core.meeting_ai_usage_attempts usage WHERE usage.capture_id=capture.id) AS usage_count,
      (SELECT count(*)::integer FROM projed_core.meeting_capture_segments segment WHERE segment.capture_id=capture.id) AS segment_count,
      (SELECT count(*)::integer FROM projed_core.meeting_pointer_intervals pointer WHERE pointer.capture_id=capture.id) AS pointer_count
    FROM projed_core.meeting_capture_sessions capture WHERE capture.id=$1::uuid
  `, [captureId]);
  assert.equal(result.rowCount, 1, 'the synthetic capture must remain visible for readback');
  assert.ok(result.rows[0]);
  return result.rows[0];
}

async function readRunRows(admin: pg.Client, captureId: string): Promise<Array<{
  id: string; state: string; config_version: string; resume_stage: string; provider_mode: string;
  budget_month: string; reserved_twd_micros: string; deadline_at: string; error_code: string | null;
}>> {
  const result = await admin.query<{
    id: string; state: string; config_version: string; resume_stage: string; provider_mode: string;
    budget_month: string; reserved_twd_micros: string; deadline_at: string; error_code: string | null;
  }>(`
    SELECT id::text,state,config_version,resume_stage,provider_mode,budget_month::text,
      reserved_twd_micros::text,deadline_at::text,error_code
    FROM projed_core.meeting_analysis_runs WHERE capture_id=$1::uuid ORDER BY created_at,id
  `, [captureId]);
  return result.rows;
}

async function readUsageRows(admin: pg.Client, captureId: string): Promise<Array<{
  attempt_id: string; run_id: string; unit_identity: string; provider: string; model: string;
  price_version: string; reserved_twd_micros: string; actual_twd_micros: string | null;
  usage_state: string; dispatch_state: string | null; outcome: string | null;
}>> {
  const result = await admin.query<{
    attempt_id: string; run_id: string; unit_identity: string; provider: string; model: string;
    price_version: string; reserved_twd_micros: string; actual_twd_micros: string | null;
    usage_state: string; dispatch_state: string | null; outcome: string | null;
  }>(`
    SELECT attempt_id,run_id::text,unit_identity,provider,model,price_version,reserved_twd_micros::text,
      actual_twd_micros::text,usage_state,dispatch_state,outcome
    FROM projed_core.meeting_ai_usage_attempts WHERE capture_id=$1::uuid ORDER BY attempt_id
  `, [captureId]);
  return result.rows;
}

async function readBudget(admin: pg.Client, month: string): Promise<{
  limit_twd_micros: string; reserved_twd_micros: string; spent_twd_micros: string;
} | null> {
  const result = await admin.query<{
    limit_twd_micros: string; reserved_twd_micros: string; spent_twd_micros: string;
  }>(`
    SELECT limit_twd_micros::text,reserved_twd_micros::text,spent_twd_micros::text
    FROM projed_core.meeting_ai_budget_months WHERE budget_month=$1::date
  `, [month]);
  assert.ok(result.rowCount === 0 || result.rowCount === 1);
  return result.rows[0] ?? null;
}

async function assertLedgerCounts(admin: pg.Client, captureId: string, runs: number, usage: number): Promise<void> {
  const state = await captureState(admin, captureId);
  assert.equal(state.run_count, runs);
  assert.equal(state.usage_count, usage);
}

/** Disposable PostgreSQL + real local HTTP regression for verified upload completion. */
/** Uses nonce-owned Session/proof fixtures; never a browser bearer or provider. */
async function verifyAsrSessionBinding(database:RuntimeDatabase,config:RuntimeConfig,admin:pg.Client,
  owner:ServerActorV1,outsider:ServerActorV1,recordId:string,captureId:string,runId:string):Promise<void>{
  const sessionDatabase=new RuntimeDatabase({...config,profile:{...config.profile,runtime:{...config.profile.runtime,
    pool:{...config.profile.runtime.pool,max:1}}}});
  const store=new PostgresAppSessionStore(sessionDatabase),contextId=randomUUID(),otherContextId=randomUUID();
  const subject=`qa-asr-session-${randomUUID()}`,hashes=[digest(randomUUID()),digest(randomUUID())];
  const boundActor={...owner,contextId},otherActor={...owner,contextId:otherContextId};
  let proofCreated=false;
  let failed=false,failure:unknown;
  const cleanupErrors:unknown[]=[];
  const deny=(error:unknown):boolean=>error instanceof KernelError
    &&error.cause!==null&&typeof error.cause==='object'&&'code' in error.cause&&error.cause.code==='42501';
  const bind=(actor:ServerActorV1)=>runActorTransaction(database,config,actor,async port=>{
    await port.authorizeMeetingCaptureMutation(recordId,captureId);
    return (await port.query<{context:string}>(`SELECT projed_core.bind_meeting_asr_session_v1($1::uuid)::text AS context`,[runId])).rows[0]!.context;
  });
  try{
    const initialLease=await sessionDatabase.checkout();let metadataPid:number;
    try{metadataPid=(await initialLease.client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;}
    finally{initialLease.release();}
    assert.equal(await store.readMeetingRunSession(runId),null,'an unbound run grants no Session metadata read');
    await assert.rejects(bind(boundActor),deny,'a synthetic actor context without a stored Session cannot bind');
    await admin.query('INSERT INTO projed_core.google_identity_proofs(google_subject,local_user_id) VALUES($1,$2::uuid)',
      [subject,owner.localUserId]);proofCreated=true;
    const now=Date.now(),sourceExpiry=now+8*60*60*1000;
    const identity={contractVersion:'jenfu.sso-handoff.v4',audience:'projed',manifestSha256:'a'.repeat(64),
      issuer:'http://127.0.0.1:4300/api/sso',identityIssuer:'https://accounts.google.com',identitySubject:subject,
      googleSubject:subject,principalId:owner.principalId,principalKind:'personal',employeeId:null,
      authEpoch:1,authenticatedAtMs:now-30_000,revokedBeforeMs:null,sourceSessionExpiresAtMs:sourceExpiry,
      issuedAtMs:now-1000,expiresAtMs:now+60_000,currentStateExpiresAtMs:now+10_000,mappingRevision:'1'};
    for(const [index,context] of [contextId,otherContextId].entries()){
      await admin.query(`INSERT INTO projed_core.app_sessions(token_hash,public_origin,entry,local_user_id,
        google_subject,context_id,account_guard_revision,identity,expires_at_ms)
        VALUES($1,'http://127.0.0.1:4100','main',$2::uuid,$3,$4::uuid,$5::bigint,$6::jsonb,$7::bigint)`,
      [hashes[index],owner.localUserId,subject,context,owner.accountGuardRevision,JSON.stringify(identity),sourceExpiry]);
    }
    assert.equal(await bind(boundActor),contextId);
    assert.equal(await bind(boundActor),contextId,'the same context can replay without creating another authorization');
    const session=await store.readMeetingRunSession(runId);
    assert.equal(session?.contextId,contextId);assert.equal(session?.localUserId,owner.localUserId);
    assert.equal(session?.identity.googleSubject,subject);
    assert.equal(await store.readMeetingRunSession(randomUUID()),null,'another run cannot borrow the authorized Session');
    await assert.rejects(bind(otherActor),deny,'even a valid second Session cannot rebind the run');
    await assert.rejects(bind(outsider),'another account cannot bind this private source');
    assert.equal((await store.readMeetingRunSession(runId))?.contextId,contextId);
    // A metadata-only worker lookup must not leave a business actor on a pooled connection.
    const lease=await sessionDatabase.checkout();
    try{
      const state=(await lease.client.query<{pid:number;scope:string|null}>(`SELECT pg_backend_pid() AS pid,
        current_setting('projed.meeting_asr_run_id',true) AS scope`)).rows[0]!;
      assert.equal(state.pid,metadataPid,'singleton test pool must reuse the actual metadata connection');
      assert.ok(state.scope===null||state.scope==='','ASR run context must not survive the read transaction');
      const rows=await lease.client.query('SELECT id FROM projed_core.knowledge_records WHERE id=$1::uuid',[recordId]);
      assert.equal(rows.rowCount,0);
    }finally{lease.release();}
    await admin.query('UPDATE projed_core.app_sessions SET revoked_at_ms=$2::bigint WHERE token_hash=$1',[hashes[0],Date.now()]);
    assert.equal(await store.readMeetingRunSession(runId),null,'local logout stops background Session resolution');
    assert.equal((await admin.query<{context:string}>(`SELECT authorization_context_id::text AS context
      FROM projed_core.meeting_analysis_runs WHERE id=$1::uuid`,[runId])).rows[0]?.context,contextId,
    'revocation never switches to another Session');
    await admin.query('DELETE FROM projed_core.app_sessions WHERE token_hash=$1',[hashes[0]]);
    assert.equal(await store.readMeetingRunSession(runId),null);
    await assert.rejects(bind(otherActor),deny,'physical Session cleanup must not reopen run authorization');
  }catch(error){failed=true;failure=error;}
  finally{
    try{await admin.query('DELETE FROM projed_core.app_sessions WHERE token_hash=ANY($1::text[])',[hashes]);}
    catch(error){cleanupErrors.push(error);}
    if(proofCreated){
      try{await admin.query('DELETE FROM projed_core.google_identity_proofs WHERE google_subject=$1',[subject]);}
      catch(error){cleanupErrors.push(error);}
    }
    try{await sessionDatabase.end();}catch(error){cleanupErrors.push(error);}
  }
  if(failed&&cleanupErrors.length===0)throw failure;
  if(failed||cleanupErrors.length>0)throw new AggregateError(failed?[failure,...cleanupErrors]:cleanupErrors,'ASR Session fixture validation or cleanup failed');
}

export async function verifyMeetingUploadPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  reader: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  const expected: ExpectedMigration[] = migrationSet(config);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const adminUrl = adminUrlFor(config);
  const admin = new pg.Client({ connectionString: adminUrl.toString(), application_name: 'projed-dev139-meeting-upload-qa' });
  const httpDatabase = new RuntimeDatabase(httpConfig);
  const actors: Readonly<Record<SessionLabel, ServerActorV1>> = {
    'qa-meeting-upload-owner': owner,
    'qa-meeting-upload-reader': reader,
    'qa-meeting-upload-outsider': outsider,
  };
  let base = '';
  let serverStarted = false;
  let adminConnected = false;
  let failed = false;
  let failure: unknown;
  let workspaceId: string | null = null;
  let ownedBudgetMonth: string | null = null;
  let budgetFixtureInserted = false;
  let budgetFixtureReset = false;
  let faultTriggerName: string | null = null;
  let faultFunctionName: string | null = null;
  let faultObjectsCreated = false;
  const captureIds: string[] = [];
  const cleanupAttemptIds = new Set<string>();
  const cleanupErrors: unknown[] = [];
  let storageCalls = 0;
  const forbiddenStorage: MeetingAudioStorage = {
    async upload() { storageCalls += 1; throw new Error('Unexpected synthetic storage upload'); },
    async read() { storageCalls += 1; throw new Error('Unexpected synthetic storage read'); },
    async delete() { storageCalls += 1; throw new Error('Unexpected synthetic storage delete'); },
  };

  const server = createKernelHttpServer(httpConfig, httpDatabase, expected, {
    meetingAudioStorage: forbiddenStorage,
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
  const ownerClient = clientFor('qa-meeting-upload-owner', owner);
  const ownerCollaboration = createHttpCollaborationAdapter(ownerClient);
  const ownerRead = createHttpDomainReadAdapter(ownerClient);
  const ownerWrite = createHttpDomainWriteAdapter(ownerClient);
  const readerClient = clientFor('qa-meeting-upload-reader', reader);
  const readerCollaboration = createHttpCollaborationAdapter(readerClient);
  const readerSessionClient = new HttpApiClient(fetchFor('qa-meeting-upload-reader'));
  const readerSession = createHttpSessionAdapter(readerSessionClient);
  const outsiderClient = clientFor('qa-meeting-upload-outsider', outsider);
  const post = (client: HttpApiClient, body: JsonObject): Promise<unknown> => client.request<unknown>(
    '/api/v1/meeting-control', { method: 'POST', body },
  );

  try {
    if (owner.entry !== 'main' || reader.entry !== 'main' || outsider.entry !== 'main') {
      throw new Error('MEETING_UPLOAD_FIXTURE_REQUIRES_MAIN_ENTRY_ACTORS');
    }
    await admin.connect();
    adminConnected = true;
    const month = await readCurrentMonth(admin);
    const existingBudget = await readBudget(admin, month);
    if (existingBudget !== null) {
      throw new Error('MEETING_UPLOAD_CURRENT_MONTH_BUDGET_ALREADY_EXISTS; refusing to rewrite an unowned ledger fixture');
    }

    const address = await server.listen();
    serverStarted = true;
    base = `http://${address.host}:${address.port}`;

    const readerProfile = await readerSession.getSession();
    assert.equal(readerProfile.uid, reader.localUserId);
    assert.ok(readerProfile.email, 'the board reader must have a synthetic email for the local invite');

    const workspace = await ownerCollaboration.createWorkspace(`DEV-139 upload completion ${randomUUID()}`);
    workspaceId = workspace.id;
    const board = await ownerCollaboration.createBoard(workspace.id, 'Meeting upload completion fixture');
    const taskId = randomUUID();
    const task: TaskNode = {
      id: taskId,
      workspaceId: workspace.id,
      boardId: board.id,
      parentId: null,
      title: 'Synthetic private meeting upload pointer target',
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
      tokenHash: digest(inviteToken),
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
    assert.equal(readerMember?.role, 'member', 'the denial actor must be an editor on the same board');

    // A controlled low-budget row is created only after proving this disposable
    // database had no current-month row before the helper began.
    const budgetMeetingId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 awaiting-budget fixture',
    );
    const budgetCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, budgetMeetingId);
    captureIds.push(budgetCaptureId);
    const budgetEntries = await seedSegments(admin, {
      tenantId: workspace.id,
      projectId: board.id,
      recordId: budgetMeetingId,
      captureId: budgetCaptureId,
      segments: [{
        segmentIndex: 0, epoch: 0, bytes: 128, startOffsetMs: 0, endOffsetMs: 100,
        overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'a'.repeat(64), uploadState: 'verified',
      }],
      onCleanupAttempt: attemptId => cleanupAttemptIds.add(attemptId),
    });
    const insertedBudget = await admin.query<{ budget_month: string }>(`
      INSERT INTO projed_core.meeting_ai_budget_months
        (budget_month,limit_twd_micros,reserved_twd_micros,spent_twd_micros)
      VALUES($1::date,$2::bigint,$2::bigint,0) RETURNING budget_month::text
    `, [month, PREEXHAUSTED_BUDGET_MICROS]);
    assert.equal(insertedBudget.rowCount, 1);
    ownedBudgetMonth = month;
    budgetFixtureInserted = true;
    const budgetBody = completionBody(budgetCaptureId, budgetEntries, 'awaiting-budget');
    const awaitingBudget = responseData(await post(ownerClient, budgetBody), 'awaiting-budget completion');
    assert.equal(awaitingBudget.state, 'awaiting_budget');
    assert.equal(awaitingBudget.sourceComplete, true);
    assert.equal(awaitingBudget.idempotent, false);
    assert.equal(awaitingBudget.sourceVersion, 1);
    assert.equal(typeof awaitingBudget.runId, 'string');
    const awaitingRunId = String(awaitingBudget.runId);
    const awaitingRunRows = await readRunRows(admin, budgetCaptureId);
    assert.equal(awaitingRunRows.length, 1);
    assert.equal(awaitingRunRows[0]?.state, 'awaiting_budget');
    assert.equal(awaitingRunRows[0]?.provider_mode, 'gemini');
    assert.equal(awaitingRunRows[0]?.reserved_twd_micros, '0');
    assert.equal(awaitingRunRows[0]?.id, awaitingRunId);
    assert.deepEqual(await readUsageRows(admin, budgetCaptureId), [], 'awaiting-budget creates no usage attempt');
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: PREEXHAUSTED_BUDGET_MICROS,
      reserved_twd_micros: PREEXHAUSTED_BUDGET_MICROS,
      spent_twd_micros: '0',
    });
    const awaitingReplay = responseData(await post(ownerClient, budgetBody), 'awaiting-budget replay');
    assert.equal(awaitingReplay.runId, awaitingRunId);
    assert.equal(awaitingReplay.state, 'awaiting_budget');
    assert.equal(awaitingReplay.idempotent, true);
    await assertLedgerCounts(admin, budgetCaptureId, 1, 0);
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,budgetMeetingId,budgetCaptureId,awaitingRunId);
    const lowBudgetCancel = responseData(await post(ownerClient, {
      operation: 'cancel', captureId: budgetCaptureId, expectedSourceVersion: 1, reason: 'qa-budget-cleanup',
    }), 'awaiting-budget cleanup cancellation');
    assert.equal(lowBudgetCancel.state, 'cancelled');
    const resetBudget = await admin.query(`
      UPDATE projed_core.meeting_ai_budget_months SET limit_twd_micros=$2::bigint,
        reserved_twd_micros=0,spent_twd_micros=0,updated_at=now()
      WHERE budget_month=$1::date AND limit_twd_micros=$3::bigint
        AND reserved_twd_micros=$3::bigint AND spent_twd_micros=0
      RETURNING budget_month
    `, [month, DEFAULT_BUDGET_MICROS, PREEXHAUSTED_BUDGET_MICROS]);
    assert.equal(resetBudget.rowCount, 1, 'only the known helper-created low-budget row may be reset');
    budgetFixtureReset = true;

    const partialRecordId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 partial upload fixture',
    );
    const partialCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, partialRecordId);
    captureIds.push(partialCaptureId);
    const partialBody: JsonObject = {
      ...completionBody(partialCaptureId, [], 'partial'),
      sourceCompleteness: 'partial',
    };
    const partial = responseData(await post(ownerClient, partialBody), 'partial source completion');
    assert.equal(partial.state, 'stopped');
    assert.equal(partial.runId, null);
    assert.equal(partial.sourceComplete, false);
    assert.equal(partial.idempotent, false);
    const partialSnapshot = await captureState(admin, partialCaptureId);
    assert.equal(partialSnapshot.source_completeness, 'partial');
    assert.equal(partialSnapshot.frozen, false);
    assert.equal(partialSnapshot.run_count, 0);
    assert.equal(partialSnapshot.usage_count, 0);

    const missingRecordId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 missing upload fixture',
    );
    const missingCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, missingRecordId);
    captureIds.push(missingCaptureId);
    const missingBody: JsonObject = {
      ...completionBody(missingCaptureId, [], 'missing'),
      sourceCompleteness: 'missing',
    };
    const missing = responseData(await post(ownerClient, missingBody), 'missing source completion');
    assert.equal(missing.state, 'stopped');
    assert.equal(missing.runId, null);
    assert.equal(missing.sourceComplete, false);
    const missingSnapshot = await captureState(admin, missingCaptureId);
    assert.equal(missingSnapshot.source_completeness, 'missing');
    assert.equal(missingSnapshot.frozen, false);
    assert.equal(missingSnapshot.run_count, 0);
    assert.equal(missingSnapshot.usage_count, 0);

    const pendingRecordId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 pending segment omission fixture',
    );
    const pendingCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, pendingRecordId);
    captureIds.push(pendingCaptureId);
    const pendingEntries = await seedSegments(admin, {
      tenantId: workspace.id,
      projectId: board.id,
      recordId: pendingRecordId,
      captureId: pendingCaptureId,
      segments: [
        { segmentIndex: 0, epoch: 0, bytes: 128, startOffsetMs: 0, endOffsetMs: 100,
          overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'b'.repeat(64), uploadState: 'verified' },
        { segmentIndex: 1, epoch: 0, bytes: 0, startOffsetMs: 100, endOffsetMs: 200,
          overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'c'.repeat(64), uploadState: 'pending' },
      ],
      onCleanupAttempt: attemptId => cleanupAttemptIds.add(attemptId),
    });
    assert.equal(pendingEntries.length, 1);
    const pendingSnapshotBefore = await captureState(admin, pendingCaptureId);
    assert.equal(pendingSnapshotBefore.segment_count, 2);
    await assert.rejects(
      post(ownerClient, completionBody(pendingCaptureId, pendingEntries, 'omit-known-pending')),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );
    const pendingSnapshotAfter = await captureState(admin, pendingCaptureId);
    assert.equal(pendingSnapshotAfter.frozen, false);
    assert.equal(pendingSnapshotAfter.state, 'stopped');
    assert.equal(pendingSnapshotAfter.run_count, 0);
    assert.equal(pendingSnapshotAfter.usage_count, 0);
    assert.equal(pendingSnapshotAfter.segment_count, 2);

    const completeRecordId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 successful upload completion fixture',
    );
    const completeCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, completeRecordId);
    captureIds.push(completeCaptureId);
    const manifest = await seedSegments(admin, {
      tenantId: workspace.id,
      projectId: board.id,
      recordId: completeRecordId,
      captureId: completeCaptureId,
      segments: [
        { segmentIndex: 0, epoch: 0, bytes: 128, startOffsetMs: 0, endOffsetMs: 100,
          overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'd'.repeat(64), uploadState: 'verified' },
        { segmentIndex: 1, epoch: 0, bytes: 256, startOffsetMs: 100, endOffsetMs: 200,
          overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'e'.repeat(64), uploadState: 'verified' },
      ],
      onCleanupAttempt: attemptId => cleanupAttemptIds.add(attemptId),
    });
    assert.equal(manifest.length, 2);
    const reversedManifest = [...manifest].reverse();
    assert.deepEqual(reversedManifest.map(entry => entry.segmentIndex), [1, 0]);
    const completeBody = completionBody(completeCaptureId, reversedManifest, 'complete-reversed-array');

    await assert.rejects(
      post(ownerClient, { ...completeBody, expectedSourceVersion: 2 }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );
    const wrongOriginClient = clientFor('qa-meeting-upload-owner', owner, 'https://outside.invalid');
    await assert.rejects(
      post(wrongOriginClient, completeBody),
      error => requireHttpError(error, 'ACCESS_DENIED', 403),
    );
    const wrongActorClient = clientFor('qa-meeting-upload-owner', reader);
    await assert.rejects(
      post(wrongActorClient, completeBody),
      error => requireHttpError(error, 'ACTOR_CHANGED', 409),
    );
    await assert.rejects(
      post(readerClient, completeBody),
      error => requireHttpError(error, 'RESOURCE_NOT_FOUND', 404),
    );
    await assert.rejects(
      post(outsiderClient, completeBody),
      error => requireHttpError(error, 'RESOURCE_NOT_FOUND', 404),
    );
    await assertLedgerCounts(admin, completeCaptureId, 0, 0);

    const alteredManifests: Array<{ label: string; entries: CompletionEntry[] }> = [
      {
        label: 'timeline mismatch',
        entries: manifest.map((entry, index) => index === 0 ? { ...entry, startOffsetMs: 1 } : entry),
      },
      {
        label: 'byte count mismatch',
        entries: manifest.map((entry, index) => index === 0 ? { ...entry, bytes: entry.bytes + 1 } : entry),
      },
      {
        label: 'verified SHA mismatch',
        entries: manifest.map((entry, index) => index === 0 ? { ...entry, sha256: 'f'.repeat(64) } : entry),
      },
      {
        label: 'index values permuted across segment evidence',
        entries: manifest.map(entry => ({ ...entry, segmentIndex: entry.segmentIndex === 0 ? 1 : 0 })),
      },
    ];
    for (const scenario of alteredManifests) {
      await assert.rejects(
        post(ownerClient, { ...completeBody, audioManifest: scenario.entries }),
        error => requireHttpError(error, 'REVISION_CONFLICT', 409),
        scenario.label,
      );
      await assertLedgerCounts(admin, completeCaptureId, 0, 0);
    }

    const faultSuffix = randomUUID().replaceAll('-', '');
    faultTriggerName = `qa_meeting_upload_fail_${faultSuffix}`;
    faultFunctionName = `qa_meeting_upload_fail_fn_${faultSuffix}`;
    assert.match(faultTriggerName, /^[a-z0-9_]+$/u);
    assert.match(faultFunctionName, /^[a-z0-9_]+$/u);
    assert.match(completeCaptureId, /^[0-9a-f-]{36}$/iu);
    await admin.query(`CREATE FUNCTION projed_core.${faultFunctionName}() RETURNS trigger
      LANGUAGE plpgsql AS $qa$
      BEGIN
        IF NEW.capture_id::text='${completeCaptureId}' THEN
          RAISE EXCEPTION 'QA_MEETING_UPLOAD_USAGE_INJECTED' USING ERRCODE='P0001';
        END IF;
        RETURN NEW;
      END;
      $qa$`);
    faultObjectsCreated = true;
    await admin.query(`CREATE TRIGGER ${faultTriggerName} BEFORE INSERT ON projed_core.meeting_ai_usage_attempts
      FOR EACH ROW EXECUTE FUNCTION projed_core.${faultFunctionName}()`);
    await assert.rejects(
      post(ownerClient, completeBody),
      error => requireHttpError(error, 'DB_UNAVAILABLE', 503),
      'an injected usage-ledger failure is a database failure, not a semantic conflict',
    );
    const afterInjectedFailure = await captureState(admin, completeCaptureId);
    assert.equal(afterInjectedFailure.state, 'stopped');
    assert.equal(afterInjectedFailure.frozen, false);
    assert.equal(afterInjectedFailure.run_count, 0, 'the run insert must roll back with the usage insert');
    assert.equal(afterInjectedFailure.usage_count, 0);
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: DEFAULT_BUDGET_MICROS,
      reserved_twd_micros: '0',
      spent_twd_micros: '0',
    }, 'failed usage insertion must roll back the reservation too');
    await admin.query(`DROP TRIGGER ${faultTriggerName} ON projed_core.meeting_ai_usage_attempts`);
    await admin.query(`DROP FUNCTION projed_core.${faultFunctionName}()`);
    faultObjectsCreated = false;
    const lingeringTrigger = await admin.query<{ count: number }>(`
      SELECT count(*)::integer AS count FROM pg_catalog.pg_trigger
      WHERE tgname=$1 AND NOT tgisinternal
    `, [faultTriggerName]);
    assert.equal(lingeringTrigger.rows[0]?.count, 0, 'the helper-owned fault trigger was removed before retry');

    const concurrentResults = await Promise.all([
      post(ownerClient, completeBody),
      post(ownerClient, completeBody),
    ]);
    const concurrentReceipts = concurrentResults.map((result, index) =>
      responseData(result, `concurrent completion ${index + 1}`));
    assert.equal(concurrentReceipts[0]?.runId, concurrentReceipts[1]?.runId);
    assert.deepEqual(concurrentReceipts.map(receipt => receipt.idempotent).sort(), [false, true]);
    const successRunId = String(concurrentReceipts[0]?.runId);
    assert.ok(successRunId);
    assert.equal(concurrentReceipts[0]?.sourceComplete, true);
    assert.equal(concurrentReceipts[1]?.sourceComplete, true);
    const runs = await readRunRows(admin, completeCaptureId);
    assert.equal(runs.length, 1, 'concurrent completion creates exactly one run');
    assert.equal(runs[0]?.id, successRunId);
    assert.equal(runs[0]?.state, 'queued');
    assert.equal(runs[0]?.config_version, 'dev-123.v1');
    assert.equal(runs[0]?.resume_stage, 'transcribe');
    assert.equal(runs[0]?.provider_mode, 'gemini', 'a queued reservation does not dispatch the provider');
    assert.equal(runs[0]?.reserved_twd_micros, RESERVED_BUDGET_MICROS);
    assert.ok(Number.isFinite(Date.parse(runs[0]?.deadline_at ?? '')));
    const usage = await readUsageRows(admin, completeCaptureId);
    assert.deepEqual(usage, [{
      attempt_id: `${successRunId}:0`,
      run_id: successRunId,
      unit_identity: `${successRunId}:transcribe`,
      provider: 'gemini',
      model: 'gemini-3.5-transcribe',
      price_version: 'dev-123.v1',
      reserved_twd_micros: RESERVED_BUDGET_MICROS,
      actual_twd_micros: null,
      usage_state: 'reserved',
      dispatch_state: 'pending',
      outcome: 'reserved',
    }]);
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: DEFAULT_BUDGET_MICROS,
      reserved_twd_micros: RESERVED_BUDGET_MICROS,
      spent_twd_micros: '0',
    });

    const successfulReplay = responseData(await post(ownerClient, completeBody), 'successful completion replay');
    assert.equal(successfulReplay.runId, successRunId);
    assert.equal(successfulReplay.idempotent, true);
    await assertLedgerCounts(admin, completeCaptureId, 1, 1);

    const frozenBeforeRejectedWrites = await captureState(admin, completeCaptureId);
    assert.equal(frozenBeforeRejectedWrites.state, 'queued');
    assert.equal(frozenBeforeRejectedWrites.source_version, 1);
    assert.equal(frozenBeforeRejectedWrites.source_completeness, 'complete');
    assert.equal(frozenBeforeRejectedWrites.frozen, true);
    const frozenEpochManifest = JSON.stringify(frozenBeforeRejectedWrites.epoch_manifest);
    const pointerIntervals = [{
      captureId: completeCaptureId,
      clockEpoch: 0,
      sequence: 0,
      canonicalTaskId: taskId,
      surfaceKind: 'qa-meeting-upload',
      startedOffsetMs: 1,
      endedOffsetMs: 2,
      visible: true,
      terminationReason: 'flush',
    }];
    const pointerDigest = digest(JSON.stringify(pointerIntervals));
    await assert.rejects(
      post(ownerClient, {
        operation: 'reserve-segment', captureId: completeCaptureId, expectedSourceVersion: 1,
        segmentIndex: 2, epoch: 0, bytes: 0, startOffsetMs: 200, endOffsetMs: 201,
        overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', reservationKey: `qa-frozen-${randomUUID()}`,
      }),
      error => requireHttpError(error, 'MEETING_STORAGE_CONFLICT', 409),
    );
    await assert.rejects(
      post(ownerClient, {
        operation: 'progress', captureId: completeCaptureId, expectedSourceVersion: 1,
        epochManifest: [{ epoch: 0, captureOffsetMs: 0, monotonicStart: 1000, durationMs: 300, gapBeforeMs: 0 }],
        lastProgressAt: Date.now(),
      }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );
    await assert.rejects(
      post(ownerClient, {
        operation: 'append-pointer', captureId: completeCaptureId, expectedSourceVersion: 1,
        batchKey: `qa-frozen-pointer-${randomUUID()}`, digest: pointerDigest, intervals: pointerIntervals,
      }),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409),
    );
    assert.equal(storageCalls, 0, 'post-freeze reservation denial does not call storage');
    const frozenAfterRejectedWrites = await captureState(admin, completeCaptureId);
    assert.equal(frozenAfterRejectedWrites.state, 'queued');
    assert.equal(frozenAfterRejectedWrites.source_version, frozenBeforeRejectedWrites.source_version);
    assert.equal(frozenAfterRejectedWrites.frozen, true);
    assert.equal(JSON.stringify(frozenAfterRejectedWrites.epoch_manifest), frozenEpochManifest);
    assert.equal(frozenAfterRejectedWrites.segment_count, 2, 'post-freeze reserve creates no segment');
    assert.equal(frozenAfterRejectedWrites.pointer_count, 0, 'post-freeze pointer append creates no pointer');
    assert.equal(frozenAfterRejectedWrites.run_count, 1);
    assert.equal(frozenAfterRejectedWrites.usage_count, 1);

    for (const changed of [
      { ...completeBody, audioManifestHash: digest('different audio hash') },
      { ...completeBody, pointerManifestHash: digest('different pointer hash') },
      { ...completeBody, audioManifest: alteredManifests[0]!.entries },
    ]) {
      await assert.rejects(
        post(ownerClient, changed),
        error => requireHttpError(error, 'REVISION_CONFLICT', 409),
      );
      await assertLedgerCounts(admin, completeCaptureId, 1, 1);
      assert.deepEqual(await readBudget(admin, month), {
        limit_twd_micros: DEFAULT_BUDGET_MICROS,
        reserved_twd_micros: RESERVED_BUDGET_MICROS,
        spent_twd_micros: '0',
      });
    }

    const expiredRecordId = await createPrivateMeeting(
      database, config, owner, workspace.id, board.id, 'DEV-139 expired completion fixture',
    );
    const expiredCaptureId = await beginAndStopCapture(post, ownerClient, workspace.id, board.id, expiredRecordId);
    captureIds.push(expiredCaptureId);
    const expiredManifest = await seedSegments(admin, {
      tenantId: workspace.id, projectId: board.id, recordId: expiredRecordId, captureId: expiredCaptureId,
      segments: [{ segmentIndex: 0, epoch: 0, bytes: 64, startOffsetMs: 0, endOffsetMs: 100,
        overlapMs: 0, gapBeforeMs: 0, mime: 'audio/webm', sha256: 'f'.repeat(64), uploadState: 'verified' }],
      onCleanupAttempt: attemptId => cleanupAttemptIds.add(attemptId),
    });
    await admin.query(`UPDATE projed_core.meeting_capture_sessions
      SET audio_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1::uuid`, [expiredCaptureId]);
    const expiredBefore = await captureState(admin, expiredCaptureId);
    await assert.rejects(post(ownerClient, completionBody(expiredCaptureId, expiredManifest, 'expired')),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409));
    assert.deepEqual(await captureState(admin, expiredCaptureId), expiredBefore,
      'expiry denial cannot freeze the source or create a run or usage');
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: DEFAULT_BUDGET_MICROS, reserved_twd_micros: RESERVED_BUDGET_MICROS, spent_twd_micros: '0',
    }, 'expiry denial cannot reserve more money');

    const cancelled = responseData(await post(ownerClient, {
      operation: 'cancel', captureId: completeCaptureId, expectedSourceVersion: 1, reason: 'qa-queued-upload-cancel',
    }), 'queued upload run cancel');
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.idempotent, false);
    const cancelReplay = responseData(await post(ownerClient, {
      operation: 'cancel', captureId: completeCaptureId, expectedSourceVersion: 1, reason: 'qa-queued-upload-cancel',
    }), 'queued upload run cancel replay');
    assert.equal(cancelReplay.state, 'cancelled');
    assert.equal(cancelReplay.idempotent, true);
    const cancelledRuns = await readRunRows(admin, completeCaptureId);
    assert.equal(cancelledRuns.length, 1);
    assert.equal(cancelledRuns[0]?.state, 'cancelled');
    assert.equal(cancelledRuns[0]?.error_code, 'CANCELLED_BEFORE_DISPATCH');
    const cancelledUsage = await readUsageRows(admin, completeCaptureId);
    assert.equal(cancelledUsage.length, 1);
    assert.equal(cancelledUsage[0]?.usage_state, 'known');
    assert.equal(cancelledUsage[0]?.dispatch_state, 'pending');
    assert.equal(cancelledUsage[0]?.actual_twd_micros, '0');
    assert.equal(cancelledUsage[0]?.outcome, 'cancelled_before_dispatch');
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: DEFAULT_BUDGET_MICROS,
      reserved_twd_micros: '0',
      spent_twd_micros: '0',
    }, 'the undispatched reservation is refunded once; replay does not refund again');
    const cancelledBefore = await captureState(admin, completeCaptureId);
    const cancelledUsageBefore = await readUsageRows(admin, completeCaptureId);
    await assert.rejects(post(ownerClient, completeBody),
      error => requireHttpError(error, 'REVISION_CONFLICT', 409));
    assert.deepEqual(await captureState(admin, completeCaptureId), cancelledBefore,
      'completion after cancellation cannot revive or rewrite the source');
    assert.deepEqual(await readUsageRows(admin, completeCaptureId), cancelledUsageBefore);
    assert.deepEqual(await readBudget(admin, month), {
      limit_twd_micros: DEFAULT_BUDGET_MICROS, reserved_twd_micros: '0', spent_twd_micros: '0',
    }, 'completion after cancellation cannot reserve the refunded money again');
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    if (adminConnected && faultObjectsCreated && faultTriggerName && faultFunctionName) {
      try { await admin.query(`DROP TRIGGER IF EXISTS ${faultTriggerName} ON projed_core.meeting_ai_usage_attempts`); }
      catch (error) { cleanupErrors.push(error); }
      try { await admin.query(`DROP FUNCTION IF EXISTS projed_core.${faultFunctionName}()`); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (adminConnected) {
      try {
        if (captureIds.length > 0) {
          const ownCaptures = captureIds;
          const attempts = [...cleanupAttemptIds];
          if (attempts.length > 0) {
            await admin.query(`DELETE FROM projed_core.meeting_artifact_cleanup
              WHERE kind='storage' AND attempt_id=ANY($1::text[])`, [attempts]);
          }
          await admin.query('DELETE FROM projed_core.meeting_ai_usage_attempts WHERE capture_id=ANY($1::uuid[])', [ownCaptures]);
          await admin.query('DELETE FROM projed_core.meeting_analysis_runs WHERE capture_id=ANY($1::uuid[])', [ownCaptures]);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (workspaceId) {
      try { await ownerCollaboration.deleteWorkspace(workspaceId); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (adminConnected && budgetFixtureInserted && ownedBudgetMonth) {
      try {
        const remaining = await admin.query<{ limit_twd_micros: string; reserved_twd_micros: string; spent_twd_micros: string }>(`
          SELECT limit_twd_micros::text,reserved_twd_micros::text,spent_twd_micros::text
          FROM projed_core.meeting_ai_budget_months WHERE budget_month=$1::date
        `, [ownedBudgetMonth]);
        if (remaining.rowCount === 0) {
          // An earlier cleanup path already removed the helper-owned row.
        } else {
          assert.equal(remaining.rowCount, 1);
          const balance = remaining.rows[0];
          assert.ok(balance);
          const allowedOwnedStates = [
            { limit_twd_micros: PREEXHAUSTED_BUDGET_MICROS, reserved_twd_micros: PREEXHAUSTED_BUDGET_MICROS, spent_twd_micros: '0' },
            { limit_twd_micros: DEFAULT_BUDGET_MICROS, reserved_twd_micros: '0', spent_twd_micros: '0' },
            { limit_twd_micros: DEFAULT_BUDGET_MICROS, reserved_twd_micros: RESERVED_BUDGET_MICROS, spent_twd_micros: '0' },
          ];
          assert.ok(allowedOwnedStates.some(state =>
            state.limit_twd_micros === balance.limit_twd_micros
              && state.reserved_twd_micros === balance.reserved_twd_micros
              && state.spent_twd_micros === balance.spent_twd_micros),
          'refusing to delete a current-month budget row outside this helper’s known disposable states');
          const remainingRuns = await admin.query<{ count: number }>(`
            SELECT count(*)::integer AS count FROM projed_core.meeting_analysis_runs WHERE budget_month=$1::date
          `, [ownedBudgetMonth]);
          assert.equal(remainingRuns.rows[0]?.count, 0, 'all helper-owned runs must be removed before budget cleanup');
          const deleted = await admin.query(`
            DELETE FROM projed_core.meeting_ai_budget_months WHERE budget_month=$1::date
            RETURNING budget_month
          `, [ownedBudgetMonth]);
          assert.equal(deleted.rowCount, 1);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (serverStarted) {
      try { await server.shutdown(); }
      catch (error) { cleanupErrors.push(error); }
    } else {
      try { await httpDatabase.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (adminConnected) {
      try { await admin.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
  }

  if (failed) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError([failure, ...cleanupErrors], 'Meeting upload verification and cleanup failed');
    }
    throw failure;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Meeting upload cleanup failed');
  }
  assert.equal(budgetFixtureInserted, true);
  assert.equal(budgetFixtureReset, true);
}
