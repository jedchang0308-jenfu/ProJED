import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaskNode } from '../src/types';
import {
  resolvePrimaryTaskMovePlan,
  type TaskDropDescriptor,
} from '../src/components/Wbs/taskDrag/taskDropIntent';
import { normalizeTaskMoveUpdates } from '../src/components/Wbs/taskDrag/taskMoveUpdateNormalization';
import {
  GOAL_CHILD_ENTRY_WINDOW_SCALE,
  resolveGoalChildEntryWindow,
  resolveGoalTaskRowDropGeometry,
  resolveGoalDropPosition,
} from '../src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter';
import {
  TASK_CHILD_DROP_DWELL_MS,
  advanceTaskChildIntent,
  getTaskChildIntentRemainingMs,
} from '../src/components/Wbs/taskDrag/taskChildDropTarget';

const read = (path: string) => readFileSync(resolve(path), 'utf8');
const goal = read('src/components/GoalView.tsx');
const board = read('src/components/BoardView.tsx');
const host = read('src/components/Wbs/taskDrag/DesktopTaskDragHost.tsx');
const layer = read('src/components/Wbs/taskDrag/DesktopTaskDragLayer.tsx');
const goalAdapter = read('src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts');
const goalHierarchyGuides = read('src/components/Wbs/GoalHierarchyGuides.tsx');
const styles = read('src/index.css');
const checks: Array<{ id: string; label: string; status: 'PASS' | 'FAIL'; details?: unknown }> = [];
const failures: string[] = [];
const check = (id: string, label: string, condition: boolean, details?: unknown) => {
  checks.push({ id, label, status: condition ? 'PASS' : 'FAIL', details });
  if (!condition) failures.push(`${id} ${label}`);
};

const node = (id: string, parentId: string | null, order: number, nodeType: TaskNode['nodeType'] = parentId ? 'task' : 'group'): TaskNode => ({
  id, parentId, order, nodeType, workspaceId: 'ws-1', boardId: 'board-1', title: id, status: 'todo',
});
const nodes: Record<string, TaskNode> = {
  rootA: node('rootA', null, 10),
  rootB: node('rootB', null, 20),
  childA: node('childA', 'rootA', 10),
  childA2: node('childA2', 'rootA', 20),
  childB: node('childB', 'rootB', 10),
};
const descriptor = (nodeId: string, surfaceKind: TaskDropDescriptor['surfaceKind'], orderingPosition?: 'before' | 'after'): TaskDropDescriptor => ({ nodeId, surfaceKind, orderingPosition });

const dense = resolvePrimaryTaskMovePlan({
  source: descriptor('rootB', 'column-header'),
  target: descriptor('rootA', 'column-header', 'before'),
  nodesRecord: nodes,
});
check('S01', 'primary root reorder produces exact splice arrays', dense.outcomeKind === 'move' && JSON.stringify(dense.ordering?.destinationSiblingIds) === JSON.stringify(['rootB', 'rootA']), dense);
const denseUpdates = normalizeTaskMoveUpdates('rootB', dense.intent!, nodes, dense.ordering);
check('S02', 'normalizer writes dense root orders in one canonical update set', denseUpdates.rootB?.order === 0
  && denseUpdates.rootA?.order === 1 && denseUpdates.rootB?.parentId === null
  && denseUpdates.rootB?.nodeType === 'group');

const crossParent = resolvePrimaryTaskMovePlan({
  source: descriptor('childA', 'checklist-row'),
  target: descriptor('childB', 'checklist-row', 'after'),
  nodesRecord: nodes,
});
check('S03', 'cross-parent reorder removes source and splices destination', crossParent.outcomeKind === 'move'
  && JSON.stringify(crossParent.ordering?.sourceSiblingIds) === JSON.stringify(['childA2'])
  && JSON.stringify(crossParent.ordering?.destinationSiblingIds) === JSON.stringify(['childB', 'childA']));

const appendChild = resolvePrimaryTaskMovePlan({
  source: descriptor('childB', 'checklist-row'),
  target: descriptor('rootA', 'column-drop'),
  nodesRecord: nodes,
});
check('S04', 'append-to-parent does not require target in destination sibling scope', appendChild.outcomeKind === 'move'
  && JSON.stringify(appendChild.ordering?.destinationSiblingIds) === JSON.stringify(['childA', 'childA2', 'childB']));

