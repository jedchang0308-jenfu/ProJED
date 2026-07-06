import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/features/taskFilters/types.ts',
  defaults: 'src/features/taskFilters/defaults.ts',
  predicates: 'src/features/taskFilters/predicates.ts',
  resultProjection: 'src/features/taskFilters/resultProjection.ts',
  assigneeOptions: 'src/features/taskFilters/assigneeOptions.ts',
  describe: 'src/features/taskFilters/describe.ts',
  storage: 'src/features/taskFilters/storage.ts',
  index: 'src/features/taskFilters/index.ts',
  utilsTaskFilters: 'src/utils/taskFilters.ts',
  boardStore: 'src/store/useBoardStore.ts',
  tagStore: 'src/store/useTagStore.ts',
  statusFilterBar: 'src/components/ui/StatusFilterBar.tsx',
  mainLayout: 'src/components/MainLayout.tsx',
  app: 'src/App.tsx',
  sidebar: 'src/components/Sidebar.tsx',
  typesIndex: 'src/types/index.ts',
  localTestEnvironment: 'src/utils/localTestEnvironment.ts',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  taskWorkbenchPlacement: 'src/features/taskWorkbench/placement.ts',
  quickCaptureStore: 'src/store/useQuickCaptureStore.ts',
  wbsListView: 'src/components/Wbs/WbsListView.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  boardView: 'src/components/BoardView.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  ganttView: 'src/components/GanttView.tsx',
  calendarView: 'src/components/CalendarView.tsx',
  mindMapTree: 'src/components/MindMap/mindMapTree.ts',
  mindMapView: 'src/components/MindMap/MindMapView.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md',
  qa: 'ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  backlog: 'ai-doc/backlog.md',
  browserVerifier: 'scripts/verify-dev-039-task-filter-core-browser.pw.js',
  placementVerifier: 'scripts/verify-dev-039-task-workbench-placement-lanes.mjs',
  placementBrowserVerifier: 'scripts/verify-dev-039-task-workbench-placement-lanes-browser.pw.js',
  parityVerifier: 'scripts/verify-dev-039-filter-result-parity.mjs',
  parityBrowserVerifier: 'scripts/verify-dev-039-filter-result-parity-browser.pw.js',
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

const taskWorkbenchFilterControlsStart = source.taskWorkbench?.indexOf('const WorkbenchFilterControls') ?? -1;
const taskWorkbenchPanelStart = source.taskWorkbench?.indexOf('const TaskWorkbenchPanel') ?? -1;
const taskWorkbenchBoardSelectIndex = source.taskWorkbench?.indexOf('data-task-workbench-board-select="true"') ?? -1;

assert(
  'task filter shared core exposes canonical types/defaults/predicate/summary/storage',
  source.types.includes('TaskFilterState') &&
    source.types.includes('TaskDisplaySettings') &&
    !source.types.includes('TaskWorkbenchFilterProfile') &&
    source.defaults.includes('TASK_STATUS_OPTIONS') &&
    source.defaults.includes('createDefaultTaskFilters') &&
    source.defaults.includes('completed: false') &&
    !source.defaults.includes('createDefaultTaskWorkbenchProfile') &&
    source.predicates.includes('matchesTaskFilters') &&
    source.predicates.includes('matchesKeywordFilter') &&
    source.resultProjection.includes('projectTaskFilterResults') &&
    source.resultProjection.includes('matchedTaskIds') &&
    source.assigneeOptions.includes('createBoardAssigneeFilterOptions') &&
    source.describe.includes('countActiveTaskFilters') &&
    source.describe.includes('describeTaskFilters') &&
    source.storage.includes("BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v1'") &&
    source.storage.includes('BOARD_TASK_FILTER_PREFS_VERSION = 2') &&
    source.storage.includes('migrateLegacyDefaultTaskFilters') &&
    !source.storage.includes('TASK_WORKBENCH_FILTER_PROFILES_STORAGE_KEY') &&
    !source.storage.includes('readTaskWorkbenchProfiles') &&
    !source.storage.includes('writeTaskWorkbenchProfiles') &&
    source.index.includes("export * from './predicates'") &&
    source.index.includes("export * from './resultProjection'") &&
    source.index.includes("export * from './assigneeOptions'"),
);

assert(
  'legacy task filter utils re-export shared core',
  source.utilsTaskFilters.includes("from '../features/taskFilters'") &&
    source.utilsTaskFilters.includes('matchesTaskFilters'),
);

assert(
  'board and tag stores use versioned storage adapter while keeping legacy key compatibility',
  source.boardStore.includes('readBoardTaskFilterPrefs') &&
    source.boardStore.includes('writeBoardTaskFilterPrefs') &&
    !source.boardStore.includes("const FILTER_STORAGE_KEY = 'projed-filters'") &&
    source.tagStore.includes('persistSelectedTagIds') &&
    source.tagStore.includes('writeBoardTaskFilterPrefs({ filters: { selectedTagIds } })'),
);

