-- Runtime access follows the existing meeting editor/private-record boundary.
-- No raw meeting row or global ledger becomes publicly queryable.
ALTER TABLE projed_core.meeting_capture_segments
  ADD COLUMN storage_backend text NULL CHECK (storage_backend IN ('gcs', 'supabase'));
ALTER TABLE projed_core.meeting_artifact_cleanup
  ADD COLUMN storage_backend text NULL CHECK (storage_backend IN ('gcs', 'supabase'));
-- Imported NULL is intentionally unproven: a legacy reserved row may already
-- have reached the provider. Only new, explicitly pending attempts can refund.
ALTER TABLE projed_core.meeting_ai_usage_attempts
  ADD COLUMN dispatch_state text NULL CHECK (dispatch_state IN ('pending', 'dispatched')),
  ADD CONSTRAINT meeting_usage_pending_reservation_v1
    CHECK (dispatch_state IS DISTINCT FROM 'pending' OR reserved_twd_micros >= 0);

CREATE FUNCTION projed_core.meeting_mutation_scope_v1(target_record_id uuid, target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT projed_core.actor_context_valid_v1()
    AND current_setting('projed.meeting_record_id',true)=target_record_id::text
    AND current_setting('projed.meeting_capture_id',true)=target_capture_id::text
    AND EXISTS (SELECT 1 FROM projed_core.knowledge_records record
      WHERE record.id=target_record_id AND record.record_type='meeting'
        AND projed_core.actor_can_write_record_v1(record.tenant_id,record.project_id,
          record.visibility,record.created_by,record.recorded_by));
$$;
CREATE POLICY meeting_editor_read_v1 ON projed_core.meeting_capture_sessions
  FOR SELECT TO projed_runtime_disposable USING (EXISTS (
    SELECT 1 FROM projed_core.knowledge_records record
    WHERE record.id=meeting_capture_sessions.record_id AND record.tenant_id=meeting_capture_sessions.tenant_id AND record.project_id=meeting_capture_sessions.project_id
      AND record.record_type='meeting' AND projed_core.actor_can_write_record_v1(
        record.tenant_id,record.project_id,record.visibility,record.created_by,record.recorded_by)
  ));
CREATE POLICY meeting_capture_create_v1 ON projed_core.meeting_capture_sessions
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    created_by=projed_core.current_actor_user_id_v1()
    AND projed_core.meeting_mutation_scope_v1(record_id,id)
  );
CREATE POLICY meeting_capture_update_v1 ON projed_core.meeting_capture_sessions
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.meeting_mutation_scope_v1(record_id,id))
  WITH CHECK (projed_core.meeting_mutation_scope_v1(record_id,id));
GRANT SELECT ON projed_core.meeting_capture_sessions TO projed_runtime_disposable;
GRANT INSERT (id,tenant_id,project_id,record_id,created_by,idempotency_key,state,last_progress_at,started_at)
  ON projed_core.meeting_capture_sessions TO projed_runtime_disposable;
GRANT UPDATE (state,epoch_manifest,last_progress_at,stopped_at,audio_expires_at,source_version,
  audio_manifest_hash,pointer_manifest_hash,source_completeness,pointer_loss,updated_at,
  stopped_reason,source_frozen_at,source_parent_version,final_pointer_sequence,source_gaps)
  ON projed_core.meeting_capture_sessions TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_capture_visible_v1(target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture WHERE capture.id=target_capture_id);
$$;
CREATE FUNCTION projed_core.meeting_capture_mutable_v1(target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
    WHERE capture.id=target_capture_id AND projed_core.meeting_mutation_scope_v1(capture.record_id,capture.id));
$$;

