import assert from 'node:assert/strict';
import type { TaskNode } from '../src/types';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../src/features/taskWorkbench/placementModel';
import {
  buildMoveTaskSubtreeCommand,
  buildRestoreDestination,
  getPlacementScopeKey,
  getTaskPlacementScope,
  projectMoveTaskSubtreeCommand,
  taskBelongsToPlacementScope,
  type MoveTaskSubtreeResult,
  type PlacementScope,
} from '../src/features/taskWorkbench/taskPlacementCommand';
import { buildTaskParentIndex, resolveTaskDropOutcome } from '../src/components/Wbs/taskDrag/taskDropIntent';

const now = 1_787_689_200_000;
const makeNode = (
  id: string,
  workspaceId: string,
  boardId: string,
  parentId: string | null,
  order: number,
  nodeType: TaskNode['nodeType'] = 'task',
): TaskNode => ({
  id,
  workspaceId,
  boardId,
  parentId,
  title: id,
  status: 'todo',
  nodeType,
  order,
  createdAt: now,
  updatedAt: now,
});

const applyCanonicalResult = (
  nodes: Record<string, TaskNode>,
  result: MoveTaskSubtreeResult,
) => {
  const next = { ...nodes };
  result.canonicalNodes.forEach((patch) => {
    const current = next[patch.id];
    assert.ok(current, `canonical patch references missing task ${patch.id}`);
    next[patch.id] = { ...current, ...patch };
  });
  return next;
};

const scopeNodes = (nodes: Record<string, TaskNode>, scope: PlacementScope) => Object.values(nodes)
  .filter(node => !node.isArchived && taskBelongsToPlacementScope(node, scope))
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

const assertDenseScope = (nodes: Record<string, TaskNode>, scope: PlacementScope) => {
  const tasks = scopeNodes(nodes, scope);
  assert.deepEqual(tasks.map(task => task.order), tasks.map((_, index) => index),
    `scope ${getPlacementScopeKey(scope)} must have dense canonical order`);
};

const assertUnaffectedNodesUnchanged = (
  before: Record<string, TaskNode>,
  after: Record<string, TaskNode>,
  result: MoveTaskSubtreeResult,
) => {
  const affectedKeys = new Set(result.affectedScopes.map(getPlacementScopeKey));
  const movedIds = new Set(result.movedTaskIds);
  Object.values(before).forEach((node) => {
    if (movedIds.has(node.id) || affectedKeys.has(getPlacementScopeKey(getTaskPlacementScope(node)))) return;
    assert.deepEqual(after[node.id], node, `unaffected task ${node.id} changed`);
  });
};

let randomState = 0x59_089_26;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x1_0000_0000;
};
const randomInt = (minimum: number, maximum: number) =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

const buildFixture = (iteration: number) => {
  const nodes: Record<string, TaskNode> = {};
  for (let workspace = 0; workspace < 3; workspace += 1) {
    for (let board = 0; board < 2; board += 1) {
      const rootCount = randomInt(2, 5);
      for (let root = 0; root < rootCount; root += 1) {
        const id = `i${iteration}-w${workspace}-b${board}-r${root}`;
        nodes[id] = makeNode(id, `workspace-${workspace}`, `board-${workspace}-${board}`, null, root * 7 + randomInt(0, 3));
      }
    }
  }

  const sourceRootId = `i${iteration}-w0-b0-r0`;
  const childId = `${sourceRootId}-child`;
  const grandchildId = `${sourceRootId}-grandchild`;
  nodes[childId] = makeNode(childId, 'workspace-0', 'board-0-0', sourceRootId, 4);
  nodes[grandchildId] = makeNode(grandchildId, 'workspace-0', 'board-0-0', childId, 9);

  const unplacedCount = randomInt(2, 5);
  for (let root = 0; root < unplacedCount; root += 1) {
    const id = `i${iteration}-unplaced-${root}`;
    nodes[id] = makeNode(
      id,
      `workspace-${randomInt(0, 2)}`,
      TASK_WORKBENCH_UNPLACED_BOARD_ID,
      null,
      root * 11 + randomInt(0, 4),
    );
  }
  return { nodes, sourceRootId, childId, grandchildId };
};

