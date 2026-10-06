import type { TaskDropSurfaceKind } from './taskDragTypes';

const COMPLETE_TASK_SCOPE_SELECTOR = '[data-task-surface-scope="true"]';

export const findTaskOrderingGeometryElement = (
  targetElement: HTMLElement,
  targetSurfaceKind: TaskDropSurfaceKind,
) => {
  if (targetSurfaceKind !== 'kanban-card' && targetSurfaceKind !== 'checklist-row') return null;
  return targetElement.matches(COMPLETE_TASK_SCOPE_SELECTOR)
    ? targetElement
    : targetElement.closest<HTMLElement>(COMPLETE_TASK_SCOPE_SELECTOR);
};
