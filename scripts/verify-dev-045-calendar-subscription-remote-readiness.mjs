import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  dev037Migration: 'supabase/migrations/20260706091804_calendar_subscription_source_scope.sql',
  dev045Migration: 'supabase/migrations/20260706162052_calendar_subscription_v2_filters.sql',
  edgeFunction: 'supabase/functions/calendar-feed/index.ts',
  calendarService: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  spec: 'ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md',
  qa: 'ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md',
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
  packageJson.scripts?.['verify:dev-037-calendar-subscription-source-scope'] ?? '',
  packageJson.scripts?.['verify:dev-037-calendar-subscription-source-scope-browser'] ?? '',
];

assert(
  'Remote readiness package script is a local node verifier, not a deploy command',
  readinessScript === 'node scripts/verify-dev-045-calendar-subscription-remote-readiness.mjs',
  readinessScript,
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
  'DEV-037 source-scope migration is present before DEV-045 v2 filter migration',
  basename(files.dev037Migration) < basename(files.dev045Migration) &&
    source.dev037Migration.includes('scope_type') &&
    source.dev037Migration.includes('project_ids') &&
    source.dev037Migration.includes('private.current_user_can_read_project') &&
    source.dev045Migration.includes('DEV-045 Phase 2') &&
    source.dev045Migration.includes('source-controlled only until the Supabase DB gate applies it'),
);

assert(
  'DEV-045 migration validates v2 snapshot filters and keeps execute grants scoped',
  source.dev045Migration.includes('calendar_subscription_task_filter_allowed') &&
    source.dev045Migration.includes("all_accessible_boards_snapshot") &&
    source.dev045Migration.includes("version_value not in ('1', '2')") &&
    source.dev045Migration.includes("filters ? 'project_ids'") &&
    source.dev045Migration.includes("filters ? 'board_overrides'") &&
    source.dev045Migration.includes('board_override.key::uuid <> all(project_ids)') &&
    source.dev045Migration.includes('private.current_user_can_read_project') &&
    source.dev045Migration.includes('revoke execute on function public.calendar_subscription_task_filter_allowed(jsonb) from public, anon') &&
    source.dev045Migration.includes('revoke execute on function public.calendar_subscription_filter_allowed(jsonb) from public, anon') &&
    source.dev045Migration.includes('grant execute on function public.calendar_subscription_task_filter_allowed(jsonb) to authenticated') &&
    source.dev045Migration.includes('grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated'),
);

assert(
  'Client write path normalizes v2 subscriptions before insert/update',
  source.calendarService.includes('normalizeV2Filters') &&
    source.calendarService.includes("version: 2") &&
    source.calendarService.includes("v2_scope_type: 'all_accessible_boards_snapshot'") &&
    source.calendarService.includes('normalizeBoardOverrides') &&
    source.calendarService.includes('filters.project_ids ?? []') &&
    source.databaseTypes.includes('CalendarSubscriptionV2ScopeType') &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterOverride'),
);

assert(
  'Local Edge Function source contains the v2 matcher that production still lacks',
  source.edgeFunction.includes('matchesV2TaskFilters') &&
    source.edgeFunction.includes('attachTaskTags') &&
    source.edgeFunction.includes('getAllowedTenantAndProjectScope') &&
    source.edgeFunction.includes('.from("wbs_item_tags")') &&
    source.edgeFunction.includes('hasTaskCalendarDate(item, dateTypes) && matchesV2TaskFilters') &&
    source.edgeFunction.includes('override?.enabled === false') &&
    source.edgeFunction.includes('.in("project_id", allowedScope.projectIds)'),
);

assert(
  'Governance docs preserve the Phase 3 stop condition before remote apply/deploy',
  source.spec.includes('Level 3 production-like smoke path or explicit risk acceptance') &&
    source.qa.includes('Preferred：提供可用 staging / Supabase branch / local Supabase DB') &&
    source.qa.includes('Risk-accepted path：使用者明確接受無 Level 3') &&
    source.qc.includes('缺少 Level 3 production-like pre-deploy smoke') &&
    source.qc.includes('不得宣告 remote DB / Edge / production release safe') &&
    source.devTask.includes('Level 3 smoke path or explicit risk acceptance') &&
    source.documentationMap.includes('Supabase branch path 需 cost confirmation'),
);

assert(
  'Read-only discovery evidence confirms remote work is still pending, not completed',
  source.qc.includes('production migration history 尚未包含本地 DEV-037') &&
    source.qc.includes('deployed `calendar-feed` 仍是 version 3') &&
    source.devTask.includes('未建立 branch、未套 migration、未部署 Edge') &&
    source.documentationMap.includes('production 尚未套 DEV-037/045 migrations'),
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