for (let iteration = 0; iteration < 1_000; iteration += 1) {
  const { nodes, sourceRootId, childId, grandchildId } = buildFixture(iteration);
  const sourceScope = getTaskPlacementScope(nodes[sourceRootId]);
  const unplacedScope: PlacementScope = { ownership: { kind: 'account_unplaced' }, parentId: null };
  const originalSourceIds = scopeNodes(nodes, sourceScope).map(node => node.id);
  const originalUnplacedIds = scopeNodes(nodes, unplacedScope).map(node => node.id);

  const toUnplacedCommand = buildMoveTaskSubtreeCommand({
    rootTaskId: sourceRootId,
    nodesRecord: nodes,
    destination: {
      ...unplacedScope,
      anchorTaskId: originalUnplacedIds[0],
      position: 'before',
    },
    clientPlatform: iteration % 2 === 0 ? 'desktop' : 'mobile',
    operationId: `property-to-unplaced-${iteration}`,
  });
  assert.deepEqual(toUnplacedCommand.expectedSubtreeIds, [sourceRootId, childId, grandchildId]);
  const toUnplacedResult = projectMoveTaskSubtreeCommand(toUnplacedCommand, nodes);
  const afterUnplaced = applyCanonicalResult(nodes, toUnplacedResult);

  assertUnaffectedNodesUnchanged(nodes, afterUnplaced, toUnplacedResult);
  assertDenseScope(afterUnplaced, sourceScope);
  assertDenseScope(afterUnplaced, unplacedScope);
  assert.deepEqual(scopeNodes(afterUnplaced, sourceScope).map(node => node.id), originalSourceIds.slice(1));
  assert.equal(afterUnplaced[sourceRootId].parentId, null);
  assert.equal(afterUnplaced[childId].parentId, sourceRootId);
  assert.equal(afterUnplaced[grandchildId].parentId, childId);
  assert.ok([sourceRootId, ...originalUnplacedIds].every(id =>
    scopeNodes(afterUnplaced, unplacedScope).some(node => node.id === id)),
  'account-global unplaced scope must not split by provenance workspace');

  const destinationScope: PlacementScope = {
    ownership: { kind: 'board', workspaceId: 'workspace-2', boardId: 'board-2-1' },
    parentId: null,
  };
  const destinationIds = scopeNodes(afterUnplaced, destinationScope).map(node => node.id);
  const toBoardCommand = buildMoveTaskSubtreeCommand({
    rootTaskId: sourceRootId,
    nodesRecord: afterUnplaced,
    destination: {
      ...destinationScope,
      anchorTaskId: destinationIds.at(-1) || null,
      position: destinationIds.length > 0 ? 'after' : 'append',
    },
    clientPlatform: iteration % 2 === 0 ? 'mobile' : 'desktop',
    operationId: `property-to-board-${iteration}`,
  });
  const toBoardResult = projectMoveTaskSubtreeCommand(toBoardCommand, afterUnplaced);
  const afterBoard = applyCanonicalResult(afterUnplaced, toBoardResult);

  assertUnaffectedNodesUnchanged(afterUnplaced, afterBoard, toBoardResult);
  assertDenseScope(afterBoard, unplacedScope);
  assertDenseScope(afterBoard, destinationScope);
  [sourceRootId, childId, grandchildId].forEach((id) => {
    assert.equal(afterBoard[id].workspaceId, 'workspace-2');
    assert.equal(afterBoard[id].boardId, 'board-2-1');
  });
  assert.equal(afterBoard[childId].parentId, sourceRootId);
  assert.equal(afterBoard[grandchildId].parentId, childId);

  const parentIndex = buildTaskParentIndex(afterBoard);
  assert.deepEqual(parentIndex[getPlacementScopeKey(sourceScope)], scopeNodes(afterBoard, sourceScope).map(node => node.id));
  assert.deepEqual(parentIndex[getPlacementScopeKey(destinationScope)], scopeNodes(afterBoard, destinationScope).map(node => node.id));
}

const crossOwnershipNodes: Record<string, TaskNode> = {
  unplaced: makeNode('unplaced', 'workspace-history', TASK_WORKBENCH_UNPLACED_BOARD_ID, null, 0, 'group'),
  boardRoot: makeNode('boardRoot', 'workspace-target', 'board-target', null, 0, 'group'),
  boardChild: makeNode('boardChild', 'workspace-target', 'board-target', 'boardRoot', 0),
};
assert.equal(resolveTaskDropOutcome({
  source: { nodeId: 'unplaced', surfaceKind: 'workbench-unplaced-row' },
  target: { nodeId: 'boardRoot', surfaceKind: 'column-header', orderingPosition: 'before' },
  nodesRecord: crossOwnershipNodes,
}).kind, 'move', 'cross-ownership drop must never be misclassified as origin');
const childDrop = resolveTaskDropOutcome({
  source: { nodeId: 'unplaced', surfaceKind: 'workbench-unplaced-row' },
  target: { nodeId: 'boardChild', surfaceKind: 'task-title-child' },
  nodesRecord: crossOwnershipNodes,
});
assert.equal(childDrop.kind, 'move', 'unplaced task must be allowed to enter a board child scope');
assert.equal(childDrop.intent?.parentId, 'boardChild');
const childPlacementCommand = buildMoveTaskSubtreeCommand({
  rootTaskId: 'unplaced',
  nodesRecord: crossOwnershipNodes,
  destination: {
    ownership: { kind: 'board', workspaceId: 'workspace-target', boardId: 'board-target' },
    parentId: 'boardChild',
    anchorTaskId: null,
    position: 'append',
  },
  clientPlatform: 'mobile',
  operationId: 'property-append-child',
});
const childPlacementResult = projectMoveTaskSubtreeCommand(childPlacementCommand, crossOwnershipNodes);
const childPlacementRoot = childPlacementResult.canonicalNodes.find(node => node.id === 'unplaced');
assert.equal(childPlacementRoot?.parentId, 'boardChild');
assert.equal(childPlacementRoot?.workspaceId, 'workspace-target');
assert.equal(childPlacementRoot?.boardId, 'board-target');
assert.equal(childPlacementRoot?.nodeType, 'task', 'a root/group placed below a task must become a task node');

const nonDenseNodes: Record<string, TaskNode> = {
  first: makeNode('first', 'workspace-a', 'board-a', null, 5),
  second: makeNode('second', 'workspace-a', 'board-a', null, 10),
  third: makeNode('third', 'workspace-a', 'board-a', null, 20),
};
assert.deepEqual(buildRestoreDestination('first', nonDenseNodes), {
  ownership: { kind: 'board', workspaceId: 'workspace-a', boardId: 'board-a' },
  parentId: null,
  anchorTaskId: 'second',
  position: 'before',
}, 'undo restore position must use canonical sibling ordering, not treat a sparse order value as an array index');

console.log(JSON.stringify({
  ok: true,
  properties: {
    randomizedIterations: 1_000,
    bothDirections: true,
    desktopAndMobileCommands: true,
    crossWorkspaceScopeIsolation: true,
    accountGlobalUnplacedOrdering: true,
    completeSubtreePreserved: true,
    crossOwnershipOriginGuard: true,
    nestedBoardDestination: true,
    sparseOrderUndoRestore: true,
  },
}, null, 2));
