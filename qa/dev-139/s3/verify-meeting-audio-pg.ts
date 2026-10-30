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
import type { MeetingAudioStorage, MeetingAudioReadResult, MeetingAudioUploadResult } from '../../../server/meetingAudioStorage.js';
import { createHttpCollaborationAdapter } from '../../../src/services/httpApi/collaborationAdapter.js';
import { HttpApiClient, HttpApiError, type HttpApiFetch } from '../../../src/services/httpApi/httpApiClient.js';
import { createHttpSessionAdapter } from '../../../src/services/httpApi/sessionAdapter.js';

type SessionLabel = 'qa-meeting-audio-owner' | 'qa-meeting-audio-reader' | 'qa-meeting-audio-outsider';
type JsonObject = Record<string, unknown>;

const STORAGE_GENERATION = '9007199254740993';

type FakeObject = MeetingAudioReadResult;

interface DeferredUpload {
  readonly entered: Promise<void>;
  readonly arrive: () => void;
  readonly release: () => void;
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

function adminUrlFor(config: RuntimeConfig): URL {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!raw) throw new Error('MEETING_AUDIO_ADMIN_FIXTURE_UNAVAILABLE');
  if (config.env !== 'disposable' || config.profile.environment !== 'disposable') {
    throw new Error('MEETING_AUDIO_ADMIN_REQUIRES_DISPOSABLE_PROFILE');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('MEETING_AUDIO_ADMIN_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port) !== config.binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== config.binding.databaseName
      || !/^dev139_s3_[0-9a-f]{32}$/u.test(config.binding.databaseName)
      || decodeURIComponent(url.username) !== 'postgres'
      || !url.password
      || url.search !== ''
      || url.hash !== '') {
    throw new Error('MEETING_AUDIO_ADMIN_BINDING_MISMATCH');
  }
  return url;
}

function deferredUpload(): DeferredUpload & { readonly wait: Promise<void> } {
  let resolveEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>(resolve => { resolveEntered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { entered, arrive: resolveEntered, release, wait };
}

function makeFakeStorage(): {
  readonly storage: MeetingAudioStorage;
  readonly uploadCount: () => number;
  readonly readCount: () => number;
  readonly setDeferredSegment: (segmentIndex: number, gate: DeferredUpload & { readonly wait: Promise<void> }) => void;
  readonly setFailureMode: (segmentIndex: number, mode: 'store-then-throw' | 'throw-before-store') => void;
  readonly completeOriginalWrite: (segmentIndex: number, bytes: Uint8Array, mime: string) => void;
  readonly clear: () => void;
} {
  const objects = new Map<string, FakeObject>();
  const keys = new Map<number, string>();
  const failures = new Map<number, 'store-then-throw' | 'throw-before-store'>();
  const deferred = new Map<number, DeferredUpload & { readonly wait: Promise<void> }>();
  let uploads = 0;
  let reads = 0;
  const segmentIndexFor = (key: string): number => {
    const match = /\/(0|[1-9][0-9]*)\.(?:webm|ogg|m4a|mp3|wav)$/u.exec(key);
    if (!match) throw new Error('MEETING_AUDIO_FAKE_KEY_INVALID');
    return Number(match[1]);
  };
  const putObject = (key: string, bytes: Uint8Array, mime: string): FakeObject => {
    const copy = Uint8Array.from(bytes);
    const result: FakeObject = {
      bytes: copy,
      contentType: mime,
      generation: STORAGE_GENERATION,
      size: copy.byteLength,
    };
    objects.set(key, result);
    return result;
  };
  const storage: MeetingAudioStorage = {
    async upload(key, bytes, mime): Promise<MeetingAudioUploadResult> {
      uploads += 1;
      const segmentIndex = segmentIndexFor(key);
      keys.set(segmentIndex, key);
      const gate = deferred.get(segmentIndex);
      if (gate) {
        // The operation intentionally remains independent of the HTTP request's
        // authorization lifetime. This models a storage write already in flight.
        gate.arrive();
        await gate.wait;
      }
      if (objects.has(key)) throw Object.assign(new Error('FAKE_CREATE_ONLY_CONFLICT'), { code: 'MEETING_STORAGE_CONFLICT' });
      const failure = failures.get(segmentIndex);
      if (failure === 'throw-before-store') {
        failures.delete(segmentIndex);
        throw Object.assign(new Error('FAKE_OUTCOME_UNKNOWN'), { code: 'MEETING_STORAGE_UNAVAILABLE' });
      }
      const object = putObject(key, bytes, mime);
      if (failure === 'store-then-throw') {
        failures.delete(segmentIndex);
        throw Object.assign(new Error('FAKE_OUTCOME_UNKNOWN_AFTER_STORE'), { code: 'MEETING_STORAGE_UNAVAILABLE' });
      }
      return { contentType: object.contentType, generation: object.generation, size: object.size };
    },
    async read(key): Promise<MeetingAudioReadResult> {
      reads += 1;
      const object = objects.get(key);
      if (!object) throw Object.assign(new Error('FAKE_OBJECT_NOT_FOUND'), { code: 'MEETING_STORAGE_UNAVAILABLE' });
      return { ...object, bytes: Uint8Array.from(object.bytes) };
    },
    async delete(key, generation): Promise<void> {
      const object = objects.get(key);
      if (object && object.generation === generation) objects.delete(key);
    },
  };
  return {
    storage,
    uploadCount: () => uploads,
    readCount: () => reads,
    setDeferredSegment: (segmentIndex, gate) => deferred.set(segmentIndex, gate),
    setFailureMode: (segmentIndex, mode) => failures.set(segmentIndex, mode),
    completeOriginalWrite: (segmentIndex, bytes, mime) => {
      const key = keys.get(segmentIndex);
      if (!key) throw new Error('MEETING_AUDIO_ORIGINAL_OPERATION_NOT_FOUND');
      if (!objects.has(key)) putObject(key, bytes, mime);
    },
    clear: () => objects.clear(),
  };
}

/**
 * Local-native HTTP/SQL rehearsal for the meeting audio transport boundary.
 * Storage is an in-process fake; no provider or external network is contacted.
 */
export async function verifyMeetingAudioPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  reader: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  const expected = migrationSet(config);
  const httpConfig: RuntimeConfig = { ...config, host: '127.0.0.1', port: 0 };
  const adminUrl = adminUrlFor(config);
  const admin = new pg.Client({ connectionString: adminUrl.toString(), application_name: 'projed-dev139-meeting-audio-qa' });
  const httpDatabase = new RuntimeDatabase(httpConfig);
  const fake = makeFakeStorage();
  const actors: Readonly<Record<SessionLabel, ServerActorV1>> = {
    'qa-meeting-audio-owner': owner,
    'qa-meeting-audio-reader': reader,
    'qa-meeting-audio-outsider': outsider,
  };
  let base = '';
  let serverStarted = false;
  let adminConnected = false;
  const workspaceIds: string[] = [];
  const ownedAttemptIds: string[] = [];
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
    meetingAudioStorage: fake.storage,
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
  const ownerClient = clientFor('qa-meeting-audio-owner', owner);
  const ownerCollaboration = createHttpCollaborationAdapter(ownerClient);
  const readerClient = clientFor('qa-meeting-audio-reader', reader);
  const readerCollaboration = createHttpCollaborationAdapter(readerClient);
  const readerSession = createHttpSessionAdapter(new HttpApiClient(fetchFor('qa-meeting-audio-reader')));
  const outsiderClient = clientFor('qa-meeting-audio-outsider', outsider);
  const postControl = (client: HttpApiClient, body: JsonObject): Promise<unknown> => client.request<unknown>(
    '/api/v1/meeting-control', { method: 'POST', body },
  );
  const raw = (options: {
    session: SessionLabel;
    actor: ServerActorV1;
    path: string;
    method: 'PUT' | 'GET';
    bytes?: Uint8Array;
    mime?: string;
    origin?: string;
    expectedActor?: ServerActorV1;
    recordId?: string;
  }): Promise<Response> => {
    const headers = new Headers();
    headers.set('cookie', options.session);
    headers.set('origin', options.origin ?? base);
    const expectedActor = options.expectedActor ?? options.actor;
    headers.set('x-projed-expected-account-id', expectedActor.localUserId);
    headers.set('x-projed-expected-context-id', expectedActor.contextId);
    if (options.recordId) headers.set('x-projed-record-id', options.recordId);
    if (options.method === 'PUT') {
      headers.set('x-projed-source-version', '1');
      headers.set('content-type', options.mime ?? 'audio/webm');
    }
    return fetch(new URL(options.path, base), {
      method: options.method,
      headers,
      body: options.method === 'PUT' && options.bytes ? Buffer.from(options.bytes) : undefined,
      redirect: 'error',
    });
  };
  const reserve = async (captureId: string, segmentIndex: number, bytes: Uint8Array): Promise<{ data: JsonObject; segmentId: string; uploadUrl: string }> => {
    const result = responseData(await postControl(ownerClient, {
      operation: 'reserve-segment',
      captureId,
      expectedSourceVersion: 1,
      segmentIndex,
      mime: 'audio/webm',
      bytes: bytes.byteLength,
      epoch: 0,
      startOffsetMs: segmentIndex * 1000,
      endOffsetMs: (segmentIndex + 1) * 1000,
    }), `reserve segment ${segmentIndex}`);
    assert.equal(result.sourceVersion, 1);
    assert.equal(typeof result.segmentId, 'string');
    assert.equal(typeof result.uploadUrl, 'string');
    assert.equal(typeof result.uploadState, 'string');
    const segmentId = String(result.segmentId);
    const uploadUrl = String(result.uploadUrl);
    const target = new URL(uploadUrl, base);
    assert.equal(target.origin, base, 'upload URL must remain same-origin');
    assert.equal(target.pathname, `/api/v1/meeting-audio/${segmentId}`);
    ownedAttemptIds.push(`storage:${captureId}:v1:segment:${segmentIndex}`);
    return { data: result, segmentId, uploadUrl };
  };
  const put = (session: SessionLabel, actor: ServerActorV1, uploadUrl: string, bytes: Uint8Array, mime = 'audio/webm', overrides: { origin?: string; expectedActor?: ServerActorV1; recordId?: string } = {}) => raw({
    session, actor, path: uploadUrl, method: 'PUT', bytes, mime, ...overrides,
  });
  const get = (session: SessionLabel, actor: ServerActorV1, uploadUrl: string, recordId: string, overrides: { origin?: string; expectedActor?: ServerActorV1 } = {}) => raw({
    session, actor, path: uploadUrl, method: 'GET', recordId, ...overrides,
  });

  let recordId = '';
  let captureId = '';
  let parentDeleteAttemptId = '';
  const gates:DeferredUpload[]=[];
  const pendingUploads:Promise<Response>[]=[];
  try {
    if (owner.entry !== 'main' || reader.entry !== 'main' || outsider.entry !== 'main') {
      throw new Error('MEETING_AUDIO_FIXTURE_REQUIRES_MAIN_ENTRY_ACTORS');
    }
    await admin.connect();
    adminConnected = true;
    const address = await server.listen();
    serverStarted = true;
    base = `http://${address.host}:${address.port}`;

    const readerProfile = await readerSession.getSession();
    assert.equal(readerProfile.uid, reader.localUserId);
    assert.ok(readerProfile.email, 'reader needs a synthetic profile email for board membership');
    const workspace = await ownerCollaboration.createWorkspace(`DEV-139 audio ${randomUUID()}`);
    workspaceIds.push(workspace.id);
    const board = await ownerCollaboration.createBoard(workspace.id, 'Meeting audio fixture');
    const inviteToken = randomBytes(32).toString('base64url');
    await ownerCollaboration.createInvite(workspace.id, board.id, {
      email: readerProfile.email,
      tokenHash: createHash('sha256').update(inviteToken).digest('hex'),
      expiresAt: Date.now() + 10 * 60 * 1000,
      defaultRole: 'member',
    });
    await readerCollaboration.acceptInvite({
      token: inviteToken,
      userId: reader.localUserId,
      email: readerProfile.email,
      displayName: readerProfile.displayName,
    });

    recordId = randomUUID();
    await runActorTransaction(database, config, owner, async port => {
      const boardScope = await resolveBoard(port, workspace.id, board.id);
      const inserted = await port.query<{ id: string }>(`
        INSERT INTO projed_core.knowledge_records
          (id,tenant_id,project_id,record_type,title,content,occurred_at,status,visibility,rag_enabled,
           metadata,created_by,updated_by)
        VALUES($1::uuid,$2::uuid,$3::uuid,'meeting','DEV-139 private audio fixture',
          'Synthetic local audio fixture only',now(),'draft','private',false,'{}'::jsonb,
          projed_core.current_actor_user_id_v1(),projed_core.current_actor_user_id_v1())
        RETURNING id::text
      `, [recordId, boardScope.tenantId, boardScope.id]);
      assert.equal(inserted.rowCount, 1);
      return undefined;
    });

    const begin = responseData(await postControl(ownerClient, {
      operation: 'begin', tenantId: workspace.id, projectId: board.id, recordId,
      idempotencyKey: `qa-meeting-audio-${randomUUID()}`,
    }), 'meeting capture begin');
    assert.equal(begin.state, 'recording');
    captureId = String(begin.captureId);
    assert.ok(captureId);

    const normalBytes = Uint8Array.from([0, 1, 2, 3, 254, 255]);
    const normal = await reserve(captureId, 0, normalBytes);
    const uploaded = await put('qa-meeting-audio-owner', owner, normal.uploadUrl, normalBytes);
    assert.equal(uploaded.status, 200);
    const uploadedBody = responseData(await uploaded.json(), 'normal audio PUT');
    const uploadedSegment = record(uploadedBody.segment, 'normal audio segment');
    assert.equal(uploadedSegment.id, normal.segmentId);
    assert.equal(uploadedSegment.bytes, normalBytes.byteLength);
    assert.equal(uploadedSegment.sha256, createHash('sha256').update(normalBytes).digest('hex'));
    assert.equal(uploadedSegment.upload_state, 'verified');
    assert.equal(uploadedSegment.source_version, 1);
    const afterFirstUploadCount = fake.uploadCount();
    assert.equal(afterFirstUploadCount, 1);

    const replay = await put('qa-meeting-audio-owner', owner, normal.uploadUrl, normalBytes);
    assert.equal(replay.status, 200, 'same-body replay is idempotent');
    assert.equal(fake.uploadCount(), afterFirstUploadCount, 'same-body replay must not create a second storage write');
    const conflictingBody = Uint8Array.from([9, 8, 7, 6, 5, 4]);
    const bodyConflict = await put('qa-meeting-audio-owner', owner, normal.uploadUrl, conflictingBody);
    assert.equal(bodyConflict.status, 409, 'changed bytes must conflict without replacing the object');
    const mimeConflict = await put('qa-meeting-audio-owner', owner, normal.uploadUrl, normalBytes, 'audio/ogg');
    assert.equal(mimeConflict.status, 409, 'changed MIME must conflict without replacing the object');
    assert.equal(fake.uploadCount(), afterFirstUploadCount);

    const verify = responseData(await postControl(ownerClient, {
      operation: 'verify-segment', captureId, expectedSourceVersion: 1, segmentIndex: 0,
    }), 'verify normal segment');
    const verifiedSegment = record(verify.segment, 'verified normal segment');
    assert.equal(verifiedSegment.id, normal.segmentId);
    assert.equal(verifiedSegment.upload_state, 'verified');
    assert.equal(verifiedSegment.source_version, 1);
    const download = await get('qa-meeting-audio-owner', owner, normal.uploadUrl, recordId);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'audio/webm');
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), normalBytes);
    assert.equal(fake.readCount() > 0, true, 'GET and verification must read back storage metadata/content');
    const normalAudit = await admin.query<{
      upload_state: string; source_version: number; segment_sha256: string; segment_generation: string | null;
      cleanup_generation: string | null; upload_outcome: string | null; upload_bytes: string | null;
      exact_upload_expiry:boolean;
    }>(`
      SELECT segment.upload_state,segment.source_version,segment.sha256 AS segment_sha256,
        segment.storage_generation AS segment_generation,obligation.storage_generation AS cleanup_generation,
        obligation.upload_outcome,obligation.upload_bytes::text,
        segment.upload_token_expires_at=obligation.upload_token_expires_at AS exact_upload_expiry
      FROM projed_core.meeting_capture_segments segment
      JOIN projed_core.meeting_artifact_cleanup obligation
        ON obligation.capture_id=segment.capture_id
       AND obligation.attempt_id='storage:'||segment.capture_id::text||':v'||segment.source_version::text||':segment:'||segment.segment_index::text
       AND obligation.kind='storage'
      WHERE segment.id=$1::uuid
    `, [normal.segmentId]);
    assert.deepEqual(normalAudit.rows, [{
      upload_state: 'verified', source_version: 1,
      segment_sha256: createHash('sha256').update(normalBytes).digest('hex'),
      segment_generation: STORAGE_GENERATION, cleanup_generation: STORAGE_GENERATION,
      upload_outcome: 'uploaded', upload_bytes: String(normalBytes.byteLength),
      exact_upload_expiry:true,
    }]);
    const unchangedDownload = await get('qa-meeting-audio-owner', owner, normal.uploadUrl, recordId);
    assert.equal(unchangedDownload.status, 200);
    assert.deepEqual(new Uint8Array(await unchangedDownload.arrayBuffer()), normalBytes,
      'conflicting body/MIME attempts must not replace the stored bytes');

