import type { TaskNode } from '../../types';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from './placementModel';

export type TaskOwnershipRef =
  | {
    kind: 'board';
    workspaceId: string;
    boardId: string;
  }
  | {
    kind: 'account_unplaced';
  };

export type PlacementScope = {
  ownership: TaskOwnershipRef;
  parentId: string | null;
};

export type TaskPlacementPosition = 'before' | 'after' | 'append';

export type MoveTaskSubtreeCommand = {
  commandVersion: 2;
  operationId: string;
  rootTaskId: string;
  expectedSubtreeIds: string[];
  source: TaskOwnershipRef;
  destination: PlacementScope & {
    anchorTaskId: string | null;
    position: TaskPlacementPosition;
  };
  clientPlatform: 'desktop' | 'mobile';
};

export type TaskPlacementCanonicalNode = Pick<
  TaskNode,
  'id' | 'workspaceId' | 'boardId' | 'parentId' | 'order' | 'nodeType' | 'updatedAt'
> & Pick<Partial<TaskNode>, 'kanbanStageId'>;

export type MoveTaskSubtreeResult = {
  operationId: string;
  status: 'committed';
  direction: 'to_board' | 'to_unplaced';
  movedTaskIds: string[];
  canonicalNodes: TaskPlacementCanonicalNode[];
  affectedScopes: PlacementScope[];
};

const ROOT_SCOPE_PARENT = '__root__';

const normalizeParentId = (parentId: string | null | undefined) => parentId || null;

export const getTaskOwnershipRef = (
  task: Pick<TaskNode, 'workspaceId' | 'boardId'>,
): TaskOwnershipRef => task.boardId === TASK_WORKBENCH_UNPLACED_BOARD_ID
  ? { kind: 'account_unplaced' }
  : {
    kind: 'board',
    workspaceId: task.workspaceId,
    boardId: task.boardId,
  };

export const taskOwnershipEquals = (left: TaskOwnershipRef, right: TaskOwnershipRef) => {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'account_unplaced' || right.kind === 'account_unplaced') return true;
  return left.workspaceId === right.workspaceId && left.boardId === right.boardId;
};

export const getTaskOwnershipKey = (ownership: TaskOwnershipRef) => ownership.kind === 'account_unplaced'
  ? 'account_unplaced'
  : `board:${encodeURIComponent(ownership.workspaceId)}:${encodeURIComponent(ownership.boardId)}`;

export const getPlacementScopeKey = (scope: PlacementScope) =>
  `${getTaskOwnershipKey(scope.ownership)}:parent:${encodeURIComponent(scope.parentId || ROOT_SCOPE_PARENT)}`;

export const getTaskPlacementScope = (
  task: Pick<TaskNode, 'workspaceId' | 'boardId' | 'parentId'>,
): PlacementScope => ({
  ownership: getTaskOwnershipRef(task),
  parentId: normalizeParentId(task.parentId),
});

export const taskBelongsToOwnership = (
  task: Pick<TaskNode, 'workspaceId' | 'boardId'>,
  ownership: TaskOwnershipRef,
) => taskOwnershipEquals(getTaskOwnershipRef(task), ownership);

export const taskBelongsToPlacementScope = (
  task: Pick<TaskNode, 'workspaceId' | 'boardId' | 'parentId'>,
  scope: PlacementScope,
) => taskBelongsToOwnership(task, scope.ownership)
  && normalizeParentId(task.parentId) === normalizeParentId(scope.parentId);

export const createTaskPlacementOperationId = () => {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `placement_v2_${randomId}`;
};

export const getTaskSubtreeIds = (
  rootTaskId: string,
  nodesRecord: Record<string, TaskNode>,
) => {
  const root = nodesRecord[rootTaskId];
  if (!root || root.isArchived) return [];
  const sourceOwnership = getTaskOwnershipRef(root);
  const childrenByParent = new Map<string, TaskNode[]>();

  Object.values(nodesRecord).forEach((node) => {
    if (!node || node.isArchived || !node.parentId || !taskBelongsToOwnership(node, sourceOwnership)) return;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  });
  childrenByParent.forEach(children => children.sort((left, right) => {
    const orderDifference = (left.order ?? 0) - (right.order ?? 0);
    return orderDifference !== 0 ? orderDifference : left.id.localeCompare(right.id);
  }));

  const orderedIds: string[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    orderedIds.push(nodeId);
    (childrenByParent.get(nodeId) || []).forEach(child => visit(child.id));
  };
  visit(rootTaskId);
  return orderedIds;
};