CREATE POLICY meeting_pointer_read_v1 ON projed_core.meeting_pointer_intervals
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_pointer_insert_v1 ON projed_core.meeting_pointer_intervals
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_capture_mutable_v1(capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_pointer_intervals.capture_id AND capture.state IN ('recording','paused','stopped','uploading'))
    AND EXISTS (SELECT 1 FROM projed_core.wbs_items task
      WHERE task.id=meeting_pointer_intervals.canonical_task_id AND task.tenant_id=meeting_pointer_intervals.tenant_id AND task.project_id=meeting_pointer_intervals.project_id
        AND NOT task.archived AND task.node_type IN ('task','milestone'))
  );
GRANT SELECT ON projed_core.meeting_pointer_intervals TO projed_runtime_disposable;
GRANT INSERT (id,capture_id,clock_epoch,sequence,canonical_task_id,surface_kind,started_offset_ms,
  ended_offset_ms,visible,termination_reason,batch_key,batch_digest,tenant_id,project_id)
  ON projed_core.meeting_pointer_intervals TO projed_runtime_disposable;

CREATE POLICY meeting_segment_read_v1 ON projed_core.meeting_capture_segments
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_run_read_v1 ON projed_core.meeting_analysis_runs
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_transcript_read_v1 ON projed_core.meeting_transcript_segments
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_resolution_read_v1 ON projed_core.meeting_segment_resolutions
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_match_read_v1 ON projed_core.meeting_task_match_results
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
CREATE POLICY meeting_projection_read_v1 ON projed_core.meeting_draft_projections
  FOR SELECT TO projed_runtime_disposable USING (projed_core.meeting_capture_visible_v1(capture_id));
GRANT SELECT ON projed_core.meeting_capture_segments,projed_core.meeting_analysis_runs,
  projed_core.meeting_transcript_segments,projed_core.meeting_segment_resolutions,
  projed_core.meeting_task_match_results,projed_core.meeting_draft_projections TO projed_runtime_disposable;

-- Cancellation is a single local transaction. Only the invoker routine below
-- opens the ledger phase, and only reserved, not-dispatched attempts refund.
CREATE POLICY meeting_run_cancel_v1 ON projed_core.meeting_analysis_runs
  FOR UPDATE TO projed_runtime_disposable
  USING (current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND projed_core.meeting_capture_mutable_v1(capture_id))
  WITH CHECK (current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND state='cancelled' AND lease_token IS NULL AND lease_expires_at IS NULL
    AND projed_core.meeting_capture_mutable_v1(capture_id));
GRANT UPDATE (state,error_code,lease_token,lease_expires_at,updated_at)
  ON projed_core.meeting_analysis_runs TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_run_cancel_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
BEGIN
  IF current_user='projed_runtime_disposable' AND (
    current_setting('projed.meeting_ledger_phase',true) IS DISTINCT FROM 'cancel'
    OR NEW.state<>'cancelled' OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
    OR NEW.error_code IS DISTINCT FROM CASE WHEN OLD.state IN ('running','failed_retryable')
      THEN 'CANCELLED_IN_FLIGHT' ELSE 'CANCELLED_BEFORE_DISPATCH' END
    OR OLD.state NOT IN ('queued','awaiting_budget','failed_retryable','running')
  ) THEN RAISE EXCEPTION 'MEETING_RUN_CANCELLATION_INVALID' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_run_cancel_guard_v1 BEFORE UPDATE ON projed_core.meeting_analysis_runs
  FOR EACH ROW EXECUTE FUNCTION projed_core.meeting_run_cancel_guard_v1();
REVOKE ALL ON FUNCTION projed_core.meeting_run_cancel_guard_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_run_cancel_guard_v1() TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_cancel_ledger_scope_v1(target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND projed_core.meeting_capture_mutable_v1(target_capture_id);
$$;
CREATE POLICY meeting_cleanup_cancel_read_v1 ON projed_core.meeting_artifact_cleanup
  FOR SELECT TO projed_runtime_disposable USING (
    kind='storage' AND projed_core.meeting_cancel_ledger_scope_v1(capture_id));
CREATE POLICY meeting_cleanup_cancel_insert_v1 ON projed_core.meeting_artifact_cleanup
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    kind='storage' AND state='pending' AND run_id IS NULL
    AND projed_core.meeting_cancel_ledger_scope_v1(capture_id));
