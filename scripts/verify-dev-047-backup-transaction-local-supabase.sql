\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000101', 'dev047-owner@local.test', now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'dev047-viewer@local.test', now(), now()),
  ('00000000-0000-4000-8000-000000000103', 'dev047-admin@local.test', now(), now()),
  ('00000000-0000-4000-8000-000000000104', 'dev047-pm@local.test', now(), now()),
  ('00000000-0000-4000-8000-000000000105', 'dev047-member@local.test', now(), now());

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-4000-8000-000000000101', 'dev047-owner@local.test', 'DEV-047 owner'),
  ('00000000-0000-4000-8000-000000000102', 'dev047-viewer@local.test', 'DEV-047 viewer'),
  ('00000000-0000-4000-8000-000000000103', 'dev047-admin@local.test', 'DEV-047 admin'),
  ('00000000-0000-4000-8000-000000000104', 'dev047-pm@local.test', 'DEV-047 project manager'),
  ('00000000-0000-4000-8000-000000000105', 'dev047-member@local.test', 'DEV-047 member');

insert into public.tenants (id, name, legacy_workspace_id, owner_id)
values (
  '00000000-0000-4000-8000-000000000201',
  'DEV-047 workspace',
  'fixture-workspace',
  '00000000-0000-4000-8000-000000000101'
);

insert into public.tenant_members (tenant_id, user_id, role, status)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000104', 'project_manager', 'active'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000105', 'member', 'active');

insert into public.projects (id, tenant_id, name, legacy_board_id, sort_order, created_by)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'DEV-047 source board',
  'fixture-board',
  1,
  '00000000-0000-4000-8000-000000000101'
);

insert into public.project_members (project_id, tenant_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'owner'),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 'viewer'),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 'admin'),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000104', 'project_manager'),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000105', 'member');

insert into public.wbs_items (
  id, tenant_id, project_id, legacy_node_id, title, status, item_type, sort_order, created_by, updated_by
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000301',
    'task-a', 'Existing task A', 'todo', 'group', 0,
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000301',
    'target-only', 'Target-only task', 'todo', 'task', 99,
    '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101'
  );

insert into public.task_tags (
  id, tenant_id, legacy_tag_id, name, color, sort_order, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000201',
  'target-critical', 'Critical', 'blue', 0,
  '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101'
);

insert into public.tenants (id, name, legacy_workspace_id, owner_id)
values (
  '00000000-0000-4000-8000-000000000202',
  'DEV-047 foreign workspace',
  'fixture-foreign-workspace',
  '00000000-0000-4000-8000-000000000101'
);

insert into public.tenant_members (tenant_id, user_id, role, status)
values (
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000101',
  'owner',
  'active'
);

insert into public.projects (id, tenant_id, name, legacy_board_id, sort_order, created_by)
values (
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000202',
  'DEV-047 foreign board',
  'fixture-foreign-board',
  1,
  '00000000-0000-4000-8000-000000000101'
);

insert into public.wbs_items (
  id, tenant_id, project_id, legacy_node_id, title, status, item_type, sort_order, created_by, updated_by
) values (
  '00000000-0000-4000-8000-000000000490',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000302',
  'foreign-task', 'Foreign task', 'todo', 'task', 0,
  '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000101'
);

