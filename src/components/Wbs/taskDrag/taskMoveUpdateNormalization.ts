import type { TaskNode } from '../../../types';
import type { BatchNodeUpdates } from '../../../store/useWbsStore';
import {
  getPlacementScopeKey,
  getTaskPlacementScope,
} from '../../../features/taskWorkbench/taskPlacementCommand';
import { buildTaskParentIndex, type TaskDropIntent } from './taskDropIntent';

/**
 * Builds the canonical local update set for an already validated move intent.
 * The authoritative provider still owns durable placement commits; this pure
 * helper only normalizes affected sibling orders for the local-test path.
 */
export const normalizeTaskMoveUpdates = (
  draggedNodeId: string,
  intent: TaskDropIntent,
  nodesRecord: Record<string, TaskNode>,
): BatchNodeUpdates => {
  const draggedNode = nodesRecord[draggedNodeId];
  if (!draggedNode) return {};
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