assert(
  'StatusFilterBar separates display settings from active task filter count',
  source.statusFilterBar.includes('countActiveTaskFilters') &&
    source.statusFilterBar.includes('data-task-display-settings="true"') &&
    source.statusFilterBar.includes('data-active-task-filter-count={activeFilterCount}') &&
    source.statusFilterBar.includes('const hasActiveFilter = activeFilterCount > 0') &&
    !source.statusFilterBar.includes('!showDependencies || !showTags'),
);

const taskFilterViews = [
  ['wbsListView', source.wbsListView],
  ['wbsNodeItem', source.wbsNodeItem],
  ['ganttView', source.ganttView],
  ['calendarView', source.calendarView],
  ['mindMapTree', source.mindMapTree],
];

for (const [label, content] of taskFilterViews) {
  assert(`${label} uses matchesTaskFilters`, content.includes('matchesTaskFilters'));
}

assert(
  'board hierarchy uses filter result projection so matching descendants keep context ancestors visible',
  source.boardView.includes('projectTaskFilterResults') &&
    source.boardView.includes('filterProjection.visibleTaskIds.has(n.id)') &&
    source.kanbanColumn.includes('filterProjection.visibleTaskIds.has(child.id)') &&
    source.kanbanChecklist.includes('filterProjection.visibleTaskIds.has(n.id)') &&
    source.kanbanCard.includes('filterProjection={filterProjection}') &&
    !source.kanbanColumn.includes('matchesTaskFilters') &&
    !source.kanbanChecklist.includes('matchesTaskFilters'),
);

assert(
  'Gantt and Calendar include tag filter state',
  source.ganttView.includes('selectedTagIds = useTagStore') &&
    source.ganttView.includes('selectedTagIds,') &&
    source.calendarView.includes('selectedTagIds = useTagStore') &&
    source.calendarView.includes('selectedTagIds,'),
);

assert(
  'mindmap mode exposes the task filter entry',
  source.mainLayout.includes("['list', 'mindmap', 'board', 'gantt', 'calendar'].includes(currentView)") &&
    source.mindMapView.includes("keyword: ''") &&
    source.mindMapTree.includes('type MindMapFilterState = TaskFilterState'),
);

assert(
  'Task Workbench is a board-side two-column board/filter panel with drag cards, not a route page',
  source.taskWorkbench.includes('data-task-workbench-panel="true"') &&
    source.taskWorkbench.includes('data-task-workbench-board-select="true"') &&
    source.taskWorkbench.includes('data-task-workbench-filter-toggle="true"') &&
    source.taskWorkbench.includes('data-task-workbench-filter-popover="true"') &&
    source.taskWorkbench.includes('data-task-workbench-filter-panel="true"') &&
    source.taskWorkbench.includes('data-task-workbench-task-card="true"') &&
    source.taskWorkbench.includes('filterProjectionByBoardId.get(task.boardId)?.matchedTaskIds.has(task.id)') &&
    source.taskWorkbench.includes("source: 'task-workbench'") &&
    source.boardView.includes('<TaskWorkbenchPanel canMoveTask={canMoveTask} />') &&
    source.boardView.includes("activeData?.source === 'task-workbench'") &&
    !source.app.includes("case 'task_workbench'") &&
    !source.typesIndex.includes("'task_workbench'") &&
    source.mainLayout.includes('data-mobile-task-workbench-nav-entry="true"') &&
    source.mainLayout.includes('toggleTaskWorkbenchPanel') &&
    !source.sidebar.includes('data-sidebar-task-workbench-button="true"') &&
    !source.sidebar.includes('openTaskWorkbenchPanel') &&
    !source.localTestEnvironment.includes("'task_workbench'"),
);

assert(
  'Task Workbench keeps board selection inside the filter overlay button',
  taskWorkbenchFilterControlsStart >= 0 &&
    taskWorkbenchPanelStart > taskWorkbenchFilterControlsStart &&
    taskWorkbenchBoardSelectIndex > taskWorkbenchFilterControlsStart &&
    taskWorkbenchBoardSelectIndex < taskWorkbenchPanelStart &&
    source.taskWorkbench.includes('boardOptions: BoardOption[]') &&
    source.taskWorkbench.includes('boardOptions={boardOptions}') &&
    source.taskWorkbench.includes('selectedBoardId={selectedBoardId}') &&
    source.taskWorkbench.includes('TASK_WORKBENCH_FILTER_PREFS_KEY') &&
    source.taskWorkbench.includes('projed-task-workbench-filters:v1') &&
    source.taskWorkbench.includes('readWorkbenchFilterPrefs') &&
    source.taskWorkbench.includes('writeWorkbenchFilterPrefs') &&
    source.taskWorkbench.includes('migrateLegacyDefaultTaskFilters') &&
    source.taskWorkbench.includes('BOARD_TASK_FILTER_PREFS_VERSION') &&
    source.taskWorkbench.includes('onSelectedBoardChange={handleSelectedBoardChange}'),
);

