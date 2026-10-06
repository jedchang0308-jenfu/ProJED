-- DEV-100: account-owned staging for non-owning tracking placements.
-- Canonical wbs_items never enter task_workbench_unplaced_items. A staged
-- reference keeps its placement subtree soft-removed until it is atomically
-- placed on another Board.

create table public.task_tracking_reference_staging (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reference_root_placement_id uuid not null references public.wbs_item_placements(id) on delete cascade,
  original_project_id uuid not null,
  original_parent_placement_id uuid references public.wbs_item_placements(id),
  original_sort_order bigint not null,
  subtree_ids uuid[] not null,
  sort_order bigint not null default 0,
  staged_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, owner_id, reference_root_placement_id),
  unique (tenant_id, reference_root_placement_id),
  foreign key (tenant_id, original_project_id)
    references public.projects(tenant_id, id) on delete cascade,
  check (cardinality(subtree_ids) > 0),
  check (reference_root_placement_id = any(subtree_ids))
);

create index task_tracking_reference_staging_owner_order_idx
  on public.task_tracking_reference_staging (owner_id, tenant_id, sort_order);
create index task_tracking_reference_staging_original_project_idx
  on public.task_tracking_reference_staging (tenant_id, original_project_id);
create index task_tracking_reference_staging_original_parent_idx
  on public.task_tracking_reference_staging (original_parent_placement_id)
  where original_parent_placement_id is not null;

alter table public.task_tracking_reference_staging enable row level security;
revoke all on table public.task_tracking_reference_staging from public, anon, authenticated;

alter table public.task_tracking_reference_operations
  drop constraint if exists task_tracking_reference_operations_action_check;
alter table public.task_tracking_reference_operations
  add constraint task_tracking_reference_operations_action_check
  check (action in ('create', 'move', 'stage', 'place_staged', 'remove', 'restore'));

create or replace function public.get_task_tracking_reference_capability_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('supported', true, 'schemaVersion', 2);
$$;

