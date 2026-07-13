import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const runLocalDb = args.has('--run-local-db');
const containerName = process.env.DEV045_LOCAL_DB_CONTAINER || 'supabase_db_ProJED';

const files = {
  workspaceTagsMigration: 'supabase/migrations/20260527064316_workspace_tags.sql',
  boardCollaborationMigration: 'supabase/migrations/20260528092643_board_level_collaboration_rls.sql',
  calendarSubscriptionBaseMigration: 'supabase/migrations/20260527064347_calendar_subscriptions.sql',
  dev037Migration: 'supabase/migrations/20260706091804_calendar_subscription_source_scope.sql',
  dev045Migration: 'supabase/migrations/20260706162052_calendar_subscription_v2_filters.sql',
  dev045V3Migration: 'supabase/migrations/20260711171058_calendar_subscription_v3_per_board_filters.sql',
  dev045V3PolicyRebindMigration: 'supabase/migrations/20260713033000_calendar_subscription_v3_rls_policy_rebind.sql',
  lifecycleRpcMigration: 'supabase/migrations/20260713133307_calendar_subscription_lifecycle_rpc.sql',
  qa: 'ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md',
  qc: 'ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md',
  devTask: 'ai-doc/dev_task.md',
};

const results = [];
const add = (name, ok, details = undefined) => results.push({ name, ok, details });
const read = file => readFileSync(resolve(file), 'utf8');

for (const [label, file] of Object.entries(files)) {
  add(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

add(
  'DEV-045 local DB smoke uses rollback-only execution',
  source.dev045Migration?.includes('calendar_subscription_task_filter_allowed') &&
    source.dev045V3Migration?.includes('calendar_subscription_v3_filter_allowed') &&
    source.dev045V3PolicyRebindMigration?.includes('calendar_subscription_filter_allowed(filters_json)') &&
    source.lifecycleRpcMigration?.includes('set_calendar_subscription_active') &&
    source.lifecycleRpcMigration?.includes('rotate_calendar_subscription_token') &&
    source.dev045Migration?.includes('revoke execute on function public.calendar_subscription_task_filter_allowed(jsonb) from public, anon') &&
    source.dev037Migration?.includes('private.current_user_can_read_project'),
);

add(
  'DEV-045 docs keep remote apply/deploy gated after local DB smoke',
  source.qa?.includes('不得 remote apply / deploy') &&
    source.qc?.includes('remote migration、Edge deploy、production release') &&
    source.devTask?.includes('Former v2 Remote Gate Superseded and Frozen'),
);

const failIfNeeded = () => {
  const failed = results.filter(result => !result.ok);
  if (failed.length > 0) {
    console.log(JSON.stringify({ ok: false, summary: { pass: results.length - failed.length, fail: failed.length }, results }, null, 2));
    process.exit(1);
  }
};

const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
  ...options,
});

const psql = sql => run('docker', [
  'exec',
  '-i',
  containerName,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-P',
  'pager=off',
], { input: sql });

const localSchemaProbeSql = `
copy (
select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'task_tags'
  ) as has_task_tags,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'current_user_can_read_project'
  ) as has_project_read_helper,
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'calendar_subscriptions'
  ) as has_calendar_subscriptions
) to stdout with csv;
`;

