-- Permanently delete an owned calendar subscription and revoke its feed token.

create or replace function public.delete_calendar_subscription(
  target_subscription_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  deleted_rows integer;
begin
  if actor_user_id is null or target_subscription_id is null then
    return false;
  end if;

  delete from public.calendar_subscriptions
  where id = target_subscription_id
    and owner_user_id = actor_user_id;

  get diagnostics deleted_rows = row_count;
  return deleted_rows = 1;
end;
$$;

revoke execute on function public.delete_calendar_subscription(uuid) from public, anon;
grant execute on function public.delete_calendar_subscription(uuid) to authenticated;
