-- DEV-095 disposable PostgreSQL bootstrap.
-- This is a minimum Supabase-shaped fixture for the forward-only migration;
-- it never targets a remote database.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$$;

create schema if not exists auth;
create schema if not exists private;
create table auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth, private, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);
create table public.tenants (
  id uuid primary key,
  name text not null,
  legacy_workspace_id text unique
);
create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  status text not null default 'active',
  primary key (tenant_id, user_id)
);
create table public.projects (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  unique (tenant_id, id)
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  primary key (project_id, user_id),
  foreign key (tenant_id, user_id) references public.tenant_members(tenant_id, user_id) on delete cascade
);
create table public.board_role_permissions (
  tenant_id uuid not null,
  project_id uuid not null,
  role text not null,
  capabilities text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id, role)
);
create table public.wbs_items (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.wbs_items(id) on delete set null,
  legacy_node_id text,
  title text not null,
  description text,
  detail_notes jsonb not null default '[]'::jsonb,
  status text not null default 'todo',
  assignee_ids uuid[] not null default '{}',
  collaborator_ids uuid[] not null default '{}',
  start_date date,
  end_date date,
  is_duration_locked boolean not null default false,
  item_type text not null default 'task',
  kanban_stage_id text,
  sort_order bigint not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_archived boolean not null default false,
  unique (tenant_id, project_id, legacy_node_id)
);
create table public.task_workbench_unplaced_items (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  workspace_id text not null,
  task jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create or replace function private.current_user_can_read_project(target_tenant_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id
    where pm.tenant_id = target_tenant_id and pm.project_id = target_project_id
      and pm.user_id = (select auth.uid()) and tm.status = 'active'
  );
$$;
create or replace function private.current_user_can_write_project(target_tenant_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id
    where pm.tenant_id = target_tenant_id and pm.project_id = target_project_id
      and pm.user_id = (select auth.uid()) and tm.status = 'active'
      and pm.role <> 'viewer'
  );
$$;
create or replace function private.wbs_item_belongs_to_project(target_tenant_id uuid, target_project_id uuid, target_item_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select target_item_id is null or exists (
    select 1 from public.wbs_items wi
    where wi.id = target_item_id and wi.tenant_id = target_tenant_id and wi.project_id = target_project_id
  );
$$;
create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.dev095_assert(condition boolean, assertion text)
returns void language plpgsql security definer set search_path = public
as $$ begin if not coalesce(condition, false) then raise exception 'DEV-095 assertion failed: %', assertion; end if; end $$;
revoke all on function public.dev095_assert(boolean, text) from public;
grant execute on function public.dev095_assert(boolean, text) to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.projects enable row level security;
alter table public.wbs_items enable row level security;
alter table public.wbs_items force row level security;
alter table public.task_workbench_unplaced_items enable row level security;
create policy "isolated project readers" on public.projects for select to authenticated
  using (private.current_user_can_read_project(tenant_id, id));
create policy "board readers read wbs items" on public.wbs_items for select to authenticated
  using (private.current_user_can_read_project(tenant_id, project_id));
create policy "board writers update wbs items" on public.wbs_items for update to authenticated
  using (private.current_user_can_write_project(tenant_id, project_id))
  with check (private.current_user_can_write_project(tenant_id, project_id));
create policy "isolated unplaced owner" on public.task_workbench_unplaced_items for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

\set tenant_id '10000000-0000-4000-8000-000000000001'
\set source_project_id '20000000-0000-4000-8000-000000000002'
\set target_project_id '20000000-0000-4000-8000-000000000003'
\set owner_id '30000000-0000-4000-8000-000000000003'
\set viewer_id '30000000-0000-4000-8000-000000000004'
\set member_id '30000000-0000-4000-8000-000000000005'
\set root_id '40000000-0000-4000-8000-000000000010'
\set child_id '40000000-0000-4000-8000-000000000011'
\set target_root_id '40000000-0000-4000-8000-000000000012'

insert into auth.users (id) values (:'owner_id'::uuid), (:'viewer_id'::uuid), (:'member_id'::uuid);
insert into public.profiles (id) select id from auth.users;
insert into public.tenants (id, name, legacy_workspace_id)
values (:'tenant_id'::uuid, 'DEV-095 tenant', 'workspace-dev095');
insert into public.tenant_members (tenant_id, user_id, role)
values
  (:'tenant_id'::uuid, :'owner_id'::uuid, 'owner'),
  (:'tenant_id'::uuid, :'viewer_id'::uuid, 'viewer'),
  (:'tenant_id'::uuid, :'member_id'::uuid, 'member');
insert into public.projects (id, tenant_id, name)
values
  (:'source_project_id'::uuid, :'tenant_id'::uuid, '研發看板'),
  (:'target_project_id'::uuid, :'tenant_id'::uuid, '主管看板');
insert into public.project_members (project_id, tenant_id, user_id, role)
values
  (:'source_project_id'::uuid, :'tenant_id'::uuid, :'owner_id'::uuid, 'owner'),
  (:'source_project_id'::uuid, :'tenant_id'::uuid, :'member_id'::uuid, 'member'),
  (:'source_project_id'::uuid, :'tenant_id'::uuid, :'viewer_id'::uuid, 'viewer'),
  (:'target_project_id'::uuid, :'tenant_id'::uuid, :'owner_id'::uuid, 'owner'),
  (:'target_project_id'::uuid, :'tenant_id'::uuid, :'member_id'::uuid, 'member'),
  (:'target_project_id'::uuid, :'tenant_id'::uuid, :'viewer_id'::uuid, 'viewer');
insert into public.board_role_permissions (tenant_id, project_id, role, capabilities)
values
  (:'tenant_id'::uuid, :'source_project_id'::uuid, 'owner', array['edit_task','move_task']),
  (:'tenant_id'::uuid, :'target_project_id'::uuid, 'member', array['read_board']);
insert into public.wbs_items (id, tenant_id, project_id, parent_id, legacy_node_id, title, status, item_type, sort_order, created_by)
values
  (:'root_id'::uuid, :'tenant_id'::uuid, :'source_project_id'::uuid, null, 'root-dev095', 'A任務', 'in_progress', 'task', 0, :'owner_id'::uuid),
  (:'child_id'::uuid, :'tenant_id'::uuid, :'source_project_id'::uuid, :'root_id'::uuid, 'child-dev095', 'A子任務', 'todo', 'task', 0, :'owner_id'::uuid),
  (:'target_root_id'::uuid, :'tenant_id'::uuid, :'target_project_id'::uuid, null, 'target-root-dev095', '主管脈絡', 'todo', 'group', 0, :'owner_id'::uuid);
