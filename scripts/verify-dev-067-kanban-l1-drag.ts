import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TaskNode } from '../src/types';
import {
  resolveTaskDropIntent,
  type TaskDropDescriptor,
} from '../src/components/Wbs/taskDrag/taskDropIntent';
import {
  resolveDesktopTaskDropIntent,
} from '../src/components/Wbs/taskDrag/desktopTaskDropPreview';
import {
  DESKTOP_L1_MIDPOINT_HYSTERESIS_PX,
  resolveDesktopL1IndicatorRect,
  resolveDesktopL1OrderingTarget,
} from '../src/components/Wbs/taskDrag/desktopL1DropPolicy';
import {
  MOBILE_L1_MIDPOINT_HYSTERESIS_PX,
  resolveMobileL1IndicatorRect,
  resolveMobileL1OrderingTarget,
} from '../src/components/Wbs/taskDrag/mobileL1DropPolicy';

const now = 1_723_600_000_000;
const node = (value: Partial<TaskNode> & Pick<TaskNode, 'id' | 'parentId' | 'order' | 'nodeType'>): TaskNode => ({
  id: value.id,
  workspaceId: 'workspace-dev067',
  boardId: 'board-dev067',
  parentId: value.parentId,
  title: value.id,
  status: 'todo',
  nodeType: value.nodeType,
  order: value.order,
  createdAt: now,
  updatedAt: now,
  ...value,
});

const nodes: Record<string, TaskNode> = {
  rootA: node({ id: 'rootA', parentId: null, order: 0, nodeType: 'group' }),
  rootB: node({ id: 'rootB', parentId: null, order: 1, nodeType: 'group' }),
  cardA: node({ id: 'cardA', parentId: 'rootA', order: 0, nodeType: 'task' }),
  cardB: node({ id: 'cardB', parentId: 'rootB', order: 0, nodeType: 'task' }),
  childA: node({ id: 'childA', parentId: 'cardA', order: 0, nodeType: 'task' }),
  grandchildA: node({ id: 'grandchildA', parentId: 'childA', order: 0, nodeType: 'task' }),
  unplaced: node({
    id: 'unplaced',
    boardId: '__task_workbench_unplaced__',
    parentId: null,
    order: 0,
    nodeType: 'task',
  }),
};

const resolve = (source: TaskDropDescriptor, target: TaskDropDescriptor) =>
  resolveTaskDropIntent({ source, target, nodesRecord: nodes });

const cardToHeader = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.deepEqual(cardToHeader, {
  parentId: null,
  order: 0.5,
  nodeType: 'group',
  displayPosition: 'before',
});

assert.equal(nodes.childA.parentId, 'cardA');
assert.equal(nodes.grandchildA.parentId, 'childA');

const childToHeader = resolve(
  { nodeId: 'childA', surfaceKind: 'checklist-row' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.equal(childToHeader?.parentId, null);
assert.equal(childToHeader?.nodeType, 'group');
assert.equal(childToHeader?.displayPosition, 'before');

const cardToRootEnd = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'root-drop' },
);
assert.deepEqual(cardToRootEnd, {
  parentId: null,
  order: 2,
  nodeType: 'group',
  displayPosition: 'append',
});

const unplacedToEmptyBoard = resolveDesktopTaskDropIntent({
  activeData: { type: 'wbs-card', source: 'task-workbench', nodeId: 'unplaced' },
  targetData: {
    type: 'wbs-root-drop',
    nodeId: null,
    workspaceId: 'workspace-empty',
    boardId: 'board-empty',
  },
  nodesRecord: nodes,
});
assert.deepEqual(unplacedToEmptyBoard, {
  intent: {
    parentId: null,
    order: 0,
    nodeType: 'task',
    displayPosition: 'append',
  },
  outcomeKind: 'move',
  sourceSurfaceKind: 'kanban-card',
  targetSurfaceKind: 'root-drop',
});

const cardToColumnBody = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'column-drop' },
);
assert.equal(cardToColumnBody?.parentId, 'rootB');
assert.equal(cardToColumnBody?.nodeType, 'task');
assert.equal(cardToColumnBody?.displayPosition, 'append');

