-- DEV-089 / CAPA-20260825-01
-- Authoritative, idempotent placement between board-scoped WBS items and the
-- account-owned global workbench. The private implementation is SECURITY
-- DEFINER because the cross-owner move must mutate two RLS domains in one
-- database transaction. The public RPC remains SECURITY INVOKER and every
-- mutation is guarded by auth.uid(), owner checks, and the same configurable
-- move_task capability matrix used by the client.

create table if not exists public.task_workbench_placement_operations (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  direction text not null,
  root_task_id text not null,
  task_ids jsonb not null,
  source_workspace_id text,
  source_board_id text,
  target_workspace_id text,
  target_board_id text,
  status text not null default 'pending',
  error_code text,
  client_platform text,
  result jsonb,
  elapsed_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, operation_id),
  constraint task_workbench_placement_operations_direction_check
    check (direction in ('to_unplaced', 'to_board')),
  constraint task_workbench_placement_operations_status_check
    check (status in ('pending', 'committed', 'failed')),
  constraint task_workbench_placement_operations_task_ids_check
    check (jsonb_typeof(task_ids) = 'array' and jsonb_array_length(task_ids) > 0),
  constraint task_workbench_placement_operations_elapsed_ms_check
    check (elapsed_ms is null or elapsed_ms >= 0)
);

create index if not exists task_workbench_placement_operations_owner_created_idx
  on public.task_workbench_placement_operations (owner_id, created_at desc);

alter table public.task_workbench_placement_operations enable row level security;

drop policy if exists "owners read task placement operations"
  on public.task_workbench_placement_operations;
create policy "owners read task placement operations"
  on public.task_workbench_placement_operations
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "owners create task placement operations"
  on public.task_workbench_placement_operations;
create policy "owners create task placement operations"
  on public.task_workbench_placement_operations
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and status = 'pending'
    and error_code is null
    and result is null
    and elapsed_ms is null
  );

drop policy if exists "owners update task placement operations"
  on public.task_workbench_placement_operations;
create policy "owners update task placement operations"
  on public.task_workbench_placement_operations
  for update
  to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'pending'
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'failed'
    and error_code is not null
    and result is null
    and elapsed_ms is not null
  );

revoke all on public.task_workbench_placement_operations from authenticated;
grant select, insert on public.task_workbench_placement_operations to authenticated;
grant update (status, error_code, elapsed_ms)
  on public.task_workbench_placement_operations to authenticated;
grant select, insert, update, delete on public.task_workbench_placement_operations to service_role;

drop trigger if exists task_workbench_placement_operations_touch_updated_at
  on public.task_workbench_placement_operations;
create trigger task_workbench_placement_operations_touch_updated_at
  before update on public.task_workbench_placement_operations
  for each row execute function public.touch_updated_at();