    const readerDenied = await get('qa-meeting-audio-reader', reader, normal.uploadUrl, recordId);
    assert.equal(readerDenied.status, 404, 'board reader cannot download a private meeting record');
    const outsiderDenied = await get('qa-meeting-audio-outsider', outsider, normal.uploadUrl, recordId);
    assert.equal(outsiderDenied.status, 404, 'outsider cannot download the private meeting record');
    await assert.rejects(
      postControl(readerClient, { operation: 'status', captureId }),
      error => error instanceof HttpApiError && error.code === 'RESOURCE_NOT_FOUND' && error.status === 404,
    );
    await assert.rejects(
      postControl(outsiderClient, { operation: 'status', captureId }),
      error => error instanceof HttpApiError && error.code === 'RESOURCE_NOT_FOUND' && error.status === 404,
    );
    const wrongOrigin = await put('qa-meeting-audio-owner', owner, normal.uploadUrl, normalBytes, 'audio/webm', {
      origin: 'https://other.invalid',
    });
    assert.equal(wrongOrigin.status, 403);
    const wrongActor = await get('qa-meeting-audio-owner', owner, normal.uploadUrl, recordId, { expectedActor: reader });
    assert.equal(wrongActor.status, 409);

    const storedThrowBytes = Uint8Array.from([11, 12, 13, 14]);
    fake.setFailureMode(1, 'store-then-throw');
    const storedThrow = await reserve(captureId, 1, storedThrowBytes);
    const storedThrowResponse = await put('qa-meeting-audio-owner', owner, storedThrow.uploadUrl, storedThrowBytes);
    assert.equal(storedThrowResponse.status, 200, 'readback recovers an upload whose response was lost after storage succeeded');
    const storedThrowBody = responseData(await storedThrowResponse.json(), 'readback recovered audio PUT');
    const storedThrowSegment = record(storedThrowBody.segment, 'recovered stored segment');
    assert.equal(storedThrowSegment.upload_state, 'verified');
    assert.equal(storedThrowSegment.sha256, createHash('sha256').update(storedThrowBytes).digest('hex'));
    const uploadsAfterStoredThrow = fake.uploadCount();
    assert.equal(uploadsAfterStoredThrow, 2);

