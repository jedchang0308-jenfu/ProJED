import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TaskNode } from '../src/types';
import {
  advanceTaskChildIntent,
  getTaskChildIntentRemainingMs,
  resolveTaskChildInsertionMarkerRect,
  TASK_CHILD_DROP_DWELL_MS,
} from '../src/components/Wbs/taskDrag/taskChildDropTarget';
import {
  DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX,
  DESKTOP_TASK_DRAG_OVERLAY_SCALE,
  resolvePointerUpperRightOverlayPosition,
  TASK_DRAG_OVERLAY_POINTER_GAP_PX,
  TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX,
} from '../src/components/Wbs/taskDrag/taskDragOverlayPosition';
import {
  isTaskDropIntentOrigin,
  resolveTaskDropOutcome,
  resolveTaskDropIntent,
} from '../src/components/Wbs/taskDrag/taskDropIntent';
import {
  DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX,
  DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX,
  isDesktopPointerInColumnTailExterior,
  resolveDesktopColumnDropPointerRegion,
  resolveDesktopColumnTaskCacheYRange,
  resolveDesktopTaskEdgePosition,
  selectNearestDesktopTaskGapCandidate,
} from '../src/components/Wbs/taskDrag/desktopColumnDropPolicy';
import {
  MOBILE_TASK_EDGE_HYSTERESIS_PX,
  resolveMobileTaskEdgePosition,
} from '../src/components/Wbs/taskDrag/mobileTaskDropPolicy';

const now = 1_723_600_000_000;
const node = (value: Partial<TaskNode> & Pick<TaskNode, 'id' | 'parentId' | 'order' | 'nodeType'>): TaskNode => ({
  id: value.id,
  workspaceId: 'workspace-dev068',
  boardId: 'board-dev068',
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
  cardBChildA: node({ id: 'cardBChildA', parentId: 'cardB', order: 0, nodeType: 'task' }),
  cardBChildB: node({ id: 'cardBChildB', parentId: 'cardB', order: 1, nodeType: 'task' }),
  deepA: node({ id: 'deepA', parentId: 'cardA', order: 0, nodeType: 'task' }),
  deepB: node({ id: 'deepB', parentId: 'deepA', order: 0, nodeType: 'task' }),
  archivedTarget: node({ id: 'archivedTarget', parentId: 'rootB', order: 9, nodeType: 'task', isArchived: true }),
  otherBoardTarget: node({
    id: 'otherBoardTarget',
    parentId: null,
    order: 0,
    nodeType: 'group',
    workspaceId: 'workspace-dev068',
    boardId: 'board-other',
  }),
};

const start = advanceTaskChildIntent({
  current: { phase: 'none', targetId: null, candidateSince: null },
  targetId: 'cardB',
  now,
});
assert.deepEqual(start, { phase: 'candidate', targetId: 'cardB', candidateSince: now });
assert.equal(getTaskChildIntentRemainingMs(start, now), TASK_CHILD_DROP_DWELL_MS);

const at999 = advanceTaskChildIntent({ current: start, targetId: 'cardB', now: now + 999 });
assert.equal(at999.phase, 'candidate');
assert.equal(getTaskChildIntentRemainingMs(at999, now + 999), 1);

const at1000 = advanceTaskChildIntent({ current: at999, targetId: 'cardB', now: now + 1000 });
assert.equal(at1000.phase, 'armed');
assert.equal(getTaskChildIntentRemainingMs(at1000, now + 1000), null);

const switched = advanceTaskChildIntent({ current: at1000, targetId: 'rootB', now: now + 1100 });
assert.deepEqual(switched, { phase: 'candidate', targetId: 'rootB', candidateSince: now + 1100 });
assert.deepEqual(
  advanceTaskChildIntent({ current: switched, targetId: null, now: now + 1200 }),
  { phase: 'none', targetId: null, candidateSince: null },
);

const cardToCardChild = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'cardB', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.deepEqual(cardToCardChild, {
  parentId: 'cardB',
  order: 2,
  nodeType: 'task',
  displayPosition: 'append',
});

const crossColumnBefore = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'cardB', surfaceKind: 'kanban-card', orderingPosition: 'before' },
  nodesRecord: nodes,
});
assert.deepEqual(crossColumnBefore, {
  parentId: 'rootB',
  order: -0.5,
  nodeType: 'task',
  displayPosition: 'before',
});

