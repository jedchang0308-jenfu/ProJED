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
import { createHttpDomainWriteAdapter } from '../../../src/services/httpApi/domainWriteAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpRecordActivityAdapter } from '../../../src/services/httpApi/recordActivityAdapter.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';
import type { TaskNode } from '../../../src/types/index.js';

type SessionLabel = 'qa-meeting-review-owner' | 'qa-meeting-review-reader' | 'qa-meeting-review-outsider';
type JsonObject = Record<string, unknown>;

interface ReviewSeedMatch {
  readonly taskId: string;
  readonly quoteRange: { readonly start: number; readonly end: number } | null;
  readonly semanticScore: number | null;
  readonly pointerFeature: number | null;
  readonly decision?: 'suggested' | 'accepted' | 'rejected';
  readonly decisionSource?: 'ai' | 'human';
}

interface ReviewSeedSegment {
  readonly id: string;
  readonly resolutionId?: string;
  readonly text: string;
  readonly matches?: readonly ReviewSeedMatch[];
}

interface SeededCapture {
  readonly captureId: string;
  readonly sourceVersion: number;
  readonly activeRevisionId: string | null;
  readonly activeRunId: string;
  readonly segments: readonly ReviewSeedSegment[];
}

interface RecordSnapshot {
  readonly id: string;
  readonly tenant_id: string;
  readonly project_id: string;
  readonly record_type: string;
  readonly title: string;
  readonly content: string;
  readonly occurred_at: string | null;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly recorded_by: string | null;
  readonly status: string;
  readonly visibility: string;
  readonly rag_enabled: boolean;
  readonly source_document_id: string | null;
  readonly metadata: unknown;
  readonly created_by: string | null;
  readonly updated_by: string | null;
  readonly updated_at: string;
}

interface RagSnapshot {
  readonly document_count: string;
  readonly version_count: string;
  readonly chunk_count: string;
  readonly job_count: string;
  readonly document_id: string | null;
  readonly version_id: string | null;
  readonly version_content: string | null;
  readonly version_hash: string | null;
  readonly document_hash: string | null;
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

async function expectHttpError(promise: Promise<unknown>, code: string, status: number): Promise<HttpApiError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof HttpApiError, `expected ${code} HTTP error`);
  assert.equal(caught.code, code);
  assert.equal(caught.status, status);
  return caught;
}

function adminUrlFor(config: RuntimeConfig): URL {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!raw) throw new Error('MEETING_REVIEW_ADMIN_FIXTURE_UNAVAILABLE');
  if (config.env !== 'disposable' || config.profile.environment !== 'disposable') {
    throw new Error('MEETING_REVIEW_ADMIN_REQUIRES_DISPOSABLE_PROFILE');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('MEETING_REVIEW_ADMIN_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port) !== config.binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== config.binding.databaseName
      || !/^dev139_s3_[0-9a-f]{32}$/u.test(config.binding.databaseName)
      || decodeURIComponent(url.username) !== 'postgres'
      || !url.password
      || url.search !== ''
      || url.hash !== '') {
    throw new Error('MEETING_REVIEW_ADMIN_BINDING_MISMATCH');
  }
  return url;
}

function taskInput(workspaceId: string, boardId: string, title: string, nodeType: 'task' | 'group' = 'task', archived = false): TaskNode {
  return {
    id: `qa-meeting-review-${randomUUID()}`,
    workspaceId,
    boardId,
    parentId: null,
    title,
    detailNotes: [],
    status: 'todo',
    order: 0,
    nodeType,
    isArchived: archived,
  };
}

