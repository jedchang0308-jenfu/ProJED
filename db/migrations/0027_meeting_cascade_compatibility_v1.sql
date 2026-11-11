-- Let a complete Board/record cascade remove dependent meeting rows before
-- checking for dangling references. Independent task/run deletion still fails
-- at the end of the statement; no caller may defer these integrity checks.
-- Do not rewrite the 0026 ledger bytes or relax scope, RLS or data grants.

alter table projed_core.meeting_pointer_intervals
  drop constraint meeting_pointer_intervals_tenant_id_project_id_canonical_t_fkey,
  add constraint meeting_pointer_intervals_tenant_id_project_id_canonical_t_fkey
  foreign key (tenant_id, project_id, canonical_task_id) references projed_core.wbs_items(tenant_id, project_id, id)
  on update cascade on delete no action not deferrable;

alter table projed_core.meeting_task_match_results
  drop constraint meeting_task_match_results_tenant_id_project_id_task_id_fkey,
  add constraint meeting_task_match_results_tenant_id_project_id_task_id_fkey
  foreign key (tenant_id, project_id, task_id) references projed_core.wbs_items(tenant_id, project_id, id)
  on update cascade on delete no action not deferrable;

alter table projed_core.meeting_transcript_segments
  drop constraint meeting_transcript_segments_capture_id_producer_run_id_fkey,
  add constraint meeting_transcript_segments_capture_id_producer_run_id_fkey
  foreign key (capture_id, producer_run_id) references projed_core.meeting_analysis_runs(capture_id, id)
  on delete no action not deferrable;

alter table projed_core.meeting_segment_resolutions
  drop constraint meeting_segment_resolutions_capture_id_latest_run_id_fkey,
  add constraint meeting_segment_resolutions_capture_id_latest_run_id_fkey
  foreign key (capture_id, latest_run_id) references projed_core.meeting_analysis_runs(capture_id, id)
  on delete no action not deferrable;

alter table projed_core.meeting_draft_projections
  drop constraint meeting_draft_projections_record_id_capture_id_fkey,
  add constraint meeting_draft_projections_record_id_capture_id_fkey
  foreign key (record_id, capture_id) references projed_core.meeting_capture_sessions(record_id, id)
  on delete no action not deferrable;

alter table projed_core.meeting_draft_projections
  drop constraint meeting_draft_projections_capture_id_applied_run_id_fkey,
  add constraint meeting_draft_projections_capture_id_applied_run_id_fkey
  foreign key (capture_id, applied_run_id) references projed_core.meeting_analysis_runs(capture_id, id)
  on delete no action not deferrable;
