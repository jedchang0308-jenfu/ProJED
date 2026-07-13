import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  calendarView: 'src/components/CalendarSubscriptionsView.tsx',
  conversion: 'src/features/calendarSubscriptions/filters.ts',
  service: 'src/services/supabase/calendarSubscriptionService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  edgeFunction: 'supabase/functions/calendar-feed/index.ts',
  migration: 'supabase/migrations/20260706162052_calendar_subscription_v2_filters.sql',
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

assert(
  'Frontend submit persists the canonical v3 Builder payload without restoring the legacy scope form',
  source.calendarView.includes('buildSubmissionFilters') &&
    source.calendarView.includes('builderPayload ?? filters') &&
    source.calendarView.includes('filters: submissionFilters') &&
    source.calendarView.includes('<CalendarSubscriptionBuilderPreview') &&
    source.calendarView.includes('initialFilters={filters}') &&
    !source.calendarView.includes('data-calendar-subscription-scope-form="true"'),
);

assert(
  'Client service retains defensive v2 normalization for existing rows',
  source.service.includes('normalizeV2Filters') &&
    source.service.includes("v2_scope_type: 'all_accessible_boards_snapshot'") &&
    source.service.includes("version: 2") &&
    source.service.includes("scope_type: 'custom'") &&
    source.service.includes('normalizeTaskFilters(filters.global_filter)') &&
    source.service.includes('normalizeBoardOverrides') &&
    source.service.includes('看板條件不屬於此訂閱範圍'),
);

assert(
  'Existing v2 rows materialize global and override filters into independent board snapshots',
  source.conversion.includes("filters.version === 2 || filters.v2_scope_type === 'all_accessible_boards_snapshot'") &&
    source.conversion.includes('findRecordByAlias(filters.board_overrides, aliases)') &&
    source.conversion.includes('override?.enabled !== false') &&
    source.conversion.includes('normalizeTaskFilters(filters.global_filter)') &&
    source.conversion.includes('date_types: [...legacyDateTypes]'),
);

assert(
  'Database type contract exposes v2 filter fields',
  source.databaseTypes.includes('CalendarSubscriptionV2ScopeType') &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterOverride') &&
    source.databaseTypes.includes('global_filter?: TaskFilterState;') &&
    source.databaseTypes.includes('board_overrides?: Record<string, CalendarSubscriptionBoardFilterOverride>;'),
);

assert(
  'Migration validates v2 payload shape and readable project snapshot',
  source.migration.includes('calendar_subscription_task_filter_allowed') &&
    source.migration.includes('all_accessible_boards_snapshot') &&
    source.migration.includes("version_value not in ('1', '2')") &&
    source.migration.includes('calendar_subscription_task_filter_allowed(filters ->') &&
    source.migration.includes("jsonb_each(filters -> 'board_overrides')") &&
    source.migration.includes('board_override.key::uuid <> all(project_ids)') &&
    source.migration.includes('private.current_user_can_read_project') &&
    source.migration.includes('revoke execute on function public.calendar_subscription_task_filter_allowed(jsonb) from public, anon') &&
    source.migration.includes('revoke execute on function public.calendar_subscription_filter_allowed(jsonb) from public, anon') &&
    source.migration.includes('grant execute on function public.calendar_subscription_task_filter_allowed(jsonb) to authenticated') &&
    source.migration.includes('grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated'),
);

assert(
  'Edge feed applies v2 compatibility filters after permission-scoped task query',
  source.edgeFunction.includes('type TaskFilterState') &&
    source.edgeFunction.includes('normalizeTaskFilterState') &&
    source.edgeFunction.includes('normalizeBoardOverrides') &&
    source.edgeFunction.includes('getEffectiveTaskFilter') &&
    source.edgeFunction.includes('matchesSubscriptionTaskFilters') &&
    source.edgeFunction.includes('attachTaskTags') &&
    source.edgeFunction.includes('.from("wbs_item_tags")') &&
    source.edgeFunction.includes('matchesSubscriptionTaskFilters(item, normalizedFilters)') &&
    source.edgeFunction.includes('getAllowedTenantAndProjectScope'),
);

assert(
  'Edge matcher covers status, due date, assignee, tag, keyword, and per-board exclusion',
  source.edgeFunction.includes('DEFAULT_STATUS_FILTERS') &&
    source.edgeFunction.includes('matchesDueDateFilter') &&
    source.edgeFunction.includes('matchesAssigneeFilter') &&
    source.edgeFunction.includes('matchesTagFilter') &&
    source.edgeFunction.includes('matchesKeywordFilter') &&
    source.edgeFunction.includes('override?.enabled === false') &&
    source.edgeFunction.includes('Asia/Taipei'),
);

assert(
  'Package script and governance docs classify v2 as historical compatibility evidence',
  source.packageJson.includes('"verify:dev-045-calendar-subscription-v2-feed"') &&
    source.spec.includes('### v2 historical local contract') &&
    source.qa.includes('v1/v2 materialization') &&
    source.qc.includes('Historical v2 Evidence Preserved') &&
    source.devTask.includes('Historical v2 Evidence Preserved') &&
    source.documentationMap.includes('Historical v2 Evidence Preserved'),
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
