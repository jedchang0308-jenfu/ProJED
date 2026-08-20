import type { TaskNode } from '../../types';

export const collectMindMapDescendantIds = (
  nodeId: string,
  getChildren: (nodeId: string) => TaskNode[],
  visited = new Set<string>(),
): string[] => {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);
  return getChildren(nodeId).flatMap(child => [child.id, ...collectMindMapDescendantIds(child.id, getChildren, visited)]);
};

export const getNextSelectionAfterDelete = (
  selected: TaskNode,
  siblings: TaskNode[],
  nodes: Record<string, TaskNode>,
  rootNodes: TaskNode[],
  deletingIds: Set<string>,
) => {
  const previousSibling = siblings
    .filter(node => !deletingIds.has(node.id) && node.order < selected.order)
    .sort((a, b) => b.order - a.order)[0];
  const nextSibling = siblings
    .filter(node => !deletingIds.has(node.id) && node.order > selected.order)
    .sort((a, b) => a.order - b.order)[0];
  const parentCandidate = selected.parentId && nodes[selected.parentId] && !nodes[selected.parentId].isArchived
    ? nodes[selected.parentId]
    : null;
  const fallbackRoot = rootNodes.find(node => !deletingIds.has(node.id));
  return previousSibling?.id || parentCandidate?.id || nextSibling?.id || fallbackRoot?.id || null;
};

export const getParentSelection = (
  selectedNodeId: string,
  nodes: Record<string, TaskNode>,
) => {
  const selected = nodes[selectedNodeId];
  return selected?.parentId && nodes[selected.parentId] ? selected.parentId : null;
};

export const getFirstChildSelection = (children: TaskNode[]) => children[0]?.id || null;