async function seedCapture(
  admin: pg.Client,
  scope: { readonly tenantId: string; readonly projectId: string },
  recordId: string,
  createdBy: string,
  input: {
    readonly captureId: string;
    readonly sourceVersion: number;
    readonly segments: readonly ReviewSeedSegment[];
    readonly includeHistory: boolean;
    readonly state?: 'ready' | 'failed_retryable';
    readonly sourceCompleteness?: 'complete' | 'partial';
    readonly activeTranscriptRevisionId?: string | null;
    readonly runState?: 'ready' | 'failed_retryable';
  },
): Promise<SeededCapture> {
  const activeRevisionId = input.activeTranscriptRevisionId === undefined
    ? randomUUID() : input.activeTranscriptRevisionId;
  const currentTranscriptRevisionId = activeRevisionId ?? randomUUID();
  const activeRunId = randomUUID();
  const historyRevisionId = randomUUID();
  const historyRunId = randomUUID();
  const seeded: SeededCapture = {
    captureId: input.captureId,
    sourceVersion: input.sourceVersion,
    activeRevisionId,
    activeRunId,
    segments: input.segments,
  };
  await admin.query('BEGIN');
  let committed = false;
  try {
    await admin.query(`
      INSERT INTO projed_core.meeting_capture_sessions
        (id,tenant_id,project_id,record_id,created_by,idempotency_key,state,source_version,
         source_completeness,review_revision,active_transcript_revision_id,audio_manifest_hash,
         pointer_manifest_hash,source_frozen_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9,0,$10::uuid,$11,$12,now())
    `, [input.captureId, scope.tenantId, scope.projectId, recordId, createdBy,
      `qa-review-capture-${input.captureId}`, input.state ?? 'ready', input.sourceVersion,
      input.sourceCompleteness ?? 'complete', activeRevisionId,
      createHash('sha256').update(`audio:${input.captureId}`).digest('hex'),
      createHash('sha256').update(`pointer:${input.captureId}`).digest('hex')]);

    const insertRun = async (id: string, version: number, revisionId: string, label: string) => {
      await admin.query(`
        INSERT INTO projed_core.meeting_analysis_runs
      (id,capture_id,source_version,request_key,transcript_revision_id,config_version,state,
           resume_stage,upload_completed_at,deadline_at,provider_mode)
        VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,'qa-meeting-review-v1',$6,'complete',now(),now()+interval '1 day','fake')
      `, [id, input.captureId, version, `qa-${label}-${input.captureId}`, revisionId,
        label === 'active' ? input.runState ?? 'ready' : 'ready']);
    };
    const insertTranscript = async (
      id: string, revisionId: string, runId: string, segmentIndex: number, text: string,
    ) => {
      await admin.query(`
        INSERT INTO projed_core.meeting_transcript_segments
          (id,capture_id,transcript_revision_id,producer_run_id,segment_index,start_offset_ms,end_offset_ms,
           raw_text,normalized_text,source_hash)
        VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$8,$9)
      `, [id, input.captureId, revisionId, runId, segmentIndex, segmentIndex * 100,
        segmentIndex * 100 + 80, text, createHash('sha256').update(text).digest('hex')]);
    };
    const insertResolution = async (
      segment: ReviewSeedSegment, transcriptSegmentId: string, runId: string, history = false,
    ) => {
      if (!segment.resolutionId) return;
      await admin.query(`
        INSERT INTO projed_core.meeting_segment_resolutions
          (id,capture_id,transcript_segment_id,candidate_snapshot,latest_run_id,resolution_state,
           revision,human_reviewed,human_empty_decision,config_version)
        VALUES($1::uuid,$2::uuid,$3::uuid,'[]'::jsonb,$4::uuid,'pending',0,false,false,$5)
      `, [segment.resolutionId, input.captureId, transcriptSegmentId, runId,
        history ? 'qa-historical-review-v1' : 'qa-current-review-v1']);
      for (const candidate of segment.matches ?? []) {
        const candidateId = randomUUID();
        await admin.query(`
          INSERT INTO projed_core.meeting_task_match_results
            (id,resolution_id,task_id,quote_range,semantic_score,pointer_feature,ai_suggestion_version,
             decision,decision_source,capture_id,tenant_id,project_id)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::numeric,$6::numeric,'qa-meeting-candidate-v1',
            $10,$11,$7::uuid,$8::uuid,$9::uuid)
        `, [candidateId, segment.resolutionId, candidate.taskId,
          candidate.quoteRange === null ? null : JSON.stringify(candidate.quoteRange), candidate.semanticScore,
          candidate.pointerFeature, input.captureId, scope.tenantId, scope.projectId,
          candidate.decision ?? 'suggested', candidate.decisionSource ?? 'ai']);
      }
    };

    await insertRun(activeRunId, input.sourceVersion, currentTranscriptRevisionId, 'active');
    for (let index = 0; index < input.segments.length; index += 1) {
      const segment = input.segments[index]!;
      await insertTranscript(segment.id, currentTranscriptRevisionId, activeRunId, index, segment.text);
      await insertResolution(segment, segment.id, activeRunId);
    }

    if (input.includeHistory) {
      await insertRun(historyRunId, input.sourceVersion - 1, historyRevisionId, 'history');
      const historicalSegmentId = randomUUID();
      const historicalSegment: ReviewSeedSegment = {
        id: historicalSegmentId,
        resolutionId: randomUUID(),
        text: `historical-only-${input.captureId}`,
        matches: [],
      };
      await insertTranscript(historicalSegmentId, historyRevisionId, historyRunId, 0, historicalSegment.text);
      await insertResolution(historicalSegment, historicalSegmentId, historyRunId, true);
    }
    await admin.query('COMMIT');
    committed = true;
  } finally {
    if (!committed) await admin.query('ROLLBACK');
  }
  return seeded;
}

async function recordSnapshot(admin: pg.Client, recordId: string): Promise<RecordSnapshot> {
  const result = await admin.query<RecordSnapshot>(`
    SELECT id::text,tenant_id::text,project_id::text,record_type,title,content,occurred_at::text,
      started_at::text,ended_at::text,recorded_by::text,status,visibility,rag_enabled,
      source_document_id::text,metadata,created_by::text,updated_by::text,
      to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM projed_core.knowledge_records WHERE id=$1::uuid
  `, [recordId]);
  assert.equal(result.rowCount, 1, 'the synthetic meeting record must exist');
  const row = result.rows[0];
  assert.ok(row);
  return row;
}

async function recordLinks(admin: pg.Client, recordId: string): Promise<Array<{ legacy_task_id: string; role: string }>> {
  const result = await admin.query<{ legacy_task_id: string; role: string }>(`
    SELECT task.legacy_task_id,link.role FROM projed_core.record_task_links link
    JOIN projed_core.wbs_items task ON task.id=link.item_id AND task.tenant_id=link.tenant_id AND task.project_id=link.project_id
    WHERE link.record_id=$1::uuid ORDER BY task.legacy_task_id,link.role
  `, [recordId]);
  return result.rows;
}

async function ragSnapshot(admin: pg.Client, recordId: string): Promise<RagSnapshot> {
  const result = await admin.query<RagSnapshot>(`
    WITH source_document AS (
      SELECT id,content_hash FROM projed_core.documents
       WHERE source_table='knowledge_records' AND source_id=$1::uuid
    ), current_version AS (
      SELECT version.id,version.document_id,version.content,version.content_hash
        FROM projed_core.document_versions version JOIN source_document document ON document.id=version.document_id
       ORDER BY version.version DESC LIMIT 1
    )
    SELECT (SELECT count(*)::text FROM source_document) AS document_count,
      (SELECT count(*)::text FROM projed_core.document_versions version JOIN source_document document ON document.id=version.document_id) AS version_count,
      (SELECT count(*)::text FROM projed_core.document_chunks chunk JOIN source_document document ON document.id=chunk.document_id) AS chunk_count,
      (SELECT count(*)::text FROM projed_core.rag_sync_jobs job JOIN source_document document ON document.id=job.source_document_id) AS job_count,
      (SELECT id::text FROM source_document LIMIT 1) AS document_id,
      (SELECT id::text FROM current_version LIMIT 1) AS version_id,
      (SELECT content FROM current_version LIMIT 1) AS version_content,
      (SELECT content_hash FROM current_version LIMIT 1) AS version_hash,
      (SELECT content_hash FROM source_document LIMIT 1) AS document_hash
  `, [recordId]);
  const row = result.rows[0];
  assert.ok(row);
  return row;
}

