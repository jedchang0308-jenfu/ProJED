import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  types: 'src/components/Wbs/taskDrag/taskDragTypes.ts',
  policy: 'src/components/Wbs/taskDrag/taskGesturePolicy.ts',
  surface: 'src/components/Wbs/taskDrag/useTaskGestureSurface.ts',
  session: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  target: 'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  commit: 'src/components/Wbs/taskDrag/taskDragCommit.ts',
  presenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  boardView: 'src/components/BoardView.tsx',
  dragSensors: 'src/hooks/useDragSensors.ts',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  workbench: 'src/components/TaskWorkbenchPanel.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-053-task-drag-muscle-memory-consistency.md',
  qa: 'ai-doc/qa/QA-DEV-053-task-drag-muscle-memory-consistency.md',
  browserVerifier: 'scripts/verify-dev-053-task-drag-muscle-memory-consistency-browser.pw.js',
};

const read = (file) => readFileSync(resolve(file), 'utf8');
const includesAll = (source, needles) => needles.every((needle) => source.includes(needle));
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(Object.entries(files)
  .filter(([, file]) => existsSync(resolve(file)))
  .map(([label, file]) => [label, read(file)]));

assert(
  'shared task drag contract names every allowed source and excludes placed rows',
  includesAll(source.types, [
    "'kanban-card'",
    "'checklist-row'",
    "'column-header'",
    "'wbs-list-row'",
    "'workbench-unplaced-row'",
    "export type TaskDragTargetKind = 'task-position' | 'workbench-placed-lane' | 'mobile-action' | 'none';",
    'export interface TaskDragObservation',
    'export interface TaskDragSessionState',
  ]) && !source.types.includes("'workbench-placed-row'"),
);

assert(
  'one gesture policy owns long-press threshold, pan tolerance, and interactive suppression',
  includesAll(source.policy, [
    'TASK_GESTURE_LONG_PRESS_MS = 500',
    'TASK_GESTURE_PAN_TOLERANCE_PX = 8',
    'isTaskGestureInteractiveTarget',
    '[data-task-interaction-control="true"]',
    '[data-task-primary-action-control="true"]',
    'canUseTaskSurfaceLongPress',
  ]),
);

assert(
  'card, checklist, column header, and workbench use the shared gesture surface',
  [source.kanbanCard, source.kanbanChecklist, source.kanbanColumn, source.workbench]
    .every((value) => value.includes('useTaskGestureSurface')) &&
    source.kanbanCard.includes("sourceKind: 'kanban-card'") &&
    source.kanbanChecklist.includes("sourceKind: 'checklist-row'") &&
    source.kanbanColumn.includes("sourceKind: 'column-header'") &&
    source.workbench.includes("sourceKind: 'workbench-unplaced-row'"),
);

const unplacedStart = source.workbench.indexOf('const WorkbenchUnplacedDragCard');
const placedStart = source.workbench.indexOf('const WorkbenchPlacedReadOnlyCard');
const wrapperStart = source.workbench.indexOf('const WorkbenchDragCard:', placedStart);
const unplacedComponent = source.workbench.slice(unplacedStart, placedStart);
const placedComponent = source.workbench.slice(placedStart, wrapperStart);

assert(
  'workbench unplaced row is the only placement drag source',
  unplacedStart >= 0 && placedStart > unplacedStart &&
    includesAll(unplacedComponent, [
      'useDraggable({',
      "placement: 'unplaced'",
      "sourceKind: 'workbench-unplaced-row'",
      'mobileActionEnabled: true',
    ]),
);

assert(
  'workbench placed row is tap-only and cannot create a desktop or mobile drag source',
  placedStart >= 0 && wrapperStart > placedStart &&
    includesAll(placedComponent, [
      'const WorkbenchPlacedReadOnlyCard',
      'sourceKind: null',
      'mobileActionEnabled: false',
      'placement="placed"',
      'canUseDragSurface={false}',
    ]) &&
    !placedComponent.includes('useDraggable(') &&
    !placedComponent.includes('mobileActionEnabled: true'),
);

assert(
  'target priority is centralized and ordered action, task, placed lane, none',
  includesAll(source.target, [
    'export const TASK_DRAG_TARGET_PRIORITY = [',
    "'mobile-action'",
    "'task-position'",
    "'workbench-placed-lane'",
    "'none'",
    'resolveTaskDragObservation',
  ]) && (source.target.match(/TASK_DRAG_TARGET_PRIORITY/g) || []).length === 1,
);

