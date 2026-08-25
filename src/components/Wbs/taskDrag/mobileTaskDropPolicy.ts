import type { MobileTaskDropPosition } from './taskDragTypes';

export const MOBILE_TASK_EDGE_HYSTERESIS_PX = 12;

export const resolveMobileTaskEdgePosition = ({
  pointerY,
  taskTop,
  taskBottom,
  previousPosition = null,
  hysteresisPx = MOBILE_TASK_EDGE_HYSTERESIS_PX,
}: {
  pointerY: number;
  taskTop: number;
  taskBottom: number;
  previousPosition?: MobileTaskDropPosition | null;
  hysteresisPx?: number;
}): MobileTaskDropPosition => {
  const taskHeight = Math.max(0, taskBottom - taskTop);
  const midpoint = taskTop + taskHeight / 2;
  // Preserve reachable before/after edge zones on compact checklist rows.
  // A fixed band can otherwise exceed half the row and latch the entry side.
  const effectiveHysteresis = Math.min(Math.max(0, hysteresisPx), taskHeight / 4);
  if (previousPosition === 'before') {
    return pointerY > midpoint + effectiveHysteresis ? 'after' : 'before';
  }
  if (previousPosition === 'after') {
    return pointerY < midpoint - effectiveHysteresis ? 'before' : 'after';
  }
  return pointerY <= midpoint ? 'before' : 'after';
};