const crossColumnAfter = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'cardB', surfaceKind: 'kanban-card', orderingPosition: 'after' },
  nodesRecord: nodes,
});
assert.deepEqual(crossColumnAfter, {
  parentId: 'rootB',
  order: 0.5,
  nodeType: 'task',
  displayPosition: 'after',
});

const childReturningToOriginalAppend = resolveTaskDropIntent({
  source: { nodeId: 'cardBChildB', surfaceKind: 'checklist-row' },
  target: { nodeId: 'cardB', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(
  isTaskDropIntentOrigin('cardBChildB', childReturningToOriginalAppend, nodes),
  true,
  'the last child appended back to its current parent must be recognized as origin/no-op',
);

const childMovingToAppend = resolveTaskDropIntent({
  source: { nodeId: 'cardBChildA', surfaceKind: 'checklist-row' },
  target: { nodeId: 'cardB', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(
  isTaskDropIntentOrigin('cardBChildA', childMovingToAppend, nodes),
  false,
  'a non-last child appended within the same parent is a real reorder, not origin/no-op',
);

const canonicalOutcomeMatrix = [
  {
    id: 'column-header-move',
    source: { nodeId: 'rootA', surfaceKind: 'column-header' as const },
    target: { nodeId: 'rootB', surfaceKind: 'column-header' as const },
    expected: 'move',
  },
  {
    id: 'root-drop-origin',
    source: { nodeId: 'rootB', surfaceKind: 'column-header' as const },
    target: { nodeId: 'rootA', surfaceKind: 'root-drop' as const },
    expected: 'origin',
  },
  {
    id: 'card-move',
    source: { nodeId: 'cardBChildA', surfaceKind: 'checklist-row' as const },
    target: { nodeId: 'cardBChildB', surfaceKind: 'kanban-card' as const },
    expected: 'move',
  },
  {
    id: 'checklist-row-move',
    source: { nodeId: 'cardBChildA', surfaceKind: 'checklist-row' as const },
    target: { nodeId: 'cardBChildB', surfaceKind: 'checklist-row' as const },
    expected: 'move',
  },
  ...(['column-drop', 'checklist-drop', 'task-title-child'] as const).map(surfaceKind => ({
    id: `${surfaceKind}-append-origin`,
    source: { nodeId: 'cardBChildB', surfaceKind: 'checklist-row' as const },
    target: { nodeId: 'cardB', surfaceKind },
    expected: 'origin',
  })),
  {
    id: 'same-parent-reorder-move',
    source: { nodeId: 'cardBChildB', surfaceKind: 'checklist-row' as const },
    target: { nodeId: 'cardBChildA', surfaceKind: 'checklist-row' as const },
    expected: 'move',
  },
  {
    id: 'cross-parent-append-move',
    source: { nodeId: 'cardBChildA', surfaceKind: 'checklist-row' as const },
    target: { nodeId: 'cardA', surfaceKind: 'column-drop' as const },
    expected: 'move',
  },
  {
    id: 'descendant-cycle-invalid',
    source: { nodeId: 'cardA', surfaceKind: 'kanban-card' as const },
    target: { nodeId: 'deepB', surfaceKind: 'task-title-child' as const },
    expected: 'invalid',
  },
].map(testCase => ({
  id: testCase.id,
  actual: resolveTaskDropOutcome({
    source: testCase.source,
    target: testCase.target,
    nodesRecord: nodes,
  }).kind,
  expected: testCase.expected,
}));
canonicalOutcomeMatrix.forEach(testCase => {
  assert.equal(testCase.actual, testCase.expected, `${testCase.id} must have one canonical outcome`);
});

const rootToDeepChild = resolveTaskDropIntent({
  source: { nodeId: 'rootB', surfaceKind: 'column-header' },
  target: { nodeId: 'deepA', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(rootToDeepChild?.parentId, 'deepA');
assert.equal(rootToDeepChild?.nodeType, 'task');
assert.equal(rootToDeepChild?.displayPosition, 'append');

const invalidCycle = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'deepB', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(invalidCycle, null);

const invalidSelf = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'cardA', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(invalidSelf, null);

const invalidArchivedTarget = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'archivedTarget', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(invalidArchivedTarget, null);

const invalidMissingTarget = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'missingTarget', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(invalidMissingTarget, null);

const invalidCrossBoard = resolveTaskDropIntent({
  source: { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  target: { nodeId: 'otherBoardTarget', surfaceKind: 'task-title-child' },
  nodesRecord: nodes,
});
assert.equal(invalidCrossBoard, null);

const pointerUpperRight = resolvePointerUpperRightOverlayPosition({
  pointer: { x: 100, y: 200 },
  overlay: { width: 240, height: 40 },
  viewport: { left: 0, top: 0, width: 390, height: 844 },
});
assert.deepEqual(pointerUpperRight, { left: 116, top: 144, placement: 'upper-right' });

const pointerRightEdgeFallback = resolvePointerUpperRightOverlayPosition({
  pointer: { x: 370, y: 200 },
  overlay: { width: 240, height: 40 },
  viewport: { left: 0, top: 0, width: 390, height: 844 },
});
assert.deepEqual(pointerRightEdgeFallback, { left: 114, top: 144, placement: 'upper-left' });

const pointerTopClamp = resolvePointerUpperRightOverlayPosition({
  pointer: { x: 100, y: 20 },
  overlay: { width: 240, height: 40 },
  viewport: { left: 0, top: 0, width: 390, height: 844 },
});
assert.equal(pointerTopClamp.top, TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX);
assert.equal(TASK_DRAG_OVERLAY_POINTER_GAP_PX, 16);
assert.equal(DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX, 0);
assert.equal(DESKTOP_TASK_DRAG_OVERLAY_SCALE, 0.5);

const desktopPointerAttached = resolvePointerUpperRightOverlayPosition({
  pointer: { x: 100, y: 200 },
  overlay: { width: 240 * DESKTOP_TASK_DRAG_OVERLAY_SCALE, height: 40 * DESKTOP_TASK_DRAG_OVERLAY_SCALE },
  viewport: { left: 0, top: 0, width: 390, height: 844 },
  pointerGap: DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX,
});
assert.deepEqual(desktopPointerAttached, { left: 100, top: 180, placement: 'upper-right' });

const columnTaskRects = [
  { id: 'card-a', top: 100, bottom: 160 },
  { id: 'card-b', top: 168, bottom: 260 },
  { id: 'card-c', top: 268, bottom: 320 },
];
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 164,
  columnTop: 80,
  columnBottom: 500,
  taskRects: columnTaskRects,
}), { kind: 'task-nearest', candidateIds: ['card-a', 'card-b'] });
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 200,
  columnTop: 80,
  columnBottom: 500,
  taskRects: columnTaskRects,
}), { kind: 'task-nearest', candidateIds: ['card-b'] });
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 320 + DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX,
  columnTop: 80,
  columnBottom: 500,
  taskRects: columnTaskRects,
}), { kind: 'column-append' });
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 320 + DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX + 1,
  columnTop: 80,
  columnBottom: 500,
  taskRects: columnTaskRects,
}), { kind: 'none' });
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 90,
  columnTop: 80,
  columnBottom: 500,
  taskRects: columnTaskRects,
}), { kind: 'task-nearest', candidateIds: ['card-a'] });
assert.deepEqual(resolveDesktopColumnDropPointerRegion({
  pointerY: 300,
  columnTop: 80,
  columnBottom: 500,
  taskRects: [],
}), { kind: 'column-append' });
assert.deepEqual(selectNearestDesktopTaskGapCandidate({
  pointerY: 166,
  candidates: [
    { id: 'card-a', indicatorTop: 160 },
    { id: 'card-b', indicatorTop: 168 },
  ],
}), { id: 'card-b', indicatorTop: 168 });
assert.equal(resolveDesktopTaskEdgePosition({ pointerY: 100, taskTop: 100, taskBottom: 300 }), 'before');
assert.equal(resolveDesktopTaskEdgePosition({ pointerY: 200, taskTop: 100, taskBottom: 300 }), 'before');
assert.equal(resolveDesktopTaskEdgePosition({ pointerY: 290, taskTop: 100, taskBottom: 300 }), 'after');
assert.equal(resolveMobileTaskEdgePosition({
  pointerY: 200 + MOBILE_TASK_EDGE_HYSTERESIS_PX - 1,
  taskTop: 100,
  taskBottom: 300,
  previousPosition: 'before',
}), 'before');
assert.equal(resolveMobileTaskEdgePosition({
  pointerY: 200 + MOBILE_TASK_EDGE_HYSTERESIS_PX + 1,
  taskTop: 100,
  taskBottom: 300,
  previousPosition: 'before',
}), 'after');
assert.equal(resolveMobileTaskEdgePosition({
  pointerY: 200 - MOBILE_TASK_EDGE_HYSTERESIS_PX + 1,
  taskTop: 100,
  taskBottom: 300,
  previousPosition: 'after',
}), 'after');
assert.equal(resolveMobileTaskEdgePosition({
  pointerY: 200 - MOBILE_TASK_EDGE_HYSTERESIS_PX - 1,
  taskTop: 100,
  taskBottom: 300,
  previousPosition: 'after',
}), 'before');
assert.equal(resolveMobileTaskEdgePosition({
  pointerY: 102,
  taskTop: 100,
  taskBottom: 120,
  previousPosition: 'after',
}), 'before', 'compact checklist rows must keep both edge zones reachable');
assert.deepEqual(resolveDesktopColumnTaskCacheYRange({
  pointerY: 164,
  columnTop: 80,
  taskRects: columnTaskRects,
  candidateIds: ['card-a', 'card-b'],
}), { top: 160, bottom: 168 });
assert.deepEqual(resolveDesktopColumnTaskCacheYRange({
  pointerY: 250,
  columnTop: 80,
  taskRects: columnTaskRects,
  candidateIds: ['card-b'],
}), { top: 214, bottom: 260 });
assert.deepEqual(resolveDesktopColumnTaskCacheYRange({
  pointerY: 90,
  columnTop: 80,
  taskRects: columnTaskRects,
  candidateIds: ['card-a'],
}), { top: 80, bottom: 100 });
assert.equal(isDesktopPointerInColumnTailExterior({
  pointerX: 150,
  pointerY: 502,
  columnLeft: 20,
  columnRight: 260,
  columnBottom: 500,
}), true);
assert.equal(isDesktopPointerInColumnTailExterior({
  pointerX: 150,
  pointerY: 500 + DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX + 1,
  columnLeft: 20,
  columnRight: 260,
  columnBottom: 500,
}), false);
assert.equal(isDesktopPointerInColumnTailExterior({
  pointerX: 261,
  pointerY: 502,
  columnLeft: 20,
  columnRight: 260,
  columnBottom: 500,
}), false);

