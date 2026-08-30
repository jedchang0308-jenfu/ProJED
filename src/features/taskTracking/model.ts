import type { TaskNode } from '../../types';
import { TaskTrackingError } from './errors';
import type {
  TaskProjectionNode,
  TaskTrackingReference,
} from './types';

export const PRIMARY_PLACEMENT_PREFIX = 'primary:';

export const primaryPlacementId = (taskId: string) => `${PRIMARY_PLACEMENT_PREFIX}${taskId}`;

export const isPrimaryPlacementId = (placementId: string) => placementId.startsWith(PRIMARY_PLACEMENT_PREFIX);

export const createTrackingReferenceId = () =>
  `tracking_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

export const toPrimaryPlacement = (task: TaskNode) => ({
  id: primaryPlacementId(task.id),
  taskId: task.id,
  workspaceId: task.workspaceId,
  boardId: task.boardId,
  parentPlacementId: task.parentId ? primaryPlacementId(task.parentId) : null,
  order: task.order,
  kanbanStageId: task.kanbanStageId,
  revision: 1,
});

export const activeTrackingReferences = (
  references: readonly TaskTrackingReference[],
  workspaceId?: string,
  boardId?: string,
) => references.filter(reference =>
  !reference.removedAt
  && (!workspaceId || reference.workspaceId === workspaceId)
  && (!boardId || reference.boardId === boardId)
);

/**
 * A projection is only valid while the canonical task and every canonical
 * ancestor remain active.  This mirrors the filter visibility rule and keeps
 * stale references from leaking a descendant of an archived source subtree.
 */
export const isCanonicalTaskEffectivelyVisible = (
  task: TaskNode | null | undefined,
  taskById: ReadonlyMap<string, TaskNode>,
) => {
  if (!task || task.isArchived) return false;
  const visited = new Set<string>([task.id]);
  let parentId = task.parentId || null;
  while (parentId) {
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent || parent.isArchived) return false;
    parentId = parent.parentId || null;
  }
  return true;
};

export const getReferenceSubtree = (
  references: readonly TaskTrackingReference[],
  rootPlacementId: string,
) => {
  const active = activeTrackingReferences(references);
  const byParent = new Map<string | null, TaskTrackingReference[]>();
  active.forEach(reference => {
    const siblings = byParent.get(reference.parentPlacementId) ?? [];
    siblings.push(reference);
    byParent.set(reference.parentPlacementId, siblings);
  });
  const result: TaskTrackingReference[] = [];
  const visit = (placementId: string) => {
    const reference = active.find(item => item.id === placementId);
    if (!reference) return;
    result.push(reference);
    (byParent.get(reference.id) ?? [])
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .forEach(child => visit(child.id));
  };
  visit(rootPlacementId);
  return result;
};

export const assertTrackingReferenceInvariant = (
  references: readonly TaskTrackingReference[],
  sourceTask: TaskNode,
  input: { boardId: string; parentPlacementId: string | null },
) => {
  if (sourceTask.workspaceId !== references.find(reference => reference.taskId === sourceTask.id)?.workspaceId
      && references.some(reference => reference.taskId === sourceTask.id)) {
    throw new TaskTrackingError('CROSS_WORKSPACE_UNSUPPORTED', '追蹤副本必須位於同一工作區。');
  }
  if (input.boardId.trim() === '') throw new TaskTrackingError('NOT_FOUND', '目標看板不存在。');
  const duplicate = activeTrackingReferences(references).some(reference =>
    reference.taskId === sourceTask.id
    && reference.boardId === input.boardId
    && reference.parentPlacementId === input.parentPlacementId
  );
  if (duplicate) throw new TaskTrackingError('DUPLICATE_REFERENCE', '同一任務在相同位置已有追蹤副本。');
};

export const buildProjectionNodes = (
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
  boardId: string,
  access: { canEditCanonicalTask: boolean; canManageReferenceHere: boolean },
): TaskProjectionNode[] => {
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const primaries = tasks
    .filter(task => task.boardId === boardId && isCanonicalTaskEffectivelyVisible(task, taskById))
    .map(task => {
      const placement = toPrimaryPlacement(task);
      return {
        placementId: placement.id,
        taskId: task.id,
        placementKind: 'primary' as const,
        workspaceId: task.workspaceId,
        boardId: task.boardId,
        parentPlacementId: placement.parentPlacementId,
        order: placement.order,
        kanbanStageId: placement.kanbanStageId,
        task,
        access: { canRead: true as const, ...access },
      };
    });
  const projections = activeTrackingReferences(references, undefined, boardId)
    .map(reference => {
      const task = taskById.get(reference.taskId);
      if (!task || !isCanonicalTaskEffectivelyVisible(task, taskById)) return null;
      return {
        placementId: reference.id,
        taskId: reference.taskId,
        placementKind: 'tracking_reference' as const,
        workspaceId: reference.workspaceId,
        boardId: reference.boardId,
        parentPlacementId: reference.parentPlacementId,
        order: reference.order,
        kanbanStageId: reference.kanbanStageId,
        task: { ...task, boardId: reference.boardId },
        access: { canRead: true as const, ...access },
      };
    })
    .filter(Boolean) as TaskProjectionNode[];
  return [...primaries, ...projections].sort((a, b) => a.order - b.order || a.placementId.localeCompare(b.placementId));
};

/**
 * Timeline/workbench surfaces identify a task by canonical taskId, therefore
 * a task shown through several placements is deliberately collapsed to one
 * row.  A source task that is not in the active board is represented by a
 * read-only board-local clone whose id remains the canonical task id.
 */
export const buildCollapsedProjectionTasks = (
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
  boardId: string,
): TaskNode[] => {
  const result = new Map<string, TaskNode>();
  const taskById = new Map(tasks.map(task => [task.id, task]));
  tasks
    .filter(task => task.boardId === boardId && isCanonicalTaskEffectivelyVisible(task, taskById))
    .forEach(task => result.set(task.id, task));
  const referenceById = new Map(activeTrackingReferences(references).map(reference => [reference.id, reference]));
  activeTrackingReferences(references, undefined, boardId).forEach(reference => {
    const task = tasks.find(item => item.id === reference.taskId);
    if (!task || !isCanonicalTaskEffectivelyVisible(task, taskById) || result.has(task.id)) return;
    const parentPlacement = reference.parentPlacementId;
    const parentId = parentPlacement
      ? parentPlacement.startsWith(PRIMARY_PLACEMENT_PREFIX)
        ? parentPlacement.slice(PRIMARY_PLACEMENT_PREFIX.length)
        : referenceById.get(parentPlacement)?.taskId ?? null
      : null;
    result.set(task.id, {
      ...task,
      boardId,
      parentId,
      order: reference.order,
      kanbanStageId: reference.kanbanStageId,
      isTrackingReference: true,
      trackingReferenceId: reference.id,
      trackingReferenceParentPlacementId: reference.parentPlacementId,
    });
  });
  return [...result.values()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
};

/**
 * Workbench is a cross-board task surface: a canonical task with any number
 * of visible placements still renders once. Prefer the primary placement when
 * it is available; otherwise retain the first visible reference projection so
 * a derived-only reader can still see the task without source-board access.
 */
export const buildWorkbenchProjectionTasks = (
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
  boardIds: readonly string[],
): TaskNode[] => {
  const byTaskId = new Map<string, TaskNode>();
  boardIds.forEach(boardId => {
    buildCollapsedProjectionTasks(tasks, references, boardId).forEach(task => {
      const existing = byTaskId.get(task.id);
      if (!existing || (existing.isTrackingReference && !task.isTrackingReference)) {
        byTaskId.set(task.id, task);
      }
    });
  });
  return [...byTaskId.values()].sort((left, right) => (
    (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)
  ));
};

/**
 * Mind Map (like Board/List) is a placement surface: a task may appear more
 * than once when it is tracked under different parents in the same board.
 * References therefore receive a stable placement-scoped `id` while the
 * canonical task identity remains available as `canonicalTaskId` for details
 * and mutation guards.  Timeline/workbench consumers must continue using
 * buildCollapsedProjectionTasks so one task still produces one time/workbench
 * row there.
 */
export const buildExpandedProjectionTasks = (
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
  boardId: string,
): TaskNode[] => {
  if (!boardId) return [];
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const referenceById = new Map(activeTrackingReferences(references).map(reference => [reference.id, reference]));
  const primaryTasks = tasks
    .filter(task => task.boardId === boardId && isCanonicalTaskEffectivelyVisible(task, taskById))
    .map(task => ({ ...task }));
  const referenceTasks = activeTrackingReferences(references, undefined, boardId)
    .map(reference => {
      const task = taskById.get(reference.taskId);
      if (!task || !isCanonicalTaskEffectivelyVisible(task, taskById)) return null;
      const parentPlacementId = reference.parentPlacementId;
      const parentId = parentPlacementId
        ? parentPlacementId.startsWith(PRIMARY_PLACEMENT_PREFIX)
          ? parentPlacementId.slice(PRIMARY_PLACEMENT_PREFIX.length)
          : referenceById.get(parentPlacementId)?.id ?? null
        : null;
      return {
        ...task,
        id: reference.id,
        boardId: reference.boardId,
        parentId,
        order: reference.order,
        kanbanStageId: reference.kanbanStageId,
        isTrackingReference: true,
        trackingReferenceId: reference.id,
        trackingReferenceParentPlacementId: reference.parentPlacementId,
        // Ephemeral only; never persisted as part of the canonical task.
        canonicalTaskId: task.id,
      } as TaskNode & { canonicalTaskId: string };
    })
    .filter(Boolean) as TaskNode[];
  return [...primaryTasks, ...referenceTasks]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
};

export const buildProjectionParentIndex = (tasks: readonly TaskNode[]) => tasks.reduce<Record<string, string[]>>((index, task) => {
  const key = task.parentId || 'root';
  index[key] = [...(index[key] ?? []), task.id];
  return index;
}, {});

/**
 * Filter consumers that still render the canonical WBS rows need a board-local
 * task shape for a cross-board reference.  The clone is only a filter input;
 * callers must continue to read and mutate the canonical task by taskId.
 */
export const buildTaskFilterNodesWithTrackingReferences = (
  tasks: readonly TaskNode[],
  references: readonly TaskTrackingReference[],
  boardId: string,
) => {
  const nodes = Object.fromEntries(tasks.map(task => [task.id, task])) as Record<string, TaskNode>;
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const referenceById = new Map(activeTrackingReferences(references).map(reference => [reference.id, reference]));

  activeTrackingReferences(references, undefined, boardId).forEach(reference => {
    const task = taskById.get(reference.taskId);
    if (!task || !isCanonicalTaskEffectivelyVisible(task, taskById) || task.boardId === boardId) return;
    const parentPlacementId = reference.parentPlacementId;
    const parentId = parentPlacementId
      ? parentPlacementId.startsWith(PRIMARY_PLACEMENT_PREFIX)
        ? taskById.get(parentPlacementId.slice(PRIMARY_PLACEMENT_PREFIX.length))?.boardId === boardId
          ? parentPlacementId.slice(PRIMARY_PLACEMENT_PREFIX.length)
          : null
        : referenceById.get(parentPlacementId)?.taskId ?? null
      : null;
    nodes[task.id] = {
      ...task,
      boardId,
      parentId,
      order: reference.order,
      kanbanStageId: reference.kanbanStageId,
    };
  });

  return nodes;
};
