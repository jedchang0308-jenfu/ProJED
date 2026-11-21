import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { loadRuntimeConfig } from '../../../server/config.js';

const config = loadRuntimeConfig();
if (config.env !== 'disposable') throw new Error('TARGET_NOT_DISPOSABLE');

const adminUrl = new URL(process.env.PROJED_QA_TARGET_ADMIN_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol)
    || adminUrl.hostname !== '127.0.0.1'
    || Number(adminUrl.port) !== config.binding.databasePort
    || adminUrl.pathname !== `/${config.binding.databaseName}`
    || adminUrl.username !== 'postgres'
    || adminUrl.password.length === 0
    || adminUrl.search !== ''
    || adminUrl.hash !== '') {
  throw new Error('TARGET_ADMIN_BINDING_MISMATCH');
}

const admin = new pg.Client({ connectionString: adminUrl.toString() });
const ownerId = '11111111-1111-4111-8111-111111111111';
const ids = {
  workspaceId: randomUUID(),
  boardId: randomUUID(),
  taskId: randomUUID(),
  recordId: randomUUID(),
  captureId: randomUUID(),
  runId: randomUUID(),
  transcriptId: randomUUID(),
  resolutionId: randomUUID(),
  pointerId: randomUUID(),
  matchId: randomUUID(),
};
const createdAt = new Date().toISOString();
let currentCheck = 'connect-and-verify-owner';
let connected = false;
let failure: unknown;
let failureCheck: string | undefined;
const cleanupFailures: Array<{ check: string; code: string }> = [];

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)
    ? code
    : 'UNEXPECTED_ERROR';
}

function assertEqual(actual: unknown, expected: unknown, code: string): void {
  if (!Object.is(actual, expected)) fail(code);
}

