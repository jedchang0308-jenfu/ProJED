-- Rebind calendar subscription write policies to the v3-aware validator.
-- PostgreSQL policies retain function OIDs across renames, so the v3 migration's
-- existing policies continued to call calendar_subscription_v1_v2_filter_allowed.

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
