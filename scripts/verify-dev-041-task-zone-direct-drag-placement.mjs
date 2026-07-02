import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  packageJson: 'package.json',
  boardView: 'src/components/BoardView.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  taskZoneView: 'src/components/TaskZoneView.tsx',
  taskZoneStore: 'src/store/useTaskZoneStore.ts',
  dataBackend: 'src/services/dataBackend.ts',
  projedService: 'src/services/supabase/projedService.ts',
  databaseTypes: 'src/services/supabase/database.types.ts',
  taskSubscriptionSources: 'src/utils/taskSubscriptionSources.ts',
  calendarSubscriptionService: 'src/services/supabase/calendarSubscriptionService.ts',
  calendarSubscriptionsView: 'src/components/CalendarSubscriptionsView.tsx',
  migration: 'supabase/migrations/20260701020000_dev_041_move_task_to_board_rpc.sql',
  documentationMap: 'ai-doc/documentation_map.md',
  spec: 'ai-doc/specs/SPEC-041-task-zone-direct-drag-placement.md',
  qa: 'ai-doc/qa/QA-DEV-041-task-zone-direct-drag-placement.md',
  devTask: 'ai-doc/dev_task.md',
  browserVerifier: 'scripts/verify-dev-041-task-zone-direct-drag-placement-browser.pw.js',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok: Boolean(ok), details });
const containsAll = (content, values) => values.every(value => content.includes(value));

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const packageJson = read(files.packageJson);
const boardView = read(files.boardView);
const kanbanColumn = read(files.kanbanColumn);
const kanbanCard = read(files.kanbanCard);
const taskZoneView = read(files.taskZoneView);
const taskZoneStore = read(files.taskZoneStore);
const dataBackend = read(files.dataBackend);
const projedService = read(files.projedService);
const databaseTypes = read(files.databaseTypes);
const taskSubscriptionSources = read(files.taskSubscriptionSources);
const calendarSubscriptionService = read(files.calendarSubscriptionService);
const calendarSubscriptionsView = read(files.calendarSubscriptionsView);
const migration = read(files.migration);
const documentationMap = read(files.documentationMap);
const spec = read(files.spec);
const qa = read(files.qa);
const devTask = read(files.devTask);
const browserVerifier = read(files.browserVerifier);

assert(
  'package exposes DEV-041 verifier scripts',
  containsAll(packageJson, [
    '"verify:dev-041-task-zone-direct-drag-placement"',
    '"verify:dev-041-task-zone-direct-drag-placement-browser"',
    'verify-dev-041-task-zone-direct-drag-placement.mjs',
    'verify-dev-041-task-zone-direct-drag-placement-browser.pw.js',
  ]),
);

assert(
  'BoardView integrates left task-zone source panel inside existing DnD context',
  containsAll(boardView, [
    'TaskZoneSourcePanel',
    '<TaskZoneSourcePanel canCreateTask={canCreateTask} canMoveTask={canMoveTask} />',
    'TaskDragOverlayPreview',
    "activeDrag?.source === 'task-zone-my-task'",
    'personal-task-zone-item',
    'task-zone-my-task',
  ]),
);

assert(
  'Kanban column exposes stable active drop-indicator selector for drag parity smoke',
  containsAll(kanbanColumn, [
    'data-kanban-drop-indicator="column"',
    'data-kanban-drop-indicator-active',
    'isCardLayerTargeted',
  ]),
);

assert(
  'Kanban card exposes stable active drop-indicator selector for task-card positioning smoke',
  containsAll(kanbanCard, [
    'data-kanban-card-drop-indicator="card"',
    'data-kanban-card-drop-indicator-active',
    'canShowCardInsertFrame',
    "['wbs-card', 'wbs-checklist', 'quick-capture-item', 'personal-task-zone-item'].includes(activeType || '')",
    'isCardInsertTargeted',
    "['wbs-card', 'wbs-card-drop'].includes(overData?.type || '')",
    'ring-2 ring-primary/35',
  ]),
);

assert(
  'Kanban card DnD source lists do not duplicate task-zone source entries',
  !kanbanCard.includes("'personal-task-zone-item', 'personal-task-zone-item'"),
);

assert(
  'BoardView uses canonical placement and move services instead of duplicate creation',
  containsAll(boardView, [
    'placeTaskOnBoard',
    'nodeService.moveToBoard',
    'sourceWorkspaceId',
    'sourceBoardId',
    'targetWorkspaceId: activeWorkspaceId',
    'targetBoardId: activeBoardId',
    'getTaskZoneMoveErrorMessage',
  ]),
);

