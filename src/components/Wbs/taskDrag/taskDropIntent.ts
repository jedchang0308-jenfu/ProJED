import type { TaskNode } from '../../../types';
import type { TaskDropSurfaceKind } from './taskDragTypes';

export interface TaskDropDescriptor {
  nodeId: string;
  surfaceKind: TaskDropSurfaceKind;
  orderingPosition?: 'before' | 'after';
}

export interface TaskDropIntent {
  parentId: string | null;
  order: number;
  nodeType?: TaskNode['nodeType'];
  displayPosition: 'before' | 'after' | 'append';
}

export type TaskDropOutcome =
  | { kind: 'move'; intent: TaskDropIntent }
  | { kind: 'origin'; intent: TaskDropIntent }
  | { kind: 'invalid'; intent: null };

export const buildTaskParentIndex = (nodesRecord: Record<string, TaskNode>) => {
  const parentIndex: Record<string, string[]> = {};
  Object.values(nodesRecord).forEach((node) => {
    if (node.isArchived) return;
    const key = node.parentId || 'root';
    if (!parentIndex[key]) parentIndex[key] = [];
    parentIndex[key].push(node.id);
  });
  Object.keys(parentIndex).forEach((parentId) => {
    parentIndex[parentId].sort((leftId, rightId) =>
      (nodesRecord[leftId]?.order ?? 0) - (nodesRecord[rightId]?.order ?? 0));
  });
  return parentIndex;
};

export const isTaskDropIntentOrigin = (
  draggedNodeId: string,
  intent: TaskDropIntent | null,
  nodesRecord: Record<string, TaskNode>,
) => {
  const draggedNode = nodesRecord[draggedNodeId];
  if (!draggedNode || !intent) return false;
  if ((draggedNode.parentId || null) !== intent.parentId) return false;
  if ((intent.nodeType ?? draggedNode.nodeType) !== draggedNode.nodeType) return false;

  const parentKey = intent.parentId || 'root';
  const originalOrder = buildTaskParentIndex(nodesRecord)[parentKey] || [];
  const movedOrder = buildTaskParentIndex({
    ...nodesRecord,
    [draggedNodeId]: {
      ...draggedNode,
      parentId: intent.parentId,
      nodeType: intent.nodeType ?? draggedNode.nodeType,
      order: intent.order,
    },
  })[parentKey] || [];

  return originalOrder.length === movedOrder.length
    && originalOrder.every((nodeId, index) => nodeId === movedOrder[index]);
};

export const getTaskAppendOrder = (
  parentId: string,
  excludeId: string | undefined,
  nodesRecord: Record<string, TaskNode>,
  parentIndex = buildTaskParentIndex(nodesRecord),
) => (parentIndex[parentId] || []).reduce((max, id) => {
  if (id === excludeId) return max;
  const node = nodesRecord[id];
  return node ? Math.max(max, node.order ?? 0) : max;
}, -1) + 1;

