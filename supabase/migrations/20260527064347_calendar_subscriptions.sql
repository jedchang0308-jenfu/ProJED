-- Custom read-only iCalendar subscriptions.

create table if not exists public.calendar_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  filters_json jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_subscriptions_name_not_blank check (length(trim(name)) > 0),
  constraint calendar_subscriptions_filters_object check (jsonb_typeof(filters_json) = 'object')
);

create index if not exists calendar_subscriptions_owner_idx on public.calendar_subscriptions (owner_user_id, created_at desc);
create index if not exists calendar_subscriptions_token_hash_idx on public.calendar_subscriptions (token_hash);

drop policy if exists "tenant co-members can read profiles" on public.profiles;
create policy "tenant co-members can read profiles"
on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.tenant_members me
    join public.tenant_members them on them.tenant_id = me.tenant_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = public.profiles.id
      and them.status = 'active'
  )
);

drop trigger if exists calendar_subscriptions_touch_updated_at on public.calendar_subscriptions;
create trigger calendar_subscriptions_touch_updated_at
before update on public.calendar_subscriptions
for each row execute function public.touch_updated_at();

create or replace function public.calendar_subscription_filter_allowed(filters jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  workspace_ids uuid[];
  assignee_type text;
  assignee_user_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if jsonb_typeof(filters) <> 'object' then
    return false;
  end if;

  if jsonb_typeof(filters -> 'workspace_ids') <> 'array'
    or jsonb_array_length(filters -> 'workspace_ids') = 0 then
    return false;
  end if;

  if jsonb_typeof(filters -> 'date_types') <> 'array'
    or jsonb_array_length(filters -> 'date_types') = 0 then
    return false;
  end if;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into workspace_ids
  from jsonb_array_elements_text(filters -> 'workspace_ids') as value;

  if cardinality(workspace_ids) = 0 then
    return false;
  end if;

  if exists (
    select 1
    from unnest(workspace_ids) as workspace_id
    where not public.current_user_is_tenant_member(workspace_id)
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(filters -> 'date_types') as date_type
    where date_type not in ('start_date', 'due_date')
  ) then
    return false;
  end if;

  assignee_type := filters #>> '{assignee,type}';

  if assignee_type = 'me' then
    return true;
  end if;

  if assignee_type <> 'user' then
    return false;
  end if;

  assignee_user_id := (filters #>> '{assignee,user_id}')::uuid;

  if assignee_user_id = auth.uid() then
    return true;
  end if;

  if exists (
    select 1
    from unnest(workspace_ids) as workspace_id
    where not public.current_user_has_tenant_role(
      workspace_id,
      array['owner','admin','project_manager']::public.tenant_role[]
    )
  ) then
    return false;
  end if;

  return not exists (
    select 1
    from unnest(workspace_ids) as workspace_id
    where not exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = workspace_id
        and tm.user_id = assignee_user_id
        and tm.status = 'active'
    )
  );
exception
  when invalid_text_representation then
    return false;
end;
$$;

alter table public.calendar_subscriptions enable row level security;

drop policy if exists "users read own calendar subscriptions" on public.calendar_subscriptions;
create policy "users read own calendar subscriptions"
on public.calendar_subscriptions
for select to authenticated
using (owner_user_id = (select auth.uid()));

drop policy if exists "users create own calendar subscriptions" on public.calendar_subscriptions;
create policy "users create own calendar subscriptions"
on public.calendar_subscriptions
for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and public.calendar_subscription_filter_allowed(filters_json)
);

drop policy if exists "users update own calendar subscriptions" on public.calendar_subscriptions;
create policy "users update own calendar subscriptions"
on public.calendar_subscriptions
for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid())
  and public.calendar_subscription_filter_allowed(filters_json)
);

drop policy if exists "users delete own calendar subscriptions" on public.calendar_subscriptions;
create policy "users delete own calendar subscriptions"
on public.calendar_subscriptions
for delete to authenticated
using (owner_user_id = (select auth.uid()));

grant select, insert, update, delete on public.calendar_subscriptions to authenticated;
grant select, insert, update, delete on public.calendar_subscriptions to service_role;
grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated;
