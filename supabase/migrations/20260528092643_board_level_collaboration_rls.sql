-- Board-level collaboration RLS for ProJED.
-- Workspaces keep owner/admin inheritance. Boards use project_members as the
-- visibility and write boundary. Assignment fields remain responsibility data,
-- not authorization data.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_user_is_workspace_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role = any(array['owner','admin']::public.tenant_role[])
  );
$$;

create or replace function private.current_user_has_project_role(
  target_tenant_id uuid,
  target_project_id uuid,
  allowed_roles public.tenant_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.projects p
      on p.id = pm.project_id
     and p.tenant_id = pm.tenant_id
    join public.tenant_members tm
      on tm.tenant_id = pm.tenant_id
     and tm.user_id = pm.user_id
    where pm.tenant_id = target_tenant_id
      and pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
      and tm.status = 'active'
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function private.current_user_can_read_project(target_tenant_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_workspace_admin(target_tenant_id)
    or private.current_user_has_project_role(
      target_tenant_id,
      target_project_id,
      array['owner','admin','project_manager','member','viewer']::public.tenant_role[]
    );
$$;

create or replace function private.current_user_can_write_project(target_tenant_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_workspace_admin(target_tenant_id)
    or private.current_user_has_project_role(
      target_tenant_id,
      target_project_id,
      array['owner','admin','project_manager','member']::public.tenant_role[]
    );
$$;

create or replace function private.current_user_can_manage_project(target_tenant_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.current_user_is_workspace_admin(target_tenant_id)
    or private.current_user_has_project_role(
      target_tenant_id,
      target_project_id,
      array['owner','admin','project_manager']::public.tenant_role[]
    );
$$;

create or replace function private.wbs_item_belongs_to_project(
  target_tenant_id uuid,
  target_project_id uuid,
  target_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_item_id is null
    or exists (
      select 1
      from public.wbs_items wi
      where wi.id = target_item_id
        and wi.tenant_id = target_tenant_id
        and wi.project_id = target_project_id
    );
$$;

create or replace function private.task_tag_belongs_to_tenant(target_tenant_id uuid, target_tag_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_tags tt
    where tt.id = target_tag_id
      and tt.tenant_id = target_tenant_id
  );
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

drop policy if exists "members read projects" on public.projects;
drop policy if exists "project managers manage projects" on public.projects;

create policy "workspace admins or board members read projects"
on public.projects for select to authenticated
using (private.current_user_can_read_project(tenant_id, id));

create policy "workspace admins create projects"
on public.projects for insert to authenticated
with check (private.current_user_is_workspace_admin(tenant_id));

create policy "workspace admins or board managers update projects"
on public.projects for update to authenticated
using (private.current_user_can_manage_project(tenant_id, id))
with check (private.current_user_can_manage_project(tenant_id, id));

create policy "workspace admins or board managers delete projects"
on public.projects for delete to authenticated
using (private.current_user_can_manage_project(tenant_id, id));

drop policy if exists "members read project memberships" on public.project_members;
drop policy if exists "project managers manage project memberships" on public.project_members;

create policy "workspace admins or board members read project memberships"
on public.project_members for select to authenticated
using (private.current_user_can_read_project(tenant_id, project_id));

create policy "workspace admins or board managers create project memberships"
on public.project_members for insert to authenticated
with check (private.current_user_can_manage_project(tenant_id, project_id));

create policy "workspace admins or board managers update project memberships"
on public.project_members for update to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id))
with check (private.current_user_can_manage_project(tenant_id, project_id));

create policy "workspace admins or board managers delete project memberships"
on public.project_members for delete to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id));

drop policy if exists "members read wbs items" on public.wbs_items;
drop policy if exists "members write wbs items" on public.wbs_items;

create policy "board readers read wbs items"
on public.wbs_items for select to authenticated
using (private.current_user_can_read_project(tenant_id, project_id));

create policy "board writers create wbs items"
on public.wbs_items for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, parent_id)
);

create policy "board writers update wbs items"
on public.wbs_items for update to authenticated
using (private.current_user_can_write_project(tenant_id, project_id))
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, parent_id)
);

create policy "board managers delete wbs items"
on public.wbs_items for delete to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id));

drop policy if exists "members read dependencies" on public.wbs_dependencies;
drop policy if exists "members write dependencies" on public.wbs_dependencies;

create policy "board readers read dependencies"
on public.wbs_dependencies for select to authenticated
using (
  private.current_user_can_read_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, from_item_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, to_item_id)
);

create policy "board writers create dependencies"
on public.wbs_dependencies for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, from_item_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, to_item_id)
);

create policy "board writers update dependencies"
on public.wbs_dependencies for update to authenticated
using (private.current_user_can_write_project(tenant_id, project_id))
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, from_item_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, to_item_id)
);

create policy "board managers delete dependencies"
on public.wbs_dependencies for delete to authenticated
using (private.current_user_can_manage_project(tenant_id, project_id));

drop policy if exists "members read task tags" on public.task_tags;
drop policy if exists "members write task tags" on public.task_tags;

create policy "workspace members read task tags"
on public.task_tags for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));

create policy "workspace writers create task tags"
on public.task_tags for insert to authenticated
with check (
  public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','project_manager','member']::public.tenant_role[]
  )
);

create policy "workspace writers update task tags"
on public.task_tags for update to authenticated
using (
  public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','project_manager','member']::public.tenant_role[]
  )
)
with check (
  public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','project_manager','member']::public.tenant_role[]
  )
);

create policy "workspace writers delete task tags"
on public.task_tags for delete to authenticated
using (
  public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','project_manager','member']::public.tenant_role[]
  )
);

drop policy if exists "members read wbs item tags" on public.wbs_item_tags;
drop policy if exists "members write wbs item tags" on public.wbs_item_tags;

create policy "board readers read wbs item tags"
on public.wbs_item_tags for select to authenticated
using (
  private.current_user_can_read_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and private.task_tag_belongs_to_tenant(tenant_id, tag_id)
);

create policy "board writers create wbs item tags"
on public.wbs_item_tags for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and private.task_tag_belongs_to_tenant(tenant_id, tag_id)
);

create policy "board writers update wbs item tags"
on public.wbs_item_tags for update to authenticated
using (private.current_user_can_write_project(tenant_id, project_id))
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and private.task_tag_belongs_to_tenant(tenant_id, tag_id)
);

create policy "board writers delete wbs item tags"
on public.wbs_item_tags for delete to authenticated
using (private.current_user_can_write_project(tenant_id, project_id));