const rootReorder = resolve(
  { nodeId: 'rootA', surfaceKind: 'column-header' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.equal(rootReorder?.parentId, null);
assert.equal(rootReorder?.nodeType, 'group');
assert.equal(rootReorder?.displayPosition, 'after');

const explicitRootBefore = resolve(
  { nodeId: 'rootA', surfaceKind: 'column-header' },
  { nodeId: 'rootB', surfaceKind: 'column-header', orderingPosition: 'before' },
);
assert.equal(explicitRootBefore?.displayPosition, 'before');

const l1Columns = [
  { id: 'rootA', left: 0, right: 270, top: 20, bottom: 420 },
  { id: 'rootB', left: 282, right: 552, top: 20, bottom: 620 },
];
const rootBBefore = resolveDesktopL1OrderingTarget({
  pointerX: 350,
  columns: l1Columns,
});
assert.deepEqual(rootBBefore, {
  targetId: 'rootB',
  orderingPosition: 'before',
  boundaryIndex: 1,
});
assert.equal(resolveDesktopL1OrderingTarget({
  pointerX: 417 + DESKTOP_L1_MIDPOINT_HYSTERESIS_PX - 1,
  columns: l1Columns,
  previousTarget: rootBBefore,
})?.orderingPosition, 'before');
assert.equal(resolveDesktopL1OrderingTarget({
  pointerX: 417 + DESKTOP_L1_MIDPOINT_HYSTERESIS_PX + 1,
  columns: l1Columns,
  previousTarget: rootBBefore,
})?.orderingPosition, 'after');

const afterRootA = resolveDesktopL1IndicatorRect({
  targetId: 'rootA',
  orderingPosition: 'after',
  columns: l1Columns,
});
const beforeRootB = resolveDesktopL1IndicatorRect({
  targetId: 'rootB',
  orderingPosition: 'before',
  columns: l1Columns,
});
assert.deepEqual(afterRootA, beforeRootB);
assert.deepEqual(afterRootA, {
  left: 273,
  top: 20,
  width: 6,
  height: 600,
});

const emptyBoardIndicator = resolveDesktopL1IndicatorRect({
  targetId: '',
  orderingPosition: 'after',
  columns: [],
  rootDropRect: { left: 12, right: 612, top: 20, bottom: 620 },
  viewportRect: { top: 48, bottom: 600 },
});
assert.deepEqual(emptyBoardIndicator, {
  left: 12,
  top: 48,
  width: 6,
  height: 552,
});

const mobileRootBBefore = resolveMobileL1OrderingTarget({
  pointerX: 350,
  columns: l1Columns,
});
assert.deepEqual(mobileRootBBefore, rootBBefore);
assert.equal(resolveMobileL1OrderingTarget({
  pointerX: 417 + MOBILE_L1_MIDPOINT_HYSTERESIS_PX - 1,
  columns: l1Columns,
  previousTarget: mobileRootBBefore,
})?.orderingPosition, 'before');
assert.equal(resolveMobileL1OrderingTarget({
  pointerX: 417 + MOBILE_L1_MIDPOINT_HYSTERESIS_PX + 1,
  columns: l1Columns,
  previousTarget: mobileRootBBefore,
})?.orderingPosition, 'after');
assert.deepEqual(resolveMobileL1IndicatorRect({
  targetId: 'rootB',
  orderingPosition: 'before',
  columns: l1Columns,
}), beforeRootB);

const invalidCycle = resolve(
  { nodeId: 'rootA', surfaceKind: 'column-header' },
  { nodeId: 'cardA', surfaceKind: 'checklist-drop' },
);
assert.equal(invalidCycle, null);

const source = {
  board: readFileSync('src/components/BoardView.tsx', 'utf8'),
  rootZone: readFileSync('src/components/Wbs/KanbanRootDropZone.tsx', 'utf8'),
  intent: readFileSync('src/components/Wbs/taskDrag/taskDropIntent.ts', 'utf8'),
  commit: readFileSync('src/components/Wbs/taskDrag/taskDragCommit.ts', 'utf8'),
  mobile: readFileSync('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts', 'utf8'),
  presenter: readFileSync('src/components/Wbs/taskDrag/TaskDragPresenter.tsx', 'utf8'),
  desktopPreview: readFileSync('src/components/Wbs/taskDrag/desktopTaskDropPreview.ts', 'utf8'),
  l1Policy: readFileSync('src/components/Wbs/taskDrag/desktopL1DropPolicy.ts', 'utf8'),
  mobileL1Policy: readFileSync('src/components/Wbs/taskDrag/mobileL1DropPolicy.ts', 'utf8'),
  insertionMarker: readFileSync('src/components/Wbs/KanbanInsertionMarker.tsx', 'utf8'),
  spec: readFileSync('ai-doc/specs/SPEC-067-kanban-l1-drag-promotion.md', 'utf8'),
  qa: readFileSync('ai-doc/qa/QA-DEV-067-kanban-l1-drag-promotion.md', 'utf8'),
};

assert.match(source.board, /<KanbanRootDropZone/);
assert.match(source.rootZone, /type: 'wbs-root-drop'/);
assert.match(source.rootZone, /disabled: !canMoveTask/);
assert.match(source.rootZone, /data-task-drop-surface-kind="root-drop"/);
assert.match(source.rootZone, /data-kanban-empty-board-drop=\{isBoardEmpty \? 'true'/);
assert.match(source.intent, /if \(targetType === 'wbs-root-drop'\) return 'root-drop'/);
assert.match(source.commit, /normalizeTaskMoveUpdates\(draggedNode\.id, intent, state\.nodes\)/);
assert.match(source.commit, /placed-on-empty-board/);
assert.match(source.mobile, /data-task-drop-node-id/);
assert.match(source.mobile, /targetKind: 'board-root'/);
assert.match(source.presenter, /data-mobile-drop-surface-kind=\{state\.targetSurfaceKind/);
assert.match(source.presenter, /data-mobile-drop-axis=\{state\.dropIndicatorAxis/);
assert.match(source.board, /resolveDesktopL1OrderingTarget/);
assert.match(source.board, /data-desktop-drop-axis=\{desktopIndicator\.axis\}/);
assert.match(source.desktopPreview, /indicatorAxis: resolved\.targetSurfaceKind === 'column-header'/);
assert.match(source.l1Policy, /DESKTOP_L1_MIDPOINT_HYSTERESIS_PX = 14/);
assert.match(source.mobileL1Policy, /MOBILE_L1_MIDPOINT_HYSTERESIS_PX = 24/);
assert.match(source.mobile, /resolveMobileL1OrderingTarget/);
assert.match(source.mobile, /resolveMobileL1IndicatorRect/);
assert.match(source.commit, /orderingPosition: observation\.dropPosition/);
assert.match(source.insertionMarker, /data-kanban-insertion-axis="vertical"/);
assert.match(source.spec, /Intentional replacement/);
assert.match(source.qa, /QA-067-011/);

console.log(JSON.stringify({
  ok: true,
  cases: 35,
  intents: {
    cardToHeader,
    childToHeader,
    cardToRootEnd,
    unplacedToEmptyBoard,
    cardToColumnBody,
    rootReorder,
    explicitRootBefore,
  },
  l1Geometry: { rootBBefore, afterRootA, beforeRootB, emptyBoardIndicator, mobileRootBBefore },
}, null, 2));
