-- DEV-123: durable control-plane hardening.
-- This migration is additive.  It records server anchors and upload cleanup
-- identity so retries, reloads and late signed uploads remain auditable.

alter table public.meeting_capture_sessions
  add column if not exists started_at timestamptz,
  add column if not exists stopped_reason text,
  add column if not exists source_frozen_at timestamptz,
  add column if not exists source_parent_version integer,
  add column if not exists final_pointer_sequence bigint,
  add column if not exists source_gaps jsonb not null default '[]'::jsonb;

update public.meeting_capture_sessions
set started_at = coalesce(started_at, created_at)
where started_at is null;

alter table public.meeting_capture_sessions
  alter column started_at set default now();

alter table public.meeting_capture_segments
  add column if not exists source_version integer not null default 1,
  add column if not exists reservation_key text,
  add column if not exists upload_token_expires_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists last_error text;

update public.meeting_capture_segments segments
set source_version = captures.source_version
from public.meeting_capture_sessions captures
where captures.id = segments.capture_id;

alter table public.meeting_capture_segments
  drop constraint if exists meeting_capture_segment_unique;
alter table public.meeting_capture_segments
  add constraint meeting_capture_segment_unique unique (capture_id, source_version, segment_index);

create unique index if not exists meeting_capture_segment_reservation_key_idx
  on public.meeting_capture_segments(capture_id, reservation_key)
  where reservation_key is not null;

alter table public.meeting_analysis_runs
  add column if not exists provider_mode text not null default 'fake',
  add column if not exists cleanup_pending boolean not null default false,
  add column if not exists manual_retry_count integer not null default 0;

create index if not exists meeting_capture_segment_expiry_idx
  on public.meeting_capture_segments(upload_token_expires_at)
  where upload_token_expires_at is not null;
create index if not exists meeting_capture_segment_source_idx
  on public.meeting_capture_segments(capture_id, source_version, segment_index);

create unique index if not exists meeting_cleanup_attempt_kind_idx
  on private.meeting_artifact_cleanup(attempt_id, kind);

comment on column public.meeting_capture_sessions.started_at is
  'Server capture anchor; client wall clock is never the retention source.';
comment on column public.meeting_capture_segments.reservation_key is
  'Idempotent server reservation identity for a single source-version segment.';
comment on column public.meeting_analysis_runs.provider_mode is
  'Qualification-gated provider mode; fake is the only local default.';

create or replace function private.claim_meeting_analysis_run_v1()
returns public.meeting_analysis_runs
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_run public.meeting_analysis_runs;
begin
  select * into v_run
  from public.meeting_analysis_runs
  where state in ('queued', 'failed_retryable')
    and next_attempt_at <= now()
    and (lease_expires_at is null or lease_expires_at < now())
  order by next_attempt_at asc, created_at asc
  for update skip locked
  limit 1;
  if not found then return null; end if;

  update public.meeting_analysis_runs
  set state = 'running',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at = now() + interval '150 seconds',
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_run.id
  returning * into v_run;
  return v_run;
end;
$$;

