\set ON_ERROR_STOP on

begin;

insert into public.tenants (id, legacy_workspace_id)
values ('11111111-1111-4111-8111-111111111111', 'dev123-tenant')
on conflict (id) do nothing;
insert into public.projects (id, tenant_id, legacy_board_id)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'dev123-project')
on conflict (id) do nothing;
insert into public.projects (id, tenant_id, legacy_board_id)
values ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', 'dev123-foreign-project')
on conflict (id) do nothing;
insert into public.profiles (id)
values ('33333333-3333-4333-8333-333333333333'), ('44444444-4444-4444-8444-444444444444')
on conflict (id) do nothing;
insert into public.knowledge_records (id, tenant_id, project_id, record_type, created_by, recorded_by, visibility, title)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'meeting', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'project', 'DEV-123 control readback')
on conflict (id) do nothing;
insert into public.knowledge_records (id, tenant_id, project_id, record_type, created_by, recorded_by, visibility, title)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'meeting', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'project', 'DEV-123 complete RPC')
on conflict (id) do nothing;
insert into public.project_members (tenant_id, project_id, user_id, role)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'editor')
on conflict (project_id, user_id) do nothing;
insert into public.wbs_items (id, tenant_id, project_id, title, path, item_type)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Control plane task', '["Control plane"]'::jsonb, 'task')
on conflict (id) do nothing;
insert into public.wbs_items (id, tenant_id, project_id, title, path, item_type)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Pointer-only task', '["Pointer-only"]'::jsonb, 'task')
on conflict (id) do nothing;
insert into public.wbs_items (id, tenant_id, project_id, title, path, item_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999', 'Foreign project task', '["Foreign"]'::jsonb, 'task')
on conflict (id) do nothing;

insert into public.meeting_capture_sessions (id, tenant_id, project_id, record_id, created_by, idempotency_key, state, source_version)
values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'dev123-control-readback', 'stopped', 1)
on conflict (id) do nothing;

insert into public.meeting_capture_segments (capture_id, source_version, segment_index, epoch, start_offset_ms, end_offset_ms, object_path, mime, bytes, sha256, upload_state)
values ('77777777-7777-4777-8777-777777777777', 1, 0, 0, 0, 1000, 'dev123/v1/0.webm', 'audio/webm', 3, repeat('a', 64), 'verified')
on conflict (capture_id, source_version, segment_index) do nothing;
update public.meeting_capture_sessions set source_version = 2, source_parent_version = 1 where id = '77777777-7777-4777-8777-777777777777';
insert into public.meeting_capture_segments (capture_id, source_version, segment_index, epoch, start_offset_ms, end_offset_ms, object_path, mime, bytes, sha256, upload_state)
values ('77777777-7777-4777-8777-777777777777', 2, 0, 1, 0, 1000, 'dev123/v2/0.webm', 'audio/webm', 3, repeat('b', 64), 'verified')
on conflict (capture_id, source_version, segment_index) do nothing;

insert into public.meeting_analysis_runs (id, capture_id, source_version, request_key, config_version, state, budget_month)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 2, 'dev123-control-run', 'dev-123.v1', 'queued', date '2026-09-01')
on conflict (id) do nothing;

insert into public.meeting_capture_sessions (id, tenant_id, project_id, record_id, created_by, idempotency_key, state, source_version)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '33333333-3333-4333-8333-333333333333', 'dev123-complete-rpc', 'stopped', 1)
on conflict (id) do nothing;
insert into public.meeting_capture_segments (capture_id, source_version, segment_index, epoch, start_offset_ms, end_offset_ms, object_path, mime, bytes, sha256, upload_state, upload_token_expires_at, verified_at)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, 0, 0, 0, 1000, 'dev123/complete/0.webm', 'audio/webm', 3, repeat('d', 64), 'verified', now() + interval '1 hour', now())
on conflict (capture_id, source_version, segment_index) do nothing;

