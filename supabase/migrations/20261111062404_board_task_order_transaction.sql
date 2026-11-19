-- The same effective capabilities gate the board editor and its order RPC.
-- Workspace administrators need a board membership for canonical task writes.
create function private.board_task_write_capabilities_v1(p_tenant_id uuid, p_project_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select array(
      select cap
      from unnest(array['create_task','edit_task','move_task','delete_task']) cap
      where (case when cap = 'edit_task'
                  then private.current_user_has_project_capability(p_tenant_id, p_project_id, 'edit_task')
                  when permission.role is not null and pm.role::text <> 'owner'
                  then cap = any(permission.capabilities)
                  else pm.role::text in ('owner','admin','project_manager','member') end)
        -- Legacy archive uses the canonical UPDATE policy as well as delete_task.
        and (cap <> 'delete_task' or
          private.current_user_has_project_capability(p_tenant_id, p_project_id, 'edit_task'))
    )
    from public.project_members pm
    join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id
    join public.projects project on project.id = pm.project_id and project.tenant_id = pm.tenant_id
    left join public.board_role_permissions permission
      on permission.tenant_id = pm.tenant_id and permission.project_id = pm.project_id and permission.role = pm.role
    where pm.tenant_id = p_tenant_id and pm.project_id = p_project_id
      and pm.user_id = (select auth.uid()) and tm.status::text = 'active'
      and private.current_user_can_read_project(p_tenant_id, p_project_id)
  ), '{}'::text[]);
$$;

create function public.get_board_task_write_capabilities_v1(p_tenant_id uuid, p_project_id uuid)
returns text[]
language sql stable security invoker set search_path = ''
as $$
  select private.board_task_write_capabilities_v1(p_tenant_id, p_project_id);
$$;

