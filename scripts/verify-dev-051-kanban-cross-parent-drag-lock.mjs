import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KANBAN_MOBILE_LOCK_TOLERANCE_PX,
  KANBAN_PARENT_LOCK_DELAY_MS,
  KANBAN_PARENT_UNLOCK_GRACE_MS,
  armKanbanTarget,
  beginKanbanDropIntent,
  buildKanbanMoveUpdates,
  invalidateKanbanTarget,
  isKanbanDropCommittable,
  lockKanbanTarget,
  markKanbanLockedOutside,
  resolveKanbanDropTarget,
  selectSameParentKanbanTarget,
  updateArmingKanbanTarget,
} from '../src/components/Wbs/kanbanDropIntent.ts';

const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok: Boolean(ok), details });
const read = (file) => readFileSync(resolve(file), 'utf8');

const base = {
  workspaceId: 'ws-051',
  boardId: 'board-051',
  status: 'todo',
  nodeType: 'task',
  createdAt: 1,
  updatedAt: 1,
};
const node = (id, parentId, order, title = id, extra = {}) => ({
  ...base,
  id,
  parentId,
  order,
  title,
  ...extra,
});
const nodes = {
  rootA: node('rootA', null, 0, 'Root A', { nodeType: 'group' }),
  rootB: node('rootB', null, 1, 'Root B', { nodeType: 'group' }),
  A1: node('A1', 'rootA', 0),
  A2: node('A2', 'rootA', 1),
  B1: node('B1', 'rootB', 0),
  B2: node('B2', 'rootB', 1),
  B11: node('B11', 'B1', 0),
};

assert('timing constants match SPEC-051',
  KANBAN_PARENT_LOCK_DELAY_MS === 750 &&
  KANBAN_PARENT_UNLOCK_GRACE_MS === 200 &&
  KANBAN_MOBILE_LOCK_TOLERANCE_PX === 20,
  { KANBAN_PARENT_LOCK_DELAY_MS, KANBAN_PARENT_UNLOCK_GRACE_MS, KANBAN_MOBILE_LOCK_TOLERANCE_PX });

const sameParentTarget = resolveKanbanDropTarget({
  draggedNodeId: 'A2',
  targetKind: 'task-anchor',
  targetNodeId: 'A1',
  position: 'before',
  nodes,
  canMove: true,
});
let state = beginKanbanDropIntent(nodes.A2);
state = selectSameParentKanbanTarget(state, sameParentTarget);
assert('same-parent target is immediate and committable',
  sameParentTarget.sameParent && state.phase === 'same-parent' && isKanbanDropCommittable(state),
  { sameParentTarget, state });

const crossParentTarget = resolveKanbanDropTarget({
  draggedNodeId: 'A2',
  targetKind: 'task-anchor',
  targetNodeId: 'B1',
  position: 'after',
  nodes,
  canMove: true,
});
let arming = armKanbanTarget(beginKanbanDropIntent(nodes.A2), crossParentTarget, 0);
arming = updateArmingKanbanTarget(arming, crossParentTarget, 699);
assert('cross-parent remains arming before 700ms',
  arming.phase === 'arming' && arming.progress < 1 && !isKanbanDropCommittable(arming),
  arming);
const at750 = updateArmingKanbanTarget(arming, crossParentTarget, 750);
const locked = lockKanbanTarget(at750, crossParentTarget);
assert('cross-parent locks at 750ms and becomes committable',
  at750.progress === 1 && locked.phase === 'locked' && isKanbanDropCommittable(locked),
  locked);
const outside = markKanbanLockedOutside(locked, 800);
assert('leaving locked parent clears exact position while retaining lock for grace',
  outside.phase === 'locked' && outside.outsideSince === 800 && outside.position === null && !isKanbanDropCommittable(outside),
  outside);

const switched = resolveKanbanDropTarget({
  draggedNodeId: 'A2',
  targetKind: 'child-empty-lane',
  targetParentId: 'B2',
  position: 'append',
  nodes,
  canMove: true,
});
const rearmed = armKanbanTarget(arming, switched, 900);
assert('switching parent resets arming clock',
  rearmed.candidateParentId === 'B2' && rearmed.startedAt === 900 && rearmed.progress === 0,
  rearmed);