const isDescendantOf = (
  nodeId: string,
  possibleAncestorId: string,
  nodesRecord: Record<string, TaskNode>,
) => {
  let current = nodesRecord[nodeId]?.parentId;
  const visited = new Set<string>();
  while (current) {
    if (current === possibleAncestorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = nodesRecord[current]?.parentId || null;
  }
  return false;
};

export const isValidTaskDropIntent = (
  draggedNodeId: string,
  intent: TaskDropIntent | null,
  nodesRecord: Record<string, TaskNode>,
) => {
  if (!intent || intent.parentId === draggedNodeId) return false;
  return !intent.parentId || !isDescendantOf(intent.parentId, draggedNodeId, nodesRecord);
};

export const classifyTaskDropOutcome = ({
  draggedNodeId,
  intent,
  nodesRecord,
}: {
  draggedNodeId: string;
  intent: TaskDropIntent | null;
  nodesRecord: Record<string, TaskNode>;
}): TaskDropOutcome => {
  if (!isValidTaskDropIntent(draggedNodeId, intent, nodesRecord) || !intent) {
    return { kind: 'invalid', intent: null };
  }
  return isTaskDropIntentOrigin(draggedNodeId, intent, nodesRecord)
    ? { kind: 'origin', intent }
    : { kind: 'move', intent };
};

const getReorderIntent = (
  draggedNode: TaskNode,
  targetNode: TaskNode,
  orderingPosition?: 'before' | 'after',
) => {
  if (orderingPosition) {
    return {
      order: (targetNode.order ?? 0) + (orderingPosition === 'after' ? 0.5 : -0.5),
      displayPosition: orderingPosition,
    };
  }
  const sameParent = (draggedNode.parentId || null) === (targetNode.parentId || null);
  const movingDown = sameParent && (draggedNode.order ?? 0) < (targetNode.order ?? 0);
  return {
    order: (targetNode.order ?? 0) + (movingDown ? 0.5 : -0.5),
    displayPosition: movingDown ? 'after' as const : 'before' as const,
  };
};

export const resolveTaskDropIntent = ({
  source,
  target,
  nodesRecord,
}: {
  source: TaskDropDescriptor;
  target: TaskDropDescriptor;
  nodesRecord: Record<string, TaskNode>;
}): TaskDropIntent | null => {
  const draggedNode = nodesRecord[source.nodeId];
  const targetNode = nodesRecord[target.nodeId];
  if (!draggedNode || !targetNode || draggedNode.isArchived || targetNode.isArchived) return null;
  if (draggedNode.id === targetNode.id) return null;
  if (
    target.surfaceKind === 'task-title-child'
    && (draggedNode.workspaceId !== targetNode.workspaceId || draggedNode.boardId !== targetNode.boardId)
  ) return null;

  const sourceIsColumn = source.surfaceKind === 'column-header';
  const targetIsRoot = target.surfaceKind === 'column-header' || target.surfaceKind === 'root-drop';
  const shouldBecomeTask = sourceIsColumn && !targetIsRoot;
  const rootNodeType = sourceIsColumn ? draggedNode.nodeType : 'group';
  let intent: TaskDropIntent | null = null;

  if (target.surfaceKind === 'column-header') {
    const reorder = getReorderIntent(draggedNode, targetNode, target.orderingPosition);
    intent = {
      parentId: targetNode.parentId || null,
      order: reorder.order,
      nodeType: rootNodeType,
      displayPosition: reorder.displayPosition,
    };
  } else if (target.surfaceKind === 'root-drop') {
    intent = {
      parentId: null,
      order: (targetNode.order ?? 0) + 1,
      nodeType: rootNodeType,
      displayPosition: 'append',
    };
  } else if (target.surfaceKind === 'kanban-card') {
    const reorder = getReorderIntent(draggedNode, targetNode, target.orderingPosition);
    intent = {
      parentId: targetNode.parentId || null,
      order: reorder.order,
      nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
      displayPosition: reorder.displayPosition,
    };
  } else if (target.surfaceKind === 'checklist-row' && targetNode.parentId) {
    const reorder = getReorderIntent(draggedNode, targetNode, target.orderingPosition);
    intent = {
      parentId: targetNode.parentId,
      order: reorder.order,
      nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
      displayPosition: reorder.displayPosition,
    };
  } else if (
    target.surfaceKind === 'column-drop'
    || target.surfaceKind === 'checklist-drop'
    || target.surfaceKind === 'task-title-child'
  ) {
    intent = {
      parentId: targetNode.id,
      order: getTaskAppendOrder(targetNode.id, draggedNode.id, nodesRecord),
      nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
      displayPosition: 'append',
    };
  }

  return isValidTaskDropIntent(draggedNode.id, intent, nodesRecord) ? intent : null;
};

export const resolveTaskDropOutcome = ({
  source,
  target,
  nodesRecord,
}: {
  source: TaskDropDescriptor;
  target: TaskDropDescriptor;
  nodesRecord: Record<string, TaskNode>;
}): TaskDropOutcome => classifyTaskDropOutcome({
  draggedNodeId: source.nodeId,
  intent: resolveTaskDropIntent({ source, target, nodesRecord }),
  nodesRecord,
});

export const taskDragSourceKindToSurfaceKind = (
  sourceKind: string,
): TaskDropSurfaceKind | null => {
  if (sourceKind === 'column-header' || sourceKind === 'wbs-column') return 'column-header';
  if (sourceKind === 'kanban-card' || sourceKind === 'wbs-card') return 'kanban-card';
  if (sourceKind === 'checklist-row' || sourceKind === 'wbs-checklist') return 'checklist-row';
  if (sourceKind === 'workbench-unplaced-row') return 'workbench-unplaced-row';
  return null;
};

export const desktopTargetTypeToSurfaceKind = (
  targetType: string | undefined,
): TaskDropSurfaceKind | null => {
  if (targetType === 'wbs-column') return 'column-header';
  if (targetType === 'wbs-column-drop') return 'column-drop';
  if (targetType === 'wbs-root-drop') return 'root-drop';
  if (targetType === 'wbs-card') return 'kanban-card';
  if (targetType === 'wbs-checklist') return 'checklist-row';
  if (targetType === 'wbs-card-drop') return 'checklist-drop';
  if (targetType === 'wbs-checklist-drop') return 'checklist-drop';
  if (targetType === 'wbs-task-title-child') return 'task-title-child';
  return null;
};