const origin = resolvePrimaryTaskMovePlan({
  source: descriptor('childA', 'checklist-row'),
  target: descriptor('childA2', 'checklist-row', 'before'),
  nodesRecord: nodes,
});
check('S05', 'same-level no-op is detected from exact post-splice order', origin.outcomeKind === 'origin');

const cycle = resolvePrimaryTaskMovePlan({
  source: descriptor('rootA', 'column-header'),
  target: descriptor('childA', 'checklist-row', 'after'),
  nodesRecord: nodes,
});
check('S06', 'ancestor/descendant cycle is rejected', cycle.outcomeKind === 'invalid');

const geometry = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootA',
  pointer: { x: 100, y: 55 },
  rows: [
    { nodeId: 'rootA', left: 0, right: 252, top: 0, bottom: 32, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 32, cellRight: 252 },
    { nodeId: 'rootB', left: 0, right: 252, top: 32, bottom: 64, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 64, cellRight: 252 },
  ],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 100, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 100, nodeId: 'viewport' },
  nodesRecord: nodes,
});
check('S07', 'Goal geometry uses task-lane clipping, title anchor and visible subtree bottom', geometry?.targetNodeId === 'rootB' && geometry.orderingPosition === 'after'
  && geometry.indicatorRect.left === 30 && geometry.indicatorRect.top === 64 && geometry.indicatorRect.width === 218
  && geometry.childIndicatorRect.left === 40 && geometry.childIndicatorRect.top === 64);
check('S08', 'Goal geometry rejects pointer outside task lane', resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootA', pointer: { x: 400, y: 46 }, rows: geometry ? [{ nodeId: 'rootB', left: 0, right: 252, top: 32, bottom: 64, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 64, cellRight: 252 }] : [],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 100, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 100, nodeId: 'viewport' }, nodesRecord: nodes,
}) === null);
check('S09', 'keyboard fallback remains midpoint based', resolveGoalDropPosition({ top: 40, height: 20 }, { top: 32, height: 32 }) === 'after');
const originGeometry = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootA', pointer: { x: 100, y: 16 },
  rows: [{ nodeId: 'rootA', left: 0, right: 252, top: 0, bottom: 32, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 32, cellRight: 252 }],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 100, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 100, nodeId: 'viewport' }, nodesRecord: nodes,
});
check('S16', 'Goal source row is an explicit origin feedback frame', originGeometry?.feedbackKind === 'origin' && originGeometry.targetNodeId === 'rootA');
check('S10', 'Board and Goal use the shared desktop host', goal.includes('DesktopTaskDragHost') && board.includes('DesktopTaskDragHost'));
check('S15', 'surface-specific adapters keep geometry outside the canonical commit', board.includes('captureBoardDesktopTaskSource') && goal.includes('resolveGoalTaskRowDropGeometry') && !host.includes('useWbsStore'));
check('S11', 'Goal no longer owns a second DndContext/DragOverlay lifecycle', !goal.includes('<DndContext') && !goal.includes('<DragOverlay') && !goal.includes('DragOverlay,'));
check('S12', 'host owns terminal guard and layer owns presentation-only overlay', host.includes('terminalRef') && host.includes('DesktopTaskDragLayer') && layer.includes('aria-hidden="true"'));
check('S13', 'Board root reorder no longer directly writes a bespoke root batch', !board.includes("label: '移動列表位置'"));

check('S14', 'normalizer emits a single updatedAt timestamp per move', typeof denseUpdates.rootB?.updatedAt === 'number' && Object.values(denseUpdates).filter(value => typeof value.updatedAt === 'number').length === 1);
check('S17', 'shared host owns the global pointer bridge without a Board duplicate listener', host.includes('onPointerMove')
  && board.includes('onPointerMove={point =>')
  && !board.includes("window.addEventListener('pointermove'")
  && !board.includes("window.addEventListener('pointercancel'"));
check('S18', 'resize, orientation and Escape terminate the shared session centrally', host.includes("const handleResize = () => handleExternalCancel('resize')")
  && host.includes("const handleOrientationChange = () => handleExternalCancel('orientationchange')")
  && host.includes("if (keyboardEvent.key === 'Escape') handleExternalCancel()"));