const cycleTarget = resolveKanbanDropTarget({
  draggedNodeId: 'B1',
  targetKind: 'child-empty-lane',
  targetParentId: 'B11',
  position: 'append',
  nodes,
  canMove: true,
});
const invalid = invalidateKanbanTarget(beginKanbanDropIntent(nodes.B1), cycleTarget);
assert('self-descendant target is invalid with visible reason',
  !cycleTarget.valid && invalid.phase === 'invalid' && Boolean(invalid.invalidReason),
  invalid);

const filteredNodes = {
  parentV: node('parentV', null, 2, 'Visible parent', { nodeType: 'group' }),
  sourceP: node('sourceP', null, 3, 'Source parent', { nodeType: 'group' }),
  source: node('source', 'sourceP', 0),
  V1: node('V1', 'parentV', 0),
  H1: node('H1', 'parentV', 1),
  V2: node('V2', 'parentV', 2),
  H2: node('H2', 'parentV', 3),
  V3: node('V3', 'parentV', 4),
};
const visibleAnchor = resolveKanbanDropTarget({
  draggedNodeId: 'source',
  targetKind: 'task-anchor',
  targetNodeId: 'V2',
  position: 'after',
  nodes: filteredNodes,
  canMove: true,
});
const visibleUpdates = buildKanbanMoveUpdates('source', visibleAnchor, filteredNodes, 1000);
const visibleAfter = Object.fromEntries(Object.entries(filteredNodes).map(([id, value]) => [id, { ...value, ...(visibleUpdates[id] || {}) }]));
const visibleOrder = Object.values(visibleAfter)
  .filter((item) => item.parentId === 'parentV')
  .sort((left, right) => left.order - right.order)
  .map((item) => item.id);
assert('visible anchor preserves hidden sibling relative order',
  visibleOrder.join(',') === 'V1,H1,V2,source,H2,V3' && visibleOrder.indexOf('H1') < visibleOrder.indexOf('H2'),
  { visibleOrder, visibleUpdates });

const emptyAppend = resolveKanbanDropTarget({
  draggedNodeId: 'source',
  targetKind: 'child-empty-lane',
  targetParentId: 'parentV',
  position: 'append',
  nodes: filteredNodes,
  canMove: true,
});
assert('filtered-empty child lane appends after canonical hidden siblings', emptyAppend.order === 5, emptyAppend);

const completedNodes = {
  sourceParent: node('sourceParent', null, 0, 'Source parent', { nodeType: 'group', status: 'completed' }),
  destinationParent: node('destinationParent', null, 1, 'Destination parent', { nodeType: 'group', status: 'todo' }),
  moving: node('moving', 'sourceParent', 0, 'Moving', { status: 'completed' }),
  existing: node('existing', 'destinationParent', 0, 'Existing', { status: 'completed' }),
};
const destinationTarget = resolveKanbanDropTarget({
  draggedNodeId: 'moving',
  targetKind: 'parent-group',
  targetParentId: 'destinationParent',
  position: 'append',
  nodes: completedNodes,
  canMove: true,
});
const completedUpdates = buildKanbanMoveUpdates('moving', destinationTarget, completedNodes, 2000);
assert('move updates include destination ancestor rollup in same batch',
  completedUpdates.destinationParent?.status === 'completed' && completedUpdates.moving?.parentId === 'destinationParent',
  completedUpdates);