const assertDestinationIntent = (
  destination: MoveTaskSubtreeCommand['destination'],
  nodesRecord: Record<string, TaskNode>,
  subtreeIds: Set<string>,
) => {
  if (destination.position === 'append' && destination.anchorTaskId) {
    throw new Error('Append placement must not include an anchor task.');
  }
  if (destination.position !== 'append' && !destination.anchorTaskId) {
    throw new Error('Before/after placement requires an anchor task.');
  }
  if (destination.parentId && subtreeIds.has(destination.parentId)) {
    throw new Error('A task subtree cannot be placed below itself.');
  }
  if (destination.parentId) {
    const parent = nodesRecord[destination.parentId];
    if (!parent || parent.isArchived || !taskBelongsToOwnership(parent, destination.ownership)) {
      throw new Error('Task placement target parent is outside the destination ownership.');
    }
  }
  if (destination.anchorTaskId) {
    const anchor = nodesRecord[destination.anchorTaskId];
    if (!anchor || anchor.isArchived || subtreeIds.has(anchor.id)
      || !taskBelongsToPlacementScope(anchor, destination)) {
      throw new Error('Task placement anchor is outside the destination scope.');
    }
  }
};

export const assertMoveTaskSubtreeCommand = (
  command: MoveTaskSubtreeCommand,
  nodesRecord: Record<string, TaskNode>,
) => {
  if (command.commandVersion !== 2) throw new Error('Unsupported task placement command version.');
  if (!command.operationId.trim()) throw new Error('Task placement operation id is required.');
  const root = nodesRecord[command.rootTaskId];
  if (!root || root.isArchived) throw new Error('Task placement root is not available.');
  if (!taskOwnershipEquals(getTaskOwnershipRef(root), command.source)) {
    throw new Error('Task placement source does not match the canonical root ownership.');
  }
  if (command.source.kind === command.destination.ownership.kind) {
    throw new Error('Task placement command must cross the unplaced ownership boundary.');
  }
  const actualSubtreeIds = getTaskSubtreeIds(command.rootTaskId, nodesRecord);
  if (actualSubtreeIds.length !== command.expectedSubtreeIds.length
    || actualSubtreeIds.some((id, index) => command.expectedSubtreeIds[index] !== id)) {
    throw new Error('Task placement command does not contain the exact canonical subtree.');
  }
  assertDestinationIntent(command.destination, nodesRecord, new Set(actualSubtreeIds));
};

export const buildMoveTaskSubtreeCommand = ({
  rootTaskId,
  nodesRecord,
  destination,
  clientPlatform,
  operationId = createTaskPlacementOperationId(),
}: {
  rootTaskId: string;
  nodesRecord: Record<string, TaskNode>;
  destination: MoveTaskSubtreeCommand['destination'];
  clientPlatform: MoveTaskSubtreeCommand['clientPlatform'];
  operationId?: string;
}): MoveTaskSubtreeCommand => {
  const root = nodesRecord[rootTaskId];
  if (!root || root.isArchived) throw new Error('Task placement root is not available.');
  const command: MoveTaskSubtreeCommand = {
    commandVersion: 2,
    operationId,
    rootTaskId,
    expectedSubtreeIds: getTaskSubtreeIds(rootTaskId, nodesRecord),
    source: getTaskOwnershipRef(root),
    destination: {
      ...destination,
      parentId: normalizeParentId(destination.parentId),
    },
    clientPlatform,
  };
  assertMoveTaskSubtreeCommand(command, nodesRecord);
  return command;
};

const sortScopeNodes = (nodes: TaskNode[]) => [...nodes].sort((left, right) => {
  const orderDifference = (left.order ?? 0) - (right.order ?? 0);
  return orderDifference !== 0 ? orderDifference : left.id.localeCompare(right.id);
});

const getDestinationInsertionIndex = (
  destinationSiblings: TaskNode[],
  destination: MoveTaskSubtreeCommand['destination'],
) => {
  if (destination.position === 'append') return destinationSiblings.length;
  const anchorIndex = destinationSiblings.findIndex(node => node.id === destination.anchorTaskId);
  if (anchorIndex < 0) throw new Error('Task placement anchor is not available.');
  return anchorIndex + (destination.position === 'after' ? 1 : 0);
};

