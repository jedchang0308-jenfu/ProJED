import type { TaskNode } from '../../../types';
import type { BatchNodeUpdates } from '../../../store/useWbsStore';
import {
  getPlacementScopeKey,
  getTaskOwnershipRef,
  getTaskPlacementScope,
  taskBelongsToOwnership,
} from '../../../features/taskWorkbench/taskPlacementCommand';
import {
  buildTaskParentIndex,
  getTaskMoveOrderingPlan,
  isValidTaskDropIntent,
  type TaskDropIntent,
  type TaskMoveOrderingPlan,
} from './taskDropIntent';

/**
 * Builds the canonical local update set for an already validated move intent.
 * The authoritative provider still owns durable placement commits; this pure
 * helper only normalizes affected sibling orders for the local-test path.
 */
export const normalizeTaskMoveUpdates = (
  draggedNodeId: string,
  intent: TaskDropIntent,
  nodesRecord: Record<string, TaskNode>,
  orderingPlan?: TaskMoveOrderingPlan | null,
): BatchNodeUpdates => {
  const draggedNode = nodesRecord[draggedNodeId];
  if (!draggedNode) return {};
  if (orderingPlan) {
    const updates: BatchNodeUpdates = {};
    const now = Date.now();
    const destinationIds = orderingPlan.destinationSiblingIds;
    const sourceIds = orderingPlan.sourceScopeKey === orderingPlan.destinationScopeKey
      ? destinationIds
      : orderingPlan.sourceSiblingIds;
    sourceIds.forEach((id, index) => {
      updates[id] = { ...(updates[id] || {}), order: index };
    });
    destinationIds.forEach((id, index) => {
      updates[id] = { ...(updates[id] || {}), order: index };
    });
    updates[draggedNodeId] = {
      ...(updates[draggedNodeId] || {}),
      parentId: intent.parentId,
      nodeType: intent.nodeType ?? draggedNode.nodeType,
      updatedAt: now,
    };
    return updates;
  }
  const originalParentIndex = buildTaskParentIndex(nodesRecord);
  const movedNodes = {
    ...nodesRecord,
    [draggedNodeId]: {
      ...nodesRecord[draggedNodeId],
      parentId: intent.parentId,
      nodeType: intent.nodeType,
      order: intent.order,
    },
  };
  const movedParentIndex = buildTaskParentIndex(movedNodes);
  const affectedParentKeys = Array.from(new Set([
    getPlacementScopeKey(getTaskPlacementScope(draggedNode)),
    getPlacementScopeKey(getTaskPlacementScope(movedNodes[draggedNodeId])),
  ]));
  const updates: BatchNodeUpdates = {};

  affectedParentKeys.forEach((parentKey) => {
    const ids = parentKey === getPlacementScopeKey(getTaskPlacementScope(movedNodes[draggedNodeId]))
      ? (movedParentIndex[parentKey] || [])
      : (originalParentIndex[parentKey] || []).filter((id) => id !== draggedNodeId);
    ids.forEach((id, index) => {
      updates[id] = { ...(updates[id] || {}), order: index };
    });
  });

  updates[draggedNodeId] = {
    ...(updates[draggedNodeId] || {}),
    parentId: intent.parentId,
    nodeType: intent.nodeType,
    updatedAt: Date.now(),
  };
  return updates;
};

export const buildTaskSiblingMoveUpdates = (
  nodeId: string,
  anchorId: string,
  position: 'before' | 'after',
  nodes: Record<string, TaskNode>,
): BatchNodeUpdates | null => {
  const node = nodes[nodeId];
  const anchor = nodes[anchorId];
  if (!node || !anchor || node.id === anchor.id || node.isArchived || anchor.isArchived
    || !taskBelongsToOwnership(anchor, getTaskOwnershipRef(node))) return null;

  const intent: TaskDropIntent = {
    parentId: anchor.parentId || null,
    order: anchor.order,
    displayPosition: position,
  };
  if (!isValidTaskDropIntent(nodeId, intent, nodes)) return null;
  const move = getTaskMoveOrderingPlan(node, anchor, intent, nodes);
  if (!move) return null;
  if (move.isOriginOrder) return {};
  const updates = normalizeTaskMoveUpdates(nodeId, intent, nodes, move.ordering);
  // A move writes only the hierarchy fields. The provider supplies timestamps.
  delete updates[nodeId].updatedAt;
  return updates;
};