assert(
  'TaskZoneView exposes source panel, custom scope and shared drag source metadata',
  containsAll(taskZoneView, [
    'data-task-zone-source-panel',
    'data-task-zone-board-panel',
    'customWorkspaceIds',
    'customBoardIds',
    'createAssignedToMeTaskSource',
    'TaskDragHandle',
    'data-task-zone-placement-cta',
    'data-task-zone-my-tasks-cta',
    'data-task-zone-my-task-id',
    'data-task-zone-remove',
    'data-task-zone-source-tab',
    'data-task-zone-source-tab-active',
    'writeTaskZoneSourcePanelPrefs',
    "openBoardTaskZone('my_tasks')",
    "source: 'task-zone-my-task'",
    '可直接拖移定位',
    '目前看板沒有移動權限',
    '拖入目前看板時會檢查來源與目標看板權限',
    '跨工作區，含關聯時需受控移動',
    'assignedTasks.length === 0 && !isAssignedLoading',
  ]),
);

assert(
  'TaskZoneView persists remote assigned-task operations through canonical node service',
  containsAll(taskZoneView, [
    'nodeService.update(task.workspaceId, task.boardId, task.id, finalUpdates)',
    'patchAssignedTask(task.id, finalUpdates)',
    'assignedTasks.find(task => task.id === detailsTarget.id)',
    'persistAssignedTask',
    'toggleAssignedComplete',
    'archiveAssigned',
  ]),
);

assert(
  'TaskZone store loads and patches assigned task cache',
  containsAll(taskZoneStore, [
    'assignedTasks: TaskNode[]',
    'loadAssignedTasks',
    'nodeService.listAssignedToMe(source, currentUserId)',
    'patchAssignedTask',
    'assignedTasks: sortTasks(state.assignedTasks.map',
  ]),
);

assert(
  'Shared task subscription source supports calendar defaults and task-zone custom union scope',
  containsAll(taskSubscriptionSources, [
    'createDefaultCalendarSubscriptionFilters',
    "scope_type: 'workspace'",
    'createAssignedToMeTaskSource',
    "TaskSubscriptionScope = 'all' | 'workspace' | 'board' | 'custom'",
    'source.workspaceIds.includes(task.workspaceId) || source.boardIds.includes(task.boardId)',
    "if (scope === 'custom') return '自訂'",
  ]),
);

assert(
  'Calendar subscription UI and service use compatible workspace and board source fields',
  containsAll(calendarSubscriptionsView, [
    'createDefaultCalendarSubscriptionFilters',
    'scope_type',
    'board_ids',
    'availableBoards',
  ]) &&
  containsAll(calendarSubscriptionService, [
    'scope_type',
    'resolveBoardIds',
    'listBoardRefs',
    'filters_json',
  ]),
);

assert(
  'Data backend exposes assigned-task listing and canonical board move contracts',
  containsAll(dataBackend, [
    'listAssignedToMe',
    'moveToBoard',
    'TaskBoardMoveInput',
    'TaskBoardMoveResult',
    'taskZoneService',
    '跨看板任務歸位目前只支援 Supabase backend',
  ]),
);

assert(
  'Supabase service implements assigned listing and guarded move RPC path',
  containsAll(projedService, [
    'listAssignedToMe',
    'moveToBoard',
    'move_task_to_board',
    'isMissingMoveTaskToBoardRpcError',
    'VITE_ALLOW_DEV_041_MOVE_FALLBACK',
    'taskMatchesSubscriptionSource',
  ]),
);

assert(
  'Database types include DEV-041 move RPC and calendar board-scope filters',
  containsAll(databaseTypes, [
    'move_task_to_board',
    'p_source_project_id',
    'p_target_project_id',
    'board_ids',
    'scope_type',
  ]),
);

assert(
  'DEV-041 migration defines permission-guarded move RPC',
  containsAll(migration, [
    'create or replace function public.move_task_to_board',
    'security definer',
    'p_source_project_id',
    'p_target_project_id',
    'Cannot directly move tasks from the personal task zone.',
    'Moving records with tasks requires a controlled move flow.',
    'This task has dependencies outside the moved subtree.',
    'revoke all on function public.move_task_to_board',
    'grant execute on function public.move_task_to_board',
    'pgrst',
    'reload schema',
  ]),
);

