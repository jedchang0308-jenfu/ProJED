-- Workspace-shared task tags for ProJED.

create table public.task_tags (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_tag_id text,
  name text not null,
  color text not null default 'green',
  sort_order bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legacy_tag_id),
  constraint task_tags_name_not_blank check (length(trim(name)) > 0),
  constraint task_tags_color_check check (color in ('green','yellow','orange','red','purple','blue','sky','lime','pink','black','gray'))
);

create table public.wbs_item_tags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid not null references public.wbs_items(id) on delete cascade,
  tag_id uuid not null references public.task_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, tag_id)
);

create index task_tags_tenant_order_idx on public.task_tags (tenant_id, sort_order);
create index wbs_item_tags_project_idx on public.wbs_item_tags (tenant_id, project_id);
create index wbs_item_tags_tag_idx on public.wbs_item_tags (tenant_id, tag_id);

create trigger task_tags_touch_updated_at before update on public.task_tags for each row execute function public.touch_updated_at();

alter table public.task_tags enable row level security;
alter table public.wbs_item_tags enable row level security;

create policy "members read task tags" on public.task_tags for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write task tags" on public.task_tags for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

create policy "members read wbs item tags" on public.wbs_item_tags for select to authenticated
using (public.current_user_is_tenant_member(tenant_id));
create policy "members write wbs item tags" on public.wbs_item_tags for all to authenticated
using (public.current_user_is_tenant_member(tenant_id))
with check (public.current_user_is_tenant_member(tenant_id));

grant select, insert, update, delete on public.task_tags to authenticated;
grant select, insert, update, delete on public.wbs_item_tags to authenticated;
grant select, insert, update, delete on public.task_tags to service_role;
grant select, insert, update, delete on public.wbs_item_tags to service_role;

