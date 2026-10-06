import type { TaskNode } from '../../../types';
import type { BatchNodeUpdates } from '../../../store/useWbsStore';
import { collectTaskDragDescendantIds } from './taskDragScope';

const buildSubtreeParentIndex = (nodesRecord: Record<string, TaskNode>) => {
  const parentIndex: Record<string, string[]> = {};
  Object.values(nodesRecord)
    .filter(node => node && !node.isArchived && Boolean(node.parentId))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .forEach((node) => {
      const parentId = node.parentId as string;
      parentIndex[parentId] = [...(parentIndex[parentId] || []), node.id];
    });
  return parentIndex;
};

export const buildTaskSubtreePlacementUpdates = ({
  rootNode,
  nodesRecord,
  targetWorkspaceId,
  targetBoardId,
  rootParentId,
  rootOrder,
  rootNodeType,
  persistenceOrder,
}: {
  rootNode: TaskNode;
  nodesRecord: Record<string, TaskNode>;
  targetWorkspaceId?: string;
  targetBoardId: string;
  rootParentId: string | null;
  rootOrder: number;
  rootNodeType?: TaskNode['nodeType'];
  persistenceOrder: 'root-first' | 'leaves-first';
}): BatchNodeUpdates => {
  const parentIndex = buildSubtreeParentIndex(nodesRecord);
  const descendantIds = collectTaskDragDescendantIds(rootNode.id, parentIndex, nodesRecord)
    .filter((nodeId) => {
      const node = nodesRecord[nodeId];
      return Boolean(node)
        && node.boardId === rootNode.boardId
        && node.workspaceId === rootNode.workspaceId;
    });
  const orderedIds = persistenceOrder === 'leaves-first'
    ? [...descendantIds].reverse().concat(rootNode.id)
    : [rootNode.id, ...descendantIds];
  const now = Date.now();

  return Object.fromEntries(orderedIds.map((nodeId) => {
    const node = nodesRecord[nodeId];
    const isRoot = nodeId === rootNode.id;
    return [nodeId, {
      ...(targetWorkspaceId ? { workspaceId: targetWorkspaceId } : {}),
      boardId: targetBoardId,
      parentId: isRoot ? rootParentId : node.parentId,
      order: isRoot ? rootOrder : node.order,
      nodeType: isRoot ? (rootNodeType || node.nodeType || 'task') : (node.nodeType || 'task'),
      updatedAt: now,
    }];
  }));
};
