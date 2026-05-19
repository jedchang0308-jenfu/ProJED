-- ProJED Supabase/PostgreSQL baseline schema.
-- Workspaces map to tenants; boards map to projects.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.tenant_role as enum ('owner', 'admin', 'project_manager', 'member', 'viewer');
create type public.member_status as enum ('active', 'invited', 'suspended');
create type public.task_status as enum ('todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold');
create type public.wbs_item_type as enum ('group', 'milestone', 'task');
create type public.dependency_side as enum ('start', 'end');
create type public.document_source_type as enum (
  'wbs_item',
  'task',
  'project_note',
  'meeting_note',
  'risk',
  'decision',
  'uploaded_file',
  'comment',
  'manual'
);
create type public.rag_visibility as enum ('tenant', 'project', 'private');
create type public.rag_sync_status as enum ('pending', 'running', 'synced', 'failed', 'deleted');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  external_auth_provider text,
  external_auth_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_auth_provider, external_auth_id)
);

create table public.tenants (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  legacy_workspace_id text unique,
  owner_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.tenant_role not null default 'member',
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  legacy_board_id text,
  sort_order bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legacy_board_id)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.tenant_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (tenant_id, user_id) references public.tenant_members(tenant_id, user_id) on delete cascade
);

create table public.wbs_items (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.wbs_items(id) on delete set null,
  legacy_node_id text,
  code text,
  title text not null,
  description text,
  detail_notes jsonb not null default '[]'::jsonb,
  status public.task_status not null default 'todo',
  assignee_id uuid references public.profiles(id) on delete set null,
  collaborator_ids uuid[] not null default '{}'::uuid[],
  start_date date,
  end_date date,
  is_duration_locked boolean not null default false,
  item_type public.wbs_item_type not null default 'task',
  kanban_stage_id text,
  sort_order bigint not null default 0,
  depth integer not null default 0,
  path uuid[] not null default '{}'::uuid[],
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, legacy_node_id),
  constraint wbs_items_date_order check (start_date is null or end_date is null or start_date <= end_date)
);

create table public.wbs_dependencies (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_item_id uuid not null references public.wbs_items(id) on delete cascade,
  from_side public.dependency_side not null,
  to_item_id uuid not null references public.wbs_items(id) on delete cascade,
  to_side public.dependency_side not null,
  offset_days integer not null default 0,
  legacy_dependency_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, legacy_dependency_id),
  constraint wbs_dependencies_no_self_loop check (from_item_id <> to_item_id or from_side <> to_side)
);

create table public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  source_type public.document_source_type not null,
  source_table text,
  source_id uuid,
  title text not null,
  content_hash text,
  visibility public.rag_visibility not null default 'project',
  rag_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null,
  content text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.document_chunks (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, document_version_id, chunk_index)
);

create table public.document_embeddings (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  provider text not null default 'google',
  model text not null default 'gemini-embedding-001',
  dimensions integer not null default 3072,
  embedding extensions.vector(3072) not null,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (chunk_id, provider, model, dimensions)
);

create table public.rag_sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  target_store_id text,
  source_document_id uuid references public.documents(id) on delete cascade,
  status public.rag_sync_status not null default 'pending',
  last_synced_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.external_rag_objects (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  document_id uuid not null references public.documents(id) on delete cascade,
  external_object_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_object_id)
);

create table public.activity_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_table text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.llm_access_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  model text,
  prompt_hash text,
  retrieved_chunk_ids uuid[] not null default '{}'::uuid[],
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profiles_external_auth_idx on public.profiles (external_auth_provider, external_auth_id);
create index tenant_members_user_idx on public.tenant_members (user_id, tenant_id) where status = 'active';
create index projects_tenant_idx on public.projects (tenant_id, sort_order);
create index project_members_user_idx on public.project_members (user_id, project_id);
create index wbs_items_project_parent_idx on public.wbs_items (tenant_id, project_id, parent_id, sort_order);
create index wbs_items_legacy_idx on public.wbs_items (tenant_id, project_id, legacy_node_id);
create index wbs_items_path_gin_idx on public.wbs_items using gin (path);
create index wbs_dependencies_project_idx on public.wbs_dependencies (tenant_id, project_id);
create index documents_tenant_project_idx on public.documents (tenant_id, project_id) where rag_enabled = true;
create index document_chunks_document_idx on public.document_chunks (document_id, chunk_index);
create index document_embeddings_hnsw_idx on public.document_embeddings
using hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_is_tenant_member(target_tenant_id uuid)
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
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.current_user_has_tenant_role(target_tenant_id uuid, allowed_roles public.tenant_role[])
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
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = any(allowed_roles)
  );
$$;

create or replace function public.create_tenant_with_owner(tenant_name text)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant public.tenants;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.profiles (id, email, display_name)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    coalesce(auth.jwt() ->> 'name', auth.jwt() ->> 'email')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();

  insert into public.tenants (name, owner_id)
  values (tenant_name, auth.uid())
  returning * into new_tenant;

  insert into public.tenant_members (tenant_id, user_id, role, status)
  values (new_tenant.id, auth.uid(), 'owner', 'active');

  return new_tenant;
