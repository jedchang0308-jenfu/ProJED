import type { TaskNode } from '../types';
import { matchesTaskFilters } from '../features/taskFilters';
import type { TaskFilterState } from '../features/taskFilters/types';

export type HierarchicalTaskViewItem = TaskNode & {
  type: 'list' | 'card' | 'checklist';
  level: number;
  row: number;
};

export type HierarchicalTaskGroup = {
  start: number;
  end: number;
  id: string;
  level: number;
  startDate?: string;
  endDate?: string;
};

type BuildHierarchicalTaskItemsArgs = {
  nodes: Record<string, TaskNode>;
  parentNodesIndex: Record<string, string[]>;
  activeBoardId: string | null | undefined;
  taskFilters: TaskFilterState;
  collapsedIds: ReadonlySet<string>;
};

export const buildHierarchicalTaskItems = ({
  nodes,
  parentNodesIndex,
  activeBoardId,
  taskFilters,
  collapsedIds,
}: BuildHierarchicalTaskItemsArgs): {
  items: HierarchicalTaskViewItem[];
  groups: HierarchicalTaskGroup[];
} => {
  if (!activeBoardId) return { items: [], groups: [] };

  const items: HierarchicalTaskViewItem[] = [];
  const groups: HierarchicalTaskGroup[] = [];
  let currentRow = 0;

  const traverse = (nodeId: string, level: number) => {
    const node = nodes[nodeId];
    if (!node || node.isArchived || node.boardId !== activeBoardId) return -1;
    if (!matchesTaskFilters(node, taskFilters)) return -1;

    const startRow = currentRow;
    const type = level === 0 ? 'list' : level === 1 ? 'card' : 'checklist';
    items.push({
      ...node,
      type,
      row: currentRow++,
      level,
    });

    const isCollapsed = collapsedIds.has(nodeId);
    const childIds = parentNodesIndex[nodeId] || [];
    if (!isCollapsed && childIds.length > 0) {
      childIds
        .map(id => nodes[id])
        .filter((child): child is TaskNode => Boolean(child))
        .sort((left, right) => left.order - right.order)
        .forEach(child => traverse(child.id, level + 1));
    }

    const endRow = currentRow - 1;
    if (endRow > startRow && (!isCollapsed || childIds.length > 0)) {
      groups.push({
        start: startRow,
        end: endRow,
        id: node.id,
        level,
        startDate: node.startDate,
        endDate: node.endDate,
      });
    }

    return startRow;
  };

  const rootIds = parentNodesIndex[activeBoardId] || [];
  const orphanRootIds = parentNodesIndex.root || [];
  const rootNodes = Array.from(new Set([...rootIds, ...orphanRootIds]))
    .map(id => nodes[id])
    .filter((node): node is TaskNode => Boolean(node) && !node.isArchived && node.boardId === activeBoardId)
    .sort((left, right) => left.order - right.order);

  rootNodes.forEach(rootNode => traverse(rootNode.id, 0));

  return { items, groups };
};

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
