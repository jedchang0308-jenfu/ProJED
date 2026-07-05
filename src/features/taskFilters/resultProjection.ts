import type { TaskNode } from '../../types';
import { matchesTaskFilters } from './predicates';
import type { TaskFilterState, TaskFilterableNode } from './types';

export type TaskFilterProjectionNode = Pick<
  TaskNode,
  'boardId' | 'id' | 'isArchived' | 'order' | 'parentId'
> & TaskFilterableNode;

export type TaskFilterResultProjection = {
  matchedTaskIds: Set<string>;
  visibleContainerIds: Set<string>;
  contextOnlyContainerIds: Set<string>;
  visibleTaskIds: Set<string>;
  boardTaskIds: Set<string>;
  matchedTasks: TaskFilterProjectionNode[];
  totalTaskCount: number;
};

type ProjectTaskFilterResultsOptions = {
  boardId?: string | null;
};

const isSameBoard = (node: Pick<TaskNode, 'boardId'>, boardId?: string | null) =>
  !boardId || node.boardId === boardId;

type EffectiveVisibilityNode = Pick<TaskNode, 'boardId' | 'id' | 'isArchived' | 'parentId'>;

const isStructuralRootParent = (parentId: string | null | undefined, boardId?: string | null) =>
  !parentId || parentId === 'root' || Boolean(boardId && parentId === boardId);

export const isTaskEffectivelyVisible = <T extends EffectiveVisibilityNode>(
  node: T | null | undefined,
  nodesById: Record<string, T | null | undefined>,
  options: ProjectTaskFilterResultsOptions = {},
): node is T => {
  if (!node || node.isArchived || !isSameBoard(node, options.boardId)) return false;

  const visited = new Set<string>([node.id]);
  let currentParentId = node.parentId || null;
  const boardId = options.boardId ?? node.boardId;

  while (currentParentId) {
    if (isStructuralRootParent(currentParentId, boardId)) return true;
    if (visited.has(currentParentId)) return false;
    visited.add(currentParentId);

    const parent = nodesById[currentParentId];
    if (!parent) return false;
    if (parent.isArchived) return false;
    if (!isSameBoard(parent, boardId)) return false;

    currentParentId = parent.parentId || null;
  }

  return true;
};

export const projectTaskFilterResults = <T extends TaskFilterProjectionNode>(
  nodesById: Record<string, T | null | undefined>,
  filters: TaskFilterState,
  options: ProjectTaskFilterResultsOptions = {},
): TaskFilterResultProjection => {
  const boardTaskIds = new Set<string>();
  const matchedTaskIds = new Set<string>();
  const visibleContainerIds = new Set<string>();
  const visibleTaskIds = new Set<string>();
  const matchedTasks: TaskFilterProjectionNode[] = [];
  const { boardId = null } = options;

  Object.values(nodesById).forEach(node => {
    if (!isTaskEffectivelyVisible(node, nodesById, { boardId })) return;
    boardTaskIds.add(node.id);
    if (matchesTaskFilters(node, filters)) {
      matchedTaskIds.add(node.id);
      matchedTasks.push(node);
    }
  });

  matchedTaskIds.forEach(taskId => {
    visibleTaskIds.add(taskId);

    let currentParentId = nodesById[taskId]?.parentId || null;
    const visited = new Set<string>([taskId]);

    while (currentParentId) {
      if (visited.has(currentParentId)) break;
      visited.add(currentParentId);

      const parent = nodesById[currentParentId];
      if (!parent || parent.isArchived || !isSameBoard(parent, boardId)) break;

      visibleContainerIds.add(parent.id);
      visibleTaskIds.add(parent.id);
      currentParentId = parent.parentId || null;
    }
  });

  const contextOnlyContainerIds = new Set<string>(
    Array.from(visibleContainerIds).filter(id => !matchedTaskIds.has(id)),
  );

  matchedTasks.sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

  return {
    matchedTaskIds,
    visibleContainerIds,
    contextOnlyContainerIds,
    visibleTaskIds,
    boardTaskIds,
    matchedTasks,
    totalTaskCount: boardTaskIds.size,
  };
};

export const isTaskVisibleInFilterProjection = (
  projection: TaskFilterResultProjection | null | undefined,
  taskId: string | null | undefined,
) => Boolean(taskId && projection?.visibleTaskIds.has(taskId));

export const isTaskMatchedInFilterProjection = (
  projection: TaskFilterResultProjection | null | undefined,
  taskId: string | null | undefined,
) => Boolean(taskId && projection?.matchedTaskIds.has(taskId));
