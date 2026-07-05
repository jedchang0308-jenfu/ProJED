import React from 'react';
import { isCoarsePointer, isTaskPrimaryActionTarget } from '../utils/taskInteractions';

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

const PAN_THRESHOLD_PX = 8;

const canScrollHorizontally = (element: HTMLElement | null) =>
  Boolean(element && element.scrollWidth > element.clientWidth + 2);

const canScrollVertically = (element: HTMLElement | null) =>
  Boolean(element && element.scrollHeight > element.clientHeight + 2);

const findVerticalSurface = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-mobile-pan-surface="kanban-column"]') as HTMLElement | null;
};

export const useMobilePanBroker = <TElement extends HTMLElement>() => {
  const surfaceRef = React.useRef<TElement | null>(null);
  const panStateRef = React.useRef<MobilePanState | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const suppressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const reset = () => {
      if (panStateRef.current?.active) {
        suppressNextClickRef.current = true;
        scheduleSuppressReset();
      }
      panStateRef.current = null;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!isCoarsePointer() || event.touches.length !== 1 || isTaskPrimaryActionTarget(event.target)) {
        reset();
        return;
      }

      const touch = event.touches[0];
      const verticalSurface = findVerticalSurface(event.target);
      const canScrollX = canScrollHorizontally(horizontalSurface);
      const canScrollY = canScrollVertically(verticalSurface);

      if (!canScrollX && !canScrollY) {
        reset();
        return;
      }

      panStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollLeft: horizontalSurface.scrollLeft,
        startScrollTop: verticalSurface?.scrollTop ?? 0,
        horizontalSurface,
        verticalSurface,
        canScrollX,
        canScrollY,
        active: false,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const state = panStateRef.current;
      const touch = event.touches[0];
      if (!state || !touch) return;

      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;
      const wantsHorizontalPan = state.canScrollX && Math.abs(deltaX) > PAN_THRESHOLD_PX;
      const wantsVerticalPan = state.canScrollY && Math.abs(deltaY) > PAN_THRESHOLD_PX;

      if (!state.active && !wantsHorizontalPan && !wantsVerticalPan) return;

      state.active = true;
      suppressNextClickRef.current = true;
      if (event.cancelable) event.preventDefault();

      if (state.canScrollX && state.horizontalSurface) {
        state.horizontalSurface.scrollLeft = state.startScrollLeft - deltaX;
      }

      if (state.canScrollY && state.verticalSurface) {
        state.verticalSurface.scrollTop = state.startScrollTop - deltaY;
      }
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClickRef.current = false;
      clearSuppressTimer();
    };

    horizontalSurface.addEventListener('touchstart', handleTouchStart, { passive: true });
    horizontalSurface.addEventListener('touchmove', handleTouchMove, { passive: false });
    horizontalSurface.addEventListener('touchend', reset, { passive: true });
    horizontalSurface.addEventListener('touchcancel', reset, { passive: true });
    horizontalSurface.addEventListener('click', handleClickCapture, true);

    return () => {
      clearSuppressTimer();
      horizontalSurface.removeEventListener('touchstart', handleTouchStart);
      horizontalSurface.removeEventListener('touchmove', handleTouchMove);
      horizontalSurface.removeEventListener('touchend', reset);
      horizontalSurface.removeEventListener('touchcancel', reset);
      horizontalSurface.removeEventListener('click', handleClickCapture, true);
    };
  }, []);

  return surfaceRef;
};
