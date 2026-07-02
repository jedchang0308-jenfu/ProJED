import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  taskZoneView: 'src/components/TaskZoneView.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  spec: 'ai-doc/specs/SPEC-042-task-workbench-cross-workspace-staging.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  browserVerifier: 'scripts/verify-dev-042-task-workbench-browser.pw.js',
  dev041StaticVerifier: 'scripts/verify-dev-041-task-zone-direct-drag-placement.mjs',
  dev041BrowserVerifier: 'scripts/verify-dev-041-task-zone-direct-drag-placement-browser.pw.js',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok: Boolean(ok), details });
const containsAll = (content, values) => values.every(value => content.includes(value));

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const packageJson = read(files.packageJson);
const taskZoneView = read(files.taskZoneView);
const mainLayout = read(files.mainLayout);
const spec = read(files.spec);
const devTask = read(files.devTask);
const documentationMap = read(files.documentationMap);
const browserVerifier = read(files.browserVerifier);
const dev041StaticVerifier = read(files.dev041StaticVerifier);
const dev041BrowserVerifier = read(files.dev041BrowserVerifier);

assert(
  'package exposes DEV-042 verifier scripts',
  containsAll(packageJson, [
    '"verify:dev-042-task-workbench"',
    '"verify:dev-042-task-workbench-browser"',
    'verify-dev-042-task-workbench.mjs',
    'verify-dev-042-task-workbench-browser.pw.js',
  ]),
);

assert(
  'TaskZoneView renames user-facing workbench surfaces',
  containsAll(taskZoneView, [
    '任務工作台',
    '跨工作區任務中繼站',
    '任務排序',
    '篩選器',
    '調整篩選',
    '開發中',
    'data-task-zone-source-panel',
    'data-task-zone-source-tab="my_tasks"',
    'data-task-zone-filter-dialog="true"',
    'data-task-zone-sort-item="unplaced"',
    'data-task-zone-sort-item="placed"',
    '任務排序 {workbenchItems.length}',
  ]),
);

assert(
  'TaskZoneView implements placement-state filter without placed-to-unplaced movement',
  containsAll(taskZoneView, [
    "type TaskZonePlacementFilter = 'all' | 'unplaced' | 'placed'",
    'placementFilter: TaskZonePlacementFilter',
    "placementFilter: 'all'",
    'describePlacementFilter',
    'data-task-zone-placement-filter',
    'data-task-zone-placement-filter-active',
  ]) &&
  !taskZoneView.includes('placed-to-unplaced') &&
  !taskZoneView.includes('moveToUnplaced'),
);

assert(
  'TaskZoneView implements task sorting contract for workbench list',
  containsAll(taskZoneView, [
    'compareTasksBySchedule',
    'left.endDate ? 0 : left.startDate ? 1 : 2',
    'left.endDate || left.startDate || getTaskCreatedAt(left)',
    "localeCompare(right.title || '', 'zh-Hant')",
    'left.id.localeCompare(right.id)',
    'workbenchItems',
    'title={`任務排序總數 ${myTaskCount}，目前篩選 ${workbenchItems.length}`}',
    '].sort((left, right) => compareTasksBySchedule(left.task, right.task))',
  ]),
);

assert(
  'TaskZoneView keeps unplaced tasks inside filtered task sorting',
  containsAll(taskZoneView, [
    "filteredPendingTasks.map(task => ({ task, placement: 'unplaced' as const }))",
    "filteredAssignedTasks.map(task => ({ task, placement: 'placed' as const }))",
    'matchesAssigneeFilter',
    '目前篩選範圍內沒有待處理任務',
    '待歸位',
    '已歸位',
  ]),
);

assert(
  'MainLayout breadcrumb uses task workbench name',
  containsAll(mainLayout, [
    "currentView === 'task_zone'",
    '任務工作台',
  ]),
);

assert(
  'DEV-042 docs record Phase 1 plus Phase 2 implementation boundaries',
  containsAll(spec, [
    'Phase 1 only changes browsing, filtering, naming and IA',
    'Phase 2 Implementation Slice',
    'Filter UX Implementation Slice',
    '任務排序',
    '工作區',
    '看板',
    '歸位狀態',
    'Required QA fixture',
  ]) &&
  containsAll(devTask, [
    'Phase 1 Local Verification Passed',
    'DEV-042 Phase 2 RD implementation slice',
    'Task workbench filter UX slice',
    '任務排序',
    '開發中',
  ]) &&
  containsAll(documentationMap, [
    'DEV-042: 任務工作台與跨工作區任務中繼站',
    'scripts/verify-dev-042-task-workbench.mjs',
    'scripts/verify-dev-042-task-workbench-browser.pw.js',
  ]),
);

assert(
  'DEV-042 browser smoke covers workbench tab, filters and no-Phase-2 boundary',
  containsAll(browserVerifier, [
    'data-task-zone-view="true"',
    '任務工作台',
    '任務排序',
    'data-task-zone-source-tab="my_tasks"',
    'data-task-zone-placement-filter="all"',
    'data-task-zone-placement-filter="unplaced"',
    'data-task-zone-placement-filter="placed"',
    'data-task-zone-sort-item="unplaced"',
    'data-task-zone-sort-item="placed"',
  ]),
);

assert(
  'DEV-041 verifier remains compatible with DEV-042 task sorting rename',
  containsAll(dev041StaticVerifier, [
    '任務排序',
    '固定納入待歸位任務',
  ]) &&
  containsAll(dev041BrowserVerifier, [
    '任務排序|我的任務',
    'my-tasks tab is reachable',
  ]),
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