create or replace function private.current_user_can_read_task_via_placement(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wbs_item_placements p
    where p.tenant_id = (select wi.tenant_id from public.wbs_items wi where wi.id = target_task_id)
      and p.task_id = target_task_id
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is null
      and private.current_user_can_read_project(p.tenant_id, p.project_id)
  ) or exists (
    select 1
    from public.task_tracking_reference_staging s
    join public.wbs_item_placements p
      on p.id = s.reference_root_placement_id and p.tenant_id = s.tenant_id
    join public.tenant_members tm
      on tm.tenant_id = s.tenant_id and tm.user_id = s.owner_id and tm.status = 'active'
    where p.task_id = target_task_id
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function private.task_tracking_staged_subtree_matches(
  target_tenant_id uuid,
  target_root_id uuid,
  expected_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive actual as (
    select p.id
    from public.wbs_item_placements p
    where p.tenant_id = target_tenant_id
      and p.id = target_root_id
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is not null
    union all
    select child.id
    from public.wbs_item_placements child
    join actual parent on parent.id = child.parent_placement_id
    where child.tenant_id = target_tenant_id
      and child.placement_kind = 'tracking_reference'
      and child.removed_at is not null
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

create or replace function public.list_task_tracking_reference_staging_v1(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('staging', to_jsonb(s), 'reference', to_jsonb(p))
    order by s.sort_order, s.reference_root_placement_id
  ), '[]'::jsonb)
  from public.task_tracking_reference_staging s
  join public.wbs_item_placements p
    on p.id = s.reference_root_placement_id and p.tenant_id = s.tenant_id
  join public.tenant_members tm
    on tm.tenant_id = s.tenant_id and tm.user_id = s.owner_id and tm.status = 'active'
  where s.tenant_id = p_tenant_id
    and s.owner_id = (select auth.uid())
    and p.placement_kind = 'tracking_reference'
    and p.removed_at is not null;
$$;

create or replace function public.stage_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id text,
  p_expected_subtree_ids uuid[],
  p_expected_revision bigint,
  p_client_platform text,
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.wbs_item_placements%rowtype;
  staged_row public.task_tracking_reference_staging%rowtype;
  existing_operation public.task_tracking_reference_operations%rowtype;
  request_hash_value text;
  target_order bigint;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;

  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'stage',
    'referenceRootPlacementId', p_reference_root_placement_id,
    'expectedSubtreeIds', coalesce(p_expected_subtree_ids, '{}'::uuid[]),
    'expectedRevision', p_expected_revision,
    'tenantId', p_tenant_id
  ));
  select * into existing_operation
  from public.task_tracking_reference_operations o
  where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> (select auth.uid())
      or existing_operation.request_hash is distinct from request_hash_value then
      raise exception 'OPERATION_ID_CONFLICT';
    end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;

  select * into source_row
  from public.wbs_item_placements p
  where p.id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id)
    and p.tenant_id = p_tenant_id
    and p.placement_kind = 'tracking_reference'
    and p.removed_at is null
  for update;
  if not found then raise exception 'TRACKING_REFERENCE_NOT_FOUND'; end if;
  if not private.current_user_has_project_capability(source_row.tenant_id, source_row.project_id, 'manage_task_reference') then
    raise exception using errcode = '42501', message = 'PERMISSION_DENIED';
  end if;
  if p_expected_revision is not null and p_expected_revision <> source_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if not private.task_tracking_expected_subtree_matches(p_tenant_id, source_row.id, p_expected_subtree_ids) then
    raise exception 'SUBTREE_CHANGED';
  end if;
  if exists (
    select 1 from public.task_tracking_reference_staging s
    where s.tenant_id = p_tenant_id and s.reference_root_placement_id = source_row.id
  ) then raise exception 'REFERENCE_ALREADY_STAGED'; end if;

  select coalesce(max(s.sort_order) + 1, 0) into target_order
  from public.task_tracking_reference_staging s
  where s.tenant_id = p_tenant_id and s.owner_id = (select auth.uid());

  insert into public.task_tracking_reference_staging (
    tenant_id,
    owner_id,
    reference_root_placement_id,
    original_project_id,
    original_parent_placement_id,
    original_sort_order,
    subtree_ids,
    sort_order
  ) values (
    p_tenant_id,
    (select auth.uid()),
    source_row.id,
    source_row.project_id,
    source_row.parent_placement_id,
    source_row.sort_order,
    p_expected_subtree_ids,
    target_order
  ) returning * into staged_row;

  with recursive subtree as (
    select p.id
    from public.wbs_item_placements p
    where p.id = source_row.id
    union all
    select child.id
    from public.wbs_item_placements child
    join subtree parent on child.parent_placement_id = parent.id
    where child.tenant_id = p_tenant_id
      and child.placement_kind = 'tracking_reference'
      and child.removed_at is null
  )
  update public.wbs_item_placements p
  set removed_at = now(),
      removed_by = (select auth.uid()),
      revision = p.revision + 1,
      updated_at = now()
  where p.id in (select id from subtree);

  select * into source_row from public.wbs_item_placements p where p.id = source_row.id;
  result := jsonb_build_object('staging', to_jsonb(staged_row), 'reference', to_jsonb(source_row));
  insert into public.task_tracking_reference_operations (
    tenant_id, operation_id, actor_id, action, request_hash, status, result
  ) values (
    p_tenant_id, p_operation_id, (select auth.uid()), 'stage', request_hash_value, 'committed', result
  );
  return result;
exception when unique_violation then
  raise exception 'REFERENCE_ALREADY_STAGED';
end;
$$;

