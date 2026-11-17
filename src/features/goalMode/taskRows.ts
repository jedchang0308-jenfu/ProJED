import type { TaskNode } from '../../types';
import type { HierarchicalTaskViewItem } from '../../utils/taskHierarchy';
import { buildTaskPlacementTreeRows } from '../../components/Wbs/TaskPlacementTree';
import { isCanonicalTaskEffectivelyVisible } from '../taskTracking/model';
import type { TaskTrackingReference } from '../taskTracking/types';

export type GoalTaskRow = HierarchicalTaskViewItem & {
  rowId: string;
  rowParentId: string | null;
  reference?: TaskTrackingReference;
  hasChildren: boolean;
};

export function buildGoalTaskRows({
  nodes, parentNodesIndex, boardId, visibleTaskIds, collapsedIds, references,
}: {
  nodes: Record<string, TaskNode>;
  parentNodesIndex: Record<string, string[]>;
  boardId: string;
  visibleTaskIds: ReadonlySet<string>;
  collapsedIds: ReadonlySet<string>;
  references: readonly TaskTrackingReference[];
}): GoalTaskRow[] {
  const rows: GoalTaskRow[] = [];
  const visited = new Set<string>();
  const referencesByParent = new Map<string | null, TaskTrackingReference[]>();
  if (references.length) {
    const tasksById = new Map(Object.values(nodes).map(task => [task.id, task]));
    for (const reference of references) {
      if (reference.boardId !== boardId || reference.removedAt || !visibleTaskIds.has(reference.taskId)) continue;
      const task = nodes[reference.taskId];
      if (!task || !isCanonicalTaskEffectivelyVisible(task, tasksById)) continue;
      const group = referencesByParent.get(reference.parentPlacementId) ?? [];
      group.push(reference);
      referencesByParent.set(reference.parentPlacementId, group);
    }
  }
  const visit = (primaryIds: readonly string[], parentPlacementId: string | null, rowParentId: string | null, level: number) => {
    const primaryTasks = primaryIds.flatMap(id => {
      const task = nodes[id];
      return task?.boardId === boardId && visibleTaskIds.has(id) ? [task] : [];
    });
    for (const { task, reference, placementId } of buildTaskPlacementTreeRows({
      primaryTasks, trackingReferences: referencesByParent.get(parentPlacementId) ?? [], tasksById: nodes, parentPlacementId,
    })) {
      if (visited.has(placementId)) continue;
      visited.add(placementId);
      const rowId = reference?.id ?? task.id;
      const childIds = reference ? [] : parentNodesIndex[task.id] ?? [];
      const type = level === 0 ? 'list' : level === 1 ? 'card' : 'checklist';
      rows.push({
        ...task, rowId, rowParentId, reference, type, row: rows.length, level,
        hasChildren: childIds.length > 0 || referencesByParent.has(placementId),
      });
      if (!collapsedIds.has(rowId)) visit(childIds, placementId, rowId, level + 1);
    }
  };
  visit([...(parentNodesIndex[boardId] ?? []), ...(parentNodesIndex.root ?? [])], null, null, 0);
  return rows;
}
