-- Existing tasks may have node_type NULL. The application treats these as
-- ordinary tasks; retain that behavior without accepting group/archived rows.
ALTER POLICY meeting_pointer_insert_v1 ON projed_core.meeting_pointer_intervals
  WITH CHECK (
    projed_core.meeting_capture_mutable_v1(capture_id)
    AND EXISTS (SELECT 1 FROM projed_core.meeting_capture_sessions capture
      WHERE capture.id=meeting_pointer_intervals.capture_id
        AND capture.state IN ('recording','paused','stopped','uploading'))
    AND EXISTS (SELECT 1 FROM projed_core.wbs_items task
      WHERE task.id=meeting_pointer_intervals.canonical_task_id
        AND task.tenant_id=meeting_pointer_intervals.tenant_id
        AND task.project_id=meeting_pointer_intervals.project_id
        AND NOT task.archived AND coalesce(task.node_type,'task') IN ('task','milestone'))
  );