async function assertFixtureRows(
  expected: 0 | 1,
  label: string,
  expectedWorkspace: 0 | 1 = expected,
): Promise<void> {
  const result = await admin.query<{
    workspace_count: number;
    board_count: number;
    task_count: number;
    record_count: number;
    capture_count: number;
    run_count: number;
    transcript_count: number;
    resolution_count: number;
    pointer_count: number;
    match_count: number;
    projection_count: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM projed_core.tenants WHERE id = $1::uuid AND owner_id = $2::uuid) AS workspace_count,
      (SELECT count(*)::int FROM projed_core.projects WHERE id = $3::uuid AND tenant_id = $1::uuid) AS board_count,
      (SELECT count(*)::int FROM projed_core.wbs_items WHERE id = $4::uuid AND tenant_id = $1::uuid AND project_id = $3::uuid) AS task_count,
      (SELECT count(*)::int FROM projed_core.knowledge_records WHERE id = $5::uuid AND tenant_id = $1::uuid AND project_id = $3::uuid) AS record_count,
      (SELECT count(*)::int FROM projed_core.meeting_capture_sessions WHERE id = $6::uuid AND tenant_id = $1::uuid AND project_id = $3::uuid AND record_id = $5::uuid) AS capture_count,
      (SELECT count(*)::int FROM projed_core.meeting_analysis_runs WHERE id = $7::uuid AND capture_id = $6::uuid) AS run_count,
      (SELECT count(*)::int FROM projed_core.meeting_transcript_segments WHERE id = $8::uuid AND capture_id = $6::uuid AND producer_run_id = $7::uuid) AS transcript_count,
      (SELECT count(*)::int FROM projed_core.meeting_segment_resolutions WHERE id = $9::uuid AND capture_id = $6::uuid AND transcript_segment_id = $8::uuid AND latest_run_id = $7::uuid) AS resolution_count,
      (SELECT count(*)::int FROM projed_core.meeting_pointer_intervals WHERE id = $10::uuid AND capture_id = $6::uuid AND canonical_task_id = $4::uuid) AS pointer_count,
      (SELECT count(*)::int FROM projed_core.meeting_task_match_results WHERE id = $11::uuid AND capture_id = $6::uuid AND resolution_id = $9::uuid AND task_id = $4::uuid) AS match_count,
      (SELECT count(*)::int FROM projed_core.meeting_draft_projections WHERE record_id = $5::uuid AND capture_id = $6::uuid AND applied_run_id = $7::uuid) AS projection_count
  `, [
    ids.workspaceId, ownerId, ids.boardId, ids.taskId, ids.recordId, ids.captureId,
    ids.runId, ids.transcriptId, ids.resolutionId, ids.pointerId, ids.matchId,
  ]);
  const row = result.rows[0];
  if (!row) fail(`${label}_READBACK_MISSING`);
  for (const [key, value] of Object.entries(row)) {
    assertEqual(value, key === 'workspace_count' ? expectedWorkspace : expected, `${label}_${key.toUpperCase()}_MISMATCH`);
  }
}

async function expectDeferredReferenceFailure(
  label: string,
  statement: string,
  values: readonly unknown[],
): Promise<void> {
  currentCheck = `${label}-delete-then-commit-23503`;
  await admin.query('BEGIN');
  let transactionFinished = false;
  try {
    const deleted = await admin.query(statement, [...values]);
    assertEqual(deleted.rowCount, 1, `${label.toUpperCase()}_DELETE_ROW_MISSING`);
    try {
      await admin.query('COMMIT');
      transactionFinished = true;
      fail(`${label.toUpperCase()}_COMMIT_UNEXPECTEDLY_SUCCEEDED`);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== '23503') {
        throw error;
      }
      await admin.query('ROLLBACK');
      transactionFinished = true;
    }
  } finally {
    if (!transactionFinished) {
      await admin.query('ROLLBACK');
    }
  }
  currentCheck = `${label}-fixture-preserved`;
  await assertFixtureRows(1, label);
}

async function run(): Promise<void> {
  await admin.connect();
  connected = true;

  const owner = await admin.query<{ id: string }>(
    'SELECT id::text FROM projed_core.profiles WHERE id = $1::uuid',
    [ownerId],
  );
  assertEqual(owner.rowCount, 1, 'SYNTHETIC_OWNER_PROFILE_MISSING');

  currentCheck = 'create-owned-meeting-fixture';
  await admin.query('BEGIN');
  try {
    await admin.query(`
      INSERT INTO projed_core.tenants (id, legacy_workspace_id, title, owner_id, created_at)
      VALUES ($1::uuid, $2, 'DEV-139 meeting reference commit fixture', $3::uuid, $4::timestamptz)
    `, [ids.workspaceId, `qa-meeting-${ids.workspaceId.replaceAll('-', '')}`, ownerId, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.projects (id, tenant_id, legacy_board_id, title, created_at)
      VALUES ($1::uuid, $2::uuid, $3, 'DEV-139 meeting reference commit fixture', $4::timestamptz)
    `, [ids.boardId, ids.workspaceId, `qa-board-${ids.boardId.replaceAll('-', '')}`, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.wbs_items (
        id, tenant_id, project_id, legacy_task_id, title, status, sort_order, created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'DEV-139 meeting reference task', 'todo', 0, $5::timestamptz, $5::timestamptz)
    `, [ids.taskId, ids.workspaceId, ids.boardId, `qa-task-${ids.taskId.replaceAll('-', '')}`, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.knowledge_records (
        id, tenant_id, project_id, record_type, title, content, occurred_at,
        status, visibility, created_by, created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'meeting', 'DEV-139 meeting reference fixture',
        'Synthetic retention fixture', $4::timestamptz, 'draft', 'project', $5::uuid, $4::timestamptz, $4::timestamptz)
    `, [ids.recordId, ids.workspaceId, ids.boardId, createdAt, ownerId]);
    await admin.query(`
      INSERT INTO projed_core.meeting_capture_sessions (
        id, tenant_id, project_id, record_id, created_by, idempotency_key, created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::timestamptz, $7::timestamptz)
    `, [ids.captureId, ids.workspaceId, ids.boardId, ids.recordId, ownerId, `qa-${ids.captureId}`, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.meeting_analysis_runs (
        id, capture_id, source_version, request_key, config_version, created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, 1, $3, 'qa-reference-commit-v1', $4::timestamptz, $4::timestamptz)
    `, [ids.runId, ids.captureId, `qa-${ids.runId}`, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.meeting_transcript_segments (
        id, capture_id, transcript_revision_id, producer_run_id, segment_index, start_offset_ms, end_offset_ms,
        raw_text, normalized_text, source_hash, created_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 0, 0, 1,
        'Synthetic commit reference transcript', 'Synthetic commit reference transcript', $5, $6::timestamptz)
    `, [ids.transcriptId, ids.captureId, randomUUID(), ids.runId, `qa-${ids.transcriptId}`, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.meeting_segment_resolutions (
        id, capture_id, transcript_segment_id, latest_run_id, config_version, created_at, updated_at
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'qa-reference-commit-v1', $5::timestamptz, $5::timestamptz)
    `, [ids.resolutionId, ids.captureId, ids.transcriptId, ids.runId, createdAt]);
    await admin.query(`
      INSERT INTO projed_core.meeting_pointer_intervals (
        id, capture_id, clock_epoch, sequence, canonical_task_id, surface_kind,
        started_offset_ms, ended_offset_ms, visible, termination_reason,
        batch_key, batch_digest, created_at, tenant_id, project_id
      ) VALUES ($1::uuid, $2::uuid, 0, 1, $3::uuid, 'qa', 0, 1, true, 'qa', $4, $5,
        $6::timestamptz, $7::uuid, $8::uuid)
    `, [ids.pointerId, ids.captureId, ids.taskId, `qa-${ids.pointerId}`, 'a'.repeat(64), createdAt, ids.workspaceId, ids.boardId]);
    await admin.query(`
      INSERT INTO projed_core.meeting_task_match_results (
        id, resolution_id, task_id, ai_suggestion_version, capture_id, tenant_id, project_id
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'qa-reference-commit-v1', $4::uuid, $5::uuid, $6::uuid)
    `, [ids.matchId, ids.resolutionId, ids.taskId, ids.captureId, ids.workspaceId, ids.boardId]);
    await admin.query(`
      INSERT INTO projed_core.meeting_draft_projections (record_id, capture_id, applied_run_id, updated_at)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz)
    `, [ids.recordId, ids.captureId, ids.runId, createdAt]);
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }

  currentCheck = 'fixture-readback-before-delete';
  await assertFixtureRows(1, 'fixture-before-delete');

  await expectDeferredReferenceFailure(
    'task',
    'DELETE FROM projed_core.wbs_items WHERE id = $1::uuid AND tenant_id = $2::uuid AND project_id = $3::uuid',
    [ids.taskId, ids.workspaceId, ids.boardId],
  );
  await expectDeferredReferenceFailure(
    'run',
    'DELETE FROM projed_core.meeting_analysis_runs WHERE id = $1::uuid AND capture_id = $2::uuid',
    [ids.runId, ids.captureId],
  );
  await expectDeferredReferenceFailure(
    'capture',
    'DELETE FROM projed_core.meeting_capture_sessions WHERE id = $1::uuid AND tenant_id = $2::uuid AND project_id = $3::uuid AND record_id = $4::uuid',
    [ids.captureId, ids.workspaceId, ids.boardId, ids.recordId],
  );

  currentCheck = 'board-delete-cascade-commit';
  await admin.query('BEGIN');
  try {
    const deleted = await admin.query(
      'DELETE FROM projed_core.projects WHERE id = $1::uuid AND tenant_id = $2::uuid',
      [ids.boardId, ids.workspaceId],
    );
    assertEqual(deleted.rowCount, 1, 'OWNED_BOARD_DELETE_ROW_MISSING');
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }

  currentCheck = 'board-cascade-readback';
  await assertFixtureRows(0, 'board-cascade', 1);
}

try {
  await run();
} catch (error) {
  failure = error;
  failureCheck = currentCheck;
} finally {
  if (connected) {
    try { await admin.query('ROLLBACK'); } catch { /* no open transaction */ }
    try {
      currentCheck = 'cleanup-owned-workspace';
      await admin.query(
        'DELETE FROM projed_core.tenants WHERE id = $1::uuid AND owner_id = $2::uuid',
        [ids.workspaceId, ownerId],
      );
      const remaining = await admin.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM projed_core.tenants WHERE id = $1::uuid AND owner_id = $2::uuid',
        [ids.workspaceId, ownerId],
      );
      assertEqual(remaining.rows[0]?.count, 0, 'OWNED_WORKSPACE_CLEANUP_FAILED');
    } catch (error) {
      cleanupFailures.push({ check: currentCheck, code: errorCode(error) });
      if (failure === undefined) {
        failure = error;
        failureCheck = currentCheck;
      }
    }
    try { await admin.end(); } catch (error) {
      cleanupFailures.push({ check: 'close-owned-client', code: errorCode(error) });
      if (failure === undefined) {
        failure = error;
        failureCheck = currentCheck;
      }
    }
  }
}

if (failure !== undefined) {
  console.log(JSON.stringify({ status: 'FAIL', check: failureCheck ?? currentCheck, code: errorCode(failure), cleanupFailures }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'PASS',
    evidenceLevel: 'DEV139_LOCAL_MEETING_REFERENCE_COMMIT_COMPATIBILITY',
    checks: [
      'target-disposable-loopback-binding',
      'synthetic-owner-profile-present',
      'task-delete-rejected-at-commit-and-fixture-preserved',
      'run-delete-rejected-at-commit-and-fixture-preserved',
      'capture-delete-rejected-at-commit-and-fixture-preserved',
      'board-delete-cascade-committed',
      'owned-meeting-rows-cascade-removed',
      'owned-workspace-cleaned',
    ],
  }));
}
