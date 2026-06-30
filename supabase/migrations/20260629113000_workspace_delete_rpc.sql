-- DEV-035: Owner-only workspace deletion RPC.
-- The client must not delete tenants directly; this RPC centralizes the
-- authorization boundary and lets existing tenant FKs cascade the workspace.

create or replace function public.delete_workspace(target_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role = 'owner'
  ) then
    raise exception 'Only workspace owners can delete workspaces.';
  end if;

  delete from public.tenants
  where id = target_tenant_id;

  if not found then
    raise exception 'Workspace not found.';
  end if;
end;
$$;

revoke all on function public.delete_workspace(uuid) from public;
revoke all on function public.delete_workspace(uuid) from anon;
grant execute on function public.delete_workspace(uuid) to authenticated, service_role;
