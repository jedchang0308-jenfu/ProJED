import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  migration: 'supabase/migrations/20260715120000_calendar_subscription_delete_rpc.sql',
  service: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  view: 'src/components/CalendarSubscriptionsView.tsx',
};

const source = Object.fromEntries(
  Object.entries(files).map(([label, file]) => [label, existsSync(resolve(file)) ? readFileSync(resolve(file), 'utf8') : '']),
);
const results = [];
const add = (name, ok) => results.push({ name, ok });

add(
  'Delete RPC is owner-bound and revokes the token by deleting the row',
  source.migration.includes('security definer') &&
    source.migration.includes("set search_path = ''") &&
    source.migration.includes('delete from public.calendar_subscriptions') &&
    source.migration.includes('owner_user_id = actor_user_id') &&
    source.migration.includes('return deleted_rows = 1;'),
);

add(
  'Delete RPC is authenticated-only',
  source.migration.includes('revoke execute on function public.delete_calendar_subscription(uuid) from public, anon;') &&
    source.migration.includes('grant execute on function public.delete_calendar_subscription(uuid) to authenticated;'),
);

add(
  'Client service calls the delete RPC and handles a missing owned row',
  source.service.includes("supabase.rpc('delete_calendar_subscription'") &&
    source.service.includes('找不到可刪除的行事曆訂閱。'),
);

add(
  'Generated database contract includes the delete RPC signature',
  source.databaseTypes.includes('delete_calendar_subscription: {') &&
    source.databaseTypes.includes('target_subscription_id: string;') &&
    source.databaseTypes.includes('Returns: boolean;'),
);

add(
  'UI requires confirmation and communicates permanent deletion plus feed revocation',
  source.view.includes('data-calendar-subscription-delete-dialog="true"') &&
    source.view.includes('刪除並撤銷連結') &&
    source.view.includes('這會永久刪除訂閱設定並讓舊 ICS 連結失效') &&
    source.view.includes('setSubscriptionToDelete(subscription)'),
);

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
