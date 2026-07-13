import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  dev037Migration: 'supabase/migrations/20260706091804_calendar_subscription_source_scope.sql',
  dev045V2Migration: 'supabase/migrations/20260706162052_calendar_subscription_v2_filters.sql',
  dev045V3Migration: 'supabase/migrations/20260711171058_calendar_subscription_v3_per_board_filters.sql',
  edgeFunction: 'supabase/functions/calendar-feed/index.ts',
  calendarService: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  localDbSmoke: 'scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs',
  spec: 'ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md',
  qa: 'ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md',
  preProductionQa: 'ai-doc/qa/QA-DEV-045-pre-production-release-validation.md',
  qc: 'ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

let packageJson = {};
try {
  packageJson = JSON.parse(source.packageJson ?? '{}');
} catch (error) {
  assert('package.json parses as JSON', false, error.message);
}

const readinessScript = packageJson.scripts?.['verify:dev-045-calendar-subscription-remote-readiness'] ?? '';
const localGateScripts = [
  readinessScript,
  packageJson.scripts?.['verify:dev-045-calendar-subscription-builder-preview'] ?? '',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-builder-preview-browser'] ?? '',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-v2-feed'] ?? '',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-v3-feed'] ?? '',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-v3-model'] ?? '',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-local-db-smoke'] ?? '',
  packageJson.scripts?.['verify:dev-037-calendar-subscription-source-scope'] ?? '',
  packageJson.scripts?.['verify:dev-037-calendar-subscription-source-scope-browser'] ?? '',
];

assert(
  'Remote readiness package script is a local node verifier, not a deploy command',
  readinessScript === 'node scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
  readinessScript,
);

assert(
  'DEV-045 local DB smoke gate is registered as rollback-only and local-only',
  packageJson.scripts?.['verify:dev-045-calendar-subscription-local-db-smoke'] ===
    'node scripts/verify-dev-045-calendar-subscription-local-db-smoke.mjs' &&
    source.localDbSmoke.includes('--run-local-db') &&
    source.localDbSmoke.includes('rollback;') &&
    source.localDbSmoke.includes('docker') &&
    !source.localDbSmoke.includes('supabase db push') &&
    !source.localDbSmoke.includes('supabase functions deploy') &&
    !source.localDbSmoke.includes('firebase deploy'),
);

assert(
  'DEV-045 local gate scripts do not contain direct remote deploy/migration commands',
  localGateScripts.every(command => {
    const lower = command.toLowerCase();
    return !lower.includes('supabase db push') &&
      !lower.includes('supabase migration') &&
      !lower.includes('supabase functions deploy') &&
      !lower.includes('firebase deploy') &&
      !lower.includes('deploy --prod');
  }),
  localGateScripts,
);

assert(
  'DEV-037, DEV-045 v2 compatibility, and DEV-045 v3 migrations preserve release order',
  basename(files.dev037Migration) < basename(files.dev045V2Migration) &&
    basename(files.dev045V2Migration) < basename(files.dev045V3Migration) &&
    source.dev037Migration.includes('scope_type') &&
    source.dev037Migration.includes('project_ids') &&
    source.dev037Migration.includes('private.current_user_can_read_project') &&
    source.dev045V2Migration.includes('DEV-045 Phase 2') &&
    source.dev045V3Migration.includes('calendar_subscription_v3_filter_allowed'),
);