do $test$
declare
  v_tenant_id constant uuid := '00000000-0000-4000-8000-000000000201';
  v_project_id constant uuid := '00000000-0000-4000-8000-000000000301';
  owner_id constant uuid := '00000000-0000-4000-8000-000000000101';
  viewer_id constant uuid := '00000000-0000-4000-8000-000000000102';
  admin_id constant uuid := '00000000-0000-4000-8000-000000000103';
  project_manager_id constant uuid := '00000000-0000-4000-8000-000000000104';
  member_id constant uuid := '00000000-0000-4000-8000-000000000105';
  copy_execution constant uuid := '00000000-0000-4000-8000-000000000601';
  viewer_execution constant uuid := '00000000-0000-4000-8000-000000000602';
  stale_execution constant uuid := '00000000-0000-4000-8000-000000000603';
  replace_execution constant uuid := '00000000-0000-4000-8000-000000000604';
  rollback_execution constant uuid := '00000000-0000-4000-8000-000000000605';
  pm_execution constant uuid := '00000000-0000-4000-8000-000000000606';
  collision_execution constant uuid := '00000000-0000-4000-8000-000000000607';
  package_value jsonb := $json$
  {
    "format": "projed-backup",
    "schemaVersion": 2,
    "packageId": "00000000-0000-4000-8000-000000000701",
    "createdAt": "2026-07-14T00:00:00.000Z",
    "source": {
      "appVersion": "dev-047-sql-test",
      "backend": "supabase",
      "workspaceId": "fixture-workspace",
      "boardId": "fixture-board",
      "boardTitle": "DEV-047 source board"
    },
    "scope": { "type": "board" },
    "manifest": {
      "entities": { "tasks": 2, "dependencies": 1, "tags": 1 },
      "includes": ["tasks"],
      "excludes": ["members"],
      "canonicalization": "json-sort-v1",
      "checksum": { "algorithm": "SHA-256", "value": "local-sql-fixture" }
    },
    "payload": {
      "board": { "title": "DEV-047 source board" },
      "tasks": [
        {
          "sourceId": "task-a", "parentSourceId": null, "title": "Restored task A",
          "detailNotes": [{ "id": "note-a", "title": "QC", "content": "SQL round trip" }],
          "description": "restored", "status": "in_progress", "collaboratorIds": [],
          "tagSourceIds": ["tag-source"], "startDate": "2026-07-01", "endDate": "2026-07-10",
          "isDurationLocked": true, "nodeType": "group", "order": 0, "isArchived": false
        },
        {
          "sourceId": "task-b", "parentSourceId": "task-a", "title": "Restored task B",
          "status": "completed", "collaboratorIds": [], "tagSourceIds": ["tag-source"],
          "isDurationLocked": false, "nodeType": "task", "kanbanStageSourceId": "task-a",
          "order": 1, "isArchived": true
        }
      ],
      "dependencies": [
        {
          "sourceId": "dependency-a", "fromSourceId": "task-a", "fromSide": "end",
          "toSourceId": "task-b", "toSide": "start", "offset": 2
        }
      ],
      "tags": [
        { "sourceId": "tag-source", "name": "Critical", "color": "red", "order": 0 }
      ]
    }
  }
  $json$::jsonb;
  bad_package jsonb;
  collision_package jsonb;
  preview jsonb;
  copy_result jsonb;
  replay_result jsonb;
  replace_result jsonb;
  pm_result jsonb;
  copied_project_id uuid;
  old_fingerprint text;
  current_fingerprint text;
  before_count integer;
  after_count integer;
