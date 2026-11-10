import type { TaskNode } from '../../types';

export const getParentSelection = (
  selectedNodeId: string,
  nodes: Record<string, TaskNode>,
) => {
  const selected = nodes[selectedNodeId];
  return selected?.parentId && nodes[selected.parentId] ? selected.parentId : null;
};

export const getFirstChildSelection = (children: TaskNode[]) => children[0]?.id || null;