const files = {
  boardView: 'src/components/BoardView.tsx',
  card: 'src/components/Wbs/KanbanCard.tsx',
  column: 'src/components/Wbs/KanbanColumn.tsx',
  checklist: 'src/components/Wbs/KanbanChecklist.tsx',
  feedback: 'src/components/Wbs/KanbanDropFeedback.tsx',
  context: 'src/components/Wbs/kanbanDropIntentContext.ts',
  module: 'src/components/Wbs/kanbanDropIntent.ts',
  wbsStore: 'src/store/useWbsStore.ts',
  browser: 'scripts/verify-dev-051-kanban-cross-parent-drag-lock-browser.pw.js',
  spec: 'ai-doc/specs/SPEC-051-kanban-cross-parent-drag-lock.md',
  qa: 'ai-doc/qa/QA-DEV-051-kanban-cross-parent-drag-lock.md',
  packageJson: 'package.json',
};
for (const [label, file] of Object.entries(files)) assert(`file exists:${label}`, existsSync(resolve(file)), file);
const source = Object.fromEntries(Object.entries(files)
  .filter(([, file]) => existsSync(resolve(file)))
  .map(([label, file]) => [label, read(file)]));

assert('legacy implicit card/checklist child drop targets are retired',
  !source.boardView.includes("targetType === 'wbs-card-drop'") &&
  !source.boardView.includes("targetType === 'wbs-checklist-drop'") &&
  !source.card.includes("type: 'wbs-card-drop'") &&
  !source.card.includes("type: 'wbs-checklist-drop'"));
