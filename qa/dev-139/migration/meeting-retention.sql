-- Disposable target only. Reconcile the complete synthetic meeting ledger and
-- prove RLS/grants, same-capture/board foreign keys, and cleanup retention.
-- All temporary inserts, role probes, and deletes roll back at the end.
BEGIN;
-- This file checks explicit integrity failures immediately; the separate
-- meeting-reference-commit helper proves the default commit-time behavior.
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
  IF (SELECT count(*) FROM projed_core.meeting_capture_sessions) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_capture_segments) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_pointer_intervals) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_analysis_runs) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_transcript_segments) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_segment_resolutions) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_task_match_results) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_draft_projections) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_artifact_cleanup) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_ai_budget_months) <> 1
     OR (SELECT count(*) FROM projed_core.meeting_ai_usage_attempts) <> 4 THEN
    RAISE EXCEPTION 'meeting source fixture counts were not retained';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_capture_sessions
        WHERE id = 'a1234567-1234-4234-8234-123456789001'
          AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND record_id = '23456789-1234-4234-8234-123456789002'
          AND state = 'ready' AND source_version = 7
          AND review_revision = 2
          AND final_pointer_sequence = 9007199254740993::bigint
          AND epoch_manifest = '[{"epoch":0,"startedAt":"2026-03-01T10:00:00.123456Z","endedAt":"2026-03-01T10:05:00.654321Z"}]'::jsonb
          AND started_at = '2026-03-01T10:00:00.123456Z'::timestamptz
          AND stopped_at = '2026-03-01T10:05:00.654321Z'::timestamptz
          AND audio_expires_at = '2026-03-08T10:05:00.654321Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_capture_sessions
        WHERE id = 'a1234567-1234-4234-8234-123456789002'
          AND state = 'cancelled' AND source_completeness = 'missing'
          AND pointer_loss AND source_gaps = '[{"reason":"synthetic-device-ended"}]'::jsonb
          AND active_transcript_revision_id IS NULL
     ) THEN
    RAISE EXCEPTION 'capture identity, state, bigint, JSON, or microsecond values were not retained';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_capture_segments
        WHERE id = 'a2234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND source_version = 7 AND segment_index = 0 AND bytes = 1234567
          AND upload_state = 'verified'
          AND object_path = 'synthetic/meeting/a1234567/segment-000.webm'
          AND sha256 = repeat('a', 64)
          AND verified_at = '2026-03-01T10:05:02.123456Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_pointer_intervals
        WHERE id = 'a3234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND canonical_task_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
          AND sequence = 9007199254740993::bigint
          AND created_at = '2026-03-01T10:02:03.123456Z'::timestamptz
     ) THEN
    RAISE EXCEPTION 'segment or pointer identity/scope/bigint/microseconds were not retained';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_analysis_runs
        WHERE id = 'a4234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND source_version = 7 AND state = 'ready' AND provider_mode = 'fake'
          AND stage_cursor = '9007199254740993.1234567890123456789'::jsonb
          AND jsonb_typeof(stage_cursor) = 'number'
          AND reserved_twd_micros = 3000000 AND actual_twd_micros = 1500000
          AND upload_completed_at = '2026-03-01T10:05:00.654321Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_transcript_segments
        WHERE id = 'a5234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND producer_run_id = 'a4234567-1234-4234-8234-123456789001'
          AND raw_text = 'Synthetic transcript: review the main task and confirm the next action.'
          AND source_hash = 'synthetic-transcript-source-hash-v1'
          AND created_at = '2026-03-01T10:06:00.123456Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_transcript_segments
        WHERE id = 'a5234567-1234-4234-8234-123456789002'
          AND capture_id = 'a1234567-1234-4234-8234-123456789002'
          AND producer_run_id = 'a4234567-1234-4234-8234-123456789002'
          AND raw_text = 'Synthetic cancelled-run partial transcript.'
     ) THEN
    RAISE EXCEPTION 'run/transcript identities, same-capture provenance, JSON number, or timestamps were not retained';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_segment_resolutions
        WHERE id = 'a6234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND transcript_segment_id = 'a5234567-1234-4234-8234-123456789001'
          AND latest_run_id = 'a4234567-1234-4234-8234-123456789001'
          AND resolution_state = 'accepted' AND human_reviewed
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_task_match_results
        WHERE id = 'a7234567-1234-4234-8234-123456789001'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          AND project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND resolution_id = 'a6234567-1234-4234-8234-123456789001'
          AND task_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
          AND semantic_score = 0.123456789012345678901234567890::numeric
          AND pointer_feature = 0.987654321098765432109876543210::numeric
          AND decision = 'accepted' AND decision_source = 'human'
          AND corrected_at = '2026-03-01T10:06:03.123456Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_draft_projections
        WHERE record_id = '23456789-1234-4234-8234-123456789002'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND applied_run_id = 'a4234567-1234-4234-8234-123456789001'
          AND auto_link_set = 'null'::jsonb AND jsonb_typeof(auto_link_set) = 'null'
          AND manual_link_set = '[{"taskId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1","source":"human"}]'::jsonb
          AND updated_at = '2026-03-01T10:06:04.654321Z'::timestamptz
     ) THEN
    RAISE EXCEPTION 'resolution, task match numeric precision, or draft projection state was not retained';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_artifact_cleanup
        WHERE obligation_id = 'a9234567-1234-4234-8234-123456789001'
          AND capture_id IS NULL AND run_id IS NULL
          AND kind = 'provider' AND external_file_id = 'synthetic-provider-file-id-001'
          AND state = 'failed' AND attempts = 3
          AND error_code = 'PROVIDER_CLEANUP_ADAPTER_REQUIRED'
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_artifact_cleanup
        WHERE obligation_id = 'a9234567-1234-4234-8234-123456789002'
          AND capture_id = 'a1234567-1234-4234-8234-123456789002'
          AND run_id = 'a4234567-1234-4234-8234-123456789002'
          AND object_locator = 'synthetic/meeting/a1234567/segment-pending.webm'
          AND kind = 'storage' AND state = 'pending'
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_budget_months
        WHERE budget_month = '2026-03-01' AND limit_twd_micros = 9007199254740993::bigint
          AND reserved_twd_micros = 4000000 AND spent_twd_micros = 5000000
          AND updated_at = '2026-03-31T23:59:59.123456Z'::timestamptz
     ) THEN
    RAISE EXCEPTION 'detached cleanup obligation or monthly budget ledger was not retained';
  END IF;

  IF COALESCE((SELECT array_agg(usage_state ORDER BY usage_state)
                 FROM projed_core.meeting_ai_usage_attempts), ARRAY[]::text[])
       IS DISTINCT FROM ARRAY['known','reconciled','reserved','unknown']::text[]
     OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-reserved'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND run_id = 'a4234567-1234-4234-8234-123456789001'
          AND usage_state = 'reserved' AND reserved_twd_micros = 1000000
          AND actual_twd_micros IS NULL
          AND updated_at = '2026-03-01T10:05:03.123456Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-known'
          AND capture_id = 'a1234567-1234-4234-8234-123456789001'
          AND run_id = 'a4234567-1234-4234-8234-123456789001'
          AND usage_state = 'known' AND reserved_twd_micros = 2000000
          AND actual_twd_micros = 1500000 AND outcome = 'synthetic-ready'
          AND updated_at = '2026-03-01T10:05:05.654321Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-unknown'
          AND capture_id = 'a1234567-1234-4234-8234-123456789002'
          AND run_id = 'a4234567-1234-4234-8234-123456789002'
          AND usage_state = 'unknown' AND reserved_twd_micros = 3000000
          AND actual_twd_micros IS NULL AND outcome = 'synthetic-outcome-unknown'
          AND updated_at = '2026-03-02T10:00:06.654321Z'::timestamptz
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-reconciled-orphan'
          AND capture_id = 'a1234567-1234-4234-8234-123456789099'
          AND run_id = 'a4234567-1234-4234-8234-123456789099'
          AND usage_state = 'reconciled' AND reserved_twd_micros = 4000000
          AND actual_twd_micros = 3500000
          AND updated_at = '2026-03-04T10:00:06.654321Z'::timestamptz
     ) THEN
    RAISE EXCEPTION 'usage attempt status set or orphan UUIDs were not retained';
  END IF;
