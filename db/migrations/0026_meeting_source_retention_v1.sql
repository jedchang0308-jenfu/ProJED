-- Preserve all original meeting source, review, projection, budget and cleanup state.
-- Raw audio/transcript and global ledgers remain unavailable to app runtime.
-- Runtime/worker HTTP ports and provider qualification are separate responsibilities;
-- this migration grants only the existing one-time snapshot importer SELECT/INSERT.

create table projed_core.meeting_capture_sessions (
  id uuid primary key,
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null,
  created_by uuid not null references projed_core.profiles(id) on delete restrict,
  idempotency_key text not null,
  state text not null default 'created' check (state in ('created','recording','paused','stopped','uploading','queued','running','ready','awaiting_budget','cancelled','expired','failed_retryable','failed_terminal')),
  epoch_manifest jsonb not null default '[]'::jsonb,
  last_progress_at timestamptz,
  stopped_at timestamptz,
  audio_expires_at timestamptz,
  source_version integer not null default 1,
  audio_manifest_hash text,
  pointer_manifest_hash text,
  source_completeness text not null default 'complete' check (source_completeness in ('complete','partial','missing')),
  pointer_loss boolean not null default false,
  review_revision bigint not null default 0,
  active_transcript_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_capture_idempotency_unique unique (record_id, idempotency_key),
  started_at timestamptz default now(),
  stopped_reason text,
  source_frozen_at timestamptz,
  source_parent_version integer,
  final_pointer_sequence bigint,
  source_gaps jsonb not null default '[]'::jsonb,
  unique (tenant_id, project_id, id),
  unique (record_id, id),
  foreign key (tenant_id, project_id, record_id)
    references projed_core.knowledge_records(tenant_id, project_id, id)
    on update cascade on delete cascade
);

