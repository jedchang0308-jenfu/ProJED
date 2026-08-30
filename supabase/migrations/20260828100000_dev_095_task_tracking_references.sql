-- DEV-095 expand migration: non-owning task tracking placements.
-- This migration is intentionally forward-only.  It does not move or delete
-- canonical wbs_items; legacy clients continue to use the primary mirror.

-- Existing boards may have a custom capability array.  Add the new action
-- capability only to roles that already have task mutation rights; viewers
-- remain read-only.
update public.board_role_permissions
set capabilities = array_append(capabilities, 'manage_task_reference'), updated_at = now()
where role in ('owner', 'admin', 'project_manager', 'member')
  and 'move_task' = any(capabilities)
  and not ('manage_task_reference' = any(capabilities));

create table if not exists public.wbs_item_placements (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id uuid not null references public.wbs_items(id) on delete cascade,
  project_id uuid not null,
  parent_placement_id uuid,
  parent_scope_key uuid generated always as (coalesce(parent_placement_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  placement_kind text not null check (placement_kind in ('primary', 'tracking_reference')),
  sort_order bigint not null default 0,
  kanban_stage_id text,
  revision bigint not null default 1 check (revision > 0),
  removed_at timestamptz,
  created_by uuid references auth.users(id),
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (placement_kind = 'primary' or created_by is not null),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete cascade,
  unique (tenant_id, project_id, id),
  constraint wbs_item_placements_parent_scope_fk
    foreign key (tenant_id, project_id, parent_placement_id)
      references public.wbs_item_placements(tenant_id, project_id, id)
);

-- Enable RLS before the deferred self-FK backfill below.  PostgreSQL rejects
-- altering a table with pending deferred trigger events in the same
-- transaction, so this ordering keeps the migration atomic on populated TEST
-- databases as well as on empty local databases.
alter table public.wbs_item_placements enable row level security;

-- A cross-board reference moves an entire placement subtree in one RPC
-- transaction.  Deferring this self-FK lets the root project_id update before
-- its children are rewritten, while still enforcing the invariant at commit.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.wbs_item_placements'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%FOREIGN KEY (tenant_id, project_id, parent_placement_id)%'
  loop
    execute format('alter table public.wbs_item_placements drop constraint %I', constraint_name);
  end loop;
  alter table public.wbs_item_placements
    add constraint wbs_item_placements_parent_scope_fk
    foreign key (tenant_id, project_id, parent_placement_id)
    references public.wbs_item_placements(tenant_id, project_id, id)
    deferrable initially deferred;
exception when duplicate_object then null;
end $$;

create unique index if not exists wbs_item_placements_one_active_primary
  on public.wbs_item_placements (tenant_id, task_id)
  where placement_kind = 'primary' and removed_at is null;
create unique index if not exists wbs_item_placements_one_reference_per_scope
  on public.wbs_item_placements (tenant_id, task_id, project_id, parent_scope_key)
  where placement_kind = 'tracking_reference' and removed_at is null;
create index if not exists wbs_item_placements_active_project_order
  on public.wbs_item_placements (tenant_id, project_id, parent_placement_id, sort_order)
  where removed_at is null;
create index if not exists wbs_item_placements_active_task
  on public.wbs_item_placements (tenant_id, task_id)
  where removed_at is null;
-- Canonical visibility is still resolved through wbs_items.  Keep the
-- board-scoped active-task lookup indexed so a large reference projection
-- cannot fall back to a tenant-wide task scan under RLS.
create index if not exists wbs_items_active_project_task
  on public.wbs_items (tenant_id, project_id, id)
  where is_archived = false;
create index if not exists project_members_tenant_project_user
  on public.project_members (tenant_id, project_id, user_id);
create index if not exists tenant_members_tenant_user_status
  on public.tenant_members (tenant_id, user_id, status);

do $$
begin
  alter publication supabase_realtime add table public.wbs_item_placements;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- Backfill primary placements before any reference can be created.  Legacy
-- rows intentionally have created_by = null; the check only requires an actor
-- for newly-created tracking references.
insert into public.wbs_item_placements (tenant_id, task_id, project_id, placement_kind, sort_order, kanban_stage_id, created_at, updated_at)
select wi.tenant_id, wi.id, wi.project_id, 'primary', wi.sort_order, wi.kanban_stage_id, coalesce(wi.created_at, now()), coalesce(wi.updated_at, now())
from public.wbs_items wi
where not exists (
  select 1 from public.wbs_item_placements p
  where p.tenant_id = wi.tenant_id and p.task_id = wi.id and p.placement_kind = 'primary' and p.removed_at is null
);

update public.wbs_item_placements child
set parent_placement_id = parent.id,
    updated_at = now()
from public.wbs_items wi
join public.wbs_item_placements parent
  on parent.tenant_id = wi.tenant_id
 and parent.task_id = wi.parent_id
 and parent.project_id = wi.project_id
 and parent.placement_kind = 'primary'
 and parent.removed_at is null
where child.tenant_id = wi.tenant_id
  and child.task_id = wi.id
  and child.placement_kind = 'primary'
  and child.removed_at is null
  and wi.parent_id is not null
  and child.parent_placement_id is null;

create or replace function private.sync_primary_placement_from_wbs_item()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent_placement uuid;
begin
  select p.id into parent_placement
  from public.wbs_item_placements p
  where p.tenant_id = new.tenant_id and p.task_id = new.parent_id
    and p.project_id = new.project_id and p.placement_kind = 'primary' and p.removed_at is null;
  insert into public.wbs_item_placements (tenant_id, task_id, project_id, parent_placement_id, placement_kind, sort_order, kanban_stage_id, created_by)
  values (new.tenant_id, new.id, new.project_id, parent_placement, 'primary', new.sort_order, new.kanban_stage_id, new.created_by)
  on conflict (tenant_id, task_id) where placement_kind = 'primary' and removed_at is null
  do update set project_id = excluded.project_id, parent_placement_id = excluded.parent_placement_id,
    sort_order = excluded.sort_order, kanban_stage_id = excluded.kanban_stage_id,
    revision = public.wbs_item_placements.revision + 1, updated_at = now(), removed_at = null;
  return new;
end;
$$;

drop trigger if exists wbs_items_sync_primary_placement on public.wbs_items;
create trigger wbs_items_sync_primary_placement
after insert or update of project_id, parent_id, sort_order, kanban_stage_id on public.wbs_items
for each row execute function private.sync_primary_placement_from_wbs_item();

create or replace function private.touch_tracking_reference_revisions()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- Canonical content changes are visible through every projection.  Touch
  -- only active non-owning placements so stale clients fail closed on their
  -- next placement mutation; no placement-local status is introduced.
  if (old.title, old.description, old.detail_notes, old.status, old.assignee_ids,
      old.collaborator_ids, old.start_date, old.end_date, old.is_duration_locked,
      old.item_type, old.is_archived)
     is distinct from
     (new.title, new.description, new.detail_notes, new.status, new.assignee_ids,
      new.collaborator_ids, new.start_date, new.end_date, new.is_duration_locked,
      new.item_type, new.is_archived) then
    update public.wbs_item_placements
    set revision = revision + 1, updated_at = now()
    where tenant_id = new.tenant_id and task_id = new.id
      and placement_kind = 'tracking_reference' and removed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists wbs_items_touch_tracking_reference_revisions on public.wbs_items;
create trigger wbs_items_touch_tracking_reference_revisions
after update on public.wbs_items
for each row execute function private.touch_tracking_reference_revisions();

create table if not exists public.task_tracking_reference_operations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operation_id text not null,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('create', 'move', 'remove', 'restore')),
  request_hash text,
  status text not null check (status in ('committed', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, operation_id)
);

create or replace function private.task_tracking_resolve_placement(target_tenant_id uuid, target_placement_id text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    case when target_placement_id like 'primary:%' then (
      select p.id from public.wbs_item_placements p
      join public.wbs_items wi on wi.id = p.task_id
      where p.tenant_id = target_tenant_id
        and (wi.id::text = substring(target_placement_id from 9) or wi.legacy_node_id = substring(target_placement_id from 9))
        and p.placement_kind = 'primary' and p.removed_at is null
      limit 1
    ) end,
    case when target_placement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then target_placement_id::uuid end
  );
$$;

-- One server-side capability helper is shared by every RPC.  Custom role
-- rows are authoritative; only roles without a custom row use the default
-- matrix.  The helper is intentionally private and uses an empty search path
-- so a caller cannot shadow security-sensitive objects.
create or replace function private.current_user_has_project_capability(
  target_tenant_id uuid,
  target_project_id uuid,
  target_capability text,
  target_user_id uuid default null
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.tenant_members tm
      on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id
    where pm.tenant_id = target_tenant_id
      and pm.project_id = target_project_id
      and pm.user_id = coalesce(target_user_id, (select auth.uid()))
      and tm.status = 'active'
      and (
        exists (
          select 1
          from public.board_role_permissions brp
          where brp.tenant_id = pm.tenant_id
            and brp.project_id = pm.project_id
            and brp.role = pm.role
            and target_capability = any(brp.capabilities)
        )
        or (
          not exists (
            select 1
            from public.board_role_permissions brp
            where brp.tenant_id = pm.tenant_id
              and brp.project_id = pm.project_id
              and brp.role = pm.role
          )
          and (
            target_capability = 'read_board'
            or target_capability = 'manage_task_reference'
              and pm.role in ('owner', 'admin', 'project_manager', 'member')
            or target_capability in ('edit_task', 'move_task')
              and pm.role in ('owner', 'admin', 'project_manager', 'member')
          )
        )
      )
  );
$$;

create or replace function private.task_tracking_request_hash(payload jsonb)
returns text language sql immutable security definer set search_path = ''
as $$
  select encode(extensions.digest(convert_to(coalesce(payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function private.task_tracking_expected_subtree_matches(
  target_tenant_id uuid,
  target_root_id uuid,
  expected_ids uuid[]
)
returns boolean language sql stable security definer set search_path = ''
as $$
  with recursive actual as (
    select p.id
    from public.wbs_item_placements p
    where p.tenant_id = target_tenant_id
      and p.id = target_root_id
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is null
    union all
    select child.id
    from public.wbs_item_placements child
    join actual parent on parent.id = child.parent_placement_id
    where child.tenant_id = target_tenant_id
      and child.placement_kind = 'tracking_reference'
      and child.removed_at is null
  ),
  normalized_actual as (
    select coalesce(array_agg(id order by id), '{}'::uuid[]) as ids from actual
  ),
  normalized_expected as (
    select coalesce(array_agg(id order by id), '{}'::uuid[]) as ids
    from (select distinct id from unnest(coalesce(expected_ids, '{}'::uuid[])) as input_ids(id)) normalized
  )
  select (select ids from normalized_actual) = (select ids from normalized_expected);
$$;

create or replace function private.current_user_can_read_task_via_placement(target_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.wbs_item_placements p
    where p.tenant_id = (select wi.tenant_id from public.wbs_items wi where wi.id = target_task_id)
      and p.task_id = target_task_id
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is null
      and private.current_user_can_read_project(p.tenant_id, p.project_id)
  );
$$;

create or replace function private.current_user_can_write_canonical_task(target_tenant_id uuid, target_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wbs_item_placements p
    where p.tenant_id = target_tenant_id
      and p.task_id = target_task_id
      and p.placement_kind = 'primary'
      and p.removed_at is null
      and private.current_user_has_project_capability(p.tenant_id, p.project_id, 'edit_task')
  );
$$;

create or replace function private.prevent_tracked_task_unplaced()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.wbs_item_placements p
    join public.wbs_items wi on wi.id = p.task_id
    join public.tenants tenant on tenant.id = p.tenant_id
    where (tenant.id::text = new.workspace_id or tenant.legacy_workspace_id = new.workspace_id)
      and (wi.id::text = new.id or wi.legacy_node_id = new.id or wi.id::text = new.task->>'id' or wi.legacy_node_id = new.task->>'id')
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'TRACKING_REFERENCE_BLOCKS_UNPLACED';
  end if;
  return new;
end;
$$;

drop trigger if exists task_tracking_reference_blocks_unplaced on public.task_workbench_unplaced_items;
create trigger task_tracking_reference_blocks_unplaced
before insert or update on public.task_workbench_unplaced_items
for each row execute function private.prevent_tracked_task_unplaced();

drop policy if exists "board readers read wbs items" on public.wbs_items;
create policy "board readers or tracking viewers read wbs items"
on public.wbs_items for select to authenticated
using (
  private.current_user_can_read_project(tenant_id, project_id)
  or private.current_user_can_read_task_via_placement(id)
);

drop policy if exists "board writers update wbs items" on public.wbs_items;
drop policy if exists "canonical board writers update wbs items" on public.wbs_items;
create policy "canonical board writers update wbs items"
on public.wbs_items for update to authenticated
using (private.current_user_can_write_canonical_task(tenant_id, id))
with check (
  private.current_user_can_write_canonical_task(tenant_id, id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, parent_id)
);

alter table public.task_tracking_reference_operations enable row level security;
revoke all on public.wbs_item_placements from authenticated;
revoke all on public.task_tracking_reference_operations from authenticated;
grant select on public.wbs_item_placements to authenticated;
create policy "board readers read active task placements"
on public.wbs_item_placements for select to authenticated
using (removed_at is null and private.current_user_can_read_project(tenant_id, project_id));

create or replace function public.get_task_tracking_reference_capability_v1()
returns jsonb language sql stable security definer set search_path = public
as $$ select jsonb_build_object('supported', true, 'schemaVersion', 1); $$;

create or replace function public.list_task_tracking_references_v1(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.project_id, p.parent_placement_id, p.sort_order, p.id), '[]'::jsonb)
  from public.wbs_item_placements p
  where p.tenant_id = p_tenant_id
    and p.placement_kind = 'tracking_reference'
    and p.removed_at is null
    and private.current_user_can_read_project(p.tenant_id, p.project_id);
$$;

-- Read path used by Board/List/MindMap/Gantt/Calendar consumers.  The result
-- contains placement identity beside the canonical task payload; consumers
-- must key and drag by placement_id while task_id remains canonical.
create or replace function public.get_board_task_projection_v1(
  p_tenant_id uuid,
  p_project_id uuid
)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'placement', to_jsonb(p),
      'task', to_jsonb(wi),
      'placementKind', p.placement_kind,
      'placementId', p.id,
      'taskId', p.task_id
    ) order by p.parent_placement_id, p.sort_order, p.id
  ), '[]'::jsonb)
  from public.wbs_item_placements p
  join public.wbs_items wi on wi.id = p.task_id and wi.tenant_id = p.tenant_id
  where p.tenant_id = p_tenant_id
    and p.project_id = p_project_id
    and p.removed_at is null
    and not wi.is_archived
    and private.current_user_can_read_project(p.tenant_id, p.project_id);
$$;

create or replace function public.create_task_tracking_reference_v1(
  p_operation_id text,
  p_source_primary_placement_id text,
  p_expected_revision bigint,
  p_client_platform text,
  p_tenant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  tenant_id_value uuid := coalesce(p_tenant_id, (select tenant_id from public.wbs_item_placements where id = private.task_tracking_resolve_placement(p_tenant_id, p_source_primary_placement_id)));
  source_row public.wbs_item_placements%rowtype;
  created_row public.wbs_item_placements%rowtype;
  existing_operation public.task_tracking_reference_operations%rowtype;
  request_hash_value text;
  result jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED'; end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if tenant_id_value is null then raise exception 'TENANT_REQUIRED'; end if;
  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'create', 'sourcePlacementId', p_source_primary_placement_id,
    'expectedRevision', p_expected_revision,
    'tenantId', tenant_id_value
  ));
  select * into existing_operation
  from public.task_tracking_reference_operations o
  where o.tenant_id = tenant_id_value and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> auth.uid() or existing_operation.request_hash is distinct from request_hash_value then
      raise exception 'OPERATION_ID_CONFLICT';
    end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;
  select * into source_row from public.wbs_item_placements
  where tenant_id = tenant_id_value and id = private.task_tracking_resolve_placement(tenant_id_value, p_source_primary_placement_id)
    and placement_kind = 'primary' and removed_at is null for update;
  if not found then raise exception 'PRIMARY_PLACEMENT_NOT_FOUND'; end if;
  if not private.current_user_has_project_capability(source_row.tenant_id, source_row.project_id, 'manage_task_reference') then raise exception using errcode = '42501', message = 'PERMISSION_DENIED'; end if;
  if p_expected_revision is not null and p_expected_revision <> source_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if source_row.task_id is null then raise exception 'PRIMARY_TASK_NOT_FOUND'; end if;
  if exists (select 1 from public.wbs_item_placements p where p.tenant_id = source_row.tenant_id and p.task_id = source_row.task_id and p.project_id = source_row.project_id and p.parent_placement_id is not distinct from source_row.parent_placement_id and p.placement_kind = 'tracking_reference' and p.removed_at is null) then
    raise exception 'DUPLICATE_REFERENCE';
  end if;
  -- Insert directly after the source placement.  Shift existing siblings so
  -- the first render is deterministic and remains adjacent to the source.
  update public.wbs_item_placements p
  set sort_order = p.sort_order + 1, revision = p.revision + 1, updated_at = now()
  where p.tenant_id = source_row.tenant_id
    and p.project_id = source_row.project_id
    and p.parent_placement_id is not distinct from source_row.parent_placement_id
    and p.removed_at is null
    and p.sort_order > source_row.sort_order;
  insert into public.wbs_item_placements (tenant_id, task_id, project_id, parent_placement_id, placement_kind, sort_order, kanban_stage_id, created_by)
  values (source_row.tenant_id, source_row.task_id, source_row.project_id, source_row.parent_placement_id, 'tracking_reference', source_row.sort_order + 1, source_row.kanban_stage_id, auth.uid())
  returning * into created_row;
  result := jsonb_build_object('reference', to_jsonb(created_row));
  insert into public.task_tracking_reference_operations (tenant_id, operation_id, actor_id, action, request_hash, status, result)
  values (tenant_id_value, p_operation_id, auth.uid(), 'create', request_hash_value, 'committed', result)
  on conflict (tenant_id, operation_id) do update set result = excluded.result, status = excluded.status, updated_at = now();
  return result;
