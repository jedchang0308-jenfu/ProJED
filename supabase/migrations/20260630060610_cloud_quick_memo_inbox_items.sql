-- DEV-039: Cloud quick memo inbox items and atomic promotion to WBS task.

create table if not exists public.inbox_items (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_mutation_id text not null,
  title text not null,
  raw_text text not null,
  detail_text text,
  item_type text not null default 'todo',
  capture_status text not null default 'untriaged',
  source_workspace_id uuid references public.tenants(id) on delete set null,
  source_project_id uuid references public.projects(id) on delete set null,
  suggested_due_date date,
  confirmed_due_date date,
  promotion_client_mutation_id text,
  promoted_task_node_id uuid references public.wbs_items(id) on delete set null,
  promoted_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_mutation_id),
  unique (owner_id, promotion_client_mutation_id),
  check (item_type in ('todo', 'note', 'someday')),
  check (capture_status in ('untriaged', 'promoted', 'completed', 'archived')),
  check (
    (capture_status = 'promoted' and promoted_task_node_id is not null and promoted_at is not null)
    or capture_status <> 'promoted'
  )
);

create index if not exists inbox_items_owner_status_created_idx
  on public.inbox_items(owner_id, capture_status, created_at desc);

create index if not exists inbox_items_promoted_task_idx
  on public.inbox_items(promoted_task_node_id)
  where promoted_task_node_id is not null;

create trigger inbox_items_touch_updated_at
before update on public.inbox_items
for each row execute function public.touch_updated_at();

alter table public.inbox_items enable row level security;

drop policy if exists "owners read inbox items" on public.inbox_items;
drop policy if exists "owners insert inbox items" on public.inbox_items;
drop policy if exists "owners update inbox items" on public.inbox_items;
drop policy if exists "owners delete inbox items" on public.inbox_items;

create policy "owners read inbox items"
on public.inbox_items for select to authenticated
using (owner_id = (select auth.uid()));

create policy "owners insert inbox items"
on public.inbox_items for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "owners update inbox items"
on public.inbox_items for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "owners delete inbox items"
on public.inbox_items for delete to authenticated
using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.inbox_items to authenticated;

create or replace function public.promote_inbox_item_to_task(
  p_inbox_item_id uuid,
  p_target_project_id uuid,
  p_target_parent_id uuid default null,
  p_insert_before_id uuid default null,
  p_insert_after_id uuid default null,
  p_promotion_client_mutation_id text default null,
  p_title text default null,
  p_description text default null,
  p_confirmed_due_date date default null
)
returns table (
  task_node_id uuid,
  inbox_item_id uuid,
  capture_status text,
  promoted_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_item public.inbox_items%rowtype;
  v_project public.projects%rowtype;
  v_parent_id uuid;
  v_insert_before public.wbs_items%rowtype;
  v_insert_after public.wbs_items%rowtype;
  v_sort_order bigint;
  v_task_title text;
  v_task_description text;
  v_task_id uuid;
  v_promoted_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to promote a memo.';
  end if;

  if p_promotion_client_mutation_id is null or btrim(p_promotion_client_mutation_id) = '' then
    raise exception 'promotion_client_mutation_id is required.';
  end if;

  if p_insert_before_id is not null and p_insert_after_id is not null then
    raise exception 'Only one insert boundary may be provided.';
  end if;

  select *
    into v_project
    from public.projects
   where id = p_target_project_id;

  if v_project.id is null then
    raise exception 'Target board was not found.';
  end if;

  if not private.current_user_can_write_project(v_project.tenant_id, v_project.id) then
    raise exception 'You do not have permission to create tasks on this board.';
  end if;

  select *
    into v_item
    from public.inbox_items
   where id = p_inbox_item_id
   for update;

  if v_item.id is null then
    raise exception 'Memo item was not found.';
  end if;

  if v_item.owner_id <> (select auth.uid()) then
    raise exception 'Memo item belongs to another user.';
  end if;

  if v_item.capture_status = 'promoted' then
    if v_item.promotion_client_mutation_id = p_promotion_client_mutation_id then
      task_node_id := v_item.promoted_task_node_id;
      inbox_item_id := v_item.id;
      capture_status := v_item.capture_status;
      promoted_at := v_item.promoted_at;
      return next;
      return;
    end if;

    raise exception 'Memo item has already been promoted.';
  end if;

  if v_item.capture_status <> 'untriaged' then
    raise exception 'Only untriaged memo items can be promoted.';
  end if;

  if p_target_parent_id is not null then
    if not exists (
      select 1
        from public.wbs_items wi
       where wi.id = p_target_parent_id
         and wi.tenant_id = v_project.tenant_id
         and wi.project_id = v_project.id
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
       and wi.tenant_id = v_project.tenant_id
       and wi.project_id = v_project.id;

    if v_insert_before.id is null then
      raise exception 'Insert-before task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_before.parent_id;
    v_sort_order := v_insert_before.sort_order;

    update public.wbs_items wi
       set sort_order = wi.sort_order + 1
     where wi.tenant_id = v_project.tenant_id
       and wi.project_id = v_project.id
       and wi.parent_id is not distinct from v_parent_id
       and wi.sort_order >= v_sort_order;
  elsif p_insert_after_id is not null then
    select *
      into v_insert_after
      from public.wbs_items wi
     where wi.id = p_insert_after_id
       and wi.tenant_id = v_project.tenant_id
       and wi.project_id = v_project.id;

    if v_insert_after.id is null then
      raise exception 'Insert-after task does not belong to the target board.';
    end if;

    v_parent_id := v_insert_after.parent_id;
    v_sort_order := v_insert_after.sort_order + 1;

    update public.wbs_items wi
       set sort_order = wi.sort_order + 1
     where wi.tenant_id = v_project.tenant_id
       and wi.project_id = v_project.id
       and wi.parent_id is not distinct from v_parent_id
       and wi.sort_order >= v_sort_order;
  else
    select coalesce(max(wi.sort_order), -1) + 1
      into v_sort_order
      from public.wbs_items wi
     where wi.tenant_id = v_project.tenant_id
       and wi.project_id = v_project.id
       and wi.parent_id is not distinct from v_parent_id;
  end if;

  v_task_title := coalesce(nullif(btrim(p_title), ''), v_item.title);
  v_task_description := nullif(coalesce(p_description, v_item.detail_text, v_item.raw_text), '');

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
    v_project.tenant_id,
    v_project.id,
    v_parent_id,
    v_task_title,
    v_task_description,
    'todo',
    p_confirmed_due_date,
    'task',
    v_sort_order,
    (select auth.uid()),
    (select auth.uid()),
    jsonb_build_object('source', 'quick_memo', 'inbox_item_id', v_item.id)
  )
  returning id into v_task_id;

  update public.inbox_items
     set capture_status = 'promoted',
         promotion_client_mutation_id = p_promotion_client_mutation_id,
         promoted_task_node_id = v_task_id,
         promoted_at = v_promoted_at,
         confirmed_due_date = coalesce(p_confirmed_due_date, confirmed_due_date),
         updated_at = v_promoted_at
   where id = v_item.id;

  task_node_id := v_task_id;
  inbox_item_id := v_item.id;
  capture_status := 'promoted';
  promoted_at := v_promoted_at;
  return next;
end;
$$;

revoke all on function public.promote_inbox_item_to_task(
  uuid, uuid, uuid, uuid, uuid, text, text, text, date
) from public, anon;
grant execute on function public.promote_inbox_item_to_task(
  uuid, uuid, uuid, uuid, uuid, text, text, text, date
) to authenticated;

notify pgrst, 'reload schema';;
