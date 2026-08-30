import React from 'react';
import type { TaskNode } from '../../types';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import { primaryPlacementId } from '../../features/taskTracking/model';

type TaskSurfaceFrameProps = React.HTMLAttributes<HTMLDivElement> & {
  task: TaskNode;
  reference?: TaskTrackingReference | null;
  surfaceKind: 'wbs-list-row' | 'kanban-column' | 'kanban-card' | 'checklist-row';
};

/**
 * The only placement-kind visual branch. Task content, actions and gestures
 * are supplied by the same owning item component for primary and tracking.
 */
export const TaskSurfaceFrame = React.forwardRef<HTMLDivElement, TaskSurfaceFrameProps>(({
  task,
  reference,
  surfaceKind,
  className,
  style,
  children,
  ...props
}, forwardedRef) => {
  const placementId = reference?.id || primaryPlacementId(task.id);
  const trackingStyle = reference
    ? { borderStyle: 'dashed', borderWidth: 2, borderColor: 'rgb(196 181 253)' }
    : undefined;
  return (
    <div
      ref={forwardedRef}
      {...props}
      className={className}
      style={{ ...style, ...trackingStyle }}
      data-task-id={task.id}
      data-task-placement-id={placementId}
      data-task-placement-kind={reference ? 'tracking-reference' : 'primary'}
      data-task-placement-board-id={reference?.boardId || task.boardId}
      data-task-surface-frame="true"
      data-task-surface-frame-kind={surfaceKind}
      aria-label={reference ? `${task.title || '未命名任務'}，追蹤副本` : (props['aria-label'] || task.title || '未命名任務')}
    >
      {children}
    </div>
  );
});

TaskSurfaceFrame.displayName = 'TaskSurfaceFrame';
