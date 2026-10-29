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
import { MeetingUploadRepository } from '../../../server/meetingUpload.js';
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
  owner:ServerActorV1,outsider:ServerActorV1,recordId:string,captureId:string,runId:string,
  onBound?:(actor:ServerActorV1,otherActor:ServerActorV1)=>Promise<void>,
  sessionReadableAfterCallback=true):Promise<void>{
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
    await onBound?.(boundActor,otherActor);
    const session=await store.readMeetingRunSession(runId);
    if(sessionReadableAfterCallback){
      assert.equal(session?.contextId,contextId);assert.equal(session?.localUserId,owner.localUserId);
      assert.equal(session?.identity.googleSubject,subject);
    }else assert.equal(session,null,'terminal ASR runs no longer resolve a worker Session');
    assert.equal(await store.readMeetingRunSession(randomUUID()),null,'another run cannot borrow the authorized Session');
    await assert.rejects(bind(otherActor),deny,'even a valid second Session cannot rebind the run');
    await assert.rejects(bind(outsider),'another account cannot bind this private source');
    assert.equal((await store.readMeetingRunSession(runId))?.contextId,sessionReadableAfterCallback?contextId:undefined);
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
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,budgetMeetingId,budgetCaptureId,awaitingRunId,async actor=>{
      const prepared=record(await runActorTransaction(database,config,actor,port=>
        new MeetingUploadRepository({cloudSpeech:true}).execute(port,budgetBody)),'ASR awaiting-budget receipt');
      assert.equal(prepared.state,'awaiting_budget');assert.equal(prepared.reservedTwdMicros,'0');
      assert.equal(prepared.providerMode,'cloud-speech-v1');
      assert.deepEqual(await readUsageRows(admin,budgetCaptureId),[]);
      assert.equal((await readBudget(admin,month))?.reserved_twd_micros,PREEXHAUSTED_BUDGET_MICROS);
    });
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

    const asrRecordId=await createPrivateMeeting(database,config,owner,workspace.id,board.id,'DEV-139 Cloud Speech reservation fixture');
    const asrCaptureId=await beginAndStopCapture(post,ownerClient,workspace.id,board.id,asrRecordId);
    captureIds.push(asrCaptureId);
    const asrManifest=await seedSegments(admin,{tenantId:workspace.id,projectId:board.id,recordId:asrRecordId,captureId:asrCaptureId,
      segments:[{segmentIndex:0,epoch:0,bytes:128,startOffsetMs:0,endOffsetMs:100,overlapMs:0,gapBeforeMs:0,
        mime:'audio/webm',sha256:'a'.repeat(64),uploadState:'verified'}],onCleanupAttempt:id=>cleanupAttemptIds.add(id)});
    const asrBody=completionBody(asrCaptureId,asrManifest,'cloud-speech-reservation');
    const asrRunId=String(responseData(await post(ownerClient,asrBody),'ASR source completion').runId);
    assert.match(asrRunId,/^[a-f0-9-]{36}$/u);
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,asrRecordId,asrCaptureId,asrRunId,async actor=>{
      const prepare=()=>runActorTransaction(database,config,actor,port=>new MeetingUploadRepository({cloudSpeech:true}).execute(port,asrBody));
      const before=await captureState(admin,asrCaptureId);
      await admin.query('UPDATE projed_core.meeting_ai_usage_attempts SET dispatch_state=NULL WHERE attempt_id=$1',[`${asrRunId}:0`]);
      await assert.rejects(prepare(),error=>error instanceof KernelError&&error.cause!==null
        &&typeof error.cause==='object'&&'code' in error.cause&&error.cause.code==='42501');
      assert.equal((await readBudget(admin,month))?.reserved_twd_micros,RESERVED_BUDGET_MICROS,
        'legacy unknown dispatch cannot release or replace its reservation');
      assert.deepEqual(await captureState(admin,asrCaptureId),before);
      await admin.query(`UPDATE projed_core.meeting_ai_usage_attempts SET dispatch_state='pending' WHERE attempt_id=$1`,[`${asrRunId}:0`]);
      const constraint=`qa_asr_pool_${randomUUID().replaceAll('-','')}`;
      await admin.query(`ALTER TABLE projed_core.meeting_ai_usage_attempts ADD CONSTRAINT ${constraint}
        CHECK(attempt_id<>'${asrRunId}:cloud-speech:pool')`);
      let fault:unknown;
      try{await assert.rejects(prepare(),error=>error instanceof KernelError&&error.cause!==null
          &&typeof error.cause==='object'&&'code' in error.cause&&error.cause.code==='23514'
          &&'constraint' in error.cause&&error.cause.constraint===constraint);
        assert.deepEqual(await captureState(admin,asrCaptureId),before);
        assert.equal((await readBudget(admin,month))?.reserved_twd_micros,RESERVED_BUDGET_MICROS);
        assert.equal((await readUsageRows(admin,asrCaptureId)).length,1,'failed pool INSERT rolls back legacy refund and run upgrade');
      }catch(error){fault=error;}
      try{await admin.query(`ALTER TABLE projed_core.meeting_ai_usage_attempts DROP CONSTRAINT ${constraint}`);}
      catch(error){throw new AggregateError(fault?[fault,error]:[error],'ASR fault constraint cleanup failed');}
      if(fault)throw fault;
      const prepared=record(await prepare(),'ASR prepared source');
      assert.equal(prepared.state,'queued');assert.equal(prepared.reservedTwdMicros,'96000');
      assert.equal(prepared.providerMode,'cloud-speech-v1');
      assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000');
      const usages=await readUsageRows(admin,asrCaptureId);
      assert.equal(usages.length,2);
      const legacy=usages.find(row=>row.attempt_id===`${asrRunId}:0`)!;
      assert.equal(legacy.actual_twd_micros,'0');assert.equal(legacy.usage_state,'known');
      assert.equal(legacy.outcome,'superseded_before_dispatch');
      const pool=usages.find(row=>row.attempt_id===`${asrRunId}:cloud-speech:pool`)!;
      assert.equal(pool.reserved_twd_micros,'96000');assert.equal(pool.usage_state,'reserved');
      const replay=record(await prepare(),'ASR reservation replay');
      assert.equal(replay.idempotent,true);assert.equal(replay.runId,asrRunId);
      assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000');
      assert.deepEqual(await readUsageRows(admin,asrCaptureId),usages,'replay creates no new attempt or reservation');
      await assert.rejects(runActorTransaction(database,config,actor,async port=>{
        await port.authorizeMeetingCaptureMutation(asrRecordId,asrCaptureId);
        await port.query('UPDATE projed_core.meeting_ai_budget_months SET limit_twd_micros=2000000000');
      }));
    });
    const asrCancelled=responseData(await post(ownerClient,{operation:'cancel',captureId:asrCaptureId,
      expectedSourceVersion:1,reason:'qa-asr-reservation-cleanup'}),'ASR queued cancellation');
    assert.equal(asrCancelled.state,'cancelled');
    assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'0','cancellation refunds only the pending Cloud Speech pool');

    const dispatchRecordId=await createPrivateMeeting(database,config,owner,workspace.id,board.id,'DEV-139 ASR dispatch fixture');
    const dispatchCaptureId=await beginAndStopCapture(post,ownerClient,workspace.id,board.id,dispatchRecordId);
    captureIds.push(dispatchCaptureId);
    const dispatchManifest=await seedSegments(admin,{tenantId:workspace.id,projectId:board.id,recordId:dispatchRecordId,
      captureId:dispatchCaptureId,segments:[{segmentIndex:0,epoch:0,bytes:128,startOffsetMs:0,endOffsetMs:100,
        overlapMs:0,gapBeforeMs:0,mime:'audio/webm',sha256:'b'.repeat(64),uploadState:'verified'}],
      onCleanupAttempt:id=>cleanupAttemptIds.add(id)});
    const dispatchBody=completionBody(dispatchCaptureId,dispatchManifest,'cloud-speech-dispatch');
    const dispatchRunId=String(responseData(await post(ownerClient,dispatchBody),'ASR dispatch source completion').runId);
    assert.match(dispatchRunId,/^[a-f0-9-]{36}$/u);

    const readDispatchLedger=async(token:string)=>{
      const result=await admin.query<{unit_reserved:string;unit_dispatch:string|null;pool_reserved:string;pool_remaining:string|null}>(`
        SELECT unit.reserved_twd_micros::text AS unit_reserved,unit.dispatch_state AS unit_dispatch,
          pool.reserved_twd_micros::text AS pool_reserved,pool.asr_remaining_twd_micros::text AS pool_remaining
        FROM projed_core.meeting_ai_usage_attempts unit
        JOIN projed_core.meeting_ai_usage_attempts pool ON pool.attempt_id=unit.run_id::text||':cloud-speech:pool'
        WHERE unit.run_id=$1::uuid AND unit.asr_operation_token=$2::uuid
      `,[dispatchRunId,token]);
      assert.equal(result.rowCount,1,'the operation token identifies one reserved ASR unit');
      return result.rows[0]!;
    };
    const claimUnit=(actor:ServerActorV1,token:string)=>runActorTransaction(database,config,actor,async port=>{
      await port.authorizeMeetingCaptureMutation(dispatchRecordId,dispatchCaptureId);
      const result=await port.query<{claim:unknown}>(
        'SELECT projed_core.claim_meeting_asr_unit_v1($1::uuid,$2::uuid) AS claim',[dispatchRunId,token]);
      return result.rows[0]?.claim??null;
    });
    const markUnit=(actor:ServerActorV1,token:string,payload:JsonObject)=>runActorTransaction(database,config,actor,async port=>{
      await port.authorizeMeetingCaptureMutation(dispatchRecordId,dispatchCaptureId);
      const result=await port.query<{marked:boolean}>(
        'SELECT projed_core.mark_meeting_asr_dispatch_v1($1::uuid,$2::uuid,$3::jsonb) AS marked',
        [dispatchRunId,token,JSON.stringify(payload)]);
      return result.rows[0]?.marked===true;
    });
    const readDispatch=(actor:ServerActorV1,token:string,payload:JsonObject)=>runActorTransaction(
      database,config,actor,async port=>{
        await port.authorizeMeetingCaptureMutation(dispatchRecordId,dispatchCaptureId);
        const result=await port.query<{eligible:boolean}>(
          'SELECT projed_core.read_meeting_asr_dispatch_v1($1::uuid,$2::uuid,$3::jsonb) AS eligible',
          [dispatchRunId,token,JSON.stringify(payload)]);
        return result.rows[0]?.eligible===true;
      });
    const exactDispatchPayload:JsonObject={chunkIndex:0,chunkCount:1,startSample:0,endSample:1600,
      decodedSha256:'b'.repeat(64),startOffsetMs:0,endOffsetMs:100};
    let dispatchToken='';let boundDispatchActor:ServerActorV1|undefined;let dispatchSourceId='';
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,dispatchRecordId,dispatchCaptureId,dispatchRunId,
      async(actor,otherActor)=>{
        const prepare=()=>runActorTransaction(database,config,actor,port=>
          new MeetingUploadRepository({cloudSpeech:true}).execute(port,dispatchBody));
        const prepared=record(await prepare(),'ASR dispatch source preparation');
        assert.equal(prepared.state,'queued');assert.equal(prepared.reservedTwdMicros,'96000');
        assert.equal(prepared.providerMode,'cloud-speech-v1');
        assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000',
          'preparing this independent source reserves one Cloud Speech pool');
        const proposedTokens=[randomUUID(),randomUUID()];
        const claimRace=await Promise.all(proposedTokens.map(async token=>({token,claim:await claimUnit(actor,token)})));
        const successfulClaims=claimRace.filter(result=>result.claim!==null);
        assert.equal(successfulClaims.length,1,'two independent claim transactions produce exactly one winner');
        const winner=successfulClaims[0]!;const token=winner.token;dispatchToken=token;boundDispatchActor=actor;
        const firstValue=winner.claim;
        assert.ok(firstValue,'the exact bound owner Session can claim the first ASR unit');
        const first=record(firstValue,'ASR unit claim');
        assert.equal(first.runId,dispatchRunId);assert.equal(first.captureId,dispatchCaptureId);
        assert.equal(first.sourceVersion,1);assert.equal(first.leaseToken,token);assert.equal(first.chunkIndex,0);
        const claimedSource=record(first.source,'ASR claim source');
        assert.equal(claimedSource.startOffsetMs,0);assert.equal(claimedSource.sha256,'b'.repeat(64));
        assert.equal(typeof claimedSource.id,'string');
        dispatchSourceId=String(claimedSource.id);
        const afterClaim=await readDispatchLedger(token);
        assert.equal(afterClaim.unit_reserved,'48000');assert.equal(afterClaim.unit_dispatch,'pending');
        assert.equal(afterClaim.pool_reserved,'96000');assert.equal(afterClaim.pool_remaining,'48000');
        assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000',
          'allocating a unit moves the pool remainder without changing monthly reserved funds');
        assert.deepEqual(await claimUnit(actor,token),first,'same-token claim replay returns the same lease and allocation');
        assert.deepEqual(await readDispatchLedger(token),afterClaim,'same-token replay leaves unit and pool balances unchanged');
        assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000');
        assert.equal(await claimUnit(actor,randomUUID()),null,'a competing claim token cannot take the running lease');

        assert.equal(await markUnit(otherActor,token,exactDispatchPayload),false,
          'a different stored Session for the same owner cannot dispatch the bound run');
        assert.equal(await markUnit(actor,randomUUID(),exactDispatchPayload),false,
          'a token other than the current claim cannot dispatch the unit');
        assert.equal((await readDispatchLedger(token)).unit_dispatch,'pending','denied dispatch attempts leave the unit pending');
        const sourceId=String(claimedSource.id);
        const tamperedSource=await admin.query<{id:string}>(`
          UPDATE projed_core.meeting_capture_segments SET sha256=$3
          WHERE id=$1::uuid AND capture_id=$2::uuid AND sha256=$4 RETURNING id::text
        `,[sourceId,dispatchCaptureId,'c'.repeat(64),'b'.repeat(64)]);
        assert.equal(tamperedSource.rowCount,1,'only this synthetic verified source was tampered');
        let dispatchAfterSourceTamper:boolean|undefined;
        try{
          dispatchAfterSourceTamper=await markUnit(actor,token,exactDispatchPayload);
        }finally{
          const restoredSource=await admin.query<{id:string}>(`
            UPDATE projed_core.meeting_capture_segments SET sha256=$3
            WHERE id=$1::uuid AND capture_id=$2::uuid AND sha256=$4 RETURNING id::text
          `,[sourceId,dispatchCaptureId,'b'.repeat(64),'c'.repeat(64)]);
          assert.equal(restoredSource.rowCount,1,'the synthetic source SHA is restored even after a dispatch assertion failure');
        }
        assert.equal(dispatchAfterSourceTamper,false,'dispatch revalidates the frozen source hash immediately before marking');
        assert.equal((await readDispatchLedger(token)).unit_dispatch,'pending');
        assert.equal(await markUnit(actor,token,exactDispatchPayload),true,'the exact seven-field payload marks paid intent');
        assert.equal(await markUnit(actor,token,exactDispatchPayload),true,'an exact dispatch replay is idempotent');
        const ledgerBeforeRead=await readDispatchLedger(token);
        const budgetBeforeRead=await readBudget(admin,month);
        assert.equal(await readDispatch(actor,token,exactDispatchPayload),true,
          'readback confirms the exact dispatched token and frozen payload');
        assert.equal(await readDispatch(actor,randomUUID(),exactDispatchPayload),false,
          'readback rejects a token other than the dispatched operation');
        const changedPayload={...exactDispatchPayload,decodedSha256:'c'.repeat(64)};
        assert.equal(await markUnit(actor,token,changedPayload),false,'a changed dispatch manifest cannot replay');
        assert.equal(await readDispatch(actor,token,changedPayload),false,'readback rejects a changed dispatch payload');
        assert.equal((await readDispatchLedger(token)).unit_dispatch,'dispatched');
        assert.deepEqual(await readDispatchLedger(token),ledgerBeforeRead,'dispatch readback leaves usage and pool ledgers unchanged');
        assert.deepEqual(await readBudget(admin,month),budgetBeforeRead,'dispatch readback does not change reserved budget');
        assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000');
        assert.equal(claimRace.filter(result=>result.token!==token&&result.claim===null).length,1,
          'the losing competing token remains unclaimed');
      });

    assert.ok(boundDispatchActor,'the Session helper supplied the exact run-bound actor context');
    assert.equal(await markUnit(boundDispatchActor,dispatchToken,exactDispatchPayload),false,
      'dispatch is denied after the bound Session is revoked and physically deleted');
    const revokedDispatchLedger=await readDispatchLedger(dispatchToken);
    const revokedDispatchBudget=await readBudget(admin,month);
    assert.equal(await readDispatch(boundDispatchActor,dispatchToken,exactDispatchPayload),false,
      'dispatch readback is false after the bound Session is revoked and physically deleted');
    assert.deepEqual(await readDispatchLedger(dispatchToken),revokedDispatchLedger,
      'post-revocation dispatch readback does not alter unit or pool accounting');
    assert.deepEqual(await readBudget(admin,month),revokedDispatchBudget,
      'post-revocation dispatch readback leaves the in-flight reservation unchanged');
    assert.equal((await readDispatchLedger(dispatchToken)).unit_dispatch,'dispatched',
      'post-deletion denial preserves the already-dispatched in-flight intent');
    const dispatchCancelled=responseData(await post(ownerClient,{operation:'cancel',captureId:dispatchCaptureId,
      expectedSourceVersion:1,reason:'qa-asr-after-dispatch-cancel'}),'ASR dispatched parent cancellation');
    assert.equal(dispatchCancelled.state,'cancelled');
    assert.equal((await readBudget(admin,month))?.reserved_twd_micros,'96000',
      'parent cancellation leaves the dispatched pool reservation in flight');
    assert.equal((await readDispatchLedger(dispatchToken)).unit_dispatch,'dispatched');

    const settleUnit=(actor:ServerActorV1,runId:string,token:string,payload:JsonObject)=>runActorTransaction(
      database,config,actor,async port=>{
        const visible=await port.query<{record_id:string;capture_id:string}>(`
          SELECT capture.record_id::text,capture.id::text AS capture_id
          FROM projed_core.meeting_analysis_runs run
          JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id
          WHERE run.id=$1::uuid
        `,[runId]);
        assert.ok(visible.rowCount===0||visible.rowCount===1,'a visible ASR run resolves at most one owning capture');
        if(visible.rows[0])await port.authorizeMeetingCaptureMutation(visible.rows[0].record_id,visible.rows[0].capture_id);
        const result=await port.query<{receipt:unknown}>(
          'SELECT projed_core.settle_meeting_asr_unit_v1($1::uuid,$2::uuid,$3::jsonb) AS receipt',
          [runId,token,JSON.stringify(payload)]);
        return result.rows[0]?.receipt??null;
      });
    const readUnitPool=async(runId:string,token:string)=>{
      const result=await admin.query<{
        unit_reserved:string;unit_actual:string|null;unit_state:string;unit_dispatch:string|null;
        unit_outcome:string|null;pool_state:string;pool_remaining:string|null;pool_outcome:string|null;
      }>(`
        SELECT unit.reserved_twd_micros::text AS unit_reserved,unit.actual_twd_micros::text AS unit_actual,
          unit.usage_state AS unit_state,unit.dispatch_state AS unit_dispatch,unit.outcome AS unit_outcome,
          pool.usage_state AS pool_state,pool.asr_remaining_twd_micros::text AS pool_remaining,pool.outcome AS pool_outcome
        FROM projed_core.meeting_ai_usage_attempts unit
        JOIN projed_core.meeting_ai_usage_attempts pool ON pool.attempt_id=unit.run_id::text||':cloud-speech:pool'
        WHERE unit.run_id=$1::uuid AND unit.asr_operation_token=$2::uuid
      `,[runId,token]);
      assert.equal(result.rowCount,1,'the run token and its pool identify exactly one settlement ledger');
      return result.rows[0]!;
    };
    const createSettlementFixture=async(label:string)=>{
      const recordId=await createPrivateMeeting(database,config,owner,workspace.id,board.id,`DEV-139 ASR ${label} fixture`);
      const captureId=await beginAndStopCapture(post,ownerClient,workspace.id,board.id,recordId);
      captureIds.push(captureId);
      const manifest=await seedSegments(admin,{tenantId:workspace.id,projectId:board.id,recordId,captureId,
        segments:[{segmentIndex:0,epoch:0,bytes:128,startOffsetMs:0,endOffsetMs:100,
          overlapMs:0,gapBeforeMs:0,mime:'audio/webm',sha256:'b'.repeat(64),uploadState:'verified'}],
        onCleanupAttempt:id=>cleanupAttemptIds.add(id)});
      const source=await admin.query<{id:string}>(`SELECT id::text FROM projed_core.meeting_capture_segments
        WHERE capture_id=$1::uuid AND source_version=1 AND segment_index=0 AND upload_state='verified'`,[captureId]);
      assert.equal(source.rowCount,1,'each settlement fixture owns exactly one verified source segment');
      const body=completionBody(captureId,manifest,`cloud-speech-${label}-${randomUUID()}`);
      const runId=String(responseData(await post(ownerClient,body),`ASR ${label} source completion`).runId);
      assert.match(runId,/^[a-f0-9-]{36}$/u);
      return {recordId,captureId,sourceSegmentId:source.rows[0]!.id,manifest,body,runId,
        dispatchPayload:{chunkIndex:0,chunkCount:1,startSample:0,endSample:1600,
          decodedSha256:'b'.repeat(64),startOffsetMs:0,endOffsetMs:100} satisfies JsonObject};
    };
    const prepareSettlementFixture=(fixture:Awaited<ReturnType<typeof createSettlementFixture>>,actor:ServerActorV1)=>
      runActorTransaction(database,config,actor,port=>new MeetingUploadRepository({cloudSpeech:true}).execute(port,fixture.body));
    const claimSettlementUnit=(fixture:Awaited<ReturnType<typeof createSettlementFixture>>,
      actor:ServerActorV1,token:string)=>runActorTransaction(database,config,actor,async port=>{
        await port.authorizeMeetingCaptureMutation(fixture.recordId,fixture.captureId);
        const result=await port.query<{claim:unknown}>(
          'SELECT projed_core.claim_meeting_asr_unit_v1($1::uuid,$2::uuid) AS claim',[fixture.runId,token]);
        return result.rows[0]?.claim??null;
      });
    const markSettlementDispatch=(fixture:Awaited<ReturnType<typeof createSettlementFixture>>,
      actor:ServerActorV1,token:string)=>runActorTransaction(database,config,actor,async port=>{
        await port.authorizeMeetingCaptureMutation(fixture.recordId,fixture.captureId);
        const result=await port.query<{marked:boolean}>(
          'SELECT projed_core.mark_meeting_asr_dispatch_v1($1::uuid,$2::uuid,$3::jsonb) AS marked',
          [fixture.runId,token,JSON.stringify(fixture.dispatchPayload)]);
        return result.rows[0]?.marked===true;
      });
    const recognizedPayloadFor=(dispatchPayload:JsonObject,sourceSegmentId:string):JsonObject=>({
      kind:'recognized',transcript:{...dispatchPayload,sourceHash:'d'.repeat(64),rawText:'測試',wordOffsets:[{
        text:'測試',start_ms:0,end_ms:100,source_audio_segment_id:sourceSegmentId,source_word_index:0,
      }]},
      chargeMicros:'16000',chargeSource:'validated_pcm_upper_bound',
    });
    const countCheckpoints=async(runId:string)=>{
      const result=await admin.query<{count:number}>(
        'SELECT count(*)::integer AS count FROM projed_core.meeting_asr_unit_results WHERE run_id=$1::uuid',[runId]);
      return result.rows[0]?.count??-1;
    };

    assert.ok(boundDispatchActor,'the dispatched-cancel fixture retains its original bound actor context');
    const cancelledReceipt=record(await settleUnit(boundDispatchActor,dispatchRunId,dispatchToken,
      recognizedPayloadFor(exactDispatchPayload,dispatchSourceId)),'late recognized settlement after cancellation');
    assert.equal(cancelledReceipt.published,false,'cancellation prevents late transcript publication');
    assert.equal(cancelledReceipt.asrComplete,false);
    assert.equal(await countCheckpoints(dispatchRunId),0,'cancelled source creates no ASR checkpoint');
    assert.deepEqual(await readBudget(admin,month),{
      limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'0',spent_twd_micros:'16000',
    },'late recognized usage is charged while the cancelled pool reservation is released');
    const cancelledLedger=await readUnitPool(dispatchRunId,dispatchToken);
    assert.equal(cancelledLedger.unit_state,'known');assert.equal(cancelledLedger.unit_actual,'16000');
    assert.equal(cancelledLedger.unit_dispatch,'dispatched');
    assert.equal(cancelledLedger.pool_state,'known');assert.equal(cancelledLedger.pool_remaining,'0');

    const revokedFixture=await createSettlementFixture('revoked-owner-account-only');
    const revokedToken=randomUUID();
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,revokedFixture.recordId,
      revokedFixture.captureId,revokedFixture.runId,async(actor)=>{
        const prepared=record(await prepareSettlementFixture(revokedFixture,actor),'revoked owner settlement preparation');
        assert.equal(prepared.state,'queued');assert.equal(prepared.reservedTwdMicros,'96000');
        assert.ok(await claimSettlementUnit(revokedFixture,actor,revokedToken));
        assert.equal(await markSettlementDispatch(revokedFixture,actor,revokedToken),true);
      });
    const beforeRevokedSettlement=await admin.query<{
      run_state:string;capture_state:string;source_version:number;source_completeness:string;
      active_transcript_revision_id:string|null;verified_sources:number;transcript_segments:number;checkpoint_count:number;
    }>(`
      SELECT run.state AS run_state,capture.state AS capture_state,capture.source_version,capture.source_completeness,
        capture.active_transcript_revision_id::text,
        (SELECT count(*)::integer FROM projed_core.meeting_capture_segments source
          WHERE source.capture_id=capture.id AND source.source_version=capture.source_version
            AND source.upload_state='verified') AS verified_sources,
        (SELECT count(*)::integer FROM projed_core.meeting_transcript_segments segment WHERE segment.capture_id=capture.id) AS transcript_segments,
        (SELECT count(*)::integer FROM projed_core.meeting_asr_unit_results result WHERE result.run_id=run.id) AS checkpoint_count
      FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid
    `,[revokedFixture.runId]);
    assert.deepEqual(beforeRevokedSettlement.rows[0],{
      run_state:'running',capture_state:'queued',source_version:1,source_completeness:'complete',
      active_transcript_revision_id:null,verified_sources:1,transcript_segments:0,checkpoint_count:0,
    },'Session revocation alone has not cancelled or rewritten the frozen capture');
    const revokedReceipt=record(await settleUnit(owner,revokedFixture.runId,revokedToken,
      recognizedPayloadFor(revokedFixture.dispatchPayload,revokedFixture.sourceSegmentId)),
      'recognized result after bound Session deletion');
    assert.equal(revokedReceipt.published,false,'a replacement owner context cannot publish for the revoked run Session');
    assert.equal(revokedReceipt.asrComplete,false);
    const afterRevokedSettlement=await admin.query<{
      run_state:string;capture_state:string;error_code:string|null;source_version:number;source_completeness:string;
      active_transcript_revision_id:string|null;verified_sources:number;transcript_segments:number;checkpoint_count:number;
    }>(`
      SELECT run.state AS run_state,capture.state AS capture_state,run.error_code,capture.source_version,capture.source_completeness,
        capture.active_transcript_revision_id::text,
        (SELECT count(*)::integer FROM projed_core.meeting_capture_segments source
          WHERE source.capture_id=capture.id AND source.source_version=capture.source_version
            AND source.upload_state='verified') AS verified_sources,
        (SELECT count(*)::integer FROM projed_core.meeting_transcript_segments segment WHERE segment.capture_id=capture.id) AS transcript_segments,
        (SELECT count(*)::integer FROM projed_core.meeting_asr_unit_results result WHERE result.run_id=run.id) AS checkpoint_count
      FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid
    `,[revokedFixture.runId]);
    assert.deepEqual(afterRevokedSettlement.rows[0],{
      run_state:'failed_terminal',capture_state:'queued',error_code:'ASR_RESULT_NOT_PUBLISHED',source_version:1,
      source_completeness:'complete',active_transcript_revision_id:null,verified_sources:1,
      transcript_segments:0,checkpoint_count:0,
    },'accounting-only settlement fails the run while preserving capture state, frozen source and empty transcript');
    assert.deepEqual(await readBudget(admin,month),{
      limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'0',spent_twd_micros:'32000',
    },'revoked-session recognized usage is charged but cannot publish');
    const sourceBeforeOwnerStatus=await admin.query<{
      id:string;sha256:string;storage_generation:string;start_offset_ms:string;end_offset_ms:string;bytes:string;mime:string;
    }>(`SELECT id::text,sha256,storage_generation,start_offset_ms::text,end_offset_ms::text,bytes::text,mime
      FROM projed_core.meeting_capture_segments WHERE capture_id=$1::uuid AND source_version=1`,[revokedFixture.captureId]);
    assert.equal(sourceBeforeOwnerStatus.rowCount,1);
    const ownerStatus=responseData(await post(ownerClient,{operation:'status',captureId:revokedFixture.captureId}),
      'owner status reconciliation after terminal ASR settlement');
    assert.equal(ownerStatus.state,'failed_terminal');assert.equal(ownerStatus.sourceVersion,1);
    const afterOwnerStatus=await admin.query<{
      capture_state:string;source_version:number;source_completeness:string;
      active_transcript_revision_id:string|null;verified_sources:number;transcript_segments:number;checkpoint_count:number;
    }>(`
      SELECT capture.state AS capture_state,capture.source_version,capture.source_completeness,
        capture.active_transcript_revision_id::text,
        (SELECT count(*)::integer FROM projed_core.meeting_capture_segments source
          WHERE source.capture_id=capture.id AND source.source_version=capture.source_version
            AND source.upload_state='verified') AS verified_sources,
        (SELECT count(*)::integer FROM projed_core.meeting_transcript_segments segment WHERE segment.capture_id=capture.id) AS transcript_segments,
        (SELECT count(*)::integer FROM projed_core.meeting_asr_unit_results result WHERE result.run_id=run.id) AS checkpoint_count
      FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid
    `,[revokedFixture.runId]);
    assert.deepEqual(afterOwnerStatus.rows[0],{
      capture_state:'failed_terminal',source_version:1,source_completeness:'complete',
      active_transcript_revision_id:null,verified_sources:1,transcript_segments:0,checkpoint_count:0,
    },'owner status closes the stale active-capture slot without changing source or transcript content');
    const sourceAfterOwnerStatus=await admin.query<{
      id:string;sha256:string;storage_generation:string;start_offset_ms:string;end_offset_ms:string;bytes:string;mime:string;
    }>(`SELECT id::text,sha256,storage_generation,start_offset_ms::text,end_offset_ms::text,bytes::text,mime
      FROM projed_core.meeting_capture_segments WHERE capture_id=$1::uuid AND source_version=1`,[revokedFixture.captureId]);
    assert.deepEqual(sourceAfterOwnerStatus.rows,sourceBeforeOwnerStatus.rows,
      'owner status preserves verified source identity, hash, generation, duration and media type');

    const successFixture=await createSettlementFixture('checkpoint-success');
    const successToken=randomUUID();
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,successFixture.recordId,
      successFixture.captureId,successFixture.runId,async(actor)=>{
        const successPrepared=record(await prepareSettlementFixture(successFixture,actor),'checkpoint success preparation');
        assert.equal(successPrepared.state,'queued');assert.equal(successPrepared.reservedTwdMicros,'96000');
        assert.deepEqual(await readBudget(admin,month),{
          limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'96000',spent_twd_micros:'32000',
        });
        const claim=record(await claimSettlementUnit(successFixture,actor,successToken),'checkpoint success claim');
        assert.equal(claim.leaseToken,successToken);
        assert.equal(await markSettlementDispatch(successFixture,actor,successToken),true);
        const payload=recognizedPayloadFor(successFixture.dispatchPayload,successFixture.sourceSegmentId);
        const transcript=record(payload.transcript,'recognized test transcript');
        assert.ok(Array.isArray(transcript.wordOffsets)&&transcript.wordOffsets.length===1);
        const validWord=record(transcript.wordOffsets[0],'recognized source word');
        const wrongSourceWordPayload:JsonObject={...payload,transcript:{...transcript,wordOffsets:[{
          ...validWord,source_audio_segment_id:randomUUID(),
        }]}};
        const ledgerBeforeInvalidWord=await readUnitPool(successFixture.runId,successToken);
        const budgetBeforeInvalidWord=await readBudget(admin,month);
        await assert.rejects(settleUnit(actor,successFixture.runId,successToken,wrongSourceWordPayload),error=>
          error instanceof KernelError&&error.cause!==null&&typeof error.cause==='object'
            &&'code' in error.cause&&error.cause.code==='42501',
        'settlement rejects a transcript word anchored to another source segment');
        assert.equal(await countCheckpoints(successFixture.runId),0,'a wrong source word cannot create a checkpoint');
        assert.deepEqual(await readUnitPool(successFixture.runId,successToken),ledgerBeforeInvalidWord,
          'a wrong source word rolls back unit and pool settlement changes');
        assert.deepEqual(await readBudget(admin,month),budgetBeforeInvalidWord,
          'a wrong source word cannot charge or release reserved budget');
        const first=record(await settleUnit(actor,successFixture.runId,successToken,payload),'recognized checkpoint settlement');
        assert.equal(first.kind,'recognized');assert.equal(first.published,true);assert.equal(first.asrComplete,true);
        assert.equal(first.nextState,'queued');assert.equal(first.nextStage,'retrieve');
        const firstCursor=record(first.nextCursor,'completed ASR cursor');
        assert.deepEqual(firstCursor,{asr:{done:true,segmentIndex:0,chunkIndex:0,unitIndex:0,attempt:0}});
        const checkpointBefore=await admin.query<{attempt_id:string;created_at:string;result:unknown}>(`
          SELECT attempt_id,created_at::text,result FROM projed_core.meeting_asr_unit_results WHERE run_id=$1::uuid
        `,[successFixture.runId]);
        assert.equal(checkpointBefore.rowCount,1);
        assert.deepEqual(checkpointBefore.rows[0]?.result,record(payload.transcript,'expected checkpoint transcript'));
        assert.deepEqual(record(await settleUnit(actor,successFixture.runId,successToken,payload),
          'recognized checkpoint idempotent replay'),first,'same token and payload returns the original settlement receipt');
        const checkpointAfter=await admin.query<{attempt_id:string;created_at:string;result:unknown}>(`
          SELECT attempt_id,created_at::text,result FROM projed_core.meeting_asr_unit_results WHERE run_id=$1::uuid
        `,[successFixture.runId]);
        assert.deepEqual(checkpointAfter.rows,checkpointBefore.rows,'settlement replay does not rewrite or duplicate the checkpoint');
        const checkpointCountBeforeFurtherClaim=await countCheckpoints(successFixture.runId);
        const budgetBeforeFurtherClaim=await readBudget(admin,month);
        assert.equal(await claimSettlementUnit(successFixture,actor,randomUUID()),null,
          'a completed ASR cursor at retrieve cannot claim another paid ASR unit');
        assert.equal(await countCheckpoints(successFixture.runId),checkpointCountBeforeFurtherClaim,
          'a rejected post-ASR claim leaves the checkpoint unchanged');
        assert.deepEqual(await readBudget(admin,month),budgetBeforeFurtherClaim,
          'a rejected post-ASR claim does not reserve additional budget');
        assert.deepEqual(await readBudget(admin,month),{
          limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'0',spent_twd_micros:'48000',
        },'recognized replay does not double charge the same unit');
      });
    const successState=await admin.query<{
      run_state:string;resume_stage:string;attempt_count:number;capture_state:string;
      active_transcript_revision_id:string|null;transcript_segments:number;checkpoint_count:number;
    }>(`
      SELECT run.state AS run_state,run.resume_stage,run.attempt_count,capture.state AS capture_state,
        capture.active_transcript_revision_id::text,
        (SELECT count(*)::integer FROM projed_core.meeting_transcript_segments segment WHERE segment.capture_id=capture.id) AS transcript_segments,
        (SELECT count(*)::integer FROM projed_core.meeting_asr_unit_results result WHERE result.run_id=run.id) AS checkpoint_count
      FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid
    `,[successFixture.runId]);
    assert.equal(successState.rowCount,1);
    assert.deepEqual(successState.rows[0],{
      run_state:'queued',resume_stage:'retrieve',attempt_count:1,capture_state:'queued',
      active_transcript_revision_id:null,transcript_segments:0,checkpoint_count:1,
    },'ASR checkpoint waits at retrieve and does not activate a transcript or final segment');
    assert.deepEqual(await readBudget(admin,month),{
      limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'0',spent_twd_micros:'48000',
    });
    const checkpointCountBeforeSourceDelete=await countCheckpoints(successFixture.runId);
    assert.equal(checkpointCountBeforeSourceDelete,1);
    const usageBeforeSourceDelete=await readUsageRows(admin,successFixture.captureId);
    const unitPoolBeforeSourceDelete=await readUnitPool(successFixture.runId,successToken);
    const budgetBeforeSourceDelete=await readBudget(admin,month);
    const deletedSource=await admin.query<{id:string}>(`
      DELETE FROM projed_core.meeting_capture_segments WHERE id=$1::uuid AND capture_id=$2::uuid RETURNING id::text
    `,[successFixture.sourceSegmentId,successFixture.captureId]);
    assert.equal(deletedSource.rowCount,1,'only the nonce-owned successful source segment is deleted');
    assert.equal(await countCheckpoints(successFixture.runId),0,
      'deleting the successful source segment cascades its content checkpoint');
    assert.deepEqual(await readUsageRows(admin,successFixture.captureId),usageBeforeSourceDelete,
      'source deletion retains the independently settled usage ledger');
    assert.deepEqual(await readUnitPool(successFixture.runId,successToken),unitPoolBeforeSourceDelete,
      'source deletion retains settled unit and pool accounting');
    assert.deepEqual(await readBudget(admin,month),budgetBeforeSourceDelete,
      'source deletion does not alter spent or reserved budget');

    const unknownFixture=await createSettlementFixture('unknown-usage');
    const unknownToken=randomUUID();
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,unknownFixture.recordId,
      unknownFixture.captureId,unknownFixture.runId,async(actor)=>{
        const unknownPrepared=record(await prepareSettlementFixture(unknownFixture,actor),'unknown usage preparation');
        assert.equal(unknownPrepared.state,'queued');assert.equal(unknownPrepared.reservedTwdMicros,'96000');
        assert.ok(await claimSettlementUnit(unknownFixture,actor,unknownToken));
        assert.equal(await markSettlementDispatch(unknownFixture,actor,unknownToken),true);
        const payload:JsonObject={kind:'usage_unknown',code:'ASR_REQUEST_TIMEOUT'};
        const first=record(await settleUnit(actor,unknownFixture.runId,unknownToken,payload),'unknown usage settlement');
        assert.equal(first.kind,'usage_unknown');assert.equal(first.published,false);assert.equal(first.asrComplete,false);
        assert.equal(first.nextState,'failed_terminal');
        assert.deepEqual(record(await settleUnit(actor,unknownFixture.runId,unknownToken,payload),
          'unknown usage idempotent replay'),first,'unknown settlement replay is stable');
      },false);
    assert.equal(await countCheckpoints(unknownFixture.runId),0,'unknown usage never stores transcript content');
    const unknownLedger=await readUnitPool(unknownFixture.runId,unknownToken);
    assert.equal(unknownLedger.unit_state,'unknown');assert.equal(unknownLedger.unit_actual,null);
    assert.equal(unknownLedger.unit_outcome,'ASR_REQUEST_TIMEOUT');assert.equal(unknownLedger.unit_dispatch,'dispatched');
    assert.equal(unknownLedger.pool_state,'known');assert.equal(unknownLedger.pool_remaining,'0');
    assert.equal(unknownLedger.pool_outcome,'asr_pool_released');
    assert.deepEqual(await readBudget(admin,month),{
      limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'48000',spent_twd_micros:'48000',
    },'unknown dispatched usage holds its unit reservation and releases unused pool funds');
    const unknownState=await admin.query<{run_state:string;capture_state:string;error_code:string|null}>(`
      SELECT run.state AS run_state,capture.state AS capture_state,run.error_code
      FROM projed_core.meeting_analysis_runs run
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=run.capture_id WHERE run.id=$1::uuid
    `,[unknownFixture.runId]);
    assert.deepEqual(unknownState.rows[0],{
      run_state:'failed_terminal',capture_state:'failed_terminal',error_code:'ASR_USAGE_UNKNOWN',
    });

    const expiredFixture=await createSettlementFixture('expired-pending');
    const expiredToken=randomUUID();
    await verifyAsrSessionBinding(database,config,admin,owner,outsider,expiredFixture.recordId,
      expiredFixture.captureId,expiredFixture.runId,async(actor)=>{
        const expiredPrepared=record(await prepareSettlementFixture(expiredFixture,actor),'expired pending preparation');
        assert.equal(expiredPrepared.state,'queued');assert.equal(expiredPrepared.reservedTwdMicros,'96000');
        assert.ok(await claimSettlementUnit(expiredFixture,actor,expiredToken));
        const expiredLease=await admin.query<{id:string}>(`
          UPDATE projed_core.meeting_analysis_runs SET lease_expires_at=clock_timestamp()-interval '1 second'
          WHERE id=$1::uuid AND lease_token=$2::uuid AND state='running' RETURNING id::text
        `,[expiredFixture.runId,expiredToken]);
        assert.equal(expiredLease.rowCount,1,'only the synthetic pending unit lease is expired');
        const payload:JsonObject={kind:'not_sent',code:'ASR_LEASE_EXPIRED'};
        const receipt=record(await settleUnit(actor,expiredFixture.runId,expiredToken,payload),'expired pending settlement');
        assert.equal(receipt.kind,'not_sent');assert.equal(receipt.published,false);
        assert.equal(receipt.nextState,'queued');
        assert.equal(await countCheckpoints(expiredFixture.runId),0,'expired pending lease has no provider result');
      });
    const expiredState=await admin.query<{
      run_state:string;stage_cursor:unknown;attempt_count:number;lease_token:string|null;
    }>(`SELECT state AS run_state,stage_cursor,attempt_count,lease_token::text FROM projed_core.meeting_analysis_runs WHERE id=$1::uuid`,
    [expiredFixture.runId]);
    assert.equal(expiredState.rowCount,1);
    assert.equal(expiredState.rows[0]?.run_state,'queued');
    assert.equal(expiredState.rows[0]?.attempt_count,1);
    assert.equal(expiredState.rows[0]?.lease_token,null);
    assert.deepEqual(record(expiredState.rows[0]?.stage_cursor,'expired pending retry cursor'),
      {asr:{segmentIndex:0,chunkIndex:0,unitIndex:0,attempt:1}});
    const expiredLedger=await readUnitPool(expiredFixture.runId,expiredToken);
    assert.equal(expiredLedger.unit_state,'known');assert.equal(expiredLedger.unit_actual,'0');
    assert.equal(expiredLedger.unit_dispatch,'pending');assert.equal(expiredLedger.unit_outcome,'ASR_LEASE_EXPIRED');
    assert.equal(expiredLedger.pool_state,'reserved');assert.equal(expiredLedger.pool_remaining,'48000');
    assert.deepEqual(await readBudget(admin,month),{
      limit_twd_micros:DEFAULT_BUDGET_MICROS,reserved_twd_micros:'96000',spent_twd_micros:'48000',
    },'expired not-sent attempt releases the unit while leaving existing pool remainder reserved');
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
          await admin.query('DELETE FROM projed_core.meeting_asr_unit_results WHERE capture_id=ANY($1::uuid[])', [ownCaptures]);
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
        const remainingLedger=await admin.query<{usage_count:number;run_count:number}>(`
          SELECT (SELECT count(*)::integer FROM projed_core.meeting_ai_usage_attempts WHERE dispatch_month=$1::date) AS usage_count,
            (SELECT count(*)::integer FROM projed_core.meeting_analysis_runs WHERE budget_month=$1::date) AS run_count
        `, [ownedBudgetMonth]);
        assert.deepEqual(remainingLedger.rows[0],{usage_count:0,run_count:0},
          'refusing cleanup while any same-month usage or run remains');
        if (remaining.rowCount === 0) {
          // An earlier cleanup path already removed the helper-owned row.
        } else {
          assert.equal(remaining.rowCount, 1);
          const balance = remaining.rows[0];
          assert.ok(balance);
          const limit=BigInt(balance.limit_twd_micros),reserved=BigInt(balance.reserved_twd_micros),spent=BigInt(balance.spent_twd_micros);
          assert.ok(limit===BigInt(DEFAULT_BUDGET_MICROS)||limit===BigInt(PREEXHAUSTED_BUDGET_MICROS),
            'refusing to delete a budget row whose limit is outside this helper’s owned states');
          assert.ok(reserved>=0n&&spent>=0n&&reserved+spent<=limit,
            'refusing to delete an invalid current-month budget balance');
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