async function resourceRevision(admin: pg.Client, tenantId: string, projectId: string): Promise<bigint> {
  const result = await admin.query<{ revision: string }>(`
    SELECT revision::text FROM projed_core.resource_revisions
     WHERE tenant_id=$1::uuid AND project_id=$2::uuid
  `, [tenantId, projectId]);
  if (result.rowCount === 0) return 0n;
  assert.equal(result.rowCount, 1);
  return BigInt(result.rows[0]!.revision);
}

async function projectionSnapshot(admin: pg.Client, recordId: string): Promise<unknown> {
  const result = await admin.query(`
    SELECT record_id::text,capture_id::text,applied_review_revision::text,last_request_key,payload_hash,
      manual_link_set,auto_link_set,record_version::text,updated_at::text
    FROM projed_core.meeting_draft_projections WHERE record_id=$1::uuid
  `, [recordId]);
  return result.rows[0] ?? null;
}

async function internalTaskId(admin: pg.Client, tenantId: string, projectId: string, legacyTaskId: string): Promise<string> {
  const result = await admin.query<{ id: string }>(`
    SELECT id::text FROM projed_core.wbs_items
     WHERE tenant_id=$1::uuid AND project_id=$2::uuid AND legacy_task_id=$3
  `, [tenantId, projectId, legacyTaskId]);
  assert.equal(result.rowCount, 1, 'the task must resolve inside its own board');
  return result.rows[0]!.id;
}

async function review(client: HttpApiClient, captureId: string, sourceVersion: number): Promise<JsonObject> {
  return responseData(await client.request('/api/v1/meeting-control', {
    method: 'POST', body: { operation: 'review', captureId, expectedSourceVersion: sourceVersion },
  }), 'meeting review');
}

function decisionBody(
  captureId: string, sourceVersion: number, resolutionId: string, expectedResolutionRevision: number,
  operations: readonly JsonObject[],
): JsonObject {
  return { operation: 'decide-match', captureId, expectedSourceVersion: sourceVersion,
    resolutionId, expectedResolutionRevision, operations };
}

function projectionBody(
  recordId: string, captureId: string, sourceVersion: number, recordUpdatedAt: string,
  reviewRevision: number, requestKey: string, userDraft: JsonObject,
  taskLinks: readonly JsonObject[],
): JsonObject {
  return { operation: 'save-projection', recordId, captureId, expectedSourceVersion: sourceVersion,
    expectedRecordUpdatedAt: recordUpdatedAt, expectedReviewRevision: reviewRevision,
    requestKey, userDraft, taskLinks };
}

async function setDeferredProjectionFailure(
  admin: pg.Client, recordId: string,
): Promise<{ readonly triggerName: string; readonly functionName: string }> {
  const suffix = randomUUID().replaceAll('-', '');
  const triggerName = `qa_meeting_projection_commit_${suffix}`;
  const functionName = `qa_meeting_projection_fail_${suffix}`;
  await admin.query(`CREATE FUNCTION projed_core.${functionName}() RETURNS trigger
    LANGUAGE plpgsql AS $qa$
    BEGIN
      IF NEW.record_id='${recordId}'::uuid THEN
        RAISE EXCEPTION 'qa deferred meeting projection rollback' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END
    $qa$`);
  try {
    await admin.query(`CREATE CONSTRAINT TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE ON projed_core.meeting_draft_projections
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION projed_core.${functionName}()`);
  } catch (error) {
    await admin.query(`DROP FUNCTION IF EXISTS projed_core.${functionName}()`);
    throw error;
  }
  return { triggerName, functionName };
}

async function dropDeferredProjectionFailure(
  admin: pg.Client, fixture: { readonly triggerName: string; readonly functionName: string } | null,
): Promise<void> {
  if (!fixture) return;
  await admin.query(`DROP TRIGGER IF EXISTS ${fixture.triggerName} ON projed_core.meeting_draft_projections`);
  await admin.query(`DROP FUNCTION IF EXISTS projed_core.${fixture.functionName}()`);
}

