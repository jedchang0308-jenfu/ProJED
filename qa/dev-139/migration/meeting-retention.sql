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
-- and INSERT on the imported snapshot; private LLM checkpoints remain runtime-only.
-- Runtime receives exact column/table grants while scoped policies apply; PUBLIC
-- and migrator stay closed.
DO $$
DECLARE
  v_name text;
  v_relation regclass;
  v_rls boolean;
  v_force boolean;
  v_privilege text;
  v_column text;
  v_columns text[];
  v_expected_insert text[];
  v_expected_update text[];
  v_expected_select text[];
  v_expected_table_select boolean;
  v_expected_privilege boolean;
  v_function text;
  v_function_oid regprocedure;
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
    'projed_core.meeting_ai_usage_attempts',
    'projed_core.meeting_llm_unit_checkpoints'
  ] LOOP
    v_relation := to_regclass(v_name);
    IF v_relation IS NULL THEN RAISE EXCEPTION 'missing retained meeting table: %', v_name; END IF;
    SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
      FROM pg_class WHERE oid = v_relation;
    IF v_rls IS DISTINCT FROM true OR v_force IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'meeting table is not FORCE RLS: %', v_name;
    END IF;
    IF v_name='projed_core.meeting_llm_unit_checkpoints' AND (
      (SELECT count(*) FROM pg_policy WHERE polrelid=v_relation)<>2
      OR NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid=v_relation AND p.polname='meeting_llm_private_read_v1'
          AND p.polcmd='r' AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='projed_runtime_disposable')]::oid[]
          AND p.polqual IS NOT NULL
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid=v_relation AND p.polname='meeting_llm_private_insert_v1'
          AND p.polcmd='a' AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='projed_runtime_disposable')]::oid[]
          AND p.polwithcheck IS NOT NULL
      )
    ) THEN RAISE EXCEPTION 'private LLM checkpoint RLS policies are not exact'; END IF;
    IF v_name='projed_core.meeting_llm_unit_checkpoints' THEN
      IF has_table_privilege('projed_importer_disposable',v_relation,'SELECT')
         OR has_table_privilege('projed_importer_disposable',v_relation,'INSERT') THEN
        RAISE EXCEPTION 'snapshot importer has access to private LLM checkpoints';
      END IF;
    ELSIF NOT has_table_privilege('projed_importer_disposable', v_relation, 'SELECT')
       OR NOT has_table_privilege('projed_importer_disposable', v_relation, 'INSERT') THEN
      RAISE EXCEPTION 'snapshot importer lacks SELECT/INSERT on %', v_name;
    END IF;
    FOREACH v_privilege IN ARRAY ARRAY['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('projed_importer_disposable', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'snapshot importer has forbidden % privilege on %', v_privilege, v_name;
      END IF;
    END LOOP;

    v_expected_table_select := v_name = ANY (ARRAY[
      'projed_core.meeting_capture_sessions',
      'projed_core.meeting_capture_segments',
      'projed_core.meeting_pointer_intervals',
      'projed_core.meeting_analysis_runs',
      'projed_core.meeting_transcript_segments',
      'projed_core.meeting_segment_resolutions',
      'projed_core.meeting_task_match_results',
      'projed_core.meeting_draft_projections',
      'projed_core.meeting_llm_unit_checkpoints'
    ]::text[]);
    v_expected_insert := CASE v_name
      WHEN 'projed_core.meeting_capture_sessions' THEN ARRAY[
        'id','tenant_id','project_id','record_id','created_by','idempotency_key','state','last_progress_at','started_at'
      ]::text[]
      WHEN 'projed_core.meeting_capture_segments' THEN ARRAY[
        'id','capture_id','segment_index','epoch','start_offset_ms','end_offset_ms','overlap_ms','gap_before_ms',
        'object_path','mime','bytes','source_version','reservation_key','upload_token_expires_at','storage_backend'
      ]::text[]
      WHEN 'projed_core.meeting_pointer_intervals' THEN ARRAY[
        'id','capture_id','clock_epoch','sequence','canonical_task_id','surface_kind','started_offset_ms',
        'ended_offset_ms','visible','termination_reason','batch_key','batch_digest','tenant_id','project_id'
      ]::text[]
      WHEN 'projed_core.meeting_artifact_cleanup' THEN ARRAY[
        'obligation_id','capture_id','attempt_id','kind','object_locator','state',
        'upload_token_expires_at','due_at','storage_backend'
      ]::text[]
      WHEN 'projed_core.meeting_analysis_runs' THEN ARRAY[
        'id','capture_id','source_version','request_key','config_version','state','resume_stage',
        'upload_completed_at','deadline_at','budget_month','provider_mode','reserved_twd_micros'
      ]::text[]
      WHEN 'projed_core.meeting_ai_usage_attempts' THEN ARRAY[
        'attempt_id','capture_id','run_id','unit_identity','dispatch_month','provider','model','price_version',
        'reserved_twd_micros','usage_state','outcome','dispatch_state','asr_operation_token','asr_manifest',
        'llm_operation_token','llm_manifest'
      ]::text[]
      WHEN 'projed_core.meeting_llm_unit_checkpoints' THEN ARRAY[
        'id','capture_id','run_id','source_version','transcript_revision_id','stage','unit_key','input_hash',
        'slot','attempt_id','payload_text','payload_hash'
      ]::text[]
      WHEN 'projed_core.meeting_ai_budget_months' THEN ARRAY['budget_month']::text[]
      WHEN 'projed_core.meeting_transcript_segments' THEN ARRAY[
        'id','capture_id','transcript_revision_id','producer_run_id','segment_index','source_audio_ranges',
        'start_offset_ms','end_offset_ms','raw_text','normalized_text','word_offsets','source_hash'
      ]::text[]
      WHEN 'projed_core.meeting_task_match_results' THEN ARRAY[
        'id','resolution_id','task_id','ai_suggestion_version','decision','decision_source',
        'corrected_by','corrected_at','capture_id','tenant_id','project_id'
      ]::text[]
      WHEN 'projed_core.meeting_draft_projections' THEN ARRAY[
        'record_id','capture_id','applied_review_revision','last_request_key','payload_hash',
        'manual_link_set','auto_link_set','record_version','updated_at'
      ]::text[]
      ELSE ARRAY[]::text[]
    END;
    v_expected_update := CASE v_name
      WHEN 'projed_core.meeting_capture_sessions' THEN ARRAY[
        'state','epoch_manifest','last_progress_at','stopped_at','audio_expires_at','source_version',
        'audio_manifest_hash','pointer_manifest_hash','source_completeness','pointer_loss','updated_at',
        'stopped_reason','source_frozen_at','source_parent_version','final_pointer_sequence','source_gaps','review_revision'
      ]::text[]
      WHEN 'projed_core.meeting_capture_segments' THEN ARRAY[
        'bytes','sha256','upload_state','upload_token_expires_at','last_error','verified_at','storage_generation','updated_at'
      ]::text[]
      WHEN 'projed_core.meeting_artifact_cleanup' THEN ARRAY[
        'upload_operation_token','upload_outcome','storage_generation','upload_sha256','upload_bytes',
        'upload_token_expires_at','due_at','updated_at'
      ]::text[]
      WHEN 'projed_core.meeting_analysis_runs' THEN ARRAY[
        'state','error_code','lease_token','lease_expires_at','updated_at','authorization_context_id',
        'provider_mode','config_version','transcript_revision_id','stage_cursor','budget_month','reserved_twd_micros',
        'attempt_count','actual_twd_micros','next_attempt_at','resume_stage'
      ]::text[]
      WHEN 'projed_core.meeting_ai_usage_attempts' THEN ARRAY[
        'actual_twd_micros','usage_state','outcome','updated_at','dispatch_state','asr_manifest',
        'asr_remaining_twd_micros','llm_manifest'
      ]::text[]
      WHEN 'projed_core.meeting_ai_budget_months' THEN ARRAY[
        'reserved_twd_micros','spent_twd_micros','updated_at'
      ]::text[]
      WHEN 'projed_core.meeting_segment_resolutions' THEN ARRAY[
        'resolution_state','revision','human_reviewed','human_empty_decision','updated_at'
      ]::text[]
      WHEN 'projed_core.meeting_task_match_results' THEN ARRAY[
        'decision','decision_source','corrected_by','corrected_at','updated_at'
      ]::text[]
      WHEN 'projed_core.meeting_draft_projections' THEN ARRAY[
        'capture_id','applied_review_revision','last_request_key','payload_hash',
        'manual_link_set','auto_link_set','record_version','updated_at'
      ]::text[]
      ELSE ARRAY[]::text[]
    END;
    v_expected_select := CASE v_name
      WHEN 'projed_core.meeting_artifact_cleanup' THEN ARRAY[
        'obligation_id','capture_id','attempt_id','kind','due_at','upload_token_expires_at',
        'state','object_locator','storage_backend','upload_operation_token','upload_outcome',
        'storage_generation','upload_sha256','upload_bytes'
      ]::text[]
      WHEN 'projed_core.meeting_ai_usage_attempts' THEN ARRAY[
        'attempt_id','capture_id','run_id','unit_identity','dispatch_month','provider','model','price_version',
        'reserved_twd_micros','usage_state','outcome','dispatch_state','actual_twd_micros',
        'asr_operation_token','asr_manifest','asr_remaining_twd_micros','llm_operation_token','llm_manifest','created_at'
      ]::text[]
      WHEN 'projed_core.meeting_ai_budget_months' THEN ARRAY[
        'budget_month','limit_twd_micros','reserved_twd_micros','spent_twd_micros'
      ]::text[]
      ELSE ARRAY[]::text[]
    END;

    FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      v_expected_privilege := (v_privilege = 'SELECT' AND v_expected_table_select)
        OR (v_privilege = 'DELETE' AND v_name='projed_core.meeting_task_match_results');
      IF has_table_privilege('projed_runtime_disposable', v_relation, v_privilege)
           IS DISTINCT FROM v_expected_privilege THEN
        RAISE EXCEPTION 'runtime table-level % grant differs from exact policy on %', v_privilege, v_name;
      END IF;
      IF has_table_privilege('projed_migrator_disposable', v_relation, v_privilege) THEN
        RAISE EXCEPTION 'migration role has unexpected % privilege on %', v_privilege, v_name;
      END IF;
    END LOOP;

    SELECT array_agg(attribute.attname::text ORDER BY attribute.attnum)
      INTO v_columns
      FROM pg_attribute AS attribute
     WHERE attribute.attrelid = v_relation AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    FOREACH v_column IN ARRAY v_columns LOOP
      IF has_column_privilege('projed_runtime_disposable', v_relation, v_column, 'INSERT')
           IS DISTINCT FROM (v_column = ANY(v_expected_insert)) THEN
        RAISE EXCEPTION 'runtime INSERT column grant differs from exact policy on %.%', v_name, v_column;
      END IF;
      IF has_column_privilege('projed_runtime_disposable', v_relation, v_column, 'UPDATE')
           IS DISTINCT FROM (v_column = ANY(v_expected_update)) THEN
        RAISE EXCEPTION 'runtime UPDATE column grant differs from exact policy on %.%', v_name, v_column;
      END IF;
      IF v_name='projed_core.meeting_llm_unit_checkpoints'
         AND (has_column_privilege('projed_importer_disposable',v_relation,v_column,'SELECT')
           OR has_column_privilege('projed_importer_disposable',v_relation,v_column,'INSERT')
           OR has_column_privilege('projed_importer_disposable',v_relation,v_column,'UPDATE')) THEN
        RAISE EXCEPTION 'snapshot importer has column access to private LLM checkpoint %.%',v_name,v_column;
      END IF;
      IF NOT v_expected_table_select
         AND has_column_privilege('projed_runtime_disposable', v_relation, v_column, 'SELECT')
           IS DISTINCT FROM (v_column = ANY(v_expected_select)) THEN
        RAISE EXCEPTION 'runtime SELECT column grant differs from exact policy on %.%', v_name, v_column;
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

  FOREACH v_function IN ARRAY ARRAY[
    'projed_core.meeting_mutation_scope_v1(uuid,uuid)',
    'projed_core.meeting_capture_visible_v1(uuid)',
    'projed_core.meeting_capture_mutable_v1(uuid)',
    'projed_core.meeting_run_cancel_guard_v1()',
    'projed_core.meeting_cancel_ledger_scope_v1(uuid)',
    'projed_core.cancel_meeting_capture_v1(uuid,integer,text)',
    'projed_core.meeting_audio_scope_v1(uuid,uuid)',
    'projed_core.meeting_audio_cleanup_scope_v1(uuid,text)',
    'projed_core.meeting_audio_settlement_scope_v1(uuid)',
    'projed_core.meeting_audio_proof_guard_v1()',
    'projed_core.meeting_audio_anchor_retention_v1()',
    'projed_core.meeting_upload_scope_v1(uuid)',
    'projed_core.meeting_upload_budget_scope_v1(date)',
    'projed_core.meeting_upload_run_scope_v1(uuid,uuid)',
    'projed_core.meeting_budget_upload_guard_v1()',
    'projed_core.complete_meeting_upload_v1(uuid,integer,jsonb,text,text,text)',
    'projed_core.bind_meeting_asr_session_v1(uuid)',
    'projed_core.meeting_cloud_speech_reservation_v1(uuid)',
    'projed_core.meeting_asr_prepare_scope_v1(uuid,uuid)',
    'projed_core.meeting_asr_prepare_run_guard_v1()',
    'projed_core.meeting_asr_prepare_budget_scope_v1(date)',
    'projed_core.meeting_asr_prepare_budget_guard_v1()',
    'projed_core.prepare_meeting_cloud_speech_v1(uuid)',
    'projed_core.meeting_asr_work_scope_v1(uuid,uuid)',
    'projed_core.meeting_asr_run_live_v1(uuid)',
    'projed_core.meeting_asr_claim_run_guard_v1()',
    'projed_core.meeting_asr_usage_work_guard_v1()',
    'projed_core.claim_meeting_asr_unit_v1(uuid,uuid)',
    'projed_core.mark_meeting_asr_dispatch_v1(uuid,uuid,jsonb)',
    'projed_core.meeting_asr_settle_scope_v1(uuid,uuid,text)',
    'projed_core.meeting_asr_settle_run_scope_v1(uuid)',
    'projed_core.meeting_asr_settlement_guard_v1()',
    'projed_core.settle_meeting_asr_unit_v1(uuid,uuid,jsonb)',
    'projed_core.read_meeting_asr_dispatch_v1(uuid,uuid,jsonb)',
    'projed_core.meeting_asr_control_scope_v1(uuid)',
    'projed_core.scan_meeting_asr_work_v1(integer)',
    'projed_core.recover_meeting_asr_unit_v1(uuid,uuid)',
    'projed_core.meeting_asr_abandon_guard_v1()',
    'projed_core.abandon_meeting_asr_run_v1(uuid,text)',
    'projed_core.meeting_discussion_scope_v1(uuid,uuid)',
    'projed_core.meeting_discussion_live_v1(uuid)',
    'projed_core.meeting_discussion_guard_v1()',
    'projed_core.claim_meeting_discussion_source_v1(uuid,uuid)',
    'projed_core.read_meeting_discussion_source_v1(uuid,uuid)',
    'projed_core.read_meeting_discussion_batch_v1(uuid,uuid,jsonb)',
    'projed_core.append_meeting_discussion_batch_v1(uuid,uuid,jsonb)',
    'projed_core.finish_meeting_discussion_work_v1(uuid,uuid,text)',
    'projed_core.scan_meeting_discussion_work_v1(integer)',
    'projed_core.meeting_llm_private_scope_v1(uuid,uuid)',
    'projed_core.meeting_llm_live_v1(uuid)',
    'projed_core.meeting_llm_guard_v1()',
    'projed_core.claim_meeting_llm_unit_v1(uuid,uuid,jsonb)',
    'projed_core.mark_meeting_llm_dispatch_v1(uuid,uuid,text,boolean)',
    'projed_core.meeting_llm_charge_v1(text,jsonb,integer)',
    'projed_core.settle_meeting_llm_unit_v1(uuid,uuid,jsonb)',
    'projed_core.scan_meeting_llm_work_v1(integer)',
    'projed_core.recover_meeting_llm_unit_v1(uuid,uuid,boolean)',
    'projed_core.finish_meeting_llm_work_v1(uuid,text)',
    'projed_core.meeting_review_scope_v1(uuid)',
    'projed_core.meeting_projection_scope_v1(uuid,uuid)'
  ] LOOP
    v_function_oid := to_regprocedure(v_function);
    IF v_function_oid IS NULL THEN RAISE EXCEPTION 'missing runtime meeting helper: %', v_function; END IF;
    IF NOT has_function_privilege('projed_runtime_disposable', v_function_oid, 'EXECUTE')
       OR has_function_privilege('projed_importer_disposable', v_function_oid, 'EXECUTE')
       OR has_function_privilege('projed_migrator_disposable', v_function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'runtime meeting helper EXECUTE grants are not exact: %', v_function;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_proc AS proc
        CROSS JOIN LATERAL aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
       WHERE proc.oid = v_function_oid AND acl.grantee = 0::oid
    ) THEN
      RAISE EXCEPTION 'PUBLIC has EXECUTE on runtime meeting helper: %', v_function;
    END IF;
  END LOOP;
END $$;

-- The ASR unit table is a runtime-only intermediate checkpoint, not an importer
-- projection or a final transcript table.
DO $$
DECLARE
  v_relation regclass := to_regclass('projed_core.meeting_asr_unit_results');
  v_rls boolean;
  v_force boolean;
  v_privilege text;
  v_column text;
  v_columns text[];
  v_expected_insert text[] := ARRAY[
    'attempt_id','capture_id','run_id','source_version','unit_index','source_segment_id','chunk_index','result'
  ]::text[];
  v_role text;
BEGIN
  IF v_relation IS NULL THEN RAISE EXCEPTION 'missing ASR unit checkpoint table'; END IF;
  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
    FROM pg_class WHERE oid = v_relation;
  IF v_rls IS DISTINCT FROM true OR v_force IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASR unit checkpoint is not FORCE RLS';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid=v_relation)<>2
     OR NOT EXISTS (
       SELECT 1 FROM pg_policy p
        WHERE p.polrelid=v_relation AND p.polname='meeting_asr_checkpoint_read_v1'
          AND p.polcmd='r' AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='projed_runtime_disposable')]::oid[]
          AND p.polqual IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_policy p
        WHERE p.polrelid=v_relation AND p.polname='meeting_asr_checkpoint_insert_v1'
          AND p.polcmd='a' AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='projed_runtime_disposable')]::oid[]
          AND p.polwithcheck IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ASR unit checkpoint RLS policies are not exact';
  END IF;

  FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('projed_runtime_disposable',v_relation,v_privilege)
         IS DISTINCT FROM (v_privilege='SELECT') THEN
      RAISE EXCEPTION 'runtime table-level % grant differs on ASR unit checkpoint',v_privilege;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['projed_importer_disposable','projed_migrator_disposable'] LOOP
      IF has_table_privilege(v_role,v_relation,v_privilege) THEN
        RAISE EXCEPTION '% has forbidden table-level % on ASR unit checkpoint',v_role,v_privilege;
      END IF;
    END LOOP;
  END LOOP;

  SELECT array_agg(attribute.attname::text ORDER BY attribute.attnum)
    INTO v_columns
    FROM pg_attribute AS attribute
   WHERE attribute.attrelid=v_relation AND attribute.attnum>0 AND NOT attribute.attisdropped;
  FOREACH v_column IN ARRAY v_columns LOOP
    IF has_column_privilege('projed_runtime_disposable',v_relation,v_column,'SELECT') IS DISTINCT FROM true
       OR has_column_privilege('projed_runtime_disposable',v_relation,v_column,'INSERT')
         IS DISTINCT FROM (v_column=ANY(v_expected_insert))
       OR has_column_privilege('projed_runtime_disposable',v_relation,v_column,'UPDATE') THEN
      RAISE EXCEPTION 'runtime column grants differ on ASR unit checkpoint column %',v_column;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['projed_importer_disposable','projed_migrator_disposable'] LOOP
      IF has_column_privilege(v_role,v_relation,v_column,'SELECT')
         OR has_column_privilege(v_role,v_relation,v_column,'INSERT')
         OR has_column_privilege(v_role,v_relation,v_column,'UPDATE') THEN
        RAISE EXCEPTION '% has forbidden column privilege on ASR unit checkpoint column %',v_role,v_column;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
     WHERE c.oid=v_relation AND acl.grantee=0::oid
  ) OR EXISTS (
    SELECT 1
      FROM pg_attribute attribute
      CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
     WHERE attribute.attrelid=v_relation AND attribute.attnum>0 AND NOT attribute.attisdropped
       AND attribute.attacl IS NOT NULL AND acl.grantee=0::oid
  ) THEN
    RAISE EXCEPTION 'PUBLIC has a privilege on ASR unit checkpoint';
  END IF;
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

