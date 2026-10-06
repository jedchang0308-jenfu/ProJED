import type { TaskNode } from '../../types';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';

type PositionedTaskNode = TaskNode & { mindMapSide?: MindMapDirection };
export type SideOverrides = Record<string, MindMapDirection>;

const getParentKey = (parentId: string | null) => parentId || 'root';

const sortTasks = (tasks: TaskNode[]) => [...tasks].sort((a, b) => a.order - b.order);

const getIndexedTasks = (
  nodes: Record<string, TaskNode>,
  indexedIds: string[],
  boardId: string,
) => {
  const deduped = new Map<string, TaskNode>();
  indexedIds.forEach((id) => {
    const node = nodes[id];
    if (node && node.boardId === boardId && !node.isArchived) deduped.set(node.id, node);
  });
  return Array.from(deduped.values());
};

export const getSiblingNodes = (
  nodes: Record<string, TaskNode>,
  parentNodesIndex: Record<string, string[]>,
  parentId: string | null,
  boardId: string,
) =>
  sortTasks(
    getIndexedTasks(nodes, parentNodesIndex[getParentKey(parentId)] || [], boardId),
  );

export const getInsertOrder = (
  siblings: TaskNode[],
  targetId: string,
  mode: Extract<MindMapDropMode, 'before' | 'after'>,
) => {
  const targetIndex = siblings.findIndex(node => node.id === targetId);
  if (targetIndex < 0) return siblings.length;
  const target = siblings[targetIndex];
  if (mode === 'before') {
    const previous = siblings[targetIndex - 1];
    return previous ? (previous.order + target.order) / 2 : target.order - 1;
  }
  const next = siblings[targetIndex + 1];
  return next ? (target.order + next.order) / 2 : target.order + 1;
};

export const getMindMapRootNodes = (
  nodes: Record<string, TaskNode>,
  parentNodesIndex: Record<string, string[]>,
  boardId: string,
  visibleTaskIds: ReadonlySet<string>,
) => {
  if (!boardId) return [];
  const readRootBucket = (bucketId: string) =>
    (parentNodesIndex[bucketId] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode =>
        Boolean(node) &&
        node.boardId === boardId &&
        !node.isArchived &&
        visibleTaskIds.has(node.id),
      );
  const deduped = new Map<string, TaskNode>();
  [...readRootBucket('root'), ...readRootBucket(boardId)].forEach(node => deduped.set(node.id, node));
  return sortTasks(Array.from(deduped.values()));
};

export const getMindMapChildren = (
  nodes: Record<string, TaskNode>,
  parentNodesIndex: Record<string, string[]>,
  boardId: string,
  visibleTaskIds: ReadonlySet<string>,
  nodeId: string,
) =>
  sortTasks(
    getIndexedTasks(nodes, parentNodesIndex[nodeId] || [], boardId)
      .filter(node => visibleTaskIds.has(node.id)),
  );

export const getMindMapRootAncestorId = (
  nodes: Record<string, TaskNode>,
  nodeId: string,
) => {
  let current = nodes[nodeId];
  const visited = new Set<string>();
  while (current?.parentId && nodes[current.parentId] && !visited.has(current.id)) {
    visited.add(current.id);
    current = nodes[current.parentId];
  }
  return current?.id || nodeId;
};

export const wouldCreateMindMapCycle = (
  nodes: Record<string, TaskNode>,
  draggedId: string,
  newParentId: string | null,
) => {
  if (!newParentId) return false;
  if (draggedId === newParentId) return true;
  const visited = new Set<string>([draggedId]);
  let current: string | null = newParentId;
  while (current) {
    if (current === draggedId || visited.has(current)) return true;
    visited.add(current);
    current = nodes[current]?.parentId || null;
  }
  return false;
};

export const splitRootNodes = (
  nodes: TaskNode[],
  sideOverrides: SideOverrides,
): { left: PositionedTaskNode[]; right: PositionedTaskNode[] } => {
  const left: PositionedTaskNode[] = [];
  const right: PositionedTaskNode[] = [];
  sortTasks(nodes).forEach((node, index) => {
    const side = sideOverrides[node.id] || (index % 2 === 0 ? 'right' : 'left');
    if (side === 'right') {
      right.push({ ...node, mindMapSide: 'right' });
    } else {
      left.push({ ...node, mindMapSide: 'left' });
    }
  });
  return { left, right };
};