do $$
declare
  first_allowed boolean;
  second_allowed boolean;
  claimed public.meeting_analysis_runs;
  decision jsonb;
  segment_versions integer;
  completion jsonb;
  completion_retry jsonb;
  retry_result jsonb;
  retry_replay jsonb;
  retry_run_count integer;
  retry_conflict_checked boolean := false;
  run_count integer;
  late_ready_id uuid;
  save_auth_checked boolean := false;
  published_projection_checked boolean := false;
  accepted_projection_checked boolean := false;
  complete_upload_timeline_checked boolean := false;
  projection_scope_checked boolean := false;
  projection_archive_checked boolean := false;
  projection_request_idempotency_checked boolean := false;
  capture_stop_checked boolean := false;
  index_plan_checked boolean := false;
  pointer_only_checked boolean := false;
  plan_line text;
  plan_text text;
  cleanup_identity_unique boolean;
begin
  -- Stop metadata is persisted as a server-owned frozen endpoint.  The
  -- default source gaps must be an empty JSON array, while a stopped capture
  -- can retain the final pointer sequence and explicit gap ranges.
  if not exists (
    select 1 from public.meeting_capture_sessions
    where id = '77777777-7777-4777-8777-777777777777'
      and final_pointer_sequence is null
      and source_gaps = '[]'::jsonb
  ) then raise exception 'stop metadata defaults are not safe'; end if;
  update public.meeting_capture_sessions
  set epoch_manifest = '[{"epoch":0,"captureOffsetMs":0,"monotonicStart":10,"durationMs":1000,"gapBeforeMs":0},{"epoch":1,"captureOffsetMs":1000,"monotonicStart":2020,"durationMs":500,"gapBeforeMs":20}]'::jsonb,
      final_pointer_sequence = 17,
      source_gaps = '[{"startOffsetMs":1000,"endOffsetMs":1020,"reason":"pause"}]'::jsonb
  where id = '77777777-7777-4777-8777-777777777777';
  if not exists (
    select 1 from public.meeting_capture_sessions
    where id = '77777777-7777-4777-8777-777777777777'
      and final_pointer_sequence = 17
      and jsonb_array_length(source_gaps) = 1
      and jsonb_array_length(epoch_manifest) = 2
  ) then raise exception 'stop metadata was not frozen'; end if;
  capture_stop_checked := true;

  -- Use the production lookup predicates with sequential scans disabled so a
  -- small fixture still proves that the declared high-volume indexes are
  -- usable by the worker, pointer, transcript, expiry and cleanup paths.
  set local enable_seqscan = off;
  plan_text := '';
  for plan_line in execute 'explain (costs off) select id from public.meeting_analysis_runs where state = ''queued'' and next_attempt_at is not null order by next_attempt_at' loop
    plan_text := plan_text || plan_line;
  end loop;
  if position('meeting_capture_state_attempt_idx' in plan_text) = 0 then raise exception 'worker claim index plan missing'; end if;
  plan_text := '';
  for plan_line in execute 'explain (costs off) select sequence from public.meeting_pointer_intervals where capture_id = ''77777777-7777-4777-8777-777777777777'' order by created_at' loop
    plan_text := plan_text || plan_line;
  end loop;
  if position('meeting_pointer_capture_created_idx' in plan_text) = 0 then raise exception 'pointer index plan missing'; end if;
  plan_text := '';
  for plan_line in execute 'explain (costs off) select id from public.meeting_transcript_segments where capture_id = ''77777777-7777-4777-8777-777777777777'' order by segment_index' loop
    plan_text := plan_text || plan_line;
  end loop;
  if position('meeting_transcript_capture_idx' in plan_text) = 0 then raise exception 'transcript index plan missing'; end if;
  plan_text := '';
  for plan_line in execute 'explain (costs off) select id from public.meeting_capture_sessions where audio_expires_at <= now()' loop
    plan_text := plan_text || plan_line;
  end loop;
  if position('meeting_capture_audio_expiry_idx' in plan_text) = 0 then raise exception 'audio expiry index plan missing'; end if;
  plan_text := '';
  for plan_line in execute 'explain (costs off) select obligation_id from private.meeting_artifact_cleanup where state = ''pending'' and due_at <= now()' loop
    plan_text := plan_text || plan_line;
  end loop;
  if position('meeting_cleanup_due_idx' in plan_text) = 0 then raise exception 'cleanup index plan missing'; end if;
  index_plan_checked := true;

  select private.reserve_meeting_budget_v1(date '2026-09-01', 700000000, 'dev123-attempt-1', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 'dev123:transcribe', 'fake', 'dev-123-fake', 'dev-123.v1') into first_allowed;
  if not first_allowed then raise exception 'first budget reservation was rejected'; end if;
  select private.reserve_meeting_budget_v1(date '2026-09-01', 400000000, 'dev123-attempt-2', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 'dev123:matching', 'fake', 'dev-123-fake', 'dev-123.v1') into second_allowed;
  if second_allowed then raise exception 'budget cap did not reject second reservation'; end if;
  if not private.settle_meeting_budget_v1('dev123-attempt-1', 100000000, 'known', 'ready') then raise exception 'budget settlement failed'; end if;
  select * into claimed from private.claim_meeting_analysis_run_v1();
  if claimed.id <> '88888888-8888-4888-8888-888888888888' or claimed.state <> 'running' then raise exception 'SKIP LOCKED claim failed'; end if;

  insert into public.meeting_transcript_segments (id, capture_id, transcript_revision_id, producer_run_id, segment_index, start_offset_ms, end_offset_ms, raw_text, normalized_text, source_hash)
  values ('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888', 0, 0, 1000, 'Control plane task', 'Control plane task', repeat('c', 64));
  insert into public.meeting_segment_resolutions (id, capture_id, transcript_segment_id, latest_run_id, config_version)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '77777777-7777-4777-8777-777777777777', '99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', 'dev-123.v1');
  insert into public.meeting_task_match_results (resolution_id, task_id, semantic_score, pointer_feature, quote_range, ai_suggestion_version)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 0.9, 0.1, '{"fromWord":0,"toWord":2}'::jsonb, 'dev-123.v1');
  select public.decide_meeting_match_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 0, '[{"action":"accept","taskId":"66666666-6666-4666-8666-666666666666"}]'::jsonb) into decision;
  if decision->>'state' <> 'accepted' then raise exception 'decision CAS did not accept'; end if;
  begin
    perform public.decide_meeting_match_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 0, '[]'::jsonb);
    raise exception 'stale decision CAS was accepted';
  exception when others then
    if position('REVIEW_VERSION_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;

  -- Pointer dwell can rank a task, but an automatic accept still requires an
  -- original-text quote. A human add/replace remains the explicit fallback.
  insert into public.meeting_transcript_segments (id, capture_id, transcript_revision_id, producer_run_id, segment_index, start_offset_ms, end_offset_ms, raw_text, normalized_text, source_hash)
  values ('12121212-1212-4121-8121-121212121212', '77777777-7777-4777-8777-777777777777', '14141414-1414-4141-8141-141414141414', '88888888-8888-4888-8888-888888888888', 1, 1000, 2000, '指向任務但未明確發言', '指向任務但未明確發言', repeat('e', 64));
  insert into public.meeting_segment_resolutions (id, capture_id, transcript_segment_id, latest_run_id, config_version)
  values ('13131313-1313-4131-8131-131313131313', '77777777-7777-4777-8777-777777777777', '12121212-1212-4121-8121-121212121212', '88888888-8888-4888-8888-888888888888', 'dev-123.v1');
  insert into public.meeting_task_match_results (resolution_id, task_id, pointer_feature, quote_range, ai_suggestion_version)
  values ('13131313-1313-4131-8131-131313131313', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0.9, null, 'dev-123.v1');
  begin
    perform public.decide_meeting_match_v1('13131313-1313-4131-8131-131313131313', '33333333-3333-4333-8333-333333333333', 0, '[{"action":"accept","taskId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}]'::jsonb);
    raise exception 'pointer-only candidate was accepted';
  exception when others then
    if position('POINTER_ONLY_NOT_ACCEPTABLE' in sqlerrm) = 0 then raise; end if;
    pointer_only_checked := true;
  end;

  select count(*) into segment_versions from public.meeting_capture_segments where capture_id = '77777777-7777-4777-8777-777777777777' and segment_index = 0;
  if segment_versions <> 2 then raise exception 'source-version segment uniqueness failed'; end if;
  if has_table_privilege('anon', 'public.meeting_capture_sessions', 'select') then raise exception 'anon raw select privilege leaked'; end if;
  if not has_table_privilege('service_role', 'public.meeting_capture_sessions', 'select') then raise exception 'service_role raw select privilege missing'; end if;

  -- Manual retry is one RPC transaction: same key replays the durable run,
  -- while a conflicting key sees the queued capture and cannot leave an
  -- orphan run behind after the state transition.
  update public.meeting_analysis_runs
  set state = 'ready', lease_token = null, lease_expires_at = null
  where id = '88888888-8888-4888-8888-888888888888';
  update public.meeting_capture_sessions
  set state = 'ready'
  where id = '77777777-7777-4777-8777-777777777777';
  select public.retry_meeting_analysis_v1(
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    '33333333-3333-4333-8333-333333333333',
    'dev123-manual-retry-1', 'retry'
  ) into retry_result;
  if retry_result->>'idempotent' <> 'false' or retry_result->>'runId' is null then raise exception 'manual retry did not create one run'; end if;
  if not exists (select 1 from public.meeting_capture_sessions where id = '77777777-7777-4777-8777-777777777777' and state = 'queued') then raise exception 'manual retry did not queue capture'; end if;
  select public.retry_meeting_analysis_v1(
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    '33333333-3333-4333-8333-333333333333',
    'dev123-manual-retry-1', 'retry'
  ) into retry_replay;
  if retry_replay->>'idempotent' <> 'true' or retry_replay->>'runId' <> retry_result->>'runId' then raise exception 'manual retry replay was not idempotent'; end if;
  begin
    perform public.retry_meeting_analysis_v1(
      '77777777-7777-4777-8777-777777777777',
      '88888888-8888-4888-8888-888888888888',
      '33333333-3333-4333-8333-333333333333',
      'dev123-manual-retry-conflict', 'retry'
    );
    raise exception 'conflicting retry was accepted after capture queue';
  exception when others then
    if position('CAPTURE_CANNOT_BE_RETRIED' in sqlerrm) = 0 then raise; end if;
    retry_conflict_checked := true;
  end;
  select count(*) into retry_run_count
  from public.meeting_analysis_runs
  where capture_id = '77777777-7777-4777-8777-777777777777' and request_key = 'dev123-manual-retry-conflict';
  if not retry_conflict_checked or retry_run_count <> 0 then raise exception 'conflicting retry left an orphan run'; end if;

  -- The following projection cases need a terminal-ready capture after the
  -- retry atomicity case intentionally leaves it queued.
  update public.meeting_capture_sessions
  set state = 'ready'
  where id = '77777777-7777-4777-8777-777777777777';

  select public.complete_meeting_upload_v1(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '33333333-3333-4333-8333-333333333333',
    1,
    '[{"segmentIndex":0,"epoch":0,"bytes":3,"startOffsetMs":0,"endOffsetMs":1000,"overlapMs":0,"gapBeforeMs":0,"mime":"audio/webm","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objectPath":"dev123/complete/0.webm","uploadState":"verified"}]'::jsonb,
    'audio-manifest-hash', 'pointer-manifest-hash', 'complete', 'fake'
  ) into completion;
  if completion->>'state' <> 'queued' or completion->>'runId' is null or completion->>'sourceComplete' <> 'true' then raise exception 'complete-upload RPC did not atomically queue'; end if;
  begin
    perform public.complete_meeting_upload_v1(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '33333333-3333-4333-8333-333333333333',
      1,
      '[{"segmentIndex":0,"epoch":1,"bytes":3,"startOffsetMs":0,"endOffsetMs":1000,"overlapMs":0,"gapBeforeMs":0,"mime":"audio/webm","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objectPath":"dev123/complete/0.webm","uploadState":"verified"}]'::jsonb,
      'audio-manifest-hash', 'pointer-manifest-hash', 'complete', 'fake'
    );
    raise exception 'timeline conflict was accepted';
  exception when others then
    if position('AUDIO_SEGMENT_TIMELINE_CONFLICT' in sqlerrm) = 0 then raise; end if;
    complete_upload_timeline_checked := true;
  end;
  begin
    perform public.complete_meeting_upload_v1(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '33333333-3333-4333-8333-333333333333',
      2,
      '[{"segmentIndex":0,"epoch":0,"bytes":3,"startOffsetMs":0,"endOffsetMs":1000,"overlapMs":0,"gapBeforeMs":0,"mime":"audio/webm","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objectPath":"dev123/complete/0.webm","uploadState":"verified"}]'::jsonb,
      'audio-manifest-hash', 'pointer-manifest-hash', 'complete', 'fake'
    );
    raise exception 'stale complete-upload source version was accepted';
  exception when others then
    if position('SOURCE_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;
  select public.complete_meeting_upload_v1(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '33333333-3333-4333-8333-333333333333',
    1,
    '[{"segmentIndex":0,"epoch":0,"bytes":3,"startOffsetMs":0,"endOffsetMs":1000,"overlapMs":0,"gapBeforeMs":0,"mime":"audio/webm","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objectPath":"dev123/complete/0.webm","uploadState":"verified"}]'::jsonb,
    'audio-manifest-hash', 'pointer-manifest-hash', 'complete', 'fake'
  ) into completion_retry;
  if completion_retry->>'idempotent' <> 'true' or completion_retry->>'runId' <> completion->>'runId' then raise exception 'complete-upload retry was not idempotent'; end if;
  begin
    perform public.complete_meeting_upload_v1(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '33333333-3333-4333-8333-333333333333',
      1,
      '[{"segmentIndex":0,"epoch":0,"bytes":3,"startOffsetMs":0,"endOffsetMs":1000,"overlapMs":0,"gapBeforeMs":0,"mime":"audio/webm","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","objectPath":"dev123/complete/0.webm","uploadState":"verified"}]'::jsonb,
      'audio-manifest-hash', 'pointer-manifest-hash', 'partial', 'fake'
    );
    raise exception 'frozen source accepted partial downgrade';
  exception when others then
    if position('SOURCE_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;
  if not exists (
    select 1 from public.meeting_capture_sessions
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and state = 'queued' and source_frozen_at is not null
  ) then raise exception 'partial replay reopened frozen source'; end if;
  select count(*) into run_count from public.meeting_analysis_runs where capture_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if run_count <> 1 then raise exception 'complete-upload created duplicate runs'; end if;

  -- A late worker projection must not resurrect a capture cancelled after the
  -- run became terminal.  This mirrors the worker's guarded state update.
  update public.meeting_capture_sessions
  set state = 'cancelled'
  where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  update public.meeting_capture_sessions
  set state = 'ready'
  where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    and state in ('queued', 'running', 'awaiting_budget')
  returning id into late_ready_id;
  if late_ready_id is not null then raise exception 'late worker resurrected cancelled capture'; end if;
  if not exists (
    select 1 from public.meeting_capture_sessions
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and state = 'cancelled'
  ) then raise exception 'cancelled capture state was not preserved'; end if;

  -- Projection must recheck private meeting editor semantics inside the
  -- security-definer transaction, not rely only on the Edge preflight.
  update public.knowledge_records set visibility = 'private'
  where id = '55555555-5555-4555-8555-555555555555';
  begin
    perform public.save_meeting_projection_v1(
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      '44444444-4444-4444-8444-444444444444',
      null, null, '', '', 'draft', '{}'::jsonb, '[]'::jsonb,
      'dev123-private-save-auth', 'dev123-private-save-auth-hash'
    );
    raise exception 'private projection write bypassed editor guard';
  exception when others then
    if position('FORBIDDEN' in sqlerrm) = 0 then raise; end if;
    save_auth_checked := true;
  end;
  update public.knowledge_records set visibility = 'project'
  where id = '55555555-5555-4555-8555-555555555555';
  if not save_auth_checked then raise exception 'private projection auth case did not execute'; end if;

  -- A published meeting is terminal for draft projection.  A late worker or
  -- stale editor must not silently reopen it or change it back to draft.
  update public.knowledge_records
  set status = 'published'
  where id = '55555555-5555-4555-8555-555555555555';
  begin
    perform public.save_meeting_projection_v1(
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      '33333333-3333-4333-8333-333333333333',
      null, null, 'late publish attempt', '', 'draft', '{}'::jsonb, '[]'::jsonb,
      'dev123-published-projection', 'dev123-published-projection-hash'
    );
    raise exception 'published meeting accepted late projection';
  exception when others then
    if position('MEETING_RECORD_CONFLICT' in sqlerrm) = 0 then raise; end if;
    published_projection_checked := true;
  end;
  update public.knowledge_records
  set status = 'draft'
  where id = '55555555-5555-4555-8555-555555555555';
  if not published_projection_checked then raise exception 'published projection guard did not execute'; end if;

  -- The durable projection must union the server-owned accepted decision even
  -- when the client sends no task link.  This prevents a stale or malicious
  -- client payload from dropping an accepted match at save time.
  perform public.save_meeting_projection_v1(
    '55555555-5555-4555-8555-555555555555',
    '77777777-7777-4777-8777-777777777777',
    '33333333-3333-4333-8333-333333333333',
    null, null, 'accepted decision projection', '', 'draft',
    '{"meetingTaskResolution":{"manualLinkSet":[],"autoLinkSet":[]}}'::jsonb,
    '[]'::jsonb,
    'dev123-accepted-decision-projection', 'dev123-accepted-decision-projection-hash'
  );
  if not exists (
    select 1 from public.record_task_links
    where record_id = '55555555-5555-4555-8555-555555555555'
      and item_id = '66666666-6666-4666-8666-666666666666'
  ) then raise exception 'accepted decision was not projected into record task links'; end if;
  accepted_projection_checked := true;

  -- Projection request keys are durable idempotency boundaries.  A replay of
  -- the same payload must not bump record/projection versions, while reusing
  -- a key for different content must fail before any link mutation.
  declare
    projection_version_before bigint;
    projection_version_after bigint;
  begin
    select record_version into projection_version_before
    from private.meeting_draft_projections
    where record_id = '55555555-5555-4555-8555-555555555555';
    perform public.save_meeting_projection_v1(
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      '33333333-3333-4333-8333-333333333333',
      null, null, 'accepted decision projection', '', 'draft',
      '{"meetingTaskResolution":{"manualLinkSet":[],"autoLinkSet":[]}}'::jsonb,
      '[]'::jsonb,
      'dev123-accepted-decision-projection', 'dev123-accepted-decision-projection-hash'
    );
    select record_version into projection_version_after
    from private.meeting_draft_projections
    where record_id = '55555555-5555-4555-8555-555555555555';
    if projection_version_after <> projection_version_before then raise exception 'projection replay was not idempotent'; end if;
    begin
      perform public.save_meeting_projection_v1(
        '55555555-5555-4555-8555-555555555555',
        '77777777-7777-4777-8777-777777777777',
        '33333333-3333-4333-8333-333333333333',
        null, null, 'changed payload', '', 'draft',
        '{"meetingTaskResolution":{"manualLinkSet":[],"autoLinkSet":[]}}'::jsonb,
        '[]'::jsonb,
        'dev123-accepted-decision-projection', 'different-payload-hash'
      );
      raise exception 'projection request key conflict was accepted';
    exception when others then
      if position('PROJECTION_REQUEST_CONFLICT' in sqlerrm) = 0 then raise; end if;
    end;
    projection_request_idempotency_checked := true;
  end;

  -- A projection must reject stale or cross-project task links instead of
  -- silently filtering them out and saving a partial draft.
  update public.meeting_capture_sessions
  set state = 'ready'
  where id = '77777777-7777-4777-8777-777777777777';
  begin
    perform public.save_meeting_projection_v1(
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      '33333333-3333-4333-8333-333333333333',
      null, null, 'DEV-123 control readback', '', 'draft', '{}'::jsonb,
      '[{"item_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"related"}]'::jsonb,
      'dev123-foreign-link', 'dev123-foreign-link-hash'
    );
    raise exception 'cross-project projection link was silently filtered';
  exception when others then
    if position('TASK_OUTSIDE_PROJECT' in sqlerrm) = 0 then raise; end if;
    projection_scope_checked := true;
  end;
  update public.wbs_items set is_archived = true where id = '66666666-6666-4666-8666-666666666666';
  begin
    perform public.save_meeting_projection_v1(
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777',
      '33333333-3333-4333-8333-333333333333',
      null, null, 'DEV-123 control readback', '', 'draft', '{}'::jsonb,
      '[{"item_id":"66666666-6666-4666-8666-666666666666","role":"related"}]'::jsonb,
      'dev123-archived-link', 'dev123-archived-link-hash'
    );
    raise exception 'archived projection link was silently filtered';
  exception when others then
    if position('TASK_OUTSIDE_PROJECT' in sqlerrm) = 0 then raise; end if;
    projection_archive_checked := true;
  end;
  update public.wbs_items set is_archived = false where id = '66666666-6666-4666-8666-666666666666';
  if not projection_scope_checked or not projection_archive_checked then raise exception 'projection task scope cases did not execute'; end if;
  if not accepted_projection_checked then raise exception 'accepted decision projection case did not execute'; end if;
  if not projection_request_idempotency_checked then raise exception 'projection request idempotency case did not execute'; end if;
  if not complete_upload_timeline_checked then raise exception 'complete-upload timeline case did not execute'; end if;
  if not capture_stop_checked then raise exception 'stop metadata case did not execute'; end if;
  if not index_plan_checked then raise exception 'index plan cases did not execute'; end if;
  if not pointer_only_checked then raise exception 'pointer-only acceptance guard did not execute'; end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'private' and indexname = 'meeting_cleanup_attempt_kind_idx'
  ) into cleanup_identity_unique;
  if not cleanup_identity_unique then raise exception 'cleanup obligation identity unique index missing'; end if;
  if not has_function_privilege('service_role', 'public.retry_meeting_analysis_v1(uuid, uuid, uuid, text, text)', 'execute') then
    raise exception 'service_role retry RPC privilege missing';
  end if;
end $$;

commit;

select 'DEV123_RESULT=' || json_build_object(
  'passed', true,
  'cases', json_build_object(
    'sourceVersionUnique', true,
    'budgetReserveSettle', true,
    'skipLockedClaim', true,
    'decisionCas', true,
    'rawTableGrants', true,
    'completeUploadAtomic', true,
    'completeUploadSourceVersionGuard', true,
    'completeUploadTimelineGuard', true,
    'captureStopMetadata', true,
    'indexPlans', true,
    'pointerOnlyAcceptanceGuard', true,
    'cancelLateWorkerGuard', true,
    'saveProjectionPrivateAuth', true,
    'publishedProjectionGuard', true,
    'acceptedDecisionProjection', true,
    'projectionRequestIdempotency', true,
    'projectionTaskScope', true,
    'cleanupIdentityUnique', true,
    'retryAtomicity', true
  )
)::text;
