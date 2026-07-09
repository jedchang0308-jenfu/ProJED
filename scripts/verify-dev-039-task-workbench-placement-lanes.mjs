import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  placement: 'src/features/taskWorkbench/placement.ts',
  taskDateBadge: 'src/components/Wbs/TaskDateBadge.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  dragSensors: 'src/hooks/useDragSensors.ts',
  mainLayout: 'src/components/MainLayout.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  boardView: 'src/components/BoardView.tsx',
  wbsStore: 'src/store/useWbsStore.ts',
  quickCaptureStore: 'src/store/useQuickCaptureStore.ts',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md',
  qa: 'ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md',
  devTask: 'ai-doc/dev_task.md',
  qc: 'ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md',
  browserVerifier: 'scripts/verify-dev-039-task-workbench-placement-lanes-browser.pw.js',
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
  'placement helper defines local unplaced task identity and persistence',
  source.placement.includes('TASK_WORKBENCH_UNPLACED_BOARD_ID') &&
    source.placement.includes('TASK_WORKBENCH_UNPLACED_STORAGE_KEY') &&
    source.placement.includes('createTaskWorkbenchUnplacedTaskId') &&
    source.placement.includes('isTaskWorkbenchUnplacedTask') &&
    source.placement.includes('readTaskWorkbenchUnplacedTasks') &&
    source.placement.includes('writeTaskWorkbenchUnplacedTasks') &&
    source.placement.includes('createUnplacedTaskNodeFromInboxItem') &&
    source.placement.includes('createNewUnplacedTaskNode'),
);

assert(
  'quick capture legacy inbox can be marked as promoted to an unplaced task node',
  source.quickCaptureStore.includes('markPromoted') &&
    source.quickCaptureStore.includes('promotedTaskNodeId: taskNodeId'),
);

assert(
  'WBS store persists unplaced tasks locally and transitions between unplaced and real boards',
  source.wbsStore.includes("from '../features/taskWorkbench/placement'") &&
    source.wbsStore.includes('isTaskWorkbenchUnplacedTask') &&
    source.wbsStore.includes('readTaskWorkbenchUnplacedTasks') &&
    source.wbsStore.includes('mergeLocalUnplacedTasksForSetNodes') &&
    source.wbsStore.includes('upsertTaskWorkbenchUnplacedTask') &&
    source.wbsStore.includes('removeTaskWorkbenchUnplacedTask') &&
    source.wbsStore.includes('oldWasUnplaced') &&
    source.wbsStore.includes('newIsUnplaced') &&
    source.wbsStore.includes('nodeService.create(newNode.workspaceId, newNode.boardId, newNode)') &&
    source.wbsStore.includes('nodeService.delete(oldNode.workspaceId, oldNode.boardId, id)'),
);

assert(
  'Task Workbench renders explicit unplaced and placed-board droppable lanes',
  source.taskWorkbench.includes('useDroppable') &&
    source.taskWorkbench.includes('data-task-workbench-unplaced-lane="true"') &&
    source.taskWorkbench.includes('data-task-workbench-placed-board-lane="true"') &&
    source.taskWorkbench.includes('data-task-workbench-lane-drop-target="unplaced"') &&
    source.taskWorkbench.includes('data-task-workbench-lane-drop-target="placed-board"') &&
    source.taskWorkbench.includes('data-task-workbench-unplaced-task-card') &&
    source.taskWorkbench.includes('data-task-workbench-placed-task-card') &&
    source.taskWorkbench.includes('data-task-workbench-all-tasks-list="true"') &&
    source.taskWorkbench.includes('data-task-workbench-all-task-card') &&
    source.taskWorkbench.includes('已歸位') &&
    !source.taskWorkbench.includes('所有任務排序') &&
    source.taskWorkbench.includes('sortTasksByDueDate') &&
    source.taskWorkbench.includes("data-task-workbench-unplaced-compact-row={unplacedLane ? 'true' : undefined}") &&
    source.taskWorkbench.includes('kanban-checklist-item') &&
    source.taskWorkbench.includes("placement: 'placed'") &&
    source.taskWorkbench.includes("placement: 'unplaced'"),
);

assert(
  'Task Workbench task lists use dense shared rows without separate drag-handle chrome',
  !source.taskWorkbench.includes('TaskDragHandle') &&
    !source.taskWorkbench.includes('data-task-drag-handle') &&
    source.taskWorkbench.includes('data-task-workbench-all-tasks-list="true"') &&
    source.taskWorkbench.includes('className="space-y-0.5" data-task-workbench-all-tasks-list="true"') &&
    source.taskWorkbench.includes('className="space-y-0.5" data-task-workbench-unclassified-list="true"') &&
    source.taskWorkbench.includes('getTaskHierarchyDepth') &&
    source.taskWorkbench.includes('hierarchyDepth={getTaskHierarchyDepth(task, nodes)}') &&
    source.taskWorkbench.includes('data-task-workbench-hierarchy-depth') &&
    source.taskWorkbench.includes('style: { paddingLeft:') &&
    source.browserVerifier.includes('dense task rows should not render a separate drag handle'),
);