assert(
  'DEV-045 v3 migration validates exact per-board snapshots and scoped execute grants',
  source.dev045V3Migration.includes("filters ->> 'version' <> '3'") &&
    source.dev045V3Migration.includes("filters ->> 'v3_scope_type' <> 'per_board_filter_snapshot'") &&
    source.dev045V3Migration.includes("filters ? 'global_filter'") &&
    source.dev045V3Migration.includes("filters ? 'board_overrides'") &&
    source.dev045V3Migration.includes("filters ? 'date_types'") &&
    source.dev045V3Migration.includes("cardinality(project_ids) <> (select count(*) from jsonb_each(filters -> 'board_filters'))") &&
    source.dev045V3Migration.includes("jsonb_typeof(board_snapshot.value -> 'included') <> 'boolean'") &&
    source.dev045V3Migration.includes("jsonb_typeof(board_snapshot.value -> 'date_types') <> 'array'") &&
    source.dev045V3Migration.includes('private.current_user_can_read_project') &&
    source.dev045V3Migration.includes('private.current_user_can_manage_project') &&
    source.dev045V3Migration.includes('return included_board_count > 0') &&
    source.dev045V3Migration.includes('revoke execute on function public.calendar_subscription_v3_filter_allowed(jsonb) from public, anon') &&
    source.dev045V3Migration.includes('grant execute on function public.calendar_subscription_v3_filter_allowed(jsonb) to authenticated'),
);

assert(
  'Client write path normalizes canonical v3 snapshots and retains v2 compatibility',
  source.calendarService.includes('normalizeV3Filters') &&
    source.calendarService.includes("version: 3") &&
    source.calendarService.includes("v3_scope_type: 'per_board_filter_snapshot'") &&
    source.calendarService.includes('board_filters: normalizedBoardFilters') &&
    source.calendarService.includes('usedSnapshotKeys.size !== inputSnapshotKeys.length') &&
    source.calendarService.includes('snapshot.included && snapshotDateTypes.length === 0') &&
    source.calendarService.includes('normalizeV2Filters') &&
    source.databaseTypes.includes('CalendarSubscriptionV3ScopeType') &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterSnapshot') &&
    source.databaseTypes.includes('CalendarSubscriptionV2ScopeType') &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterOverride'),
);

assert(
  'Local Edge Function applies v3 per-board filters, dates, tags, and permission scope',
  source.edgeFunction.includes('normalizeBoardFilters') &&
    source.edgeFunction.includes('filters.version === 3') &&
    source.edgeFunction.includes('filters.boardFilters[projectId]') &&
    source.edgeFunction.includes('matchesSubscriptionTaskFilters') &&
    source.edgeFunction.includes('getEffectiveDateTypes') &&
    source.edgeFunction.includes('attachTaskTags') &&
    source.edgeFunction.includes('getAllowedTenantAndProjectScope') &&
    source.edgeFunction.includes('.from("wbs_item_tags")') &&
    source.edgeFunction.includes('hasTaskCalendarDate(item, getEffectiveDateTypes(normalizedFilters, item.project_id))') &&
    source.edgeFunction.includes('matchesSubscriptionTaskFilters(item, normalizedFilters)') &&
    source.edgeFunction.includes('includedProjectIds.has(project.id) && projectIds.includes(project.id)') &&
    source.edgeFunction.includes('.in("project_id", allowedScope.projectIds)'),
);

assert(
  'Governance docs freeze the former v2 gate and require the v3 Level 3 release plan',
  source.spec.includes('Former v2 Remote Gate Superseded and Frozen') &&
    source.spec.includes('### Phase 3 - Level 3 remote gate') &&
    source.qa.includes('QA-DEV-045-pre-production-release-validation.md') &&
    source.qa.includes('Level 3 readiness') &&
    source.qc.includes('後續 release必須使用 v3 migration / Edge source重新進入 Level 3') &&
    source.devTask.includes('以 v3 migration / Edge source進入 Level 3') &&
    source.documentationMap.includes('QA-DEV-045-pre-production-release-validation.md'),
);

assert(
  'Pre-production plan keeps remote mutation gated by TEST health, provenance, backup, and rollback evidence',
  source.preProductionQa.includes('QA Plan Ready / Execution Not Started / Level 3 Required / Production Deploy Not Authorized') &&
    source.preProductionQa.includes('Firebase Hosting `level3-smoke` + Supabase `ProJED-TEST`') &&
    source.preProductionQa.includes('| E02 Provenance |') &&
    source.preProductionQa.includes('| E04 TEST health |') &&
    source.preProductionQa.includes('| E07 Backup |') &&
    source.preProductionQa.includes('| E08 Rollback baseline |') &&
    source.preProductionQa.includes('不得部署live channel'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