exception when unique_violation then
  raise exception 'DUPLICATE_REFERENCE';
end;
$$;

create or replace function public.move_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id text,
  p_expected_subtree_ids uuid[],
  p_expected_revision bigint,
  p_target_project_id uuid,
  p_target_parent_placement_id text,
  p_anchor_placement_id text,
  p_position text,
  p_client_platform text,
  p_tenant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  source_row public.wbs_item_placements%rowtype;
  existing_operation public.task_tracking_reference_operations%rowtype;
  target_parent uuid;
  target_anchor public.wbs_item_placements%rowtype;
  target_row public.wbs_item_placements%rowtype;
  request_hash_value text;
  target_order bigint;
  normalized_position text;
  result jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED'; end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if p_tenant_id is null or p_target_project_id is null then raise exception 'TARGET_SCOPE_REQUIRED'; end if;
  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'move', 'referenceRootPlacementId', p_reference_root_placement_id,
    'expectedSubtreeIds', coalesce(p_expected_subtree_ids, '{}'::uuid[]),
    'expectedRevision', p_expected_revision, 'targetProjectId', p_target_project_id,
    'targetParentPlacementId', p_target_parent_placement_id,
    'anchorPlacementId', p_anchor_placement_id, 'position', p_position,
    'tenantId', p_tenant_id
  ));
  select * into existing_operation
  from public.task_tracking_reference_operations o
  where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> auth.uid() or existing_operation.request_hash is distinct from request_hash_value then raise exception 'OPERATION_ID_CONFLICT'; end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;
  select * into source_row from public.wbs_item_placements
  where id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id)
    and tenant_id = p_tenant_id and placement_kind = 'tracking_reference' and removed_at is null
  for update;
  if not found then raise exception 'TRACKING_REFERENCE_NOT_FOUND'; end if;
  if not private.current_user_has_project_capability(source_row.tenant_id, source_row.project_id, 'manage_task_reference') then raise exception using errcode = '42501', message = 'PERMISSION_DENIED'; end if;
  if not private.current_user_has_project_capability(source_row.tenant_id, p_target_project_id, 'manage_task_reference') then raise exception using errcode = '42501', message = 'TARGET_PERMISSION_DENIED'; end if;
  if not exists (select 1 from public.projects p where p.id = p_target_project_id and p.tenant_id = source_row.tenant_id) then raise exception 'CROSS_WORKSPACE_UNSUPPORTED'; end if;
  if p_expected_revision is not null and p_expected_revision <> source_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if not private.task_tracking_expected_subtree_matches(p_tenant_id, source_row.id, p_expected_subtree_ids) then raise exception 'SUBTREE_CHANGED'; end if;
  target_parent := private.task_tracking_resolve_placement(p_tenant_id, p_target_parent_placement_id);
  if target_parent is not null and not exists (
    select 1 from public.wbs_item_placements p
    where p.id = target_parent and p.tenant_id = p_tenant_id and p.project_id = p_target_project_id and p.removed_at is null
      and p.placement_kind in ('primary', 'tracking_reference')
  ) then raise exception 'INVALID_TARGET_PARENT'; end if;
  if target_parent is not null and exists (
    with recursive ancestors as (
      select p.id, p.task_id, p.parent_placement_id
      from public.wbs_item_placements p where p.id = target_parent and p.tenant_id = p_tenant_id
      union all
      select parent.id, parent.task_id, parent.parent_placement_id
      from public.wbs_item_placements parent join ancestors child on child.parent_placement_id = parent.id
      where parent.tenant_id = p_tenant_id
    ) select 1 from ancestors where task_id = source_row.task_id
  ) then raise exception 'CYCLE_DETECTED'; end if;
  normalized_position := case when p_position = 'append' then case when target_parent is null then 'append-root' else 'append-child' end else coalesce(p_position, case when target_parent is null then 'append-root' else 'append-child' end) end;
  if normalized_position not in ('before', 'after', 'append-child', 'append-root') then raise exception 'INVALID_POSITION'; end if;
  if normalized_position in ('append-root', 'append-child') and p_anchor_placement_id is not null then raise exception 'INVALID_ANCHOR'; end if;
  if normalized_position in ('before', 'after') then
    select * into target_anchor from public.wbs_item_placements p
    where p.id = private.task_tracking_resolve_placement(p_tenant_id, p_anchor_placement_id)
      and p.tenant_id = p_tenant_id and p.project_id = p_target_project_id and p.removed_at is null;
    if not found then raise exception 'INVALID_ANCHOR'; end if;
    if target_anchor.parent_placement_id is distinct from target_parent then raise exception 'ANCHOR_SCOPE_MISMATCH'; end if;
    if target_anchor.id = source_row.id or exists (
      with recursive subtree as (
        select id from public.wbs_item_placements where id = source_row.id
        union all select child.id from public.wbs_item_placements child join subtree parent on child.parent_placement_id = parent.id where child.removed_at is null
      ) select 1 from subtree where id = target_anchor.id
    ) then raise exception 'CYCLE_DETECTED'; end if;
  end if;
  if exists (select 1 from public.wbs_item_placements p where p.id <> source_row.id and p.tenant_id = p_tenant_id and p.task_id = source_row.task_id and p.project_id = p_target_project_id and p.parent_placement_id is not distinct from target_parent and p.placement_kind = 'tracking_reference' and p.removed_at is null) then raise exception 'DUPLICATE_REFERENCE'; end if;
  if normalized_position = 'before' then
    target_order := target_anchor.sort_order;
    update public.wbs_item_placements p set sort_order = p.sort_order + 1, revision = p.revision + 1, updated_at = now()
    where p.tenant_id = p_tenant_id and p.project_id = p_target_project_id and p.parent_placement_id is not distinct from target_parent and p.removed_at is null and p.id <> source_row.id and p.sort_order >= target_order;
  elsif normalized_position = 'after' then
    target_order := target_anchor.sort_order + 1;
    update public.wbs_item_placements p set sort_order = p.sort_order + 1, revision = p.revision + 1, updated_at = now()
    where p.tenant_id = p_tenant_id and p.project_id = p_target_project_id and p.parent_placement_id is not distinct from target_parent and p.removed_at is null and p.id <> source_row.id and p.sort_order > target_anchor.sort_order;
  else
    select coalesce(max(p.sort_order) + 1, 0) into target_order
    from public.wbs_item_placements p
    where p.tenant_id = p_tenant_id and p.project_id = p_target_project_id and p.parent_placement_id is not distinct from target_parent and p.removed_at is null;
  end if;
  with recursive subtree as (
    select id from public.wbs_item_placements where id = source_row.id
    union all select child.id from public.wbs_item_placements child join subtree s on child.parent_placement_id = s.id where child.removed_at is null
  )
  update public.wbs_item_placements p
    set project_id = p_target_project_id,
        parent_placement_id = case when p.id = source_row.id then target_parent else p.parent_placement_id end,
        sort_order = case when p.id = source_row.id then target_order else p.sort_order end,
        revision = p.revision + 1, updated_at = now()
  where p.id in (select id from subtree);
  select * into target_row from public.wbs_item_placements where id = source_row.id;
  result := jsonb_build_object('reference', to_jsonb(target_row));
  insert into public.task_tracking_reference_operations (tenant_id, operation_id, actor_id, action, request_hash, status, result)
  values (p_tenant_id, p_operation_id, auth.uid(), 'move', request_hash_value, 'committed', result)
  on conflict (tenant_id, operation_id) do update set result = excluded.result, status = excluded.status, updated_at = now();
  return result;
