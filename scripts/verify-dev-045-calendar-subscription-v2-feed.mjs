import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  calendarView: 'src/components/CalendarSubscriptionsView.tsx',
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
  'Frontend submit persists Builder payload as v2 filters without removing v1 compatibility',
  source.calendarView.includes('buildSubmissionFilters') &&
    source.calendarView.includes('...builderPayload') &&
    source.calendarView.includes("scope_type: 'custom'") &&
    source.calendarView.includes('assignee: filters.assignee') &&
    source.calendarView.includes('date_types: filters.date_types') &&
    source.calendarView.includes('data-calendar-subscription-scope-form="true"') &&
    source.calendarView.includes('DEV-045 Phase 2 Supabase migration 與 Edge Function'),
);

assert(
  'Client service normalizes v2 snapshot filters before writing filters_json',
  source.service.includes('normalizeV2Filters') &&
    source.service.includes("v2_scope_type: 'all_accessible_boards_snapshot'") &&
    source.service.includes("version: 2") &&
    source.service.includes("scope_type: 'custom'") &&
    source.service.includes('normalizeTaskFilters(filters.global_filter)') &&
    source.service.includes('normalizeBoardOverrides') &&
    source.service.includes('看板條件不屬於此訂閱範圍'),
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
    source.migration.includes('grant execute on function public.calendar_subscription_filter_allowed(jsonb) to authenticated'),
);

assert(
  'Edge feed applies v2 filters after permission-scoped task query',
  source.edgeFunction.includes('type TaskFilterState') &&
    source.edgeFunction.includes('normalizeTaskFilterState') &&
    source.edgeFunction.includes('normalizeBoardOverrides') &&
    source.edgeFunction.includes('matchesV2TaskFilters') &&
    source.edgeFunction.includes('attachTaskTags') &&
    source.edgeFunction.includes('.from("wbs_item_tags")') &&
    source.edgeFunction.includes('hasTaskCalendarDate(item, dateTypes) && matchesV2TaskFilters') &&
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
  'Package script and governance docs record Phase 2 source boundary',
  source.packageJson.includes('"verify:dev-045-calendar-subscription-v2-feed"') &&
    source.spec.includes('Phase 2 Local Source Implemented / Remote DB-Edge-Production Not Executed') &&
    source.qa.includes('verify:dev-045-calendar-subscription-v2-feed') &&
    source.qc.includes('DEV-045 Phase 2 local source') &&
    source.devTask.includes('Phase 2 Local Source Implemented / Remote DB-Edge-Production Not Executed') &&
    source.documentationMap.includes('DEV-045 Phase 2 local source'),
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
