import type { TaskNode } from '../../../types';

export const collectTaskDragDescendantIds = (
  sourceNodeId: string,
  parentNodesIndex: Record<string, string[]>,
  nodesRecord: Record<string, TaskNode>,
): string[] => {
  const descendants: string[] = [];
  const visited = new Set<string>([sourceNodeId]);
  const pending = [...(parentNodesIndex[sourceNodeId] || [])].reverse();

  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodesRecord[nodeId];
    if (!node || node.isArchived) continue;

    descendants.push(nodeId);
    const childIds = parentNodesIndex[nodeId] || [];
    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      pending.push(childIds[index]);
    }
  }

  return descendants;
};
