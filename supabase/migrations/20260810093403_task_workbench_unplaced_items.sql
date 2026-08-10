-- Cross-device persistence for the account-owned "未歸位" task lane.
-- The task payload remains JSON so legacy TaskNode fields can migrate without
-- forcing the unplaced lane into the board-scoped wbs_items schema.
create table if not exists public.task_workbench_unplaced_items (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  id text not null,
  workspace_id text not null,
  task jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint task_workbench_unplaced_items_task_object
    check (jsonb_typeof(task) = 'object')
);

create index if not exists task_workbench_unplaced_items_owner_order_idx
  on public.task_workbench_unplaced_items (owner_id, sort_order, updated_at);

alter table public.task_workbench_unplaced_items enable row level security;

drop policy if exists "owners read unplaced task items" on public.task_workbench_unplaced_items;
create policy "owners read unplaced task items"
  on public.task_workbench_unplaced_items
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "owners insert unplaced task items" on public.task_workbench_unplaced_items;
create policy "owners insert unplaced task items"
  on public.task_workbench_unplaced_items
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "owners update unplaced task items" on public.task_workbench_unplaced_items;
create policy "owners update unplaced task items"
  on public.task_workbench_unplaced_items
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "owners delete unplaced task items" on public.task_workbench_unplaced_items;
create policy "owners delete unplaced task items"
  on public.task_workbench_unplaced_items
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.task_workbench_unplaced_items to authenticated;
grant select, insert, update, delete on public.task_workbench_unplaced_items to service_role;

drop trigger if exists task_workbench_unplaced_items_touch_updated_at
  on public.task_workbench_unplaced_items;
create trigger task_workbench_unplaced_items_touch_updated_at
  before update on public.task_workbench_unplaced_items
  for each row execute function public.touch_updated_at();