end;
$$;

create or replace function public.remove_task_tracking_reference_v1(
  p_operation_id text, p_reference_root_placement_id text, p_expected_subtree_ids uuid[], p_expected_revision bigint, p_client_platform text, p_tenant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  source_row public.wbs_item_placements%rowtype;
  result jsonb;
  existing_operation public.task_tracking_reference_operations%rowtype;
  request_hash_value text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED'; end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;
  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'remove', 'referenceRootPlacementId', p_reference_root_placement_id,
    'expectedSubtreeIds', coalesce(p_expected_subtree_ids, '{}'::uuid[]),
    'expectedRevision', p_expected_revision,
    'tenantId', p_tenant_id
  ));
  select * into existing_operation from public.task_tracking_reference_operations o where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> auth.uid() or existing_operation.request_hash is distinct from request_hash_value then raise exception 'OPERATION_ID_CONFLICT'; end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;
  select * into source_row from public.wbs_item_placements where id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id) and tenant_id = p_tenant_id and placement_kind = 'tracking_reference' and removed_at is null for update;
  if not found then raise exception 'TRACKING_REFERENCE_NOT_FOUND'; end if;
  if not private.current_user_has_project_capability(source_row.tenant_id, source_row.project_id, 'manage_task_reference') then raise exception using errcode = '42501', message = 'PERMISSION_DENIED'; end if;
  if p_expected_revision is not null and p_expected_revision <> source_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if not private.task_tracking_expected_subtree_matches(p_tenant_id, source_row.id, p_expected_subtree_ids) then raise exception 'SUBTREE_CHANGED'; end if;
  with recursive subtree as (
    select id from public.wbs_item_placements where id = source_row.id
    union all select child.id from public.wbs_item_placements child join subtree s on child.parent_placement_id = s.id where child.removed_at is null
  ) update public.wbs_item_placements p set removed_at = now(), removed_by = auth.uid(), revision = p.revision + 1, updated_at = now() where p.id in (select id from subtree);
  result := jsonb_build_object('status', 'committed', 'referenceId', source_row.id);
  insert into public.task_tracking_reference_operations (tenant_id, operation_id, actor_id, action, request_hash, status, result)
  values (p_tenant_id, p_operation_id, auth.uid(), 'remove', request_hash_value, 'committed', result)
  on conflict (tenant_id, operation_id) do update set result = excluded.result, status = excluded.status, updated_at = now();
  return result;
