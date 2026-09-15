-- DEV-123: manual retry is one database transaction.  Locking the capture
-- before inserting the new run prevents two different request keys from
-- creating a queued run after only one of them won the capture transition.

create or replace function public.retry_meeting_analysis_v1(
  p_capture_id uuid,
  p_source_run_id uuid,
  p_actor_id uuid,
  p_request_key text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_capture public.meeting_capture_sessions;
  v_source_run public.meeting_analysis_runs;
  v_existing public.meeting_analysis_runs;
  v_next public.meeting_analysis_runs;
  v_resume_stage text;
begin
  if p_capture_id is null or p_source_run_id is null or p_actor_id is null then
    raise exception 'RETRY_ID_REQUIRED';
  end if;
  if p_request_key is null or length(trim(p_request_key)) = 0 or length(p_request_key) > 180 then
    raise exception 'RETRY_REQUEST_KEY_INVALID';
  end if;
  p_request_key := trim(p_request_key);
  if p_mode is null or p_mode not in ('retry', 'rematch', 'retranscribe') then
    raise exception 'RETRY_MODE_INVALID';
  end if;

  -- The source run is locked first so its immutable deadline/config snapshot
  -- cannot change while the capture transition is being decided.
  select * into v_source_run
  from public.meeting_analysis_runs
  where id = p_source_run_id
  for update;
  if not found then raise exception 'ANALYSIS_RUN_NOT_FOUND'; end if;
  if v_source_run.capture_id <> p_capture_id then raise exception 'RETRY_CAPTURE_MISMATCH'; end if;
  if v_source_run.state not in ('ready', 'failed_retryable', 'failed_terminal') then
    raise exception 'RUN_CANNOT_BE_RETRIED';
  end if;

  -- The capture lock serializes idempotent retries and conflicting request
  -- keys.  Check the request key before the state guard so a replay returns
  -- the durable first result even after the capture is already queued.
  select * into v_capture
  from public.meeting_capture_sessions
  where id = p_capture_id
  for update;
  if not found then raise exception 'CAPTURE_NOT_FOUND'; end if;

  -- Recheck the private-meeting editor boundary inside the transaction;
  -- the Edge auth check cannot be the only guard across a permission change.
  if not exists (
    select 1
    from public.project_members pm
    join public.knowledge_records r
      on r.id = v_capture.record_id
    where pm.project_id = v_capture.project_id
      and pm.tenant_id = v_capture.tenant_id
      and pm.user_id = p_actor_id
      and pm.role::text not in ('viewer', 'suspended')
      and r.record_type = 'meeting'
      and (coalesce(r.visibility::text, '') <> 'private'
        or r.created_by = p_actor_id
        or r.recorded_by = p_actor_id)
  ) then
    raise exception 'MEETING_EDITOR_REQUIRED';
  end if;

  select * into v_existing
  from public.meeting_analysis_runs
  where capture_id = p_capture_id and request_key = p_request_key
  for update;
  if found then
    return jsonb_build_object(
      'runId', v_existing.id,
      'state', v_existing.state,
      'deadlineAt', v_existing.deadline_at,
      'sourceVersion', v_existing.source_version,
      'idempotent', true
    );
  end if;

  if v_capture.state not in ('stopped', 'ready', 'failed_retryable', 'failed_terminal') then
    raise exception 'CAPTURE_CANNOT_BE_RETRIED';
  end if;
  if v_capture.source_version <> v_source_run.source_version then
    raise exception 'SOURCE_CONFLICT';
  end if;
  if v_capture.audio_expires_at is not null and v_capture.audio_expires_at <= now() then
    raise exception 'AUDIO_EXPIRED';
  end if;

  v_resume_stage := case
    when p_mode = 'retranscribe' then 'transcribe'
    when p_mode = 'rematch' then 'matching'
    else coalesce(v_source_run.resume_stage, 'transcribe')
  end;

  insert into public.meeting_analysis_runs (
    capture_id, source_version, request_key, config_version, state,
    resume_stage, stage_cursor, next_attempt_at, upload_completed_at,
    deadline_at, budget_month, provider_mode, manual_retry_count
  ) values (
    p_capture_id, v_capture.source_version, p_request_key, v_source_run.config_version,
    'queued', v_resume_stage, '{}'::jsonb, now(), v_source_run.upload_completed_at,
    v_source_run.deadline_at, v_source_run.budget_month, v_source_run.provider_mode,
    coalesce(v_source_run.manual_retry_count, 0) + 1
  ) returning * into v_next;

  update public.meeting_capture_sessions
  set state = 'queued', updated_at = now()
  where id = p_capture_id;

  return jsonb_build_object(
    'runId', v_next.id,
    'state', v_next.state,
    'deadlineAt', v_next.deadline_at,
    'sourceVersion', v_next.source_version,
    'idempotent', false
  );
end;
$$;

revoke all on function public.retry_meeting_analysis_v1(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.retry_meeting_analysis_v1(uuid, uuid, uuid, text, text) to service_role;
