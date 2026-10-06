-- DEV-123: the projection transaction owns accepted task links.
-- The browser may keep the draft link set in sync for immediate UI feedback,
-- but the durable save must union the stored accepted decisions inside the
-- security-definer transaction so a client cannot omit an accepted match.

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
  v_link record;
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
  if v_record.status <> 'draft' then raise exception 'MEETING_RECORD_CONFLICT'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'INVALID_RECORD_STATUS'; end if;
  if jsonb_typeof(coalesce(p_task_links, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_TASK_LINKS'; end if;

  for v_link in select item_id, role from jsonb_to_recordset(coalesce(p_task_links, '[]'::jsonb)) as link(item_id uuid, role text)
  loop
    if v_link.item_id is null or v_link.role not in ('main','related','decision','blocker','follow_up') then
      raise exception 'TASK_OUTSIDE_PROJECT';
    end if;
    perform 1
    from public.wbs_items item
    where item.id = v_link.item_id
      and item.tenant_id = v_record.tenant_id
      and item.project_id = v_record.project_id
      and item.is_archived = false
      and item.item_type::text in ('task', 'milestone')
    for share;
    if not found then raise exception 'TASK_OUTSIDE_PROJECT'; end if;
  end loop;

  -- Accepted decisions are the server-owned match authority.  Recheck their
  -- current WBS scope before changing the record so stale accepted matches
  -- fail closed instead of being silently discarded.
  for v_link in
    select distinct candidate_match.task_id as item_id
    from public.meeting_segment_resolutions resolution
    join public.meeting_task_match_results candidate_match on candidate_match.resolution_id = resolution.id
    where resolution.capture_id = p_capture_id and candidate_match.decision = 'accepted'
  loop
    perform 1
    from public.wbs_items item
    where item.id = v_link.item_id
      and item.tenant_id = v_record.tenant_id
      and item.project_id = v_record.project_id
      and item.is_archived = false
      and item.item_type::text in ('task', 'milestone')
    for share;
    if not found then raise exception 'TASK_OUTSIDE_PROJECT'; end if;
  end loop;

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
  from jsonb_to_recordset(coalesce(p_task_links, '[]'::jsonb)) as link(item_id uuid, role text);

  insert into public.record_task_links (tenant_id, project_id, record_id, item_id, role, created_by)
  select v_record.tenant_id, v_record.project_id, p_record_id, candidate_match.task_id, 'related', p_actor_id
  from public.meeting_segment_resolutions resolution
  join public.meeting_task_match_results candidate_match on candidate_match.resolution_id = resolution.id
  join public.wbs_items item on item.id = candidate_match.task_id
    and item.tenant_id = v_record.tenant_id
    and item.project_id = v_record.project_id
    and item.is_archived = false
    and item.item_type::text in ('task', 'milestone')
  where resolution.capture_id = p_capture_id
    and candidate_match.decision = 'accepted'
    and not exists (
      select 1 from public.record_task_links existing
      where existing.record_id = p_record_id and existing.item_id = candidate_match.task_id
    )
  group by candidate_match.task_id;

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