    const lateBytes = Uint8Array.from([21, 22, 23, 24, 25]);
    fake.setFailureMode(2, 'throw-before-store');
    const unknown = await reserve(captureId, 2, lateBytes);
    const unknownResponse = await put('qa-meeting-audio-owner', owner, unknown.uploadUrl, lateBytes);
    assert.ok(unknownResponse.status >= 500, 'a write with no readable object remains an unknown outcome');
    const countAtUnknown = fake.uploadCount();
    assert.equal(countAtUnknown, 3);
    const unknownVerify = await postControl(ownerClient, {
      operation: 'verify-segment', captureId, expectedSourceVersion: 1, segmentIndex: 2,
    }).then(() => null, error => error);
    assert.ok(unknownVerify, 'verification cannot mark an absent object as complete');
    assert.equal(fake.uploadCount(), countAtUnknown, 'verification must not retry the storage write');
    fake.completeOriginalWrite(2, lateBytes, 'audio/webm');
    await admin.query(`UPDATE projed_core.meeting_capture_segments SET upload_token_expires_at=now()-interval '1 second'
      WHERE id=$1::uuid AND capture_id=$2::uuid`,[unknown.segmentId,captureId]);
    const recoveredVerify = responseData(await postControl(ownerClient, {
      operation: 'verify-segment', captureId, expectedSourceVersion: 1, segmentIndex: 2,
    }), 'verify original unknown write after storage readback becomes available');
    const recoveredUnknownSegment = record(recoveredVerify.segment, 'recovered unknown segment');
    assert.equal(recoveredUnknownSegment.upload_state, 'verified');
    assert.equal(recoveredUnknownSegment.sha256, createHash('sha256').update(lateBytes).digest('hex'));
    assert.equal(fake.uploadCount(), countAtUnknown, 'readback recovery never posts a replacement object');