end;
$$;

create or replace function public.match_project_knowledge(
  target_tenant_id uuid,
  target_project_id uuid,
  query_embedding extensions.vector(3072),
  match_threshold float default 0.78,
  match_count int default 12
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dc.id as chunk_id,
    d.id as document_id,
    d.title,
    dc.content,
    1 - (de.embedding operator(extensions.<=>) query_embedding) as similarity,
    dc.metadata || jsonb_build_object('document_metadata', d.metadata) as metadata
  from public.document_embeddings de
  join public.document_chunks dc on dc.id = de.chunk_id
  join public.documents d on d.id = dc.document_id
  where d.tenant_id = target_tenant_id
    and (target_project_id is null or d.project_id = target_project_id)
    and d.rag_enabled = true
    and public.current_user_is_tenant_member(target_tenant_id)
    and 1 - (de.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by de.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 50);
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger tenants_touch_updated_at before update on public.tenants for each row execute function public.touch_updated_at();
create trigger tenant_members_touch_updated_at before update on public.tenant_members for each row execute function public.touch_updated_at();
create trigger projects_touch_updated_at before update on public.projects for each row execute function public.touch_updated_at();
create trigger project_members_touch_updated_at before update on public.project_members for each row execute function public.touch_updated_at();
create trigger wbs_items_touch_updated_at before update on public.wbs_items for each row execute function public.touch_updated_at();
create trigger wbs_dependencies_touch_updated_at before update on public.wbs_dependencies for each row execute function public.touch_updated_at();
create trigger documents_touch_updated_at before update on public.documents for each row execute function public.touch_updated_at();
create trigger rag_sync_jobs_touch_updated_at before update on public.rag_sync_jobs for each row execute function public.touch_updated_at();
create trigger external_rag_objects_touch_updated_at before update on public.external_rag_objects for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.wbs_items enable row level security;
alter table public.wbs_dependencies enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.rag_sync_jobs enable row level security;
alter table public.external_rag_objects enable row level security;
alter table public.activity_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.llm_access_logs enable row level security;

create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles self upsert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "tenant members can read tenants" on public.tenants for select to authenticated
using (public.current_user_is_tenant_member(id));
create policy "tenant admins can update tenants" on public.tenants for update to authenticated
using (public.current_user_has_tenant_role(id, array['owner','admin']::public.tenant_role[]))
with check (public.current_user_has_tenant_role(id, array['owner','admin']::public.tenant_role[]));

create policy "members can read tenant memberships" on public.tenant_members for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "tenant admins manage members" on public.tenant_members for all to authenticated
using (public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

create policy "members read projects" on public.projects for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "project managers manage projects" on public.projects for all to authenticated
using (public.current_user_has_tenant_role(tenant_id, array['owner','admin','project_manager']::public.tenant_role[]))
with check (public.current_user_has_tenant_role(tenant_id, array['owner','admin','project_manager']::public.tenant_role[]));

create policy "members read project memberships" on public.project_members for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "project managers manage project memberships" on public.project_members for all to authenticated
using (public.current_user_has_tenant_role(tenant_id, array['owner','admin','project_manager']::public.tenant_role[]))
with check (public.current_user_has_tenant_role(tenant_id, array['owner','admin','project_manager']::public.tenant_role[]));

create policy "members read wbs items" on public.wbs_items for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write wbs items" on public.wbs_items for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read dependencies" on public.wbs_dependencies for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write dependencies" on public.wbs_dependencies for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read documents" on public.documents for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write documents" on public.documents for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read document versions" on public.document_versions for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write document versions" on public.document_versions for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read document chunks" on public.document_chunks for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write document chunks" on public.document_chunks for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read embeddings" on public.document_embeddings for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "service role writes embeddings" on public.document_embeddings for all to service_role
using (true) with check (true);

create policy "members read rag sync jobs" on public.rag_sync_jobs for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "service role writes rag sync jobs" on public.rag_sync_jobs for all to service_role
using (true) with check (true);

create policy "members read external rag objects" on public.external_rag_objects for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "service role writes external rag objects" on public.external_rag_objects for all to service_role
using (true) with check (true);

create policy "members read activity events" on public.activity_events for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write activity events" on public.activity_events for insert to authenticated
with check (public.current_user_is_tenant_member(tenant_id));

create policy "tenant admins read audit logs" on public.audit_logs for select to authenticated
using (tenant_id is null or public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy "service role writes audit logs" on public.audit_logs for all to service_role
using (true) with check (true);

create policy "members read own llm logs" on public.llm_access_logs for select to authenticated
using (public.current_user_is_tenant_member(tenant_id) and actor_id = auth.uid());
create policy "members write own llm logs" on public.llm_access_logs for insert to authenticated
with check (public.current_user_is_tenant_member(tenant_id) and actor_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.create_tenant_with_owner(text) to authenticated;
grant execute on function public.match_project_knowledge(uuid, uuid, extensions.vector, float, int) to authenticated;
