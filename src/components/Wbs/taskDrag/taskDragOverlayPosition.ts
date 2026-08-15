export const TASK_DRAG_OVERLAY_POINTER_GAP_PX = 16;
export const TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX = 8;

interface OverlayPositionInput {
  pointer: { x: number; y: number };
  overlay: { width: number; height: number };
  viewport: { left: number; top: number; width: number; height: number };
}

export interface PointerUpperRightOverlayPosition {
  left: number;
  top: number;
  placement: 'upper-right' | 'upper-left';
}

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), Math.max(min, max))
);

export const resolvePointerUpperRightOverlayPosition = ({
  pointer,
  overlay,
  viewport,
}: OverlayPositionInput): PointerUpperRightOverlayPosition => {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const minLeft = viewport.left + TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX;
  const maxLeft = viewportRight - TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX - overlay.width;
  const minTop = viewport.top + TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX;
  const maxTop = viewportBottom - TASK_DRAG_OVERLAY_VIEWPORT_MARGIN_PX - overlay.height;
  const preferredRight = pointer.x + TASK_DRAG_OVERLAY_POINTER_GAP_PX;
  const canFitUpperRight = preferredRight <= maxLeft;
  const horizontalCandidate = canFitUpperRight
    ? preferredRight
    : pointer.x - TASK_DRAG_OVERLAY_POINTER_GAP_PX - overlay.width;

  return {
    left: clamp(horizontalCandidate, minLeft, maxLeft),
    top: clamp(
      pointer.y - TASK_DRAG_OVERLAY_POINTER_GAP_PX - overlay.height,
      minTop,
      maxTop,
    ),
    placement: canFitUpperRight ? 'upper-right' : 'upper-left',
  };
};
