-- Per-board role permission matrix.
-- Owners are normalized by the client to keep all board permissions, while
-- admins can configure the other roles for each board.

create table if not exists public.board_role_permissions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  role public.tenant_role not null,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, role),
  foreign key (tenant_id, project_id) references public.projects(tenant_id, id) on delete cascade
);

create trigger board_role_permissions_touch_updated_at
before update on public.board_role_permissions
for each row execute function public.touch_updated_at();

alter table public.board_role_permissions enable row level security;

grant select, insert, update, delete on public.board_role_permissions to authenticated;

create policy "board readers read role permissions"
on public.board_role_permissions for select to authenticated
using (private.current_user_can_read_project(tenant_id, project_id));

create policy "workspace admins or board owners manage role permissions"
on public.board_role_permissions for insert to authenticated
with check (
  private.current_user_is_workspace_admin(tenant_id)
  or private.current_user_has_project_role(
    tenant_id,
    project_id,
    array['owner','admin']::public.tenant_role[]
  )
);

create policy "workspace admins or board owners update role permissions"
on public.board_role_permissions for update to authenticated
using (
  private.current_user_is_workspace_admin(tenant_id)
  or private.current_user_has_project_role(
    tenant_id,
    project_id,
    array['owner','admin']::public.tenant_role[]
  )
)
with check (
  private.current_user_is_workspace_admin(tenant_id)
  or private.current_user_has_project_role(
    tenant_id,
    project_id,
    array['owner','admin']::public.tenant_role[]
  )
);

create policy "workspace admins or board owners delete role permissions"
on public.board_role_permissions for delete to authenticated
using (
  private.current_user_is_workspace_admin(tenant_id)
  or private.current_user_has_project_role(
    tenant_id,
    project_id,
    array['owner','admin']::public.tenant_role[]
  )
);
