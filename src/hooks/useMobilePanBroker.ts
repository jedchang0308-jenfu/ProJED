import React from 'react';
import { isCoarsePointer, isTaskPrimaryActionTarget } from '../utils/taskInteractions';
import {
  getKanbanPinchDistance,
  resolveKanbanPinchTarget,
  type KanbanPinchPhase,
  type KanbanViewSize,
  type KanbanViewSizeChangeOrigin,
} from '../features/kanbanViewSize/kanbanViewSize';

interface MobilePanState {
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  horizontalSurface: HTMLElement | null;
  verticalSurface: HTMLElement | null;
  canScrollX: boolean;
  canScrollY: boolean;
  active: boolean;
}

interface PinchState {
  phase: KanbanPinchPhase;
  initialDistance: number;
  currentDistance: number;
  centerX: number;
  centerY: number;
  committed: boolean;
  originTarget: EventTarget | null;
  startViewSize: KanbanViewSize;
}

interface UseMobilePanBrokerOptions<TElement extends HTMLElement> {
  surfaceRef: React.MutableRefObject<TElement | null>;
  enabled?: boolean;
  viewSize?: KanbanViewSize;
  requestViewSize?: (next: KanbanViewSize, origin: KanbanViewSizeChangeOrigin) => boolean;
  cancelActiveTaskDrag?: () => void;
}

const PAN_THRESHOLD_PX = 8;

const isTaskDragTouchActive = () =>
  typeof document !== 'undefined' && document.body.hasAttribute('data-task-drag-touch-active');
const canScrollHorizontally = (element: HTMLElement | null) =>
  Boolean(element && element.scrollWidth > element.clientWidth + 2);
const canScrollVertically = (element: HTMLElement | null) =>
  Boolean(element && element.scrollHeight > element.clientHeight + 2);
const findVerticalSurface = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-mobile-pan-surface="kanban-column"]') as HTMLElement | null;
};
const isMobilePanPassThroughTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('[data-mobile-pan-pass-through="true"]'));
const recordMobilePanDebug = (entry: Record<string, unknown>) => {
  if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
  const debugWindow = window as any;
  debugWindow.__projedMobilePanDebug = [
    ...(debugWindow.__projedMobilePanDebug || []),
    { ...entry, at: Date.now() },
  ].slice(-80);
};
const setPinchBodyState = (active: boolean) => {
  if (typeof document === 'undefined') return;
  if (active) document.body.setAttribute('data-kanban-pinch-active', 'true');
  else document.body.removeAttribute('data-kanban-pinch-active');
};

