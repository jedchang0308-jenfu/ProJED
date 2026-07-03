import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  placement: 'src/features/taskWorkbench/placement.ts',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
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
    source.taskWorkbench.includes('所有任務排序') &&
    source.taskWorkbench.includes('sortTasksByDueDate') &&
    source.taskWorkbench.includes('data-task-workbench-unplaced-compact-row="true"') &&
    source.taskWorkbench.includes('kanban-checklist-item') &&
    source.taskWorkbench.includes("placement: 'placed'") &&
    source.taskWorkbench.includes("placement: 'unplaced'"),
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