const targetRect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const l1ChildInsertion = resolveTaskChildInsertionMarkerRect({
  safeRect: targetRect(8, 41, 252, 615.2),
  primaryRect: targetRect(8.8, 41.8, 250.4, 32),
  subtreeRect: targetRect(13.8, 78.8, 240.4, 536.6),
  scopeKind: 'column',
  directChildTitleLeft: 19.6,
  fallbackChildTitleLeft: null,
  directChildContentRight: 248.4,
  inputMode: 'mouse',
  viewportWidth: 1440,
  viewportHeight: 900,
});
assert.deepEqual(l1ChildInsertion, { left: 19.6, top: 618.4, width: 228.8 });

const l2ChildInsertion = resolveTaskChildInsertionMarkerRect({
  safeRect: targetRect(14, 100, 240, 30),
  primaryRect: targetRect(15, 101, 238, 28),
  subtreeRect: null,
  scopeKind: 'card',
  directChildTitleLeft: null,
  fallbackChildTitleLeft: 31,
  directChildContentRight: null,
  inputMode: 'mouse',
  viewportWidth: 390,
  viewportHeight: 844,
});
assert.deepEqual(l2ChildInsertion, { left: 31, top: 132, width: 222 });

const l3ChildInsertion = resolveTaskChildInsertionMarkerRect({
  safeRect: targetRect(27, 110, 215, 20),
  primaryRect: targetRect(27, 110, 215, 20),
  subtreeRect: null,
  scopeKind: 'checklist',
  directChildTitleLeft: null,
  fallbackChildTitleLeft: 45,
  directChildContentRight: null,
  inputMode: 'touch',
  viewportWidth: 390,
  viewportHeight: 844,
});
assert.deepEqual(l3ChildInsertion, { left: 45, top: 133, width: 197 });