check('S19', 'Goal origin feedback suppresses the standard marker so feedback stays mutually exclusive', goal.includes("goalDropPreview && goalDropPreview.feedbackKind !== 'origin'"));
check('S20', 'shared insertion presenter reuses the Kanban marker primitive', layer.includes('DesktopTaskInsertionIndicator')
  && layer.includes('KanbanInsertionMarker') && goal.includes('DesktopTaskInsertionIndicator') && board.includes('DesktopTaskInsertionIndicator'));
check('S21', 'Goal does not retain a mode-specific two-pixel marker', !goal.includes('className="fixed h-0.5') && !goal.includes('bg-primary/70'));
check('S22', 'Goal midpoint equality resolves to after', goal.includes('pointer.y >= midpoint') || read('src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts').includes('pointer.y >= midpoint'));
check('S23', 'Goal geometry carries title/child anchors and subtree bottom', read('src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts').includes('visibleSubtreeBottom')
  && read('src/components/Wbs/taskDrag/goalDesktopTaskDragAdapter.ts').includes('childIndicatorRect'));

const initialChildIntent = { phase: 'none' as const, targetId: null, candidateSince: null };
const candidateChildIntent = advanceTaskChildIntent({
  current: initialChildIntent,
  targetId: 'rootA',
  now: 0,
});
const beforeDwellBoundary = advanceTaskChildIntent({
  current: candidateChildIntent,
  targetId: 'rootA',
  now: TASK_CHILD_DROP_DWELL_MS - 1,
});
const atDwellBoundary = advanceTaskChildIntent({
  current: beforeDwellBoundary,
  targetId: 'rootA',
  now: TASK_CHILD_DROP_DWELL_MS,
});
check('S24', 'shared child intent arms at the exact 1000 ms boundary, not at 999 ms',
  TASK_CHILD_DROP_DWELL_MS === 1000
  && candidateChildIntent.phase === 'candidate'
  && beforeDwellBoundary.phase === 'candidate'
  && atDwellBoundary.phase === 'armed'
  && getTaskChildIntentRemainingMs(candidateChildIntent, TASK_CHILD_DROP_DWELL_MS - 1) === 1
  && getTaskChildIntentRemainingMs(candidateChildIntent, TASK_CHILD_DROP_DWELL_MS) === 0,
  { candidateChildIntent, beforeDwellBoundary, atDwellBoundary });
const switchedChildIntent = advanceTaskChildIntent({
  current: beforeDwellBoundary,
  targetId: 'childA',
  now: TASK_CHILD_DROP_DWELL_MS - 1,
});
const leftChildIntent = advanceTaskChildIntent({
  current: switchedChildIntent,
  targetId: null,
  now: TASK_CHILD_DROP_DWELL_MS * 2,
});
check('S25', 'switching child targets restarts dwell and leaving clears the intent',
  switchedChildIntent.phase === 'candidate'
  && switchedChildIntent.targetId === 'childA'
  && switchedChildIntent.candidateSince === TASK_CHILD_DROP_DWELL_MS - 1
  && leftChildIntent.phase === 'none'
  && leftChildIntent.targetId === null
  && leftChildIntent.candidateSince === null,
  { switchedChildIntent, leftChildIntent });
check('S26', 'Goal consumes the shared child dwell state machine without a local 1000 ms timer',
  goal.includes('advanceTaskChildIntent')
  && goal.includes('getTaskChildIntentRemainingMs')
  && !goal.includes('goalChildTimerRef')
  && !goal.includes('goalChildCandidateRef')
  && !goal.includes('}, 1000)'));
check('S27', 'Board and Goal both invalidate transient drop feedback through the shared host on scroll',
  board.includes('onExternalInvalidate={() =>')
  && goal.includes('onExternalInvalidate={() =>')
  && host.includes("const handleScroll = () => onExternalInvalidate?.('scroll')"));

