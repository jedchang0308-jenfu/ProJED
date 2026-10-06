\set ON_ERROR_STOP on

-- Minimal, task-owned PostgreSQL fixture. It mirrors only the relations and
-- auth contract consumed by the DEV-122 additive migration; no project DB is
-- touched by this bootstrap.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
grant usage on schema extensions to public;
grant execute on function extensions.digest(bytea, text) to public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  email text,
  display_name text
);

create table public.tenants (
  id uuid primary key,
  name text not null,
  legacy_workspace_id text unique,
  owner_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.task_workbench_unplaced_items (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  id text not null,
  workspace_id text not null,
  task jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index task_workbench_unplaced_items_owner_order_idx
  on public.task_workbench_unplaced_items (owner_id, sort_order, updated_at);

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.task_workbench_unplaced_items enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy tenants_member_read on public.tenants for select to authenticated
  using (exists (select 1 from public.tenant_members tm where tm.tenant_id = id and tm.user_id = (select auth.uid()) and tm.status = 'active'));
create policy tenant_members_self_read on public.tenant_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy unplaced_owner_read on public.task_workbench_unplaced_items for select to authenticated
  using (owner_id = (select auth.uid()));
create policy unplaced_owner_insert on public.task_workbench_unplaced_items for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy unplaced_owner_update on public.task_workbench_unplaced_items for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy unplaced_owner_delete on public.task_workbench_unplaced_items for delete to authenticated
  using (owner_id = (select auth.uid()));

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.tenants, public.tenant_members to authenticated, service_role;
grant select, insert, update, delete on public.task_workbench_unplaced_items to authenticated, service_role;