const viewportClampedInsertion = resolveTaskChildInsertionMarkerRect({
  safeRect: targetRect(350, 820, 100, 50),
  primaryRect: targetRect(360, 825, 80, 30),
  subtreeRect: null,
  scopeKind: 'checklist',
  directChildTitleLeft: null,
  fallbackChildTitleLeft: 396,
  directChildContentRight: null,
  inputMode: 'touch',
  viewportWidth: 390,
  viewportHeight: 844,
});
assert.deepEqual(viewportClampedInsertion, { left: 334, top: 836, width: 48 });

const source = {
  board: readFileSync('src/components/BoardView.tsx', 'utf8'),
  column: readFileSync('src/components/Wbs/KanbanColumn.tsx', 'utf8'),
  card: readFileSync('src/components/Wbs/KanbanCard.tsx', 'utf8'),
  checklist: readFileSync('src/components/Wbs/KanbanChecklist.tsx', 'utf8'),
  target: readFileSync('src/components/Wbs/taskDrag/taskChildDropTarget.ts', 'utf8'),
  targetAdapter: readFileSync('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts', 'utf8'),
  desktopPreview: readFileSync('src/components/Wbs/taskDrag/desktopTaskDropPreview.ts', 'utf8'),
  orderingGeometry: readFileSync('src/components/Wbs/taskDrag/taskOrderingGeometry.ts', 'utf8'),
  columnDropPolicy: readFileSync('src/components/Wbs/taskDrag/desktopColumnDropPolicy.ts', 'utf8'),
  titleAnchor: readFileSync('src/components/Wbs/taskDrag/taskTitleAnchor.ts', 'utf8'),
  presenter: readFileSync('src/components/Wbs/taskDrag/TaskDragPresenter.tsx', 'utf8'),
  childPreview: readFileSync('src/components/Wbs/taskDrag/TaskChildDropPreview.tsx', 'utf8'),
  styles: readFileSync('src/index.css', 'utf8'),
  overlayPosition: readFileSync('src/components/Wbs/taskDrag/taskDragOverlayPosition.ts', 'utf8'),
  session: readFileSync('src/components/Wbs/taskDrag/useTaskDragSession.ts', 'utf8'),
  commit: readFileSync('src/components/Wbs/taskDrag/taskDragCommit.ts', 'utf8'),
  spec: readFileSync('ai-doc/specs/SPEC-068-task-title-center-child-drop.md', 'utf8'),
  qa: readFileSync('ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md', 'utf8'),
  packageJson: readFileSync('package.json', 'utf8'),
};

