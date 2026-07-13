import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  migration: 'supabase/migrations/20260713133307_calendar_subscription_lifecycle_rpc.sql',
  service: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
};

const results = [];
const add = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  add(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, readFileSync(resolve(file), 'utf8')]),
);

add(
  'Lifecycle RPCs are security-definer functions with an empty search path',
  (source.migration?.match(/security definer/g) ?? []).length === 2 &&
    (source.migration?.match(/set search_path = ''/g) ?? []).length === 2,
);

add(
  'Lifecycle RPCs bind every mutation to the authenticated owner',
  (source.migration?.match(/actor_user_id uuid := auth\.uid\(\)/g) ?? []).length === 2 &&
    (source.migration?.match(/owner_user_id = actor_user_id/g) ?? []).length === 2,
);

add(
  'Lifecycle RPC access is authenticated-only',
  source.migration?.includes('revoke execute on function public.set_calendar_subscription_active(uuid, boolean) from public, anon;') &&
    source.migration?.includes('revoke execute on function public.rotate_calendar_subscription_token(uuid, text) from public, anon;') &&
    source.migration?.includes('grant execute on function public.set_calendar_subscription_active(uuid, boolean) to authenticated;') &&
    source.migration?.includes('grant execute on function public.rotate_calendar_subscription_token(uuid, text) to authenticated;'),
);

add(
  'Token rotation accepts only lowercase SHA-256 hashes',
  source.migration?.includes("target_token_hash !~ '^[0-9a-f]{64}$'") &&
    source.migration?.includes('token_hash = target_token_hash'),
);

add(
  'Client lifecycle methods use RPCs instead of filter-validating table updates',
  source.service?.includes("supabase.rpc('set_calendar_subscription_active'") &&
    source.service?.includes("supabase.rpc('rotate_calendar_subscription_token'") &&
    !source.service?.includes('.update({ is_active:') &&
    !source.service?.includes('.update({ token_hash:'),
);

add(
  'Generated database contract includes lifecycle RPC signatures',
  source.databaseTypes?.includes('set_calendar_subscription_active: {') &&
    source.databaseTypes?.includes('rotate_calendar_subscription_token: {') &&
    source.databaseTypes?.includes('target_is_active: boolean;') &&
    source.databaseTypes?.includes('target_token_hash: string;'),
);

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
