-- DEV-089 Rework 1 / CAPA-20260825-01
-- Scope-safe command protocol for account-global unplaced <-> board placement.
-- The client supplies only source/destination intent and exact subtree ids.
-- Canonical source/destination sibling ordering is computed under transaction
-- advisory locks; the existing v1 mover remains the content-preserving owner.

alter table public.task_workbench_placement_operations
  add column if not exists command_version smallint not null default 1,
  add column if not exists source_kind text,
  add column if not exists target_kind text,
  add column if not exists target_parent_task_id text,
  add column if not exists anchor_task_id text,
  add column if not exists position text;

alter table public.task_workbench_placement_operations
  drop constraint if exists task_workbench_placement_operations_command_v2_check;
alter table public.task_workbench_placement_operations
  add constraint task_workbench_placement_operations_command_v2_check check (
    command_version = 1
    or (
      command_version = 2
      and source_kind in ('board', 'account_unplaced')
      and target_kind in ('board', 'account_unplaced')
      and source_kind <> target_kind
      and position in ('before', 'after', 'append')
      and (
        (position = 'append' and anchor_task_id is null)
        or (position in ('before', 'after') and anchor_task_id is not null)
      )
    )
  );

create or replace function private.move_task_workbench_subtree_v2_impl(
  p_operation_id text,
  p_root_task_id text,
  p_expected_subtree_ids jsonb,
  p_source_kind text,
  p_source_workspace_id text,
  p_source_board_id text,
  p_target_kind text,
  p_target_workspace_id text,
  p_target_board_id text,
  p_target_parent_task_id text,
  p_anchor_task_id text,
  p_position text,
  p_client_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_direction text;
  v_operation public.task_workbench_placement_operations%rowtype;
  v_source_tenant_id uuid;
  v_source_project_id uuid;
  v_target_tenant_id uuid;
  v_target_project_id uuid;
  v_source_parent_id uuid;
  v_source_parent_task_id text;
  v_target_parent_id uuid;
  v_anchor_id uuid;
  v_expected_ids text[];
  v_expected_unique_count integer;
  v_actual_ids text[];
  v_canonical_moved_count integer;
  v_node_payload jsonb;
  v_v1_result jsonb;
  v_canonical_nodes jsonb;
  v_affected_scopes jsonb;
  v_result jsonb;
  v_source_scope_key text;
  v_target_scope_key text;
  v_first_scope_key text;
  v_second_scope_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to move workbench tasks.';
  end if;
  if p_operation_id is null or btrim(p_operation_id) = '' then
    raise exception using errcode = '22023', message = 'operation_id is required.';
  end if;
  if p_root_task_id is null or btrim(p_root_task_id) = '' then
    raise exception using errcode = '22023', message = 'root_task_id is required.';
  end if;
  if p_expected_subtree_ids is null
     or jsonb_typeof(p_expected_subtree_ids) <> 'array'
     or jsonb_array_length(p_expected_subtree_ids) = 0 then
    raise exception using errcode = '22023', message = 'expected_subtree_ids must be a non-empty array.';
  end if;
  select array_agg(value order by ordinal), count(distinct value)
    into v_expected_ids, v_expected_unique_count
    from jsonb_array_elements_text(p_expected_subtree_ids) with ordinality as requested(value, ordinal);
  if cardinality(v_expected_ids) <> coalesce(v_expected_unique_count, 0) then
    raise exception using errcode = '22023', message = 'expected_subtree_ids must be unique.';
  end if;
  if v_expected_ids[1] is distinct from p_root_task_id then
    raise exception using errcode = '22023', message = 'The subtree root must be the first expected task id.';
  end if;
  if p_source_kind = 'account_unplaced' and p_target_kind = 'board' then
    v_direction := 'to_board';
    if p_source_workspace_id is not null or p_source_board_id is not null
       or p_target_workspace_id is null or p_target_board_id is null then
      raise exception using errcode = '22023', message = 'Invalid account-unplaced to board ownership payload.';
    end if;
  elsif p_source_kind = 'board' and p_target_kind = 'account_unplaced' then
    v_direction := 'to_unplaced';
    if p_source_workspace_id is null or p_source_board_id is null
       or p_target_workspace_id is not null or p_target_board_id is not null then
      raise exception using errcode = '22023', message = 'Invalid board to account-unplaced ownership payload.';
    end if;
    if p_target_parent_task_id is not null then
      raise exception using errcode = '22023', message = 'The unplaced subtree root must not have a parent.';
    end if;
  else
    raise exception using errcode = '22023', message = 'Task placement command must cross the unplaced ownership boundary.';
  end if;
  if p_position not in ('before', 'after', 'append')
     or (p_position = 'append' and p_anchor_task_id is not null)
     or (p_position in ('before', 'after') and p_anchor_task_id is null) then
    raise exception using errcode = '22023', message = 'Task placement position and anchor are inconsistent.';
  end if;
  if p_client_platform not in ('desktop', 'mobile') then
    raise exception using errcode = '22023', message = 'Unsupported task placement client platform.';
  end if;

  insert into public.task_workbench_placement_operations (
    owner_id,
    operation_id,
    command_version,
    direction,
    source_kind,
    target_kind,
    root_task_id,
    task_ids,
    source_workspace_id,
    source_board_id,
    target_workspace_id,
    target_board_id,
    target_parent_task_id,
    anchor_task_id,
    position,
    client_platform,
    status
  ) values (
    v_user_id,
    p_operation_id,
    2,
    v_direction,
    p_source_kind,
    p_target_kind,
    p_root_task_id,
    to_jsonb(v_expected_ids),
    p_source_workspace_id,
    p_source_board_id,
    p_target_workspace_id,
    p_target_board_id,
    p_target_parent_task_id,
    p_anchor_task_id,
    p_position,
    p_client_platform,
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
  if v_operation.command_version <> 2
     or v_operation.direction <> v_direction
     or v_operation.source_kind is distinct from p_source_kind
     or v_operation.target_kind is distinct from p_target_kind
     or v_operation.root_task_id <> p_root_task_id
     or v_operation.task_ids <> to_jsonb(v_expected_ids)
     or v_operation.source_workspace_id is distinct from p_source_workspace_id
     or v_operation.source_board_id is distinct from p_source_board_id
     or v_operation.target_workspace_id is distinct from p_target_workspace_id
     or v_operation.target_board_id is distinct from p_target_board_id
     or v_operation.target_parent_task_id is distinct from p_target_parent_task_id
     or v_operation.anchor_task_id is distinct from p_anchor_task_id
     or v_operation.position is distinct from p_position
     or v_operation.client_platform is distinct from p_client_platform then
    raise exception using errcode = '22023', message = 'Task placement operation payload does not match its original request.';
  end if;
  if v_operation.status = 'committed' then
    return v_operation.result;
  end if;
  if v_operation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Task placement operation has already failed.';
  end if;

  if v_direction = 'to_board' then
    select nullif(item.task ->> 'parentId', '')
      into v_source_parent_task_id
      from public.task_workbench_unplaced_items item
     where item.owner_id = v_user_id
       and item.id = p_root_task_id
     limit 1;
    if not found then
      raise exception using errcode = 'P0002', message = 'Source task root was not found.';
    end if;

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

    if p_target_parent_task_id is not null then
      select item.id
        into v_target_parent_id
        from public.wbs_items item
       where item.tenant_id = v_target_tenant_id
         and item.project_id = v_target_project_id
         and (item.id::text = p_target_parent_task_id or item.legacy_node_id = p_target_parent_task_id)
       limit 1;
      if v_target_parent_id is null then
        raise exception using errcode = 'P0002', message = 'Target parent task was not found.';
      end if;
    end if;

    v_source_scope_key := format(
      'account:%s:unplaced:parent:%s',
      v_user_id::text,
      coalesce(v_source_parent_task_id, 'root')
    );
    v_target_scope_key := format(
      'board:%s:%s:parent:%s',
      v_target_tenant_id::text,
      v_target_project_id::text,
      coalesce(v_target_parent_id::text, 'root')
    );
  else
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

    select root.parent_id, coalesce(parent.legacy_node_id, parent.id::text)
      into v_source_parent_id, v_source_parent_task_id
      from public.wbs_items root
      left join public.wbs_items parent on parent.id = root.parent_id
     where root.tenant_id = v_source_tenant_id
       and root.project_id = v_source_project_id
       and coalesce(root.legacy_node_id, root.id::text) = p_root_task_id
     limit 1;
    if not found then
      raise exception using errcode = 'P0002', message = 'Source task root was not found.';
    end if;

    v_source_scope_key := format(
      'board:%s:%s:parent:%s',
      v_source_tenant_id::text,
      v_source_project_id::text,
      coalesce(v_source_parent_id::text, 'root')
    );
    v_target_scope_key := format('account:%s:unplaced:parent:root', v_user_id::text);
  end if;

  v_first_scope_key := least(v_source_scope_key, v_target_scope_key);
  v_second_scope_key := greatest(v_source_scope_key, v_target_scope_key);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_first_scope_key, 0));
  if v_second_scope_key <> v_first_scope_key then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_second_scope_key, 0));
  end if;

  if v_direction = 'to_board' then
    with recursive source_tree as (
      select item.id, item.task, 0 as depth, array[item.id] as path
        from public.task_workbench_unplaced_items item
       where item.owner_id = v_user_id
         and item.id = p_root_task_id
      union all
      select child.id, child.task, parent.depth + 1, parent.path || child.id
        from public.task_workbench_unplaced_items child
        join source_tree parent on nullif(child.task ->> 'parentId', '') = parent.id
       where child.owner_id = v_user_id
         and not (child.id = any(parent.path))
    )
    select array_agg(tree.id order by tree.id)
      into v_actual_ids
      from source_tree tree;

    if v_actual_ids is distinct from (
      select array_agg(value order by value)
        from jsonb_array_elements_text(p_expected_subtree_ids) requested(value)
    ) then
      raise exception using errcode = '22023', message = 'The requested tasks are not the complete unplaced subtree.';
    end if;

    perform 1
      from public.task_workbench_unplaced_items item
     where item.owner_id = v_user_id
       and item.id = any(v_expected_ids)
     for update;

    perform 1
      from public.task_workbench_unplaced_items sibling
     where sibling.owner_id = v_user_id
       and nullif(sibling.task ->> 'parentId', '') is not distinct from v_source_parent_task_id
     for update;

    if exists (
      select 1
        from jsonb_array_elements_text(p_expected_subtree_ids) with ordinality requested(id, ordinal)
        join public.task_workbench_unplaced_items child
          on child.owner_id = v_user_id and child.id = requested.id
        join jsonb_array_elements_text(p_expected_subtree_ids) with ordinality parent(id, ordinal)
          on parent.id = nullif(child.task ->> 'parentId', '')
       where requested.id <> p_root_task_id
         and parent.ordinal >= requested.ordinal
    ) then
      raise exception using errcode = '22023', message = 'Expected subtree ids must list each parent before its children.';
    end if;

    perform 1
      from public.wbs_items sibling
     where sibling.tenant_id = v_target_tenant_id
       and sibling.project_id = v_target_project_id
       and sibling.parent_id is not distinct from v_target_parent_id
     for update;

    if p_anchor_task_id is not null then
      select sibling.id
        into v_anchor_id
        from public.wbs_items sibling
       where sibling.tenant_id = v_target_tenant_id
         and sibling.project_id = v_target_project_id
         and sibling.parent_id is not distinct from v_target_parent_id
         and coalesce(sibling.legacy_node_id, sibling.id::text) = p_anchor_task_id
       limit 1;
      if v_anchor_id is null then
        raise exception using errcode = 'P0002', message = 'Task placement anchor is outside the destination scope.';
      end if;
    end if;

    select jsonb_agg(
      case
        when requested.id = p_root_task_id then
          item.task || jsonb_build_object(
            'id', item.id,
            'workspaceId', p_target_workspace_id,
            'boardId', p_target_board_id,
            'parentId', p_target_parent_task_id,
            'order', 0,
            'nodeType', case
              when p_target_parent_task_id is not null then 'task'
              else coalesce(nullif(item.task ->> 'nodeType', ''), 'task')
            end
          )
        else item.task || jsonb_build_object(
          'id', item.id,
          'workspaceId', p_target_workspace_id,
          'boardId', p_target_board_id
        )
      end
      order by requested.ordinal
    )
      into v_node_payload
      from jsonb_array_elements_text(p_expected_subtree_ids) with ordinality requested(id, ordinal)
      join public.task_workbench_unplaced_items item
        on item.owner_id = v_user_id and item.id = requested.id;
  else
    with recursive source_tree as (
      select item.id, item.parent_id, coalesce(item.legacy_node_id, item.id::text) as client_id,
             array[item.id] as path
        from public.wbs_items item
       where item.tenant_id = v_source_tenant_id
         and item.project_id = v_source_project_id
         and coalesce(item.legacy_node_id, item.id::text) = p_root_task_id
      union all
      select child.id, child.parent_id, coalesce(child.legacy_node_id, child.id::text), parent.path || child.id
        from public.wbs_items child
        join source_tree parent on parent.id = child.parent_id
       where child.tenant_id = v_source_tenant_id
         and child.project_id = v_source_project_id
         and not (child.id = any(parent.path))
    )
    select array_agg(tree.client_id order by tree.client_id)
      into v_actual_ids
      from source_tree tree;

    if v_actual_ids is distinct from (
      select array_agg(value order by value)
        from jsonb_array_elements_text(p_expected_subtree_ids) requested(value)
    ) then
      raise exception using errcode = '22023', message = 'The requested tasks are not the complete board subtree.';
    end if;

    perform 1
      from public.wbs_items item
     where item.tenant_id = v_source_tenant_id
       and item.project_id = v_source_project_id
       and coalesce(item.legacy_node_id, item.id::text) = any(v_expected_ids)
     for update;

    if exists (
      select 1
        from jsonb_array_elements_text(p_expected_subtree_ids) with ordinality requested(id, ordinal)
        join public.wbs_items child
          on child.tenant_id = v_source_tenant_id
         and child.project_id = v_source_project_id
         and coalesce(child.legacy_node_id, child.id::text) = requested.id
        join public.wbs_items parent_item on parent_item.id = child.parent_id
        join jsonb_array_elements_text(p_expected_subtree_ids) with ordinality parent(id, ordinal)
          on parent.id = coalesce(parent_item.legacy_node_id, parent_item.id::text)
       where requested.id <> p_root_task_id
         and parent.ordinal >= requested.ordinal
    ) then
      raise exception using errcode = '22023', message = 'Expected subtree ids must list each parent before its children.';
    end if;

    perform 1
      from public.task_workbench_unplaced_items sibling
     where sibling.owner_id = v_user_id
       and nullif(sibling.task ->> 'parentId', '') is null
     for update;

    if p_anchor_task_id is not null and not exists (
      select 1
        from public.task_workbench_unplaced_items sibling
       where sibling.owner_id = v_user_id
         and sibling.id = p_anchor_task_id
         and nullif(sibling.task ->> 'parentId', '') is null
    ) then
      raise exception using errcode = 'P0002', message = 'Task placement anchor is outside the destination scope.';
    end if;

    select jsonb_agg(
      jsonb_build_object(
        'id', coalesce(item.legacy_node_id, item.id::text),
        'parentId', case
          when requested.id = p_root_task_id then null
          else coalesce(parent_item.legacy_node_id, parent_item.id::text)
        end,
        'order', case when requested.id = p_root_task_id then 0 else item.sort_order end,
        'nodeType', item.item_type::text,
        'kanbanStageId', item.kanban_stage_id
      )
      order by requested.ordinal
    )
      into v_node_payload
      from jsonb_array_elements_text(p_expected_subtree_ids) with ordinality requested(id, ordinal)
      join public.wbs_items item
        on item.tenant_id = v_source_tenant_id
       and item.project_id = v_source_project_id
       and coalesce(item.legacy_node_id, item.id::text) = requested.id
      left join public.wbs_items parent_item on parent_item.id = item.parent_id;
  end if;

  v_v1_result := private.move_task_workbench_subtree_impl(
    p_operation_id,
    v_direction,
    p_root_task_id,
    p_source_workspace_id,
    p_source_board_id,
    p_target_workspace_id,
    p_target_board_id,
    v_node_payload
  );

  if v_direction = 'to_board' and exists (
    select 1
      from public.task_workbench_unplaced_items item
     where item.owner_id = v_user_id
       and item.id = any(v_expected_ids)
  ) then
    raise exception using errcode = 'P0001', message = 'Committed placement left one or more moved tasks in the unplaced source.';
  end if;
  if v_direction = 'to_unplaced' and exists (
    select 1
      from public.wbs_items item
     where item.tenant_id = v_source_tenant_id
       and item.project_id = v_source_project_id
       and coalesce(item.legacy_node_id, item.id::text) = any(v_expected_ids)
  ) then
    raise exception using errcode = 'P0001', message = 'Committed placement left one or more moved tasks on the source board.';
  end if;

  if v_direction = 'to_board' then
    with ranked as (
      select item.id, row_number() over (order by item.sort_order, item.updated_at, item.id) - 1 as new_order
        from public.task_workbench_unplaced_items item
       where item.owner_id = v_user_id
          and nullif(item.task ->> 'parentId', '') is not distinct from v_source_parent_task_id
    )
    update public.task_workbench_unplaced_items item
       set sort_order = ranked.new_order,
           task = jsonb_set(item.task, '{order}', to_jsonb(ranked.new_order), true),
           updated_at = now()
      from ranked
     where item.owner_id = v_user_id and item.id = ranked.id;

    with existing as (
      select item.id,
             coalesce(item.legacy_node_id, item.id::text) as client_id,
             row_number() over (order by item.sort_order, item.updated_at, item.id) as ordinal
        from public.wbs_items item
       where item.tenant_id = v_target_tenant_id
         and item.project_id = v_target_project_id
         and item.parent_id is not distinct from v_target_parent_id
         and coalesce(item.legacy_node_id, item.id::text) <> p_root_task_id
    ), anchor as (
      select existing.ordinal from existing where existing.client_id = p_anchor_task_id
    ), desired as (
      select existing.id, existing.ordinal * 2 as sort_key from existing
      union all
      select moved.id,
             case p_position
               when 'before' then (select anchor.ordinal * 2 - 1 from anchor)
               when 'after' then (select anchor.ordinal * 2 + 1 from anchor)
               else (select (count(*) + 1) * 2 from existing)
             end
        from public.wbs_items moved
       where moved.tenant_id = v_target_tenant_id
         and moved.project_id = v_target_project_id
         and coalesce(moved.legacy_node_id, moved.id::text) = p_root_task_id
    ), ranked as (
      select desired.id, row_number() over (order by desired.sort_key, desired.id) - 1 as new_order
        from desired
    )
    update public.wbs_items item
       set sort_order = ranked.new_order,
           updated_at = now()
      from ranked
     where item.id = ranked.id;
  else
    with ranked as (
      select item.id, row_number() over (order by item.sort_order, item.updated_at, item.id) - 1 as new_order
        from public.wbs_items item
       where item.tenant_id = v_source_tenant_id
         and item.project_id = v_source_project_id
         and item.parent_id is not distinct from v_source_parent_id
    )
    update public.wbs_items item
       set sort_order = ranked.new_order,
           updated_at = now()
      from ranked
     where item.id = ranked.id;

    with existing as (
      select item.id,
             row_number() over (order by item.sort_order, item.updated_at, item.id) as ordinal
        from public.task_workbench_unplaced_items item
       where item.owner_id = v_user_id
         and nullif(item.task ->> 'parentId', '') is null
         and item.id <> p_root_task_id
    ), anchor as (
      select existing.ordinal from existing where existing.id = p_anchor_task_id
    ), desired as (
      select existing.id, existing.ordinal * 2 as sort_key from existing
      union all
      select p_root_task_id,
             case p_position
               when 'before' then (select anchor.ordinal * 2 - 1 from anchor)
               when 'after' then (select anchor.ordinal * 2 + 1 from anchor)
               else (select (count(*) + 1) * 2 from existing)
             end
    ), ranked as (
      select desired.id, row_number() over (order by desired.sort_key, desired.id) - 1 as new_order
        from desired
    )
    update public.task_workbench_unplaced_items item
       set sort_order = ranked.new_order,
           task = jsonb_set(item.task, '{order}', to_jsonb(ranked.new_order), true),
           updated_at = now()
      from ranked
     where item.owner_id = v_user_id and item.id = ranked.id;
  end if;

  if v_direction = 'to_board' then
    with canonical as (
      select
        coalesce(item.legacy_node_id, item.id::text) as id,
        p_target_workspace_id as workspace_id,
        p_target_board_id as board_id,
        coalesce(parent.legacy_node_id, parent.id::text) as parent_id,
        item.sort_order,
        item.item_type::text as node_type,
        item.kanban_stage_id,
        floor(extract(epoch from item.updated_at) * 1000)::bigint as updated_at_ms,
        1 as priority
      from public.wbs_items item
      left join public.wbs_items parent on parent.id = item.parent_id
      where item.tenant_id = v_target_tenant_id
        and item.project_id = v_target_project_id
        and (
          coalesce(item.legacy_node_id, item.id::text) = any(v_expected_ids)
          or item.parent_id is not distinct from v_target_parent_id
        )
      union all
      select
        item.id,
        item.workspace_id,
        '__task_workbench_unplaced__',
        nullif(item.task ->> 'parentId', ''),
        item.sort_order,
        coalesce(nullif(item.task ->> 'nodeType', ''), 'task'),
        nullif(item.task ->> 'kanbanStageId', ''),
        floor(extract(epoch from item.updated_at) * 1000)::bigint,
        0
      from public.task_workbench_unplaced_items item
      where item.owner_id = v_user_id
        and nullif(item.task ->> 'parentId', '') is null
    ), distinct_canonical as (
      select distinct on (canonical.id) canonical.*
        from canonical
       order by canonical.id, canonical.priority desc
    )
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', item.id,
      'workspaceId', item.workspace_id,
      'boardId', item.board_id,
      'parentId', item.parent_id,
      'order', item.sort_order,
      'nodeType', item.node_type,
      'kanbanStageId', item.kanban_stage_id,
      'updatedAt', item.updated_at_ms
    )) order by item.id), '[]'::jsonb)
      into v_canonical_nodes
      from distinct_canonical item;
  else
    with canonical as (
      select
        item.id,
        item.workspace_id,
        '__task_workbench_unplaced__' as board_id,
        nullif(item.task ->> 'parentId', '') as parent_id,
        item.sort_order,
        coalesce(nullif(item.task ->> 'nodeType', ''), 'task') as node_type,
        nullif(item.task ->> 'kanbanStageId', '') as kanban_stage_id,
        floor(extract(epoch from item.updated_at) * 1000)::bigint as updated_at_ms,
        1 as priority
      from public.task_workbench_unplaced_items item
      where item.owner_id = v_user_id
        and (
          item.id = any(v_expected_ids)
          or nullif(item.task ->> 'parentId', '') is null
        )
      union all
      select
        coalesce(item.legacy_node_id, item.id::text),
        p_source_workspace_id,
        p_source_board_id,
        coalesce(parent.legacy_node_id, parent.id::text),
        item.sort_order,
        item.item_type::text,
        item.kanban_stage_id,
        floor(extract(epoch from item.updated_at) * 1000)::bigint,
        0
      from public.wbs_items item
      left join public.wbs_items parent on parent.id = item.parent_id
      where item.tenant_id = v_source_tenant_id
        and item.project_id = v_source_project_id
        and item.parent_id is not distinct from v_source_parent_id
    ), distinct_canonical as (
      select distinct on (canonical.id) canonical.*
        from canonical
       order by canonical.id, canonical.priority desc
    )
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', item.id,
      'workspaceId', item.workspace_id,
      'boardId', item.board_id,
      'parentId', item.parent_id,
      'order', item.sort_order,
      'nodeType', item.node_type,
      'kanbanStageId', item.kanban_stage_id,
      'updatedAt', item.updated_at_ms
    )) order by item.id), '[]'::jsonb)
      into v_canonical_nodes
      from distinct_canonical item;
  end if;

  select count(distinct canonical ->> 'id')
    into v_canonical_moved_count
    from jsonb_array_elements(v_canonical_nodes) canonical
   where canonical ->> 'id' = any(v_expected_ids);
  if v_canonical_moved_count <> cardinality(v_expected_ids) then
    raise exception using errcode = 'P0001', message = 'Canonical task placement result is missing one or more moved tasks.';
  end if;
  if v_direction = 'to_board' and exists (
    select 1
      from jsonb_array_elements(v_canonical_nodes) canonical
     where canonical ->> 'id' = any(v_expected_ids)
       and (
         canonical ->> 'workspaceId' is distinct from p_target_workspace_id
         or canonical ->> 'boardId' is distinct from p_target_board_id
         or (
           canonical ->> 'id' = p_root_task_id
           and nullif(canonical ->> 'parentId', '') is distinct from p_target_parent_task_id
         )
       )
  ) then
    raise exception using errcode = 'P0001', message = 'Canonical task placement result does not match the target board scope.';
  end if;
  if v_direction = 'to_unplaced' and exists (
    select 1
      from jsonb_array_elements(v_canonical_nodes) canonical
     where canonical ->> 'id' = any(v_expected_ids)
       and (
         canonical ->> 'boardId' is distinct from '__task_workbench_unplaced__'
         or (
           canonical ->> 'id' = p_root_task_id
           and nullif(canonical ->> 'parentId', '') is not null
         )
       )
  ) then
    raise exception using errcode = 'P0001', message = 'Canonical task placement result does not match the account-unplaced scope.';
  end if;

  v_affected_scopes := jsonb_build_array(
    jsonb_build_object(
      'ownership', case
        when p_source_kind = 'account_unplaced' then jsonb_build_object('kind', 'account_unplaced')
        else jsonb_build_object('kind', 'board', 'workspaceId', p_source_workspace_id, 'boardId', p_source_board_id)
      end,
      'parentId', v_source_parent_task_id
    ),
    jsonb_build_object(
      'ownership', case
        when p_target_kind = 'account_unplaced' then jsonb_build_object('kind', 'account_unplaced')
        else jsonb_build_object('kind', 'board', 'workspaceId', p_target_workspace_id, 'boardId', p_target_board_id)
      end,
      'parentId', p_target_parent_task_id
    )
  );

  v_result := jsonb_build_object(
    'status', 'committed',
    'operationId', p_operation_id,
    'direction', v_direction,
    'movedTaskIds', to_jsonb(v_expected_ids),
    'canonicalNodes', v_canonical_nodes,
    'affectedScopes', v_affected_scopes
  );

  update public.task_workbench_placement_operations operation
     set result = v_result,
         updated_at = now()
   where operation.owner_id = v_user_id
     and operation.operation_id = p_operation_id
     and operation.status = 'committed';

  return v_result;
end;
$$;

create or replace function public.move_task_workbench_subtree_v2(
  p_operation_id text,
  p_root_task_id text,
  p_expected_subtree_ids jsonb,
  p_source_kind text,
  p_source_workspace_id text,
  p_source_board_id text,
  p_target_kind text,
  p_target_workspace_id text,
  p_target_board_id text,
  p_target_parent_task_id text,
  p_anchor_task_id text,
  p_position text,
  p_client_platform text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.move_task_workbench_subtree_v2_impl(
    p_operation_id,
    p_root_task_id,
    p_expected_subtree_ids,
    p_source_kind,
    p_source_workspace_id,
    p_source_board_id,
    p_target_kind,
    p_target_workspace_id,
    p_target_board_id,
    p_target_parent_task_id,
    p_anchor_task_id,
    p_position,
    p_client_platform
  );
$$;

revoke all on function private.move_task_workbench_subtree_v2_impl(
  text, text, jsonb, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function private.move_task_workbench_subtree_v2_impl(
  text, text, jsonb, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

revoke all on function public.move_task_workbench_subtree_v2(
  text, text, jsonb, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.move_task_workbench_subtree_v2(
  text, text, jsonb, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';