GRANT SELECT (obligation_id,capture_id,attempt_id,kind,due_at,upload_token_expires_at)
  ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;
GRANT INSERT (obligation_id,capture_id,attempt_id,kind,object_locator,state,
  upload_token_expires_at,due_at,storage_backend)
  ON projed_core.meeting_artifact_cleanup TO projed_runtime_disposable;

CREATE POLICY meeting_usage_cancel_read_v1 ON projed_core.meeting_ai_usage_attempts
  FOR SELECT TO projed_runtime_disposable USING (
    projed_core.meeting_cancel_ledger_scope_v1(capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs run
      WHERE run.id=meeting_ai_usage_attempts.run_id AND run.capture_id=meeting_ai_usage_attempts.capture_id));
CREATE POLICY meeting_usage_cancel_update_v1 ON projed_core.meeting_ai_usage_attempts
  FOR UPDATE TO projed_runtime_disposable
  USING (usage_state='reserved' AND dispatch_state='pending' AND projed_core.meeting_cancel_ledger_scope_v1(capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_analysis_runs run
      WHERE run.id=meeting_ai_usage_attempts.run_id AND run.capture_id=meeting_ai_usage_attempts.capture_id AND run.state='cancelled'
        AND run.error_code='CANCELLED_BEFORE_DISPATCH'))
  WITH CHECK (usage_state='known' AND actual_twd_micros=0 AND outcome='cancelled_before_dispatch'
    AND projed_core.meeting_cancel_ledger_scope_v1(capture_id));
GRANT SELECT (attempt_id,capture_id,run_id,dispatch_month,reserved_twd_micros,usage_state,dispatch_state)
  ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
GRANT UPDATE (actual_twd_micros,usage_state,outcome,updated_at)
  ON projed_core.meeting_ai_usage_attempts TO projed_runtime_disposable;
CREATE POLICY meeting_budget_cancel_read_v1 ON projed_core.meeting_ai_budget_months
  FOR SELECT TO projed_runtime_disposable USING (
    current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND budget_month::text=current_setting('projed.meeting_refund_month',true)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id::text=current_setting('projed.meeting_capture_id',true)
        AND projed_core.meeting_capture_mutable_v1(capture.id)));
CREATE POLICY meeting_budget_cancel_update_v1 ON projed_core.meeting_ai_budget_months
  FOR UPDATE TO projed_runtime_disposable
  USING (current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND budget_month::text=current_setting('projed.meeting_refund_month',true))
  WITH CHECK (current_setting('projed.meeting_ledger_phase',true)='cancel'
    AND budget_month::text=current_setting('projed.meeting_refund_month',true));
GRANT SELECT (budget_month,reserved_twd_micros) ON projed_core.meeting_ai_budget_months TO projed_runtime_disposable;
GRANT UPDATE (reserved_twd_micros,updated_at) ON projed_core.meeting_ai_budget_months TO projed_runtime_disposable;

