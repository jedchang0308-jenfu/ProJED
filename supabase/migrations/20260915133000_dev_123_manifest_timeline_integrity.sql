-- DEV-123: complete-upload must bind the client manifest to the immutable
-- server segment timeline.  Bytes/hash/path alone are insufficient because a
-- client could otherwise reorder, duplicate, or rewrite epoch/gap/overlap
-- evidence while still passing the source freeze transaction.

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
  v_verified_count integer;
  v_index integer;
  v_epoch integer;
  v_start_offset_ms bigint;
  v_end_offset_ms bigint;
  v_overlap_ms integer;
  v_gap_before_ms integer;
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
    v_epoch := (v_item ->> 'epoch')::integer;
    v_start_offset_ms := coalesce((v_item ->> 'startOffsetMs')::bigint, (v_item ->> 'start_offset_ms')::bigint);
    v_end_offset_ms := coalesce((v_item ->> 'endOffsetMs')::bigint, (v_item ->> 'end_offset_ms')::bigint);
    v_overlap_ms := coalesce((v_item ->> 'overlapMs')::integer, (v_item ->> 'overlap_ms')::integer, 0);
    v_gap_before_ms := coalesce((v_item ->> 'gapBeforeMs')::integer, (v_item ->> 'gap_before_ms')::integer, 0);
    if v_index is null or v_index < 0 then raise exception 'AUDIO_MANIFEST_INDEX_INVALID'; end if;
    if v_epoch is null or v_epoch < 0 or v_start_offset_ms is null or v_start_offset_ms < 0
       or v_end_offset_ms is null or v_end_offset_ms <= v_start_offset_ms
       or v_overlap_ms is null or v_overlap_ms < 0 or v_overlap_ms > 500
       or v_gap_before_ms is null or v_gap_before_ms < 0 then
      raise exception 'AUDIO_MANIFEST_TIMELINE_INVALID';
    end if;
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
       or lower(v_segment.mime) <> lower(coalesce(v_item ->> 'mime', ''))
       or v_segment.epoch <> v_epoch
       or v_segment.start_offset_ms <> v_start_offset_ms
       or v_segment.end_offset_ms <> v_end_offset_ms
       or v_segment.overlap_ms <> v_overlap_ms
       or v_segment.gap_before_ms <> v_gap_before_ms then
      raise exception 'AUDIO_SEGMENT_TIMELINE_CONFLICT';
    end if;
  end loop;
  if p_source_completeness = 'complete' then
    if v_count = 0 then raise exception 'COMPLETE_SOURCE_REQUIRES_SEGMENTS'; end if;
    select count(*) into v_verified_count
    from public.meeting_capture_segments
    where capture_id = p_capture_id and source_version = v_source_version and upload_state = 'verified';
    if v_verified_count <> v_count then raise exception 'AUDIO_MANIFEST_NOT_CONTIGUOUS'; end if;
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

revoke all on function public.complete_meeting_upload_v1(uuid, uuid, integer, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_meeting_upload_v1(uuid, uuid, integer, jsonb, text, text, text, text) to service_role;
