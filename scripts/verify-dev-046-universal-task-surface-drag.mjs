import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  wbsNodeItem: 'src/components/Wbs/WbsNodeItem.tsx',
  sharedTaskSidebar: 'src/components/SharedTaskSidebar.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  dragSensors: 'src/hooks/useDragSensors.ts',
  taskInteractions: 'src/utils/taskInteractions.ts',
  useLongPress: 'src/hooks/useLongPress.ts',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-046-universal-task-surface-drag.md',
  qa: 'ai-doc/qa/QA-DEV-046-universal-task-surface-drag.md',
  devTask: 'ai-doc/dev_task.md',
  browserVerifier: 'scripts/verify-dev-046-universal-task-surface-drag-browser.pw.js',
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

const taskSurfaceFiles = [
  'kanbanCard',
  'kanbanChecklist',
  'kanbanColumn',
  'wbsNodeItem',
  'sharedTaskSidebar',
];

assert(
  'WBS task surfaces no longer import or render TaskDragHandle',
  taskSurfaceFiles.every(label => !source[label].includes('TaskDragHandle')) &&
    taskSurfaceFiles.every(label => !source[label].includes('data-task-drag-handle')) &&
    source.taskWorkbench.includes('data-task-workbench-drag-surface="task-row-root"') &&
    !source.taskWorkbench.includes('TaskDragHandle') &&
    !source.taskWorkbench.includes('data-task-drag-handle'),
);

assert(
  'Kanban cards expose root task drag surface bindings',
  source.kanbanCard.includes('const dragSurfaceBindings = mobileActionMode || isSelectingMode || isRecordCaptureMode') &&
    source.kanbanCard.includes('disabled: !canMoveTask || isSelectingMode || isRecordCaptureMode || mobileActionMode') &&
    source.kanbanCard.includes('{...dragSurfaceBindings}') &&
    source.kanbanCard.includes('data-task-drag-surface="true"') &&
    source.kanbanCard.includes('data-task-drag-surface-kind="kanban-card"') &&
    source.kanbanCard.includes('data-mobile-drop-target={nodeId}') &&
    source.kanbanCard.includes('selectAndOpenTaskDetails(nodeId)') &&
    source.kanbanCard.includes('onContextMenu={(e) => {') &&
    !source.kanbanCard.includes('ignoreTaskDragHandle'),
);

assert(
  'Checklist rows expose root task drag surface bindings for all recursive depths',
  source.kanbanChecklist.includes('const dragSurfaceBindings = mobileActionMode || isSelectingMode || isRecordCaptureMode') &&
    source.kanbanChecklist.includes('disabled: !canMoveTask || isSelectingMode || isRecordCaptureMode || mobileActionMode') &&
    source.kanbanChecklist.includes('{...dragSurfaceBindings}') &&
    source.kanbanChecklist.includes('data-task-drag-surface="true"') &&
    source.kanbanChecklist.includes('data-task-drag-surface-kind="checklist-row"') &&
    source.kanbanChecklist.includes('data-mobile-drop-target={child.id}') &&
    source.kanbanChecklist.includes('depth={depth + 1}') &&
    source.kanbanChecklist.includes('selectAndOpenTaskDetails(child.id)') &&
    !source.kanbanChecklist.includes('ignoreTaskDragHandle'),
);

assert(
  'Kanban list/header tasks expose a root header drag surface and mobile action rail path',
  source.kanbanColumn.includes('const columnHeaderDragBindings = mobileActionMode || isSelectingMode') &&
    source.kanbanColumn.includes('disabled: !canMoveTask || isSelectingMode || mobileActionMode') &&
    source.kanbanColumn.includes('{...columnHeaderDragBindings}') &&
    source.kanbanColumn.includes('{...columnHeaderTouchHandlers}') &&
    source.kanbanColumn.includes('data-task-drag-surface="true"') &&
    source.kanbanColumn.includes('data-task-drag-surface-kind="kanban-column-header"') &&
    source.kanbanColumn.includes('data-mobile-drop-target={nodeId}') &&
    source.kanbanColumn.includes('mobileTaskAction?.begin({ id: nodeId'),
);

assert(
  'WBS list rows expose root task drag surface bindings for every hierarchy level',
  source.wbsNodeItem.includes('const dragSurfaceBindings = mobileActionMode || isSelectingMode') &&
    source.wbsNodeItem.includes('disabled: !canMoveTask || isSelectingMode || mobileActionMode') &&
    source.wbsNodeItem.includes('{...dragSurfaceBindings}') &&
    source.wbsNodeItem.includes('data-task-drag-surface="true"') &&
    source.wbsNodeItem.includes('data-task-drag-surface-kind="wbs-list-row"') &&
    source.wbsNodeItem.includes('data-mobile-drop-target={node.id}') &&
    source.wbsNodeItem.includes('<WbsNodeItem key={child.id} nodeId={child.id} level={level + 1} ancestorIds={nextAncestorIds} />') &&
    source.wbsNodeItem.includes('if (isDragging || isSelectingMode || isTaskPrimaryActionTarget(event.target)) return;'),
);

assert(
  'Shared task sidebars expose row-root drag surfaces instead of visible handles',
  source.sharedTaskSidebar.includes('const dragSurfaceBindings = { ...attributes, ...listeners }') &&
    source.sharedTaskSidebar.includes('{...dragSurfaceBindings}') &&
    source.sharedTaskSidebar.includes('data-task-drag-surface="true"') &&
    source.sharedTaskSidebar.includes('data-task-drag-surface-kind="shared-sidebar-row"') &&
    source.sharedTaskSidebar.includes('if (isDragging) return;') &&
    !source.sharedTaskSidebar.includes('TaskDragHandle'),
);

assert(
  'Drag sensors protect interactive descendants now that the whole task surface is draggable',
  source.dragSensors.includes('class SmartMouseSensor extends MouseSensor') &&
    source.dragSensors.includes('class SmartTouchSensor extends TouchSensor') &&
    source.dragSensors.includes('class SmartKeyboardSensor extends KeyboardSensor') &&
    source.dragSensors.includes('useSensor(SmartMouseSensor') &&
    source.dragSensors.includes('useSensor(SmartTouchSensor') &&
    source.dragSensors.includes('[data-task-interaction-control="true"]') &&
    source.dragSensors.includes('[data-task-primary-action-control="true"]') &&
    source.dragSensors.includes('distance: 8') &&
    source.dragSensors.includes('delay: 250') &&
    source.dragSensors.includes('tolerance: 8'),
);

assert(
  'Primary action guards recognize task interaction controls without depending on handles',
  source.taskInteractions.includes('[data-task-interaction-control="true"]') &&
    source.taskInteractions.includes('[data-task-primary-action-control="true"]') &&
    source.taskInteractions.includes('[data-task-title-input="true"]'),
);

assert(
  'Long-press callers no longer pass drag-handle-only exclusions',
  taskSurfaceFiles.every(label => !source[label].includes('ignoreTaskDragHandle')) &&
    !source.taskWorkbench.includes('ignoreTaskDragHandle'),
);

assert(
  'DEV-046 documentation and scripts are registered',
  source.spec.includes('所有階層') &&
    source.qa.includes('極限操作') &&
    source.devTask.includes('DEV-046') &&
    source.packageJson.includes('"verify:dev-046-universal-task-surface-drag"') &&
    source.packageJson.includes('"verify:dev-046-universal-task-surface-drag-browser"') &&
    source.browserVerifier.includes('DEV-046 universal task surface drag'),
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