end;
$$;

create or replace function public.restore_task_tracking_reference_v1(
  p_operation_id text, p_reference_root_placement_id text, p_expected_revision bigint, p_client_platform text, p_tenant_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  restored_row public.wbs_item_placements%rowtype;
  result jsonb;
  existing_operation public.task_tracking_reference_operations%rowtype;
  request_hash_value text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED'; end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;
  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'restore', 'referenceRootPlacementId', p_reference_root_placement_id,
    'expectedRevision', p_expected_revision,
    'tenantId', p_tenant_id
  ));
  select * into existing_operation from public.task_tracking_reference_operations o where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> auth.uid() or existing_operation.request_hash is distinct from request_hash_value then raise exception 'OPERATION_ID_CONFLICT'; end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;
  select * into restored_row from public.wbs_item_placements where id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id) and tenant_id = p_tenant_id and placement_kind = 'tracking_reference' and removed_at is not null for update;
  if not found then raise exception 'TRACKING_REFERENCE_NOT_FOUND'; end if;
  if not private.current_user_has_project_capability(restored_row.tenant_id, restored_row.project_id, 'manage_task_reference') then raise exception using errcode = '42501', message = 'PERMISSION_DENIED'; end if;
  if p_expected_revision is not null and p_expected_revision <> restored_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if exists (select 1 from public.wbs_item_placements p where p.tenant_id = p_tenant_id and p.task_id = restored_row.task_id and p.project_id = restored_row.project_id and p.parent_placement_id is not distinct from restored_row.parent_placement_id and p.placement_kind = 'tracking_reference' and p.removed_at is null) then raise exception 'DUPLICATE_REFERENCE'; end if;
  with recursive subtree as (
    select p.id from public.wbs_item_placements p where p.id = restored_row.id
    union all select child.id from public.wbs_item_placements child join subtree parent on child.parent_placement_id = parent.id where child.tenant_id = p_tenant_id and child.placement_kind = 'tracking_reference' and child.removed_at is not null
  ) update public.wbs_item_placements p set removed_at = null, removed_by = null, revision = p.revision + 1, updated_at = now() where p.id in (select id from subtree);
  select * into restored_row from public.wbs_item_placements where id = restored_row.id;
  result := jsonb_build_object('reference', to_jsonb(restored_row));
  insert into public.task_tracking_reference_operations (tenant_id, operation_id, actor_id, action, request_hash, status, result)
  values (p_tenant_id, p_operation_id, auth.uid(), 'restore', request_hash_value, 'committed', result)
  on conflict (tenant_id, operation_id) do update set result = excluded.result, status = excluded.status, updated_at = now();
  return result;
