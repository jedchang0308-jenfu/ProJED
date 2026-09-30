-- DEV-133 B1: allow the isolated quick OAuth client to reach only the
-- idempotent quick-create RPC. Existing first-party sessions keep their policy.

create table if not exists private.quick_task_oauth_clients (
  client_id text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on private.quick_task_oauth_clients from public, anon, service_role;
grant usage on schema private to authenticated;
grant select on private.quick_task_oauth_clients to authenticated;
alter table private.quick_task_oauth_clients enable row level security;
drop policy if exists "oauth client reads its own allowlist row" on private.quick_task_oauth_clients;
create policy "oauth client reads its own allowlist row"
  on private.quick_task_oauth_clients for select to authenticated
  using (enabled and client_id = (select auth.jwt() ->> 'client_id'));

create or replace function private.enforce_quick_task_oauth_path()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_client_id text := v_claims ->> 'client_id';
  v_path text := current_setting('request.path', true);
begin
  if v_client_id is not null
     and coalesce(v_path, '') <> '/rest/v1/rpc/create_quick_unplaced_task_v1' then
    raise exception using message = 'QT_OAUTH_PATH_FORBIDDEN';
  end if;
end;
$$;

revoke all on function private.enforce_quick_task_oauth_path() from public;
grant execute on function private.enforce_quick_task_oauth_path() to anon, authenticated;

do $$
begin
  if nullif(current_setting('pgrst.db_pre_request', true), '') is not null
     and current_setting('pgrst.db_pre_request', true) <> 'private.enforce_quick_task_oauth_path' then
    raise exception using message = 'QT_PRE_REQUEST_CONFLICT';
  end if;
  execute 'alter role authenticator set pgrst.db_pre_request = ''private.enforce_quick_task_oauth_path''';
end;
$$;

drop policy if exists "oauth client quick create only" on public.task_workbench_unplaced_items;
create policy "oauth client quick create only"
  on public.task_workbench_unplaced_items as restrictive
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'client_id') is null
    or exists (
      select 1
      from private.quick_task_oauth_clients c
      where c.client_id = (select auth.jwt() ->> 'client_id')
        and c.enabled
    )
  );
