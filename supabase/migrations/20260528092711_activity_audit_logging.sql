-- DEV-006: Collaboration activity/audit logging boundary.
-- Depends on 20260528092643_board_level_collaboration_rls.sql private helpers.

drop policy if exists "members read activity events" on public.activity_events;
drop policy if exists "members write activity events" on public.activity_events;
drop policy if exists "tenant admins read audit logs" on public.audit_logs;
drop policy if exists "service role writes audit logs" on public.audit_logs;

create policy "board readers read activity events" on public.activity_events
for select to authenticated
using (
  (select auth.uid()) is not null
  and (
    (
      project_id is not null
      and private.current_user_can_read_project(tenant_id, project_id)
    )
    or (
      project_id is null
      and public.current_user_is_tenant_member(tenant_id)
    )
  )
);

create policy "board writers insert activity events" on public.activity_events
for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (
      project_id is not null
      and private.current_user_can_write_project(tenant_id, project_id)
    )
    or (
      project_id is null
      and public.current_user_is_tenant_member(tenant_id)
    )
  )
);

create policy "tenant admins read audit logs" on public.audit_logs
for select to authenticated
using (
  tenant_id is null
  or private.current_user_is_workspace_admin(tenant_id)
);

create policy "service role writes audit logs" on public.audit_logs
for all to service_role
using (true)
with check (true);

create or replace function public.log_activity_event(
  target_tenant_id uuid,
  target_project_id uuid,
  activity_event_type text,
  activity_entity_table text,
  activity_entity_id uuid default null,
  activity_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  new_event_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required to write activity events.';
  end if;

  if target_project_id is not null then
    if not private.current_user_can_write_project(target_tenant_id, target_project_id) then
      raise exception 'Board write permission is required to write activity events.';
    end if;
  elsif not public.current_user_is_tenant_member(target_tenant_id) then
    raise exception 'Workspace membership is required to write activity events.';
  end if;

  insert into public.activity_events (
    tenant_id,
    project_id,
    actor_id,
    event_type,
    entity_table,
    entity_id,
    payload
  )
  values (
    target_tenant_id,
    target_project_id,
    (select auth.uid()),
    activity_event_type,
    activity_entity_table,
    activity_entity_id,
    coalesce(activity_payload, '{}'::jsonb)
  )
  returning id into new_event_id;

  return new_event_id;
end;
$$;

create or replace function public.log_audit_event(
  target_tenant_id uuid,
  target_project_id uuid,
  audit_action text,
  audit_entity_table text,
  audit_entity_id uuid default null,
  audit_before_data jsonb default null,
  audit_after_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  new_audit_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required to write audit logs.';
  end if;

  if target_project_id is not null then
    if not private.current_user_can_manage_project(target_tenant_id, target_project_id) then
      raise exception 'Board manage permission is required to write audit logs.';
    end if;
  elsif not private.current_user_is_workspace_admin(target_tenant_id) then
    raise exception 'Workspace admin permission is required to write audit logs.';
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    before_data,
    after_data
  )
  values (
    target_tenant_id,
    (select auth.uid()),
    audit_action,
    audit_entity_table,
    audit_entity_id,
    audit_before_data,
    audit_after_data
  )
  returning id into new_audit_id;

  return new_audit_id;
end;
$$;

revoke all on function public.log_activity_event(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.log_activity_event(uuid, uuid, text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.log_audit_event(uuid, uuid, text, text, uuid, jsonb, jsonb) to authenticated, service_role;
