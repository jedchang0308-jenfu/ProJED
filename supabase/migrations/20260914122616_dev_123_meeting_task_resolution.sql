-- DEV-123: ProJED-owned meeting capture, pointer evidence and task resolution.
-- This migration deliberately keeps raw audio/transcript tables service-role only.

create schema if not exists private;

create table public.meeting_capture_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  record_id uuid not null references public.knowledge_records(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  state text not null default 'created' check (state in ('created','recording','stopped','uploading','queued','running','ready','awaiting_budget','cancelled','expired','failed_retryable','failed_terminal')),
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
  constraint meeting_capture_idempotency_unique unique (record_id, idempotency_key)
);

create unique index meeting_capture_one_active_idx
  on public.meeting_capture_sessions(record_id)
  where state in ('created','recording','stopped','uploading','queued','running','awaiting_budget','failed_retryable');

create table public.meeting_capture_segments (
  id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete cascade,
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
  constraint meeting_capture_segment_unique unique (capture_id, segment_index)
);

create table public.meeting_pointer_intervals (
  id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete cascade,
  clock_epoch integer not null check (clock_epoch >= 0),
  sequence bigint not null check (sequence >= 0),
  canonical_task_id uuid not null references public.wbs_items(id) on delete restrict,
  surface_kind text not null,
  started_offset_ms bigint not null check (started_offset_ms >= 0),
  ended_offset_ms bigint not null check (ended_offset_ms > started_offset_ms),
  visible boolean not null default true,
  termination_reason text not null,
  batch_key text not null,
  batch_digest text not null,
  created_at timestamptz not null default now(),
  constraint meeting_pointer_sequence_unique unique (capture_id, sequence)
);

create table public.meeting_analysis_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete cascade,
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
  constraint meeting_analysis_request_unique unique (capture_id, request_key)
);

create table public.meeting_transcript_segments (
  id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete cascade,
  transcript_revision_id uuid not null,
  producer_run_id uuid not null references public.meeting_analysis_runs(id) on delete restrict,
  segment_index integer not null check (segment_index >= 0),
  source_audio_ranges jsonb not null default '[]'::jsonb,
  start_offset_ms bigint not null check (start_offset_ms >= 0),
  end_offset_ms bigint not null check (end_offset_ms > start_offset_ms),
  raw_text text not null default '',
  normalized_text text not null default '',
  word_offsets jsonb not null default '[]'::jsonb,
  source_hash text not null,
  created_at timestamptz not null default now(),
  constraint meeting_transcript_segment_unique unique (transcript_revision_id, segment_index)
);

create table public.meeting_segment_resolutions (
  id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete cascade,
  transcript_segment_id uuid not null references public.meeting_transcript_segments(id) on delete cascade,
  candidate_snapshot jsonb not null default '[]'::jsonb,
  latest_run_id uuid references public.meeting_analysis_runs(id) on delete restrict,
  resolution_state text not null default 'pending' check (resolution_state in ('pending','accepted','rejected','needs_review')),
  revision bigint not null default 0,
  human_reviewed boolean not null default false,
  human_empty_decision boolean not null default false,
  protected_source_ranges jsonb not null default '[]'::jsonb,
  config_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_segment_resolution_unique unique (capture_id, transcript_segment_id)
);

