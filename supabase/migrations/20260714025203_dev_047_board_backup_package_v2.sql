-- DEV-047 board-scoped Backup Package V2.
-- The public functions are the only mutation surface. Package inspection still
-- happens client-side, but every security, scope and concurrency rule is
-- revalidated in the database transaction.

create table if not exists private.backup_import_executions (
  execution_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null,
  import_mode text not null check (import_mode in ('copy_to_new_board', 'replace_current_board')),
  target_project_id uuid references public.projects(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'succeeded')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists backup_import_executions_actor_created_idx
  on private.backup_import_executions (actor_id, created_at desc);

revoke all on private.backup_import_executions from public, anon, authenticated;
grant all on private.backup_import_executions to service_role;

create or replace function private.board_backup_v2_fingerprint(
  target_tenant_id uuid,
  target_project_id uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  with task_rows as (
    select jsonb_build_object(
      'sourceId', coalesce(item.legacy_node_id, item.id::text),
      'parentSourceId', coalesce(parent.legacy_node_id, parent.id::text),
      'title', item.title,
      'detailNotes', item.detail_notes,
      'description', item.description,
      'status', item.status::text,
      'assigneeId', item.assignee_id::text,
      'collaboratorIds', to_jsonb(item.collaborator_ids),
      'tagSourceIds', coalesce((
        select jsonb_agg(coalesce(tag.legacy_tag_id, tag.id::text) order by coalesce(tag.legacy_tag_id, tag.id::text))
        from public.wbs_item_tags assignment
        join public.task_tags tag on tag.id = assignment.tag_id
        where assignment.tenant_id = item.tenant_id
          and assignment.project_id = item.project_id
          and assignment.item_id = item.id
      ), '[]'::jsonb),
      'startDate', item.start_date::text,
      'endDate', item.end_date::text,
      'isDurationLocked', item.is_duration_locked,
      'nodeType', item.item_type::text,
      'kanbanStageSourceId', item.kanban_stage_id,
      'order', item.sort_order,
      'isArchived', item.is_archived
    ) as value,
    coalesce(item.legacy_node_id, item.id::text) as source_id
    from public.wbs_items item
    left join public.wbs_items parent on parent.id = item.parent_id
    where item.tenant_id = target_tenant_id
      and item.project_id = target_project_id
  ), dependency_rows as (
    select jsonb_build_object(
      'fromSourceId', coalesce(from_item.legacy_node_id, from_item.id::text),
      'fromSide', dependency.from_side::text,
      'toSourceId', coalesce(to_item.legacy_node_id, to_item.id::text),
      'toSide', dependency.to_side::text,
      'offset', dependency.offset_days
    ) as value,
    concat_ws('|',
      coalesce(from_item.legacy_node_id, from_item.id::text),
      dependency.from_side::text,
      coalesce(to_item.legacy_node_id, to_item.id::text),
      dependency.to_side::text,
      dependency.offset_days::text
    ) as dependency_key
    from public.wbs_dependencies dependency
    join public.wbs_items from_item on from_item.id = dependency.from_item_id
    join public.wbs_items to_item on to_item.id = dependency.to_item_id
    where dependency.tenant_id = target_tenant_id
      and dependency.project_id = target_project_id
  ), tag_rows as (
    select distinct jsonb_build_object(
      'name', tag.name,
      'color', tag.color
    ) as value,
    lower(trim(tag.name)) as tag_key
    from public.wbs_item_tags assignment
    join public.task_tags tag on tag.id = assignment.tag_id
    where assignment.tenant_id = target_tenant_id
      and assignment.project_id = target_project_id
  ), fingerprint_payload as (
    select jsonb_build_object(
      'boardTitle', project.name,
      'tasks', coalesce((select jsonb_agg(task_rows.value order by task_rows.source_id) from task_rows), '[]'::jsonb),
      'dependencies', coalesce((select jsonb_agg(dependency_rows.value order by dependency_rows.dependency_key) from dependency_rows), '[]'::jsonb),
      'tags', coalesce((select jsonb_agg(tag_rows.value order by tag_rows.tag_key) from tag_rows), '[]'::jsonb)
    ) as value
    from public.projects project
    where project.tenant_id = target_tenant_id
      and project.id = target_project_id
  )
  select encode(extensions.digest(convert_to(coalesce((select value::text from fingerprint_payload), '{}'), 'UTF8'), 'sha256'), 'hex');
$$;

revoke execute on function private.board_backup_v2_fingerprint(uuid, uuid) from public, anon, authenticated;
grant execute on function private.board_backup_v2_fingerprint(uuid, uuid) to service_role;

create or replace function public.get_board_backup_v2_fingerprint(
  target_tenant_id uuid,
  target_project_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'PERMISSION_DENIED: Authentication is required.';
  end if;
  if not private.current_user_can_read_project(target_tenant_id, target_project_id) then
    raise exception 'PERMISSION_DENIED: Board read permission is required.';
  end if;
  return private.board_backup_v2_fingerprint(target_tenant_id, target_project_id);
end;
$$;

create or replace function public.preview_board_backup_v2(
  target_tenant_id uuid,
  target_project_id uuid,
  import_mode text,
  backup_package jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  tag_color_warnings jsonb := '[]'::jsonb;
  package_tasks jsonb := coalesce(backup_package #> '{payload,tasks}', '[]'::jsonb);
  package_dependencies jsonb := coalesce(backup_package #> '{payload,dependencies}', '[]'::jsonb);
  package_tags jsonb := coalesce(backup_package #> '{payload,tags}', '[]'::jsonb);
  package_task_count integer := 0;
  package_dependency_count integer := 0;
  update_count integer := 0;
  create_count integer := 0;
  delete_count integer := 0;
  tag_create_count integer := 0;
  tag_reuse_count integer := 0;
  unresolved_people_count integer := 0;
  blocking_record_links integer := 0;
  collision_count integer := 0;
  expected_fingerprint text := null;
  source_workspace_id text := backup_package #>> '{source,workspaceId}';
  source_board_id text := backup_package #>> '{source,boardId}';
begin
  if actor_id is null then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PERMISSION_DENIED',
      'message', '請先登入後再執行備份匯入。'
    ));
  end if;
  if backup_package ->> 'format' <> 'projed-backup'
    or backup_package ->> 'schemaVersion' <> '2'
    or backup_package #>> '{scope,type}' <> 'board'
    or backup_package #> '{payload,tasks}' is null
    or backup_package #> '{payload,dependencies}' is null
    or backup_package #> '{payload,tags}' is null
    or jsonb_typeof(package_tasks) <> 'array'
    or jsonb_typeof(package_dependencies) <> 'array'
    or jsonb_typeof(package_tags) <> 'array'
  then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_FILE',
      'message', '備份格式不是可執行的單看板 V2 package。'
    ));
    package_tasks := '[]'::jsonb;
    package_dependencies := '[]'::jsonb;
    package_tags := '[]'::jsonb;
  end if;

  package_task_count := jsonb_array_length(package_tasks);
  package_dependency_count := jsonb_array_length(package_dependencies);
  if package_task_count > 10000 or package_dependency_count > 30000 then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_FILE',
      'message', '備份內容超過單次匯入安全上限。'
    ));
  end if;
  if exists (
    select 1 from jsonb_array_elements(package_tasks) task
    where nullif(task ->> 'sourceId', '') is null
      or jsonb_typeof(coalesce(task -> 'collaboratorIds', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(task -> 'tagSourceIds', '[]'::jsonb)) <> 'array'
  )
    or package_task_count <> (
      select count(distinct task ->> 'sourceId') from jsonb_array_elements(package_tasks) task
    )
    or exists (
      select 1 from jsonb_array_elements(package_tasks) task
      where nullif(task ->> 'parentSourceId', '') is not null
        and not exists (
          select 1 from jsonb_array_elements(package_tasks) parent
          where parent ->> 'sourceId' = task ->> 'parentSourceId'
        )
    )
    or exists (
      select 1 from jsonb_array_elements(package_tasks) task
      where nullif(task ->> 'kanbanStageSourceId', '') is not null
        and not exists (
          select 1 from jsonb_array_elements(package_tasks) stage
          where stage ->> 'sourceId' = task ->> 'kanbanStageSourceId'
        )
    )
    or exists (
      select 1 from jsonb_array_elements(package_dependencies) dependency
      where nullif(dependency ->> 'sourceId', '') is null
        or not exists (
          select 1 from jsonb_array_elements(package_tasks) task
          where task ->> 'sourceId' = dependency ->> 'fromSourceId'
        )
        or not exists (
          select 1 from jsonb_array_elements(package_tasks) task
          where task ->> 'sourceId' = dependency ->> 'toSourceId'
        )
    )
    or jsonb_array_length(package_dependencies) <> (
      select count(distinct dependency ->> 'sourceId')
      from jsonb_array_elements(package_dependencies) dependency
    )
    or exists (
      select 1 from jsonb_array_elements(package_tags) package_tag
      where nullif(package_tag ->> 'sourceId', '') is null
        or nullif(trim(package_tag ->> 'name'), '') is null
    )
    or jsonb_array_length(package_tags) <> (
      select count(distinct package_tag ->> 'sourceId')
      from jsonb_array_elements(package_tags) package_tag
    )
    or jsonb_array_length(package_tags) <> (
      select count(distinct lower(trim(package_tag ->> 'name')))
      from jsonb_array_elements(package_tags) package_tag
    )
  then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_FILE',
      'message', '備份中的任務、階層、看板階段、依賴或標籤引用不完整。'
    ));
  end if;
  if import_mode not in ('copy_to_new_board', 'replace_current_board') then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'INVALID_FILE',
      'message', '不支援的匯入模式。'
    ));
  end if;

  if not exists (
    select 1 from public.tenant_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = actor_id
      and member.status = 'active'
  ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PERMISSION_DENIED',
      'message', '目標工作區不存在或你沒有存取權限。'
    ));
  end if;

  if import_mode = 'copy_to_new_board' then
    create_count := package_task_count;
    if not exists (
      select 1 from public.tenant_members member
      where member.tenant_id = target_tenant_id
        and member.user_id = actor_id
        and member.status = 'active'
        and member.role = any(array['owner','admin','project_manager']::public.tenant_role[])
    ) then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PERMISSION_DENIED',
        'message', '你沒有在目標工作區建立看板的權限。'
      ));
    end if;
  elsif import_mode = 'replace_current_board' then
    if target_project_id is null
      or not exists (
        select 1 from public.projects project
        where project.id = target_project_id and project.tenant_id = target_tenant_id
      )
    then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PERMISSION_DENIED',
        'message', '目標看板不存在或不可存取。'
      ));
    elsif not private.current_user_can_manage_project(target_tenant_id, target_project_id) then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PERMISSION_DENIED',
        'message', '你沒有取代目前看板內容的管理權限。'
      ));
    end if;

    if not exists (
      select 1
      from public.tenants tenant
      join public.projects project on project.tenant_id = tenant.id
      where tenant.id = target_tenant_id
        and project.id = target_project_id
        and source_workspace_id = any(array[tenant.id::text, tenant.legacy_workspace_id])
        and source_board_id = any(array[project.id::text, project.legacy_board_id])
    ) then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'CROSS_BOARD_ID_COLLISION',
        'message', '只有同一張看板建立的備份可以取代目前內容；請改用複製成新看板。'
      ));
    end if;

    select count(*) into update_count
    from jsonb_array_elements(package_tasks) task
    where exists (
      select 1 from public.wbs_items item
      where item.tenant_id = target_tenant_id
        and item.project_id = target_project_id
        and task ->> 'sourceId' = any(array[item.id::text, item.legacy_node_id])
    );
    create_count := package_task_count - update_count;

    select count(*) into delete_count
    from public.wbs_items item
    where item.tenant_id = target_tenant_id
      and item.project_id = target_project_id
      and not exists (
        select 1 from jsonb_array_elements(package_tasks) task
        where task ->> 'sourceId' = any(array[item.id::text, item.legacy_node_id])
      );

    select count(*) into blocking_record_links
    from public.record_task_links link
    join public.wbs_items item on item.id = link.item_id
    where item.tenant_id = target_tenant_id
      and item.project_id = target_project_id
      and not exists (
        select 1 from jsonb_array_elements(package_tasks) task
        where task ->> 'sourceId' = any(array[item.id::text, item.legacy_node_id])
      );
    if blocking_record_links > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'OUT_OF_PACKAGE_REFERENCE',
        'message', format('有 %s 個紀錄連結指向將被移除的任務，已阻擋取代。', blocking_record_links)
      ));
    end if;

    select count(*) into collision_count
    from jsonb_array_elements(package_tasks) task
    where exists (
      select 1 from public.wbs_items item
      where task ->> 'sourceId' = any(array[item.id::text, item.legacy_node_id])
        and (
          item.tenant_id <> target_tenant_id
          or item.project_id <> target_project_id
        )
    );
    if collision_count > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'CROSS_BOARD_ID_COLLISION',
        'message', format('有 %s 個任務識別碼已存在於其他看板，不能執行同源取代。', collision_count)
      ));
    end if;

    if target_project_id is not null then
      expected_fingerprint := private.board_backup_v2_fingerprint(target_tenant_id, target_project_id);
    end if;
  end if;

  select count(*) into tag_reuse_count
  from jsonb_array_elements(package_tags) package_tag
  where exists (
    select 1 from public.task_tags tag
    where tag.tenant_id = target_tenant_id
      and lower(trim(tag.name)) = lower(trim(package_tag ->> 'name'))
  );
  tag_create_count := jsonb_array_length(package_tags) - tag_reuse_count;
  select coalesce(jsonb_agg(
    format('標籤「%s」沿用目標工作區的 %s 顏色。', package_tag ->> 'name', tag.color)
    order by lower(trim(package_tag ->> 'name'))
  ), '[]'::jsonb)
    into tag_color_warnings
  from jsonb_array_elements(package_tags) package_tag
  join public.task_tags tag
    on tag.tenant_id = target_tenant_id
   and lower(trim(tag.name)) = lower(trim(package_tag ->> 'name'))
  where tag.color::text <> package_tag ->> 'color';
  warnings := warnings || coalesce(tag_color_warnings, '[]'::jsonb);

  with people as (
    select task ->> 'assigneeId' as user_id
    from jsonb_array_elements(package_tasks) task
    where nullif(task ->> 'assigneeId', '') is not null
    union
    select collaborator.value
    from jsonb_array_elements(package_tasks) task
    cross join lateral jsonb_array_elements_text(coalesce(task -> 'collaboratorIds', '[]'::jsonb)) collaborator(value)
  )
  select count(*) into unresolved_people_count
  from people
  where user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not exists (
      select 1 from public.tenant_members member
      where member.tenant_id = target_tenant_id
        and member.user_id::text = people.user_id
        and member.status = 'active'
    );
  if unresolved_people_count > 0 then
    warnings := warnings || jsonb_build_array(
      format('%s 位負責人或協作者不在目標工作區，匯入時會清除其指派。', unresolved_people_count)
    );
  end if;

  return jsonb_build_object(
    'allowed', jsonb_array_length(blockers) = 0,
    'expectedTargetFingerprint', expected_fingerprint,
    'counts', jsonb_build_object(
      'create', create_count,
      'update', update_count,
      'delete', delete_count,
      'keep', update_count,
      'dependencies', package_dependency_count,
      'tagsToCreate', tag_create_count,
      'tagsToReuse', tag_reuse_count,
      'unresolvedPeople', unresolved_people_count,
      'blockingRecordLinks', blocking_record_links
    ),
    'warnings', warnings,
    'blockers', blockers
  );
