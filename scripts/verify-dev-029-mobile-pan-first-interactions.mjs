import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  useCoarsePointer: 'src/hooks/useCoarsePointer.ts',
  useMobilePanBroker: 'src/hooks/useMobilePanBroker.ts',
  useLongPress: 'src/hooks/useLongPress.ts',
  useTouchTapGuard: 'src/hooks/useTouchTapGuard.ts',
  css: 'src/index.css',
  boardView: 'src/components/BoardView.tsx',
  mobileTaskActionContext: 'src/components/Wbs/mobileTaskActionContext.ts',
  taskGesturePolicy: 'src/components/Wbs/taskDrag/taskGesturePolicy.ts',
  taskGestureSurface: 'src/components/Wbs/taskDrag/useTaskGestureSurface.ts',
  taskDragSession: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  taskDragCommit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  taskDragPresenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  globalContextMenu: 'src/components/GlobalContextMenu.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  wbsListView: 'src/components/Wbs/WbsListView.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  mindMapCanvasShell: 'src/components/MindMap/MindMapCanvasShell.tsx',
  mindMapNode: 'src/components/MindMap/MindMapNode.tsx',
  ganttView: 'src/components/GanttView.tsx',
  ganttTaskBar: 'src/components/Gantt/GanttTaskBar.tsx',
  browserVerifier: 'scripts/verify-dev-029-mobile-pan-first-interactions-browser.pw.js',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files).map(([label, file]) => [label, read(file)]));
const sliceBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) return '';
  return text.slice(start, end);
};
const mobileActionItemsSource = sliceBetween(source.taskDragPresenter, 'const mobileActionItems', 'interface TaskDragPresenterProps');
const mobileActionLayerSource = source.taskDragPresenter;

assert(
  'coarse pointer hook reuses centralized task interaction detection',
  source.useCoarsePointer.includes("import { isCoarsePointer as getIsCoarsePointer }") &&
    source.useCoarsePointer.includes("window.matchMedia('(pointer: coarse)')") &&
    source.ganttTaskBar.includes('useCoarsePointer()') &&
    source.mindMapNode.includes('useCoarsePointer()'),
);

assert(
  'touch tap guard suppresses compatibility click after pan threshold',
  source.useTouchTapGuard.includes('threshold = 10') &&
    source.useTouchTapGuard.includes('onTouchStart') &&
    source.useTouchTapGuard.includes('onTouchMove') &&
    source.useTouchTapGuard.includes('suppressNextTapRef.current = true') &&
    source.useTouchTapGuard.includes('onClickCapture') &&
    source.useTouchTapGuard.includes('shouldSuppressTap'),
);

assert(
  'mobile task surface keeps tap-to-details while pan suppresses click-through',
  !source.kanbanCard.includes('shouldUseMobilePanFirstTaskSurface') &&
    !source.kanbanChecklist.includes('shouldUseMobilePanFirstTaskSurface') &&
    source.kanbanCard.includes('selectAndOpenTaskDetails(nodeId)') &&
    source.kanbanChecklist.includes('selectAndOpenTaskDetails(child.id)') &&
    source.browserVerifier.includes('mobile quick tap opens TaskDetailsModal when no pan movement occurs'),
);

assert(
  'nested checklist task gestures bubble to scroll surfaces without activating parent card handlers',
  source.kanbanCard.includes('isFromChecklistItem') &&
    source.kanbanCard.includes('if (isFromChecklistItem(e.target)) return;') &&
    !source.kanbanChecklist.includes('touchTapGuard.handlers.onTouchMove(e);\n      e.stopPropagation();\n      longPressHandlers.onTouchMove(e);') &&
    source.boardView.includes('useMobilePanBroker') &&
    source.useMobilePanBroker.includes('isTaskPrimaryActionTarget') &&
    source.useMobilePanBroker.includes("state.horizontalSurface.scrollLeft = state.startScrollLeft - deltaX") &&
    source.useMobilePanBroker.includes('handleClickCapture') &&
    source.browserVerifier.includes('L2+ checklist row vertical pan scrolls the column') &&
    source.browserVerifier.includes('L2+ checklist row horizontal pan scrolls the board') &&
    source.browserVerifier.includes('removed outer rename control does not intercept mobile hit testing'),
);

assert(
  'mobile pan css utilities are available for whole task surfaces',
  source.css.includes('.mobile-pan-surface') &&
    source.css.includes('.mobile-pan-item') &&
    source.css.includes('.mobile-pan-rail') &&
    source.css.includes('touch-action: pan-x pan-y') &&
    source.css.includes('[data-mobile-pan-pass-through="true"]'),
);

assert(
  'board mode exposes pan surfaces, tap guard, and bottom rail',
  source.boardView.includes('data-mobile-pan-surface="board"') &&
    source.kanbanColumn.includes('data-mobile-pan-surface="kanban-column"') &&
    source.kanbanColumn.includes('data-mobile-pan-rail="kanban-column"') &&
    source.kanbanCard.includes('useTaskGestureSurface') &&
    source.taskGestureSurface.includes('useTouchTapGuard') &&
    source.kanbanCard.includes('data-touch-tap-guard="true"') &&
    source.kanbanCard.includes('mobile-pan-item') &&
    source.kanbanCard.includes('selectAndOpenTaskDetails(nodeId)'),
);