CREATE FUNCTION projed_core.cancel_meeting_capture_v1(target_capture_id uuid,expected_version integer,reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
DECLARE capture projed_core.meeting_capture_sessions; attempt record; prior_state text;
BEGIN
  SELECT * INTO capture FROM projed_core.meeting_capture_sessions
    WHERE id=target_capture_id FOR UPDATE;
  IF NOT FOUND OR NOT projed_core.meeting_capture_mutable_v1(target_capture_id) THEN
    RAISE EXCEPTION 'MEETING_CAPTURE_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  IF expected_version IS NULL OR expected_version<=0 OR capture.source_version<>expected_version THEN
    RAISE EXCEPTION 'SOURCE_CONFLICT';
  END IF;
  prior_state:=capture.state;
  IF capture.state IN ('ready','expired','failed_terminal') THEN
    RETURN jsonb_build_object('captureId',capture.id,'state',capture.state,'sourceVersion',capture.source_version,'idempotent',true);
  END IF;
  PERFORM set_config('projed.meeting_ledger_phase','cancel',true);
  UPDATE projed_core.meeting_capture_sessions SET state='cancelled',
    stopped_reason=left(reason,160),last_progress_at=now(),updated_at=now() WHERE id=capture.id;
  UPDATE projed_core.meeting_analysis_runs SET error_code=CASE
      WHEN state IN ('running','failed_retryable') THEN 'CANCELLED_IN_FLIGHT' ELSE 'CANCELLED_BEFORE_DISPATCH' END,
    state='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
    WHERE capture_id=capture.id AND state IN ('queued','awaiting_budget','failed_retryable','running');
  INSERT INTO projed_core.meeting_artifact_cleanup
    (obligation_id,capture_id,attempt_id,kind,object_locator,state,upload_token_expires_at,due_at,storage_backend)
    SELECT gen_random_uuid(),capture.id,
      'storage:'||capture.id::text||':v'||segment.source_version::text||':segment:'||segment.segment_index::text,
      'storage',segment.object_path,'pending',segment.upload_token_expires_at,
      greatest(now(),coalesce(segment.upload_token_expires_at,now())),segment.storage_backend
    FROM projed_core.meeting_capture_segments segment
    WHERE segment.capture_id=capture.id AND segment.upload_state<>'purged'
    ON CONFLICT (attempt_id,kind) DO NOTHING;
  FOR attempt IN SELECT usage.attempt_id,usage.dispatch_month,usage.reserved_twd_micros
    FROM projed_core.meeting_ai_usage_attempts usage
    JOIN projed_core.meeting_analysis_runs run ON run.id=usage.run_id AND run.capture_id=usage.capture_id
    WHERE usage.capture_id=capture.id AND usage.usage_state='reserved' AND usage.dispatch_state='pending'
      AND run.state='cancelled' AND run.error_code='CANCELLED_BEFORE_DISPATCH'
    ORDER BY usage.dispatch_month,usage.attempt_id FOR UPDATE OF usage
  LOOP
    PERFORM set_config('projed.meeting_refund_month',attempt.dispatch_month::text,true);
    UPDATE projed_core.meeting_ai_budget_months
      SET reserved_twd_micros=reserved_twd_micros-attempt.reserved_twd_micros,updated_at=now()
      WHERE budget_month=attempt.dispatch_month AND attempt.reserved_twd_micros>=0
        AND reserved_twd_micros>=attempt.reserved_twd_micros;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_BUDGET_LEDGER_MISSING'; END IF;
    UPDATE projed_core.meeting_ai_usage_attempts SET actual_twd_micros=0,usage_state='known',
      outcome='cancelled_before_dispatch',updated_at=now() WHERE attempt_id=attempt.attempt_id AND usage_state='reserved';
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_USAGE_SETTLEMENT_CONFLICT'; END IF;
  END LOOP;
  PERFORM set_config('projed.meeting_refund_month','',true);
  PERFORM set_config('projed.meeting_ledger_phase','',true);
  RETURN jsonb_build_object('captureId',capture.id,'state','cancelled','sourceVersion',capture.source_version,
    'idempotent',prior_state='cancelled');
END;
$$;

REVOKE ALL ON FUNCTION projed_core.meeting_mutation_scope_v1(uuid,uuid),
  projed_core.meeting_capture_visible_v1(uuid),projed_core.meeting_capture_mutable_v1(uuid),
  projed_core.meeting_cancel_ledger_scope_v1(uuid),projed_core.cancel_meeting_capture_v1(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_mutation_scope_v1(uuid,uuid),
  projed_core.meeting_capture_visible_v1(uuid),projed_core.meeting_capture_mutable_v1(uuid),
  projed_core.meeting_cancel_ledger_scope_v1(uuid),projed_core.cancel_meeting_capture_v1(uuid,integer,text)
  TO projed_runtime_disposable;
