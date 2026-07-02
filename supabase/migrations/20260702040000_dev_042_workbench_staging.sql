-- DEV-042: Workbench staging for placed tasks.
-- Supabase CLI is unavailable in this local environment, so this migration filename
-- follows the existing timestamp sequence manually.

create or replace function public.place_task_to_workbench_staging(
  p_task_id uuid,
  p_source_project_id uuid,
  p_stage_client_mutation_id text
)
returns table (
  task_node_id uuid,
  target_tenant_id uuid,
  target_project_id uuid,
  source_tenant_id uuid,
  source_project_id uuid
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_source_project public.projects%rowtype;
  v_task public.wbs_items%rowtype;
  v_existing public.wbs_items%rowtype;
  v_zone record;
  v_stage_sort_order bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to stage a task to the workbench.';
  end if;

  if p_task_id is null then
    raise exception 'task_id is required.';
  end if;

  if p_source_project_id is null then
    raise exception 'source_project_id is required.';
  end if;

  if p_stage_client_mutation_id is null or btrim(p_stage_client_mutation_id) = '' then
    raise exception 'stage_client_mutation_id is required.';
  end if;

  select * into v_zone from public.ensure_personal_task_zone() limit 1;

  select *
    into v_existing
    from public.wbs_items wi
   where wi.id = p_task_id
     and wi.tenant_id = v_zone.tenant_id
     and wi.project_id = v_zone.project_id
     and wi.metadata ->> 'staging_client_mutation_id' = p_stage_client_mutation_id
   limit 1;

  if v_existing.id is not null then
    task_node_id := v_existing.id;
    target_tenant_id := v_existing.tenant_id;
    target_project_id := v_existing.project_id;
    source_tenant_id := (v_existing.metadata ->> 'staged_from_tenant_id')::uuid;
    source_project_id := (v_existing.metadata ->> 'staged_from_project_id')::uuid;
    return next;
    return;
  end if;

  select * into v_source_project from public.projects p where p.id = p_source_project_id;
  if v_source_project.id is null then
    raise exception 'Source board was not found.';
  end if;

  if v_source_project.metadata ->> 'system_scope' = 'personal_task_zone' then
    raise exception 'Task is already in the workbench staging area.';
  end if;

  if not private.current_user_can_write_project(v_source_project.tenant_id, v_source_project.id) then
    raise exception 'You do not have permission to move tasks out of the source board.';
  end if;

  select *
    into v_task
    from public.wbs_items wi
   where wi.id = p_task_id
     and wi.tenant_id = v_source_project.tenant_id
     and wi.project_id = v_source_project.id
   for update;

  if v_task.id is null then
    raise exception 'Source task was not found.';
  end if;

  if exists (
    with recursive task_tree as (
      select wi.id from public.wbs_items wi where wi.id = v_task.id
      union all
      select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
    )
    select 1 from public.wbs_item_tags wit
     where wit.tenant_id = v_source_project.tenant_id
       and wit.project_id = v_source_project.id
       and wit.item_id in (select id from task_tree)
     limit 1
  ) then
    raise exception 'This task has tags. Workbench staging requires a tag-transfer policy first.';
  end if;

  if exists (
    with recursive task_tree as (
      select wi.id from public.wbs_items wi where wi.id = v_task.id
      union all
      select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
    )
    select 1 from public.record_task_links rtl
     where rtl.tenant_id = v_source_project.tenant_id
       and rtl.project_id = v_source_project.id
       and rtl.item_id in (select id from task_tree)
     limit 1
  ) then
    raise exception 'This task has linked records. Workbench staging requires a controlled move flow.';
  end if;

  if exists (
    with recursive task_tree as (
      select wi.id from public.wbs_items wi where wi.id = v_task.id
      union all
      select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
    )
    select 1 from public.wbs_dependencies dep
     where dep.tenant_id = v_source_project.tenant_id
       and dep.project_id = v_source_project.id
       and (
         (dep.from_item_id in (select id from task_tree) and dep.to_item_id not in (select id from task_tree))
         or
         (dep.to_item_id in (select id from task_tree) and dep.from_item_id not in (select id from task_tree))
       )
     limit 1
  ) then
    raise exception 'This task has dependencies outside the staged subtree. Workbench staging requires a controlled move flow.';
  end if;

  update public.wbs_items wi
     set sort_order = wi.sort_order - 1,
         updated_by = v_user_id
   where wi.tenant_id = v_source_project.tenant_id
     and wi.project_id = v_source_project.id
     and wi.parent_id is not distinct from v_task.parent_id
     and wi.id <> v_task.id
     and wi.sort_order > v_task.sort_order;

  select coalesce(max(wi.sort_order), -1) + 1
    into v_stage_sort_order
    from public.wbs_items wi
   where wi.tenant_id = v_zone.tenant_id
     and wi.project_id = v_zone.project_id
     and wi.parent_id is null;

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_items wi
     set tenant_id = v_zone.tenant_id,
         project_id = v_zone.project_id,
         parent_id = case when wi.id = v_task.id then null else wi.parent_id end,
         sort_order = case when wi.id = v_task.id then v_stage_sort_order else wi.sort_order end,
         item_type = case when wi.id = v_task.id then 'task'::public.wbs_item_type else wi.item_type end,
         updated_by = v_user_id,
         metadata = coalesce(wi.metadata, '{}'::jsonb)
           - 'placed_project_id'
           - 'move_client_mutation_id'
           || jsonb_build_object(
                'system_scope', 'personal_task_zone',
                'placement_status', 'unplaced',
                'staging_client_mutation_id', p_stage_client_mutation_id,
                'staged_at', now(),
                'staged_by_user_id', v_user_id,
                'staged_from_tenant_id', v_source_project.tenant_id,
                'staged_from_project_id', v_source_project.id,
                'staged_from_parent_id', v_task.parent_id,
                'staged_from_sort_order', v_task.sort_order,
                'staged_from_item_type', v_task.item_type
              )
   where wi.id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_dependencies dep
     set tenant_id = v_zone.tenant_id,
         project_id = v_zone.project_id
   where dep.tenant_id = v_source_project.tenant_id
     and dep.project_id = v_source_project.id
     and dep.from_item_id in (select id from task_tree)
     and dep.to_item_id in (select id from task_tree);

  task_node_id := v_task.id;
  target_tenant_id := v_zone.tenant_id;
  target_project_id := v_zone.project_id;
  source_tenant_id := v_source_project.tenant_id;
  source_project_id := v_source_project.id;
  return next;
end;
$$;

create or replace function public.place_personal_task_on_board(
  p_task_id uuid,
  p_target_project_id uuid,
  p_target_parent_id uuid default null,
  p_insert_before_id uuid default null,
  p_insert_after_id uuid default null,
  p_placement_client_mutation_id text default null
)
returns table (
  task_node_id uuid,
  target_tenant_id uuid,
  target_project_id uuid
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_task public.wbs_items%rowtype;
  v_target_project public.projects%rowtype;
  v_parent_id uuid;
  v_insert_before public.wbs_items%rowtype;
  v_insert_after public.wbs_items%rowtype;
  v_sort_order bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to place a personal task.';
  end if;

  if p_task_id is null then
    raise exception 'task_id is required.';
  end if;

  if p_target_project_id is null then
    raise exception 'target_project_id is required.';
  end if;

  if p_placement_client_mutation_id is null or btrim(p_placement_client_mutation_id) = '' then
    raise exception 'placement_client_mutation_id is required.';
  end if;

  if p_insert_before_id is not null and p_insert_after_id is not null then
    raise exception 'Only one insert boundary may be provided.';
  end if;

  select *
    into v_target_project
    from public.projects p
   where p.id = p_target_project_id;

  if v_target_project.id is null then
    raise exception 'Target board was not found.';
  end if;

  if v_target_project.metadata ->> 'system_scope' = 'personal_task_zone' then
    raise exception 'Personal tasks must be placed on a normal board.';
  end if;

  if not private.current_user_can_write_project(v_target_project.tenant_id, v_target_project.id) then
    raise exception 'You do not have permission to create tasks on this board.';
  end if;

  select *
    into v_task
    from public.wbs_items wi
   where wi.id = p_task_id
   for update;

  if v_task.id is null then
    raise exception 'Personal task was not found.';
  end if;

  if v_task.created_by <> v_user_id
     and coalesce(v_task.metadata ->> 'staged_by_user_id', '') <> v_user_id::text then
    raise exception 'Personal task belongs to another user.';
  end if;

  if v_task.metadata ->> 'placement_client_mutation_id' = p_placement_client_mutation_id
     and v_task.project_id = v_target_project.id then
    task_node_id := v_task.id;
    target_tenant_id := v_task.tenant_id;
    target_project_id := v_task.project_id;
    return next;
    return;
  end if;

  if coalesce(v_task.metadata ->> 'placement_status', 'unplaced') <> 'unplaced'
     or v_task.metadata ->> 'system_scope' <> 'personal_task_zone' then
    raise exception 'Only unplaced personal tasks can be placed through this operation.';
  end if;

  if p_target_parent_id is not null then
    if not exists (
      select 1
        from public.wbs_items wi
       where wi.id = p_target_parent_id
         and wi.tenant_id = v_target_project.tenant_id
         and wi.project_id = v_target_project.id
    ) then
      raise exception 'Target parent does not belong to the target board.';
    end if;
  end if;
  v_parent_id := p_target_parent_id;

  if p_insert_before_id is not null then
    select *
      into v_insert_before
      from public.wbs_items wi
     where wi.id = p_insert_before_id
       and wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id;

    if v_insert_before.id is null then
      raise exception 'Insert-before task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_before.parent_id;
    v_sort_order := v_insert_before.sort_order;

    update public.wbs_items wi
       set sort_order = wi.sort_order + 1
     where wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id
       and wi.parent_id is not distinct from v_parent_id
       and wi.sort_order >= v_sort_order;
  elsif p_insert_after_id is not null then
    select *
      into v_insert_after
      from public.wbs_items wi
     where wi.id = p_insert_after_id
       and wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id;

    if v_insert_after.id is null then
      raise exception 'Insert-after task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_after.parent_id;
    v_sort_order := v_insert_after.sort_order + 1;

    update public.wbs_items wi
       set sort_order = wi.sort_order + 1
     where wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id
       and wi.parent_id is not distinct from v_parent_id
       and wi.sort_order >= v_sort_order;
  else
    select coalesce(max(wi.sort_order), -1) + 1
      into v_sort_order
      from public.wbs_items wi
     where wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id
       and wi.parent_id is not distinct from v_parent_id;
  end if;

  with recursive task_tree as (
    select wi.id
      from public.wbs_items wi
     where wi.id = v_task.id
    union all
    select child.id
      from public.wbs_items child
      join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_items wi
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id,
         parent_id = case when wi.id = v_task.id then v_parent_id else wi.parent_id end,
         sort_order = case when wi.id = v_task.id then v_sort_order else wi.sort_order end,
         updated_by = v_user_id,
         metadata = coalesce(wi.metadata, '{}'::jsonb)
           - 'staging_client_mutation_id'
           - 'staged_at'
           - 'staged_by_user_id'
           - 'staged_from_tenant_id'
           - 'staged_from_project_id'
           - 'staged_from_parent_id'
           - 'staged_from_sort_order'
           - 'staged_from_item_type'
           || jsonb_build_object(
                'placement_status', 'placed',
                'placement_client_mutation_id', p_placement_client_mutation_id,
                'placed_at', now(),
                'placed_project_id', v_target_project.id
              )
   where wi.id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id
      from public.wbs_items wi
     where wi.id = v_task.id
    union all
    select child.id
      from public.wbs_items child
      join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_dependencies dep
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id
   where dep.from_item_id in (select id from task_tree)
     and dep.to_item_id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id
      from public.wbs_items wi
     where wi.id = v_task.id
    union all
    select child.id
      from public.wbs_items child
      join task_tree parent on parent.id = child.parent_id
  )
  delete from public.wbs_item_tags wit
   where wit.item_id in (select id from task_tree)
     and not exists (
       select 1
         from public.task_tags tt
        where tt.id = wit.tag_id
          and tt.tenant_id = v_target_project.tenant_id
     );

  with recursive task_tree as (
    select wi.id
      from public.wbs_items wi
     where wi.id = v_task.id
    union all
    select child.id
      from public.wbs_items child
      join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_item_tags wit
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id
   where wit.item_id in (select id from task_tree)
     and exists (
       select 1
         from public.task_tags tt
        where tt.id = wit.tag_id
          and tt.tenant_id = v_target_project.tenant_id
     );

  task_node_id := v_task.id;
  target_tenant_id := v_target_project.tenant_id;
  target_project_id := v_target_project.id;
  return next;
end;
$$;

revoke all on function public.place_task_to_workbench_staging(uuid, uuid, text) from public, anon;
grant execute on function public.place_task_to_workbench_staging(uuid, uuid, text) to authenticated;

revoke all on function public.place_personal_task_on_board(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.place_personal_task_on_board(uuid, uuid, uuid, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