create or replace function private.reserve_meeting_budget_v1(
  p_budget_month date,
  p_amount bigint,
  p_attempt_id text,
  p_capture_id uuid,
  p_run_id uuid,
  p_unit_identity text,
  p_provider text,
  p_model text,
  p_price_version text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_budget private.meeting_ai_budget_months;
  v_attempt private.meeting_ai_usage_attempts;
begin
  select * into v_attempt from private.meeting_ai_usage_attempts where attempt_id = p_attempt_id for update;
  if found then return true; end if;

  insert into private.meeting_ai_budget_months (budget_month, limit_twd_micros)
  values (p_budget_month, 1000000000)
  on conflict (budget_month) do nothing;
  select * into v_budget from private.meeting_ai_budget_months where budget_month = p_budget_month for update;
  if v_budget.reserved_twd_micros + v_budget.spent_twd_micros + p_amount > v_budget.limit_twd_micros then return false; end if;

  update private.meeting_ai_budget_months
  set reserved_twd_micros = reserved_twd_micros + p_amount, updated_at = now()
  where budget_month = p_budget_month;
  insert into private.meeting_ai_usage_attempts (
    attempt_id, capture_id, run_id, unit_identity, dispatch_month, provider, model, price_version,
    reserved_twd_micros, usage_state, outcome
  ) values (
    p_attempt_id, p_capture_id, p_run_id, p_unit_identity, p_budget_month, p_provider, p_model, p_price_version,
    p_amount, 'reserved', 'reserved'
  );
  return true;
end;
$$;

create or replace function private.settle_meeting_budget_v1(
  p_attempt_id text,
  p_actual_twd_micros bigint,
  p_usage_state text,
  p_outcome text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_attempt private.meeting_ai_usage_attempts;
begin
  select * into v_attempt from private.meeting_ai_usage_attempts where attempt_id = p_attempt_id for update;
  if not found then return false; end if;
  if v_attempt.usage_state in ('known', 'reconciled') then return true; end if;
  if p_usage_state in ('known', 'reconciled') then
    update private.meeting_ai_budget_months
    set reserved_twd_micros = greatest(0, reserved_twd_micros - v_attempt.reserved_twd_micros),
        spent_twd_micros = spent_twd_micros + greatest(0, coalesce(p_actual_twd_micros, 0)),
        updated_at = now()
    where budget_month = v_attempt.dispatch_month;
  end if;
  update private.meeting_ai_usage_attempts
  set actual_twd_micros = p_actual_twd_micros,
      usage_state = p_usage_state,
      outcome = p_outcome,
      updated_at = now()
  where attempt_id = p_attempt_id;
  return true;
end;
$$;

-- Complete source freeze, run identity, deadline and the first worst-case
-- reservation under one capture row lock. Storage byte/hash verification is
-- performed by the Edge function immediately before this transaction; this
-- RPC is the authority that makes the verified manifest durable.
create or replace function public.complete_meeting_upload_v1(
  p_capture_id uuid,
  p_actor_id uuid,
  p_expected_source_version integer,
  p_audio_manifest jsonb,
  p_audio_manifest_hash text,
  p_pointer_manifest_hash text,
  p_source_completeness text,
  p_provider_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_capture public.meeting_capture_sessions;
  v_record public.knowledge_records;
  v_run public.meeting_analysis_runs;
  v_item jsonb;
  v_segment public.meeting_capture_segments;
  v_source_version integer;
  v_count integer;
  v_distinct integer;
  v_index integer;
  v_allowed boolean;
  v_budget_month date;
  v_completed_at timestamptz;
  v_request_key text;
  v_attempt_id text;
  v_state text;
begin
  if jsonb_typeof(coalesce(p_audio_manifest, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_AUDIO_MANIFEST';
  end if;
  if p_audio_manifest_hash is null or length(trim(p_audio_manifest_hash)) = 0
     or p_pointer_manifest_hash is null or length(trim(p_pointer_manifest_hash)) = 0 then
    raise exception 'SOURCE_MANIFEST_HASH_REQUIRED';
  end if;
  if p_source_completeness not in ('complete', 'partial', 'missing') then
    raise exception 'INVALID_SOURCE_COMPLETENESS';
  end if;
  if p_expected_source_version is null or p_expected_source_version < 1 then
    raise exception 'SOURCE_VERSION_REQUIRED';
  end if;
  if p_provider_mode not in ('fake', 'gemini') then
    raise exception 'PROVIDER_MODE_INVALID';
  end if;

  select * into v_capture
  from public.meeting_capture_sessions
  where id = p_capture_id
  for update;
  if not found then raise exception 'CAPTURE_NOT_FOUND'; end if;
  if v_capture.source_version <> p_expected_source_version then
    raise exception 'SOURCE_CONFLICT';
  end if;
  if v_capture.audio_expires_at is not null and v_capture.audio_expires_at <= now() then
    raise exception 'AUDIO_EXPIRED';
  end if;
  select * into v_record
  from public.knowledge_records
  where id = v_capture.record_id
  for update;
  if not found or v_record.record_type <> 'meeting' then raise exception 'MEETING_RECORD_NOT_FOUND'; end if;
  if v_record.visibility = 'private' then
    if v_record.created_by <> p_actor_id and v_record.recorded_by <> p_actor_id then raise exception 'FORBIDDEN'; end if;
  elsif not exists (
    select 1 from public.project_members pm
    where pm.tenant_id = v_capture.tenant_id and pm.project_id = v_capture.project_id
      and pm.user_id = p_actor_id and pm.role::text not in ('viewer', 'suspended')
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_capture.state not in ('stopped', 'uploading', 'queued', 'awaiting_budget') then
    raise exception 'CAPTURE_NOT_READY';
  end if;

  v_source_version := v_capture.source_version;
  select count(*), count(distinct coalesce((value ->> 'segmentIndex')::integer, (value ->> 'segment_index')::integer))
  into v_count, v_distinct
  from jsonb_array_elements(coalesce(p_audio_manifest, '[]'::jsonb));
  if v_count <> v_distinct then raise exception 'AUDIO_MANIFEST_DUPLICATE'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_audio_manifest, '[]'::jsonb)) as item(value)
  loop
    v_index := coalesce((v_item ->> 'segmentIndex')::integer, (v_item ->> 'segment_index')::integer);
    if v_index is null or v_index < 0 then raise exception 'AUDIO_MANIFEST_INDEX_INVALID'; end if;
    select * into v_segment
    from public.meeting_capture_segments
    where capture_id = p_capture_id and source_version = v_source_version and segment_index = v_index
    for update;
    if not found
       or v_segment.upload_state <> 'verified'
       or v_segment.bytes <= 0 or v_segment.bytes > 10485760
       or v_segment.bytes <> coalesce((v_item ->> 'bytes')::bigint, -1)
       or v_segment.object_path <> coalesce(v_item ->> 'objectPath', v_item ->> 'object_path', '')
       or lower(coalesce(v_segment.sha256, '')) <> lower(coalesce(v_item ->> 'sha256', ''))
       or lower(v_segment.mime) <> lower(coalesce(v_item ->> 'mime', '')) then
      raise exception 'AUDIO_SEGMENT_NOT_VERIFIED';
    end if;
  end loop;
  if p_source_completeness = 'complete' then
    if v_count = 0 then raise exception 'COMPLETE_SOURCE_REQUIRES_SEGMENTS'; end if;
    for v_index in 0..(v_count - 1)
    loop
      if not exists (
        select 1 from jsonb_array_elements(coalesce(p_audio_manifest, '[]'::jsonb)) as item(value)
        where coalesce((value ->> 'segmentIndex')::integer, (value ->> 'segment_index')::integer) = v_index
      ) then
        raise exception 'AUDIO_MANIFEST_NOT_CONTIGUOUS';
      end if;
    end loop;
  end if;

  -- Once a complete source is frozen, a late partial request must not reopen
  -- or downgrade the capture.  Replay is idempotent only for the same complete
  -- manifest and hashes.
  if v_capture.source_frozen_at is not null then
    if p_source_completeness <> 'complete'
       or coalesce(v_capture.audio_manifest_hash, '') <> p_audio_manifest_hash
       or coalesce(v_capture.pointer_manifest_hash, '') <> p_pointer_manifest_hash then
      raise exception 'SOURCE_CONFLICT';
    end if;
    select * into v_run from public.meeting_analysis_runs
    where capture_id = p_capture_id and request_key = 'source-v' || v_source_version
    for update;
    if not found then raise exception 'SOURCE_RUN_MISSING'; end if;
    return jsonb_build_object('state', v_capture.state, 'runId', v_run.id, 'sourceVersion', v_source_version,
      'deadlineAt', v_run.deadline_at, 'idempotent', true);
  end if;

  if p_source_completeness <> 'complete' then
    update public.meeting_capture_sessions
    set state = 'stopped', source_completeness = p_source_completeness,
        audio_manifest_hash = p_audio_manifest_hash, pointer_manifest_hash = p_pointer_manifest_hash,
        source_frozen_at = null, updated_at = now()
    where id = p_capture_id;
    return jsonb_build_object('state', 'stopped', 'runId', null, 'sourceVersion', v_source_version, 'sourceComplete', false, 'idempotent', false);
  end if;

  v_completed_at := now();
  v_budget_month := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
  v_request_key := 'source-v' || v_source_version;
  insert into public.meeting_analysis_runs (
    capture_id, source_version, request_key, config_version, state, resume_stage,
    upload_completed_at, deadline_at, budget_month, provider_mode
  ) values (
    p_capture_id, v_source_version, v_request_key, 'dev-123.v1', 'queued', 'transcribe',
    v_completed_at, v_completed_at + interval '24 hours', v_budget_month, p_provider_mode
  ) on conflict (capture_id, request_key) do update set updated_at = now()
  returning * into v_run;

  v_attempt_id := v_run.id::text || ':0';
  select private.reserve_meeting_budget_v1(
    v_budget_month, 10000000, v_attempt_id, p_capture_id, v_run.id,
    v_run.id::text || ':transcribe', p_provider_mode,
    case when p_provider_mode = 'fake' then 'dev-123-fake' else 'gemini-3.5-transcribe' end,
    'dev-123.v1'
  ) into v_allowed;
  v_state := case when v_allowed then 'queued' else 'awaiting_budget' end;
  update public.meeting_analysis_runs
  set state = v_state, reserved_twd_micros = case when v_allowed then 10000000 else 0 end, updated_at = now()
  where id = v_run.id;
  update public.meeting_capture_sessions
  set state = v_state, source_completeness = 'complete', source_frozen_at = v_completed_at,
      audio_manifest_hash = p_audio_manifest_hash, pointer_manifest_hash = p_pointer_manifest_hash, updated_at = now()
  where id = p_capture_id;
  return jsonb_build_object('state', v_state, 'runId', v_run.id, 'sourceVersion', v_source_version,
    'deadlineAt', v_run.deadline_at, 'sourceComplete', true, 'idempotent', false);
end;
$$;

revoke all on function private.claim_meeting_analysis_run_v1() from public, anon, authenticated;
revoke all on function private.reserve_meeting_budget_v1(date, bigint, text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.settle_meeting_budget_v1(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.complete_meeting_upload_v1(uuid, uuid, integer, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function private.claim_meeting_analysis_run_v1() to service_role;
grant execute on function private.reserve_meeting_budget_v1(date, bigint, text, uuid, uuid, text, text, text, text) to service_role;
grant execute on function private.settle_meeting_budget_v1(text, bigint, text, text) to service_role;
grant execute on function public.complete_meeting_upload_v1(uuid, uuid, integer, jsonb, text, text, text, text) to service_role;