begin
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'copy preview unexpectedly blocked: %', preview;
  end if;
  if (preview #>> '{counts,create}')::integer <> 2
    or (preview #>> '{counts,tagsToReuse}')::integer <> 1
    or not exists (
      select 1 from jsonb_array_elements_text(preview -> 'warnings') warning(value)
      where warning.value like '%沿用目標工作區的 blue 顏色%'
    )
  then
    raise exception 'copy preview counts are incorrect: %', preview;
  end if;

  copy_result := public.import_board_backup_v2(
    v_tenant_id, null, 'copy_to_new_board', package_value, 'DEV-047 copied board', copy_execution, null
  );
  if copy_result ->> 'targetBoardTitle' <> 'DEV-047 copied board'
    or (select count(*) from jsonb_object_keys(copy_result -> 'sourceTaskIdMap')) <> 2
  then
    raise exception 'copy result is incomplete: %', copy_result;
  end if;
  select count(*) into before_count
  from public.projects project
  where project.tenant_id = v_tenant_id and project.name = 'DEV-047 copied board';
  if before_count <> 1 then raise exception 'copy did not create exactly one board'; end if;
  select project.id into copied_project_id
  from public.projects project
  where project.tenant_id = v_tenant_id and project.name = 'DEV-047 copied board';
  if not exists (
    select 1
    from public.wbs_items child
    join public.wbs_items stage
      on stage.project_id = child.project_id
     and stage.id::text = child.kanban_stage_id
    where child.project_id = copied_project_id
      and child.metadata ->> 'backupSourceId' = 'task-b'
      and stage.metadata ->> 'backupSourceId' = 'task-a'
  ) then
    raise exception 'copy did not remap kanban stage through the task ID map';
  end if;
  if (select color::text from public.task_tags where id = '00000000-0000-4000-8000-000000000501') <> 'blue' then
    raise exception 'copy overwrote the target tag color';
  end if;

  replay_result := public.import_board_backup_v2(
    v_tenant_id, null, 'copy_to_new_board', package_value, 'DEV-047 copied board', copy_execution, null
  );
  select count(*) into after_count
  from public.projects project
  where project.tenant_id = v_tenant_id and project.name = 'DEV-047 copied board';
  if replay_result ->> 'idempotentReplay' <> 'true' or after_count <> before_count then
    raise exception 'idempotency failed: %', replay_result;
  end if;

  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if coalesce((preview ->> 'allowed')::boolean, false)
    or not (preview -> 'blockers') @> '[{"code":"PERMISSION_DENIED"}]'::jsonb
  then
    raise exception 'viewer copy was not blocked: %', preview;
  end if;
  begin
    perform public.import_board_backup_v2(
      v_tenant_id, null, 'copy_to_new_board', package_value, 'Viewer copy', viewer_execution, null
    );
    raise exception 'viewer execution unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'PERMISSION_DENIED:%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'admin copy unexpectedly blocked: %', preview;
  end if;
  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'admin replace unexpectedly blocked: %', preview;
  end if;

  perform set_config('request.jwt.claim.sub', project_manager_id::text, true);
  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'project manager copy unexpectedly blocked: %', preview;
  end if;
  pm_result := public.import_board_backup_v2(
    v_tenant_id, null, 'copy_to_new_board', package_value, 'DEV-047 PM copy', pm_execution, null
  );
  if (
    select member.role::text
    from public.project_members member
    where member.project_id = (pm_result ->> 'targetBoardId')::uuid
      and member.user_id = project_manager_id
  ) <> 'project_manager' then
    raise exception 'copy elevated the project manager role: %', pm_result;
  end if;
  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'project manager replace unexpectedly blocked: %', preview;
  end if;

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'member copy unexpectedly allowed: %', preview;
  end if;
  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', package_value);
  if coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'member replace unexpectedly allowed: %', preview;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  preview := public.preview_board_backup_v2(v_tenant_id, null, 'copy_to_new_board', package_value);
  if coalesce((preview ->> 'allowed')::boolean, false) then
    raise exception 'signed-out preview unexpectedly allowed';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  collision_package := jsonb_set(
    replace(package_value::text, '"task-a"', '"00000000-0000-4000-8000-000000000490"')::jsonb,
    '{packageId}',
    '"00000000-0000-4000-8000-000000000703"'::jsonb
  );
  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', collision_package);
  if coalesce((preview ->> 'allowed')::boolean, false)
    or not (preview -> 'blockers') @> '[{"code":"CROSS_BOARD_ID_COLLISION"}]'::jsonb
  then
    raise exception 'cross-tenant task collision was not blocked: %', preview;
  end if;
  begin
    perform public.import_board_backup_v2(
      v_tenant_id, v_project_id, 'replace_current_board', collision_package,
      'ignored title', collision_execution, preview ->> 'expectedTargetFingerprint'
    );
    raise exception 'cross-tenant collision execution unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'CROSS_BOARD_ID_COLLISION:%' then raise; end if;
  end;
  if not exists (
    select 1 from public.wbs_items item
    where item.id = '00000000-0000-4000-8000-000000000490'
      and item.tenant_id = '00000000-0000-4000-8000-000000000202'
      and item.project_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'cross-tenant collision moved or deleted the foreign task';
  end if;

  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', package_value);
  if not coalesce((preview ->> 'allowed')::boolean, false)
    or (preview #>> '{counts,update}')::integer <> 1
    or (preview #>> '{counts,create}')::integer <> 1
    or (preview #>> '{counts,delete}')::integer <> 1
  then
    raise exception 'replace preview is incorrect: %', preview;
  end if;
  old_fingerprint := preview ->> 'expectedTargetFingerprint';
  update public.wbs_items set title = 'Concurrent edit'
  where tenant_id = v_tenant_id and project_id = v_project_id and legacy_node_id = 'task-a';
  begin
    perform public.import_board_backup_v2(
      v_tenant_id, v_project_id, 'replace_current_board', package_value,
      'ignored title', stale_execution, old_fingerprint
    );
    raise exception 'stale replace unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'TARGET_CHANGED:%' then raise; end if;
  end;
  if not exists (
    select 1 from public.wbs_items item
    where item.project_id = v_project_id and item.legacy_node_id = 'task-a' and item.title = 'Concurrent edit'
  ) then
    raise exception 'stale replace modified target data';
  end if;

  preview := public.preview_board_backup_v2(v_tenant_id, v_project_id, 'replace_current_board', package_value);
  current_fingerprint := preview ->> 'expectedTargetFingerprint';
  replace_result := public.import_board_backup_v2(
    v_tenant_id, v_project_id, 'replace_current_board', package_value,
    'ignored title', replace_execution, current_fingerprint
  );
  if replace_result ->> 'targetBoardId' <> 'fixture-board'
    or (replace_result #>> '{counts,delete}')::integer <> 1
  then
    raise exception 'replace result is incorrect: %', replace_result;
  end if;
  if (select name from public.projects where id = v_project_id) <> 'DEV-047 source board' then
    raise exception 'replace changed board title';
  end if;
  if exists (select 1 from public.wbs_items where project_id = v_project_id and legacy_node_id = 'target-only')
    or not exists (select 1 from public.wbs_items where project_id = v_project_id and legacy_node_id = 'task-a' and title = 'Restored task A')
    or not exists (select 1 from public.wbs_items where project_id = v_project_id and legacy_node_id = 'task-b' and is_archived)
  then
    raise exception 'replace did not produce the package task set';
  end if;
  if not exists (
    select 1
    from public.wbs_items child
    join public.wbs_items stage
      on stage.project_id = child.project_id
     and stage.id::text = child.kanban_stage_id
    where child.project_id = v_project_id
      and child.legacy_node_id = 'task-b'
      and stage.legacy_node_id = 'task-a'
  ) then
    raise exception 'replace did not remap legacy kanban stage through the task ID map';
  end if;

  bad_package := jsonb_set(
    jsonb_set(package_value, '{packageId}', '"00000000-0000-4000-8000-000000000702"'::jsonb),
    '{payload,dependencies,0,toSourceId}',
    '"missing-task"'::jsonb
  );
  select count(*) into before_count from public.projects where tenant_id = v_tenant_id;
  begin
    perform public.import_board_backup_v2(
      v_tenant_id, null, 'copy_to_new_board', bad_package,
      'DEV-047 rollback board', rollback_execution, null
    );
    raise exception 'invalid dependency unexpectedly succeeded';
  exception when others then
    if sqlerrm like 'invalid dependency unexpectedly succeeded' then raise; end if;
  end;
  select count(*) into after_count from public.projects where tenant_id = v_tenant_id;
  if after_count <> before_count
    or exists (select 1 from private.backup_import_executions where execution_id = rollback_execution)
  then
    raise exception 'failed copy left partial rows';
  end if;

  if not exists (
    select 1 from public.audit_logs log
    where log.tenant_id = v_tenant_id and log.action = 'board_backup_imported'
  ) then
    raise exception 'successful imports did not create audit evidence';
  end if;

  raise notice 'DEV-047 isolated Supabase transaction matrix passed';
end;
$test$;

rollback;