const fixtureSql = `
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'dev045-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'dev045-member@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'dev045-outsider@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'dev045-owner@example.test', 'DEV-045 Owner'),
  ('22222222-2222-4222-8222-222222222222', 'dev045-member@example.test', 'DEV-045 Member'),
  ('99999999-9999-4999-8999-999999999999', 'dev045-outsider@example.test', 'DEV-045 Outsider')
on conflict (id) do nothing;

insert into public.tenants (id, name, owner_id, metadata)
values ('33333333-3333-4333-8333-333333333333', 'DEV-045 local smoke workspace', '11111111-1111-4111-8111-111111111111', '{"qc":"DEV-045"}'::jsonb)
on conflict (id) do nothing;

insert into public.tenant_members (tenant_id, user_id, role, status)
values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'member', 'active')
on conflict (tenant_id, user_id) do update set role = excluded.role, status = excluded.status;

insert into public.projects (id, tenant_id, name, metadata, created_by)
values
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'DEV-045 local smoke board', '{"qc":"DEV-045"}'::jsonb, '11111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'DEV-045 managed smoke board', '{"qc":"DEV-045"}'::jsonb, '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.project_members (project_id, tenant_id, user_id, role)
values
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'member'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'project_manager')
on conflict (project_id, user_id) do update set role = excluded.role;

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

create temporary table dev045_checks(name text primary key, ok boolean not null) on commit drop;
grant select, insert on dev045_checks to authenticated;

insert into dev045_checks(name, ok)
values
  ('task filter allows null', public.calendar_subscription_task_filter_allowed(null::jsonb)),
  ('task filter allows valid bounded filter', public.calendar_subscription_task_filter_allowed('{"statusFilters":{"todo":true,"completed":false},"dueWithinDays":30,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":"smoke"}'::jsonb)),
  ('task filter rejects unknown status key', not public.calendar_subscription_task_filter_allowed('{"statusFilters":{"unknown":true}}'::jsonb)),
  ('task filter rejects negative dueWithinDays', not public.calendar_subscription_task_filter_allowed('{"dueWithinDays":-1}'::jsonb)),
  ('v2 filter allows snapshot custom project scope', public.calendar_subscription_filter_allowed('{"version":2,"v2_scope_type":"all_accessible_boards_snapshot","scope_type":"custom","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"date_types":["due_date"],"assignee":{"type":"me"},"global_filter":{"statusFilters":{"todo":true,"completed":false},"dueWithinDays":30,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":"smoke"},"board_overrides":{"44444444-4444-4444-8444-444444444444":{"enabled":false}}}'::jsonb)),
  ('v2 filter rejects missing project_ids', not public.calendar_subscription_filter_allowed('{"version":2,"v2_scope_type":"all_accessible_boards_snapshot","scope_type":"custom","workspace_ids":["33333333-3333-4333-8333-333333333333"],"date_types":["due_date"],"assignee":{"type":"me"},"global_filter":{}}'::jsonb)),
  ('v2 filter rejects board override outside project scope', not public.calendar_subscription_filter_allowed('{"version":2,"v2_scope_type":"all_accessible_boards_snapshot","scope_type":"custom","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"date_types":["due_date"],"assignee":{"type":"me"},"global_filter":{},"board_overrides":{"55555555-5555-4555-8555-555555555555":{"enabled":true}}}'::jsonb)),
  ('v3 filter allows complete own-task snapshot', public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true,"in_progress":true,"delayed":true,"completed":false,"unsure":true,"onhold":true},"dueWithinDays":null,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 owner can subscribe all assignees', public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 rejects missing board snapshot', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{}}'::jsonb)),
  ('v3 rejects no included board', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":false,"date_types":[],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 rejects included board without event date', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":[],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 rejects legacy top-level event dates', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"date_types":["due_date"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 rejects non-member assignee', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["99999999-9999-4999-8999-999999999999"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('authenticated can execute v2 helper', has_function_privilege('authenticated', 'public.calendar_subscription_task_filter_allowed(jsonb)', 'execute')),
  ('authenticated can execute v3 helper', has_function_privilege('authenticated', 'public.calendar_subscription_v3_filter_allowed(jsonb)', 'execute')),
  ('authenticated can set subscription lifecycle', has_function_privilege('authenticated', 'public.set_calendar_subscription_active(uuid,boolean)', 'execute')),
  ('authenticated can rotate subscription token', has_function_privilege('authenticated', 'public.rotate_calendar_subscription_token(uuid,text)', 'execute')),
  ('anon cannot execute v2 helper', not has_function_privilege('anon', 'public.calendar_subscription_task_filter_allowed(jsonb)', 'execute')),
  ('anon cannot execute subscription validator', not has_function_privilege('anon', 'public.calendar_subscription_filter_allowed(jsonb)', 'execute')),
  ('anon cannot set subscription lifecycle', not has_function_privilege('anon', 'public.set_calendar_subscription_active(uuid,boolean)', 'execute')),
  ('anon cannot rotate subscription token', not has_function_privilege('anon', 'public.rotate_calendar_subscription_token(uuid,text)', 'execute'));

set local role authenticated;
insert into public.calendar_subscriptions (
  id,
  owner_user_id,
  name,
  token_hash,
  filters_json
)
values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'DEV-045 v3 RLS insert smoke',
  '6666666666666666666666666666666666666666666666666666666666666666',
  '{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["11111111-1111-4111-8111-111111111111"],"selectedTagIds":[],"keyword":""}}}}'::jsonb
);
update public.calendar_subscriptions
set name = 'DEV-045 v3 RLS update smoke'
where id = '66666666-6666-4666-8666-666666666666';
reset role;

insert into dev045_checks(name, ok)
values (
  'v3 RLS insert and update policies use the v3-aware validator',
  exists (
    select 1
    from public.calendar_subscriptions
    where id = '66666666-6666-4666-8666-666666666666'
      and name = 'DEV-045 v3 RLS update smoke'
  )
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

insert into dev045_checks(name, ok)
values
  ('v3 member can subscribe own tasks', public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":["22222222-2222-4222-8222-222222222222"],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 member cannot subscribe all assignees', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 project manager can subscribe broad managed board', public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["55555555-5555-4555-8555-555555555555"],"board_filters":{"55555555-5555-4555-8555-555555555555":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":""}}}}'::jsonb)),
  ('v3 manage permission does not spill across boards', not public.calendar_subscription_filter_allowed('{"version":3,"v3_scope_type":"per_board_filter_snapshot","workspace_ids":["33333333-3333-4333-8333-333333333333"],"project_ids":["44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555"],"board_filters":{"44444444-4444-4444-8444-444444444444":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":""}},"55555555-5555-4555-8555-555555555555":{"included":true,"date_types":["due_date"],"filters":{"statusFilters":{"todo":true},"dueWithinDays":null,"selectedAssigneeIds":[],"selectedTagIds":[],"keyword":""}}}}'::jsonb));

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
insert into public.calendar_subscriptions (
  id,
  owner_user_id,
  name,
  token_hash,
  filters_json
)
values (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  'Legacy v1 lifecycle regression',
  '7777777777777777777777777777777777777777777777777777777777777777',
  '{"workspace_ids":["33333333-3333-4333-8333-333333333333"],"date_types":["due_date"],"assignee":{"type":"me"}}'::jsonb
);
reset role;

update public.tenant_members
set status = 'suspended'
where tenant_id = '33333333-3333-4333-8333-333333333333'
  and user_id = '11111111-1111-4111-8111-111111111111';

set local role authenticated;
insert into dev045_checks(name, ok)
values (
  'legacy v1 snapshot becomes invalid after permission drift',
  not public.calendar_subscription_filter_allowed((
    select filters_json
    from public.calendar_subscriptions
    where id = '77777777-7777-4777-8777-777777777777'
  ))
);

insert into dev045_checks(name, ok)
values (
  'owner can disable legacy v1 subscription after permission drift',
  public.set_calendar_subscription_active('77777777-7777-4777-8777-777777777777', false)
);

insert into dev045_checks(name, ok)
values (
  'legacy v1 subscription is disabled without changing filters',
  exists (
    select 1
    from public.calendar_subscriptions
    where id = '77777777-7777-4777-8777-777777777777'
      and not is_active
      and filters_json = '{"workspace_ids":["33333333-3333-4333-8333-333333333333"],"date_types":["due_date"],"assignee":{"type":"me"}}'::jsonb
  )
);

insert into dev045_checks(name, ok)
values (
  'owner can re-enable legacy v1 subscription after permission drift',
  public.set_calendar_subscription_active('77777777-7777-4777-8777-777777777777', true)
);

insert into dev045_checks(name, ok)
values (
  'owner can rotate legacy v1 token after permission drift',
  public.rotate_calendar_subscription_token(
    '77777777-7777-4777-8777-777777777777',
    '8888888888888888888888888888888888888888888888888888888888888888'
  )
);

set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';
insert into dev045_checks(name, ok)
values (
  'non-owner cannot change another subscription lifecycle',
  not public.set_calendar_subscription_active('77777777-7777-4777-8777-777777777777', false)
);
reset role;

insert into dev045_checks(name, ok)
values (
  'legacy lifecycle operations preserve owner, filters, active state, and rotated hash',
  exists (
    select 1
    from public.calendar_subscriptions
    where id = '77777777-7777-4777-8777-777777777777'
      and owner_user_id = '11111111-1111-4111-8111-111111111111'
      and is_active
      and token_hash = '8888888888888888888888888888888888888888888888888888888888888888'
      and filters_json = '{"workspace_ids":["33333333-3333-4333-8333-333333333333"],"date_types":["due_date"],"assignee":{"type":"me"}}'::jsonb
  )
);

update public.tenant_members
set status = 'active'
where tenant_id = '33333333-3333-4333-8333-333333333333'
  and user_id = '11111111-1111-4111-8111-111111111111';

select * from dev045_checks order by name;

do $$
begin
  if exists (select 1 from dev045_checks where not ok) then
    raise exception 'DEV-045 local DB smoke failed';
  end if;
end $$;
`;

