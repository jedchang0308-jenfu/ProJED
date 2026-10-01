-- DEV-133 B1: constrain the isolated quick OAuth client at the quick-task
-- data boundary. This migration deliberately avoids a global PostgREST hook.

create table if not exists private.quick_task_oauth_clients (
  client_id text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on private.quick_task_oauth_clients from public, anon, service_role;
grant usage on schema private to authenticated, service_role;
grant select on private.quick_task_oauth_clients to authenticated, service_role;
alter table private.quick_task_oauth_clients enable row level security;
drop policy if exists "oauth client reads its own allowlist row" on private.quick_task_oauth_clients;
create policy "oauth client reads its own allowlist row"
  on private.quick_task_oauth_clients for select to authenticated
  using (enabled and client_id = (select auth.jwt() ->> 'client_id'));

create or replace function private.enforce_quick_task_oauth_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id text := nullif(auth.jwt() ->> 'client_id', '');
begin
  if v_client_id is not null and not exists (
    select 1
      from private.quick_task_oauth_clients c
     where c.client_id = v_client_id and c.enabled
  ) then
    raise exception using message = 'QT_OAUTH_CLIENT_FORBIDDEN';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_quick_task_oauth_client() from public;
grant execute on function private.enforce_quick_task_oauth_client() to authenticated, service_role;
drop trigger if exists quick_task_oauth_client_guard on public.task_workbench_unplaced_items;
create trigger quick_task_oauth_client_guard
  before insert on public.task_workbench_unplaced_items
  for each row execute function private.enforce_quick_task_oauth_client();

alter function public.create_quick_unplaced_task_v1(text, text, text) security definer;
alter function public.create_quick_unplaced_task_v1(text, text, text) set search_path = '';
revoke all on function public.create_quick_unplaced_task_v1(text, text, text) from public, anon;
grant execute on function public.create_quick_unplaced_task_v1(text, text, text) to authenticated, service_role;

drop policy if exists "oauth clients cannot direct read unplaced tasks" on public.task_workbench_unplaced_items;
create policy "oauth clients cannot direct read unplaced tasks"
  on public.task_workbench_unplaced_items as restrictive
  for select to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);
drop policy if exists "oauth clients cannot direct insert unplaced tasks" on public.task_workbench_unplaced_items;
create policy "oauth clients cannot direct insert unplaced tasks"
  on public.task_workbench_unplaced_items as restrictive
  for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
drop policy if exists "oauth clients cannot direct update unplaced tasks" on public.task_workbench_unplaced_items;
create policy "oauth clients cannot direct update unplaced tasks"
  on public.task_workbench_unplaced_items as restrictive
  for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
drop policy if exists "oauth clients cannot direct delete unplaced tasks" on public.task_workbench_unplaced_items;
create policy "oauth clients cannot direct delete unplaced tasks"
  on public.task_workbench_unplaced_items as restrictive
  for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

drop policy if exists "oauth clients cannot direct read quick receipts" on private.quick_task_capture_receipts;
create policy "oauth clients cannot direct read quick receipts"
  on private.quick_task_capture_receipts as restrictive
  for select to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);
drop policy if exists "oauth clients cannot direct insert quick receipts" on private.quick_task_capture_receipts;
create policy "oauth clients cannot direct insert quick receipts"
  on private.quick_task_capture_receipts as restrictive
  for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