const treePreviewGeometry = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootA',
  pointer: { x: 100, y: 55 },
  rows: [
    { nodeId: 'rootB', left: 0, right: 252, top: 32, bottom: 64, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 64, cellRight: 252 },
  ],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 100, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 100, nodeId: 'viewport' },
  nodesRecord: nodes,
} as unknown as Parameters<typeof resolveGoalTaskRowDropGeometry>[0]);
const childTreePreview = (treePreviewGeometry as unknown as {
  childTreePreview?: { railCenterX: number; stemStartY: number; boundaryY: number; branchEndX: number };
} | null)?.childTreePreview;
check('S28', 'Goal adapter exposes direct armed-child tree geometry from the target rail to the committed title edge',
  childTreePreview?.railCenterX === 20
  && childTreePreview.stemStartY === 48
  && childTreePreview.boundaryY === 64
  && childTreePreview.branchEndX === 40,
  childTreePreview);
check('S29', 'Goal owns stateless hierarchy rendering without leaking Goal tree geometry into Board',
  goal.includes("import GoalHierarchyGuides from './Wbs/GoalHierarchyGuides'")
  && !board.includes('GoalHierarchyGuides')
  && !goalHierarchyGuides.includes('useState')
  && !goalHierarchyGuides.includes('useEffect')
  && !goalHierarchyGuides.includes('setTimeout')
  && !goalHierarchyGuides.includes('commit'));

const rootStandardGeometry = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootA',
  pointer: { x: 100, y: 55 },
  rows: [
    { nodeId: 'rootB', left: 0, right: 252, top: 32, bottom: 64, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 64, cellRight: 252 },
  ],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 160, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 160, nodeId: 'viewport' },
  nodesRecord: nodes,
} as unknown as Parameters<typeof resolveGoalTaskRowDropGeometry>[0]);
const nestedStandardGeometry = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'rootB',
  pointer: { x: 100, y: 70 },
  rows: [
    { nodeId: 'childA', left: 0, right: 252, top: 64, bottom: 96, titleAnchorLeft: 40, childAnchorLeft: 50, treeRailLeft: 30, visibleSubtreeBottom: 96, cellRight: 252 },
  ],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 160, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 160, nodeId: 'viewport' },
  nodesRecord: nodes,
} as unknown as Parameters<typeof resolveGoalTaskRowDropGeometry>[0]);
const rootStandardTreePreview = (rootStandardGeometry as unknown as {
  standardTreePreview?: { relationKind: string; railCenterX: number; stemStartY: number; stemEndY: number; boundaryY: number; branchEndX: number };
} | null)?.standardTreePreview;
const nestedStandardTreePreview = (nestedStandardGeometry as unknown as {
  standardTreePreview?: { relationKind: string; railCenterX: number; stemStartY: number; stemEndY: number; boundaryY: number; branchEndX: number };
} | null)?.standardTreePreview;
check('S30', 'Goal adapter exposes root branch-only and nested sibling tree geometry for standard placements',
  rootStandardTreePreview?.relationKind === 'root'
  && rootStandardTreePreview.railCenterX === 20
  && rootStandardTreePreview.stemStartY === 64
  && rootStandardTreePreview.stemEndY === 64
  && rootStandardTreePreview.boundaryY === 64
  && rootStandardTreePreview.branchEndX === 30
  && nestedStandardTreePreview?.relationKind === 'sibling'
  && nestedStandardTreePreview.railCenterX === 20
  && nestedStandardTreePreview.stemStartY === 64
  && nestedStandardTreePreview.stemEndY === 64
  && nestedStandardTreePreview.boundaryY === 64
  && nestedStandardTreePreview.branchEndX === 40,
  { rootStandardTreePreview, nestedStandardTreePreview });
check('S31', 'Goal renders exactly one selected standard-or-child connector while the adapter owns stem direction',
  goal.includes('const goalTreePreview =')
  && goal.includes('treePreview={goalTreePreview}')
  && goalHierarchyGuides.includes('Math.min(treePreview.stemStartY, treePreview.stemEndY)')
  && goalHierarchyGuides.includes('Math.abs(treePreview.stemEndY - treePreview.stemStartY)')
  && goalHierarchyGuides.includes('treePreview.relationKind')
  && !board.includes('GoalHierarchyGuides'));
