import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  databaseTypes: 'src/services/supabase/database.types.ts',
  calendarView: 'src/components/CalendarSubscriptionsView.tsx',
  builder: 'src/components/CalendarSubscriptionBuilderPreview.tsx',
  packageJson: 'package.json',
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
  'CalendarSubscriptionFilters exposes DEV-045 v2 local contract without deleting DEV-037 v1 scope type',
  source.databaseTypes.includes("export type CalendarSubscriptionScopeType = 'board' | 'workspace' | 'custom';") &&
    source.databaseTypes.includes("export type CalendarSubscriptionV2ScopeType = 'all_accessible_boards_snapshot';") &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterOverride') &&
    source.databaseTypes.includes('version?: 1 | 2;') &&
    source.databaseTypes.includes('v2_scope_type?: CalendarSubscriptionV2ScopeType;') &&
    source.databaseTypes.includes('global_filter?: TaskFilterState;') &&
    source.databaseTypes.includes('board_overrides?: Record<string, CalendarSubscriptionBoardFilterOverride>;'),
);

assert(
  'CalendarSubscriptionsView mounts the v2 Builder while preserving v1 source-scope compatibility block',
  source.calendarView.includes("from './CalendarSubscriptionBuilderPreview'") &&
    source.calendarView.includes('<CalendarSubscriptionBuilderPreview') &&
    source.calendarView.includes('selectedAssigneeIds={selectedAssigneeIdsForPreview}') &&
    source.calendarView.includes('dateTypes={filters.date_types}') &&
    source.calendarView.includes('onPayloadChange={setBuilderPayload}') &&
    source.calendarView.includes('data-calendar-subscription-scope-form="true"') &&
    source.calendarView.includes('目前看板') &&
    source.calendarView.includes('工作區全部看板') &&
    source.calendarView.includes('自訂範圍'),
);

assert(
  'Builder computes local preview from in-memory tasks and shared task filter semantics',
  source.builder.includes("from '../store/useWbsStore'") &&
    source.builder.includes("from '../store/useTagStore'") &&
    source.builder.includes('matchesTaskFilters') &&
    source.builder.includes('normalizeTaskFilters') &&
    source.builder.includes('TASK_STATUS_OPTIONS') &&
    source.builder.includes('hasTaskCalendarDate') &&
    source.builder.includes('data-calendar-subscription-live-preview="true"') &&
    source.builder.includes('data-calendar-subscription-builder-preview-count'),
);

assert(
  'Builder supports global filters and per-board inherit/custom/exclude modes',
  source.builder.includes('data-calendar-subscription-builder="true"') &&
    source.builder.includes('data-calendar-subscription-condition-controls="true"') &&
    source.builder.includes('data-calendar-subscription-board-override="true"') &&
    source.builder.includes('沿用') &&
    source.builder.includes('自訂') &&
    source.builder.includes('排除') &&
    source.builder.includes('board_overrides') &&
    source.builder.includes('enabled: false') &&
    source.builder.includes('useCustomFilter'),
);

assert(
  'Builder captures output summary and external-link risk before future create/feed integration',
  source.builder.includes('all_accessible_boards_snapshot') &&
    source.builder.includes('這條連結會輸出') &&
    source.builder.includes('任何持有此連結的人都能讀取連結中的事件內容') &&
    source.calendarView.includes('v2 snapshot') &&
    source.calendarView.includes('DEV-045 Phase 2 Supabase migration 與 Edge Function'),
);

assert(
  'Builder stays separate from TaskWorkbench UI state and display settings',
  !source.builder.includes('TaskWorkbenchPanel') &&
    !source.builder.includes('WorkbenchFilterControls') &&
    !source.builder.includes('placement') &&
    !source.builder.includes('列表') &&
    !source.builder.includes('群組') &&
    !source.builder.includes('showDependencies') &&
    !source.builder.includes('showStartDate') &&
    !source.builder.includes('showTags'),
);

assert(
  'DEV-045 package script and governance docs are discoverable',
  source.packageJson.includes('"verify:dev-045-calendar-subscription-builder-preview"') &&
    source.spec.includes('Phase 1 - Builder UI + local preview') &&
    source.spec.includes('Phase 1 Local RD Implemented / Static QC Passed') &&
    source.qa.includes('QA-045-B01') &&
    source.qc.includes('Phase 1 local Builder slice 已完成本機實作與 static/build QC') &&
    source.devTask.includes('DEV-045 Phase 3 remote Supabase / Edge / live `.ics` gate') &&
    source.documentationMap.includes('DEV-045 Phase 1 Builder 與 Phase 2 local source 已完成'),
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