create or replace function public.place_staged_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id text,
  p_expected_revision bigint,
  p_target_project_id uuid,
  p_target_parent_placement_id text,
  p_anchor_placement_id text,
  p_position text,
  p_client_platform text,
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staged_row public.task_tracking_reference_staging%rowtype;
  source_row public.wbs_item_placements%rowtype;
  target_anchor public.wbs_item_placements%rowtype;
  target_row public.wbs_item_placements%rowtype;
  existing_operation public.task_tracking_reference_operations%rowtype;
  target_parent uuid;
  target_order bigint;
  normalized_position text;
  request_hash_value text;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then raise exception 'OPERATION_ID_REQUIRED'; end if;
  if p_tenant_id is null or p_target_project_id is null then raise exception 'TARGET_SCOPE_REQUIRED'; end if;

  request_hash_value := private.task_tracking_request_hash(jsonb_build_object(
    'action', 'place_staged',
    'referenceRootPlacementId', p_reference_root_placement_id,
    'expectedRevision', p_expected_revision,
    'targetProjectId', p_target_project_id,
    'targetParentPlacementId', p_target_parent_placement_id,
    'anchorPlacementId', p_anchor_placement_id,
    'position', p_position,
    'tenantId', p_tenant_id
  ));
  select * into existing_operation
  from public.task_tracking_reference_operations o
  where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> (select auth.uid())
      or existing_operation.request_hash is distinct from request_hash_value then
      raise exception 'OPERATION_ID_CONFLICT';
    end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;

  select * into staged_row
  from public.task_tracking_reference_staging s
  where s.tenant_id = p_tenant_id
    and s.owner_id = (select auth.uid())
    and s.reference_root_placement_id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id)
  for update;
  if not found then raise exception 'STAGED_REFERENCE_NOT_FOUND'; end if;

  select * into source_row
  from public.wbs_item_placements p
  where p.id = staged_row.reference_root_placement_id
    and p.tenant_id = p_tenant_id
    and p.placement_kind = 'tracking_reference'
    and p.removed_at is not null
  for update;
  if not found then raise exception 'STAGED_REFERENCE_NOT_FOUND'; end if;
  if p_expected_revision is not null and p_expected_revision <> source_row.revision then raise exception 'REVISION_CONFLICT'; end if;
  if not private.task_tracking_staged_subtree_matches(p_tenant_id, source_row.id, staged_row.subtree_ids) then
    raise exception 'SUBTREE_CHANGED';
  end if;
  if not private.current_user_has_project_capability(p_tenant_id, p_target_project_id, 'manage_task_reference') then
    raise exception using errcode = '42501', message = 'TARGET_PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.projects p where p.tenant_id = p_tenant_id and p.id = p_target_project_id
  ) then raise exception 'CROSS_WORKSPACE_UNSUPPORTED'; end if;

  target_parent := private.task_tracking_resolve_placement(p_tenant_id, p_target_parent_placement_id);
  if target_parent is not null and not exists (
    select 1
    from public.wbs_item_placements p
    where p.id = target_parent
      and p.tenant_id = p_tenant_id
      and p.project_id = p_target_project_id
      and p.removed_at is null
      and p.placement_kind in ('primary', 'tracking_reference')
  ) then raise exception 'INVALID_TARGET_PARENT'; end if;
  if target_parent is not null and exists (
    with recursive ancestors as (
      select p.id, p.task_id, p.parent_placement_id
      from public.wbs_item_placements p
      where p.id = target_parent and p.tenant_id = p_tenant_id and p.removed_at is null
      union all
      select parent.id, parent.task_id, parent.parent_placement_id
      from public.wbs_item_placements parent
      join ancestors child on child.parent_placement_id = parent.id
      where parent.tenant_id = p_tenant_id and parent.removed_at is null
    ) select 1 from ancestors where task_id = source_row.task_id
  ) then raise exception 'CYCLE_DETECTED'; end if;

  normalized_position := case
    when p_position = 'append' then case when target_parent is null then 'append-root' else 'append-child' end
    else coalesce(p_position, case when target_parent is null then 'append-root' else 'append-child' end)
  end;
  if normalized_position not in ('before', 'after', 'append-child', 'append-root') then raise exception 'INVALID_POSITION'; end if;
  if normalized_position in ('append-root', 'append-child') and p_anchor_placement_id is not null then raise exception 'INVALID_ANCHOR'; end if;
  if normalized_position in ('before', 'after') then
    select * into target_anchor
    from public.wbs_item_placements p
    where p.id = private.task_tracking_resolve_placement(p_tenant_id, p_anchor_placement_id)
      and p.tenant_id = p_tenant_id
      and p.project_id = p_target_project_id
      and p.removed_at is null
    for update;
    if not found then raise exception 'INVALID_ANCHOR'; end if;
    if target_anchor.parent_placement_id is distinct from target_parent then raise exception 'ANCHOR_SCOPE_MISMATCH'; end if;
  end if;

  if exists (
    select 1 from public.wbs_item_placements p
    where p.tenant_id = p_tenant_id
      and p.task_id = source_row.task_id
      and p.project_id = p_target_project_id
      and p.parent_placement_id is not distinct from target_parent
      and p.placement_kind = 'tracking_reference'
      and p.removed_at is null
  ) then raise exception 'DUPLICATE_REFERENCE'; end if;

  if normalized_position = 'before' then
    target_order := target_anchor.sort_order;
    update public.wbs_item_placements p
    set sort_order = p.sort_order + 1, revision = p.revision + 1, updated_at = now()
    where p.tenant_id = p_tenant_id
      and p.project_id = p_target_project_id
      and p.parent_placement_id is not distinct from target_parent
      and p.removed_at is null
      and p.sort_order >= target_order;
  elsif normalized_position = 'after' then
    target_order := target_anchor.sort_order + 1;
    update public.wbs_item_placements p
    set sort_order = p.sort_order + 1, revision = p.revision + 1, updated_at = now()
    where p.tenant_id = p_tenant_id
      and p.project_id = p_target_project_id
      and p.parent_placement_id is not distinct from target_parent
      and p.removed_at is null
      and p.sort_order > target_anchor.sort_order;
  else
    select coalesce(max(p.sort_order) + 1, 0) into target_order
    from public.wbs_item_placements p
    where p.tenant_id = p_tenant_id
      and p.project_id = p_target_project_id
      and p.parent_placement_id is not distinct from target_parent
      and p.removed_at is null;
  end if;

  with recursive subtree as (
    select p.id
    from public.wbs_item_placements p
    where p.id = source_row.id
    union all
    select child.id
    from public.wbs_item_placements child
    join subtree parent on child.parent_placement_id = parent.id
    where child.tenant_id = p_tenant_id
      and child.placement_kind = 'tracking_reference'
      and child.removed_at is not null
  )
  update public.wbs_item_placements p
  set project_id = p_target_project_id,
      parent_placement_id = case when p.id = source_row.id then target_parent else p.parent_placement_id end,
      sort_order = case when p.id = source_row.id then target_order else p.sort_order end,
      removed_at = null,
      removed_by = null,
      revision = p.revision + 1,
      updated_at = now()
  where p.id in (select id from subtree);

  delete from public.task_tracking_reference_staging s
  where s.tenant_id = staged_row.tenant_id
    and s.owner_id = staged_row.owner_id
    and s.reference_root_placement_id = staged_row.reference_root_placement_id;

  select * into target_row from public.wbs_item_placements p where p.id = source_row.id;
  result := jsonb_build_object('reference', to_jsonb(target_row));
  insert into public.task_tracking_reference_operations (
    tenant_id, operation_id, actor_id, action, request_hash, status, result
  ) values (
    p_tenant_id, p_operation_id, (select auth.uid()), 'place_staged', request_hash_value, 'committed', result
  );
  return result;