create table public.meeting_task_match_results (
  id uuid primary key default extensions.gen_random_uuid(),
  resolution_id uuid not null references public.meeting_segment_resolutions(id) on delete cascade,
  task_id uuid not null references public.wbs_items(id) on delete restrict,
  quote_range jsonb,
  semantic_score numeric,
  pointer_feature numeric,
  ai_suggestion_version text not null,
  decision text not null default 'suggested' check (decision in ('suggested','accepted','rejected','cleared')),
  decision_source text not null default 'ai' check (decision_source in ('ai','human')),
  corrected_by uuid references public.profiles(id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_task_match_unique unique (resolution_id, task_id)
);

alter table public.meeting_capture_sessions enable row level security;
alter table public.meeting_capture_segments enable row level security;
alter table public.meeting_pointer_intervals enable row level security;
alter table public.meeting_analysis_runs enable row level security;
alter table public.meeting_transcript_segments enable row level security;
alter table public.meeting_segment_resolutions enable row level security;
alter table public.meeting_task_match_results enable row level security;

-- The browser never reads raw source tables directly. Edge functions use service_role
-- after validating the caller and project membership.
revoke all on public.meeting_capture_sessions from anon, authenticated;
revoke all on public.meeting_capture_segments from anon, authenticated;
revoke all on public.meeting_pointer_intervals from anon, authenticated;
revoke all on public.meeting_analysis_runs from anon, authenticated;
revoke all on public.meeting_transcript_segments from anon, authenticated;
revoke all on public.meeting_segment_resolutions from anon, authenticated;
revoke all on public.meeting_task_match_results from anon, authenticated;
grant all on public.meeting_capture_sessions to service_role;
grant all on public.meeting_capture_segments to service_role;
grant all on public.meeting_pointer_intervals to service_role;
grant all on public.meeting_analysis_runs to service_role;
grant all on public.meeting_transcript_segments to service_role;
grant all on public.meeting_segment_resolutions to service_role;
grant all on public.meeting_task_match_results to service_role;

create table private.meeting_draft_projections (
  record_id uuid primary key references public.knowledge_records(id) on delete cascade,
  capture_id uuid not null references public.meeting_capture_sessions(id) on delete restrict,
  applied_run_id uuid references public.meeting_analysis_runs(id) on delete restrict,
  applied_review_revision bigint not null default 0,
  last_request_key text,
  payload_hash text,
  block_markers jsonb not null default '[]'::jsonb,
  manual_link_set jsonb not null default '[]'::jsonb,
  auto_link_set jsonb not null default '[]'::jsonb,
  record_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table private.meeting_artifact_cleanup (
  obligation_id uuid primary key default extensions.gen_random_uuid(),
  capture_id uuid references public.meeting_capture_sessions(id) on delete set null,
  run_id uuid references public.meeting_analysis_runs(id) on delete set null,
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
  updated_at timestamptz not null default now()
);

create table private.meeting_ai_budget_months (
  budget_month date primary key,
  limit_twd_micros bigint not null default 1000000000,
  reserved_twd_micros bigint not null default 0,
  spent_twd_micros bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table private.meeting_ai_usage_attempts (
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

revoke all on private.meeting_draft_projections from public, anon, authenticated;
revoke all on private.meeting_artifact_cleanup from public, anon, authenticated;
revoke all on private.meeting_ai_budget_months from public, anon, authenticated;
revoke all on private.meeting_ai_usage_attempts from public, anon, authenticated;
grant all on private.meeting_draft_projections to service_role;
grant all on private.meeting_artifact_cleanup to service_role;
grant all on private.meeting_ai_budget_months to service_role;
grant all on private.meeting_ai_usage_attempts to service_role;

create index meeting_capture_state_attempt_idx
  on public.meeting_analysis_runs(state, next_attempt_at);
create index meeting_capture_lease_idx
  on public.meeting_analysis_runs(lease_expires_at);
create index meeting_capture_audio_expiry_idx
  on public.meeting_capture_sessions(audio_expires_at);
create index meeting_pointer_capture_created_idx
  on public.meeting_pointer_intervals(capture_id, created_at);
create index meeting_transcript_capture_idx
  on public.meeting_transcript_segments(capture_id, segment_index);
create index meeting_cleanup_due_idx
  on private.meeting_artifact_cleanup(state, due_at);

insert into storage.buckets (id, name, public, file_size_limit)
values ('meeting-audio', 'meeting-audio', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create or replace function public.save_meeting_projection_v1(
  p_record_id uuid,
  p_capture_id uuid,
  p_actor_id uuid,
  p_expected_record_updated_at timestamptz,
  p_expected_review_revision bigint,
  p_title text,
  p_content text,
  p_status text,
  p_metadata jsonb,
  p_task_links jsonb,
  p_request_key text,
  p_payload_hash text
)
returns public.knowledge_records
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_record public.knowledge_records;
  v_capture public.meeting_capture_sessions;
begin
  select * into v_record from public.knowledge_records where id = p_record_id for update;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  select * into v_capture from public.meeting_capture_sessions where id = p_capture_id for update;
  if not found or v_capture.record_id <> p_record_id then raise exception 'CAPTURE_NOT_FOUND'; end if;
  if v_record.visibility = 'private' then
    if v_record.created_by <> p_actor_id and v_record.recorded_by <> p_actor_id then
      raise exception 'FORBIDDEN';
    end if;
  elsif not exists (
    select 1 from public.project_members pm
    where pm.tenant_id = v_capture.tenant_id
      and pm.project_id = v_capture.project_id
      and pm.user_id = p_actor_id
      and pm.role::text not in ('viewer', 'suspended')
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_expected_record_updated_at is not null and v_record.updated_at <> p_expected_record_updated_at then raise exception 'RECORD_VERSION_CONFLICT'; end if;
  if p_expected_review_revision is not null and v_capture.review_revision <> p_expected_review_revision then raise exception 'REVIEW_VERSION_CONFLICT'; end if;
  if v_record.record_type <> 'meeting' or v_capture.state not in ('ready','failed_retryable','failed_terminal') then raise exception 'MEETING_NOT_READY'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'INVALID_RECORD_STATUS'; end if;

  update public.knowledge_records
    set title = coalesce(nullif(trim(p_title), ''), title),
        content = coalesce(p_content, ''),
        status = p_status,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        updated_by = p_actor_id,
        updated_at = now()
    where id = p_record_id
    returning * into v_record;

  delete from public.record_task_links where record_id = p_record_id;
  insert into public.record_task_links (tenant_id, project_id, record_id, item_id, role, created_by)
  select v_record.tenant_id, v_record.project_id, p_record_id, link.item_id, link.role, p_actor_id
  from jsonb_to_recordset(coalesce(p_task_links, '[]'::jsonb)) as link(item_id uuid, role text)
  join public.wbs_items item on item.id = link.item_id
    and item.tenant_id = v_record.tenant_id and item.project_id = v_record.project_id
  where link.role in ('main','related','decision','blocker','follow_up');

  insert into private.meeting_draft_projections (
    record_id, capture_id, applied_review_revision, last_request_key, payload_hash,
    manual_link_set, auto_link_set, record_version, updated_at
  ) values (
    p_record_id, p_capture_id, v_capture.review_revision, p_request_key, p_payload_hash,
    coalesce((p_metadata -> 'meetingTaskResolution' -> 'manualLinkSet'), '[]'::jsonb),
    coalesce((p_metadata -> 'meetingTaskResolution' -> 'autoLinkSet'), '[]'::jsonb),
    1, now()
  ) on conflict (record_id) do update set
    capture_id = excluded.capture_id,
    applied_review_revision = excluded.applied_review_revision,
    manual_link_set = excluded.manual_link_set,
    auto_link_set = excluded.auto_link_set,
    record_version = private.meeting_draft_projections.record_version + 1,
    updated_at = now();

  return v_record;
end;
$$;

revoke all on function public.save_meeting_projection_v1(uuid, uuid, uuid, timestamptz, bigint, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.save_meeting_projection_v1(uuid, uuid, uuid, timestamptz, bigint, text, text, text, jsonb, jsonb, text, text) to service_role;