assert(
  'large mobile canvas CTAs are tap actions but pass short-pan gestures through to the pan broker',
  source.useMobilePanBroker.includes('isMobilePanPassThroughTarget') &&
    source.useMobilePanBroker.includes('const passThrough = isMobilePanPassThroughTarget(event.target)') &&
    source.boardView.includes('data-kanban-add-column-button="true"') &&
    source.boardView.includes('data-mobile-pan-pass-through="true"') &&
    source.kanbanColumn.includes('data-kanban-add-task-button="true"') &&
    source.kanbanColumn.includes('data-mobile-pan-pass-through="true"') &&
    source.taskWorkbench.includes('data-task-workbench-unclassified-add="true"') &&
    source.taskWorkbench.includes('data-mobile-pan-pass-through="true"') &&
    source.browserVerifier.includes('kanban add-task button short-pan scrolls the board without creating a task') &&
    source.browserVerifier.includes('kanban add-task button vertical short-pan scrolls the column') &&
    source.browserVerifier.includes('board add-column button short-pan scrolls the board without creating a column'),
);

assert(
  'task workbench rows suppress compatibility click after mobile pan',
  source.taskWorkbench.includes('useTaskGestureSurface') &&
    source.taskGestureSurface.includes('useTouchTapGuard') &&
    source.taskWorkbench.includes('data-task-workbench-task-card="true"') &&
    source.taskWorkbench.includes('data-touch-tap-guard="true"') &&
    source.taskWorkbench.includes('selectAndOpenTaskDetails(task.id)'),
);

assert(
  'non-board mobile modes retain implementation hooks but are closed by mobile navigation',
  source.wbsListView.includes('data-mobile-pan-surface="wbs-list"') &&
    source.mindMapCanvasShell.includes('data-mobile-pan-surface="mindmap"') &&
    source.ganttView.includes('data-mobile-pan-surface="gantt"') &&
    source.ganttTaskBar.includes('const canEditSchedule = canEditTask && canMoveTask && !isCoarsePointer') &&
    source.browserVerifier.includes('mobile hides mode switcher controls') &&
    source.browserVerifier.includes('data-mode-switcher-value="list"') &&
    source.browserVerifier.includes('data-mode-switcher-value="gantt"'),
);

assert(
  'package exposes DEV-029 verifiers',
  source.packageJson.includes('"verify:dev-029-mobile-pan-first-interactions"') &&
    source.packageJson.includes('"verify:dev-029-mobile-pan-first-interactions-browser"'),
);

assert(
  'browser verifier covers mobile board-only pan-first contract',
  source.browserVerifier.includes('setCoarsePointer') &&
    source.browserVerifier.includes('mobile hides mode switcher controls') &&
    source.browserVerifier.includes('dispatchTouchGesture') &&
    source.browserVerifier.includes('card body pan suppresses task actions') &&
    source.browserVerifier.includes('mobile quick tap opens TaskDetailsModal when no pan movement occurs') &&
    source.browserVerifier.includes('desktop mouse click still opens TaskDetailsModal'),
);