end;
$$;

-- Ordinary remove/restore is still used by undo and context-menu removal. A
-- staged placement must only be reactivated through the target-validating
-- place_staged RPC so it cannot bypass destination permissions.
create or replace function public.restore_task_tracking_reference_v1(
  p_operation_id text,
  p_reference_root_placement_id text,
  p_expected_revision bigint,
  p_client_platform text,
  p_tenant_id uuid default null
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
    'expectedRevision', p_expected_revision, 'tenantId', p_tenant_id
  ));
  select * into existing_operation from public.task_tracking_reference_operations o where o.tenant_id = p_tenant_id and o.operation_id = p_operation_id;
  if found then
    if existing_operation.actor_id <> auth.uid() or existing_operation.request_hash is distinct from request_hash_value then raise exception 'OPERATION_ID_CONFLICT'; end if;
    if existing_operation.status = 'committed' then return existing_operation.result; end if;
    raise exception 'OPERATION_REPLAY_FAILED';
  end if;
  select * into restored_row from public.wbs_item_placements
  where id = private.task_tracking_resolve_placement(p_tenant_id, p_reference_root_placement_id)
    and tenant_id = p_tenant_id and placement_kind = 'tracking_reference' and removed_at is not null
  for update;
  if not found then raise exception 'TRACKING_REFERENCE_NOT_FOUND'; end if;
  if exists (
    select 1 from public.task_tracking_reference_staging s
    where s.tenant_id = p_tenant_id and s.reference_root_placement_id = restored_row.id
  ) then raise exception 'TRACKING_REFERENCE_STAGED'; end if;
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

revoke execute on function public.list_task_tracking_reference_staging_v1(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.stage_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.place_staged_task_tracking_reference_v1(text, text, bigint, uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_task_tracking_reference_staging_v1(uuid) to authenticated;
grant execute on function public.stage_task_tracking_reference_v1(text, text, uuid[], bigint, text, uuid) to authenticated;
grant execute on function public.place_staged_task_tracking_reference_v1(text, text, bigint, uuid, text, text, text, text, uuid) to authenticated;

revoke all on function private.task_tracking_staged_subtree_matches(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