assert(
  'Task Workbench keeps unplaced rows draggable while placed rows are read-only list entries',
  source.taskWorkbench.includes('const renderWorkbenchTaskRow = ({') &&
    source.taskWorkbench.includes("const canDragTaskFromWorkbench = placement === 'unplaced' && canMoveTask") &&
    source.taskWorkbench.includes('const canUseWorkbenchDragSurface = canDragTaskFromWorkbench && !mobileActionMode') &&
    source.taskWorkbench.includes('disabled: !canDragTaskFromWorkbench || mobileActionMode') &&
    source.taskWorkbench.includes('const draggableBindings = canUseWorkbenchDragSurface ? { ...attributes, ...listeners } : {};') &&
    source.taskWorkbench.includes('ref={canUseWorkbenchDragSurface ? setNodeRef : undefined}') &&
    source.taskWorkbench.includes("data-task-workbench-drag-surface={canUseWorkbenchDragSurface ? 'task-row-root' : undefined}") &&
    source.taskWorkbench.includes('{...workbenchTouchHandlers}') &&
    source.taskWorkbench.includes('onClick={(event) => {') &&
    source.taskWorkbench.includes('onContextMenu={handleContextMenu}') &&
    source.taskWorkbench.includes("data-task-workbench-unplaced-task-card={unplacedLane ? 'true' : undefined}") &&
    source.taskWorkbench.includes("data-task-workbench-all-task-card={isAllTasksCard ? 'true' : undefined}") &&
    source.taskWorkbench.includes("data-task-workbench-readonly-task-card={placement === 'placed' ? 'true' : undefined}") &&
    (source.taskWorkbench.match(/renderWorkbenchTaskRow\(\{/g) || []).length >= 2 &&
    !source.taskWorkbench.includes('data-task-drag-handle') &&
    source.dragSensors.includes('distance: 8') &&
    source.dragSensors.includes('delay: 250') &&
    source.dragSensors.includes('tolerance: 8') &&
    source.browserVerifier.includes('assertUnplacedWorkbenchRowDragSurface') &&
    source.browserVerifier.includes('assertPlacedWorkbenchRowReadOnly'),
);

assert(
  'Task Workbench task rows open the shared GlobalContextMenu on right click',
  source.taskWorkbench.includes('const setContextMenuState = useBoardStore(state => state.setContextMenuState)') &&
    source.taskWorkbench.includes('const handleContextMenu = (event: React.MouseEvent) => {') &&
    source.taskWorkbench.includes('setContextMenuState({') &&
    source.taskWorkbench.includes("kind: 'task'") &&
    source.taskWorkbench.includes('nodeId: task.id') &&
    source.taskWorkbench.includes("title: task.title || '未命名任務'") &&
    source.taskWorkbench.includes('onContextMenu={handleContextMenu}') &&
    source.taskWorkbench.includes("data-task-workbench-drag-surface={canUseWorkbenchDragSurface ? 'task-row-root' : undefined}") &&
    !source.taskWorkbench.includes('TaskWorkbenchContextMenu') &&
    !source.taskWorkbench.includes('data-task-workbench-context-menu') &&
    source.browserVerifier.includes('unplaced workbench task should open the shared task context menu') &&
    source.browserVerifier.includes('placed workbench task should open the shared task context menu'),
);

assert(
  'Task Workbench task rows reuse the board task date badge module',
  source.taskDateBadge.includes('export const TaskDateBadge') &&
    source.taskDateBadge.includes("surface === 'kanban-card'") &&
    source.taskDateBadge.includes("surface === 'checklist'") &&
    source.taskDateBadge.includes("data-task-date-surface=\"workbench\"") &&
    source.kanbanCard.includes("import { TaskDateBadge } from './TaskDateBadge'") &&
    source.kanbanChecklist.includes("import { TaskDateBadge } from './TaskDateBadge'") &&
    source.taskWorkbench.includes("import { TaskDateBadge } from './Wbs/TaskDateBadge'") &&
    source.taskWorkbench.includes('const renderWorkbenchTaskContent = ({') &&
    source.taskWorkbench.includes('renderWorkbenchTaskContent({') &&
    source.taskWorkbench.includes('surface="workbench"') &&
    source.taskWorkbench.includes('showStartDate={false}') &&
    source.browserVerifier.includes('unplaced lane should render the same workbench due date badge module') &&
    source.browserVerifier.includes('placed lane should render due date badges from the shared task date module'),
);

assert(
  'Task Workbench lane titles render as sticky section headers above scrollable task rows',
  source.taskWorkbench.includes('max-h-[38vh] shrink-0 overflow-y-auto overscroll-contain') &&
    source.taskWorkbench.includes("isOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'") &&
    source.taskWorkbench.includes("isPlacedBoardLaneOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'") &&
    !source.taskWorkbench.includes("'bg-sky-50/70'") &&
    source.taskWorkbench.includes('bg-[#e1e9ee]/95') &&
    !source.taskWorkbench.includes('bg-[#fbfcfc]/85') &&
    !source.taskWorkbench.includes('bg-[#e8eef2]/95') &&
    source.taskWorkbench.includes('data-task-workbench-header-accent="unplaced"') &&
    source.taskWorkbench.includes('data-task-workbench-header-accent="placed"') &&
    source.taskWorkbench.includes('placeholder="新增任務"') &&
    source.taskWorkbench.includes('aria-label="新增任務"') &&
    source.taskWorkbench.includes('<Plus size={14} />') &&
    !source.taskWorkbench.includes('新增未歸位任務') &&
    source.taskWorkbench.includes('data-task-workbench-section-header="unplaced"') &&
    source.taskWorkbench.includes('data-task-workbench-section-header="all-tasks"') &&
    source.taskWorkbench.includes('sticky top-0 z-20') &&
    source.taskWorkbench.includes('className="sr-only" data-task-workbench-all-tasks-count="true"') &&
    source.taskWorkbench.includes('className="sr-only" data-task-workbench-unclassified-count="true"') &&
    source.taskWorkbench.includes('data-task-workbench-all-tasks-count="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-count="true"'),
);

assert(
  'Task Workbench closed state uses top navigation entry instead of an in-flow collapsed rail',
  source.taskWorkbench.includes('ChevronLeft') &&
    !source.taskWorkbench.includes('ChevronRight') &&
    !source.taskWorkbench.includes('PanelLeftClose') &&
    !source.taskWorkbench.includes('NotebookText') &&
    source.taskWorkbench.includes('data-task-workbench-collapse-toggle="true"') &&
    source.taskWorkbench.includes('<ChevronLeft size={16} />') &&
    source.taskWorkbench.includes("data-task-workbench-overlay={isNarrowViewport ? 'true' : undefined}") &&
    source.taskWorkbench.includes('data-task-workbench-backdrop="true"') &&
    source.taskWorkbench.includes('if (!isExpanded) {') &&
    source.taskWorkbench.includes('return null;') &&
    !source.taskWorkbench.includes('data-task-workbench-panel="collapsed"') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-toggle="true"') &&
    !source.taskWorkbench.includes('data-task-workbench-collapsed-count="true"') &&
    source.mainLayout.includes('data-mobile-task-workbench-nav-entry="true"'),
);

assert(
  'Task Workbench migrates legacy unclassified inbox items into task-equivalent unplaced cards',
  source.taskWorkbench.includes('readTaskWorkbenchUnplacedTasks') &&
    source.taskWorkbench.includes('getUnclassifiedItems(inboxItems)') &&
    source.taskWorkbench.includes('createUnplacedTaskNodeFromInboxItem') &&
    source.taskWorkbench.includes('markInboxPromoted') &&
    source.taskWorkbench.includes('createNewUnplacedTaskNode') &&
    source.taskWorkbench.includes('selectAndOpenTaskDetails(task.id)'),
);

assert(
  'BoardView handles bidirectional placement lane drops before normal Kanban sorting',
  source.boardView.includes('TASK_WORKBENCH_UNPLACED_BOARD_ID') &&
    source.boardView.includes("overData?.type === 'task-workbench-unplaced-lane'") &&
    source.boardView.includes("overData?.type === 'task-workbench-placed-board-lane'") &&
    source.boardView.includes('getBoardRootAppendOrder') &&
    source.boardView.includes('boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID') &&
    source.boardView.includes('boardId: overData.boardId'),
);

assert(
  'profile/save/copy and placement-filter schema remain absent',
  !source.taskWorkbench.includes('TaskWorkbenchFilterProfile') &&
    !source.taskWorkbench.includes('readTaskWorkbenchProfiles') &&
    !source.taskWorkbench.includes('writeTaskWorkbenchProfiles') &&
    !source.taskWorkbench.includes('data-task-workbench-profile') &&
    !source.taskWorkbench.includes('placementFilter') &&
    !source.taskWorkbench.includes('customWorkspaceIds') &&
    !source.taskWorkbench.includes('customBoardIds'),
);

assert(
  'DEV-039 docs and scripts register Phase 1B placement gates before production release',
  source.spec.includes('Phase 1B RD Contract') &&
    source.qa.includes('Phase 1B Placement Lane Verification') &&
    source.devTask.includes('Phase 1B RD 執行範圍') &&
    source.qc.includes('Phase 1B QC Gate') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-placement-lanes"') &&
    source.packageJson.includes('"verify:dev-039-task-workbench-placement-lanes-browser"') &&
    source.browserVerifier.includes('task-workbench-placement-lanes'),
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
