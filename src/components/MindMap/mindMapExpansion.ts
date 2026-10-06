import type { TaskNode } from '../../types';

export const addMindMapExpandedNodeIds = (
  expandedNodeIds: Set<string>,
  nodeIds: Array<string | null | undefined>,
) => {
  let next: Set<string> | null = null;
  nodeIds.forEach((nodeId) => {
    if (!nodeId || expandedNodeIds.has(nodeId)) return;
    next ??= new Set(expandedNodeIds);
    next.add(nodeId);
  });
  return next || expandedNodeIds;
};

export const addMindMapExpandedNodeId = (
  expandedNodeIds: Set<string>,
  nodeId: string | null | undefined,
) => addMindMapExpandedNodeIds(expandedNodeIds, [nodeId]);

export const toggleMindMapExpandedNodeId = (
  expandedNodeIds: Set<string>,
  nodeId: string,
) => {
  const next = new Set(expandedNodeIds);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  return next;
};

export const pruneMindMapExpandedNodeIds = (
  expandedNodeIds: Set<string>,
  validNodeIds: Set<string>,
) => {
  let next: Set<string> | null = null;
  expandedNodeIds.forEach((nodeId) => {
    if (validNodeIds.has(nodeId)) return;
    next ??= new Set(expandedNodeIds);
    next.delete(nodeId);
  });
  return next || expandedNodeIds;
};

export const getMindMapExpansionPath = (
  nodes: Record<string, TaskNode>,
  nodeId: string | null | undefined,
  boardId: string,
) => {
  if (!nodeId || !boardId) return [];
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = nodeId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current: TaskNode | undefined = nodes[currentId];
    if (!current || current.boardId !== boardId || current.isArchived) break;
    path.unshift(current.id);
    currentId = current.parentId;
  }

  return path;
};