const assertSourceOrder = (
  component: string,
  earlier: string,
  later: string,
  message: string,
) => {
  const earlierIndex = component.indexOf(earlier);
  const laterIndex = component.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${message}: missing ${earlier}`);
  assert.notEqual(laterIndex, -1, `${message}: missing ${later}`);
  assert.ok(earlierIndex < laterIndex, message);
};

assertSourceOrder(
  source.card,
  'data-task-title-slot="true"',
  'data-kanban-checklist-toggle="true"',
  'L2 title must be the first stable content anchor before the variable checklist toggle',
);
assertSourceOrder(
  source.card,
  'data-task-title-slot="true"',
  'data-task-record-capture-checkbox="true"',
  'L2 title must remain before the optional record-capture checkbox',
);
assertSourceOrder(
  source.checklist,
  'data-task-title-slot="true"',
  'data-task-record-capture-checkbox="true"',
  'L3+ title must remain before the optional record-capture checkbox',
);
for (const [level, component] of [
  ['L1', source.column],
  ['L2', source.card],
  ['L3+', source.checklist],
] as const) {
  assert.match(
    component,
    /data-task-direct-child-title-anchor="true"/,
    `${level} must expose the canonical title start for an empty direct-child level`,
  );
}
assert.match(
  source.target,
  /data-task-direct-child-title-anchor="true"/,
  'armed child insertion geometry must consume the canonical empty-level title anchor',
);
assert.match(source.target, /directChildTitleLeft: directChildTitleRect\?\.left \?\? null/);
assert.match(source.target, /fallbackChildTitleLeft: fallbackChildTitleRect\?\.left \?\? null/);
assert.doesNotMatch(source.target, /primaryPaddingLeft|directChildContentLeft/);
assert.match(source.titleAnchor, /TASK_TITLE_ANCHOR_SELECTOR = '\[data-task-title-slot="true"\]'/);
assert.match(source.desktopPreview, /findTaskTitleAnchorElement/);
assert.match(source.targetAdapter, /findTaskTitleAnchorElement/);
assert.match(source.orderingGeometry, /\[data-task-surface-scope="true"\]/);
assert.match(source.desktopPreview, /findTaskOrderingGeometryElement\(targetElement, targetSurfaceKind\)[\s\S]*orderingGeometryRect\.bottom/);
assert.match(source.targetAdapter, /findTaskOrderingGeometryElement\(targetElement, surfaceKind\)[\s\S]*orderingRect\.bottom/);
assert.match(source.targetAdapter, /resolveDesktopColumnDropPointerRegion/);
assert.match(source.targetAdapter, /resolveDesktopColumnTaskCacheYRange/);
assert.match(source.targetAdapter, /selectNearestDesktopTaskGapCandidate/);
assert.match(source.targetAdapter, /data-kanban-column-append-anchor="true"/);
assert.match(source.targetAdapter, /orderingPosition: options\.orderingPosition/);
assert.match(source.commit, /orderingPosition: observation\.dropPosition/);
assert.match(source.board, /resolveDesktopColumnDropPointerRegion/);
assert.match(source.board, /selectNearestDesktopTaskGapCandidate/);
assert.match(source.columnDropPolicy, /DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX = 32/);
assert.match(source.column, /data-kanban-column-append-anchor="true"/);
assert.match(source.desktopPreview, /data-kanban-column-append-anchor="true"/);

for (const [level, component] of [
  ['L1', source.column],
  ['L2', source.card],
  ['L3+', source.checklist],
] as const) {
  assert.match(component, /data-desktop-task-hover-scope="true"[\s\S]{0,240}data-task-child-drop-target="true"/,
    `${level} child target must reuse the complete DEV-065 hover scope`);
  assert.doesNotMatch(component, /<span\b[^>]*data-task-title-child-target="true"/,
    `${level} title text must not remain the exclusive child target`);
}
assert.doesNotMatch(source.card, /kanban-card-dropzone/);
assert.doesNotMatch(source.card, /data-desktop-checklist-append-anchor/);
assert.doesNotMatch(source.card, /type: 'wbs-checklist-drop'/);
for (const [level, component] of [
  ['L1', source.column],
  ['L2', source.card],
  ['L3+', source.checklist],
] as const) {
  assert.match(component, /kanban-drag-origin-placeholder/,
    `${level} source must render the shared dashed origin placeholder while dragging`);
}
assert.match(
  source.styles,
  /\.kanban-drag-origin-placeholder\s*\{[\s\S]*outline:\s*1px dashed rgb\(148 163 184\)[\s\S]*box-shadow:\s*none !important/,
  'the source origin placeholder must use a geometry-stable neutral outline that cannot impersonate the live target',
);
assert.doesNotMatch(source.column, /isColumnDragging \? '[^']*(?:scale-|rotate-|opacity-)/,
  'the L1 source origin must remain at its exact untransformed position');
assert.match(source.column, /className="invisible flex min-w-0 items-center gap-1\.5"[\s\S]*data-kanban-drag-source-placeholder-neutral="true"[\s\S]*data-task-title-slot="true"[\s\S]*<TaskDateBadge/,
  'the L1 neutral placeholder must reuse the hidden title/date row geometry of the normal header');
assert.match(source.target, /TASK_CHILD_DROP_DWELL_MS = 1000/);
assert.match(source.target, /resolveTaskTitleChildDropTarget/);
assert.match(source.target, /resolveTaskTitleChildDropZone/);
assert.match(source.target, /\[data-task-child-drop-target="true"\]/);
assert.match(source.target, /data-task-surface-source="true"/);
assert.match(source.target, /data-task-surface-subtree="true"|data-kanban-column-subtree-scope/);
assert.match(source.target, /right\.depth - left\.depth/);
assert.match(source.target, /control\.getAttribute\('data-task-surface-source'\) === 'true'/);
assert.match(source.board, /data-task-child-drop-announcement="true"/);
assert.match(source.board, /wbs-task-title-child/);
assert.match(source.board, /resolveDesktopChildDropAtPoint/);
assert.match(source.board, /desktopDragCancelledRef/);
assert.match(source.board, /buildDesktopDropPreview\(event\.active, event\.over\)/);
assert.match(source.board, /window\.addEventListener\('pagehide', cancel\)/);
assert.match(source.board, /window\.addEventListener\('orientationchange', cancel\)/);
assert.match(source.board, /window\.addEventListener\('resize', cancel\)/);
assert.match(source.board, /__projedTaskDragTestApi/);
assert.match(source.board, /resolvePointerUpperRightOverlayPosition/);
assert.match(source.board, /task-title-text pointer-events-none fixed z-\[93\]/);
assert.match(source.board, /data-task-drag-overlay-anchor="pointer-upper-right"/);
assert.match(source.board, /data-task-drag-overlay-scale=\{DESKTOP_TASK_DRAG_OVERLAY_SCALE\}/);
assert.match(source.board, /transform: `scale\(\$\{DESKTOP_TASK_DRAG_OVERLAY_SCALE\}\)`/);
assert.match(source.board, /if \(transition\.phase === 'armed'\)/);
assert.match(source.board, /sourceSurfaceKind === 'workbench-unplaced-row'/);
assert.match(source.board, /activeData\?\.source === 'task-workbench'/);
assert.match(source.board, /canUseReleaseChildDrop/);
assert.doesNotMatch(source.board, /translate-x-4 translate-y-4/);
assert.match(source.overlayPosition, /placement: 'upper-right' \| 'upper-left'/);
assert.match(source.presenter, /<TaskChildDropPreview/);
assert.match(source.presenter, /MOBILE_CHILD_PREVIEW_FINGER_CLEARANCE_PX = 16/);
assert.match(source.childPreview, /data-task-child-drop-live-status="true"/);
assert.match(source.childPreview, /data-task-child-drop-insertion-preview="true"/);
assert.match(source.childPreview, /<KanbanInsertionMarker compact className="py-0"/);
assert.match(
  source.childPreview,
  /\{armed \? \(\s*<>[\s\S]*data-task-child-drop-insertion-preview="true"[\s\S]*<\/>\s*\) : null\}/,
);
assert.doesNotMatch(
  source.childPreview,
  /data-task-child-drop-(?:scope|parent|source|subtree)-frame="true"|ring-(?:1|2) ring-inset ring-primary-(?:400|500)|bg-primary-50/,
  'child intent must not render any target blue frame or blue background',
);
assert.doesNotMatch(source.childPreview, /data-task-child-drop-ghost="true"/);
assert.doesNotMatch(source.childPreview, /CornerDownRight/);
assert.match(source.childPreview, /role="status"/);
assert.match(source.childPreview, /持續停留一秒即可鎖定/);
assert.match(source.childPreview, /放開後/);
assert.match(source.session, /getTaskChildIntentRemainingMs/);
assert.match(source.session, /onCommitRef\.current\?\./);
assert.match(source.session, /activeState\.childIntentPhase !== 'armed'/);
assert.match(source.session, /user has already seen an armed state/);
assert.match(source.session, /addEventListener\('orientationchange', handleViewportChange\)/);
assert.match(source.session, /addEventListener\('resize', handleViewportChange\)/);
assert.match(source.session, /if \(event\.cancelable\) event\.preventDefault\(\);/,
  'touchcancel cleanup must not attempt to cancel a non-cancelable browser event');
assert.match(source.targetAdapter, /if \(!armed\)[\s\S]*collectDirectCandidates/);
assert.match(source.desktopPreview, /resolveTaskDropOutcome/);
assert.match(source.desktopPreview, /outcomeKind: resolved\.outcomeKind/);
assert.match(source.commit, /normalizeTaskMoveUpdates/);
assert.match(source.commit, /if \(latest\.outcomeKind === 'origin'\)/);
assert.match(
  source.spec,
  /狀態：Implemented \/ Targeted Title-Anchor Browser Passed/,
);
assert.match(
  source.qa,
  /狀態：Executed \/ Targeted Title-Anchor Browser Passed/,
);
assert.match(source.packageJson, /verify:dev-068-task-title-center-child-drop/);

console.log(JSON.stringify({
  ok: true,
  cases: 101,
  timing: { start, at999, at1000, switched },
  insertionGeometry: { l1ChildInsertion, l2ChildInsertion, l3ChildInsertion, viewportClampedInsertion },
  intents: {
    cardToCardChild,
    crossColumnBefore,
    crossColumnAfter,
    childReturningToOriginalAppend,
    childMovingToAppend,
    rootToDeepChild,
    invalidCycle,
    invalidSelf,
    invalidArchivedTarget,
    invalidMissingTarget,
    invalidCrossBoard,
  },
  canonicalOutcomeMatrix,
}, null, 2));
