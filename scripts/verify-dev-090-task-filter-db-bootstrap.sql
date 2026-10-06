create role anon nologin;
create role authenticated nologin;

create schema auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create schema private;
create table private.readable_projects (
  account_id uuid not null,
  project_id uuid not null,
  primary key (account_id, project_id)
);

create table public.profiles (
  id uuid primary key
);

create table public.projects (
  id uuid primary key,
  tenant_id uuid not null
);

create or replace function private.current_user_can_read_project(
  target_tenant_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.readable_projects access
    where access.account_id = auth.uid()
      and access.project_id = target_project_id
  )
$$;
revoke all on function private.current_user_can_read_project(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_can_read_project(uuid, uuid) to authenticated;
grant select on public.projects to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.wbs_items (
  id uuid primary key,
  project_id uuid not null
);
revoke all on public.wbs_items from anon, authenticated;

create or replace function public.dev090_assert(condition boolean, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'DEV-090 assertion failed: %', message;
  end if;
end;
$$;
revoke all on function public.dev090_assert(boolean, text) from public;
grant execute on function public.dev090_assert(boolean, text) to anon, authenticated;
