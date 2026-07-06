-- Add calendar subscription source-scope validation.
-- Existing filters_json stays backward compatible; missing scope_type is legacy workspace scope.

create or replace function public.calendar_subscription_filter_allowed(filters jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  workspace_ids uuid[];
  project_ids uuid[] := '{}'::uuid[];
  scope_type text;
  assignee_type text;
  assignee_user_id uuid;
  assignee_user_ids uuid[];
  include_unassigned boolean := false;
  requires_admin boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  if jsonb_typeof(filters) <> 'object' then
    return false;
  end if;

  scope_type := coalesce(nullif(filters ->> 'scope_type', ''), 'workspace');
  if scope_type not in ('board', 'workspace', 'custom') then
    return false;
  end if;

  if jsonb_typeof(filters -> 'workspace_ids') <> 'array'
    or jsonb_array_length(filters -> 'workspace_ids') = 0 then
    return false;
  end if;

  if jsonb_typeof(filters -> 'date_types') <> 'array'
    or jsonb_array_length(filters -> 'date_types') = 0 then
    return false;
  end if;

  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into workspace_ids
  from jsonb_array_elements_text(filters -> 'workspace_ids') as value;

  if cardinality(workspace_ids) = 0 then
    return false;
  end if;

  if exists (
    select 1
    from unnest(workspace_ids) as workspace_id
    where not public.current_user_is_tenant_member(workspace_id)
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(filters -> 'date_types') as date_type
    where date_type not in ('start_date', 'due_date')
  ) then
    return false;
  end if;

  if filters ? 'project_ids' then
    if jsonb_typeof(filters -> 'project_ids') <> 'array'
      or jsonb_array_length(filters -> 'project_ids') = 0 then
      return false;
    end if;

    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
      into project_ids
    from jsonb_array_elements_text(filters -> 'project_ids') as value;

    if cardinality(project_ids) = 0 then
      return false;
    end if;
  end if;

  if scope_type = 'workspace' and cardinality(project_ids) > 0 then
    return false;
  end if;

  if scope_type = 'board' and cardinality(project_ids) <> 1 then
    return false;
  end if;

  if cardinality(project_ids) > 0 and exists (
    select 1
    from unnest(project_ids) as project_id
    left join public.projects p
      on p.id = project_id
    where p.id is null
      or p.tenant_id <> all(workspace_ids)
      or not private.current_user_can_read_project(p.tenant_id, p.id)
  ) then
    return false;
  end if;

  assignee_type := filters #>> '{assignee,type}';

  if assignee_type = 'me' then
    return true;
  end if;

  if assignee_type = 'user' then
    assignee_user_id := (filters #>> '{assignee,user_id}')::uuid;

    if assignee_user_id = auth.uid() then
      return true;
    end if;

    requires_admin := true;
  elsif assignee_type = 'selected' then
    if jsonb_typeof(filters #> '{assignee,user_ids}') <> 'array' then
      return false;
    end if;

    if (filters #> '{assignee,include_unassigned}') is not null
      and jsonb_typeof(filters #> '{assignee,include_unassigned}') <> 'boolean' then
      return false;
    end if;

    include_unassigned := coalesce((filters #>> '{assignee,include_unassigned}')::boolean, false);

    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
      into assignee_user_ids
    from jsonb_array_elements_text(filters #> '{assignee,user_ids}') as value;

    if cardinality(assignee_user_ids) = 0 and not include_unassigned then
      return false;
    end if;

    requires_admin := include_unassigned or exists (
      select 1
      from unnest(assignee_user_ids) as selected_assignee_user_id
      where selected_assignee_user_id <> auth.uid()
    );
  else
    return false;
  end if;

  if requires_admin then
    if cardinality(project_ids) > 0 then
      if exists (
        select 1
        from unnest(project_ids) as project_id
        join public.projects p
          on p.id = project_id
        where not private.current_user_can_manage_project(p.tenant_id, p.id)
      ) then
        return false;
      end if;
    elsif exists (
      select 1
      from unnest(workspace_ids) as workspace_id
      where not public.current_user_has_tenant_role(
        workspace_id,
        array['owner','admin','project_manager']::public.tenant_role[]
      )
    ) then
      return false;
    end if;
  end if;

  if assignee_type = 'user' then
    return not exists (
      select 1
      from unnest(workspace_ids) as workspace_id
      where not exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = workspace_id
          and tm.user_id = assignee_user_id
          and tm.status = 'active'
      )
    );
  end if;

  return not exists (
    select 1
    from unnest(workspace_ids) as workspace_id
    cross join unnest(assignee_user_ids) as selected_user_id
    where not exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = workspace_id
        and tm.user_id = selected_user_id
        and tm.status = 'active'
    )
  );
exception
  when invalid_text_representation then
    return false;
end;
$$;

grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated;