-- Runtime grants are narrow, but actor and purpose scopes are required for
-- visibility and mutation. With no actor or cancellation purpose, all source
-- rows remain hidden and scoped writes are rejected or affect zero rows.
SET LOCAL ROLE projed_runtime_disposable;
SELECT set_config('projed.actor_principal_id','',true),
       set_config('projed.actor_local_user_id','',true),
       set_config('projed.actor_entry','',true),
       set_config('projed.actor_context_id','',true),
       set_config('projed.actor_guard_revision','',true),
       set_config('projed.meeting_record_id','',true),
       set_config('projed.meeting_capture_id','',true),
       set_config('projed.meeting_ledger_phase','',true),
       set_config('projed.meeting_refund_month','',true),
       set_config('projed.meeting_audio_segment_id','',true),
       set_config('projed.meeting_audio_phase','',true),
       set_config('projed.meeting_upload_phase','',true),
       set_config('projed.meeting_upload_token','',true),
       set_config('projed.meeting_upload_run_id','',true),
       set_config('projed.meeting_upload_budget_month','',true),
       set_config('projed.meeting_resolution_id','',true),
       set_config('projed.meeting_projection_record_id','',true);
DO $$
DECLARE v_rows bigint;
BEGIN
  IF EXISTS (SELECT id FROM projed_core.meeting_capture_sessions)
     OR EXISTS (SELECT id FROM projed_core.meeting_capture_segments)
     OR EXISTS (SELECT id FROM projed_core.meeting_pointer_intervals)
     OR EXISTS (SELECT id FROM projed_core.meeting_analysis_runs)
     OR EXISTS (SELECT id FROM projed_core.meeting_transcript_segments)
     OR EXISTS (SELECT id FROM projed_core.meeting_segment_resolutions)
     OR EXISTS (SELECT id FROM projed_core.meeting_task_match_results)
     OR EXISTS (SELECT record_id FROM projed_core.meeting_draft_projections)
     OR EXISTS (SELECT obligation_id FROM projed_core.meeting_artifact_cleanup)
     OR EXISTS (SELECT budget_month FROM projed_core.meeting_ai_budget_months)
     OR EXISTS (SELECT attempt_id FROM projed_core.meeting_ai_usage_attempts) THEN
    RAISE EXCEPTION 'runtime can see meeting source or ledger rows without actor/purpose scope';
  END IF;

  IF projed_core.meeting_mutation_scope_v1(
       '23456789-1234-4234-8234-123456789002', 'a1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_capture_visible_v1('a1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_capture_mutable_v1('a1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_cancel_ledger_scope_v1('a1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_audio_scope_v1(
       'a1234567-1234-4234-8234-123456789001','a2234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_audio_cleanup_scope_v1(
       'a1234567-1234-4234-8234-123456789001','storage:a1234567-1234-4234-8234-123456789001:v7:segment:0') IS TRUE
     OR projed_core.meeting_audio_settlement_scope_v1('a9234567-1234-4234-8234-123456789009') IS TRUE
     OR projed_core.meeting_upload_scope_v1('a1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_upload_budget_scope_v1('2026-04-01'::date) IS TRUE
     OR projed_core.meeting_upload_run_scope_v1(
       'a1234567-1234-4234-8234-123456789001','b1234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_review_scope_v1('a6234567-1234-4234-8234-123456789001') IS TRUE
     OR projed_core.meeting_projection_scope_v1(
       '23456789-1234-4234-8234-123456789002','a1234567-1234-4234-8234-123456789001') IS TRUE THEN
    RAISE EXCEPTION 'meeting helper accepted missing actor/purpose scope';
  END IF;

  BEGIN
    PERFORM projed_core.cancel_meeting_capture_v1(
      'a1234567-1234-4234-8234-123456789001', 7, 'scope-negative'
    );
    RAISE EXCEPTION 'runtime cancelled a capture without actor/purpose scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM projed_core.complete_meeting_upload_v1(
      'a1234567-1234-4234-8234-123456789001', 7, '[]'::jsonb, repeat('a',64), repeat('b',64), 'missing'
    );
    RAISE EXCEPTION 'runtime completed a meeting upload without actor/purpose scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_capture_segments (
      id,capture_id,segment_index,epoch,start_offset_ms,end_offset_ms,object_path,mime,bytes,
      source_version,reservation_key,upload_token_expires_at,storage_backend
    ) VALUES (
      'a2234567-1234-4234-8234-123456789091',
      'a1234567-1234-4234-8234-123456789001',91,0,0,1,
      'synthetic/meeting/a1234567/v7/segment-091.webm','audio/webm',0,7,
      'runtime-without-audio-purpose',now()+interval '2 hours','gcs'
    );
    RAISE EXCEPTION 'runtime inserted an audio segment without actor/purpose scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_capture_sessions (
      id,tenant_id,project_id,record_id,created_by,idempotency_key,state,last_progress_at,started_at
    ) VALUES (
      'a1234567-1234-4234-8234-123456789091',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '23456789-1234-4234-8234-123456789002',
      '11111111-1111-4111-8111-111111111111',
      'runtime-without-actor', 'recording', now(), now()
    );
    RAISE EXCEPTION 'runtime inserted a capture without actor scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_pointer_intervals (
      id,capture_id,clock_epoch,sequence,canonical_task_id,surface_kind,
      started_offset_ms,ended_offset_ms,visible,termination_reason,
      batch_key,batch_digest,tenant_id,project_id
    ) VALUES (
      'a3234567-1234-4234-8234-123456789091',
      'a1234567-1234-4234-8234-123456789001', 0, 999,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','task-row',1,2,true,'scope-negative',
      'runtime-without-actor',repeat('d',64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    RAISE EXCEPTION 'runtime inserted a pointer without actor scope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO projed_core.meeting_artifact_cleanup (
      obligation_id,attempt_id,kind,object_locator,state,due_at
    ) VALUES (
      'a9234567-1234-4234-8234-123456789091',
      'runtime-without-cancel-purpose','storage','synthetic/scope-negative','pending',now()
    );
    RAISE EXCEPTION 'runtime inserted cleanup without cancellation purpose';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE projed_core.meeting_capture_sessions SET state='recording',updated_at=now()
   WHERE id='a1234567-1234-4234-8234-123456789001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated capture without actor scope'; END IF;

  UPDATE projed_core.meeting_analysis_runs SET state='cancelled',error_code='scope-negative',updated_at=now()
   WHERE id='a4234567-1234-4234-8234-123456789001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated analysis run without cancellation purpose'; END IF;

  UPDATE projed_core.meeting_ai_usage_attempts
     SET actual_twd_micros=0,usage_state='known',outcome='scope-negative',updated_at=now()
   WHERE attempt_id='synthetic-attempt-reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated usage ledger without cancellation purpose'; END IF;

  UPDATE projed_core.meeting_ai_budget_months SET reserved_twd_micros=0,updated_at=now()
   WHERE budget_month='2026-03-01';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated budget ledger without cancellation purpose'; END IF;

  UPDATE projed_core.meeting_capture_segments SET upload_state='uploading',updated_at=now()
   WHERE id='a2234567-1234-4234-8234-123456789001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated audio segment without actor/purpose scope'; END IF;

  UPDATE projed_core.meeting_artifact_cleanup SET upload_outcome='pending',updated_at=now()
   WHERE obligation_id='a9234567-1234-4234-8234-123456789002';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'runtime updated audio cleanup without actor/purpose scope'; END IF;
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