    await postControl(ownerClient,{operation:'stop',captureId,expectedSourceVersion:1,finalPointerSequence:-1});
    const retention=await admin.query<{anchored:boolean}>(`SELECT bool_and(obligation.due_at>=capture.audio_expires_at) AS anchored
      FROM projed_core.meeting_artifact_cleanup obligation
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=obligation.capture_id
      WHERE capture.id=$1::uuid AND obligation.kind='storage' AND obligation.storage_backend='gcs'`,[captureId]);
    assert.deepEqual(retention.rows,[{anchored:true}],'verified audio cannot be purged at the two-hour upload deadline');

    const delayedBytes = Uint8Array.from([31, 32, 33, 34, 35, 36]);
    const delayed = await reserve(captureId, 3, delayedBytes);
    const gate = deferredUpload();
    gates.push(gate);
    fake.setDeferredSegment(3, gate);
    const delayedPutPromise = put('qa-meeting-audio-owner', owner, delayed.uploadUrl, delayedBytes);
    pendingUploads.push(delayedPutPromise);
    await gate.entered;
    const beforeCancelSegment=await admin.query<{upload_state:string;sha256:string|null;storage_generation:string|null;updated_at:string}>(`
      SELECT upload_state,sha256,storage_generation,updated_at::text FROM projed_core.meeting_capture_segments WHERE id=$1::uuid`,[delayed.segmentId]);
    assert.equal(beforeCancelSegment.rows[0]?.sha256,createHash('sha256').update(delayedBytes).digest('hex'));
    const countWhileActive=fake.uploadCount();
    const concurrent=await put('qa-meeting-audio-owner',owner,delayed.uploadUrl,delayedBytes);
    assert.ok(concurrent.status>=500,'an active unknown write has no object to verify yet');
    assert.equal(fake.uploadCount(),countWhileActive,'a concurrent same-body PUT cannot issue a second provider POST');
    const cancel = responseData(await postControl(ownerClient, {
      operation: 'cancel', captureId, expectedSourceVersion: 1, reason: 'qa-audio-cancel-during-upload',
    }), 'cancel during storage upload');
    assert.equal(cancel.state, 'cancelled');
    const readsAtCancel=fake.readCount();
    gate.release();
    const delayedResponse = await delayedPutPromise;
    assert.equal(delayedResponse.status, 409, 'a late storage success cannot verify a cancelled segment');
    assert.equal(fake.readCount(),readsAtCancel,'cancelled scope cannot retrieve the late object');

