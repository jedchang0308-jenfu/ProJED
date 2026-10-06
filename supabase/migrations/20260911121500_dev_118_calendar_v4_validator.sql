-- DEV-118: strict v4 Calendar subscription validator.
create or replace function public.calendar_subscription_v4_filter_allowed(filters jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  workspace_ids uuid[];
  project_ids uuid[];
  board_snapshot record;
  snapshot_filters jsonb;
  snapshot_project_id uuid;
  snapshot_tenant_id uuid;
  selected_person text;
  included_board_count integer := 0;
  requires_manage boolean;
  upcoming_days numeric;
begin
  if auth.uid() is null
    or jsonb_typeof(filters) <> 'object'
    or filters ->> 'version' <> '4'
    or filters ->> 'v4_scope_type' <> 'per_board_filter_snapshot' then
    return false;
  end if;

  if filters ? 'assignee'
    or filters ? 'global_filter'
    or filters ? 'board_overrides'
    or filters ? 'date_types'
    or filters ? 'scope_type'
    or filters ? 'v2_scope_type'
    or filters ? 'v3_scope_type' then
    return false;
  end if;

  if jsonb_typeof(filters -> 'workspace_ids') <> 'array'
    or jsonb_array_length(filters -> 'workspace_ids') = 0
    or jsonb_typeof(filters -> 'project_ids') <> 'array'
    or jsonb_array_length(filters -> 'project_ids') = 0
    or jsonb_typeof(filters -> 'board_filters') <> 'object' then
    return false;
  end if;

  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into workspace_ids
  from jsonb_array_elements_text(filters -> 'workspace_ids') as value;
  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into project_ids
  from jsonb_array_elements_text(filters -> 'project_ids') as value;

  if cardinality(workspace_ids) <> jsonb_array_length(filters -> 'workspace_ids')
    or cardinality(project_ids) <> jsonb_array_length(filters -> 'project_ids')
    or cardinality(project_ids) <> (select count(*) from jsonb_each(filters -> 'board_filters')) then
    return false;
  end if;

  if exists (
    select 1 from unnest(workspace_ids) workspace_id
    where not public.current_user_is_tenant_member(workspace_id)
  ) then return false; end if;

  if exists (
    select 1 from unnest(project_ids) project_id
    left join public.projects p on p.id = project_id
    where p.id is null
      or p.tenant_id <> all(workspace_ids)
      or not private.current_user_can_read_project(p.tenant_id, p.id)
  ) then return false; end if;

  for board_snapshot in
    select key, value from jsonb_each(filters -> 'board_filters')
  loop
    snapshot_project_id := board_snapshot.key::uuid;
    if snapshot_project_id <> all(project_ids)
      or jsonb_typeof(board_snapshot.value) <> 'object'
      or jsonb_typeof(board_snapshot.value -> 'included') <> 'boolean'
      or jsonb_typeof(board_snapshot.value -> 'date_types') <> 'array'
      or jsonb_typeof(board_snapshot.value -> 'filters') <> 'object' then
      return false;
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(board_snapshot.value -> 'date_types') date_type
      where date_type not in ('start_date', 'due_date')
    ) then return false; end if;

    snapshot_filters := board_snapshot.value -> 'filters';
    if jsonb_typeof(snapshot_filters -> 'statuses') <> 'array'
      or jsonb_typeof(snapshot_filters -> 'due') <> 'object'
      or jsonb_typeof(snapshot_filters -> 'people') <> 'object'
      or jsonb_typeof(snapshot_filters -> 'tagIds') <> 'array'
      or jsonb_typeof(snapshot_filters -> 'keyword') <> 'string'
      or jsonb_typeof(snapshot_filters -> 'due' -> 'includeOverdue') <> 'boolean'
      or (snapshot_filters -> 'due' ? 'upcomingWithinDays'
        and jsonb_typeof(snapshot_filters -> 'due' -> 'upcomingWithinDays') not in ('number', 'null'))
      or jsonb_typeof(snapshot_filters -> 'people' -> 'ids') <> 'array'
      or jsonb_typeof(snapshot_filters -> 'people' -> 'includeUnassigned') <> 'boolean' then
      return false;
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(snapshot_filters -> 'statuses') status_value
      where status_value not in ('todo', 'in_progress', 'onhold', 'completed')
    ) then return false; end if;

    upcoming_days := nullif(snapshot_filters -> 'due' ->> 'upcomingWithinDays', '')::numeric;
    if upcoming_days is not null and (upcoming_days < 0 or upcoming_days > 365 or upcoming_days <> trunc(upcoming_days)) then
      return false;
    end if;

    select p.tenant_id into snapshot_tenant_id
    from public.projects p where p.id = snapshot_project_id;

    for selected_person in
      select value from jsonb_array_elements_text(snapshot_filters -> 'people' -> 'ids') value
    loop
      if selected_person::uuid is null then return false; end if;
      if not exists (
        select 1 from public.tenant_members tm
        where tm.tenant_id = snapshot_tenant_id
          and tm.user_id = selected_person::uuid
          and tm.status = 'active'
      ) then return false; end if;
    end loop;

    if (board_snapshot.value ->> 'included')::boolean then
      if jsonb_array_length(board_snapshot.value -> 'date_types') = 0 then return false; end if;
      included_board_count := included_board_count + 1;
      requires_manage := jsonb_array_length(snapshot_filters -> 'people' -> 'ids') = 0
        or (snapshot_filters -> 'people' ->> 'includeUnassigned')::boolean
        or exists (
          select 1 from jsonb_array_elements_text(snapshot_filters -> 'people' -> 'ids') value
          where value::uuid <> auth.uid()
        );
      if requires_manage
        and not private.current_user_can_manage_project(snapshot_tenant_id, snapshot_project_id) then
        return false;
      end if;
    end if;
  end loop;

  return included_board_count > 0;
exception
  when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function public.calendar_subscription_filter_allowed(filters jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when filters ->> 'version' = '4'
      or filters ->> 'v4_scope_type' = 'per_board_filter_snapshot'
      then public.calendar_subscription_v4_filter_allowed(filters)
    when filters ->> 'version' = '3'
      or filters ->> 'v3_scope_type' = 'per_board_filter_snapshot'
      then public.calendar_subscription_v3_filter_allowed(filters)
    else public.calendar_subscription_v1_v2_filter_allowed(filters)
  end;
$$;

revoke execute on function public.calendar_subscription_v4_filter_allowed(jsonb) from public, anon;
grant execute on function public.calendar_subscription_v4_filter_allowed(jsonb) to authenticated;