create function private.commit_board_task_order_v1_impl(
  p_tenant_id uuid, p_project_id uuid, p_operation text, p_task_id text,
  p_parent_id text, p_anchor_id text, p_position text, p_source_parent_id text,
  p_title text, p_item_type text, p_reopen_parent boolean, p_protected_task_ids text[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  caps text[];
  source_row public.wbs_items%rowtype;
  parent_row public.wbs_items%rowtype;
  anchor_row public.wbs_items%rowtype;
  source_scope text;
  target_scope text;
  task_db_id uuid;
  sibling_ids uuid[];
  anchor_index integer;
  source_index integer;
  insert_index integer;
  previous_order numeric;
  next_order numeric;
  new_order numeric;
  changed_ids uuid[] := '{}'::uuid[];
  changed_siblings uuid[];
  reopen_result boolean := false;
begin
  if actor is null or p_tenant_id is null or p_project_id is null
    or p_operation is null or p_operation not in ('create','move')
    or p_position is null or p_position not in ('append','before','after','swap')
    or p_task_id is null or length(p_task_id) not between 1 and 128
    or cardinality(p_protected_task_ids) > 10000
    or (p_position = 'append') <> (p_anchor_id is null)
    or (p_operation = 'create' and (p_position = 'swap' or p_source_parent_id is not null
      or p_item_type is null or p_item_type not in ('group','milestone','task')
      or p_title is null or length(btrim(p_title)) not between 1 and 500))
  then raise exception using errcode = '22023', message = 'Invalid board task order command.'; end if;

  caps := private.board_task_write_capabilities_v1(p_tenant_id, p_project_id);
  if not (case when p_operation = 'create' then 'create_task' else 'move_task' end = any(caps)) then
    raise exception using errcode = '42501', message = 'Board task write permission denied.';
  end if;

  -- Serialize this command's hierarchy changes, then take the same sibling
  -- scope locks as the workbench transfer command in deterministic order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    format('board-task-order:%s:%s', p_tenant_id, p_project_id), 0));
  if p_parent_id is not null then
    select * into parent_row from public.wbs_items i
      where i.tenant_id = p_tenant_id and i.project_id = p_project_id
      and coalesce(i.legacy_node_id, i.id::text) = p_parent_id and not i.is_archived;
    if not found then raise exception using errcode = 'P0002', message = 'Target task parent is unavailable.'; end if;
  end if;
  if p_operation = 'move' then
    select * into source_row from public.wbs_items i
      where i.tenant_id = p_tenant_id and i.project_id = p_project_id
      and coalesce(i.legacy_node_id, i.id::text) = p_task_id and not i.is_archived;
    if not found then raise exception using errcode = 'P0002', message = 'Source task is unavailable.'; end if;
  end if;
  source_scope := format('board:%s:%s:parent:%s', p_tenant_id, p_project_id, coalesce(source_row.parent_id::text, 'root'));
  target_scope := format('board:%s:%s:parent:%s', p_tenant_id, p_project_id, coalesce(parent_row.id::text, 'root'));
  if p_operation = 'create' then source_scope := target_scope; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(source_scope,target_scope), 0));
  if source_scope <> target_scope then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(source_scope,target_scope), 0));
  end if;

  caps := private.board_task_write_capabilities_v1(p_tenant_id, p_project_id);
  if not (case when p_operation = 'create' then 'create_task' else 'move_task' end = any(caps)) then
    raise exception using errcode = '42501', message = 'Board task write permission denied.';
  end if;
  if parent_row.id is not null then
    select * into parent_row from public.wbs_items i where i.id = parent_row.id
      and i.tenant_id = p_tenant_id and i.project_id = p_project_id and not i.is_archived for update;
    if not found then raise exception using errcode = 'P0002', message = 'Target task parent is unavailable.'; end if;
  end if;
  if p_operation = 'move' then
    select * into source_row from public.wbs_items i where i.id = source_row.id
      and i.tenant_id = p_tenant_id and i.project_id = p_project_id and not i.is_archived for update;
    if not found or p_source_parent_id is distinct from (select coalesce(i.legacy_node_id,i.id::text)
      from public.wbs_items i where i.id = source_row.parent_id)
    then raise exception using errcode = '40001', message = 'Source task parent changed. Reload before moving.'; end if;
    if source_scope <> format('board:%s:%s:parent:%s', p_tenant_id, p_project_id, coalesce(source_row.parent_id::text, 'root'))
    then raise exception using errcode = '40001', message = 'Source task scope changed.'; end if;
    if exists (
      with recursive ancestors(id, parent_id) as (
        select i.id, i.parent_id from public.wbs_items i where i.id = parent_row.id
        union select i.id, i.parent_id from public.wbs_items i join ancestors a on a.parent_id = i.id
        where i.tenant_id = p_tenant_id and i.project_id = p_project_id
      ) select 1 from ancestors where id = source_row.id
    ) then raise exception using errcode = '22023', message = 'Task hierarchy cycle.'; end if;
    task_db_id := source_row.id;
  else
    task_db_id := case when p_task_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_task_id::uuid else pg_catalog.gen_random_uuid() end;
  end if;

  if p_anchor_id is not null then
    select * into anchor_row from public.wbs_items i
      where i.tenant_id = p_tenant_id and i.project_id = p_project_id
      and coalesce(i.legacy_node_id, i.id::text) = p_anchor_id
      and i.parent_id is not distinct from parent_row.id and not i.is_archived for update;
    if not found or anchor_row.id = task_db_id then
      raise exception using errcode = 'P0002', message = 'Target task anchor is unavailable.';
    end if;
  end if;
  if p_position = 'swap' and source_row.parent_id is distinct from parent_row.id then
    raise exception using errcode = '22023', message = 'Only siblings can be swapped.';
  end if;

  select coalesce(array_agg(i.id order by i.sort_order, coalesce(i.legacy_node_id,i.id::text) collate "C"), '{}'::uuid[])
    into sibling_ids from public.wbs_items i
    where i.tenant_id = p_tenant_id and i.project_id = p_project_id
      and i.parent_id is not distinct from parent_row.id and not i.is_archived
      and (p_position = 'swap' or i.id <> task_db_id);
  anchor_index := array_position(sibling_ids, anchor_row.id);
  if p_position = 'swap' then
    source_index := array_position(sibling_ids, task_db_id);
    sibling_ids[anchor_index] := task_db_id;
    sibling_ids[source_index] := anchor_row.id;
    insert_index := anchor_index;
    if source_row.sort_order <> anchor_row.sort_order
      and source_row.sort_order between -9007199254740991 and 9007199254740991
      and anchor_row.sort_order between -9007199254740991 and 9007199254740991
      and not exists (
        select 1 from public.wbs_items i
        where i.id = any(sibling_ids) and i.id not in (task_db_id, anchor_row.id)
          and i.sort_order in (source_row.sort_order, anchor_row.sort_order)
      )
    then
      update public.wbs_items set sort_order = source_row.sort_order, updated_by = actor where id = anchor_row.id;
      changed_ids := array_append(changed_ids, anchor_row.id);
      new_order := anchor_row.sort_order;
    end if;
  else
    insert_index := case p_position when 'before' then anchor_index
      when 'after' then anchor_index + 1 else cardinality(sibling_ids) + 1 end;
    select i.sort_order into previous_order from public.wbs_items i where i.id = sibling_ids[insert_index - 1];
    select i.sort_order into next_order from public.wbs_items i where i.id = sibling_ids[insert_index];
    new_order := case
      when previous_order is null and next_order is null then 0
      when previous_order is null then next_order - 1024
      when next_order is null then previous_order + 1024
      when next_order - previous_order >= 2 then floor((previous_order + next_order) / 2)
    end;
  end if;

  if new_order is null or abs(new_order) > 9007199254740991 then
    -- Rebalance only the destination sibling group when the integer gap is exhausted.
    with ranked as (
      select id, (ordinality - 1 + case when p_position <> 'swap' and ordinality >= insert_index then 1 else 0 end) * 1024 as new_rank
      from unnest(sibling_ids) with ordinality as siblings(id, ordinality)
    ), shifted as (
      update public.wbs_items i set sort_order = ranked.new_rank, updated_by = actor
      from ranked where i.id = ranked.id and i.id <> task_db_id and i.sort_order <> ranked.new_rank
      returning i.id
    ) select coalesce(array_agg(id), '{}'::uuid[]) into changed_siblings from shifted;
    changed_ids := changed_ids || changed_siblings;
    new_order := (insert_index::bigint - 1) * 1024;
  end if;

  if p_operation = 'create' then
    insert into public.wbs_items (
      id, tenant_id, project_id, parent_id, legacy_node_id, title, item_type,
      sort_order, detail_notes, created_by, updated_by
    ) values (
      task_db_id, p_tenant_id, p_project_id, parent_row.id,
      case when task_db_id::text = p_task_id then null else p_task_id end,
      btrim(p_title), p_item_type::public.wbs_item_type, new_order::bigint,
      case when p_item_type = 'task' then
        '[{"id":"note_default","title":"任務目的","content":""},{"id":"note_default_secondary","title":"備註","content":""}]'::jsonb
        else '[]'::jsonb end, actor, actor
    );
    if p_reopen_parent and parent_row.status::text = 'completed'
      and private.current_user_can_write_canonical_task(p_tenant_id, parent_row.id)
    then
      update public.wbs_items set status = 'in_progress', updated_by = actor where id = parent_row.id;
      changed_ids := array_append(changed_ids, parent_row.id);
      reopen_result := true;
    end if;
  else
    update public.wbs_items set parent_id = parent_row.id, sort_order = new_order::bigint, updated_by = actor
      where id = task_db_id and (parent_id is distinct from parent_row.id or sort_order <> new_order);
  end if;
  changed_ids := array_append(changed_ids, task_db_id);
  if exists (
    select 1 from public.wbs_items i where i.id = any(changed_ids)
      and (p_operation = 'move' or i.id <> task_db_id)
      and ('*' = any(p_protected_task_ids) or coalesce(i.legacy_node_id, i.id::text) = any(p_protected_task_ids))
  ) then
    raise exception using errcode = '55000', message = 'Pending recovery overlaps board task order changes.';
  end if;
  return jsonb_build_object('reopenedParent', reopen_result, 'nodes', (
    select jsonb_agg(jsonb_build_object(
      'id', coalesce(i.legacy_node_id, i.id::text), 'storageId', i.id,
      'parentId', coalesce(parent.legacy_node_id,parent.id::text), 'order', i.sort_order,
      'status', i.status, 'createdAt', floor(extract(epoch from i.created_at) * 1000),
      'updatedAt', floor(extract(epoch from i.updated_at) * 1000)
    ) order by i.id)
    from public.wbs_items i left join public.wbs_items parent on parent.id = i.parent_id
    where i.id = any(changed_ids)
  ));