    const delayedAttemptId = `storage:${captureId}:v1:segment:3`;
    parentDeleteAttemptId = delayedAttemptId;
    const beforeDelete = await admin.query<{
      upload_state: string; storage_generation: string | null; sha256: string | null;
      upload_outcome: string | null; cleanup_generation: string | null; upload_operation_token: string | null;
      updated_at:string;
    }>(`
      SELECT segment.upload_state,segment.storage_generation,segment.sha256,
        obligation.upload_outcome,obligation.storage_generation AS cleanup_generation,
        obligation.upload_operation_token::text,segment.updated_at::text
      FROM projed_core.meeting_capture_segments segment
      JOIN projed_core.meeting_artifact_cleanup obligation
        ON obligation.capture_id=segment.capture_id
       AND obligation.attempt_id='storage:'||segment.capture_id::text||':v'||segment.source_version::text||':segment:'||segment.segment_index::text
       AND obligation.kind='storage'
      WHERE segment.id=$1::uuid AND obligation.attempt_id=$2
    `, [delayed.segmentId, delayedAttemptId]);
    assert.equal(beforeDelete.rowCount, 1);
    assert.notEqual(beforeDelete.rows[0]?.upload_state, 'verified');
    assert.equal(beforeDelete.rows[0]?.storage_generation, null);
    assert.ok(beforeDelete.rows[0]?.upload_operation_token, 'the claimed operation remains bound to its cleanup obligation');
    assert.equal(beforeDelete.rows[0]?.upload_outcome, 'uploaded');
    assert.equal(beforeDelete.rows[0]?.cleanup_generation, STORAGE_GENERATION);
    assert.deepEqual(beforeDelete.rows.map(row=>({upload_state:row.upload_state,sha256:row.sha256,
      storage_generation:row.storage_generation,updated_at:row.updated_at})),beforeCancelSegment.rows,
    'late success after cancel cannot modify the segment, including its timestamp');