create table projed_core.meeting_capture_segments (
  id uuid primary key,
  capture_id uuid not null references projed_core.meeting_capture_sessions(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  epoch integer not null check (epoch >= 0),
  start_offset_ms bigint not null check (start_offset_ms >= 0),
  end_offset_ms bigint not null check (end_offset_ms > start_offset_ms),
  overlap_ms integer not null default 0 check (overlap_ms >= 0),
  gap_before_ms integer not null default 0 check (gap_before_ms >= 0),
  object_path text not null,
  mime text not null,
  bytes bigint not null default 0 check (bytes >= 0),
  sha256 text,
  upload_state text not null default 'pending' check (upload_state in ('pending','uploading','uploaded','verified','expired','purged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_capture_segment_unique unique (capture_id, source_version, segment_index),
  source_version integer not null default 1,
  reservation_key text,
  upload_token_expires_at timestamptz,
  verified_at timestamptz,
  last_error text
);

create table projed_core.meeting_pointer_intervals (
  id uuid primary key,
  capture_id uuid not null,
  clock_epoch integer not null check (clock_epoch >= 0),
  sequence bigint not null check (sequence >= 0),
  canonical_task_id uuid not null,
  surface_kind text not null,
  started_offset_ms bigint not null check (started_offset_ms >= 0),
  ended_offset_ms bigint not null check (ended_offset_ms > started_offset_ms),
  visible boolean not null default true,
  termination_reason text not null,
  batch_key text not null,
  batch_digest text not null,
  created_at timestamptz not null default now(),
  constraint meeting_pointer_sequence_unique unique (capture_id, sequence),
  tenant_id uuid not null,
  project_id uuid not null,
  foreign key (tenant_id, project_id, capture_id)
    references projed_core.meeting_capture_sessions(tenant_id, project_id, id)
    on update cascade on delete cascade,
  foreign key (tenant_id, project_id, canonical_task_id)
    references projed_core.wbs_items(tenant_id, project_id, id)
    on update cascade on delete restrict
);

create table projed_core.meeting_analysis_runs (
  id uuid primary key,
  capture_id uuid not null references projed_core.meeting_capture_sessions(id) on delete cascade,
  source_version integer not null,
  request_key text not null,
  transcript_revision_id uuid,
  config_version text not null,
  state text not null default 'queued' check (state in ('queued','running','ready','awaiting_budget','failed_retryable','failed_terminal','cancelled')),
  resume_stage text not null default 'transcribe',
  stage_cursor jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  upload_completed_at timestamptz,
  deadline_at timestamptz,
  budget_month date,
  reserved_twd_micros bigint not null default 0,
  actual_twd_micros bigint,
  error_code text,
  overdue_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_analysis_request_unique unique (capture_id, request_key),
  provider_mode text not null default 'fake',
  cleanup_pending boolean not null default false,
  manual_retry_count integer not null default 0,
  unique (capture_id, id)
);

create table projed_core.meeting_transcript_segments (
  id uuid primary key,
  capture_id uuid not null references projed_core.meeting_capture_sessions(id) on delete cascade,
  transcript_revision_id uuid not null,
  producer_run_id uuid not null,
  segment_index integer not null check (segment_index >= 0),
  source_audio_ranges jsonb not null default '[]'::jsonb,
  start_offset_ms bigint not null check (start_offset_ms >= 0),
  end_offset_ms bigint not null check (end_offset_ms > start_offset_ms),
  raw_text text not null default '',
  normalized_text text not null default '',
  word_offsets jsonb not null default '[]'::jsonb,
  source_hash text not null,
  created_at timestamptz not null default now(),
  constraint meeting_transcript_segment_unique unique (transcript_revision_id, segment_index),
  unique (capture_id, id),
  foreign key (capture_id, producer_run_id)
    references projed_core.meeting_analysis_runs(capture_id, id) on delete restrict
);

create table projed_core.meeting_segment_resolutions (
  id uuid primary key,
  capture_id uuid not null references projed_core.meeting_capture_sessions(id) on delete cascade,
  transcript_segment_id uuid not null,
  candidate_snapshot jsonb not null default '[]'::jsonb,
  latest_run_id uuid,
  resolution_state text not null default 'pending' check (resolution_state in ('pending','accepted','rejected','needs_review')),
  revision bigint not null default 0,
  human_reviewed boolean not null default false,
  human_empty_decision boolean not null default false,
  protected_source_ranges jsonb not null default '[]'::jsonb,
  config_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_segment_resolution_unique unique (capture_id, transcript_segment_id),
  unique (capture_id, id),
  foreign key (capture_id, transcript_segment_id)
    references projed_core.meeting_transcript_segments(capture_id, id) on delete cascade,
  foreign key (capture_id, latest_run_id)
    references projed_core.meeting_analysis_runs(capture_id, id) on delete restrict
);

create table projed_core.meeting_task_match_results (
  id uuid primary key,
  resolution_id uuid not null,
  task_id uuid not null,
  quote_range jsonb,
  semantic_score numeric,
  pointer_feature numeric,
  ai_suggestion_version text not null,
  decision text not null default 'suggested' check (decision in ('suggested','accepted','rejected','cleared')),
  decision_source text not null default 'ai' check (decision_source in ('ai','human')),
  corrected_by uuid references projed_core.profiles(id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_task_match_unique unique (resolution_id, task_id),
  capture_id uuid not null,
  tenant_id uuid not null,
  project_id uuid not null,
  foreign key (capture_id, resolution_id)
    references projed_core.meeting_segment_resolutions(capture_id, id) on delete cascade,
  foreign key (tenant_id, project_id, capture_id)
    references projed_core.meeting_capture_sessions(tenant_id, project_id, id)
    on update cascade on delete cascade,
  foreign key (tenant_id, project_id, task_id)
    references projed_core.wbs_items(tenant_id, project_id, id)
    on update cascade on delete restrict
);

create table projed_core.meeting_draft_projections (
  record_id uuid primary key references projed_core.knowledge_records(id) on delete cascade,
  capture_id uuid not null,
  applied_run_id uuid,
  applied_review_revision bigint not null default 0,
  last_request_key text,
  payload_hash text,
  block_markers jsonb not null default '[]'::jsonb,
  manual_link_set jsonb not null default '[]'::jsonb,
  auto_link_set jsonb not null default '[]'::jsonb,
  record_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  foreign key (record_id, capture_id)
    references projed_core.meeting_capture_sessions(record_id, id) on delete restrict,
  foreign key (capture_id, applied_run_id)
    references projed_core.meeting_analysis_runs(capture_id, id) on delete restrict
);

create table projed_core.meeting_artifact_cleanup (
  obligation_id uuid primary key,
  capture_id uuid references projed_core.meeting_capture_sessions(id) on delete set null,
  run_id uuid references projed_core.meeting_analysis_runs(id) on delete set null,
  attempt_id text not null,
  kind text not null check (kind in ('storage','provider')),
  object_locator text,
  display_name text,
  external_file_id text,
  state text not null default 'pending' check (state in ('pending','deleting','deleted','unknown','failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  upload_token_expires_at timestamptz,
  due_at timestamptz not null default now(),
  last_verified_at timestamptz,
  attempts integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, kind),
  foreign key (capture_id, run_id)
    references projed_core.meeting_analysis_runs(capture_id, id)
    on delete set null (run_id)
);

create table projed_core.meeting_ai_budget_months (
  budget_month date primary key,
  limit_twd_micros bigint not null default 1000000000,
  reserved_twd_micros bigint not null default 0,
  spent_twd_micros bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table projed_core.meeting_ai_usage_attempts (
  attempt_id text primary key,
  capture_id uuid,
  run_id uuid,
  unit_identity text not null,
  dispatch_month date not null,
  provider text not null,
  model text not null,
  price_version text not null,
  reserved_twd_micros bigint not null default 0,
  actual_twd_micros bigint,
  usage_state text not null default 'unknown' check (usage_state in ('reserved','known','unknown','reconciled')),
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index meeting_capture_one_active_idx
  on projed_core.meeting_capture_sessions(record_id)
  where state in ('created','recording','paused','stopped','uploading','queued','running','awaiting_budget','failed_retryable');
create unique index meeting_capture_segment_reservation_key_idx
  on projed_core.meeting_capture_segments(capture_id, reservation_key) where reservation_key is not null;
create index meeting_capture_record_scope_idx
  on projed_core.meeting_capture_sessions(tenant_id, project_id, record_id);
create index meeting_pointer_task_scope_idx
  on projed_core.meeting_pointer_intervals(tenant_id, project_id, canonical_task_id);
create index meeting_match_task_scope_idx
  on projed_core.meeting_task_match_results(tenant_id, project_id, task_id);
create index meeting_cleanup_capture_idx on projed_core.meeting_artifact_cleanup(capture_id);
create index meeting_cleanup_run_idx on projed_core.meeting_artifact_cleanup(run_id);

alter table projed_core.meeting_capture_sessions enable row level security;
alter table projed_core.meeting_capture_sessions force row level security;
revoke all on projed_core.meeting_capture_sessions from public;
create policy snapshot_importer_v1 on projed_core.meeting_capture_sessions
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_capture_sessions to projed_importer_disposable;

alter table projed_core.meeting_capture_segments enable row level security;
alter table projed_core.meeting_capture_segments force row level security;
revoke all on projed_core.meeting_capture_segments from public;
create policy snapshot_importer_v1 on projed_core.meeting_capture_segments
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_capture_segments to projed_importer_disposable;

alter table projed_core.meeting_pointer_intervals enable row level security;
alter table projed_core.meeting_pointer_intervals force row level security;
revoke all on projed_core.meeting_pointer_intervals from public;
create policy snapshot_importer_v1 on projed_core.meeting_pointer_intervals
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_pointer_intervals to projed_importer_disposable;

alter table projed_core.meeting_analysis_runs enable row level security;
alter table projed_core.meeting_analysis_runs force row level security;
revoke all on projed_core.meeting_analysis_runs from public;
create policy snapshot_importer_v1 on projed_core.meeting_analysis_runs
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_analysis_runs to projed_importer_disposable;

alter table projed_core.meeting_transcript_segments enable row level security;
alter table projed_core.meeting_transcript_segments force row level security;
revoke all on projed_core.meeting_transcript_segments from public;
create policy snapshot_importer_v1 on projed_core.meeting_transcript_segments
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_transcript_segments to projed_importer_disposable;

alter table projed_core.meeting_segment_resolutions enable row level security;
alter table projed_core.meeting_segment_resolutions force row level security;
revoke all on projed_core.meeting_segment_resolutions from public;
create policy snapshot_importer_v1 on projed_core.meeting_segment_resolutions
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_segment_resolutions to projed_importer_disposable;

alter table projed_core.meeting_task_match_results enable row level security;
alter table projed_core.meeting_task_match_results force row level security;
revoke all on projed_core.meeting_task_match_results from public;
create policy snapshot_importer_v1 on projed_core.meeting_task_match_results
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_task_match_results to projed_importer_disposable;

alter table projed_core.meeting_draft_projections enable row level security;
alter table projed_core.meeting_draft_projections force row level security;
revoke all on projed_core.meeting_draft_projections from public;
create policy snapshot_importer_v1 on projed_core.meeting_draft_projections
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_draft_projections to projed_importer_disposable;

alter table projed_core.meeting_artifact_cleanup enable row level security;
alter table projed_core.meeting_artifact_cleanup force row level security;
revoke all on projed_core.meeting_artifact_cleanup from public;
create policy snapshot_importer_v1 on projed_core.meeting_artifact_cleanup
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_artifact_cleanup to projed_importer_disposable;

alter table projed_core.meeting_ai_budget_months enable row level security;
alter table projed_core.meeting_ai_budget_months force row level security;
revoke all on projed_core.meeting_ai_budget_months from public;
create policy snapshot_importer_v1 on projed_core.meeting_ai_budget_months
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_ai_budget_months to projed_importer_disposable;

alter table projed_core.meeting_ai_usage_attempts enable row level security;
alter table projed_core.meeting_ai_usage_attempts force row level security;
revoke all on projed_core.meeting_ai_usage_attempts from public;
create policy snapshot_importer_v1 on projed_core.meeting_ai_usage_attempts
  for all to projed_importer_disposable using (true) with check (true);
grant select, insert on projed_core.meeting_ai_usage_attempts to projed_importer_disposable;