assert(
  'task drag session owns global touch and pointer lifecycle with at-most-once termination',
  includesAll(source.session, [
    'terminalSessionIdsRef',
    'const markTerminated',
    "recordTaskDragDebug({ type: 'terminal:ignored'",
    "window.addEventListener('touchmove'",
    "window.addEventListener('touchend'",
    "window.addEventListener('touchcancel'",
    "window.addEventListener('pointermove'",
    "window.addEventListener('pointerup'",
    "window.addEventListener('pointercancel'",
    "window.addEventListener('blur'",
    "window.addEventListener('pagehide'",
    "document.addEventListener('visibilitychange'",
    "window.removeEventListener('touchmove'",
    "window.removeEventListener('pointermove'",
    'autoScrollTaskDragSurfaces',
  ]),
);

assert(
  'presenter is render-only and cannot hit-test or mutate task stores',
  includesAll(source.presenter, [
    'data-mobile-drag-preview="true"',
    'data-mobile-drop-indicator="true"',
    'data-mobile-task-action-rail="true"',
  ]) &&
    !source.presenter.includes('useWbsStore') &&
    !source.presenter.includes('elementFromPoint') &&
    !source.presenter.includes('batchUpdateNodes') &&
    !source.presenter.includes('commitTask'),
);

assert(
  'committer revalidates against latest store state and batches placement or reorder writes',
  includesAll(source.commit, [
    'const state = useWbsStore.getState();',
    'const latestNode = useWbsStore.getState().nodes[nodeId];',
    "noOp('workbench-placed-row-is-not-a-source')",
    "dependencies.batchUpdateNodes(updates, { label: '移動任務位置'",
    "dependencies.batchUpdateNodes({",
    "mergeKey: `placement:${draggedNode.id}`",
    'isValidTaskDropIntent',
  ]),
);

assert(
  'BoardView delegates session, presenter, and desktop commit without owning mobile listeners',
  includesAll(source.boardView, [
    'useTaskDragSession({',
    '<TaskDragPresenter',
    'commitDesktopTaskDrag({',
    '<DragOverlay dropAnimation={null}>',
  ]) &&
    !source.boardView.includes("window.addEventListener('touchmove'") &&
    !source.boardView.includes('resolveTaskDragObservation') &&
    !source.boardView.includes('autoScrollTaskDragSurfaces'),
);

assert(
  'approved desktop drag UI baseline remains frozen',
  includesAll(source.boardView, [
    'data-kanban-drag-overlay="true"',
    'pointer-events-none translate-x-4 translate-y-4 rounded-lg',
    'border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg',
    "activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'",
  ]) &&
    source.dragSensors.includes('SmartMouseSensor extends MouseSensor') &&
    source.dragSensors.includes('SmartKeyboardSensor extends KeyboardSensor') &&
    source.dragSensors.includes('distance: 8') &&
    !source.dragSensors.includes('TouchSensor'),
);

const trueOperationIds = Array.from({ length: 14 }, (_, index) =>
  `QA-053-T${String(index + 1).padStart(2, '0')}`);
assert(
  'development documents require all T01-T14 true-operation cases before completion',
  source.spec.includes('QA True Operation Gate') &&
    source.spec.includes('桌機拖拉 UI') &&
    source.qa.includes('QA True Operation Gate（完成必要）') &&
    trueOperationIds.every((id) => source.qa.includes(id)) &&
    source.qa.includes('T01-T14 全數 Pass') &&
    source.qa.includes('Physical phone supplemental not executed'),
);

assert(
  'DEV-053 static and browser gates are registered with real operation coverage',
  source.packageJson.includes('"verify:dev-053-task-drag-muscle-memory-consistency"') &&
    source.packageJson.includes('"verify:dev-053-task-drag-muscle-memory-consistency-browser"') &&
    includesAll(source.browserVerifier, [
      'DEV-053 desktop approved drag overlay remains unchanged',
      'desktop card, checklist, and column header clicks open the matching details',
      'desktop card, checklist, and column header right click opens the task context menu',
      'mobile card, checklist, and column header quick taps open the matching details',
      'mobile short pan scrolls without task writes or click-through',
      'mobile invalid drop is a zero-write no-op and the next session starts immediately',
      'active mobile session cleans up on touchcancel, pointercancel, Escape, blur, and visibility hidden',
      'mobile placed workbench row is long-press read-only and quick-tap opens details',
      '320/390/430 viewport and visible-error sweep',
      'Input.dispatchTouchEvent',
      'page.mouse.down()',
      'page.screenshot',
    ]),
);

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