export const projectMoveTaskSubtreeCommand = (
  command: MoveTaskSubtreeCommand,
  nodesRecord: Record<string, TaskNode>,
): MoveTaskSubtreeResult => {
  assertMoveTaskSubtreeCommand(command, nodesRecord);
  const now = Date.now();
  const subtreeIds = new Set(command.expectedSubtreeIds);
  const rootBefore = nodesRecord[command.rootTaskId];
  const sourceScope = getTaskPlacementScope(rootBefore);
  const destinationScope: PlacementScope = {
    ownership: command.destination.ownership,
    parentId: command.destination.parentId,
  };
  const sourceSiblings = sortScopeNodes(Object.values(nodesRecord).filter(node =>
    node && !node.isArchived && !subtreeIds.has(node.id) && taskBelongsToPlacementScope(node, sourceScope)));
  const destinationSiblings = sortScopeNodes(Object.values(nodesRecord).filter(node =>
    node && !node.isArchived && !subtreeIds.has(node.id) && taskBelongsToPlacementScope(node, destinationScope)));
  const insertionIndex = getDestinationInsertionIndex(destinationSiblings, command.destination);
  const destinationOrder = [...destinationSiblings];
  destinationOrder.splice(insertionIndex, 0, rootBefore);
  const canonicalById = new Map<string, TaskPlacementCanonicalNode>();

  sourceSiblings.forEach((node, order) => canonicalById.set(node.id, {
    id: node.id,
    workspaceId: node.workspaceId,
    boardId: node.boardId,
    parentId: normalizeParentId(node.parentId),
    order,
    nodeType: node.nodeType || 'task',
    kanbanStageId: node.kanbanStageId,
    updatedAt: now,
  }));

  const rootOrder = destinationOrder.findIndex(node => node.id === command.rootTaskId);
  command.expectedSubtreeIds.forEach((nodeId) => {
    const node = nodesRecord[nodeId];
    const isRoot = nodeId === command.rootTaskId;
    const destinationOwnership = command.destination.ownership;
    canonicalById.set(nodeId, {
      id: node.id,
      workspaceId: destinationOwnership.kind === 'board' ? destinationOwnership.workspaceId : node.workspaceId,
      boardId: destinationOwnership.kind === 'board'
        ? destinationOwnership.boardId
        : TASK_WORKBENCH_UNPLACED_BOARD_ID,
      parentId: isRoot ? command.destination.parentId : normalizeParentId(node.parentId),
      order: isRoot ? rootOrder : (node.order ?? 0),
      nodeType: isRoot && command.destination.parentId ? 'task' : (node.nodeType || 'task'),
      kanbanStageId: node.kanbanStageId,
      updatedAt: now,
    });
  });

  destinationOrder.forEach((node, order) => {
    if (node.id === command.rootTaskId) return;
    canonicalById.set(node.id, {
      id: node.id,
      workspaceId: node.workspaceId,
      boardId: node.boardId,
      parentId: normalizeParentId(node.parentId),
      order,
      nodeType: node.nodeType || 'task',
      kanbanStageId: node.kanbanStageId,
      updatedAt: now,
    });
  });

  return {
    operationId: command.operationId,
    status: 'committed',
    direction: command.source.kind === 'account_unplaced' ? 'to_board' : 'to_unplaced',
    movedTaskIds: [...command.expectedSubtreeIds],
    canonicalNodes: Array.from(canonicalById.values()),
    affectedScopes: getPlacementScopeKey(sourceScope) === getPlacementScopeKey(destinationScope)
      ? [sourceScope]
      : [sourceScope, destinationScope],
  };
};

export const buildRestoreDestination = (
  rootTaskId: string,
  nodesRecord: Record<string, TaskNode>,
): MoveTaskSubtreeCommand['destination'] => {
  const root = nodesRecord[rootTaskId];
  if (!root) throw new Error('Task placement restore root is not available.');
  const scope = getTaskPlacementScope(root);
  const originalScopeOrder = sortScopeNodes(Object.values(nodesRecord).filter(node =>
    node && !node.isArchived && taskBelongsToPlacementScope(node, scope)));
  const originalIndex = originalScopeOrder.findIndex(node => node.id === rootTaskId);
  if (originalIndex < 0) throw new Error('Task placement restore root is outside its canonical scope.');
  const previous = originalScopeOrder[originalIndex - 1];
  const next = originalScopeOrder[originalIndex + 1];
  if (previous) {
    return { ...scope, anchorTaskId: previous.id, position: 'after' };
  }
  if (next) {
    return { ...scope, anchorTaskId: next.id, position: 'before' };
  }
  return { ...scope, anchorTaskId: null, position: 'append' };
};

export const withNewTaskPlacementOperation = (
  command: MoveTaskSubtreeCommand,
): MoveTaskSubtreeCommand => ({
  ...command,
  operationId: createTaskPlacementOperationId(),
});