END $$;

-- Every retained table is FORCE RLS. The one-time importer gets only SELECT
-- and INSERT; runtime, PUBLIC, and the migration role get no table data access.
DO $$
DECLARE
  v_name text;
  v_relation regclass;
  v_rls boolean;
  v_force boolean;
  v_privilege text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'projed_core.meeting_capture_sessions',
    'projed_core.meeting_capture_segments',
    'projed_core.meeting_pointer_intervals',
    'projed_core.meeting_analysis_runs',
    'projed_core.meeting_transcript_segments',
    'projed_core.meeting_segment_resolutions',
    'projed_core.meeting_task_match_results',
    'projed_core.meeting_draft_projections',
    'projed_core.meeting_artifact_cleanup',
    'projed_core.meeting_ai_budget_months',
    'projed_core.meeting_ai_usage_attempts'
  ] LOOP
    v_relation := to_regclass(v_name);
    IF v_relation IS NULL THEN RAISE EXCEPTION 'missing retained meeting table: %', v_name; END IF;
    SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
      FROM pg_class WHERE oid = v_relation;
    IF v_rls IS DISTINCT FROM true OR v_force IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'meeting table is not FORCE RLS: %', v_name;
    END IF;
    IF NOT has_table_privilege('projed_importer_disposable', v_relation, 'SELECT')
       OR NOT has_table_privilege('projed_importer_disposable', v_relation, 'INSERT') THEN
      RAISE EXCEPTION 'snapshot importer lacks SELECT/INSERT on %', v_name;
    END IF;
    FOREACH v_privilege IN ARRAY ARRAY['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('projed_importer_disposable', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'snapshot importer has forbidden % privilege on %', v_privilege, v_name;
      END IF;
    END LOOP;
    FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('projed_runtime_disposable', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'runtime has forbidden % privilege on %', v_privilege, v_name;
      END IF;
      IF has_table_privilege('projed_migrator_disposable', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'migration role has unexpected % privilege on %', v_privilege, v_name;
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
       WHERE c.oid = v_relation
         AND acl.grantee = 0::oid
    ) THEN
      RAISE EXCEPTION 'PUBLIC has a table privilege on %', v_name;
    END IF;
  END LOOP;
END $$;

-- Exercise the importer's read/insert path and prove update/delete are denied.
SET LOCAL ROLE projed_importer_disposable;
DO $$
BEGIN
  IF (SELECT count(*) FROM projed_core.meeting_capture_sessions) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_ai_usage_attempts) <> 4 THEN
    RAISE EXCEPTION 'snapshot importer cannot read the retained source projection';
  END IF;
END $$;
INSERT INTO projed_core.meeting_ai_budget_months (
  budget_month, limit_twd_micros, reserved_twd_micros, spent_twd_micros, updated_at
) VALUES ('2026-04-01', 1000000000, 0, 0, '2026-04-01T00:00:00Z');
DO $$
BEGIN
  BEGIN
    UPDATE projed_core.meeting_ai_budget_months
       SET spent_twd_micros = 1 WHERE budget_month = '2026-04-01';
    RAISE EXCEPTION 'snapshot importer UPDATE was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM projed_core.meeting_ai_budget_months WHERE budget_month = '2026-04-01';
    RAISE EXCEPTION 'snapshot importer DELETE was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Runtime receives neither SELECT nor DML on raw meeting or global ledger rows.
SET LOCAL ROLE projed_runtime_disposable;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM projed_core.meeting_capture_sessions LIMIT 1;
    RAISE EXCEPTION 'runtime SELECT on raw meeting capture was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO projed_core.meeting_ai_budget_months (budget_month)
    VALUES ('2026-05-01');
    RAISE EXCEPTION 'runtime INSERT on meeting budget ledger was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- These inserts isolate each same-capture or same-board composite foreign key.
DO $$
BEGIN
  BEGIN
    INSERT INTO projed_core.meeting_transcript_segments (
      id, capture_id, transcript_revision_id, producer_run_id, segment_index,
      source_audio_ranges, start_offset_ms, end_offset_ms, raw_text,
      normalized_text, word_offsets, source_hash, created_at
    ) VALUES (
      'a5234567-1234-4234-8234-123456789091',
      'a1234567-1234-4234-8234-123456789001',
      'a5334567-1234-4234-8234-123456789091',
      'a4234567-1234-4234-8234-123456789002', 91,
      '[]'::jsonb, 1, 2, 'synthetic invalid producer scope',
      'synthetic invalid producer scope', '[]'::jsonb,
      'synthetic-invalid-producer-scope', '2026-03-05T00:00:00Z'
    );
    RAISE EXCEPTION 'transcript producer from another capture was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_segment_resolutions (
      id, capture_id, transcript_segment_id, latest_run_id,
      resolution_state, config_version
    ) VALUES (
      'a6234567-1234-4234-8234-123456789091',
      'a1234567-1234-4234-8234-123456789001',
      'a5234567-1234-4234-8234-123456789002',
      'a4234567-1234-4234-8234-123456789001', 'pending', 'fixture-negative'
    );
    RAISE EXCEPTION 'resolution transcript from another capture was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE projed_core.meeting_segment_resolutions
       SET latest_run_id = 'a4234567-1234-4234-8234-123456789002'
     WHERE id = 'a6234567-1234-4234-8234-123456789001';
    RAISE EXCEPTION 'resolution latest run from another capture was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_pointer_intervals (
      id, capture_id, clock_epoch, sequence, canonical_task_id, surface_kind,
      started_offset_ms, ended_offset_ms, visible, termination_reason,
      batch_key, batch_digest, tenant_id, project_id
    ) VALUES (
      'a3234567-1234-4234-8234-123456789091',
      'a1234567-1234-4234-8234-123456789001', 0, 91,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9', 'task-row', 1, 2, true,
      'fixture-cross-board', 'fixture-cross-board', repeat('c', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'pointer task from another board was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_task_match_results (
      id, resolution_id, task_id, ai_suggestion_version, capture_id,
      tenant_id, project_id
    ) VALUES (
      'a7234567-1234-4234-8234-123456789091',
      'a6234567-1234-4234-8234-123456789001',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9', 'fixture-negative',
      'a1234567-1234-4234-8234-123456789001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'match task from another board was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE projed_core.meeting_draft_projections
       SET applied_run_id = 'a4234567-1234-4234-8234-123456789002'
     WHERE record_id = '23456789-1234-4234-8234-123456789002';
    RAISE EXCEPTION 'projection applied run from another capture was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- Independent referenced objects cannot be deleted. This is distinct from a
-- whole Board cascade, which the existing LLM/document/product checks exercise.
DO $$
DECLARE v_constraint text;
BEGIN
  BEGIN
    DELETE FROM projed_core.wbs_items
     WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    RAISE EXCEPTION 'deleting a task with retained meeting evidence was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint NOT IN (
      'meeting_pointer_intervals_tenant_id_project_id_canonical_t_fkey',
      'meeting_task_match_results_tenant_id_project_id_task_id_fkey'
    ) THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM projed_core.meeting_analysis_runs
     WHERE id = 'a4234567-1234-4234-8234-123456789001';
    RAISE EXCEPTION 'deleting a run with retained transcript/review was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- Deleting a parent may detach cleanup references, but must not discard either
-- the storage/provider obligation or usage ledger rows. The savepoint restores
-- the original imported snapshot before the final rollback.
SAVEPOINT meeting_parent_cleanup_retention;
DELETE FROM projed_core.meeting_transcript_segments
 WHERE id = 'a5234567-1234-4234-8234-123456789002';
DELETE FROM projed_core.meeting_analysis_runs
 WHERE id = 'a4234567-1234-4234-8234-123456789002';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projed_core.meeting_artifact_cleanup
     WHERE obligation_id = 'a9234567-1234-4234-8234-123456789002'
       AND capture_id = 'a1234567-1234-4234-8234-123456789002'
       AND run_id IS NULL
       AND object_locator = 'synthetic/meeting/a1234567/segment-pending.webm'
       AND state = 'pending'
  ) THEN
    RAISE EXCEPTION 'run deletion did not detach only the cleanup run reference';
  END IF;
