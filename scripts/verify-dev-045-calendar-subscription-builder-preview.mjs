import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  databaseTypes: 'src/services/supabase/database.types.ts',
  calendarView: 'src/components/CalendarSubscriptionsView.tsx',
  builder: 'src/components/CalendarSubscriptionBuilderPreview.tsx',
  sharedControls: 'src/components/ui/TaskConditionFilterControls.tsx',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  conversion: 'src/features/calendarSubscriptions/filters.ts',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-045-calendar-subscription-filter-builder-preview.md',
  qa: 'ai-doc/qa/QA-DEV-045-calendar-subscription-filter-builder-preview.md',
  qc: 'ai-doc/qc/QC-DEV-045-calendar-subscription-builder-preview.md',
  adr: 'ai-doc/decisions/ADR-038-calendar-subscription-per-board-filter-snapshot.md',
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
  'v3 contract is explicit and keeps v1/v2 read compatibility',
  source.databaseTypes.includes("CalendarSubscriptionV3ScopeType = 'per_board_filter_snapshot'") &&
    source.databaseTypes.includes('CalendarSubscriptionBoardFilterSnapshot') &&
    source.databaseTypes.includes('version?: 1 | 2 | 3;') &&
    source.databaseTypes.includes('board_filters?: Record<string, CalendarSubscriptionBoardFilterSnapshot>;'),
);

assert(
  'Workbench and calendar builder use one shared condition-control component',
  source.workbench.includes('<TaskConditionFilterControls') &&
    source.builder.includes('<TaskConditionFilterControls') &&
    source.sharedControls.includes('data-task-condition-filter-controls="true"'),
);

assert(
  'Calendar view has one v3 builder truth and no legacy global scope form',
  source.calendarView.includes('onValidationChange={setBuilderValidation}') &&
    source.calendarView.includes('manageableWorkspaceIds={manageableWorkspaceIds}') &&
  source.calendarView.includes('data-calendar-subscription-submit="true"') &&
    source.calendarView.includes('grid-cols-[minmax(0,1fr)_auto]') &&
    source.calendarView.includes('建立訂閱並複製連結') &&
    source.calendarView.includes('請到已連接 Supabase 的環境建立訂閱') &&
    !source.calendarView.includes('data-calendar-subscription-scope-form="true"') &&
    !source.calendarView.includes('selectedAssigneeIds={selectedAssigneeIdsForPreview}'),
);

assert(
  'Calendar management and builder tasks use separate focused views',
  source.calendarView.includes("useState<'list' | 'builder'>('list')") &&
    source.calendarView.includes('data-calendar-subscription-view-mode="list"') &&
    source.calendarView.includes('data-calendar-subscription-view-mode="builder"') &&
    source.calendarView.includes('data-calendar-subscription-create-new="true"') &&
    source.calendarView.includes("switchView('list')") &&
    source.calendarView.includes('回到我的訂閱'),
);

assert(
  'Builder emits complete per-board snapshots and blocks incomplete preview saves',
  source.builder.includes('version: 3') &&
    source.builder.includes("v3_scope_type: 'per_board_filter_snapshot'") &&
    source.builder.includes('board_filters: Object.fromEntries') &&
    source.builder.includes('failedBoardIds') &&
    source.builder.includes('missingDateTypeBoardIds') &&
    source.builder.includes('data-calendar-subscription-board-date-types="true"') &&
    source.builder.includes('date_types: copiedSnapshot.date_types') &&
    source.builder.includes('data-calendar-subscription-event-summary="true"') &&
    source.builder.includes('data-calendar-subscription-preview-event="true"') &&
    source.builder.includes('data-calendar-subscription-preview-group={mode}') &&
    source.builder.includes('missingPreviewEvents') &&
    source.builder.includes('previewEvents: events') &&
    !source.builder.includes('max-h-72 space-y-3 overflow-y-auto') &&
    source.builder.includes('includedBoardCount') &&
    source.builder.includes('data-calendar-subscription-save-block-reason') === false &&
    source.calendarView.includes('data-calendar-subscription-save-block-reason="true"'),
);

assert(
  'Per-board edit, reset, exclude, and explicit one-time copy controls exist',
  source.builder.includes('data-calendar-subscription-board-select') &&
    source.builder.includes('data-calendar-subscription-board-included') &&
    source.builder.includes('data-calendar-subscription-copy-panel') &&
    source.builder.includes('data-calendar-subscription-copy-apply') &&
    source.builder.includes('cloneCalendarBoardFilterSnapshot') &&
    source.builder.includes('setCopyTargetIds'),
);

assert(
  'New, v1, v2, and v3 records materialize to independent board snapshots',
  source.conversion.includes('materializeCalendarBoardFilters') &&
    source.conversion.includes("const isV3 = filters.version === 3") &&
    source.conversion.includes("const isV2 = filters.version === 2") &&
    source.conversion.includes("const scopeType = filters.scope_type ?? 'workspace'") &&
    source.conversion.includes('included: snapshot.included') &&
    source.conversion.includes('date_types: normalizeDateTypes(snapshot.date_types ?? filters.date_types)') &&
    source.conversion.includes('createCalendarSafeDefaultTaskFilters'),
);

assert(
  'Architecture and QA documents name the immutable per-board model',
  source.adr.includes('逐看板') &&
    source.spec.includes('version: 3') &&
    source.qa.includes('QA-045') &&
    source.qc.includes('DEV-045') &&
    source.packageJson.includes('verify:dev-045-calendar-subscription-builder-preview'),
);

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