end;
$$;

create function public.commit_board_task_order_v1(
  p_tenant_id uuid, p_project_id uuid, p_operation text, p_task_id text,
  p_parent_id text, p_anchor_id text, p_position text, p_source_parent_id text,
  p_title text, p_item_type text, p_reopen_parent boolean, p_protected_task_ids text[]
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select private.commit_board_task_order_v1_impl(
    p_tenant_id, p_project_id, p_operation, p_task_id, p_parent_id, p_anchor_id,
    p_position, p_source_parent_id, p_title, p_item_type, p_reopen_parent, p_protected_task_ids
  );
$$;

revoke all on function private.board_task_write_capabilities_v1(uuid,uuid) from public, anon;
revoke all on function public.get_board_task_write_capabilities_v1(uuid,uuid) from public, anon;
revoke all on function private.commit_board_task_order_v1_impl(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[]) from public, anon;
revoke all on function public.commit_board_task_order_v1(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[]) from public, anon;
grant execute on function private.board_task_write_capabilities_v1(uuid,uuid) to authenticated;
grant execute on function public.get_board_task_write_capabilities_v1(uuid,uuid) to authenticated;
grant execute on function private.commit_board_task_order_v1_impl(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[]) to authenticated;
grant execute on function public.commit_board_task_order_v1(uuid,uuid,text,text,text,text,text,text,text,text,boolean,text[]) to authenticated;
notify pgrst, 'reload schema';