end;
$$;

create or replace function public.import_board_backup_v2(
  target_tenant_id uuid,
  target_project_id uuid,
  import_mode text,
  backup_package jsonb,
  target_board_title text,
  execution_id uuid,
  expected_target_fingerprint text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_existing_result jsonb;
  preview jsonb;
  first_blocker jsonb;
  package_tasks jsonb := coalesce(backup_package #> '{payload,tasks}', '[]'::jsonb);
  package_dependencies jsonb := coalesce(backup_package #> '{payload,dependencies}', '[]'::jsonb);
  package_tags jsonb := coalesce(backup_package #> '{payload,tags}', '[]'::jsonb);
  v_package_id uuid;
  resolved_target_project_id uuid := target_project_id;
  resolved_target_board_id text;
  resolved_target_board_title text;
  workspace_role public.tenant_role;
  task jsonb;
  dependency jsonb;
  package_tag jsonb;
  tag_source_id text;
  task_source_id text;
  target_item_id uuid;
  target_tag_id uuid;
  id_map jsonb := '{}'::jsonb;
  client_id_map jsonb := '{}'::jsonb;
  tag_map jsonb := '{}'::jsonb;
  current_fingerprint text;
  post_fingerprint text;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'PERMISSION_DENIED: Authentication is required.';
  end if;
  begin
    v_package_id := (backup_package ->> 'packageId')::uuid;
  exception when others then
    raise exception 'INVALID_FILE: packageId must be a UUID.';
  end;

  select execution.result into v_existing_result
  from private.backup_import_executions execution
  where execution.execution_id = import_board_backup_v2.execution_id
    and execution.actor_id = v_actor_id
    and execution.status = 'succeeded';
  if v_existing_result is not null then
    return v_existing_result || jsonb_build_object('idempotentReplay', true);
  end if;
  if exists (
    select 1 from private.backup_import_executions execution
    where execution.execution_id = import_board_backup_v2.execution_id
      and execution.actor_id <> v_actor_id
  ) then
    raise exception 'PERMISSION_DENIED: Execution ID belongs to another user.';
  end if;

  preview := public.preview_board_backup_v2(
    target_tenant_id,
    target_project_id,
    import_mode,
    backup_package
  );
  if coalesce((preview ->> 'allowed')::boolean, false) is false then
    first_blocker := preview -> 'blockers' -> 0;
    raise exception '%: %',
      coalesce(first_blocker ->> 'code', 'IMPORT_ROLLED_BACK'),
      coalesce(first_blocker ->> 'message', 'Import preflight failed.');
  end if;

  if import_mode = 'replace_current_board' then
    select project.id
      into resolved_target_project_id
    from public.projects project
    where project.tenant_id = target_tenant_id
      and project.id = target_project_id
    for update;
    current_fingerprint := private.board_backup_v2_fingerprint(target_tenant_id, resolved_target_project_id);
    if expected_target_fingerprint is null or current_fingerprint <> expected_target_fingerprint then
      raise exception 'TARGET_CHANGED: The target board changed after preview. Please create a new import plan.';
    end if;
  end if;

  insert into private.backup_import_executions (
    execution_id,
    actor_id,
    tenant_id,
    package_id,
    import_mode,
    target_project_id,
    status
  ) values (
    execution_id,
    v_actor_id,
    target_tenant_id,
    v_package_id,
    import_mode,
    resolved_target_project_id,
    'running'
  );

  if import_mode = 'copy_to_new_board' then
    select member.role into workspace_role
    from public.tenant_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = v_actor_id
      and member.status = 'active'
      and member.role = any(array['owner','admin','project_manager']::public.tenant_role[]);
    if workspace_role is null then
      raise exception 'PERMISSION_DENIED: Board create permission is required.';
    end if;
    if nullif(trim(target_board_title), '') is null then
      raise exception 'INVALID_FILE: Target board title is required.';
    end if;
    insert into public.projects (
      tenant_id,
      name,
      sort_order,
      metadata,
      created_by
    ) values (
      target_tenant_id,
      trim(target_board_title),
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      jsonb_build_object('backupPackageId', v_package_id, 'backupImportMode', import_mode),
      v_actor_id
    ) returning id into resolved_target_project_id;
    insert into public.project_members (project_id, tenant_id, user_id, role)
    values (resolved_target_project_id, target_tenant_id, v_actor_id, workspace_role);
  else
    delete from public.wbs_dependencies dependency_row
    where dependency_row.tenant_id = target_tenant_id
      and dependency_row.project_id = resolved_target_project_id;
    delete from public.wbs_item_tags assignment
    where assignment.tenant_id = target_tenant_id
      and assignment.project_id = resolved_target_project_id;
  end if;

  for task in select value from jsonb_array_elements(package_tasks) loop
    task_source_id := task ->> 'sourceId';
    if nullif(task_source_id, '') is null then
      raise exception 'INVALID_FILE: Every task requires sourceId.';
    end if;
    target_item_id := null;
    if import_mode = 'replace_current_board' then
      select item.id into target_item_id
      from public.wbs_items item
      where item.tenant_id = target_tenant_id
        and item.project_id = resolved_target_project_id
        and task_source_id = any(array[item.id::text, item.legacy_node_id])
      limit 1;
    end if;
    if target_item_id is null then
      if import_mode = 'replace_current_board'
        and task_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then
        target_item_id := task_source_id::uuid;
      else
        target_item_id := extensions.gen_random_uuid();
      end if;
    end if;
    if exists (
      select 1 from public.wbs_items existing_item
      where existing_item.id = target_item_id
        and (
          existing_item.tenant_id <> target_tenant_id
          or existing_item.project_id <> resolved_target_project_id
        )
    ) then
      raise exception 'CROSS_BOARD_ID_COLLISION: A task identifier belongs to another board.';
    end if;
    id_map := id_map || jsonb_build_object(task_source_id, target_item_id::text);

    insert into public.wbs_items (
      id,
      tenant_id,
      project_id,
      parent_id,
      legacy_node_id,
      title,
      description,
      detail_notes,
      status,
      assignee_id,
      collaborator_ids,
      start_date,
      end_date,
      is_duration_locked,
      item_type,
      kanban_stage_id,
      sort_order,
      is_archived,
      metadata,
      created_by,
      updated_by
    ) values (
      target_item_id,
      target_tenant_id,
      resolved_target_project_id,
      null,
      case
        when import_mode = 'replace_current_board'
          and task_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then task_source_id
        else null
      end,
      task ->> 'title',
      nullif(task ->> 'description', ''),
      coalesce(task -> 'detailNotes', '[]'::jsonb),
      (task ->> 'status')::public.task_status,
      case
        when task ->> 'assigneeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists (
            select 1 from public.tenant_members member
            where member.tenant_id = target_tenant_id
              and member.user_id::text = task ->> 'assigneeId'
              and member.status = 'active'
          )
        then (task ->> 'assigneeId')::uuid
        else null
      end,
      coalesce((
        select array_agg(collaborator.value::uuid order by collaborator.value)
        from jsonb_array_elements_text(coalesce(task -> 'collaboratorIds', '[]'::jsonb)) collaborator(value)
        where collaborator.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists (
            select 1 from public.tenant_members member
            where member.tenant_id = target_tenant_id
              and member.user_id::text = collaborator.value
              and member.status = 'active'
          )
      ), '{}'::uuid[]),
      nullif(task ->> 'startDate', '')::date,
      nullif(task ->> 'endDate', '')::date,
      coalesce((task ->> 'isDurationLocked')::boolean, false),
      coalesce(nullif(task ->> 'nodeType', ''), 'task')::public.wbs_item_type,
      null,
      coalesce((task ->> 'order')::bigint, 0),
      coalesce((task ->> 'isArchived')::boolean, false),
      jsonb_build_object('backupPackageId', v_package_id, 'backupSourceId', task_source_id),
      v_actor_id,
      v_actor_id
    )
    on conflict (id) do update set
      tenant_id = excluded.tenant_id,
      project_id = excluded.project_id,
      parent_id = null,
      legacy_node_id = coalesce(public.wbs_items.legacy_node_id, excluded.legacy_node_id),
      title = excluded.title,
      description = excluded.description,
      detail_notes = excluded.detail_notes,
      status = excluded.status,
      assignee_id = excluded.assignee_id,
      collaborator_ids = excluded.collaborator_ids,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_duration_locked = excluded.is_duration_locked,
      item_type = excluded.item_type,
      kanban_stage_id = null,
      sort_order = excluded.sort_order,
      is_archived = excluded.is_archived,
      metadata = excluded.metadata,
      updated_by = v_actor_id,
      updated_at = now()
    where public.wbs_items.tenant_id = target_tenant_id
      and public.wbs_items.project_id = resolved_target_project_id;
  end loop;

  if import_mode = 'replace_current_board' then
    delete from public.wbs_items item
    where item.tenant_id = target_tenant_id
      and item.project_id = resolved_target_project_id
      and not exists (
        select 1 from jsonb_each_text(id_map) mapped
        where mapped.value::uuid = item.id
      );
  end if;

  for task in select value from jsonb_array_elements(package_tasks) loop
    task_source_id := task ->> 'sourceId';
    update public.wbs_items item set
      parent_id = case
        when nullif(task ->> 'parentSourceId', '') is null then null
        else (id_map ->> (task ->> 'parentSourceId'))::uuid
      end,
      kanban_stage_id = case
        when nullif(task ->> 'kanbanStageSourceId', '') is null then null
        else id_map ->> (task ->> 'kanbanStageSourceId')
      end,
      updated_at = now()
    where item.tenant_id = target_tenant_id
      and item.project_id = resolved_target_project_id
      and item.id = (id_map ->> task_source_id)::uuid;
  end loop;

  for package_tag in select value from jsonb_array_elements(package_tags) loop
    tag_source_id := package_tag ->> 'sourceId';
    select tag.id into target_tag_id
    from public.task_tags tag
    where tag.tenant_id = target_tenant_id
      and lower(trim(tag.name)) = lower(trim(package_tag ->> 'name'))
    order by tag.created_at
    limit 1;
    if target_tag_id is null then
      insert into public.task_tags (
        tenant_id,
        name,
        color,
        sort_order,
        metadata,
        created_by,
        updated_by
      ) values (
        target_tenant_id,
        package_tag ->> 'name',
        package_tag ->> 'color',
        coalesce((package_tag ->> 'order')::bigint, 0),
        jsonb_build_object('backupPackageId', v_package_id, 'backupSourceId', tag_source_id),
        v_actor_id,
        v_actor_id
      ) returning id into target_tag_id;
    end if;
    tag_map := tag_map || jsonb_build_object(tag_source_id, target_tag_id::text);
  end loop;

  for task in select value from jsonb_array_elements(package_tasks) loop
    task_source_id := task ->> 'sourceId';
    for tag_source_id in
      select value from jsonb_array_elements_text(coalesce(task -> 'tagSourceIds', '[]'::jsonb))
    loop
      target_tag_id := nullif(tag_map ->> tag_source_id, '')::uuid;
      if target_tag_id is null then
        raise exception 'INVALID_FILE: Task references a tag missing from the package.';
      end if;
      insert into public.wbs_item_tags (tenant_id, project_id, item_id, tag_id)
      values (
        target_tenant_id,
        resolved_target_project_id,
        (id_map ->> task_source_id)::uuid,
        target_tag_id
      ) on conflict do nothing;
    end loop;
  end loop;

  for dependency in select value from jsonb_array_elements(package_dependencies) loop
    if nullif(id_map ->> (dependency ->> 'fromSourceId'), '') is null
      or nullif(id_map ->> (dependency ->> 'toSourceId'), '') is null
    then
      raise exception 'INVALID_FILE: Dependency references a task missing from the package.';
    end if;
    insert into public.wbs_dependencies (
      tenant_id,
      project_id,
      from_item_id,
      from_side,
      to_item_id,
      to_side,
      offset_days
    ) values (
      target_tenant_id,
      resolved_target_project_id,
      (id_map ->> (dependency ->> 'fromSourceId'))::uuid,
      (dependency ->> 'fromSide')::public.dependency_side,
      (id_map ->> (dependency ->> 'toSourceId'))::uuid,
      (dependency ->> 'toSide')::public.dependency_side,
      coalesce((dependency ->> 'offset')::integer, 0)
    );
  end loop;

  select coalesce(project.legacy_board_id, project.id::text), project.name
    into resolved_target_board_id, resolved_target_board_title
  from public.projects project
  where project.tenant_id = target_tenant_id
    and project.id = resolved_target_project_id;

  select coalesce(
    jsonb_object_agg(mapped.key, coalesce(item.legacy_node_id, item.id::text)),
    '{}'::jsonb
  ) into client_id_map
  from jsonb_each_text(id_map) mapped
  join public.wbs_items item on item.id = mapped.value::uuid
  where item.tenant_id = target_tenant_id
    and item.project_id = resolved_target_project_id;

  post_fingerprint := private.board_backup_v2_fingerprint(target_tenant_id, resolved_target_project_id);
  v_result := jsonb_build_object(
    'executionId', execution_id,
    'mode', import_mode,
    'targetBoardId', resolved_target_board_id,
    'targetBoardTitle', resolved_target_board_title,
    'counts', preview -> 'counts',
    'warnings', preview -> 'warnings',
    'sourceTaskIdMap', client_id_map,
    'postWriteFingerprint', post_fingerprint,
    'idempotentReplay', false
  );

  insert into public.audit_logs (
    tenant_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    before_data,
    after_data
  ) values (
    target_tenant_id,
    v_actor_id,
    'board_backup_imported',
    'projects',
    resolved_target_project_id,
    jsonb_build_object('expectedTargetFingerprint', expected_target_fingerprint),
    jsonb_build_object(
      'executionId', execution_id,
      'packageId', v_package_id,
      'mode', import_mode,
      'postWriteFingerprint', post_fingerprint,
      'counts', preview -> 'counts'
    )
  );

  update private.backup_import_executions execution set
    target_project_id = resolved_target_project_id,
    status = 'succeeded',
    result = v_result,
    updated_at = now()
  where execution.execution_id = import_board_backup_v2.execution_id
    and execution.actor_id = v_actor_id;

  return v_result;
exception when others then
  raise;
end;
$$;

revoke execute on function public.get_board_backup_v2_fingerprint(uuid, uuid) from public, anon;
revoke execute on function public.preview_board_backup_v2(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.import_board_backup_v2(uuid, uuid, text, jsonb, text, uuid, text) from public, anon;

grant execute on function public.get_board_backup_v2_fingerprint(uuid, uuid) to authenticated;
grant execute on function public.preview_board_backup_v2(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.import_board_backup_v2(uuid, uuid, text, jsonb, text, uuid, text) to authenticated;
