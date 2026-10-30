import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';

import { runActorTransaction, type ServerActorV1 } from '../../../server/actorTransaction.js';
import { type RuntimeConfig } from '../../../server/config.js';
import { RuntimeDatabase } from '../../../server/db.js';
import { KernelError } from '../../../server/errors.js';
import { createPostgresMeetingAudioCleanupRepository } from '../../../server/meetingAudioCleanupRepository.js';
import { runMeetingAudioCleanupUnit } from '../../../server/meetingAudioCleanupWorker.js';
import type { MeetingAudioCleanupStorage, MeetingAudioReadResult } from '../../../server/meetingAudioStorage.js';

interface FixtureScope {
  readonly tenantId: string;
  readonly projectId: string;
  readonly recordId: string;
}

interface CleanupFixture {
  readonly id: string;
  readonly captureId: string | null;
  readonly objectCaptureId: string;
  readonly key: string;
  readonly attemptId: string;
  readonly uploadOperationToken: string | null;
  readonly uploadOutcome: 'uploaded' | 'unknown' | null;
  readonly generation: string | null;
  readonly sha256: string | null;
  readonly bytes: number | null;
}

interface CleanupSeedOptions {
  readonly captureId?: string | null;
  readonly dueInMs?: number;
  readonly uploadExpiresInMs?: number;
  readonly uploadOperationToken?: string | null;
  readonly uploadOutcome?: 'uploaded' | 'unknown' | null;
  readonly generation?: string | null;
  readonly sha256?: string | null;
  readonly bytes?: number | null;
}

const CLEANUP_FUNCTIONS = [
  'meeting_audio_cleanup_due_v1',
  'meeting_audio_cleanup_guard_v1',
  'meeting_audio_cleanup_detach_v1',
  'scan_meeting_audio_cleanup_v1',
  'claim_meeting_audio_cleanup_v1',
  'finish_meeting_audio_cleanup_v1',
] as const;

const EXPECTED_COLUMN_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  SELECT: [
    'attempt_id', 'capture_id', 'due_at', 'error_code', 'kind', 'last_verified_at',
    'lease_expires_at', 'lease_token', 'object_locator', 'obligation_id', 'state', 'storage_backend',
    'storage_generation', 'updated_at', 'upload_bytes', 'upload_operation_token', 'upload_outcome', 'upload_sha256',
    'upload_token_expires_at', 'attempts',
  ].sort(),
  INSERT: [
    'attempt_id', 'capture_id', 'due_at', 'kind', 'object_locator', 'obligation_id', 'state',
    'storage_backend', 'upload_token_expires_at',
  ].sort(),
  UPDATE: [
    'attempts', 'due_at', 'error_code', 'last_verified_at', 'lease_expires_at', 'lease_token',
    'state', 'updated_at', 'upload_bytes', 'upload_operation_token', 'upload_outcome', 'upload_sha256',
    'upload_token_expires_at', 'storage_generation',
  ].sort(),
};

