import React from 'react';
import { KanbanInsertionMarker } from '../KanbanInsertionMarker';
import type {
  TaskDragIndicatorAxis,
  TaskDragIndicatorRect,
} from './taskDragTypes';

export type DesktopTaskInsertionIndicatorProps = {
  indicatorRect: TaskDragIndicatorRect;
  axis?: TaskDragIndicatorAxis;
  targetNodeId?: string | null;
  position?: string | null;
  surfaceKind?: string | null;
  feedbackKind?: 'standard' | 'child' | 'origin';
  presentation?: 'kanban-marker' | 'surface-preview';
  /** Optional compatibility/test attributes owned by the surface adapter. */
  markerDataAttributes?: React.HTMLAttributes<HTMLDivElement>
    & Record<`data-${string}`, string | number | undefined>;
};

/**
 * Stateless desktop insertion-line presenter. Geometry and drop semantics stay
 * in the surface adapter; this component only renders the shared Kanban marker
 * with a stable metadata contract for browser/QC evidence.
 */
export const DesktopTaskInsertionIndicator: React.FC<DesktopTaskInsertionIndicatorProps> = ({
  indicatorRect,
  axis = 'horizontal',
  targetNodeId = null,
  position = null,
  surfaceKind = null,
  feedbackKind = 'standard',
  presentation = 'kanban-marker',
  markerDataAttributes,
}) => {
  const isVertical = axis === 'vertical';
  return (
    <div
      {...markerDataAttributes}
      className={`pointer-events-none fixed z-[95] ${isVertical ? '' : '-translate-y-1/2'} ${markerDataAttributes?.className || ''}`.trim()}
      style={{
        left: indicatorRect.left,
        top: indicatorRect.top,
        width: indicatorRect.width,
        ...(isVertical && indicatorRect.height !== undefined ? { height: indicatorRect.height } : {}),
        ...markerDataAttributes?.style,
      }}
      data-desktop-task-insertion-indicator="true"
      data-desktop-task-insertion-axis={axis}
      data-desktop-task-insertion-target={targetNodeId || undefined}
      data-desktop-task-insertion-position={position || undefined}
      data-desktop-task-insertion-surface-kind={surfaceKind || undefined}
      data-desktop-task-insertion-feedback={feedbackKind}
      data-desktop-task-insertion-presentation={presentation}
    >
      {presentation === 'kanban-marker' ? (
        <KanbanInsertionMarker axis={axis} compact className={isVertical ? '' : 'py-0'} />
      ) : null}
    </div>
  );
};

/** Shared presentation layer for desktop drag feedback. It never reads or
 * mutates task state; callers provide the already-presented overlay frame. */
export const DesktopTaskDragLayer: React.FC<{
  children?: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  if (!children) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-[100] ${className}`.trim()}
      data-desktop-task-drag-layer="true"
    >
      {children}
    </div>
  );
};

export default DesktopTaskDragLayer;
