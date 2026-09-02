import type React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import type { TaskNode } from '../../types';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import { primaryPlacementId } from '../../features/taskTracking/model';
import { useTaskPlacementPermissions } from '../../hooks/useTaskPlacementPermissions';
import { useTaskInteractionBinding } from '../../interactions/task/useTaskInteractionBinding';
import type { TaskCommandDependencies } from '../../interactions/task/taskCommandExecutor';
import type { TaskInteractionOrigin, TaskInteractionSurfaceId, TaskTransientOwner } from '../../interactions/task/types';
import { useTaskGestureSurface } from './taskDrag/useTaskGestureSurface';
import type { TaskDragSourceKind } from './taskDrag/taskDragTypes';
import { isTaskPrimaryActionTarget } from '../../utils/taskInteractions';

export const useTaskPlacementController = ({
  task,
  reference,
  surfaceId,
  sortableType,
  sortableData,
  sourceKind = null,
  origin,
  commandDependencies,
  interactionDisabled = false,
  transientOwners = [],
}: {
  task: TaskNode;
  reference?: TaskTrackingReference | null;
  surfaceId: TaskInteractionSurfaceId;
  sortableType: string;
  sortableData?: Record<string, unknown>;
  sourceKind?: TaskDragSourceKind | null;
  origin?: TaskInteractionOrigin;
  commandDependencies?: TaskCommandDependencies;
  interactionDisabled?: boolean;
  transientOwners?: readonly TaskTransientOwner[];
}) => {
  const permissions = useTaskPlacementPermissions(task, reference);
  const placementId = reference?.id || primaryPlacementId(task.id);
  const placementKind = reference ? 'tracking_reference' as const : 'primary' as const;
  const interactionBinding = useTaskInteractionBinding({
    taskId: task.id,
    title: task.title,
    trackingReferenceId: reference?.id,
    placementContext: {
      taskId: task.id,
      placementId,
      placementKind,
      boardId: reference?.boardId || task.boardId,
      parentPlacementId: reference?.parentPlacementId
        ?? (task.parentId ? primaryPlacementId(task.parentId) : null),
      canEditCanonicalTask: permissions.canEditTask,
      canManageReferenceHere: permissions.canManageTaskReference,
    },
    surfaceId,
    origin,
    nodeRole: task.nodeType || 'task',
    transientOwners,
    commandDependencies,
  });
  const taskGesture = useTaskGestureSurface({
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      placementId,
      placementKind,
      boardId: reference?.boardId || task.boardId,
      trackingReferenceId: reference?.id,
      canEditCanonicalTask: permissions.canEditTask,
      canCreateCanonicalTask: permissions.canCreateTask,
      canDeleteCanonicalTask: permissions.canDeleteTask,
    },
    sourceKind,
    disabled: interactionDisabled || !permissions.canDragPlacement,
    onNonMobileLongPress: event => {
      event.preventDefault();
      const touch = event.touches[0];
      if (touch) void interactionBinding.openMenu({ x: touch.clientX, y: touch.clientY });
    },
  });
  const sortable = useSortable({
    id: placementId,
    disabled: interactionDisabled
      || !permissions.canDragPlacement
      || taskGesture.mobileActionMode
      || taskGesture.isPlacementPending,
    data: {
      type: sortableType,
      nodeId: task.id,
      item: task,
      title: task.title,
      placementId,
      placementKind,
      trackingReference: reference || undefined,
      ...sortableData,
    },
  });
  const activationProps = {
    tabIndex: 0,
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
      if (interactionDisabled || isTaskPrimaryActionTarget(event.target)) return;
      event.preventDefault();
      void interactionBinding.dispatch('pointer.double');
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (interactionDisabled || isTaskPrimaryActionTarget(event.target)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        void interactionBinding.dispatch('keyboard.enter');
      } else if (event.key === ' ') {
        event.preventDefault();
        void interactionBinding.dispatch('keyboard.space');
      } else if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        void interactionBinding.openMenu({ x: rect.left + 12, y: rect.top + 12 });
      }
    },
  };

  return {
    activationProps,
    interactionBinding,
    permissions,
    placementId,
    placementKind,
    sortable,
    taskGesture,
  };
};