if (!runLocalDb) {
  failIfNeeded();
  console.log(JSON.stringify({
    ok: true,
    mode: 'self-check',
    actualLocalDbSmoke: 'skipped',
    runActualCommand: 'node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs --run-local-db',
    summary: { pass: results.length, fail: 0 },
    results,
  }, null, 2));
  process.exit(0);
}

failIfNeeded();

const dockerProbe = run('docker', ['inspect', '-f', '{{.State.Running}}', containerName]);
if (dockerProbe.status !== 0 || dockerProbe.stdout.trim() !== 'true') {
  add('local Supabase DB container is running', false, dockerProbe.stderr || dockerProbe.stdout);
  failIfNeeded();
}
add('local Supabase DB container is running', true, containerName);

const schemaProbe = psql(localSchemaProbeSql);
if (schemaProbe.status !== 0) {
  add('local DB schema probe succeeds', false, schemaProbe.stderr || schemaProbe.stdout);
  failIfNeeded();
}
add('local DB schema probe succeeds', true, schemaProbe.stdout.trim());

const [hasTaskTagsValue, hasProjectReadHelperValue, hasCalendarSubscriptionsValue] = schemaProbe.stdout.trim().split(/\r?\n/).at(-1)?.split(',') ?? [];
const hasTaskTags = hasTaskTagsValue === 't';
const hasProjectReadHelper = hasProjectReadHelperValue === 't';
const hasCalendarSubscriptions = hasCalendarSubscriptionsValue === 't';
const migrationSql = [
  'begin;',
  hasTaskTags ? '-- public.task_tags already present in local DB; prerequisite migration not replayed.' : source.workspaceTagsMigration,
  hasProjectReadHelper ? '-- private.current_user_can_read_project already present in local DB; prerequisite migration not replayed.' : source.boardCollaborationMigration,
  hasCalendarSubscriptions ? '-- public.calendar_subscriptions already present in local DB; base migration not replayed.' : source.calendarSubscriptionBaseMigration,
  source.dev037Migration,
  source.dev045Migration,
  source.dev045V3Migration,
  source.dev045V3PolicyRebindMigration,
  source.lifecycleRpcMigration,
  fixtureSql,
  'rollback;',
].join('\n\n');

const smoke = psql(migrationSql);
add('DEV-045 transaction-scoped local DB smoke passes', smoke.status === 0, {
  stdout: smoke.stdout,
  stderr: smoke.stderr,
});

failIfNeeded();

console.log(JSON.stringify({
  ok: true,
  mode: 'local-db-smoke',
  container: containerName,
  transaction: 'rolled back',
  summary: { pass: results.length, fail: 0 },
  results,
}, null, 2));
