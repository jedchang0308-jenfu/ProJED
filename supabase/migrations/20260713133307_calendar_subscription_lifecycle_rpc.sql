-- Allow owners to manage subscription lifecycle even when an immutable legacy
-- filter snapshot no longer passes today's permission validator.

create or replace function public.set_calendar_subscription_active(
  target_subscription_id uuid,
  target_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  updated_rows integer;
begin
  if actor_user_id is null
    or target_subscription_id is null
    or target_is_active is null then
    return false;
  end if;

  update public.calendar_subscriptions
  set is_active = target_is_active
  where id = target_subscription_id
    and owner_user_id = actor_user_id;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

create or replace function public.rotate_calendar_subscription_token(
  target_subscription_id uuid,
  target_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  updated_rows integer;
begin
  if actor_user_id is null
    or target_subscription_id is null
    or target_token_hash is null
    or target_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.calendar_subscriptions
  set
    token_hash = target_token_hash,
    is_active = true
  where id = target_subscription_id
    and owner_user_id = actor_user_id;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;

revoke execute on function public.set_calendar_subscription_active(uuid, boolean) from public, anon;
revoke execute on function public.rotate_calendar_subscription_token(uuid, text) from public, anon;
grant execute on function public.set_calendar_subscription_active(uuid, boolean) to authenticated;
grant execute on function public.rotate_calendar_subscription_token(uuid, text) to authenticated;