    const parentCapture=responseData(await postControl(ownerClient,{operation:'begin',tenantId:workspace.id,
      projectId:board.id,recordId,idempotencyKey:`qa-parent-delete-${randomUUID()}`}), 'parent-delete capture');
    const parentCaptureId=String(parentCapture.captureId);
    const parentSegment=await reserve(parentCaptureId,4,delayedBytes);
    const parentGate=deferredUpload();gates.push(parentGate);fake.setDeferredSegment(4,parentGate);
    const parentPut=put('qa-meeting-audio-owner',owner,parentSegment.uploadUrl,delayedBytes);pendingUploads.push(parentPut);
    await parentGate.entered;
    parentDeleteAttemptId=`storage:${parentCaptureId}:v1:segment:4`;

    await ownerCollaboration.deleteWorkspace(workspace.id);
    const readsAtDelete=fake.readCount();
    workspaceIds.splice(workspaceIds.indexOf(workspace.id), 1);
    parentGate.release();
    const parentResponse=await parentPut;
    assert.equal(parentResponse.status,404,'late upload cannot recreate a deleted segment or record');
    assert.equal(fake.readCount(),readsAtDelete,'deleted scope cannot retrieve the late object');
    const afterParentDelete = await admin.query<{
      capture_id: string | null; state: string; upload_outcome: string | null; storage_generation: string | null;
      upload_operation_token: string | null;
    }>(`
      SELECT capture_id::text,state,upload_outcome,storage_generation,upload_operation_token::text
      FROM projed_core.meeting_artifact_cleanup
      WHERE attempt_id=$1 AND kind='storage'
    `, [parentDeleteAttemptId]);
    assert.equal(afterParentDelete.rowCount, 1, 'cleanup proof must survive parent deletion');
    assert.equal(afterParentDelete.rows[0]?.capture_id, null);
    assert.equal(afterParentDelete.rows[0]?.state, 'pending');
    assert.equal(afterParentDelete.rows[0]?.upload_outcome, 'uploaded');
    assert.equal(afterParentDelete.rows[0]?.storage_generation, STORAGE_GENERATION);
    assert.ok(afterParentDelete.rows[0]?.upload_operation_token,'the independent operation proof survives deletion');
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    for(const gate of gates)gate.release();
    const settledUploads=await Promise.allSettled(pendingUploads);
    for(const settled of settledUploads)if(settled.status==='rejected')cleanupErrors.push(settled.reason);
    for (const workspaceId of [...workspaceIds].reverse()) {
      try { await ownerCollaboration.deleteWorkspace(workspaceId); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (adminConnected) {
      try {
        if (ownedAttemptIds.length > 0) {
          await admin.query('DELETE FROM projed_core.meeting_artifact_cleanup WHERE attempt_id=ANY($1::text[]) AND kind=\'storage\'', [ownedAttemptIds]);
        }
      } catch (error) { cleanupErrors.push(error); }
    }
    fake.clear();
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
    if (cleanupErrors.length > 0) throw new AggregateError([failure, ...cleanupErrors], 'Meeting audio verification and cleanup failed');
    throw failure;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Meeting audio cleanup failed');
}