assert('desktop and mobile adapters share the pure resolver',
  source.boardView.includes('resolveDesktopKanbanTarget') &&
  source.boardView.includes('resolveMobileTaskHover') &&
  (source.boardView.match(/resolveKanbanDropTarget\(/g) || []).length >= 3 &&
  (source.module.match(/KANBAN_PARENT_LOCK_DELAY_MS = 750/g) || []).length === 1);
assert('stable frame and insertion-line selectors exist without lock text prompts',
  [
    'data-kanban-parent-lock-state',
    'data-kanban-parent-lock-progress',
    'data-kanban-drop-parent-id',
    'data-kanban-drop-indicator',
    'data-kanban-drop-position',
    'data-kanban-child-empty-lane',
    'data-kanban-empty-lane-line',
    'data-kanban-drop-invalid-reason',
  ].every((needle) => source.feedback.includes(needle)) &&
  [
    'KanbanParentGroupStatus',
    'KanbanFloatingLockStatus',
    'data-kanban-floating-lock-status',
    '已鎖定',
    '停留以',
    '放入「',
    'aria-live="polite"',
  ].every((needle) => !source.feedback.includes(needle)));
assert('empty child lanes show only the resolved primary insertion line',
  source.feedback.includes('showInsertionLine') &&
    source.feedback.includes('state.target?.valid') &&
    source.feedback.includes("state.phase === 'same-parent'") &&
    source.feedback.includes("state.phase === 'arming'") &&
    source.feedback.includes("state.phase === 'locked'") &&
    source.feedback.includes('bg-primary shadow-[0_0_0_1px_rgba(99,102,241,0.2)]') &&
    !source.feedback.includes('bg-slate-300') &&
    !source.feedback.includes('bg-amber-400') &&
    source.browser.includes('non-target empty lanes must not show insertion lines') &&
    source.browser.includes('only the resolved empty-lane drop position should show a line') &&
    source.browser.includes('empty-lane insertion line must use the locked-frame primary color'));
assert('empty child lanes are overlay hit areas and do not reserve task spacing',
  source.feedback.includes('className="absolute inset-x-1 -bottom-1.5 z-30 flex h-3 items-center"') &&
    !source.feedback.includes('min-h-6') &&
    !source.feedback.includes('mt-1 flex min-h') &&
    source.browser.includes('non-target empty lanes must not reserve task spacing') &&
    source.browser.includes('target empty-lane indicator must overlay without changing task spacing') &&
    source.browser.includes("layoutBeforeHover.lanePosition === 'absolute'"));
assert('desktop drag preview aligns to the resolved insertion line',
  source.boardView.includes('data-kanban-placement-preview="true"') &&
    source.boardView.includes('data-kanban-pointer-drag-preview="true"') &&
    source.boardView.includes('getVisibleLineRect') &&
    source.boardView.includes('setDesktopPlacementPreview') &&
    source.boardView.includes('activeDrag?.node && !desktopPlacementPreview') &&
    source.boardView.includes('lineRect.bottom + 4') &&
    source.browser.includes('placement preview must align with the insertion line') &&
    source.browser.includes('pointer drag preview must be hidden while placement preview is aligned'));
assert('cursor and finger fallback previews are precisely pointer-positioned',
  source.boardView.includes('const getDndPointerPoint') &&
    source.boardView.includes('desktopPointerPreview') &&
    source.boardView.includes('data-kanban-pointer-preview-mode="cursor"') &&
    source.boardView.includes('data-kanban-pointer-x={desktopPointerPreview.left}') &&
    source.boardView.includes('data-kanban-pointer-y={desktopPointerPreview.top}') &&
    source.boardView.includes('lastDesktopPointerPointRef') &&
    source.boardView.includes('const hasPointerPoint = Boolean(readDesktopPointerPoint(event))') &&
    source.boardView.includes('resolveDesktopKanbanTargetAtPoint(active, event)') &&
    source.boardView.includes("target.kind === 'task-anchor' && target.sameParent") &&
    source.boardView.includes('isDesktopPointerInsideTaskAnchor') &&
    source.boardView.includes('collision-anchor-under-pointer') &&
    source.boardView.includes('getVisibleTaskAnchorRect') &&
    source.boardView.includes('collision-same-parent-anchor') &&
    source.boardView.includes('withDragPreviewsHidden') &&
    source.boardView.includes('DRAG_PREVIEW_HIT_TEST_SELECTOR') &&
    source.boardView.includes('hasValidInsertionPreview') &&
    source.boardView.includes('data-mobile-pointer-preview-mode="finger"') &&
    source.boardView.includes('data-mobile-pointer-x={Math.round(state.pointerX)}') &&
    !source.boardView.includes('DragOverlay') &&
    source.browser.includes('desktop pointer preview must follow the cursor exactly') &&
    source.browser.includes('mobile pointer preview must follow the finger exactly') &&
    source.browser.includes('mobile finger preview must hide when insertion indicator is active'));
assert('dragging source is removed instead of leaving an original placeholder',
  source.card.includes('const isDragSourceRemoved = isDragging') &&
    source.card.includes("data-kanban-drag-source-hidden={isDragSourceRemoved ? 'true' : undefined}") &&
    source.card.includes("? 'hidden'") &&
    !source.card.includes('opacity-60 shadow-md border-slate-200') &&
    source.checklist.includes('const isDragSourceRemoved = isDragging') &&
    source.checklist.includes("className={isDragSourceRemoved ? 'hidden' : undefined}") &&
    source.checklist.includes("data-kanban-drag-source-hidden={isDragSourceRemoved ? 'true' : undefined}") &&
    !source.checklist.includes('opacity-40 bg-primary/5') &&
    source.column.includes('const isDragSourceRemoved = isColumnDragging') &&
    source.column.includes("data-kanban-drag-source-hidden={isDragSourceRemoved ? 'true' : undefined}") &&
    !source.column.includes('opacity-50 shadow-2xl') &&
    source.browser.includes('original source must be removed while dragging') &&
    source.browser.includes('hiddenSourceMarkerCount'));
assert('hover path does not persist or push undo',
  !source.feedback.includes('batchUpdateNodes') &&
  !source.context.includes('useWbsStore') &&
  !source.module.includes('pushUndo'));
assert('structural reorder patches do not trigger unrelated smart-status assignment guards',
  source.wbsStore.includes('STRUCTURAL_TASK_UPDATE_KEYS') &&
  ['parentId', 'order', 'nodeType', 'workspaceId', 'boardId', 'kanbanStageId', 'updatedAt']
    .every((needle) => source.wbsStore.includes(`'${needle}'`)) &&
  source.wbsStore.includes('updateKeys.every(key => STRUCTURAL_TASK_UPDATE_KEYS.has(key))'));
assert('DEV-051 commands are registered',
  source.packageJson.includes('"verify:dev-051-kanban-cross-parent-drag-lock"') &&
  source.packageJson.includes('"verify:dev-051-kanban-cross-parent-drag-lock-browser"'));

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
