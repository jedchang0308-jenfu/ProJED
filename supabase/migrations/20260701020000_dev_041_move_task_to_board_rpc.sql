-- DEV-041: canonical task move between boards for the personal task command center.
-- Supabase CLI is unavailable in this local environment, so this migration filename
-- follows the existing timestamp sequence manually.

create or replace function public.move_task_to_board(
  p_task_id uuid,
  p_source_project_id uuid,
  p_target_project_id uuid,
  p_target_parent_id uuid default null,
  p_insert_before_id uuid default null,
  p_insert_after_id uuid default null,
  p_target_sort_order bigint default null,
  p_move_client_mutation_id text default null
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
  v_source_project public.projects%rowtype;
  v_target_project public.projects%rowtype;
  v_task public.wbs_items%rowtype;
  v_parent_id uuid;
  v_insert_before public.wbs_items%rowtype;
  v_insert_after public.wbs_items%rowtype;
  v_sort_order bigint;
  v_is_cross_workspace boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to move a task.';
  end if;

  if p_task_id is null then
    raise exception 'task_id is required.';
  end if;

  if p_source_project_id is null then
    raise exception 'source_project_id is required.';
  end if;

  if p_target_project_id is null then
    raise exception 'target_project_id is required.';
  end if;

  if p_source_project_id = p_target_project_id then
    raise exception 'Use normal board drag to reorder tasks inside the same board.';
  end if;

  if p_insert_before_id is not null and p_insert_after_id is not null then
    raise exception 'Only one insert boundary may be provided.';
  end if;

  select * into v_source_project from public.projects p where p.id = p_source_project_id;
  if v_source_project.id is null then
    raise exception 'Source board was not found.';
  end if;

  select * into v_target_project from public.projects p where p.id = p_target_project_id;
  if v_target_project.id is null then
    raise exception 'Target board was not found.';
  end if;

  if v_target_project.metadata ->> 'system_scope' = 'personal_task_zone' then
    raise exception 'Tasks must be moved to a normal board.';
  end if;

  if v_source_project.metadata ->> 'system_scope' = 'personal_task_zone' then
    raise exception 'Cannot directly move tasks from the personal task zone.';
  end if;

  if not private.current_user_can_write_project(v_source_project.tenant_id, v_source_project.id) then
    raise exception 'You do not have permission to move tasks out of the source board.';
  end if;

  if not private.current_user_can_write_project(v_target_project.tenant_id, v_target_project.id) then
    raise exception 'You do not have permission to move tasks into the target board.';
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

  v_is_cross_workspace := v_source_project.tenant_id <> v_target_project.tenant_id;

  if p_target_parent_id is not null then
    if not exists (
      select 1 from public.wbs_items wi
       where wi.id = p_target_parent_id
         and wi.tenant_id = v_target_project.tenant_id
         and wi.project_id = v_target_project.id
    ) then
      raise exception 'Target parent does not belong to the target board.';
    end if;
  end if;
  v_parent_id := p_target_parent_id;

  if p_insert_before_id is not null then
    select * into v_insert_before
      from public.wbs_items wi
     where wi.id = p_insert_before_id
       and wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id;

    if v_insert_before.id is null then
      raise exception 'Insert-before task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_before.parent_id;
    v_sort_order := v_insert_before.sort_order;
  elsif p_insert_after_id is not null then
    select * into v_insert_after
      from public.wbs_items wi
     where wi.id = p_insert_after_id
       and wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id;

    if v_insert_after.id is null then
      raise exception 'Insert-after task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_after.parent_id;
    v_sort_order := v_insert_after.sort_order + 1;
  elsif p_target_sort_order is not null then
    v_sort_order := greatest(p_target_sort_order, 0);
  else
    select coalesce(max(wi.sort_order), -1) + 1
      into v_sort_order
      from public.wbs_items wi
     where wi.tenant_id = v_target_project.tenant_id
       and wi.project_id = v_target_project.id
       and wi.parent_id is not distinct from v_parent_id;
  end if;

  if v_sort_order is null then
    v_sort_order := 0;
  end if;

  if v_is_cross_workspace then
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
    ) or exists (
      with recursive task_tree as (
        select wi.id from public.wbs_items wi where wi.id = v_task.id
        union all
        select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
      )
      select 1 from public.wbs_dependencies dep
       where dep.tenant_id = v_source_project.tenant_id
         and dep.project_id = v_source_project.id
         and (dep.from_item_id in (select id from task_tree) or dep.to_item_id in (select id from task_tree))
       limit 1
    ) or exists (
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
    ) or exists (
      with recursive task_tree as (
        select wi.id from public.wbs_items wi where wi.id = v_task.id
        union all
        select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
      )
      select 1 from public.activity_events ae
       where ae.tenant_id = v_source_project.tenant_id
         and ae.project_id = v_source_project.id
         and ae.entity_table = 'wbs_items'
         and ae.entity_id in (select id::text from task_tree)
       limit 1
    ) or exists (
      with recursive task_tree as (
        select wi.id from public.wbs_items wi where wi.id = v_task.id
        union all
        select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
      )
      select 1 from public.audit_logs al
       where al.tenant_id = v_source_project.tenant_id
         and al.entity_table = 'wbs_items'
         and al.entity_id in (select id::text from task_tree)
       limit 1
    ) then
      raise exception 'This task has tags, dependencies, records or history. Cross-workspace move requires a controlled move flow.';
    end if;
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
    raise exception 'This task has linked records. Moving records with tasks requires a controlled move flow.';
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
    raise exception 'This task has dependencies outside the moved subtree. Moving cross-task dependencies requires a controlled move flow.';
  end if;

  update public.wbs_items wi
     set sort_order = wi.sort_order - 1,
         updated_by = v_user_id
   where wi.tenant_id = v_source_project.tenant_id
     and wi.project_id = v_source_project.id
     and wi.parent_id is not distinct from v_task.parent_id
     and wi.id <> v_task.id
     and wi.sort_order > v_task.sort_order;

  update public.wbs_items wi
     set sort_order = wi.sort_order + 1,
         updated_by = v_user_id
   where wi.tenant_id = v_target_project.tenant_id
     and wi.project_id = v_target_project.id
     and wi.parent_id is not distinct from v_parent_id
     and wi.sort_order >= v_sort_order;

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_items wi
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id,
         parent_id = case when wi.id = v_task.id then v_parent_id else wi.parent_id end,
         sort_order = case when wi.id = v_task.id then v_sort_order else wi.sort_order end,
         item_type = case
           when wi.id = v_task.id and v_parent_id is null then 'group'::public.wbs_item_type
           when wi.id = v_task.id then 'task'::public.wbs_item_type
           else wi.item_type
         end,
         updated_by = v_user_id,
         metadata = coalesce(wi.metadata, '{}'::jsonb)
           || jsonb_build_object(
                'move_client_mutation_id', p_move_client_mutation_id,
                'moved_at', now(),
                'moved_from_project_id', v_source_project.id,
                'moved_to_project_id', v_target_project.id
              )
   where wi.id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_dependencies dep
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id
   where dep.tenant_id = v_source_project.tenant_id
     and dep.project_id = v_source_project.id
     and dep.from_item_id in (select id from task_tree)
     and dep.to_item_id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.wbs_item_tags wit
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id
   where wit.tenant_id = v_source_project.tenant_id
     and wit.project_id = v_source_project.id
     and wit.item_id in (select id from task_tree);

  with recursive task_tree as (
    select wi.id from public.wbs_items wi where wi.id = v_task.id
    union all
    select child.id from public.wbs_items child join task_tree parent on parent.id = child.parent_id
  )
  update public.activity_events ae
     set tenant_id = v_target_project.tenant_id,
         project_id = v_target_project.id
   where ae.tenant_id = v_source_project.tenant_id
     and ae.project_id = v_source_project.id
     and ae.entity_table = 'wbs_items'
     and ae.entity_id in (select id::text from task_tree);

  task_node_id := v_task.id;
  target_tenant_id := v_target_project.tenant_id;
  target_project_id := v_target_project.id;
  return next;
end;
$$;

revoke all on function public.move_task_to_board(uuid, uuid, uuid, uuid, uuid, uuid, bigint, text) from public, anon;
grant execute on function public.move_task_to_board(uuid, uuid, uuid, uuid, uuid, uuid, bigint, text) to authenticated;

notify pgrst, 'reload schema';
