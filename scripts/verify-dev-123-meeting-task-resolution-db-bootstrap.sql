create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema if not exists storage;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint
);

create table if not exists public.tenants (
  id uuid primary key,
  legacy_workspace_id text unique
);
create table if not exists public.projects (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  legacy_board_id text unique
);
create table if not exists public.profiles (
  id uuid primary key
);
create table if not exists public.knowledge_records (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  project_id uuid not null references public.projects(id),
  record_type text not null,
  created_by uuid not null references public.profiles(id),
  recorded_by uuid references public.profiles(id),
  visibility text not null default 'project',
  status text not null default 'draft',
  title text not null default '',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.project_members (
  tenant_id uuid not null references public.tenants(id),
  project_id uuid not null references public.projects(id),
  user_id uuid not null references public.profiles(id),
  role text not null,
  primary key (project_id, user_id)
);
create table if not exists public.wbs_items (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  project_id uuid not null references public.projects(id),
  title text not null,
  description text,
  path jsonb not null default '[]'::jsonb,
  item_type text not null default 'task',
  is_archived boolean not null default false,
  legacy_node_id text
);
create table if not exists public.record_task_links (
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null references public.knowledge_records(id) on delete cascade,
  item_id uuid not null references public.wbs_items(id),
  role text not null,
  created_by uuid not null references public.profiles(id)
);
