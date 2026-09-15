-- DEV-123: editor-owned review decisions with resolution/capture CAS.
-- This migration is additive to the capture schema and keeps raw decision
-- writes behind a service-only security-definer transaction.

create or replace function public.decide_meeting_match_v1(
  p_resolution_id uuid,
  p_actor_id uuid,
  p_expected_resolution_revision bigint,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_resolution public.meeting_segment_resolutions;
  v_capture public.meeting_capture_sessions;
  v_record public.knowledge_records;
  v_operation jsonb;
  v_action text;
  v_task_id uuid;
  v_count integer;
  v_state text;
begin
  if jsonb_typeof(coalesce(p_operations, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_REVIEW_OPERATIONS';
  end if;

  select * into v_resolution
  from public.meeting_segment_resolutions
  where id = p_resolution_id
  for update;
  if not found then raise exception 'RESOLUTION_NOT_FOUND'; end if;

  select * into v_capture
  from public.meeting_capture_sessions
  where id = v_resolution.capture_id
  for update;
  if not found then raise exception 'CAPTURE_NOT_FOUND'; end if;

  select * into v_record
  from public.knowledge_records
  where id = v_capture.record_id
  for update;
  if not found or v_record.record_type <> 'meeting' then raise exception 'MEETING_RECORD_NOT_FOUND'; end if;
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
  if p_expected_resolution_revision is not null
     and v_resolution.revision <> p_expected_resolution_revision then
    raise exception 'REVIEW_VERSION_CONFLICT';
  end if;

  for v_operation in select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb)) as item(value)
  loop
    v_action := lower(coalesce(v_operation ->> 'action', ''));
    if v_action = 'clear-all' then
      delete from public.meeting_task_match_results where resolution_id = v_resolution.id;
      update public.meeting_segment_resolutions
      set human_reviewed = true, human_empty_decision = true
      where id = v_resolution.id;
    elsif v_action in ('accept', 'reject', 'add', 'replace') then
      if nullif(v_operation ->> 'taskId', '') is null then raise exception 'TASK_ID_REQUIRED'; end if;
      v_task_id := (v_operation ->> 'taskId')::uuid;
      if not exists (
        select 1 from public.wbs_items wi
        where wi.id = v_task_id
          and wi.tenant_id = v_capture.tenant_id
          and wi.project_id = v_capture.project_id
          and wi.is_archived = false
          and wi.item_type::text in ('task', 'milestone')
      ) then raise exception 'TASK_OUTSIDE_PROJECT'; end if;

      if v_action = 'accept' and not exists (
        select 1 from public.meeting_task_match_results mt
        where mt.resolution_id = v_resolution.id
          and mt.task_id = v_task_id
      ) then
        raise exception 'TASK_CANDIDATE_REQUIRED';
      end if;

      -- A pointer-only suggestion is ranking evidence, not enough evidence
      -- for automatic acceptance. Explicit add/replace remains available as
      -- a human link operation.
      if v_action = 'accept' and exists (
        select 1 from public.meeting_task_match_results mt
        where mt.resolution_id = v_resolution.id
          and mt.task_id = v_task_id
          and mt.quote_range is null
          and coalesce(mt.pointer_feature, 0) > 0
      ) then
        raise exception 'POINTER_ONLY_NOT_ACCEPTABLE';
      end if;

      if v_action = 'replace' then
        delete from public.meeting_task_match_results where resolution_id = v_resolution.id;
      end if;

      insert into public.meeting_task_match_results (
        resolution_id, task_id, semantic_score, pointer_feature,
        ai_suggestion_version, decision, decision_source, corrected_by, corrected_at
      ) values (
        v_resolution.id, v_task_id, null, null, 'human.v1',
        case when v_action = 'reject' then 'rejected' else 'accepted' end,
        'human', p_actor_id, now()
      ) on conflict (resolution_id, task_id) do update set
        decision = excluded.decision,
        decision_source = 'human',
        corrected_by = p_actor_id,
        corrected_at = now();

      update public.meeting_segment_resolutions
      set human_reviewed = true, human_empty_decision = false
      where id = v_resolution.id;
    else
      raise exception 'INVALID_REVIEW_OPERATION';
    end if;
  end loop;

  select count(*) into v_count
  from public.meeting_task_match_results
  where resolution_id = v_resolution.id and decision = 'accepted';
  select case
    when (select human_empty_decision from public.meeting_segment_resolutions where id = v_resolution.id) then 'rejected'
    when v_count > 0 then 'accepted'
    else 'needs_review'
  end into v_state;

  update public.meeting_segment_resolutions
  set revision = revision + 1,
      resolution_state = v_state,
      updated_at = now()
  where id = v_resolution.id
  returning * into v_resolution;

  update public.meeting_capture_sessions
  set review_revision = review_revision + 1, updated_at = now()
  where id = v_capture.id;

  return jsonb_build_object(
    'resolutionId', v_resolution.id,
    'resolutionRevision', v_resolution.revision,
    'reviewRevision', (select review_revision from public.meeting_capture_sessions where id = v_capture.id),
    'state', v_resolution.resolution_state
  );
end;
$$;

revoke all on function public.decide_meeting_match_v1(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.decide_meeting_match_v1(uuid, uuid, bigint, jsonb) to service_role;

-- Pause is a capture lifecycle state: it keeps the source open without
-- collecting audio or pointer intervals and is resumed by an explicit user
-- gesture with a new clock epoch.
alter table public.meeting_capture_sessions
  drop constraint if exists meeting_capture_sessions_state_check;
alter table public.meeting_capture_sessions
  add constraint meeting_capture_sessions_state_check check (
    state in ('created','recording','paused','stopped','uploading','queued','running','ready','awaiting_budget','cancelled','expired','failed_retryable','failed_terminal')
  );
drop index if exists meeting_capture_one_active_idx;
create unique index meeting_capture_one_active_idx
  on public.meeting_capture_sessions(record_id)
  where state in ('created','recording','paused','stopped','uploading','queued','running','awaiting_budget','failed_retryable');