assert(
  'mobile compact drag-action mode replaces mobile full task menu',
  source.mobileTaskActionContext.includes('MobileTaskActionContext') &&
    source.taskGesturePolicy.includes('window.innerWidth <= 768') &&
    source.boardView.includes('<TaskDragPresenter') &&
    source.taskDragPresenter.includes('data-mobile-task-action-rail') &&
    source.taskDragPresenter.includes('data-mobile-task-action-rail-placement="top"') &&
    source.taskDragPresenter.includes('data-mobile-task-action-text="true"') &&
    source.taskDragPresenter.includes('data-mobile-task-action-label={label}') &&
    source.taskDragPresenter.includes('標示完成') &&
    source.taskDragPresenter.includes('新增同階任務') &&
    source.taskDragPresenter.includes('新增下階任務') &&
    source.taskDragPresenter.includes('刪除任務') &&
    source.taskDragPresenter.includes('data-mobile-task-action={item.key}') &&
    source.taskDragPresenter.includes('data-mobile-drag-preview') &&
    source.taskDragPresenter.includes('data-mobile-drop-indicator') &&
    source.taskDragSession.includes('TASK_DRAG_FAILSAFE_MS') &&
    source.taskDragSession.includes('autoScrollTaskDragSurfaces') &&
    source.taskDragSession.includes("type: 'edge-scroll'") &&
    source.taskDragSession.includes("window.addEventListener('pointercancel'") &&
    source.taskDragSession.includes("document.addEventListener('visibilitychange'") &&
    source.taskDragSession.includes("event.key === 'Escape'") &&
    source.taskDragSession.includes("type: 'cancel:reset'") &&
    source.taskDragCommit.includes('showConfirm(') &&
    source.taskDragCommit.includes('確定要刪除任務') &&
    !source.useLongPress.includes('ignoreTaskDragHandle') &&
    !source.useLongPress.includes('data-task-drag-handle') &&
    source.kanbanCard.includes('data-task-drag-surface="true"') &&
    source.kanbanCard.includes('data-task-drag-surface-kind="kanban-card"') &&
    source.kanbanCard.includes('data-mobile-drop-target={nodeId}') &&
    source.kanbanCard.includes('useTaskGestureSurface') &&
    source.kanbanChecklist.includes('data-task-drag-surface="true"') &&
    source.kanbanChecklist.includes('data-task-drag-surface-kind="checklist-row"') &&
    source.kanbanChecklist.includes('data-mobile-drop-target={child.id}') &&
    source.kanbanChecklist.includes('useTaskGestureSurface') &&
    source.kanbanColumn.includes('data-task-drag-surface-kind="kanban-column-header"') &&
    source.kanbanColumn.includes('useTaskGestureSurface') &&
    source.taskGestureSurface.includes('mobileTaskAction?.begin(task, event, sourceKind)') &&
    source.taskGestureSurface.includes('onContextMenuCapture: shouldBindLongPress ? (event: React.MouseEvent) => {') &&
    source.taskGestureSurface.includes('if (isMobileTaskActionMode())') &&
    source.taskGestureSurface.includes('event.stopPropagation();') &&
    source.taskDragSession.includes("document.addEventListener('contextmenu', handleContextMenu, true)") &&
    source.taskDragSession.includes("type: 'contextmenu:suppressed'") &&
    source.globalContextMenu.includes('data-global-context-menu="true"') &&
    source.taskWorkbench.includes("sourceKind: 'workbench-unplaced-row'") &&
    source.taskWorkbench.includes('const WorkbenchPlacedReadOnlyCard') &&
    source.taskWorkbench.includes('mobileActionEnabled: false') &&
    source.taskWorkbench.includes('data-mobile-drop-target={task.id}'),
);

assert(
  'mobile compact action rail uses a single-row text-only layout',
  mobileActionItemsSource.includes('toggle-complete') &&
    mobileActionItemsSource.includes('add-sibling') &&
    mobileActionItemsSource.includes('add-child') &&
    mobileActionItemsSource.includes('delete') &&
    !mobileActionItemsSource.includes('icon:') &&
    !mobileActionLayerSource.includes('const Icon = item.icon') &&
    !mobileActionLayerSource.includes('<Icon') &&
    !source.taskDragPresenter.includes('CheckCircle2') &&
    !source.taskDragPresenter.includes('ListPlus') &&
    !source.taskDragPresenter.includes('Trash2') &&
    mobileActionLayerSource.includes('flex w-[calc(100vw-0.5rem)]') &&
    mobileActionLayerSource.includes('max-w-[430px]') &&
    mobileActionLayerSource.includes('gap-0') &&
    mobileActionLayerSource.includes('h-10') &&
    mobileActionLayerSource.includes('text-[12px]') &&
    mobileActionLayerSource.includes("style={{ top: 'env(safe-area-inset-top, 0px)' }}") &&
    !mobileActionLayerSource.includes('grid-cols-2') &&
    !mobileActionLayerSource.includes('gap-2'),
);

assert(
  'browser verifier covers Phase 1B mobile compact action rail operations',
    source.browserVerifier.includes('card long press enters mobile drag-action mode') &&
    source.browserVerifier.includes('checklist row long press enters mobile drag-action mode') &&
    source.browserVerifier.includes('former handle zone short pan scrolls the board') &&
    source.browserVerifier.includes('card former handle zone long press uses mobile action mode') &&
    source.browserVerifier.includes('checklist former handle zone long press uses mobile action mode') &&
    source.browserVerifier.includes('touchcancel exits mobile drag-action mode without committing') &&
    source.browserVerifier.includes('drag-action near right viewport edge auto-scrolls board') &&
    source.browserVerifier.includes('drag-action near bottom column edge auto-scrolls column') &&
    source.browserVerifier.includes('drop on delete action opens confirmation without immediate delete') &&
    source.browserVerifier.includes('long press drag to another task reorders by task position') &&
    source.browserVerifier.includes('drop on add-child action creates a child and opens details') &&
    source.browserVerifier.includes('drop on complete action toggles task completed state') &&
    source.browserVerifier.includes('workbench row long press enters mobile drag-action mode') &&
    source.browserVerifier.includes('placed workbench row is tap-only and never enters mobile drag-action mode') &&
    source.browserVerifier.includes('placed workbench long press must stay read-only for placement') &&
    source.browserVerifier.includes('placed workbench quick tap should still open task details') &&
    source.browserVerifier.includes('whole task surfaces use broker-owned touch arbitration without handles') &&
    source.browserVerifier.includes('assertCompactMobileActionRail') &&
    source.browserVerifier.includes('assertMobileContextMenuSuppressed') &&
    source.browserVerifier.includes('should keep only the top mobile action rail when contextmenu is synthesized') &&
    source.browserVerifier.includes('compact mobile action rail fits 320/390/430 without covering tasks'),
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
