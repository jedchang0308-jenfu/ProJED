-- DEV-040: Personal task zone and quick task entry.
-- Quick entries become canonical wbs_items under a hidden personal project.

create index if not exists tenants_personal_task_zone_owner_idx
  on public.tenants(owner_id)
  where metadata ->> 'system_scope' = 'personal_task_zone';

create index if not exists projects_personal_task_zone_tenant_idx
  on public.projects(tenant_id)
  where metadata ->> 'system_scope' = 'personal_task_zone';

create unique index if not exists wbs_items_personal_task_zone_client_mutation_idx
  on public.wbs_items(created_by, ((metadata ->> 'client_mutation_id')))
  where metadata ->> 'system_scope' = 'personal_task_zone';

create or replace function public.ensure_personal_task_zone()
returns table (
  tenant_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tenant public.tenants%rowtype;
  v_project public.projects%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to use personal task zone.';
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    v_user_id,
    auth.jwt() ->> 'email',
    coalesce(auth.jwt() ->> 'name', auth.jwt() ->> 'email')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();

  select *
    into v_tenant
    from public.tenants t
   where t.owner_id = v_user_id
     and t.metadata ->> 'system_scope' = 'personal_task_zone'
   order by t.created_at asc
   limit 1;

  if v_tenant.id is null then
    insert into public.tenants (name, owner_id, metadata)
    values (
      '任務專區',
      v_user_id,
      jsonb_build_object(
        'system_scope', 'personal_task_zone',
        'visibility', 'private',
        'owner_user_id', v_user_id
      )
    )
    returning * into v_tenant;
  end if;

  insert into public.tenant_members (tenant_id, user_id, role, status)
  values (v_tenant.id, v_user_id, 'owner', 'active')
  on conflict on constraint tenant_members_pkey do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  select *
    into v_project
    from public.projects p
   where p.tenant_id = v_tenant.id
     and p.metadata ->> 'system_scope' = 'personal_task_zone'
   order by p.created_at asc
   limit 1;

  if v_project.id is null then
    insert into public.projects (tenant_id, name, sort_order, metadata, created_by)
    values (
      v_tenant.id,
      '待歸位',
      0,
      jsonb_build_object(
        'system_scope', 'personal_task_zone',
        'visibility', 'private',
        'owner_user_id', v_user_id
      ),
      v_user_id
    )
    returning * into v_project;
  end if;

  insert into public.project_members (tenant_id, project_id, user_id, role)
  values (v_tenant.id, v_project.id, v_user_id, 'owner')
  on conflict on constraint project_members_pkey do update
    set role = 'owner',
        updated_at = now();

  tenant_id := v_tenant.id;
  project_id := v_project.id;
  return next;
end;
$$;

create or replace function public.create_personal_quick_task(
  p_client_mutation_id text,
  p_title text,
  p_description text default null,
  p_suggested_due_date date default null,
  p_source_context jsonb default '{}'::jsonb
)
returns table (
  task_node_id uuid,
  tenant_id uuid,
  project_id uuid
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_zone record;
  v_existing public.wbs_items%rowtype;
  v_task public.wbs_items%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to create a personal task.';
  end if;

  if p_client_mutation_id is null or btrim(p_client_mutation_id) = '' then
    raise exception 'client_mutation_id is required.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Task title is required.';
  end if;

  select * into v_zone from public.ensure_personal_task_zone() limit 1;

  select *
    into v_existing
    from public.wbs_items wi
   where wi.tenant_id = v_zone.tenant_id
     and wi.project_id = v_zone.project_id
     and wi.created_by = v_user_id
     and wi.metadata ->> 'client_mutation_id' = p_client_mutation_id
   limit 1;

  if v_existing.id is not null then
    task_node_id := v_existing.id;
    tenant_id := v_existing.tenant_id;
    project_id := v_existing.project_id;
    return next;
    return;
  end if;

  begin
    insert into public.wbs_items (
      tenant_id,
      project_id,
      parent_id,
      title,
      description,
      status,
      end_date,
      item_type,
      sort_order,
      created_by,
      updated_by,
      metadata
    )
    values (
      v_zone.tenant_id,
      v_zone.project_id,
      null,
      btrim(p_title),
      nullif(btrim(coalesce(p_description, '')), ''),
      'todo',
      p_suggested_due_date,
      'task',
      (extract(epoch from clock_timestamp()) * 1000)::bigint,
      v_user_id,
      v_user_id,
      jsonb_build_object(
        'system_scope', 'personal_task_zone',
        'origin', 'quick_task',
        'placement_status', 'unplaced',
        'client_mutation_id', p_client_mutation_id,
        'source_context', coalesce(p_source_context, '{}'::jsonb)
      )
    )
    returning * into v_task;
  exception when unique_violation then
    select *
      into v_existing
      from public.wbs_items wi
     where wi.tenant_id = v_zone.tenant_id
       and wi.project_id = v_zone.project_id
       and wi.created_by = v_user_id
       and wi.metadata ->> 'client_mutation_id' = p_client_mutation_id
     limit 1;

    if v_existing.id is null then
      raise;
    end if;

    task_node_id := v_existing.id;
    tenant_id := v_existing.tenant_id;
    project_id := v_existing.project_id;
    return next;
    return;
  end;

  task_node_id := v_task.id;
  tenant_id := v_task.tenant_id;
  project_id := v_task.project_id;
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

  if v_task.created_by <> v_user_id then
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

revoke all on function public.ensure_personal_task_zone() from public, anon;
grant execute on function public.ensure_personal_task_zone() to authenticated;

revoke all on function public.create_personal_quick_task(text, text, text, date, jsonb) from public, anon;
grant execute on function public.create_personal_quick_task(text, text, text, date, jsonb) to authenticated;

revoke all on function public.place_personal_task_on_board(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.place_personal_task_on_board(uuid, uuid, uuid, uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