function adminUrlFor(config: RuntimeConfig): URL {
  const raw = process.env.PROJED_QA_MEETING_ADMIN_URL;
  if (!raw) throw new Error('MEETING_AUDIO_CLEANUP_ADMIN_FIXTURE_UNAVAILABLE');
  if (config.env !== 'disposable' || config.profile.environment !== 'disposable') {
    throw new Error('MEETING_AUDIO_CLEANUP_ADMIN_REQUIRES_DISPOSABLE_PROFILE');
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('MEETING_AUDIO_CLEANUP_ADMIN_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.hostname !== '127.0.0.1'
      || Number(url.port) !== config.binding.databasePort
      || decodeURIComponent(url.pathname.slice(1)) !== config.binding.databaseName
      || !/^dev139_s3_[0-9a-f]{32}$/u.test(config.binding.databaseName)
      || decodeURIComponent(url.username) !== 'postgres'
      || !url.password
      || url.search !== ''
      || url.hash !== '') {
    throw new Error('MEETING_AUDIO_CLEANUP_ADMIN_BINDING_MISMATCH');
  }
  return url;
}

function fixtureStorage(): {
  readonly storage: MeetingAudioCleanupStorage;
  readonly put: (key: string, object: MeetingAudioReadResult) => void;
  readonly failRead: (key: string) => void;
  readonly deleteCalls: () => readonly { readonly key: string; readonly generation: string }[];
} {
  const objects = new Map<string, MeetingAudioReadResult>();
  const readFailures = new Set<string>();
  const deletions: { key: string; generation: string }[] = [];
  const storage: MeetingAudioCleanupStorage = {
    async probe(key): Promise<{ kind: 'missing' } | { kind: 'present'; generation: string; size: number; contentType: string }> {
      const object = objects.get(key);
      return object
        ? { kind: 'present', generation: object.generation, size: object.size, contentType: object.contentType }
        : { kind: 'missing' };
    },
    async read(key): Promise<MeetingAudioReadResult> {
      if (readFailures.has(key)) throw new Error('SYNTHETIC_STORAGE_READ_FAILURE');
      const object = objects.get(key);
      if (!object) throw new Error('SYNTHETIC_STORAGE_OBJECT_MISSING');
      return { ...object, bytes: Uint8Array.from(object.bytes) };
    },
    async delete(key, generation): Promise<void> {
      deletions.push({ key, generation });
      if (objects.get(key)?.generation === generation) objects.delete(key);
    },
  };
  return {
    storage,
    put: (key, object) => objects.set(key, { ...object, bytes: Uint8Array.from(object.bytes) }),
    failRead: key => readFailures.add(key),
    deleteCalls: () => deletions,
  };
}

function pgErrorCode(error: unknown): string | undefined {
  if (!(error instanceof KernelError) || !error.cause || typeof error.cause !== 'object') return undefined;
  return 'code' in error.cause && typeof error.cause.code === 'string' ? error.cause.code : undefined;
}

async function verifyCatalog(database: RuntimeDatabase, config: RuntimeConfig): Promise<void> {
  const missing = CLEANUP_FUNCTIONS.filter(name => !config.profile.objectAllowlist.includes(`projed_core.${name}`));
  assert.deepEqual(missing, [], 'the S3 source profile must allowlist exactly the cleanup functions');

  const lease = await database.checkout();
  try {
    const functions = await lease.client.query<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      runtime_execute: boolean;
      public_execute: boolean;
    }>(`
      SELECT p.proname,p.prosecdef,p.proconfig,
        has_function_privilege(current_user,p.oid,'EXECUTE') AS runtime_execute,
        EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='projed_core' AND p.proname=ANY($1::text[])
      ORDER BY p.proname
    `, [CLEANUP_FUNCTIONS]);
    assert.equal(functions.rowCount, CLEANUP_FUNCTIONS.length, 'all six cleanup functions must exist');
    for (const fn of functions.rows) {
      assert.equal(fn.prosecdef, false, `${fn.proname} must remain SECURITY INVOKER`);
      assert.equal(fn.runtime_execute, true, `${fn.proname} must be callable by runtime only through its scoped RPC`);
      assert.equal(fn.public_execute, false, `${fn.proname} must not remain executable by PUBLIC`);
      assert.ok(fn.proconfig?.some(value => value.replace(/\s+/gu, '') === 'search_path=pg_catalog,projed_core'),
        `${fn.proname} must pin search_path`);
    }

    const rls = await lease.client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='projed_core' AND c.relname=ANY($1::text[])
      ORDER BY c.relname
    `, [['meeting_artifact_cleanup', 'meeting_capture_sessions']]);
    assert.deepEqual(rls.rows, [
      { relname: 'meeting_artifact_cleanup', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'meeting_capture_sessions', relrowsecurity: true, relforcerowsecurity: true },
    ]);

    const policies = await lease.client.query<{ polname: string; polcmd: string; roles: string[] }>(`
      SELECT p.polname,p.polcmd,
        ARRAY(SELECT r.rolname::text FROM unnest(p.polroles) role_id(oid)
          JOIN pg_catalog.pg_roles r ON r.oid=role_id.oid ORDER BY r.rolname) AS roles
      FROM pg_catalog.pg_policy p
      JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='projed_core' AND p.polname=ANY($1::text[])
      ORDER BY p.polname
    `, [[
      'meeting_audio_cleanup_capture_read_v1',
      'meeting_audio_cleanup_maintenance_read_v1',
      'meeting_audio_cleanup_maintenance_update_v1',
    ]]);
    assert.deepEqual(policies.rows, [
      { polname: 'meeting_audio_cleanup_capture_read_v1', polcmd: 'r', roles: ['projed_runtime_disposable'] },
      { polname: 'meeting_audio_cleanup_maintenance_read_v1', polcmd: 'r', roles: ['projed_runtime_disposable'] },
      { polname: 'meeting_audio_cleanup_maintenance_update_v1', polcmd: 'w', roles: ['projed_runtime_disposable'] },
    ]);

    const privileges = await lease.client.query<{ privilege: string; columns: string[] }>(`
      SELECT permission.privilege,
        coalesce(array_agg(a.attname::text ORDER BY a.attname) FILTER (WHERE has_column_privilege(current_user,c.oid,a.attnum,permission.privilege)),
          ARRAY[]::text[]) AS columns
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE')) permission(privilege)
      WHERE n.nspname='projed_core' AND c.relname='meeting_artifact_cleanup'
      GROUP BY permission.privilege
      ORDER BY permission.privilege
    `);
    assert.deepEqual(privileges.rows.map(row => row.privilege), ['INSERT', 'SELECT', 'UPDATE']);
    for (const privilege of privileges.rows) {
      assert.deepEqual(privilege.columns, EXPECTED_COLUMN_PRIVILEGES[privilege.privilege],
        `runtime ${privilege.privilege} columns must match the existing source contract`);
    }
    const tableDelete = await lease.client.query<{ cleanup_delete: boolean; capture_delete: boolean }>(`
      SELECT has_table_privilege(current_user,'projed_core.meeting_artifact_cleanup','DELETE') AS cleanup_delete,
        has_table_privilege(current_user,'projed_core.meeting_capture_sessions','DELETE') AS capture_delete
    `);
    assert.deepEqual(tableDelete.rows, [{ cleanup_delete: false, capture_delete: false }],
      'maintenance must not grant runtime direct DELETE');

    const definitions = await lease.client.query<{ proname: string; body: string }>(`
      SELECT p.proname,pg_get_functiondef(p.oid) AS body
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='projed_core' AND p.proname=ANY($1::text[])
        AND p.proname IN('scan_meeting_audio_cleanup_v1','claim_meeting_audio_cleanup_v1','finish_meeting_audio_cleanup_v1')
      ORDER BY p.proname
    `, [CLEANUP_FUNCTIONS]);
    assert.equal(definitions.rowCount, 3);
    for (const fn of definitions.rows) {
      assert.doesNotMatch(fn.body, /knowledge_records|meeting_transcript_segments|meeting_llm_unit_checkpoints|meeting_draft_projections/u,
        `${fn.proname} must stay out of private record and checkpoint payloads`);
    }
  } finally {
    lease.release();
  }
}

/** Native PostgreSQL regression; storage transport is SYNTHETIC_IN_MEMORY_ONLY. */
export async function verifyMeetingAudioCleanupPostgres(
  database: RuntimeDatabase,
  config: RuntimeConfig,
  owner: ServerActorV1,
  outsider: ServerActorV1,
): Promise<void> {
  if (owner.entry !== 'main' || outsider.entry !== 'main') {
    throw new Error('MEETING_AUDIO_CLEANUP_FIXTURE_REQUIRES_MAIN_ENTRY_ACTORS');
  }
  const admin = new pg.Client({
    connectionString: adminUrlFor(config).toString(),
    application_name: 'projed-dev139-meeting-audio-cleanup-synthetic-qa',
  });
  const repository = createPostgresMeetingAudioCleanupRepository({ database, config });
  const fake = fixtureStorage();
  const captureIds: string[] = [];
  const obligationIds: string[] = [];
  const cleanupErrors: unknown[] = [];
  let recordId: string | null = null;
  let adminConnected = false;
  let failed = false;
  let failure: unknown;

  const captures = new Map<string, { readonly state: 'recording' | 'ready'; readonly audioExpiresAt: Date }>();
  const seedCapture = async (state: 'recording' | 'ready', audioExpiresAt: Date): Promise<string> => {
    const id = randomUUID();
    captureIds.push(id);
    const scope = await admin.query(`
      INSERT INTO projed_core.meeting_capture_sessions
        (id,tenant_id,project_id,record_id,created_by,idempotency_key,state,audio_expires_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::timestamptz)
    `, [id, fixtureScope.tenantId, fixtureScope.projectId, fixtureScope.recordId, owner.localUserId,
      `qa-audio-cleanup-${id}`, state, audioExpiresAt.toISOString()]);
    assert.equal(scope.rowCount, 1);
    captures.set(id, { state, audioExpiresAt });
    return id;
  };

  let fixtureScope: FixtureScope;
  const seedCleanup = async (options: CleanupSeedOptions = {}): Promise<CleanupFixture> => {
    const id = randomUUID();
    const captureId = options.captureId ?? null;
    const objectCaptureId = captureId ?? randomUUID();
    const segmentIndex = obligationIds.length;
    const key = `${fixtureScope.tenantId}/${fixtureScope.projectId}/${fixtureScope.recordId}/${objectCaptureId}/v1/${segmentIndex}.webm`;
    const attemptId = `storage:${objectCaptureId}:v1:segment:${segmentIndex}`;
    const uploadOperationToken = options.uploadOperationToken === undefined ? randomUUID() : options.uploadOperationToken;
    const generation = options.generation ?? null;
    const sha = options.sha256 === undefined ? createHash('sha256').update('audio').digest('hex') : options.sha256;
    const bytes = options.bytes === undefined ? 5 : options.bytes;
    const uploadOutcome = options.uploadOutcome === undefined
      ? (uploadOperationToken === null ? null : generation === null ? 'unknown' : 'uploaded')
      : options.uploadOutcome;
    const dueAt = new Date(Date.now() + (options.dueInMs ?? -60_000));
    const uploadExpiresAt = new Date(Date.now() + (options.uploadExpiresInMs ?? -60_000));
    obligationIds.push(id);
    await admin.query(`
      INSERT INTO projed_core.meeting_artifact_cleanup
        (obligation_id,capture_id,attempt_id,kind,object_locator,state,storage_backend,
         upload_operation_token,upload_outcome,storage_generation,upload_sha256,upload_bytes,
         upload_token_expires_at,due_at)
      VALUES($1::uuid,$2::uuid,$3,'storage',$4,'pending','gcs',$5::uuid,$6,$7,$8,$9::bigint,$10::timestamptz,$11::timestamptz)
    `, [id, captureId, attemptId, key, uploadOperationToken, uploadOutcome, generation, sha, bytes,
      uploadExpiresAt.toISOString(), dueAt.toISOString()]);
    return { id, captureId, objectCaptureId, key, attemptId, uploadOperationToken, uploadOutcome, generation, sha256: sha, bytes };
  };

  try {
    await admin.connect();
    adminConnected = true;
    const project = await admin.query<{ tenantId: string; projectId: string }>(`
      SELECT tenant_id::text AS "tenantId", id::text AS "projectId"
      FROM projed_core.projects ORDER BY tenant_id,id LIMIT 1
    `);
    assert.equal(project.rowCount, 1, 'the isolated verifier needs one seeded project scope');
    const projectScope = project.rows[0];
    assert.ok(projectScope);
    recordId = randomUUID();
    fixtureScope = { ...projectScope, recordId };
    await admin.query(`
      INSERT INTO projed_core.knowledge_records
        (id,tenant_id,project_id,record_type,title,content,occurred_at,status,visibility,rag_enabled,metadata,created_by,updated_by)
      VALUES($1::uuid,$2::uuid,$3::uuid,'meeting','DEV-139 synthetic audio cleanup','Synthetic isolated QA record',
        now(),'draft','private',false,'{}'::jsonb,$4::uuid,$4::uuid)
    `, [recordId, fixtureScope.tenantId, fixtureScope.projectId, owner.localUserId]);

    const activeCaptureId = await seedCapture('recording', new Date(Date.now() + 2 * 60 * 60_000));
    const activeCapture = await seedCleanup({ captureId: activeCaptureId, uploadOperationToken: null, uploadOutcome: null,
      sha256: null, bytes: null, dueInMs: -60_000, uploadExpiresInMs: -60_000 });
    const dueNotReached = await seedCleanup({ dueInMs: 10 * 60_000 });
    const uploadNotExpired = await seedCleanup({ uploadExpiresInMs: 10 * 60_000 });

    const knownCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const knownBytes = Uint8Array.from(Buffer.from('audio'));
    const known = await seedCleanup({ captureId: knownCaptureId, generation: '41001',
      sha256: createHash('sha256').update(knownBytes).digest('hex'), bytes: knownBytes.byteLength });
    fake.put(known.key, { bytes: knownBytes, contentType: 'audio/webm', generation: '41001', size: knownBytes.byteLength });

    const missingCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const missingWithUploadToken = await seedCleanup({ captureId: missingCaptureId });

    const wrongHashCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const expectedBytes = Uint8Array.from(Buffer.from('abcde'));
    const wrongHash = await seedCleanup({ captureId: wrongHashCaptureId,
      sha256: createHash('sha256').update(expectedBytes).digest('hex'), bytes: expectedBytes.byteLength });
    fake.put(wrongHash.key, {
      bytes: Uint8Array.from(Buffer.from('vwxyz')), contentType: 'audio/webm', generation: '42001', size: expectedBytes.byteLength,
    });

    const readFailureCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const readFailure = await seedCleanup({ captureId: readFailureCaptureId,
      sha256: createHash('sha256').update(expectedBytes).digest('hex'), bytes: expectedBytes.byteLength });
    fake.put(readFailure.key, { bytes: expectedBytes, contentType: 'audio/webm', generation: '43001', size: expectedBytes.byteLength });
    fake.failRead(readFailure.key);

    const replacementCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const replacement = await seedCleanup({ captureId: replacementCaptureId, generation: '44001' });
    fake.put(replacement.key, { bytes: knownBytes, contentType: 'audio/webm', generation: '44002', size: knownBytes.byteLength });

    const raceCaptureId = await seedCapture('ready', new Date(Date.now() - 60_000));
    const race = await seedCleanup({ captureId: raceCaptureId });

    const parentProof = await seedCleanup({ captureId: activeCaptureId, generation: '45001' });
    const scanned = await repository.scan(20);
    for (const blocked of [activeCapture, dueNotReached, uploadNotExpired]) {
      assert.equal(scanned.includes(blocked.id), false, 'active capture, future due and live upload expiry must not be scanned');
      assert.equal(await repository.claim(blocked.id), null, 'a blocked cleanup obligation cannot be claimed');
    }
    assert.ok(scanned.includes(known.id), 'an eligible exact-generation obligation is visible to maintenance scan');

    for (const actor of [owner, outsider]) {
      await assert.rejects(runActorTransaction(database, config, actor, port => port.query(
        'SELECT projed_core.claim_meeting_audio_cleanup_v1($1::uuid,$2::uuid)', [known.id, randomUUID()],
      )), error => pgErrorCode(error) === '42501', 'business actor transactions cannot invoke maintenance claim');
    }

    const signal = new AbortController().signal;
    assert.deepEqual(await runMeetingAudioCleanupUnit({ repository, storage: fake.storage }, known.id, signal), { state: 'deleted' });
    assert.deepEqual(fake.deleteCalls().filter(call => call.key === known.key), [{ key: known.key, generation: '41001' }],
      'the only delete uses the immutable proven generation');
    const knownReadback = await admin.query<{ state: string; storage_generation: string; last_verified: boolean }>(`
      SELECT state,storage_generation,last_verified_at IS NOT NULL AS last_verified
      FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$1::uuid
    `, [known.id]);
    assert.deepEqual(knownReadback.rows, [{ state: 'deleted', storage_generation: '41001', last_verified: true }]);

    assert.deepEqual(await runMeetingAudioCleanupUnit({ repository, storage: fake.storage }, missingWithUploadToken.id, signal),
      { state: 'unknown' });
    const missingReadback = await admin.query<{ state: string; storage_generation: string | null }>(`
      SELECT state,storage_generation FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$1::uuid
    `, [missingWithUploadToken.id]);
    assert.deepEqual(missingReadback.rows, [{ state: 'unknown', storage_generation: null }],
      'a missing object with an upload operation token is unknown, never false-deleted');

    await runMeetingAudioCleanupUnit({ repository, storage: fake.storage }, wrongHash.id, signal);
    await runMeetingAudioCleanupUnit({ repository, storage: fake.storage }, readFailure.id, signal);
    const untrustedReadback = await admin.query<{ obligation_id: string; state: string; storage_generation: string | null }>(`
      SELECT obligation_id::text,state,storage_generation FROM projed_core.meeting_artifact_cleanup
      WHERE obligation_id=ANY($1::uuid[]) ORDER BY obligation_id
    `, [[wrongHash.id, readFailure.id]]);
    assert.equal(untrustedReadback.rowCount, 2);
    assert.ok(untrustedReadback.rows.every(row => row.state !== 'deleted' && row.storage_generation === null),
      'wrong hash and failed readback cannot be promoted to trusted storage generations');
    assert.deepEqual(fake.deleteCalls().filter(call => call.key === wrongHash.key || call.key === readFailure.key), [],
      'unverified bytes never issue provider DELETE');

    await runMeetingAudioCleanupUnit({ repository, storage: fake.storage }, replacement.id, signal);
    const replacementReadback = await admin.query<{ state: string; storage_generation: string | null }>(`
      SELECT state,storage_generation FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$1::uuid
    `, [replacement.id]);
    assert.deepEqual(replacementReadback.rows, [{ state: 'failed', storage_generation: '44001' }],
      'a replacement object cannot be deleted or replace the immutable recorded generation');
    assert.deepEqual(fake.deleteCalls().filter(call => call.key === replacement.key), []);

    const originalClaim = await repository.claim(race.id);
    assert.ok(originalClaim, 'eligible work should receive a server-generated lease');
    assert.equal(typeof originalClaim.leaseToken, 'string');
    assert.notEqual(originalClaim.leaseToken, '');
    assert.equal(await repository.claim(race.id), null, 'a different server-generated token cannot take over an unexpired lease');
    const expiredLease = await admin.query(`
      UPDATE projed_core.meeting_artifact_cleanup SET lease_expires_at=now()-interval '1 second',updated_at=now()
      WHERE obligation_id=$1::uuid AND lease_token=$2::uuid
    `, [race.id, originalClaim.leaseToken]);
    assert.equal(expiredLease.rowCount, 1);
    const replacementClaim = await repository.claim(race.id);
    assert.ok(replacementClaim);
    assert.notEqual(replacementClaim.leaseToken, originalClaim.leaseToken, 'expiry creates a fresh server lease token');
    assert.equal(await repository.finish(originalClaim, { kind: 'unknown', generation: null }), false,
      'an expired lease cannot finish after a newer token takes over');
    assert.equal(await repository.finish(replacementClaim, { kind: 'unknown', generation: null }), true);

    const lease = await database.checkout();
    try {
      await lease.client.query('BEGIN');
      // Exercise the RLS directly as well as the actor RPC rejection above.
      // The normal actor query port already rejects set_config; purpose alone
      // must still never widen an already-bound actor's metadata visibility.
      for (const phase of ['scan', 'claim', 'finish']) {
        await lease.client.query(`SELECT set_config('projed.actor_local_user_id',$1,true),
          set_config('projed.audio_cleanup_phase',$2,true),set_config('projed.audio_cleanup_id',$3,true),
          set_config('projed.audio_cleanup_capture',$4,true)`, [outsider.localUserId, phase, known.id, knownCaptureId]);
        const visible = await lease.client.query<{ captures: string; obligations: string }>(`
          SELECT (SELECT count(*)::text FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid) AS captures,
            (SELECT count(*)::text FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$2::uuid) AS obligations
        `, [knownCaptureId, known.id]);
        assert.deepEqual(visible.rows, [{ captures: '0', obligations: '0' }],
          `cleanup ${phase} purpose cannot widen an already-bound actor's metadata access`);
      }
      await lease.client.query(`SELECT set_config('projed.actor_local_user_id','',true),
        set_config('projed.audio_cleanup_phase','claim',true),set_config('projed.audio_cleanup_capture',$1,true)`, [knownCaptureId]);
      const exactCapture = await lease.client.query<{ id: string }>(`
        SELECT id::text FROM projed_core.meeting_capture_sessions WHERE id=ANY($1::uuid[]) ORDER BY id
      `, [[knownCaptureId, wrongHashCaptureId]]);
      assert.deepEqual(exactCapture.rows, [{ id: knownCaptureId }], 'claim reads only the exact obligation parent capture');
      await lease.client.query("SELECT set_config('projed.audio_cleanup_phase','finish',true)");
      const finishCapture = await lease.client.query<{ count: string }>(
        'SELECT count(*)::text FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid', [knownCaptureId],
      );
      assert.deepEqual(finishCapture.rows, [{ count: '0' }], 'metadata finish needs no parent capture read permission');
      await lease.client.query('ROLLBACK');

      await lease.client.query('BEGIN');
      await lease.client.query(`SELECT
        set_config('projed.actor_local_user_id','',true),
        set_config('projed.audio_cleanup_phase','caller-sentinel',true),
        set_config('projed.audio_cleanup_id','caller-id',true),
        set_config('projed.audio_cleanup_token','caller-token',true),
        set_config('projed.audio_cleanup_capture','caller-capture',true),
        set_config('projed.audio_cleanup_expected','{"state":"caller"}',true)`);
      await lease.client.query('SELECT projed_core.scan_meeting_audio_cleanup_v1(20)');
      const activeClaim = await lease.client.query<{ value: unknown }>(
        'SELECT projed_core.claim_meeting_audio_cleanup_v1($1::uuid,$2::uuid) AS value', [activeCapture.id, randomUUID()],
      );
      assert.equal(activeClaim.rows[0]?.value, null);
      await lease.client.query(
        "SELECT projed_core.finish_meeting_audio_cleanup_v1($1::uuid,$2::uuid,'{\"kind\":\"unknown\",\"generation\":null}'::jsonb)",
        [randomUUID(), randomUUID()],
      );
      const context = await lease.client.query<{
        phase: string; id: string; token: string; capture: string; expected: string; private_records: string; private_checkpoints: string;
      }>(`
        SELECT current_setting('projed.audio_cleanup_phase',true) AS phase,
          current_setting('projed.audio_cleanup_id',true) AS id,
          current_setting('projed.audio_cleanup_token',true) AS token,
          current_setting('projed.audio_cleanup_capture',true) AS capture,
          current_setting('projed.audio_cleanup_expected',true) AS expected,
          (SELECT count(*)::text FROM projed_core.knowledge_records) AS private_records,
          (SELECT count(*)::text FROM projed_core.meeting_llm_unit_checkpoints) AS private_checkpoints
      `);
      assert.deepEqual(context.rows, [{ phase: 'caller-sentinel', id: 'caller-id', token: 'caller-token', capture: 'caller-capture',
        expected: '{"state":"caller"}', private_records: '0', private_checkpoints: '0' }],
      'maintenance RPCs restore caller context and leave private record/checkpoint reads unavailable');
      await lease.client.query('ROLLBACK');

      await lease.client.query('BEGIN');
      await lease.client.query(`SELECT set_config('projed.actor_local_user_id','',true),
        set_config('projed.audio_cleanup_phase','claim',true),set_config('projed.audio_cleanup_id',$1,true),
        set_config('projed.audio_cleanup_token',$2,true),set_config('projed.audio_cleanup_expected','',true)`,
      [activeCapture.id, randomUUID()]);
      await assert.rejects(lease.client.query(`
        UPDATE projed_core.meeting_artifact_cleanup SET state='deleting' WHERE obligation_id=$1::uuid
      `, [activeCapture.id]), error => {
        const failure = error as { code?: string; message?: string };
        assert.equal(failure.code, '42501');
        assert.match(failure.message ?? '', /AUDIO_CLEANUP_WRITE_INVALID/u);
        return true;
      }, 'a column grant does not bypass the exact maintenance-phase guard');
      await lease.client.query('ROLLBACK');
    } catch (error) {
      try { await lease.client.query('ROLLBACK'); } catch { /* Preserve the original regression failure. */ }
      throw error;
    } finally {
      lease.release();
    }

    await admin.query('DELETE FROM projed_core.meeting_capture_sessions WHERE id=$1::uuid', [activeCaptureId]);
    captures.delete(activeCaptureId);
    const orphan = await admin.query<{
      capture_id: string | null; due_at: Date; state: string; upload_operation_token: string;
      upload_outcome: string; storage_generation: string; upload_sha256: string; upload_bytes: string;
    }>(`
      SELECT capture_id::text,due_at,state,upload_operation_token::text,upload_outcome,storage_generation,upload_sha256,upload_bytes::text
      FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=$1::uuid
    `, [parentProof.id]);
    assert.equal(orphan.rowCount, 1);
    const orphanRow = orphan.rows[0];
    assert.ok(orphanRow);
    assert.equal(orphanRow.capture_id, null, 'parent deletion detaches the storage obligation');
    assert.ok(new Date(orphanRow.due_at).getTime() >= Date.now() + 6 * 24 * 60 * 60_000 + 23 * 60 * 60_000,
      'deleting an active capture pushes cleanup at least seven days forward');
    assert.deepEqual({ state: orphanRow.state, upload_operation_token: orphanRow.upload_operation_token,
      upload_outcome: orphanRow.upload_outcome, storage_generation: orphanRow.storage_generation,
      upload_sha256: orphanRow.upload_sha256, upload_bytes: orphanRow.upload_bytes }, {
      state: 'pending', upload_operation_token: parentProof.uploadOperationToken, upload_outcome: 'uploaded',
      storage_generation: '45001', upload_sha256: parentProof.sha256, upload_bytes: String(parentProof.bytes),
    }, 'the orphan keeps its immutable upload proof and cleanup responsibility');
    assert.equal((await repository.scan(20)).includes(parentProof.id), false,
      'the newly anchored orphan remains outside the purge window');
    await verifyCatalog(database, config);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    if (adminConnected) {
      try {
        if (obligationIds.length > 0) {
          await admin.query('DELETE FROM projed_core.meeting_artifact_cleanup WHERE obligation_id=ANY($1::uuid[])', [obligationIds]);
        }
      } catch (error) { cleanupErrors.push(error); }
      try {
        if (captureIds.length > 0) {
          await admin.query('DELETE FROM projed_core.meeting_capture_sessions WHERE id=ANY($1::uuid[])', [captureIds]);
        }
      } catch (error) { cleanupErrors.push(error); }
      try {
        if (recordId) await admin.query('DELETE FROM projed_core.knowledge_records WHERE id=$1::uuid', [recordId]);
      } catch (error) { cleanupErrors.push(error); }
      try { await admin.end(); }
      catch (error) { cleanupErrors.push(error); }
    }
  }

  if (failed) {
    if (cleanupErrors.length > 0) throw new AggregateError([failure, ...cleanupErrors], 'Meeting audio cleanup verifier failed');
    throw failure;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Meeting audio cleanup fixture cleanup failed');
}
