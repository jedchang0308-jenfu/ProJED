import type { TaskNode } from '../types';

export const buildAncestorPath = (
  node: TaskNode | undefined,
  nodes: Record<string, TaskNode>,
): TaskNode[] => {
  if (!node?.parentId) return [];

  const ancestors: TaskNode[] = [];
  const seenAncestorIds = new Set<string>();
  let currentParentId: string | null = node.parentId;

  while (currentParentId) {
    if (seenAncestorIds.has(currentParentId)) break;
    seenAncestorIds.add(currentParentId);

    const parent: TaskNode | undefined = nodes[currentParentId];
    if (!parent || parent.isArchived) break;

    ancestors.unshift(parent);
    currentParentId = parent.parentId;
  }

  return ancestors;
};

export const formatTaskLocation = (
  node: TaskNode | undefined,
  nodes: Record<string, TaskNode>,
  fallback = '未命名任務',
) => {
  const ancestorPath = buildAncestorPath(node, nodes);
  return ancestorPath.length > 0
    ? ancestorPath.map(ancestor => ancestor.title || '未命名任務').join(' / ')
    : node?.title || fallback;
};
