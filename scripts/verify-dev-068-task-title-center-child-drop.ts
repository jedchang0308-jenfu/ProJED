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
  resolvePointerUpperRightOverlayPosition,
  TASK_DRAG_OVERLAY_POINTER_GAP_PX,
  TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX,
} from '../src/components/Wbs/taskDrag/taskDragOverlayPosition';
import { resolveTaskDropIntent } from '../src/components/Wbs/taskDrag/taskDropIntent';

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
  primaryPaddingLeft: 7,
  directChildContentLeft: 19.6,
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
  primaryPaddingLeft: 5,
  directChildContentLeft: null,
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
  primaryPaddingLeft: 4,
  directChildContentLeft: null,
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
  primaryPaddingLeft: 18,
  directChildContentLeft: null,
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
  presenter: readFileSync('src/components/Wbs/taskDrag/TaskDragPresenter.tsx', 'utf8'),
  childPreview: readFileSync('src/components/Wbs/taskDrag/TaskChildDropPreview.tsx', 'utf8'),
  overlayPosition: readFileSync('src/components/Wbs/taskDrag/taskDragOverlayPosition.ts', 'utf8'),
  session: readFileSync('src/components/Wbs/taskDrag/useTaskDragSession.ts', 'utf8'),
  commit: readFileSync('src/components/Wbs/taskDrag/taskDragCommit.ts', 'utf8'),
  spec: readFileSync('ai-doc/specs/SPEC-068-task-title-center-child-drop.md', 'utf8'),
  qa: readFileSync('ai-doc/qa/QA-DEV-068-task-title-center-child-drop.md', 'utf8'),
  packageJson: readFileSync('package.json', 'utf8'),
};

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
assert.match(source.board, /if \(transition\.phase === 'armed'\)/);
assert.match(source.board, /sourceSurfaceKind === 'workbench-unplaced-row'/);
assert.match(source.board, /activeData\?\.source === 'task-workbench'/);
assert.match(source.board, /canUseReleaseChildDrop/);
assert.doesNotMatch(source.board, /translate-x-4 translate-y-4/);
assert.match(source.overlayPosition, /placement: 'upper-right' \| 'upper-left'/);
assert.match(source.presenter, /<TaskChildDropPreview/);
assert.match(source.presenter, /MOBILE_CHILD_PREVIEW_FINGER_CLEARANCE_PX = 16/);
assert.match(source.childPreview, /data-task-child-drop-live-status="true"/);
assert.match(source.childPreview, /data-task-child-drop-source-frame="true"/);
assert.match(source.childPreview, /data-task-child-drop-subtree-frame="true"/);
assert.match(source.childPreview, /data-task-child-drop-insertion-preview="true"/);
assert.match(source.childPreview, /<KanbanInsertionMarker compact className="py-0"/);
assert.match(
  source.childPreview,
  /\{armed \? \(\s*<>[\s\S]*data-task-child-drop-scope-frame="true"[\s\S]*data-task-child-drop-parent-frame="true"[\s\S]*data-task-child-drop-subtree-frame="true"[\s\S]*data-task-child-drop-insertion-preview="true"[\s\S]*<\/>\s*\) : null\}/,
);
assert.doesNotMatch(source.childPreview, /data-task-child-drop-ghost="true"/);
assert.doesNotMatch(source.childPreview, /CornerDownRight/);
assert.match(source.childPreview, /ring-primary-500/);
assert.match(source.childPreview, /ring-primary-400/);
assert.match(source.childPreview, /role="status"/);
assert.match(source.childPreview, /持續停留一秒即可鎖定/);
assert.match(source.childPreview, /放開後/);
assert.match(source.session, /getTaskChildIntentRemainingMs/);
assert.match(source.session, /onCommitRef\.current\?\./);
assert.match(source.session, /activeState\.childIntentPhase !== 'armed'/);
assert.match(source.session, /user has already seen an armed state/);
assert.match(source.session, /addEventListener\('orientationchange', handleViewportChange\)/);
assert.match(source.session, /addEventListener\('resize', handleViewportChange\)/);
assert.match(source.targetAdapter, /if \(!armed\)[\s\S]*collectDirectCandidates/);
assert.match(source.commit, /normalizeTaskMoveUpdates/);
assert.match(
  source.spec,
  /狀態：(?:RD Implementation Ready|Implemented \/ AI Browser QA-QC Passed)/,
);
assert.match(
  source.qa,
  /狀態：(?:Plan Ready \/ AI True Operation Required \/ Not Executed|Executed \/ AI Browser QA-QC Passed \/ Physical Mobile 未充分驗證)/,
);
assert.match(source.packageJson, /verify:dev-068-task-title-center-child-drop/);

console.log(JSON.stringify({
  ok: true,
  cases: 64,
  timing: { start, at999, at1000, switched },
  insertionGeometry: { l1ChildInsertion, l2ChildInsertion, l3ChildInsertion, viewportClampedInsertion },
  intents: {
    cardToCardChild,
    rootToDeepChild,
    invalidCycle,
    invalidSelf,
    invalidArchivedTarget,
    invalidMissingTarget,
    invalidCrossBoard,
  },
}, null, 2));