assert(
  'PM docs preserve DEV-041 source-panel, subscription and remote operation requirements',
  containsAll(spec, [
    '與「訂閱月曆」共用來源訂閱模組',
    '預設訂閱所有「指派給我」',
    '詳情、改名、完成、封存等核心操作不得只更新目前看板 local store',
    '自訂範圍採聯集語意',
    'D-041-18：定位框驗收以任務卡層級為主',
    'D-041-19：定位框 browser smoke 不得污染待歸位資料',
    'data-kanban-card-drop-indicator-active',
    'data-task-zone-my-task-id',
    'data-task-zone-remove',
    'data-task-id',
    '[data-task-zone-item="true"][data-task-id="..."]',
    'fallback `DEV-041 drag smoke ...` item',
    'B-041-016 Non-polluting browser smoke for unplaced source items',
  ]) &&
  containsAll(qa, [
    'B-041-014 Remote assigned-task operation persistence',
    'B-041-015 Task-card positioning-frame parity for task-zone sources',
    'B-041-016 Non-polluting browser smoke for unplaced source items',
    'canonical task update service',
    'Screenshot/video comparing calendar subscription scope wording',
    'data-kanban-card-drop-indicator-active',
    '我的任務` drag activates the task-card or column positioning frame',
    'reuse an existing `待歸位` source item',
    'data-task-zone-remove',
    'data-task-id',
    'fallbackUnplacedTaskId',
    '[data-task-zone-item="true"][data-task-id="${fallbackUnplacedTaskId}"]',
    'created then cleaned up a fallback item',
    'cleaned up fallback unplaced smoke item',
  ]) &&
  containsAll(devTask, [
    'remote assigned-task operations',
    'canonical `nodeService.update(workspaceId, boardId, taskId, updates)`',
    'DEV-041 browser smoke CTA activation evidence contract',
    'QA Case Split - 2026-07-02 - DEV-041 B-041-016 non-polluting browser smoke',
    'Spec Decision Split - 2026-07-02 - DEV-041 D-041-19 non-polluting smoke',
    'Documentation Map Alignment - 2026-07-02 - DEV-041 non-polluting smoke gate',
    'data-task-zone-remove',
    'id-anchored fallback cleanup',
    'fallbackUnplacedTaskId',
    'fallback cleanup gate',
  ]),
);

assert(
  'Documentation map indexes DEV-041 specs, QA and verifier entrypoints',
  containsAll(documentationMap, [
    'DEV-041: 任務專區中控台與直接拖曳歸位',
    'ai-doc/specs/SPEC-041-task-zone-direct-drag-placement.md',
    'ai-doc/qa/QA-DEV-041-task-zone-direct-drag-placement.md',
    'scripts/verify-dev-041-task-zone-direct-drag-placement.mjs',
    'scripts/verify-dev-041-task-zone-direct-drag-placement-browser.pw.js',
    'task-card indicator 為主要證據',
    'column indicator 只作為沒有可用任務卡時的 fallback',
    'D-041-19',
    'B-041-016',
    'data-task-zone-remove',
    'data-task-id',
    'fallbackUnplacedTaskId',
    'id-anchored fallback cleanup',
    '[data-task-zone-item="true"][data-task-id="..."]',
    'fallback cleanup gate',
    'Static verifier passed 2026-07-02',
    'Browser smoke passed 2026-07-02',
  ]),
);

assert(
  'Browser verifier covers board-integrated source panel, CTA activation and my-task smoke path',
  containsAll(browserVerifier, [
    'data-task-zone-source-panel',
    'data-task-zone-board-panel',
    'placementCta.click()',
    'myTasksCta.click()',
    'placement CTA reaches board left source panel',
    'my-tasks CTA reaches board left source panel',
    'placement CTA opens unplaced source tab',
    'my-tasks CTA opens source-panel my-tasks tab',
    'data-task-zone-source-tab-active',
    'unplaced task drag shows normal board positioning frame',
    'unplaced task drag shows normal task-card positioning frame',
    'assigned my-task drag shows normal task-card positioning frame',
    'assigned my-task drag shows normal board positioning frame',
    'data-task-zone-my-task-id',
    'data-kanban-card-drop-indicator-active',
    'data-kanban-drop-indicator-active',
    "page.keyboard.press('Escape')",
    'reused existing unplaced task-zone item for positioning smoke',
    'created fallback unplaced smoke item because no reusable source item existed',
    'unplaced task-zone item remains after cancelled positioning smoke',
    'cleaned up fallback unplaced smoke item',
    'createdFallbackUnplacedItem',
    'fallbackUnplacedTaskId',
    'fallback cleanup should target the created item by data-task-id',
    '[data-task-zone-item="true"][data-task-id="${fallbackUnplacedTaskId}"]',
    'assigned my-task card remains after cancelled positioning smoke',
    'page.mouse.down()',
    "unplacedTaskItem.locator('[data-task-drag-handle=\"true\"]')",
    '我的任務',
    '待歸位',
    'data-task-zone-my-task-card',
    'data-task-drag-handle',
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
