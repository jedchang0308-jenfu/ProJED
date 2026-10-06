import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { TaskNode } from '../../types';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import { primaryPlacementId } from '../../features/taskTracking/model';

export type TaskPlacementTreeRow = {
  task: TaskNode;
  reference?: TaskTrackingReference;
  order: number;
  placementId: string;
};

export const buildTaskPlacementTreeRows = ({
  primaryTasks,
  trackingReferences,
  tasksById,
  parentPlacementId,
}: {
  primaryTasks: readonly TaskNode[];
  trackingReferences: readonly TaskTrackingReference[];
  tasksById: Readonly<Record<string, TaskNode>>;
  parentPlacementId: string | null;
}): TaskPlacementTreeRow[] => {
  const rows = [
    ...primaryTasks.map(task => ({
      task,
      order: task.order,
      placementId: primaryPlacementId(task.id),
    })),
    ...trackingReferences
      .filter(reference => !reference.removedAt && reference.parentPlacementId === parentPlacementId)
      .map(reference => ({
        task: tasksById[reference.taskId],
        reference,
        order: reference.order,
        placementId: reference.id,
      }))
      .filter((row): row is TaskPlacementTreeRow & { reference: TaskTrackingReference } => Boolean(row.task)),
  ]
    .filter(row => !row.task.isArchived)
    .filter((row, index, allRows) => allRows.findIndex(candidate => candidate.placementId === row.placementId) === index)
    .sort((left, right) => left.order - right.order || left.placementId.localeCompare(right.placementId));
  return rows;
};

export const TaskPlacementTree: React.FC<{
  rows: readonly TaskPlacementTreeRow[];
  className?: string;
  children: (row: TaskPlacementTreeRow) => React.ReactNode;
}> = ({ rows, className, children }) => {
  if (rows.length === 0) return null;
  return (
    <div className={className} data-task-placement-tree="true">
      <SortableContext items={rows.map(row => row.placementId)} strategy={verticalListSortingStrategy}>
        {rows.map(row => (
          <React.Fragment key={row.placementId}>{children(row)}</React.Fragment>
        ))}
      </SortableContext>
    </div>
  );
};
