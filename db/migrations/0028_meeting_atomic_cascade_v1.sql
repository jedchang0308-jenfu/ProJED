-- Nested RI cascades issue their own statements; statement-local checks can
-- run before the Board's record/capture cascade has finished. Validate these
-- reference edges at transaction commit. No orphan/cross-scope state can commit;
-- all other FK actions, uniqueness, RLS, and grants remain unchanged.

alter table projed_core.meeting_pointer_intervals
  alter constraint meeting_pointer_intervals_tenant_id_project_id_canonical_t_fkey
  deferrable initially deferred;

alter table projed_core.meeting_task_match_results
  alter constraint meeting_task_match_results_tenant_id_project_id_task_id_fkey
  deferrable initially deferred;

alter table projed_core.meeting_transcript_segments
  alter constraint meeting_transcript_segments_capture_id_producer_run_id_fkey
  deferrable initially deferred;

alter table projed_core.meeting_segment_resolutions
  alter constraint meeting_segment_resolutions_capture_id_latest_run_id_fkey
  deferrable initially deferred;

alter table projed_core.meeting_draft_projections
  alter constraint meeting_draft_projections_record_id_capture_id_fkey
  deferrable initially deferred;

alter table projed_core.meeting_draft_projections
  alter constraint meeting_draft_projections_capture_id_applied_run_id_fkey
  deferrable initially deferred;