/** Local native HTTP/PostgreSQL check for the current human meeting review and projection path. */
export async function verifyMeetingReviewPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  reader: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  if ([owner, reader, outsider].some(actor => actor.entry !== 'main')) {
    throw new Error('MEETING_REVIEW_FIXTURE_REQUIRES_MAIN_ENTRY_ACTORS');
  }
  const expected = migrationSet(config);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const adminUrl = adminUrlFor(config);
  const admin = new pg.Client({ connectionString: adminUrl.toString(), application_name: 'projed-dev139-meeting-review-qa' });
  const httpDatabase = new RuntimeDatabase(httpConfig);
  const actors: Readonly<Record<SessionLabel, ServerActorV1>> = {
    'qa-meeting-review-owner': owner,
    'qa-meeting-review-reader': reader,
    'qa-meeting-review-outsider': outsider,
  };
  const workspaceIds: string[] = [];
  const cleanupErrors: unknown[] = [];
  let serverStarted = false;
  let adminConnected = false;
  let base = '';
  let injectedTrigger: { readonly triggerName: string; readonly functionName: string } | null = null;
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
  const fetchFor = (session: SessionLabel): HttpApiFetch => async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('cookie', session);
    headers.set('origin', base);
    return fetch(new URL(String(input), base), { ...init, headers });
  };
  const clientFor = (session: SessionLabel, actor: ServerActorV1): HttpApiClient => {
    const client = new HttpApiClient(fetchFor(session));
    client.bindExpectedActor({ accountId: actor.localUserId, contextId: actor.contextId });
    return client;
  };
  const ownerClient = clientFor('qa-meeting-review-owner', owner);
  const ownerCollaboration = createHttpCollaborationAdapter(ownerClient);
  const ownerWrite = createHttpDomainWriteAdapter(ownerClient);
  const ownerRecords = createHttpRecordActivityAdapter(ownerClient);
  const readerClient = clientFor('qa-meeting-review-reader', reader);
  const readerCollaboration = createHttpCollaborationAdapter(readerClient);
  const readerSession = createHttpSessionAdapter(new HttpApiClient(fetchFor('qa-meeting-review-reader')));
  const outsiderClient = clientFor('qa-meeting-review-outsider', outsider);

  const cleanup = async () => {
    try { await dropDeferredProjectionFailure(admin, injectedTrigger); }
    catch (error) { cleanupErrors.push(error); }
    for (const workspaceId of [...workspaceIds].reverse()) {
      try { await ownerCollaboration.deleteWorkspace(workspaceId); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (adminConnected && workspaceIds.length > 0) {
      try {
        // These workspace ids were returned by this helper's own create calls.
        await admin.query('DELETE FROM projed_core.tenants WHERE id=ANY($1::uuid[])', [workspaceIds]);
      } catch (error) { cleanupErrors.push(error); }
    }
    try {
      if (serverStarted) await server.shutdown();
      else await httpDatabase.end();
    } catch (error) { cleanupErrors.push(error); }
    if (adminConnected) {
      try { await admin.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
  };

  try {
    await admin.connect();
    adminConnected = true;
    const address = await server.listen();
    serverStarted = true;
    base = `http://${address.host}:${address.port}`;

    const readerProfile = await readerSession.getSession();
    assert.equal(readerProfile.uid, reader.localUserId);
    assert.ok(readerProfile.email, 'the invited reader must have a profile email');

    const workspace = await ownerCollaboration.createWorkspace(`DEV-139 review ${randomUUID()}`);
    workspaceIds.push(workspace.id);
    const board = await ownerCollaboration.createBoard(workspace.id, 'Meeting review fixture');
    const secondBoard = await ownerCollaboration.createBoard(workspace.id, 'Meeting review cross-board fixture');
    const tenantScope = await runActorTransaction(database, config, owner, async port => {
      const resolved = await resolveBoard(port, workspace.id, board.id);
      return { tenantId: resolved.tenantId, projectId: resolved.id };
    });
    const secondBoardScope = await runActorTransaction(database, config, owner, async port => {
      const resolved = await resolveBoard(port, workspace.id, secondBoard.id);
      return { tenantId: resolved.tenantId, projectId: resolved.id };
    });

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

    const makeTask = async (targetBoardId: string, title: string, nodeType: 'task' | 'group' = 'task', archived = false) => {
      const created = await ownerWrite.createTask(workspace.id, targetBoardId,
        taskInput(workspace.id, targetBoardId, title, nodeType, archived));
      const scope = targetBoardId === board.id ? tenantScope : secondBoardScope;
      const internalId = await internalTaskId(admin, scope.tenantId, scope.projectId, created.id);
      return { id: created.id, internalId };
    };
    const semanticTask = await makeTask(board.id, 'Semantic candidate');
    const rejectedTask = await makeTask(board.id, 'Rejected candidate');
    const pointerTask = await makeTask(board.id, 'Pointer candidate');
    const oldReplacementTask = await makeTask(board.id, 'Old replacement candidate');
    const replacementTask = await makeTask(board.id, 'New replacement candidate');
    const concurrentTaskA = await makeTask(board.id, 'Concurrent candidate A');
    const concurrentTaskB = await makeTask(board.id, 'Concurrent candidate B');
    const manualTask = await makeTask(board.id, 'Manual record link');
    const groupTask = await makeTask(board.id, 'Group cannot be linked', 'group');
    const archivedTask = await makeTask(board.id, 'Archived task cannot be linked', 'task', true);
    const crossBoardTask = await makeTask(secondBoard.id, 'Cross-board task');

    const projectRecord = await ownerRecords.upsertRecord(workspace.id, board.id, {
      type: 'meeting', title: 'Human review source', content: 'Original draft content', status: 'draft',
      visibility: 'project', occurredAt: Date.now(), metadata: { original: 'keep-unrelated' },
      taskLinks: [{ nodeId: manualTask.id, role: 'blocker' }],
    });
    const privateRecord = await ownerRecords.upsertRecord(workspace.id, board.id, {
      type: 'meeting', title: 'Private review source', content: 'Private source content', status: 'draft',
      visibility: 'private', occurredAt: Date.now(), metadata: {}, taskLinks: [],
    });
    const failedProjectionRecord = await ownerRecords.upsertRecord(workspace.id, board.id, {
      type: 'meeting', title: 'Projection rollback source', content: 'Rollback original content', status: 'draft',
      visibility: 'project', occurredAt: Date.now(), metadata: { rollback: true },
      taskLinks: [{ nodeId: manualTask.id, role: 'decision' }],
    });
    const partialTranscriptRecord = await ownerRecords.upsertRecord(workspace.id, board.id, {
      type: 'meeting', title: 'Partial transcript source', content: 'Keep this human draft only', status: 'draft',
      visibility: 'project', occurredAt: Date.now(), metadata: { partial: true },
      taskLinks: [{ nodeId: manualTask.id, role: 'follow_up' }],
    });

    const resolutionIds = {
      semantic: randomUUID(), pointer: randomUUID(), replace: randomUUID(), clear: randomUUID(),
      concurrent: randomUUID(), rollback: randomUUID(),
    };
    const projectCaptureId = randomUUID();
    const reviewSegments: ReviewSeedSegment[] = [
      { id: randomUUID(), resolutionId: resolutionIds.semantic, text: 'current semantic review segment', matches: [
        { taskId: semanticTask.internalId, quoteRange: { start: 0, end: 12 }, semanticScore: 0.91, pointerFeature: 0 },
        { taskId: rejectedTask.internalId, quoteRange: { start: 12, end: 24 }, semanticScore: 0.81, pointerFeature: 0 },
        { taskId: pointerTask.internalId, quoteRange: null, semanticScore: 0, pointerFeature: 0.9 },
      ] },
      { id: randomUUID(), resolutionId: resolutionIds.pointer, text: 'current pointer-only review segment', matches: [
        { taskId: pointerTask.internalId, quoteRange: null, semanticScore: 0, pointerFeature: 0.9 },
      ] },
      { id: randomUUID(), resolutionId: resolutionIds.replace, text: 'current replacement review segment', matches: [
        { taskId: oldReplacementTask.internalId, quoteRange: { start: 0, end: 8 }, semanticScore: 0.72, pointerFeature: 0 },
      ] },
      { id: randomUUID(), resolutionId: resolutionIds.clear, text: 'current clear-all review segment', matches: [
        { taskId: rejectedTask.internalId, quoteRange: { start: 1, end: 7 }, semanticScore: 0.55, pointerFeature: 0 },
      ] },
      { id: randomUUID(), resolutionId: resolutionIds.concurrent, text: 'current CAS review segment', matches: [
        { taskId: concurrentTaskA.internalId, quoteRange: { start: 0, end: 6 }, semanticScore: 0.62, pointerFeature: 0 },
        { taskId: concurrentTaskB.internalId, quoteRange: { start: 6, end: 12 }, semanticScore: 0.61, pointerFeature: 0 },
      ] },
      { id: randomUUID(), resolutionId: resolutionIds.rollback, text: 'current rollback review segment', matches: [
        { taskId: semanticTask.internalId, quoteRange: { start: 0, end: 10 }, semanticScore: 0.7, pointerFeature: 0 },
      ] },
    ];
    const projectCapture = await seedCapture(admin, tenantScope, projectRecord.id, owner.localUserId,
      { captureId: projectCaptureId, sourceVersion: 2, segments: reviewSegments, includeHistory: true });

    const privateCaptureId = randomUUID();
    await seedCapture(admin, tenantScope, privateRecord.id, owner.localUserId, {
      captureId: privateCaptureId, sourceVersion: 2,
      segments: [{ id: randomUUID(), text: `private-current-${privateCaptureId}` }], includeHistory: false,
    });

    const rollbackCaptureId = randomUUID();
    const rollbackCapture = await seedCapture(admin, tenantScope, failedProjectionRecord.id, owner.localUserId, {
      captureId: rollbackCaptureId, sourceVersion: 2,
      segments: [{ id: randomUUID(), text: `rollback-current-${rollbackCaptureId}` }], includeHistory: false,
    });
    const partialResolutionId = randomUUID();
    const partialCaptureId = randomUUID();
    const partialCapture = await seedCapture(admin, tenantScope, partialTranscriptRecord.id, owner.localUserId, {
      captureId: partialCaptureId,
      sourceVersion: 2,
      state: 'failed_retryable',
      sourceCompleteness: 'partial',
      activeTranscriptRevisionId: null,
      runState: 'failed_retryable',
      includeHistory: false,
      segments: [{
        id: randomUUID(), resolutionId: partialResolutionId, text: `partial-unpublished-${partialCaptureId}`,
        matches: [{ taskId: semanticTask.internalId, quoteRange: { start: 0, end: 8 }, semanticScore: 0.88,
          pointerFeature: 0, decision: 'accepted', decisionSource: 'ai' }],
      }],
    });

    const privateOwnerView = await review(ownerClient, privateCaptureId, 2);
    assert.equal(privateOwnerView.recordId, privateRecord.id);
    assert.equal(Array.isArray(privateOwnerView.segments), true);
    await expectHttpError(review(readerClient, privateCaptureId, 2).then(value => value), 'RESOURCE_NOT_FOUND', 404);
    await expectHttpError(review(outsiderClient, privateCaptureId, 2).then(value => value), 'RESOURCE_NOT_FOUND', 404);

    const partialView = await review(ownerClient, partialCapture.captureId, 2);
    assert.equal(partialView.sourceVersion, 2);
    assert.equal(partialView.reviewRevision, 0);
    assert.deepEqual(partialView.segments, [],
      'same-source-version failed_retryable transcript stays stored but is not current when active revision is NULL');
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: decisionBody(partialCapture.captureId, 2, partialResolutionId, 0,
        [{ action: 'accept', taskId: semanticTask.id }]),
    }), 'RESOURCE_NOT_FOUND', 404);
    const partialReviewRevision = Number(partialView.reviewRevision);
    const partialProjection = projectionBody(partialTranscriptRecord.id, partialCapture.captureId, 2,
      String(partialView.recordUpdatedAt), partialReviewRevision, `qa-review-partial-${randomUUID()}`,
      { title: 'Keep partial transcript as a human draft', content: 'No generated transcript was merged.',
        status: 'draft', metadata: { partial: true, userKeptDraft: true } },
      [{ nodeId: manualTask.id, role: 'follow_up' }]);
    const partialSaved = responseData(await ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: partialProjection,
    }), 'partial transcript draft projection');
    assert.equal(partialSaved.idempotent, false);
    assert.equal(record(partialSaved.savedRecord, 'partial saved record').status, 'draft');
    const partialLinks = await recordLinks(admin, partialTranscriptRecord.id);
    assert.deepEqual(partialLinks, [{ legacy_task_id: manualTask.id, role: 'follow_up' }],
      'projection keeps the manual link and does not import accepted links from an inactive partial transcript');
    assert.equal((await recordSnapshot(admin, partialTranscriptRecord.id)).rag_enabled, false);

    const initialView = await review(ownerClient, projectCapture.captureId, projectCapture.sourceVersion);
    assert.equal(initialView.captureId, projectCapture.captureId);
    assert.equal(initialView.recordId, projectRecord.id);
    assert.equal(initialView.sourceVersion, 2);
    assert.equal(initialView.reviewRevision, 0);
    assert.equal(typeof initialView.recordUpdatedAt, 'string');
    assert.match(String(initialView.recordUpdatedAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
    const currentSegments = initialView.segments;
    assert.ok(Array.isArray(currentSegments));
    assert.equal(currentSegments.length, reviewSegments.length, 'review exposes only active current-source transcript segments');
    const returnedSegmentIds = currentSegments.map(item => String(record(item, 'review segment').segmentId));
    assert.deepEqual(new Set(returnedSegmentIds), new Set(reviewSegments.map(segment => segment.id)));
    assert.equal(currentSegments.some(item => String(record(item, 'review segment').text).startsWith('historical-only-')), false,
      'historical transcript rows remain stored but are not mixed into current review');
    const semanticReviewSegment = currentSegments.find(item => record(item, 'review segment').resolutionId === resolutionIds.semantic);
    assert.ok(semanticReviewSegment);
    const semanticCandidates = record(semanticReviewSegment, 'semantic segment').candidates;
    assert.ok(Array.isArray(semanticCandidates));
    assert.ok(semanticCandidates.some(candidate => record(candidate, 'candidate').source === 'pointer'));
    await expectHttpError(review(ownerClient, projectCapture.captureId, 1).then(value => value), 'REVISION_CONFLICT', 409);

    let successfulDecisionCount = 0;
    const decide = async (resolutionId: string, revision: number, operations: readonly JsonObject[]) => {
      const result = responseData(await ownerClient.request('/api/v1/meeting-control', {
        method: 'POST', body: decisionBody(projectCapture.captureId, 2, resolutionId, revision, operations),
      }), 'meeting decision');
      successfulDecisionCount += 1;
      assert.equal(result.reviewRevision, successfulDecisionCount,
        'each committed decision request increments the capture review revision exactly once');
      return result;
    };

    const beforePointerDeny = await review(ownerClient, projectCapture.captureId, 2);
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: decisionBody(projectCapture.captureId, 2, resolutionIds.semantic, 0,
        [{ action: 'accept', taskId: pointerTask.id }]),
    }), 'REVISION_CONFLICT', 409);
    assert.equal((await review(ownerClient, projectCapture.captureId, 2)).reviewRevision, beforePointerDeny.reviewRevision,
      'pointer-only acceptance denial changes no revisions');

    const semanticDecision = await decide(resolutionIds.semantic, 0, [
      { action: 'accept', taskId: semanticTask.id },
      { action: 'reject', taskId: rejectedTask.id },
    ]);
    assert.equal(semanticDecision.state, 'accepted');
    await decide(resolutionIds.semantic, 1, [{ action: 'add', taskId: pointerTask.id }]);
    await decide(resolutionIds.replace, 0, [{ action: 'replace', taskId: replacementTask.id }]);
    const clearDecision = await decide(resolutionIds.clear, 0, [{ action: 'clear-all' }]);
    assert.equal(clearDecision.state, 'rejected');

    const beforeRollbackView = await review(ownerClient, projectCapture.captureId, 2);
    const rollbackResolutionBefore = await admin.query<{ revision: string; decision: string; count: string }>(`
      SELECT resolution.revision::text,match.decision,count(match.id)::text AS count
      FROM projed_core.meeting_segment_resolutions resolution
      LEFT JOIN projed_core.meeting_task_match_results match ON match.resolution_id=resolution.id
      WHERE resolution.id=$1::uuid GROUP BY resolution.revision,match.decision
    `, [resolutionIds.rollback]);
    assert.equal(rollbackResolutionBefore.rowCount, 1);
    assert.equal(rollbackResolutionBefore.rows[0]!.revision, '0');
    assert.equal(rollbackResolutionBefore.rows[0]!.decision, 'suggested');
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: decisionBody(projectCapture.captureId, 2, resolutionIds.rollback, 0, [
        { action: 'add', taskId: semanticTask.id }, { action: 'add', taskId: groupTask.id },
      ]),
    }), 'REVISION_CONFLICT', 409);
    assert.equal((await review(ownerClient, projectCapture.captureId, 2)).reviewRevision, beforeRollbackView.reviewRevision,
      'valid operation followed by invalid operation rolls the whole decision back');
    const rollbackResolutionAfter = await admin.query<{ revision: string; decision: string; count: string }>(`
      SELECT resolution.revision::text,match.decision,count(match.id)::text AS count
      FROM projed_core.meeting_segment_resolutions resolution
      LEFT JOIN projed_core.meeting_task_match_results match ON match.resolution_id=resolution.id
      WHERE resolution.id=$1::uuid GROUP BY resolution.revision,match.decision
    `, [resolutionIds.rollback]);
    assert.deepEqual(rollbackResolutionAfter.rows, rollbackResolutionBefore.rows);

    for (const [label, taskId] of [['group', groupTask.id], ['archived', archivedTask.id], ['cross-board', crossBoardTask.id]] as const) {
      await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
        method: 'POST', body: decisionBody(projectCapture.captureId, 2, resolutionIds.rollback, 0,
          [{ action: 'add', taskId }]),
      }), 'REVISION_CONFLICT', 409);
      assert.equal((await review(ownerClient, projectCapture.captureId, 2)).reviewRevision, beforeRollbackView.reviewRevision,
        `${label} task references must not mutate the capture`);
    }

    const concurrentBodies = [
      decisionBody(projectCapture.captureId, 2, resolutionIds.concurrent, 0, [{ action: 'add', taskId: concurrentTaskA.id }]),
      decisionBody(projectCapture.captureId, 2, resolutionIds.concurrent, 0, [{ action: 'add', taskId: concurrentTaskB.id }]),
    ];
    const concurrentResults = await Promise.allSettled(concurrentBodies.map(body => ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body,
    })));
    const concurrentSuccesses = concurrentResults.filter(result => result.status === 'fulfilled');
    const concurrentFailures = concurrentResults.filter(result => result.status === 'rejected');
    assert.equal(concurrentSuccesses.length, 1, 'same-revision concurrent decisions must have one winner');
    assert.equal(concurrentFailures.length, 1, 'same-revision concurrent decisions must reject the stale writer');
    const concurrentError = (concurrentFailures[0] as PromiseRejectedResult).reason;
    assert.ok(concurrentError instanceof HttpApiError);
    assert.equal(concurrentError.code, 'REVISION_CONFLICT');
    assert.equal(concurrentError.status, 409);
    successfulDecisionCount += 1;
    const concurrentData = responseData((concurrentSuccesses[0] as PromiseFulfilledResult<unknown>).value, 'concurrent meeting decision');
    assert.equal(concurrentData.reviewRevision, successfulDecisionCount);
    const finalReview = await review(ownerClient, projectCapture.captureId, 2);
    assert.equal(finalReview.reviewRevision, successfulDecisionCount);

    const semanticRows = await admin.query<{ task_id: string; decision: string }>(`
      SELECT task_id::text,decision FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid
    `, [resolutionIds.semantic]);
    assert.equal(semanticRows.rows.find(row => row.task_id === semanticTask.internalId)?.decision, 'accepted');
    assert.equal(semanticRows.rows.find(row => row.task_id === rejectedTask.internalId)?.decision, 'rejected');
    assert.equal(semanticRows.rows.find(row => row.task_id === pointerTask.internalId)?.decision, 'accepted',
      'an explicit human add can accept a pointer-only suggestion');
    const replaceRows = await admin.query<{ task_id: string; decision: string }>(`
      SELECT task_id::text,decision FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid
    `, [resolutionIds.replace]);
    assert.deepEqual(replaceRows.rows, [{ task_id: replacementTask.internalId, decision: 'accepted' }]);
    const clearedRows = await admin.query('SELECT 1 FROM projed_core.meeting_task_match_results WHERE resolution_id=$1::uuid',
      [resolutionIds.clear]);
    assert.equal(clearedRows.rowCount, 0);
    const concurrentRows = await admin.query<{ decision: string; count: string }>(`
      SELECT decision,count(*)::text AS count FROM projed_core.meeting_task_match_results
       WHERE resolution_id=$1::uuid GROUP BY decision
    `, [resolutionIds.concurrent]);
    assert.equal(concurrentRows.rowCount, 2, 'the untouched candidate remains suggested');
    assert.deepEqual(new Map(concurrentRows.rows.map(row => [row.decision, row.count])),
      new Map([['accepted', '1'], ['suggested', '1']]),
      'only the winning CAS changes its candidate; the stale request cannot accept the other one');
    const concurrentRevision = await admin.query<{ revision: string }>(
      'SELECT revision::text FROM projed_core.meeting_segment_resolutions WHERE id=$1::uuid', [resolutionIds.concurrent]);
    assert.equal(concurrentRevision.rows[0]?.revision, '1');

    const initialRecord = await recordSnapshot(admin, projectRecord.id);
    assert.equal(initialRecord.status, 'draft');
    assert.equal(initialRecord.visibility, 'project');
    const initialLinks = await recordLinks(admin, projectRecord.id);
    assert.deepEqual(initialLinks, [{ legacy_task_id: manualTask.id, role: 'blocker' }]);
    const initialRag = await ragSnapshot(admin, projectRecord.id);
    assert.equal(initialRag.document_count, '0');
    const initialProjectRevision = await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId);
    const savedTitle = 'Reviewed meeting title';
    const savedContent = 'Human approved record content for the RAG mirror.';
    const savedMetadata = {
      userAnnotation: 'preserve manual review note',
      meetingTaskResolution: { manualLinkSet: [manualTask.id], autoLinkSet: ['current accepted suggestions'] },
    };
    const projection = projectionBody(projectRecord.id, projectCapture.captureId, 2,
      String(finalReview.recordUpdatedAt), Number(finalReview.reviewRevision), `qa-review-project-${randomUUID()}`,
      { title: savedTitle, content: savedContent, status: 'published', metadata: savedMetadata },
      [{ nodeId: manualTask.id, role: 'blocker' }]);

    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: { ...projection, expectedRecordUpdatedAt: '2001-01-01T00:00:00.000000Z', requestKey: `qa-review-stale-time-${randomUUID()}` },
    }), 'REVISION_CONFLICT', 409);
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: { ...projection, expectedReviewRevision: Number(finalReview.reviewRevision) - 1,
        requestKey: `qa-review-stale-revision-${randomUUID()}` },
    }), 'REVISION_CONFLICT', 409);
    assert.equal(await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId), initialProjectRevision,
      'failed projection CAS must not bump project resource revision');

    const projected = responseData(await ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: projection,
    }), 'meeting save projection');
    assert.equal(projected.idempotent, false);
    const savedRecord = record(projected.savedRecord, 'saved record');
    assert.equal(savedRecord.id, projectRecord.id);
    assert.equal(savedRecord.title, savedTitle);
    assert.equal(savedRecord.content, savedContent);
    assert.equal(savedRecord.status, 'published');
    assert.deepEqual(savedRecord.metadata, savedMetadata);
    const savedSnapshot = await recordSnapshot(admin, projectRecord.id);
    assert.equal(savedSnapshot.title, savedTitle);
    assert.equal(savedSnapshot.content, savedContent);
    assert.equal(savedSnapshot.status, 'published');
    assert.deepEqual(savedSnapshot.metadata, savedMetadata);
    for (const field of ['id', 'tenant_id', 'project_id', 'record_type', 'occurred_at', 'started_at', 'ended_at',
      'recorded_by', 'visibility', 'created_by'] as const) {
      assert.equal(savedSnapshot[field], initialRecord[field], `projection preserves unrelated record field ${field}`);
    }
    assert.notEqual(savedSnapshot.updated_at, initialRecord.updated_at);
    assert.equal(savedSnapshot.updated_by, owner.localUserId);
    const projectionRows = await recordLinks(admin, projectRecord.id);
    const projectedLinkMap = new Map(projectionRows.map(link => [`${link.legacy_task_id}/${link.role}`, true]));
    assert.equal(projectedLinkMap.get(`${manualTask.id}/blocker`), true,
      'manual task link keeps its legacy reference and role');
    for (const autoTask of [semanticTask, pointerTask, replacementTask]) {
      assert.equal(projectedLinkMap.get(`${autoTask.id}/related`), true, 'accepted current suggestions join projection links');
    }
    assert.equal(projectedLinkMap.get(`${oldReplacementTask.id}/related`), undefined);
    const concurrentAccepted = await admin.query<{ task_id: string }>(`
      SELECT task_id::text FROM projed_core.meeting_task_match_results
      WHERE resolution_id=$1::uuid AND decision='accepted'`, [resolutionIds.concurrent]);
    assert.equal(concurrentAccepted.rowCount, 1);
    const concurrentWinner = concurrentAccepted.rows[0]!.task_id;
    assert.ok([concurrentTaskA.internalId, concurrentTaskB.internalId].includes(concurrentWinner));
    const concurrentLegacyId = concurrentWinner === concurrentTaskA.internalId ? concurrentTaskA.id : concurrentTaskB.id;
    const untouchedLegacyId = concurrentWinner === concurrentTaskA.internalId ? concurrentTaskB.id : concurrentTaskA.id;
    assert.equal(projectedLinkMap.get(`${concurrentLegacyId}/related`), true,
      'the one winning concurrent decision is included in the projected record');
    assert.equal(projectedLinkMap.get(`${untouchedLegacyId}/related`), undefined,
      'the untouched suggested candidate is not projected as an accepted link');

    const savedRag = await ragSnapshot(admin, projectRecord.id);
    assert.equal(savedSnapshot.rag_enabled, true);
    assert.ok(savedSnapshot.source_document_id);
    assert.equal(savedRag.document_count, '1');
    assert.equal(savedRag.version_count, '1');
    assert.ok(Number(savedRag.chunk_count) > 0);
    assert.equal(savedRag.job_count, '1');
    assert.ok(savedRag.document_id);
    assert.ok(savedRag.version_id);
    assert.ok(savedRag.version_content?.includes(savedTitle));
    assert.ok(savedRag.version_content?.includes(savedContent));
    assert.equal(savedRag.version_hash, savedRag.document_hash);
    assert.equal(await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId), initialProjectRevision + 1n,
      'record, task links, RAG mirror and project revision commit together');
    const committedProjection = await projectionSnapshot(admin, projectRecord.id);
    assert.ok(committedProjection);

    const replay = responseData(await ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: projection,
    }), 'meeting projection replay');
    assert.equal(replay.idempotent, true, 'exact same key and payload replays after publication');
    assert.deepEqual(await projectionSnapshot(admin, projectRecord.id), committedProjection,
      'exact replay does not rewrite projection revision or timestamp');
    assert.deepEqual(await recordSnapshot(admin, projectRecord.id), savedSnapshot,
      'exact replay does not re-write the saved record');
    assert.deepEqual(await ragSnapshot(admin, projectRecord.id), savedRag,
      'exact replay does not create another RAG version or job');
    assert.equal(await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId), initialProjectRevision + 1n);

    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: { ...projection, userDraft: { ...record(projection.userDraft, 'projection draft'), content: 'changed replay payload' } },
    }), 'REVISION_CONFLICT', 409);
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: { ...projection, requestKey: `qa-review-new-after-publish-${randomUUID()}` },
    }), 'REVISION_CONFLICT', 409);
    assert.deepEqual(await recordSnapshot(admin, projectRecord.id), savedSnapshot);
    assert.deepEqual(await projectionSnapshot(admin, projectRecord.id), committedProjection);
    assert.deepEqual(await ragSnapshot(admin, projectRecord.id), savedRag);

    const rollbackReview = await review(ownerClient, rollbackCapture.captureId, 2);
    const rollbackRecordBefore = await recordSnapshot(admin, failedProjectionRecord.id);
    const rollbackLinksBefore = await recordLinks(admin, failedProjectionRecord.id);
    const rollbackRagBefore = await ragSnapshot(admin, failedProjectionRecord.id);
    const rollbackResourceBefore = await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId);
    assert.equal(rollbackRagBefore.document_count, '0');
    injectedTrigger = await setDeferredProjectionFailure(admin, failedProjectionRecord.id);
    const injectedBody = projectionBody(failedProjectionRecord.id, rollbackCapture.captureId, 2,
      String(rollbackReview.recordUpdatedAt), Number(rollbackReview.reviewRevision), `qa-review-rollback-${randomUUID()}`,
      { title: 'must roll back', content: 'should never persist', status: 'published', metadata: { injected: true } }, []);
    await expectHttpError(ownerClient.request('/api/v1/meeting-control', {
      method: 'POST', body: injectedBody,
    }), 'DB_COMMIT_UNKNOWN', 503);
    await dropDeferredProjectionFailure(admin, injectedTrigger);
    injectedTrigger = null;
    assert.deepEqual(await recordSnapshot(admin, failedProjectionRecord.id), rollbackRecordBefore,
      'deferred projection write failure rolls back record fields and RAG pointer');
    assert.deepEqual(await recordLinks(admin, failedProjectionRecord.id), rollbackLinksBefore,
      'deferred projection write failure restores prior manual links');
    assert.equal(await projectionSnapshot(admin, failedProjectionRecord.id), null);
    assert.deepEqual(await ragSnapshot(admin, failedProjectionRecord.id), rollbackRagBefore,
      'deferred projection write failure rolls back RAG documents, versions, chunks and jobs');
    assert.equal(await resourceRevision(admin, tenantScope.tenantId, tenantScope.projectId), rollbackResourceBefore,
      'deferred projection write failure rolls back project resource revision');
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    await cleanup();
  }
  if (failed) {
    if (cleanupErrors.length > 0) throw new AggregateError([failure, ...cleanupErrors], 'Meeting review verification and cleanup failed');
    throw failure;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Meeting review cleanup failed');
}
