-- Human review stays inside the original editor/private-record boundary.
-- No transcript generation, worker, provider or global ledger authority.
CREATE FUNCTION projed_core.meeting_review_scope_v1(target_resolution_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT target_resolution_id::text=current_setting('projed.meeting_resolution_id',true)
    AND EXISTS (
      SELECT 1 FROM projed_core.meeting_segment_resolutions resolution
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=resolution.capture_id
      JOIN projed_core.meeting_transcript_segments transcript
        ON transcript.id=resolution.transcript_segment_id AND transcript.capture_id=capture.id
      JOIN projed_core.meeting_analysis_runs run ON run.id=transcript.producer_run_id AND run.capture_id=capture.id
      WHERE resolution.id=target_resolution_id AND projed_core.meeting_capture_mutable_v1(capture.id)
        AND capture.state NOT IN ('cancelled','expired')
        AND run.source_version=capture.source_version
        AND capture.active_transcript_revision_id IS NOT NULL
        AND transcript.transcript_revision_id=capture.active_transcript_revision_id
    );
$$;
CREATE POLICY meeting_resolution_human_update_v1 ON projed_core.meeting_segment_resolutions
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.meeting_review_scope_v1(id))
  WITH CHECK (projed_core.meeting_review_scope_v1(id)
    AND human_reviewed AND revision>0 AND resolution_state IN ('accepted','rejected','needs_review'));
GRANT UPDATE (resolution_state,revision,human_reviewed,human_empty_decision,updated_at)
  ON projed_core.meeting_segment_resolutions TO projed_runtime_disposable;
GRANT UPDATE (review_revision) ON projed_core.meeting_capture_sessions TO projed_runtime_disposable;

CREATE POLICY meeting_match_human_insert_v1 ON projed_core.meeting_task_match_results
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_review_scope_v1(resolution_id)
    AND decision_source='human' AND corrected_by=projed_core.current_actor_user_id_v1()
    AND ai_suggestion_version='human.v1' AND decision IN ('accepted','rejected')
    AND EXISTS (
      SELECT 1 FROM projed_core.meeting_segment_resolutions resolution
      JOIN projed_core.meeting_capture_sessions capture ON capture.id=resolution.capture_id
      JOIN projed_core.wbs_items task ON task.tenant_id=capture.tenant_id AND task.project_id=capture.project_id
      WHERE resolution.id=meeting_task_match_results.resolution_id AND task.id=meeting_task_match_results.task_id
        AND capture.id=meeting_task_match_results.capture_id
        AND capture.tenant_id=meeting_task_match_results.tenant_id AND capture.project_id=meeting_task_match_results.project_id
        AND NOT task.archived AND (task.node_type IS NULL OR task.node_type IN ('task','milestone'))
    )
  );
CREATE POLICY meeting_match_human_update_v1 ON projed_core.meeting_task_match_results
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.meeting_review_scope_v1(resolution_id))
  WITH CHECK (projed_core.meeting_review_scope_v1(resolution_id)
    AND decision_source='human' AND corrected_by=projed_core.current_actor_user_id_v1()
    AND decision IN ('accepted','rejected'));
CREATE POLICY meeting_match_human_delete_v1 ON projed_core.meeting_task_match_results
  FOR DELETE TO projed_runtime_disposable USING (projed_core.meeting_review_scope_v1(resolution_id));
GRANT INSERT (id,resolution_id,task_id,ai_suggestion_version,decision,decision_source,
  corrected_by,corrected_at,capture_id,tenant_id,project_id)
  ON projed_core.meeting_task_match_results TO projed_runtime_disposable;
GRANT UPDATE (decision,decision_source,corrected_by,corrected_at,updated_at)
  ON projed_core.meeting_task_match_results TO projed_runtime_disposable;
GRANT DELETE ON projed_core.meeting_task_match_results TO projed_runtime_disposable;

CREATE FUNCTION projed_core.meeting_projection_scope_v1(target_record_id uuid,target_capture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, projed_core AS $$
  SELECT target_record_id::text=current_setting('projed.meeting_projection_record_id',true)
    AND EXISTS (
      SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.record_id=target_record_id
        AND capture.id::text=current_setting('projed.meeting_capture_id',true)
        AND (target_capture_id IS NULL OR capture.id=target_capture_id)
        AND projed_core.meeting_capture_mutable_v1(capture.id)
    );
$$;
CREATE POLICY meeting_projection_human_insert_v1 ON projed_core.meeting_draft_projections
  FOR INSERT TO projed_runtime_disposable WITH CHECK (
    projed_core.meeting_projection_scope_v1(record_id,capture_id)
    AND record_version=1 AND length(last_request_key)>0 AND payload_hash ~ '^[a-f0-9]{64}$'
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=capture_id AND capture.review_revision=applied_review_revision)
  );
CREATE POLICY meeting_projection_human_update_v1 ON projed_core.meeting_draft_projections
  FOR UPDATE TO projed_runtime_disposable
  USING (projed_core.meeting_projection_scope_v1(record_id,NULL))
  WITH CHECK (projed_core.meeting_projection_scope_v1(record_id,capture_id)
    AND record_version>0 AND length(last_request_key)>0 AND payload_hash ~ '^[a-f0-9]{64}$'
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=capture_id AND capture.review_revision=applied_review_revision)
  );
GRANT INSERT (record_id,capture_id,applied_review_revision,last_request_key,payload_hash,
  manual_link_set,auto_link_set,record_version,updated_at)
  ON projed_core.meeting_draft_projections TO projed_runtime_disposable;
GRANT UPDATE (capture_id,applied_review_revision,last_request_key,payload_hash,
  manual_link_set,auto_link_set,record_version,updated_at)
  ON projed_core.meeting_draft_projections TO projed_runtime_disposable;
REVOKE ALL ON FUNCTION projed_core.meeting_review_scope_v1(uuid),
  projed_core.meeting_projection_scope_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION projed_core.meeting_review_scope_v1(uuid),
  projed_core.meeting_projection_scope_v1(uuid,uuid) TO projed_runtime_disposable;
