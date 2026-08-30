-- DEV-093 isolated PostgreSQL bootstrap.
-- This is a deliberately small, disposable Supabase-shaped schema. It is
-- not a production schema and only exercises the forward-only migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$$;

create schema if not exists auth;
create schema if not exists private;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.tenant_members (
  tenant_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  status text not null default 'active',
  primary key (tenant_id, user_id)
);

create table public.projects (
  id uuid primary key,
  tenant_id uuid not null,
  name text not null
);

create table public.project_members (
  project_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'project_manager', 'member', 'viewer')),
  primary key (project_id, user_id)
);

create table public.board_role_permissions (
  tenant_id uuid not null,
  project_id uuid not null,
  role text not null,
  capabilities text[] not null default '{}',
  primary key (tenant_id, project_id, role)
);

create table public.wbs_items (
  id uuid primary key,
  tenant_id uuid not null,
  project_id uuid not null,
  parent_id uuid,
  legacy_node_id text,
  title text not null,
  description text,
  detail_notes jsonb not null default '[]'::jsonb,
  status text not null default 'todo',
  assignee_id uuid,
  assignee_ids uuid[] not null default '{}',
  collaborator_ids uuid[] not null default '{}',
  start_date date,
  end_date date,
  is_duration_locked boolean not null default false,
  item_type text not null default 'task',
  kanban_stage_id text,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_archived boolean not null default false
);

create table public.wbs_item_tags (
  tenant_id uuid not null,
  project_id uuid not null,
  item_id uuid not null,
  tag_id uuid not null,
  primary key (item_id, tag_id)
);

create table public.wbs_dependencies (
  id uuid primary key,
  tenant_id uuid not null,
  project_id uuid not null,
  from_item_id uuid not null,
  from_side text not null,
  to_item_id uuid not null,
  to_side text not null,
  offset_days integer not null default 0
);

create table public.activity_events (
  id uuid primary key,
  tenant_id uuid not null,
  project_id uuid,
  actor_id uuid,
  event_type text not null,
  entity_table text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.knowledge_records (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  legacy_record_id text,
  record_type text not null check (record_type in ('meeting', 'work_log')),
  title text not null,
  content text not null default '',
  participants_text text,
  occurred_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recorded_by uuid,
  status text not null default 'draft',
  visibility text not null default 'project',
  rag_enabled boolean not null default false,
  source_document_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.record_task_links (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  record_id uuid not null,
  item_id uuid not null,
  role text not null default 'related',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (record_id, item_id, role)
);

create index wbs_items_project_parent_idx on public.wbs_items (tenant_id, project_id, parent_id, sort_order);
create index wbs_dependencies_project_idx on public.wbs_dependencies (tenant_id, project_id);
create index activity_events_project_idx on public.activity_events (tenant_id, project_id, created_at);

-- The disposable fixture models the source-link cascade contract needed by
-- DB13: deleting source tasks may remove links while the immutable asset row
-- remains readable.
alter table public.record_task_links
  add constraint record_task_links_record_fk foreign key (record_id)
  references public.knowledge_records(id) on delete cascade;
alter table public.record_task_links
  add constraint record_task_links_item_fk foreign key (item_id)
  references public.wbs_items(id) on delete cascade;

-- Model the board-level cascade used by the delete-impact contract.  The
-- production schema already owns this relationship; the disposable fixture
-- keeps it explicit so DB16 can verify both disclosure count and cascade.
alter table public.knowledge_records
  add constraint knowledge_records_project_fk foreign key (project_id)
  references public.projects(id) on delete cascade;

-- A pre-migration permission row proves the forward migration backfills
-- collect_task for existing delete_task holders.
insert into public.board_role_permissions (tenant_id, project_id, role, capabilities)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'owner', array['delete_task']);

create or replace function private.current_user_is_workspace_admin(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tenant_members tm where tm.tenant_id = target_tenant_id and tm.user_id = (select auth.uid()) and tm.status = 'active' and tm.role in ('owner', 'admin')) $$;

create or replace function private.current_user_can_read_project(target_tenant_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.project_members pm join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id where pm.tenant_id = target_tenant_id and pm.project_id = target_project_id and pm.user_id = (select auth.uid()) and tm.status = 'active') $$;

create or replace function private.current_user_can_write_project(target_tenant_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.current_user_is_workspace_admin(target_tenant_id) or exists (select 1 from public.project_members pm join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id where pm.tenant_id = target_tenant_id and pm.project_id = target_project_id and pm.user_id = (select auth.uid()) and tm.status = 'active' and pm.role <> 'viewer') $$;

create or replace function private.current_user_can_manage_project(target_tenant_id uuid, target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.current_user_is_workspace_admin(target_tenant_id) or exists (select 1 from public.project_members pm join public.tenant_members tm on tm.tenant_id = pm.tenant_id and tm.user_id = pm.user_id where pm.tenant_id = target_tenant_id and pm.project_id = target_project_id and pm.user_id = (select auth.uid()) and tm.status = 'active' and pm.role in ('owner', 'admin', 'project_manager')) $$;

create or replace function private.wbs_item_belongs_to_project(target_tenant_id uuid, target_project_id uuid, target_item_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select target_item_id is null or exists (select 1 from public.wbs_items wi where wi.id = target_item_id and wi.tenant_id = target_tenant_id and wi.project_id = target_project_id) $$;

create or replace function public.log_activity_event(target_tenant_id uuid, target_project_id uuid, activity_event_type text, activity_entity_table text, activity_entity_id uuid default null, activity_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public, private, extensions
as $$ declare new_event_id uuid; begin insert into public.activity_events (id, tenant_id, project_id, actor_id, event_type, entity_table, entity_id, payload) values (extensions.gen_random_uuid(), target_tenant_id, target_project_id, auth.uid(), activity_event_type, activity_entity_table, activity_entity_id, coalesce(activity_payload, '{}'::jsonb)) returning id into new_event_id; return new_event_id; end $$;

grant usage on schema private to anon, authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

alter table public.projects enable row level security;
alter table public.wbs_items enable row level security;
alter table public.knowledge_records enable row level security;
alter table public.record_task_links enable row level security;
alter table public.activity_events enable row level security;

create policy "isolated project readers" on public.projects for select to authenticated using (private.current_user_can_read_project(tenant_id, id));
create policy "isolated project managers delete" on public.projects for delete to authenticated using (private.current_user_can_manage_project(tenant_id, id));
create policy "isolated task readers" on public.wbs_items for select to authenticated using (private.current_user_can_read_project(tenant_id, project_id));
create policy "isolated task writers" on public.wbs_items for update to authenticated using (private.current_user_can_write_project(tenant_id, project_id)) with check (private.current_user_can_write_project(tenant_id, project_id));
create policy "isolated record readers" on public.knowledge_records for select to authenticated using (status <> 'archived' and private.current_user_can_read_project(tenant_id, project_id));
create policy "isolated link readers" on public.record_task_links for select to authenticated using (exists (select 1 from public.knowledge_records kr where kr.id = record_task_links.record_id and kr.status <> 'archived' and private.current_user_can_read_project(kr.tenant_id, kr.project_id)));
create policy "isolated activity readers" on public.activity_events for select to authenticated using (private.current_user_can_read_project(tenant_id, project_id));

create or replace function public.dev093_assert(condition boolean, assertion text)
returns void language plpgsql security definer set search_path = ''
as $$ begin if not coalesce(condition, false) then raise exception 'DEV-093 assertion failed: %', assertion; end if; end $$;
revoke all on function public.dev093_assert(boolean, text) from public;
grant execute on function public.dev093_assert(boolean, text) to authenticated, service_role;