create or replace function private.current_user_can_move_project_task(
  target_tenant_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_membership as (
    select
      workspace_member.role as workspace_role,
      (
        select board_member.role
        from public.project_members board_member
        where board_member.tenant_id = target_tenant_id
          and board_member.project_id = target_project_id
          and board_member.user_id = workspace_member.user_id
        limit 1
      ) as board_role
    from public.tenant_members workspace_member
    where workspace_member.tenant_id = target_tenant_id
      and workspace_member.user_id = (select auth.uid())
      and workspace_member.status = 'active'
    limit 1
  ), effective_roles as (
    -- Workspace owners/admins receive their corresponding board capability
    -- matrix even when they are not explicitly listed as a board member.
    select membership.workspace_role as role
    from current_membership membership
    where membership.workspace_role in ('owner', 'admin')

    union

    select membership.board_role
    from current_membership membership
    where membership.board_role is not null
  )
  select exists (
    select 1
    from effective_roles effective
    where effective.role = 'owner'
       or coalesce(
         (
           select 'move_task' = any(permission.capabilities)
           from public.board_role_permissions permission
           where permission.tenant_id = target_tenant_id
             and permission.project_id = target_project_id
             and permission.role = effective.role
         ),
         effective.role in ('admin', 'project_manager', 'member')
       )
  );
$$;

revoke all on function private.current_user_can_move_project_task(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.current_user_can_move_project_task(uuid, uuid)
  to service_role;

create or replace function private.move_task_workbench_subtree_impl(
  p_operation_id text,
  p_direction text,
  p_root_task_id text,
  p_source_workspace_id text,
  p_source_board_id text,
  p_target_workspace_id text,
  p_target_board_id text,
  p_nodes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_operation public.task_workbench_placement_operations%rowtype;
  v_source_tenant_id uuid;
  v_source_project_id uuid;
  v_target_tenant_id uuid;
  v_target_project_id uuid;
  v_node jsonb;
  v_requested_node jsonb;
  v_source_task jsonb;
  v_client_id text;
  v_parent_client_id text;
  v_source_parent_client_id text;
  v_db_id uuid;
  v_parent_db_id uuid;
  v_item_ids uuid[] := '{}'::uuid[];
  v_id_map jsonb := '{}'::jsonb;
  v_node_ids text[];
  v_expected_node_ids text[];
  v_assignee_ids uuid[];
  v_collaborator_ids uuid[];
  v_tag_ids uuid[];
  v_requested_tag_count integer;
  v_affected_count integer;
  v_result jsonb;
  v_activity_tenant_id uuid;
  v_activity_project_id uuid;
  v_activity_item_id uuid;
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to move workbench tasks.';
  end if;
  if p_operation_id is null or btrim(p_operation_id) = '' then
    raise exception using errcode = '22023', message = 'operation_id is required.';
  end if;
  if p_direction not in ('to_unplaced', 'to_board') then
    raise exception using errcode = '22023', message = 'Unsupported task placement direction.';
  end if;
  if p_root_task_id is null or btrim(p_root_task_id) = '' then
    raise exception using errcode = '22023', message = 'root_task_id is required.';
  end if;
  if p_nodes is null or jsonb_typeof(p_nodes) <> 'array' or jsonb_array_length(p_nodes) = 0 then
    raise exception using errcode = '22023', message = 'At least one task node is required.';
  end if;

  select array_agg(node ->> 'id' order by ordinal), count(distinct node ->> 'id')
    into v_node_ids, v_requested_tag_count
    from jsonb_array_elements(p_nodes) with ordinality as input(node, ordinal);
  if array_position(v_node_ids, null) is not null
     or cardinality(v_node_ids) <> v_requested_tag_count then
    raise exception using errcode = '22023', message = 'Task node ids must be present and unique.';
  end if;
  if not (p_root_task_id = any(v_node_ids)) then
    raise exception using errcode = '22023', message = 'Subtree root must be included in task node ids.';
  end if;

  insert into public.task_workbench_placement_operations (
    owner_id,
    operation_id,
    direction,
    root_task_id,
    task_ids,
    source_workspace_id,
    source_board_id,
    target_workspace_id,
    target_board_id,
    status
  ) values (
    v_user_id,
    p_operation_id,
    p_direction,
    p_root_task_id,
    to_jsonb(v_node_ids),
    p_source_workspace_id,
    p_source_board_id,
    p_target_workspace_id,
    p_target_board_id,
    'pending'
  )
  on conflict (owner_id, operation_id) do nothing;

  select *
    into v_operation
    from public.task_workbench_placement_operations operation
   where operation.owner_id = v_user_id
     and operation.operation_id = p_operation_id
   for update;

  if v_operation.operation_id is null then
    raise exception using errcode = '42501', message = 'Task placement operation belongs to another account.';
  end if;
  if v_operation.direction <> p_direction
     or v_operation.root_task_id <> p_root_task_id
     or v_operation.task_ids <> to_jsonb(v_node_ids)
     or v_operation.source_workspace_id is distinct from p_source_workspace_id
     or v_operation.source_board_id is distinct from p_source_board_id
     or v_operation.target_workspace_id is distinct from p_target_workspace_id
     or v_operation.target_board_id is distinct from p_target_board_id then
    raise exception using errcode = '22023', message = 'Task placement operation payload does not match its original request.';
  end if;
  if v_operation.status = 'committed' then
    return v_operation.result;
  end if;

  if p_direction = 'to_unplaced' then
    select tenant.id
      into v_source_tenant_id
      from public.tenants tenant
     where tenant.id::text = p_source_workspace_id
        or tenant.legacy_workspace_id = p_source_workspace_id
     limit 1;

    select project.id
      into v_source_project_id
      from public.projects project
     where project.tenant_id = v_source_tenant_id
       and (project.id::text = p_source_board_id or project.legacy_board_id = p_source_board_id)
     limit 1;

    if v_source_tenant_id is null or v_source_project_id is null then
      raise exception using errcode = 'P0002', message = 'Source board was not found.';
    end if;
    if not private.current_user_can_move_project_task(v_source_tenant_id, v_source_project_id) then
      raise exception using errcode = '42501', message = 'Move permission is required on the source board.';
    end if;

    with recursive task_tree as (
      select
        item.id,
        item.parent_id,
        coalesce(item.legacy_node_id, item.id::text) as client_id,
        array[item.id] as path
      from public.wbs_items item
      where item.tenant_id = v_source_tenant_id
        and item.project_id = v_source_project_id
        and coalesce(item.legacy_node_id, item.id::text) = p_root_task_id

      union all

      select
        child.id,
        child.parent_id,
        coalesce(child.legacy_node_id, child.id::text),
        parent.path || child.id
      from public.wbs_items child
      join task_tree parent on parent.id = child.parent_id
      where child.tenant_id = v_source_tenant_id
        and child.project_id = v_source_project_id
        and not (child.id = any(parent.path))
    )
    select
      array_agg(tree.client_id order by tree.client_id),
      array_agg(tree.id),
      jsonb_object_agg(tree.client_id, tree.id::text)
      into v_expected_node_ids, v_item_ids, v_id_map
      from task_tree tree;

    if v_expected_node_ids is distinct from (
      select array_agg(requested_id order by requested_id)
      from unnest(v_node_ids) as requested(requested_id)
    ) then
      raise exception using errcode = '22023', message = 'The requested tasks are not the complete source subtree.';
    end if;

    perform 1
      from public.wbs_items item
     where item.id = any(v_item_ids)
     for update;

    if exists (
      select 1
        from public.record_task_links link
       where link.item_id = any(v_item_ids)
    ) then
      raise exception using errcode = '55000', message = 'Tasks linked to records cannot be moved to the global workbench yet.';
    end if;

    if exists (
      select 1
        from public.inbox_items inbox
       where inbox.promoted_task_node_id = any(v_item_ids)
    ) then
      raise exception using errcode = '55000', message = 'Tasks linked to quick memo inbox items cannot be moved to the global workbench yet.';
    end if;

    if exists (
      select 1
        from public.wbs_dependencies dependency
       where dependency.from_item_id = any(v_item_ids)
          or dependency.to_item_id = any(v_item_ids)
    ) then
      raise exception using errcode = '55000', message = 'Tasks with dependencies cannot be moved to the global workbench yet.';
    end if;

    for v_requested_node in select value from jsonb_array_elements(p_nodes)
    loop
      v_client_id := v_requested_node ->> 'id';
      select
        coalesce(parent.legacy_node_id, parent.id::text),
        jsonb_strip_nulls(jsonb_build_object(
          'id', coalesce(item.legacy_node_id, item.id::text),
          'workspaceId', p_source_workspace_id,
          'boardId', '__task_workbench_unplaced__',
          'parentId', coalesce(parent.legacy_node_id, parent.id::text),
          'title', item.title,
          'detailNotes', coalesce(item.detail_notes, '[]'::jsonb),
          'description', item.description,
          'status', item.status::text,
          'assigneeIds', to_jsonb(coalesce(item.assignee_ids, '{}'::uuid[])),
          'assigneeId', coalesce(item.assignee_id, item.assignee_ids[1])::text,
          'collaboratorIds', to_jsonb(coalesce(item.collaborator_ids, '{}'::uuid[])),
          'startDate', item.start_date::text,
          'endDate', item.end_date::text,
          'isDurationLocked', item.is_duration_locked,
          'nodeType', item.item_type::text,
          'kanbanStageId', item.kanban_stage_id,
          'order', item.sort_order,
          'createdAt', floor(extract(epoch from item.created_at) * 1000)::bigint,
          'updatedAt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
          'isArchived', item.is_archived,
          'tagIds', coalesce((
            select jsonb_agg(coalesce(tag.legacy_tag_id, tag.id::text) order by coalesce(tag.legacy_tag_id, tag.id::text))
            from public.wbs_item_tags item_tag
            join public.task_tags tag
              on tag.tenant_id = item_tag.tenant_id
             and tag.id = item_tag.tag_id
            where item_tag.tenant_id = item.tenant_id
              and item_tag.project_id = item.project_id
              and item_tag.item_id = item.id
          ), '[]'::jsonb)
        ))
        into v_source_parent_client_id, v_source_task
        from public.wbs_items item
        left join public.wbs_items parent on parent.id = item.parent_id
       where item.id = (v_id_map ->> v_client_id)::uuid;

      if v_client_id = p_root_task_id then
        if nullif(v_requested_node ->> 'parentId', '') is not null then
          raise exception using errcode = '22023', message = 'The unplaced subtree root must not retain a board parent.';
        end if;
        v_source_task := v_source_task || jsonb_build_object('parentId', null);
      elsif v_source_parent_client_id is distinct from nullif(v_requested_node ->> 'parentId', '') then
        raise exception using errcode = '22023', message = 'The requested subtree hierarchy does not match the source board.';
      end if;

      v_source_task := v_source_task || jsonb_build_object(
        'order', coalesce((v_requested_node ->> 'order')::bigint, 0)
      );

      insert into public.task_workbench_unplaced_items (
        owner_id,
        id,
        workspace_id,
        task,
        sort_order
      ) values (
        v_user_id,
        v_client_id,
        p_source_workspace_id,
        v_source_task,
        coalesce((v_requested_node ->> 'order')::integer, 0)
      )
      on conflict (owner_id, id) do update
        set workspace_id = excluded.workspace_id,
            task = excluded.task,
            sort_order = excluded.sort_order,
            updated_at = now();
    end loop;

    delete from public.wbs_items item where item.id = any(v_item_ids);
    get diagnostics v_affected_count = row_count;
    if v_affected_count <> cardinality(v_item_ids) then
      raise exception using errcode = 'P0002', message = 'Source tasks could not be removed from the board.';
    end if;

    v_activity_tenant_id := v_source_tenant_id;
    v_activity_project_id := v_source_project_id;
    v_target_tenant_id := null;
    v_target_project_id := null;
  else
    select tenant.id
      into v_target_tenant_id
      from public.tenants tenant
     where tenant.id::text = p_target_workspace_id
        or tenant.legacy_workspace_id = p_target_workspace_id
     limit 1;

    select project.id
      into v_target_project_id
      from public.projects project
     where project.tenant_id = v_target_tenant_id
       and (project.id::text = p_target_board_id or project.legacy_board_id = p_target_board_id)
     limit 1;

    if v_target_tenant_id is null or v_target_project_id is null then
      raise exception using errcode = 'P0002', message = 'Target board was not found.';
    end if;
    if not private.current_user_can_move_project_task(v_target_tenant_id, v_target_project_id) then
      raise exception using errcode = '42501', message = 'Move permission is required on the target board.';
    end if;
    perform 1
      from public.task_workbench_unplaced_items item
     where item.owner_id = v_user_id
       and item.id = any(v_node_ids)
     for update;

    with recursive source_tree as (
      select
        item.id,
        item.task,
        array[item.id] as path
      from public.task_workbench_unplaced_items item
      where item.owner_id = v_user_id
        and item.id = p_root_task_id
        and nullif(item.task ->> 'parentId', '') is null

      union all

      select
        child.id,
        child.task,
        parent.path || child.id
      from public.task_workbench_unplaced_items child
      join source_tree parent on nullif(child.task ->> 'parentId', '') = parent.id
      where child.owner_id = v_user_id
        and not (child.id = any(parent.path))
    )
    select array_agg(tree.id order by tree.id)
      into v_expected_node_ids
      from source_tree tree;

    if v_expected_node_ids is distinct from (
      select array_agg(requested_id order by requested_id)
      from unnest(v_node_ids) as requested(requested_id)
    ) then
      raise exception using errcode = '22023', message = 'The requested tasks are not the complete unplaced subtree.';
    end if;

    for v_requested_node in select value from jsonb_array_elements(p_nodes)
    loop
      v_client_id := v_requested_node ->> 'id';
      select item.task
        into v_source_task
        from public.task_workbench_unplaced_items item
       where item.owner_id = v_user_id
         and item.id = v_client_id;

      if v_client_id <> p_root_task_id
         and nullif(v_source_task ->> 'parentId', '') is distinct from nullif(v_requested_node ->> 'parentId', '') then
        raise exception using errcode = '22023', message = 'The requested subtree hierarchy does not match the unplaced source.';
      end if;

      v_node := v_source_task || jsonb_build_object(
        'workspaceId', p_target_workspace_id,
        'boardId', p_target_board_id,
        'parentId', v_requested_node -> 'parentId',
        'order', v_requested_node -> 'order',
        'nodeType', v_requested_node -> 'nodeType',
        'kanbanStageId', v_requested_node -> 'kanbanStageId'
      );
      v_parent_client_id := nullif(v_node ->> 'parentId', '');

      if v_client_id ~* v_uuid_pattern then
        v_db_id := v_client_id::uuid;
      else
        v_db_id := extensions.gen_random_uuid();
      end if;

      if v_parent_client_id is null then
        v_parent_db_id := null;
      elsif v_id_map ? v_parent_client_id then
        v_parent_db_id := (v_id_map ->> v_parent_client_id)::uuid;
      else
        select item.id
          into v_parent_db_id
          from public.wbs_items item
         where item.tenant_id = v_target_tenant_id
           and item.project_id = v_target_project_id
           and (item.id::text = v_parent_client_id or item.legacy_node_id = v_parent_client_id)
         limit 1;
        if v_parent_db_id is null then
          raise exception using errcode = 'P0002', message = 'Target parent task was not found.';
        end if;
      end if;

      if exists (
        select 1
          from public.wbs_items item
         where item.id = v_db_id
            or (v_client_id !~* v_uuid_pattern and item.legacy_node_id = v_client_id)
      ) then
        raise exception using errcode = '23505', message = 'Task identity already exists on a board.';
      end if;

      select coalesce(array_agg(value::uuid), '{}'::uuid[])
        into v_assignee_ids
        from jsonb_array_elements_text(coalesce(v_node -> 'assigneeIds', '[]'::jsonb)) as assignee(value)
       where value ~* v_uuid_pattern;
      if cardinality(v_assignee_ids) = 0
         and coalesce(v_node ->> 'assigneeId', '') ~* v_uuid_pattern then
        v_assignee_ids := array[(v_node ->> 'assigneeId')::uuid];
      end if;

      select coalesce(array_agg(value::uuid), '{}'::uuid[])
        into v_collaborator_ids
        from jsonb_array_elements_text(coalesce(v_node -> 'collaboratorIds', '[]'::jsonb)) as collaborator(value)
       where value ~* v_uuid_pattern;

      if exists (
        select 1
          from unnest(v_assignee_ids || v_collaborator_ids) as assigned(user_id)
         where not exists (
           select 1
             from public.tenant_members member
            where member.tenant_id = v_target_tenant_id
              and member.user_id = assigned.user_id
              and member.status = 'active'
         )
      ) then
        raise exception using errcode = '23503', message = 'Target workspace is missing one or more assigned task members.';
      end if;

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
        assignee_ids,
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
        updated_by,
        created_at,
        updated_at
      ) values (
        v_db_id,
        v_target_tenant_id,
        v_target_project_id,
        v_parent_db_id,
        case when v_client_id ~* v_uuid_pattern then null else v_client_id end,
        coalesce(v_node ->> 'title', '未命名任務'),
        nullif(v_node ->> 'description', ''),
        case when jsonb_typeof(v_node -> 'detailNotes') = 'array' then v_node -> 'detailNotes' else '[]'::jsonb end,
        coalesce(nullif(v_node ->> 'status', '')::public.task_status, 'todo'::public.task_status),
        v_assignee_ids[1],
        v_assignee_ids,
        v_collaborator_ids,
        nullif(v_node ->> 'startDate', '')::date,
        nullif(v_node ->> 'endDate', '')::date,
        coalesce((v_node ->> 'isDurationLocked')::boolean, false),
        coalesce(nullif(v_node ->> 'nodeType', '')::public.wbs_item_type, 'task'::public.wbs_item_type),
        nullif(v_node ->> 'kanbanStageId', ''),
        coalesce((v_node ->> 'order')::bigint, 0),
        coalesce((v_node ->> 'isArchived')::boolean, false),
        jsonb_build_object(
          'firebaseWorkspaceId', p_target_workspace_id,
          'firebaseBoardId', p_target_board_id,
          'workbenchPlacementOperationId', p_operation_id
        ),
        v_user_id,
        v_user_id,
        case
          when jsonb_typeof(v_node -> 'createdAt') = 'number'
            then to_timestamp((v_node ->> 'createdAt')::double precision / 1000)
          else now()
        end,
        now()
      );

      v_id_map := v_id_map || jsonb_build_object(v_client_id, v_db_id::text);
      v_item_ids := array_append(v_item_ids, v_db_id);

      select count(distinct value)
        into v_requested_tag_count
        from jsonb_array_elements_text(coalesce(v_node -> 'tagIds', '[]'::jsonb)) as requested(value);
      select coalesce(array_agg(tag.id), '{}'::uuid[])
        into v_tag_ids
        from public.task_tags tag
       where tag.tenant_id = v_target_tenant_id
         and exists (
           select 1
             from jsonb_array_elements_text(coalesce(v_node -> 'tagIds', '[]'::jsonb)) as requested(value)
            where tag.id::text = requested.value or tag.legacy_tag_id = requested.value
         );
      if coalesce(cardinality(v_tag_ids), 0) <> coalesce(v_requested_tag_count, 0) then
        raise exception using errcode = '23503', message = 'Target workspace is missing one or more task tags.';
      end if;
      insert into public.wbs_item_tags (tenant_id, project_id, item_id, tag_id)
        select v_target_tenant_id, v_target_project_id, v_db_id, tag_id
          from unnest(v_tag_ids) as tag_id;
    end loop;

    delete from public.task_workbench_unplaced_items item
     where item.owner_id = v_user_id
       and item.id = any(v_node_ids);
    get diagnostics v_affected_count = row_count;
    if v_affected_count <> cardinality(v_node_ids) then
      raise exception using errcode = 'P0002', message = 'Source tasks could not be removed from the unplaced lane.';
    end if;

    v_activity_tenant_id := v_target_tenant_id;
    v_activity_project_id := v_target_project_id;
  end if;

  for v_node in select value from jsonb_array_elements(p_nodes)
  loop
    v_client_id := v_node ->> 'id';
    v_activity_item_id := (v_id_map ->> v_client_id)::uuid;
    if p_direction = 'to_unplaced' then
      select item.task
        into v_source_task
        from public.task_workbench_unplaced_items item
       where item.owner_id = v_user_id
         and item.id = v_client_id;
    else
      select jsonb_build_object('title', item.title)
        into v_source_task
        from public.wbs_items item
       where item.id = v_activity_item_id;
    end if;

    perform public.log_activity_event(
      v_activity_tenant_id,
      v_activity_project_id,
      'task_moved',
      'wbs_items',
      v_activity_item_id,
      jsonb_build_object(
        'taskId', v_client_id,
        'taskTitle', coalesce(v_source_task ->> 'title', '未命名任務'),
        'operationId', p_operation_id,
        'source', jsonb_build_object(
          'workspaceId', p_source_workspace_id,
          'boardId', p_source_board_id
        ),
        'target', jsonb_build_object(
          'workspaceId', p_target_workspace_id,
          'boardId', p_target_board_id
        )
      )
    );
  end loop;

  v_result := jsonb_build_object(
    'status', 'committed',
    'operationId', p_operation_id,
    'direction', p_direction,
    'taskIds', to_jsonb(v_node_ids),
    'sourceWorkspaceId', p_source_workspace_id,
    'sourceBoardId', p_source_board_id,
    'targetWorkspaceId', p_target_workspace_id,
    'targetBoardId', p_target_board_id
  );

  update public.task_workbench_placement_operations operation
     set status = 'committed',
         error_code = null,
         result = v_result,
         elapsed_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - operation.created_at)) * 1000)::integer),
         updated_at = now()
   where operation.owner_id = v_user_id
     and operation.operation_id = p_operation_id;

  return v_result;
end;
$$;

create or replace function public.move_task_workbench_subtree(
  p_operation_id text,
  p_direction text,
  p_root_task_id text,
  p_source_workspace_id text,
  p_source_board_id text,
  p_target_workspace_id text,
  p_target_board_id text,
  p_nodes jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.move_task_workbench_subtree_impl(
    p_operation_id,
    p_direction,
    p_root_task_id,
    p_source_workspace_id,
    p_source_board_id,
    p_target_workspace_id,
    p_target_board_id,
    p_nodes
  );
$$;

revoke all on function private.move_task_workbench_subtree_impl(text, text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function private.move_task_workbench_subtree_impl(text, text, text, text, text, text, text, jsonb)
  to authenticated, service_role;

revoke all on function public.move_task_workbench_subtree(text, text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.move_task_workbench_subtree(text, text, text, text, text, text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