check('S32', 'Goal masks native hierarchy highlight and content tint through one derived visible scope while dragging',
  goal.includes('const visibleHierarchyScopeId = activeDragNode ? null : activeHierarchyScopeId;')
  && goal.includes('if (!visibleHierarchyScopeId) return { description, meeting };')
  && goal.includes('row.taskId === visibleHierarchyScopeId')
  && goal.includes('[visibleHierarchyScopeId, projection.rows]')
  && goal.includes('activeHierarchyScopeId={visibleHierarchyScopeId}'));
check('S33', 'Goal renders the shared Kanban insertion marker while the tree preview still ends at the final title edge',
  goal.includes('presentation="kanban-marker"')
  && layer.includes("presentation?: 'kanban-marker' | 'surface-preview'")
  && layer.includes("data-desktop-task-insertion-presentation={presentation}")
  && goalAdapter.includes('branchEndX: indicatorRect.left,')
  && goalAdapter.includes('branchEndX: childIndicatorRect.left,'));
check('S34', 'Normal rows and drag previews reuse one Goal hierarchy segment renderer and active stroke path',
  goal.includes('<GoalHierarchyGuides')
  && goal.includes('variant="preview"')
  && !goal.includes('GoalTaskTreeInsertionPreview')
  && goalHierarchyGuides.includes('const GoalHierarchyGuideSegment')
  && goalHierarchyGuides.includes('data-goal-hierarchy-guide-layer="row"')
  && goalHierarchyGuides.includes('data-goal-hierarchy-guide-layer="preview"')
  && goalHierarchyGuides.includes('data-goal-hierarchy-guide-active={active ? \'true\' : \'false\'}'));
check('S35', 'Goal floating drag card renders at 50 percent scale without changing its drag identity',
  goal.includes('scale-[0.5]')
  && !goal.includes('scale-[1.02]')
  && goal.includes('data-task-drag-source-id={activeDragNode.id}')
  && goal.includes('data-goal-drag-overlay="true"'));

const equivalentBoundaryRows = [
  { nodeId: 'childA', left: 0, right: 252, top: 64, bottom: 96, titleAnchorLeft: 40, childAnchorLeft: 50, treeRailLeft: 30, visibleSubtreeBottom: 96, cellRight: 252 },
  { nodeId: 'childA2', left: 0, right: 252, top: 96, bottom: 128, titleAnchorLeft: 40, childAnchorLeft: 50, treeRailLeft: 30, visibleSubtreeBottom: 128, cellRight: 252 },
];
const afterPreviousBoundary = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'childB', pointer: { x: 100, y: 90 }, rows: equivalentBoundaryRows,
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 160, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 160, nodeId: 'viewport' }, nodesRecord: nodes,
});
const beforeNextBoundary = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'childB', pointer: { x: 100, y: 100 }, rows: equivalentBoundaryRows,
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 160, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 160, nodeId: 'viewport' }, nodesRecord: nodes,
});
const beforeNextPreviewAnchor = (beforeNextBoundary as unknown as { standardPreviewAnchorNodeId?: string } | null)?.standardPreviewAnchorNodeId;
check('S36', 'Equivalent sibling boundaries keep next-before semantics but reuse the previous-after preview geometry',
  afterPreviousBoundary?.targetNodeId === 'childA'
  && afterPreviousBoundary.orderingPosition === 'after'
  && beforeNextBoundary?.targetNodeId === 'childA2'
  && beforeNextBoundary.orderingPosition === 'before'
  && beforeNextPreviewAnchor === 'childA'
  && afterPreviousBoundary.indicatorRect.top === beforeNextBoundary.indicatorRect.top
  && afterPreviousBoundary.standardTreePreview.railCenterX === beforeNextBoundary.standardTreePreview.railCenterX
  && afterPreviousBoundary.standardTreePreview.stemStartY === beforeNextBoundary.standardTreePreview.stemStartY
  && afterPreviousBoundary.standardTreePreview.stemEndY === beforeNextBoundary.standardTreePreview.stemEndY
  && afterPreviousBoundary.standardTreePreview.boundaryY === beforeNextBoundary.standardTreePreview.boundaryY
  && afterPreviousBoundary.standardTreePreview.branchEndX === beforeNextBoundary.standardTreePreview.branchEndX,
  { afterPreviousBoundary, beforeNextBoundary, beforeNextPreviewAnchor });

