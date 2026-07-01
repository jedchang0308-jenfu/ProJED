-- DEV-040 hotfix: avoid PL/pgSQL output-column ambiguity in ensure_personal_task_zone().

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

revoke all on function public.ensure_personal_task_zone() from public, anon;
grant execute on function public.ensure_personal_task_zone() to authenticated;

notify pgrst, 'reload schema';