assert(
  'Task Workbench removes crossed-out explanatory UI copy',
  !source.taskWorkbench.includes('data-task-workbench-source-summary="true"') &&
    !source.taskWorkbench.includes('data-task-workbench-selected-board="true"') &&
    !source.taskWorkbench.includes('data-task-workbench-filter-summary="true"') &&
    !source.taskWorkbench.includes('資料來源：目前已載入任務集合') &&
    !source.taskWorkbench.includes('清單跨看板顯示') &&
    !source.taskWorkbench.includes('真正全部可見任務查詢留待 Phase 2') &&
    !source.taskWorkbench.includes('設定：') &&
    !source.taskWorkbench.includes('同任務功能') &&
    !source.taskWorkbench.includes('拖到所選看板') &&
    !source.taskWorkbench.includes('全部看板') &&
    !source.taskWorkbench.includes('拖到已歸位看板') &&
    !source.taskWorkbench.includes('拖到此看板定位'),
);

assert(
  'Task Workbench restores unplaced task lane outside board filters with legacy inbox migration',
  source.taskWorkbench.includes("from '../store/useQuickCaptureStore'") &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-section="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-input="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-add="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-list="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-item') &&
    source.taskWorkbench.includes('data-task-workbench-unplaced-lane="true"') &&
    source.taskWorkbench.includes('data-task-workbench-placed-board-lane="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unplaced-task-card') &&
    source.taskWorkbench.includes('data-task-workbench-placed-task-card') &&
    source.taskWorkbench.includes("item.captureStatus === 'untriaged'") &&
    source.taskWorkbench.includes('!item.promotedTaskNodeId') &&
    source.taskWorkbench.includes('createUnplacedTaskNodeFromInboxItem') &&
    source.taskWorkbenchPlacement.includes('TASK_WORKBENCH_UNPLACED_BOARD_ID') &&
    source.quickCaptureStore.includes("const QUICK_CAPTURE_STORAGE_KEY = 'projed.quickCapture.inboxItems'") &&
    source.quickCaptureStore.includes("captureStatus: 'untriaged'") &&
    source.quickCaptureStore.includes('markPromoted'),
);

assert(
  'Task Workbench avoids profile/save/copy UI and storage',
  !source.taskWorkbench.includes('data-task-workbench-profile') &&
    !source.taskWorkbench.includes('readTaskWorkbenchProfiles') &&
    !source.taskWorkbench.includes('writeTaskWorkbenchProfiles') &&
    !source.taskWorkbench.includes('writeTaskWorkbenchActiveProfileId') &&
    !source.taskWorkbench.includes('TaskWorkbenchFilterProfile') &&
    !source.taskWorkbench.includes('設定檔') &&
    !source.taskWorkbench.includes('複製') &&
    !source.taskWorkbench.includes('儲存') &&
    !source.taskWorkbench.includes('另存') &&
    !source.taskWorkbench.includes('看板專屬') &&
    !source.taskWorkbench.replace(/全域任務平台/g, '').includes('全域'),
);

assert(
  'Task Workbench avoids forbidden source-scope and placement filter schema',
  !source.taskWorkbench.includes('目前工作區') &&
    !source.taskWorkbench.includes('目前看板') &&
    !source.taskWorkbench.includes('placementFilter') &&
    !source.taskWorkbench.includes('customWorkspaceIds') &&
    !source.taskWorkbench.includes('customBoardIds') &&
    !source.taskWorkbench.includes("scope: 'workspace'") &&
    !source.taskWorkbench.includes("scope: 'board'"),
);

assert(
  'DEV-039 documents capture all-phase coverage and authorization boundary',
  source.spec.includes('All-Phase Coverage Matrix') &&
    source.spec.includes('Deferred Scope Audit') &&
    source.qa.includes('All-Phase QA Coverage Matrix') &&
    source.qa.includes('Phase Exit Decision Rules') &&
    source.devTask.includes('Phase 1 已完成本機自動化 QC') &&
    source.devTask.includes('Phase 2 cross-board source slice 已完成本機自動化 QC') &&
    source.devTask.includes('Phase 2 visible partial/error summary、DB/RLS/RPC 與 production deploy 仍需另行授權') &&
    source.documentationMap.includes('All-Phase Coverage Complete') &&
    source.backlog.includes('All-Phase Coverage Matrix'),
);

assert(
  'package scripts are registered',
  source.packageJson.includes('"verify:dev-039-task-filter-core"') &&
    source.packageJson.includes('"verify:dev-039-task-filter-core-browser"') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-placement-lanes"') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-placement-lanes-browser"') &&
    source.packageJson.includes('"verify:dev-039-filter-result-parity"') &&
    source.packageJson.includes('"verify:dev-039-filter-result-parity-browser"') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-cross-board-source"') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-cross-board-source-browser"') &&
    source.browserVerifier.includes('task-workbench-board-filter') &&
    source.placementVerifier.includes('placement helper defines local unplaced task identity') &&
    source.placementBrowserVerifier.includes('task-workbench-placement-lanes') &&
    source.parityVerifier.includes('result projection exposes canonical matched and context-only sets') &&
    source.parityBrowserVerifier.includes('dev039-filter-parity-leaf'),
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
