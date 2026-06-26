import type { TaskNode } from '../../types';
import { matchesAssigneeFilter, matchesDueDateFilter } from '../../utils/taskFilters';
import { matchesTagFilters } from '../../utils/tags';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';

type PositionedTaskNode = TaskNode & { mindMapSide?: MindMapDirection };
export type SideOverrides = Record<string, MindMapDirection>;

export interface MindMapFilterState {
  statusFilters: Record<string, boolean>;
  dueWithinDays: number | null;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
}

const getParentKey = (parentId: string | null) => parentId || 'root';

const sortTasks = (tasks: TaskNode[]) => [...tasks].sort((a, b) => a.order - b.order);

const matchesMindMapFilters = (node: TaskNode, filters: MindMapFilterState) =>
  Boolean(filters.statusFilters[node.status || 'todo']) &&
  matchesDueDateFilter(node, filters.dueWithinDays) &&
  matchesAssigneeFilter(node, filters.selectedAssigneeIds) &&
  matchesTagFilters(node, filters.selectedTagIds);

export const getSiblingNodes = (
  nodes: Record<string, TaskNode>,
  parentNodesIndex: Record<string, string[]>,
  parentId: string | null,
  boardId: string,
) =>
  sortTasks(
    (parentNodesIndex[getParentKey(parentId)] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode => Boolean(node) && node.boardId === boardId && !node.isArchived),
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
  filters: MindMapFilterState,
) => {
  if (!boardId) return [];
  const readRootBucket = (bucketId: string) =>
    (parentNodesIndex[bucketId] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode =>
        Boolean(node) &&
        node.boardId === boardId &&
        !node.isArchived &&
        matchesMindMapFilters(node, filters),
      );
  const deduped = new Map<string, TaskNode>();
  [...readRootBucket('root'), ...readRootBucket(boardId)].forEach(node => deduped.set(node.id, node));
  return sortTasks(Array.from(deduped.values()));
};

export const getMindMapChildren = (
  nodes: Record<string, TaskNode>,
  parentNodesIndex: Record<string, string[]>,
  boardId: string,
  filters: MindMapFilterState,
  nodeId: string,
) =>
  sortTasks(
    (parentNodesIndex[nodeId] || [])
      .map(id => nodes[id])
      .filter((node): node is TaskNode =>
        Boolean(node) &&
        !node.isArchived &&
        node.boardId === boardId &&
        matchesMindMapFilters(node, filters),
      ),
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
