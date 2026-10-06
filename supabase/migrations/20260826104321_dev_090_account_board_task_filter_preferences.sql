create table if not exists public.account_board_task_filter_preferences (
  account_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  preference_version smallint not null default 4 check (preference_version > 0),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, project_id)
);

create index if not exists account_board_task_filter_preferences_project_id_idx
  on public.account_board_task_filter_preferences(project_id);

drop trigger if exists account_board_task_filter_preferences_touch_updated_at
  on public.account_board_task_filter_preferences;
create trigger account_board_task_filter_preferences_touch_updated_at
before update on public.account_board_task_filter_preferences
for each row execute function public.touch_updated_at();

alter table public.account_board_task_filter_preferences enable row level security;

revoke all on table public.account_board_task_filter_preferences from anon, authenticated;
grant select, insert, update, delete
  on table public.account_board_task_filter_preferences
  to authenticated;

drop policy if exists "users read own board filter preferences" on public.account_board_task_filter_preferences;
create policy "users read own board filter preferences"
on public.account_board_task_filter_preferences for select to authenticated
using (
  account_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and private.current_user_can_read_project(p.tenant_id, p.id)
  )
);

drop policy if exists "users create own board filter preferences" on public.account_board_task_filter_preferences;
create policy "users create own board filter preferences"
on public.account_board_task_filter_preferences for insert to authenticated
with check (
  account_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and private.current_user_can_read_project(p.tenant_id, p.id)
  )
);

drop policy if exists "users update own board filter preferences" on public.account_board_task_filter_preferences;
create policy "users update own board filter preferences"
on public.account_board_task_filter_preferences for update to authenticated
using (
  account_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and private.current_user_can_read_project(p.tenant_id, p.id)
  )
)
with check (
  account_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and private.current_user_can_read_project(p.tenant_id, p.id)
  )
);

drop policy if exists "users delete own board filter preferences" on public.account_board_task_filter_preferences;
create policy "users delete own board filter preferences"
on public.account_board_task_filter_preferences for delete to authenticated
using (
  account_id = (select auth.uid())
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and private.current_user_can_read_project(p.tenant_id, p.id)
  )
);
