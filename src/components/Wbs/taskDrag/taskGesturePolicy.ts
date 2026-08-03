import type { TaskDragSourceKind } from './taskDragTypes';

export const TASK_GESTURE_LONG_PRESS_MS = 500;
export const TASK_GESTURE_PAN_TOLERANCE_PX = 8;

const TASK_DRAG_SUPPRESSED_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[data-task-interaction-control="true"]',
  '[data-task-primary-action-control="true"]',
  '[data-task-title-input="true"]',
  '[data-filter-menu-panel]',
  '[data-tag-picker-panel]',
  '.global-dialog-content',
].join(',');

export const isTaskGestureInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest(TASK_DRAG_SUPPRESSED_SELECTOR));

export const isMobileTaskActionMode = () => {
  if (typeof window === 'undefined') return false;
  const isNarrowViewport = window.innerWidth <= 768;
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const hasTouchPoints = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  return isNarrowViewport && (hasCoarsePointer || hasTouchPoints);
};

export const canStartTaskDragSource = ({
  kind,
  canMoveTask,
}: {
  kind: TaskDragSourceKind;
  canMoveTask: boolean;
}) => canMoveTask && kind !== undefined;

export const canUseTaskSurfaceLongPress = ({
  mobileActionEnabled,
  hasFallback,
}: {
  mobileActionEnabled: boolean;
  hasFallback: boolean;
}) => mobileActionEnabled || hasFallback;

