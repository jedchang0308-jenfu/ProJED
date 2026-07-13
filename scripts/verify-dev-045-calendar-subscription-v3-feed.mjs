import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  calendarView: 'src/components/CalendarSubscriptionsView.tsx',
  service: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  edgeFunction: 'supabase/functions/calendar-feed/index.ts',
  migration: 'supabase/migrations/20260711171058_calendar_subscription_v3_per_board_filters.sql',
  policyRebindMigration: 'supabase/migrations/20260713033000_calendar_subscription_v3_rls_policy_rebind.sql',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details) => results.push({ name, ok, details });
for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}
const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'Frontend persists the v3 builder payload as the only save contract',
  source.calendarView.includes('builderPayload ?? filters') &&
    source.calendarView.includes('onValidationChange={setBuilderValidation}') &&
    !source.calendarView.includes("scope_type: 'custom',\n      assignee: filters.assignee"),
);

assert(
  'Client resolves aliases and normalizes an exact per-board snapshot map',
  source.service.includes('normalizeV3Filters') &&
    source.service.includes("v3_scope_type: 'per_board_filter_snapshot'") &&
    source.service.includes('usedSnapshotKeys.size !== inputSnapshotKeys.length') &&
    source.service.includes('normalizedBoardFilters[project.id]') &&
    source.service.includes('snapshotDateTypes') &&
    source.service.includes('至少需要一種事件日期') &&
    source.service.includes('至少需要包含一張看板'),
);

assert(
  'SQL preserves v1/v2 and enforces exact v3 project-to-snapshot coverage',
  source.migration.includes('calendar_subscription_v1_v2_filter_allowed') &&
    source.migration.includes('calendar_subscription_v3_filter_allowed') &&
    source.migration.includes("cardinality(project_ids) <> (select count(*) from jsonb_each(filters -> 'board_filters'))") &&
    source.migration.includes('snapshot_project_id <> all(project_ids)') &&
    source.migration.includes("or filters ? 'date_types'") &&
    source.migration.includes("board_snapshot.value -> 'date_types'") &&
    source.migration.includes('included_board_count > 0'),
);

assert(
  'SQL evaluates manage permission and assignee membership per included board',
  source.migration.includes('private.current_user_can_manage_project(snapshot_tenant_id, snapshot_project_id)') &&
    source.migration.includes("selected_assignee <> '__unassigned__'") &&
    source.migration.includes('tm.tenant_id = snapshot_tenant_id') &&
    source.migration.includes('tm.status = \'active\''),
);

assert(
  'SQL write policies are rebound to the v3-aware validator after the function rename',
  source.policyRebindMigration.includes('drop policy if exists "users create own calendar subscriptions"') &&
    source.policyRebindMigration.includes('drop policy if exists "users update own calendar subscriptions"') &&
    source.policyRebindMigration.match(/calendar_subscription_filter_allowed\(filters_json\)/g)?.length === 2 &&
    !source.policyRebindMigration.includes('calendar_subscription_v1_v2_filter_allowed(filters_json)'),
);

assert(
  'Edge normalizes and applies v3 filters per project after permission scoping',
  source.edgeFunction.includes('normalizeBoardFilters') &&
    source.edgeFunction.includes('filters.version === 3') &&
    source.edgeFunction.includes('snapshot?.included ? snapshot.filters : null') &&
    source.edgeFunction.includes('getEffectiveDateTypes') &&
    source.edgeFunction.includes('dateTypesByProjectId') &&
    source.edgeFunction.includes('projectRequiresManagePermission') &&
    source.edgeFunction.includes('matchesSubscriptionTaskFilters') &&
    source.edgeFunction.includes('attachTaskTags'),
);

assert(
  'Edge coarse assignee query cannot drop unrestricted per-board results',
  source.edgeFunction.includes('unrestricted = true') &&
    source.edgeFunction.includes('if (!assigneeSelection.unrestricted)') &&
    source.edgeFunction.includes('getProjectSelectedUserIds') &&
    source.edgeFunction.includes('includedProjectIds.has(project.id)'),
);

assert(
  'Package exposes the v3 feed verifier',
  source.packageJson.includes('verify:dev-045-calendar-subscription-v3-feed'),
);

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
