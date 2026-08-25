import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaskNode } from '../src/types';
import { normalizeTaskWorkbenchUnplacedTask, TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../src/features/taskWorkbench/placementModel';
import { buildTaskSubtreePlacementUpdates } from '../src/components/Wbs/taskDrag/taskSubtreePlacement';

const now = Date.now();
const createNode = (overrides: Partial<TaskNode> & Pick<TaskNode, 'id' | 'title'>): TaskNode => ({
  id: overrides.id,
  title: overrides.title,
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  parentId: null,
  status: 'todo',
  nodeType: 'task',
  order: 0,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const nodes = {
  root: createNode({ id: 'root', title: '父任務', order: 2 }),
  child: createNode({ id: 'child', title: '子任務', parentId: 'root', order: 0 }),
  grandchild: createNode({ id: 'grandchild', title: '孫任務', parentId: 'child', order: 0 }),
  unrelated: createNode({ id: 'unrelated', title: '無關任務', order: 3 }),
};

const toUnplaced = buildTaskSubtreePlacementUpdates({
  rootNode: nodes.root,
  nodesRecord: nodes,
  targetBoardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
  rootParentId: null,
  rootOrder: 7,
  persistenceOrder: 'leaves-first',
});

assert.deepEqual(Object.keys(toUnplaced), ['grandchild', 'child', 'root']);
assert.equal(toUnplaced.root.parentId, null);
assert.equal(toUnplaced.child.parentId, 'root');
assert.equal(toUnplaced.grandchild.parentId, 'child');
assert.equal(toUnplaced.root.boardId, TASK_WORKBENCH_UNPLACED_BOARD_ID);
assert.equal(toUnplaced.child.boardId, TASK_WORKBENCH_UNPLACED_BOARD_ID);
assert.equal(toUnplaced.grandchild.boardId, TASK_WORKBENCH_UNPLACED_BOARD_ID);
assert.equal(toUnplaced.root.workspaceId, undefined);
assert.equal(toUnplaced.unrelated, undefined);

const groupNodes: Record<string, TaskNode> = {
  group: createNode({ id: 'group', title: 'L1 列表', nodeType: 'group' }),
  card: createNode({ id: 'card', title: 'L2 任務', parentId: 'group' }),
};
const groupToUnplaced = buildTaskSubtreePlacementUpdates({
  rootNode: groupNodes.group,
  nodesRecord: groupNodes,
  targetBoardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
  rootParentId: null,
  rootOrder: 8,
  persistenceOrder: 'leaves-first',
});
assert.equal(Object.keys(groupToUnplaced).length, 2, 'L1 group 必須連同 L2 子任務進入未歸位');
assert.equal(groupToUnplaced.group.nodeType, 'group', '暫存不得改寫 L1 nodeType');

const storedChild = normalizeTaskWorkbenchUnplacedTask({
  ...nodes.child,
  boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
});
assert.equal(storedChild.parentId, 'root', '未歸位正規化不得清除子任務 parentId');

const unplacedNodes: Record<string, TaskNode> = {
  root: { ...nodes.root, boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID },
  child: { ...nodes.child, boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID },
  grandchild: { ...nodes.grandchild, boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID },
};
const toBoard = buildTaskSubtreePlacementUpdates({
  rootNode: unplacedNodes.root,
  nodesRecord: unplacedNodes,
  targetWorkspaceId: 'workspace-b',
  targetBoardId: 'board-b',
  rootParentId: 'target-card',
  rootOrder: 4,
  rootNodeType: 'task',
  persistenceOrder: 'root-first',
});

assert.deepEqual(Object.keys(toBoard), ['root', 'child', 'grandchild']);
assert.equal(toBoard.root.parentId, 'target-card');
assert.equal(toBoard.child.parentId, 'root');
assert.equal(toBoard.grandchild.parentId, 'child');
Object.values(toBoard).forEach((update) => {
  assert.equal(update.workspaceId, 'workspace-b');
  assert.equal(update.boardId, 'board-b');
});

const taskWorkbenchSource = readFileSync(resolve('src/components/TaskWorkbenchPanel.tsx'), 'utf8');
const boardViewSource = readFileSync(resolve('src/components/BoardView.tsx'), 'utf8');
const dragTypesSource = readFileSync(resolve('src/components/Wbs/taskDrag/taskDragTypes.ts'), 'utf8');
const dragTargetSource = readFileSync(resolve('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts'), 'utf8');
const dragCommitSource = readFileSync(resolve('src/components/Wbs/taskDrag/taskDragCommit.ts'), 'utf8');
const dragPresenterSource = readFileSync(resolve('src/components/Wbs/taskDrag/TaskDragPresenter.tsx'), 'utf8');
const storeSource = readFileSync(resolve('src/store/useWbsStore.ts'), 'utf8');
const remoteSource = readFileSync(resolve('src/services/supabase/taskWorkbenchUnplacedService.ts'), 'utf8');
const unplacedProjectionSource = taskWorkbenchSource.slice(
  taskWorkbenchSource.indexOf('const unplacedTasks'),
  taskWorkbenchSource.indexOf('const sortedPlacedTasks'),
);

assert.match(taskWorkbenchSource, /data-task-workbench-unplaced-hierarchy="true"/);
assert.match(taskWorkbenchSource, /data-task-workbench-unplaced-subtree="true"/);
assert.match(taskWorkbenchSource, /data-task-hover-scope-kind="workbench-unplaced"/);
assert.match(taskWorkbenchSource, /--kanban-checklist-depth/);
assert.match(taskWorkbenchSource, /import \{ KanbanInsertionMarker \} from '\.\/Wbs\/KanbanInsertionMarker'/);
assert.match(taskWorkbenchSource, /data-task-workbench-unplaced-insertion-preview="true"/);
assert.match(taskWorkbenchSource, /data-task-workbench-insertion-preview-layer="overlay"/);
assert.match(taskWorkbenchSource, /<KanbanInsertionMarker compact className="py-0" \/>/);
assert.match(dragTypesSource, /\| 'workbench-unplaced-lane'/, '手機拖曳 target union 必須承接未歸位 lane');
assert.match(dragTargetSource, /targetKind: 'workbench-unplaced-lane'/, '手機 hit-test 必須解析未歸位 lane');
assert.match(dragTargetSource, /targetSurfaceKind: 'workbench-unplaced-lane'/);
assert.match(dragTargetSource, /indicatorAxis: 'horizontal'/, '手機未歸位預覽必須沿用 horizontal marker');
assert.match(dragCommitSource, /observation\.targetKind === 'workbench-unplaced-lane'/, '手機 commit 必須處理未歸位 lane');
assert.match(dragCommitSource, /commitTaskSubtreeToUnplaced/, '桌機與手機必須共用整棵子樹暫存提交 owner');
assert.match(dragPresenterSource, /data-mobile-drop-target-kind=\{state\.targetKind\}/);
assert.match(dragPresenterSource, /<KanbanInsertionMarker[\s\S]*axis=\{state\.dropIndicatorAxis \|\| 'horizontal'\}/, '手機定位線必須直接共用 KanbanInsertionMarker');
assert.doesNotMatch(unplacedProjectionSource, /showContainersInAllTasks|isTaskWorkbenchSortableTask/, '未歸位不得隱藏已搬入的 L1 group');
assert.doesNotMatch(boardViewSource, /含 \{activeDragDescendantCount\} 個子任務/);
assert.match(storeSource, /persistenceOrder\?: 'parallel' \| 'root-first' \| 'leaves-first'/);
assert.match(storeSource, /persistNodeTransition/);
assert.match(remoteSource, /parentId: typeof task\.parentId === 'string'/);

console.log(JSON.stringify({
  ok: true,
  summary: {
    movedSubtreeSize: Object.keys(toUnplaced).length,
    restoredSubtreeSize: Object.keys(toBoard).length,
    parentLinksPreserved: true,
    compactHierarchyContract: true,
    sharedInsertionPreviewContract: true,
    mobileUnplacedLaneContract: true,
  },
}, null, 2));