END $$;
DELETE FROM projed_core.meeting_capture_sessions
 WHERE id = 'a1234567-1234-4234-8234-123456789002';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions
              WHERE id = 'a1234567-1234-4234-8234-123456789002')
     OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_artifact_cleanup
        WHERE obligation_id = 'a9234567-1234-4234-8234-123456789002'
          AND capture_id IS NULL AND run_id IS NULL
          AND attempt_id = 'synthetic-attached-storage-attempt'
          AND object_locator = 'synthetic/meeting/a1234567/segment-pending.webm'
          AND state = 'pending'
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-unknown'
          AND capture_id = 'a1234567-1234-4234-8234-123456789002'
          AND run_id = 'a4234567-1234-4234-8234-123456789002'
          AND usage_state = 'unknown' AND reserved_twd_micros = 3000000
     ) OR NOT EXISTS (
       SELECT 1 FROM projed_core.meeting_ai_usage_attempts
        WHERE attempt_id = 'synthetic-attempt-reconciled-orphan'
          AND capture_id = 'a1234567-1234-4234-8234-123456789099'
          AND run_id = 'a4234567-1234-4234-8234-123456789099'
          AND usage_state = 'reconciled'
     ) THEN
    RAISE EXCEPTION 'parent deletion lost cleanup obligations or usage accounting state';
  END IF;
END $$;
ROLLBACK TO SAVEPOINT meeting_parent_cleanup_retention;
RELEASE SAVEPOINT meeting_parent_cleanup_retention;

DO $$
BEGIN
  IF (SELECT count(*) FROM projed_core.meeting_capture_sessions) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_analysis_runs) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_artifact_cleanup) <> 2
     OR (SELECT count(*) FROM projed_core.meeting_ai_usage_attempts) <> 4
     OR NOT EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions
                     WHERE id = 'a1234567-1234-4234-8234-123456789002') THEN
    RAISE EXCEPTION 'meeting cleanup savepoint failed to restore fixture state';
  END IF;
END $$;

ROLLBACK;
