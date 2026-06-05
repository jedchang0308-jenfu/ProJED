-- Meeting and personal work records linked to WBS task nodes.
-- Private records stay out of RAG by default and are only visible to their owner.

alter type public.document_source_type add value if not exists 'work_log';

create table public.knowledge_records (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  legacy_record_id text,
  record_type text not null check (record_type in ('meeting', 'work_log')),
  title text not null,
  content text not null default '',
  participants_text text,
  occurred_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recorded_by uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility public.rag_visibility not null default 'project',
  rag_enabled boolean not null default false,
  source_document_id uuid references public.documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_records_legacy_unique unique (tenant_id, project_id, legacy_record_id),
  constraint knowledge_records_meeting_time check (
    record_type <> 'meeting' or occurred_at is not null
  ),
  constraint knowledge_records_work_log_time check (
    record_type <> 'work_log'
    or (started_at is not null and ended_at is not null and started_at <= ended_at)
  )
);

create table public.record_task_links (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  record_id uuid not null references public.knowledge_records(id) on delete cascade,
  item_id uuid not null references public.wbs_items(id) on delete cascade,
  role text not null default 'related' check (role in ('main', 'related', 'decision', 'blocker', 'follow_up')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint record_task_links_unique unique (record_id, item_id, role)
);

create index knowledge_records_project_idx
  on public.knowledge_records (tenant_id, project_id, status, updated_at desc);
create index knowledge_records_recorded_by_idx
  on public.knowledge_records (tenant_id, recorded_by, updated_at desc);
create index knowledge_records_source_document_idx
  on public.knowledge_records (source_document_id)
  where source_document_id is not null;
create index record_task_links_item_idx
  on public.record_task_links (tenant_id, project_id, item_id, created_at desc);
create index record_task_links_record_idx
  on public.record_task_links (record_id);

create trigger knowledge_records_touch_updated_at
before update on public.knowledge_records
for each row execute function public.touch_updated_at();

alter table public.knowledge_records enable row level security;
alter table public.record_task_links enable row level security;

create policy "record owners and board readers read records"
on public.knowledge_records for select to authenticated
using (
  status <> 'archived'
  and (
    (visibility = 'private' and (created_by = (select auth.uid()) or recorded_by = (select auth.uid())))
    or (visibility <> 'private' and private.current_user_can_read_project(tenant_id, project_id))
  )
);

create policy "board writers create records"
on public.knowledge_records for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and (
    visibility <> 'private'
    or created_by = (select auth.uid())
    or recorded_by = (select auth.uid())
  )
  and (
    visibility <> 'private'
    or rag_enabled = false
  )
);

create policy "record owners and board writers update records"
on public.knowledge_records for update to authenticated
using (
  (
    visibility = 'private'
    and (created_by = (select auth.uid()) or recorded_by = (select auth.uid()))
  )
  or (
    visibility <> 'private'
    and private.current_user_can_write_project(tenant_id, project_id)
  )
)
with check (
  (
    visibility = 'private'
    and (created_by = (select auth.uid()) or recorded_by = (select auth.uid()))
    and rag_enabled = false
  )
  or (
    visibility <> 'private'
    and private.current_user_can_write_project(tenant_id, project_id)
  )
);

create policy "record owners and board managers delete records"
on public.knowledge_records for delete to authenticated
using (
  (
    visibility = 'private'
    and (created_by = (select auth.uid()) or recorded_by = (select auth.uid()))
  )
  or (
    visibility <> 'private'
    and private.current_user_can_manage_project(tenant_id, project_id)
  )
);

create policy "authorized users read record task links"
on public.record_task_links for select to authenticated
using (
  exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and kr.status <> 'archived'
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_read_project(kr.tenant_id, kr.project_id))
      )
  )
);

create policy "authorized users create record task links"
on public.record_task_links for insert to authenticated
with check (
  private.current_user_can_write_project(tenant_id, project_id)
  and private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_write_project(kr.tenant_id, kr.project_id))
      )
  )
);

create policy "authorized users update record task links"
on public.record_task_links for update to authenticated
using (
  exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_write_project(kr.tenant_id, kr.project_id))
      )
  )
)
with check (
  private.wbs_item_belongs_to_project(tenant_id, project_id, item_id)
  and exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_write_project(kr.tenant_id, kr.project_id))
      )
  )
);

create policy "authorized users delete record task links"
on public.record_task_links for delete to authenticated
using (
  exists (
    select 1
    from public.knowledge_records kr
    where kr.id = record_task_links.record_id
      and kr.tenant_id = record_task_links.tenant_id
      and kr.project_id = record_task_links.project_id
      and (
        (kr.visibility = 'private' and (kr.created_by = (select auth.uid()) or kr.recorded_by = (select auth.uid())))
        or (kr.visibility <> 'private' and private.current_user_can_write_project(kr.tenant_id, kr.project_id))
      )
  )
);

grant select, insert, update, delete on public.knowledge_records to authenticated;
grant select, insert, update, delete on public.record_task_links to authenticated;