export const useMobilePanBroker = <TElement extends HTMLElement>({
  surfaceRef,
  enabled = false,
  viewSize = 'compact',
  requestViewSize,
  cancelActiveTaskDrag,
}: UseMobilePanBrokerOptions<TElement>) => {
  const panStateRef = React.useRef<MobilePanState | null>(null);
  const pinchStateRef = React.useRef<PinchState | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const suppressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = React.useRef({ enabled, viewSize, requestViewSize, cancelActiveTaskDrag });

  React.useLayoutEffect(() => {
    optionsRef.current = { enabled, viewSize, requestViewSize, cancelActiveTaskDrag };
  }, [cancelActiveTaskDrag, enabled, requestViewSize, viewSize]);

  React.useEffect(() => {
    const horizontalSurface = surfaceRef.current;
    if (!horizontalSurface) return undefined;
    const clearSuppressTimer = () => {
      if (!suppressTimerRef.current) return;
      clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = null;
    };
    const scheduleSuppressReset = () => {
      clearSuppressTimer();
      suppressTimerRef.current = setTimeout(() => {
        suppressNextClickRef.current = false;
        suppressTimerRef.current = null;
      }, 700);
    };
    const reset = (reason = 'reset') => {
      if (panStateRef.current?.active || pinchStateRef.current) {
        suppressNextClickRef.current = true;
        scheduleSuppressReset();
      }
      recordMobilePanDebug({ type: 'reset', reason, wasPanActive: Boolean(panStateRef.current?.active), pinchPhase: pinchStateRef.current?.phase || 'idle' });
      panStateRef.current = null;
      pinchStateRef.current = null;
      horizontalSurface.setAttribute('data-kanban-pinch-state', 'idle');
      setPinchBodyState(false);
    };
    const startPinch = (event: TouchEvent) => {
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) return false;
      const target = event.target;
      const passThrough = isMobilePanPassThroughTarget(target);
      const protectedTarget = isTaskPrimaryActionTarget(target) && !passThrough;
      if (isTaskDragTouchActive()) {
        optionsRef.current.cancelActiveTaskDrag?.();
        reset('multitouch-task-drag');
        pinchStateRef.current = { phase: 'wait-all-release', initialDistance: 0, currentDistance: 0, centerX: 0, centerY: 0, committed: false, originTarget: target, startViewSize: optionsRef.current.viewSize };
        horizontalSurface.setAttribute('data-kanban-pinch-state', 'wait-all-release');
        setPinchBodyState(true);
        return true;
      }
      if (!optionsRef.current.enabled || protectedTarget) {
        reset('multitouch-protected');
        pinchStateRef.current = { phase: 'wait-all-release', initialDistance: 0, currentDistance: 0, centerX: 0, centerY: 0, committed: false, originTarget: target, startViewSize: optionsRef.current.viewSize };
        horizontalSurface.setAttribute('data-kanban-pinch-state', 'wait-all-release');
        setPinchBodyState(true);
        return true;
      }
      const distance = getKanbanPinchDistance(first, second);
      pinchStateRef.current = {
        phase: 'candidate', initialDistance: distance, currentDistance: distance,
        centerX: (first.clientX + second.clientX) / 2, centerY: (first.clientY + second.clientY) / 2,
        committed: false, originTarget: target, startViewSize: optionsRef.current.viewSize,
      };
      panStateRef.current = null;
      horizontalSurface.setAttribute('data-kanban-pinch-state', 'candidate');
      setPinchBodyState(true);
      recordMobilePanDebug({ type: 'pinch:candidate', distance, viewSize: optionsRef.current.viewSize });
      return true;
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        startPinch(event);
        if (event.cancelable) event.preventDefault();
        return;
      }
      const passThrough = isMobilePanPassThroughTarget(event.target);
      const primaryActionTarget = isTaskPrimaryActionTarget(event.target);
      const blockedByControl = primaryActionTarget && !passThrough;
      recordMobilePanDebug({ type: 'touchstart', touchCount: event.touches.length, primaryActionTarget, passThrough, coarse: isCoarsePointer(), blockedByControl });
      if (!isCoarsePointer() || event.touches.length !== 1 || blockedByControl || pinchStateRef.current) {
        reset('touchstart-blocked');
        return;
      }
      const touch = event.touches[0];
      const verticalSurface = findVerticalSurface(event.target);
      const canScrollX = canScrollHorizontally(horizontalSurface);
      const canScrollY = canScrollVertically(verticalSurface);
      if (!canScrollX && !canScrollY) {
        reset('no-scroll-surface');
        return;
      }
      panStateRef.current = { startX: touch.clientX, startY: touch.clientY, startScrollLeft: horizontalSurface.scrollLeft, startScrollTop: verticalSurface?.scrollTop ?? 0, horizontalSurface, verticalSurface, canScrollX, canScrollY, active: false };
    };
    const moveAtPoint = (point: { clientX: number; clientY: number }, event: TouchEvent | PointerEvent, input: 'touch' | 'pointer') => {
      if (isTaskDragTouchActive()) {
        if (event.cancelable) event.preventDefault();
        reset(`${input}-task-drag-owner`);
        return;
      }
      const state = panStateRef.current;
      if (!state) return;
      const deltaX = point.clientX - state.startX;
      const deltaY = point.clientY - state.startY;
      const wantsHorizontalPan = state.canScrollX && Math.abs(deltaX) > PAN_THRESHOLD_PX;
      const wantsVerticalPan = state.canScrollY && Math.abs(deltaY) > PAN_THRESHOLD_PX;
      if (!state.active && !wantsHorizontalPan && !wantsVerticalPan) return;
      state.active = true;
      suppressNextClickRef.current = true;
      if (event.cancelable) event.preventDefault();
      if (state.canScrollX && state.horizontalSurface) state.horizontalSurface.scrollLeft = state.startScrollLeft - deltaX;
      if (state.canScrollY && state.verticalSurface) state.verticalSurface.scrollTop = state.startScrollTop - deltaY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const pinch = pinchStateRef.current;
      if (pinch) {
        if (event.touches.length !== 2 || pinch.phase === 'wait-all-release') {
          if (event.cancelable) event.preventDefault();
          return;
        }
        const currentDistance = getKanbanPinchDistance(event.touches[0], event.touches[1]);
        pinch.currentDistance = currentDistance;
        const next = resolveKanbanPinchTarget({ viewSize: pinch.startViewSize, initialDistance: pinch.initialDistance, currentDistance, touchCount: event.touches.length, alreadyCommitted: pinch.committed });
        if (next && optionsRef.current.requestViewSize) {
          const changed = optionsRef.current.requestViewSize(next, { kind: 'pinch', clientX: pinch.centerX, clientY: pinch.centerY, target: pinch.originTarget });
          if (changed) {
            pinch.committed = true;
            pinch.phase = 'committed';
            horizontalSurface.setAttribute('data-kanban-pinch-state', 'committed');
            recordMobilePanDebug({ type: 'pinch:committed', next, currentDistance, initialDistance: pinch.initialDistance });
          }
        }
        if (event.cancelable) event.preventDefault();
        return;
      }
      const touch = event.touches[0];
      if (touch) moveAtPoint(touch, event, 'touch');
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        if (pinchStateRef.current) pinchStateRef.current.phase = 'wait-all-release';
        if (pinchStateRef.current) horizontalSurface.setAttribute('data-kanban-pinch-state', 'wait-all-release');
        return;
      }
      reset('touchend-all-release');
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || document.body.hasAttribute('data-kanban-pinch-active')) return;
      moveAtPoint(event, event, 'pointer');
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && !document.body.hasAttribute('data-kanban-pinch-active')) reset('pointer-end');
    };
    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClickRef.current = false;
      clearSuppressTimer();
    };
    const handleAbort = (event: Event) => reset(event.type);
    const activeCaptureOptions = { passive: false, capture: true } as AddEventListenerOptions;
    const clickCaptureOptions = { capture: true } as AddEventListenerOptions;
    horizontalSurface.addEventListener('touchstart', handleTouchStart, activeCaptureOptions);
    horizontalSurface.addEventListener('touchmove', handleTouchMove, activeCaptureOptions);
    horizontalSurface.addEventListener('touchend', handleTouchEnd, activeCaptureOptions);
    horizontalSurface.addEventListener('touchcancel', handleAbort, activeCaptureOptions);
    horizontalSurface.addEventListener('click', handleClickCapture, clickCaptureOptions);
    window.addEventListener('pointermove', handlePointerMove, activeCaptureOptions);
    window.addEventListener('pointerup', handlePointerEnd, clickCaptureOptions);
    window.addEventListener('pointercancel', handlePointerEnd, clickCaptureOptions);
    window.addEventListener('blur', handleAbort);
    window.addEventListener('pagehide', handleAbort);
    window.addEventListener('orientationchange', handleAbort);
    window.addEventListener('resize', handleAbort);
    document.addEventListener('visibilitychange', handleAbort);
    return () => {
      clearSuppressTimer();
      reset('unmount');
      horizontalSurface.removeEventListener('touchstart', handleTouchStart, activeCaptureOptions);
      horizontalSurface.removeEventListener('touchmove', handleTouchMove, activeCaptureOptions);
      horizontalSurface.removeEventListener('touchend', handleTouchEnd, activeCaptureOptions);
      horizontalSurface.removeEventListener('touchcancel', handleAbort, activeCaptureOptions);
      horizontalSurface.removeEventListener('click', handleClickCapture, clickCaptureOptions);
      window.removeEventListener('pointermove', handlePointerMove, activeCaptureOptions);
      window.removeEventListener('pointerup', handlePointerEnd, clickCaptureOptions);
      window.removeEventListener('pointercancel', handlePointerEnd, clickCaptureOptions);
      window.removeEventListener('blur', handleAbort);
      window.removeEventListener('pagehide', handleAbort);
      window.removeEventListener('orientationchange', handleAbort);
      window.removeEventListener('resize', handleAbort);
      document.removeEventListener('visibilitychange', handleAbort);
    };
  }, [surfaceRef]);
};