const beforeFirstChildBoundary = resolveGoalTaskRowDropGeometry({
  sourceNodeId: 'childB', pointer: { x: 100, y: 34 },
  rows: [
    { nodeId: 'rootA', left: 0, right: 252, top: 0, bottom: 32, titleAnchorLeft: 30, childAnchorLeft: 40, treeRailLeft: 20, visibleSubtreeBottom: 64, cellRight: 252 },
    { nodeId: 'childA', left: 0, right: 252, top: 32, bottom: 64, titleAnchorLeft: 40, childAnchorLeft: 50, treeRailLeft: 30, visibleSubtreeBottom: 64, cellRight: 252 },
  ],
  taskLaneRect: { left: 0, right: 252, top: 0, bottom: 160, nodeId: 'lane' },
  viewportRect: { left: 0, right: 500, top: 0, bottom: 160, nodeId: 'viewport' }, nodesRecord: nodes,
});
check('S37', 'Before the first child uses its visible parent as a top-down-only presentation anchor',
  beforeFirstChildBoundary?.targetNodeId === 'childA'
  && beforeFirstChildBoundary.orderingPosition === 'before'
  && beforeFirstChildBoundary.standardPreviewAnchorNodeId === 'rootA'
  && beforeFirstChildBoundary.standardTreePreview.relationKind === 'sibling'
  && beforeFirstChildBoundary.standardTreePreview.railCenterX === 20
  && beforeFirstChildBoundary.standardTreePreview.stemStartY === 16
  && beforeFirstChildBoundary.standardTreePreview.stemEndY === 32
  && beforeFirstChildBoundary.standardTreePreview.stemStartY <= beforeFirstChildBoundary.standardTreePreview.boundaryY,
  beforeFirstChildBoundary);

const childEntryWindow = resolveGoalChildEntryWindow({ left: 10, right: 110, top: 20, bottom: 60, nodeId: 'target' });
check('S38', 'Goal child-entry detection uses a centered 70 percent adapter window',
  GOAL_CHILD_ENTRY_WINDOW_SCALE === 0.7
  && Math.abs(childEntryWindow.left - 25) < 0.001
  && Math.abs(childEntryWindow.right - 95) < 0.001
  && Math.abs(childEntryWindow.top - 26) < 0.001
  && Math.abs(childEntryWindow.bottom - 54) < 0.001
  && goalAdapter.includes('GOAL_CHILD_ENTRY_WINDOW_SCALE = 0.7')
  && goalAdapter.includes('resolveGoalChildEntryWindow')
  && goal.includes('resolveGoalChildEntryWindow(primaryRect)'), childEntryWindow);
check('S39', 'Goal child dwell candidate renders exactly the target row and clears when armed',
  goal.includes("const goalChildCandidateTargetId = goalChildIntent.phase === 'candidate'")
  && goal.includes('childDropCandidate={goalChildCandidateTargetId === node.id}')
  && goal.includes("data-goal-child-drop-candidate={childDropCandidate ? 'true' : undefined}")
  && styles.includes('tr[data-goal-task-row][data-goal-child-drop-candidate="true"] > [data-goal-task-cell]'));
check('S40', 'Goal armed child keeps one continuous parent-task location render',
  goal.includes("const goalChildTargetId = goalChildIntent.phase === 'candidate' || goalChildIntent.phase === 'armed'")
  && goal.includes('childDropTarget={goalChildTargetId === node.id}')
  && goal.includes("data-goal-child-drop-target={childDropTarget ? 'true' : undefined}")
  && styles.includes('tr[data-goal-task-row][data-goal-child-drop-target="true"] > [data-goal-task-cell]'));

const artifact = {
  devId: 'DEV-124', status: failures.length ? 'FAIL' : 'PASS', sourceRevision: 'working-tree', environment: 'local-static',
  command: 'npm run verify:dev-124-shared-desktop-task-drag-host', assertionCount: checks.length, checks, failures,
  generatedAt: new Date().toISOString(),
};
const artifactDir = resolve('output/qa/dev-124-shared-desktop-task-drag-host');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(resolve(artifactDir, 'static-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
if (failures.length) {
  console.error('DEV-124 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-124 static verification passed: ${checks.length} assertions.`);
