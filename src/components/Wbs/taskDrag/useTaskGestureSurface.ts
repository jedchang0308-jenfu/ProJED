import React from 'react';
import type { TaskStatus } from '../../../types';
import { useLongPress } from '../../../hooks/useLongPress';
import { useTouchTapGuard } from '../../../hooks/useTouchTapGuard';
import { MobileTaskActionContext } from '../mobileTaskActionContext';
import {
  canUseTaskSurfaceLongPress,
  isMobileTaskActionMode,
  isTaskGestureInteractiveTarget,
  TASK_GESTURE_LONG_PRESS_MS,
  TASK_GESTURE_PAN_TOLERANCE_PX,
} from './taskGesturePolicy';
import type { TaskDragSourceKind } from './taskDragTypes';

interface UseTaskGestureSurfaceOptions {
  task: { id: string; title?: string; status?: TaskStatus };
  sourceKind: TaskDragSourceKind | null;
  mobileActionEnabled?: boolean;
  disabled?: boolean;
  onNonMobileLongPress?: (event: React.TouchEvent) => void;
}

export const useTaskGestureSurface = ({
  task,
  sourceKind,
  mobileActionEnabled = true,
  disabled = false,
  onNonMobileLongPress,
}: UseTaskGestureSurfaceOptions) => {
  const mobileTaskAction = React.useContext(MobileTaskActionContext);
  const touchTapGuard = useTouchTapGuard({ threshold: TASK_GESTURE_PAN_TOLERANCE_PX });
  const [activeSurfaceHeight, setActiveSurfaceHeight] = React.useState<number | null>(null);
  const [mobileActionMode, setMobileActionMode] = React.useState(() => isMobileTaskActionMode());
  const isActive = mobileTaskAction?.state?.phase === 'dragging' && mobileTaskAction.state.nodeId === task.id;

  React.useEffect(() => {
    const update = () => setMobileActionMode(isMobileTaskActionMode());
    update();
    window.addEventListener('resize', update);
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    query?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      query?.removeEventListener?.('change', update);
    };
  }, []);

  const handleLongPress = React.useCallback((event: React.TouchEvent) => {
    if (disabled || isTaskGestureInteractiveTarget(event.target)) return;
    if (isMobileTaskActionMode() && mobileActionEnabled && sourceKind) {
      mobileTaskAction?.begin(task, event, sourceKind);
      return;
    }
    onNonMobileLongPress?.(event);
  }, [disabled, mobileActionEnabled, mobileTaskAction, onNonMobileLongPress, sourceKind, task]);

  const longPressHandlers = useLongPress(handleLongPress, {
    delay: TASK_GESTURE_LONG_PRESS_MS,
    tolerance: TASK_GESTURE_PAN_TOLERANCE_PX,
  });
  const shouldBindLongPress = !disabled && canUseTaskSurfaceLongPress({
    mobileActionEnabled,
    hasFallback: Boolean(onNonMobileLongPress),
  });

  const handlers = React.useMemo(() => ({
    onTouchStart: (event: React.TouchEvent) => {
      setActiveSurfaceHeight(event.currentTarget instanceof HTMLElement
        ? event.currentTarget.getBoundingClientRect().height
        : null);
      touchTapGuard.handlers.onTouchStart(event);
      if (shouldBindLongPress && !isTaskGestureInteractiveTarget(event.target)) {
        longPressHandlers.onTouchStart(event);
      }
    },
    onTouchMove: (event: React.TouchEvent) => {
      if (mobileTaskAction?.isActive(task.id)) {
        mobileTaskAction.move(event);
        return;
      }
      touchTapGuard.handlers.onTouchMove(event);
      if (shouldBindLongPress) longPressHandlers.onTouchMove(event);
    },
    onTouchEnd: (event: React.TouchEvent) => {
      if (mobileTaskAction?.isActive(task.id)) {
        touchTapGuard.handlers.onTouchEnd(event);
        mobileTaskAction.end(event);
        longPressHandlers.onTouchEnd(event);
        setActiveSurfaceHeight(null);
        return;
      }
      touchTapGuard.handlers.onTouchEnd(event);
      if (shouldBindLongPress) longPressHandlers.onTouchEnd(event);
      setActiveSurfaceHeight(null);
    },
    onTouchCancel: (event: React.TouchEvent) => {
      if (mobileTaskAction?.isActive(task.id)) {
        touchTapGuard.handlers.onTouchCancel(event);
        mobileTaskAction.cancel(event);
        longPressHandlers.onTouchCancel(event);
        setActiveSurfaceHeight(null);
        return;
      }
      touchTapGuard.handlers.onTouchCancel(event);
      if (shouldBindLongPress) longPressHandlers.onTouchCancel(event);
      setActiveSurfaceHeight(null);
    },
    onPointerDown: touchTapGuard.handlers.onPointerDown,
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch' || mobileTaskAction?.isActive(task.id)) return;
      touchTapGuard.handlers.onPointerMove(event);
      if (shouldBindLongPress) longPressHandlers.onPointerMove(event);
    },
    onPointerUp: (event: React.PointerEvent) => {
      touchTapGuard.handlers.onPointerUp(event);
      if (shouldBindLongPress) longPressHandlers.onPointerUp(event);
    },
    onPointerCancel: (event: React.PointerEvent) => {
      touchTapGuard.handlers.onPointerCancel(event);
      if (shouldBindLongPress) longPressHandlers.onPointerCancel(event);
    },
    onMouseDownCapture: shouldBindLongPress ? longPressHandlers.onMouseDownCapture : undefined,
    onContextMenuCapture: shouldBindLongPress ? (event: React.MouseEvent) => {
      if (isMobileTaskActionMode()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      longPressHandlers.onContextMenuCapture(event);
    } : undefined,
    onClickCapture: (event: React.MouseEvent) => {
      touchTapGuard.handlers.onClickCapture(event);
      if (shouldBindLongPress && !event.isPropagationStopped()) {
        longPressHandlers.onClickCapture(event);
      }
    },
  }), [longPressHandlers, mobileTaskAction, shouldBindLongPress, task.id, touchTapGuard.handlers]);

  return {
    handlers,
    mobileActionMode,
    isActive,
    activeSurfaceHeight: isActive ? activeSurfaceHeight : null,
    shouldSuppressTap: touchTapGuard.shouldSuppressTap,
  };
};