end;
$$;

revoke all on function public.get_task_tracking_reference_capability_v1() from public, anon, authenticated, service_role;
revoke all on function public.list_task_tracking_references_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_board_task_projection_v1(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_task_tracking_reference_v1(text, text, bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.move_task_tracking_reference_v1(text, text, uuid[], bigint, uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.restore_task_tracking_reference_v1(text, text, bigint, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_task_tracking_reference_capability_v1() to authenticated;
grant execute on function public.list_task_tracking_references_v1(uuid) to authenticated;
grant execute on function public.get_board_task_projection_v1(uuid, uuid) to authenticated;
grant execute on function public.create_task_tracking_reference_v1(text, text, bigint, text, uuid) to authenticated;
grant execute on function public.move_task_tracking_reference_v1(text, text, uuid[], bigint, uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.remove_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) to authenticated;
grant execute on function public.restore_task_tracking_reference_v1(text, text, bigint, text, uuid) to authenticated;

-- Private policy/RPC helpers are implementation details.  They are not in
-- PostgREST's exposed public schema and must not be callable as public RPCs.
-- RLS expressions still need EXECUTE on their four policy helpers; all other
-- helpers remain callable only from security-definer RPCs/triggers.
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.current_user_can_read_project(uuid, uuid) to authenticated;
grant execute on function private.current_user_can_write_project(uuid, uuid) to authenticated;
grant execute on function private.wbs_item_belongs_to_project(uuid, uuid, uuid) to authenticated;
grant execute on function private.current_user_can_read_task_via_placement(uuid) to authenticated;
grant execute on function private.current_user_can_write_canonical_task(uuid, uuid) to authenticated;
