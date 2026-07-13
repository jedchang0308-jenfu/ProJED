import React from 'react';
import { isTaskPrimaryActionTarget, isTextInputTarget } from '../utils/taskInteractions';

interface KanbanMousePanState {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  active: boolean;
}

const PAN_THRESHOLD_PX = 6;

const BLOCKED_MOUSE_PAN_SELECTOR = [
  '[data-task-drag-surface="true"]',
  '[data-task-interaction-control="true"]',
  '[data-task-primary-action-control="true"]',
  '[data-task-title-input="true"]',
  '[data-filter-menu-panel]',
  '[data-tag-picker-panel]',
  '.global-dialog-content',
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
].join(',');

const canScrollHorizontally = (element: HTMLElement | null) =>
  Boolean(element && element.scrollWidth > element.clientWidth + 2);

const isBlockedMousePanTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  if (isTaskPrimaryActionTarget(target) || isTextInputTarget(target)) return true;
  if (target.closest(BLOCKED_MOUSE_PAN_SELECTOR)) return true;
  const selection = document.getSelection();
  return Boolean(selection && selection.type === 'Range');
};

const isNativeScrollbarPointer = (surface: HTMLElement, event: PointerEvent) => {
  const rect = surface.getBoundingClientRect();
  const horizontalScrollbarZone = surface.scrollWidth > surface.clientWidth && event.clientY >= rect.bottom - 12;
  const verticalScrollbarZone = surface.scrollHeight > surface.clientHeight && event.clientX >= rect.right - 12;
  return horizontalScrollbarZone || verticalScrollbarZone;
};

const recordKanbanMousePanDebug = (entry: Record<string, unknown>) => {
  if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
  const debugWindow = window as any;
  debugWindow.__projedKanbanMousePanDebug = [
    ...(debugWindow.__projedKanbanMousePanDebug || []),
    { ...entry, at: Date.now() },
  ].slice(-40);
};

export const useKanbanMousePan = <TElement extends HTMLElement>() => {
  const surfaceRef = React.useRef<TElement | null>(null);
  const panStateRef = React.useRef<KanbanMousePanState | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const suppressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;

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
      }, 500);
    };

    const setStateAttribute = (state: 'idle' | 'armed' | 'active') => {
      surface.setAttribute('data-kanban-mouse-pan-state', state);
      if (state === 'active') {
        document.body.setAttribute('data-kanban-mouse-pan-active', 'true');
      } else {
        document.body.removeAttribute('data-kanban-mouse-pan-active');
      }
    };

    const reset = () => {
      const wasActive = Boolean(panStateRef.current?.active);
      if (wasActive) {
        suppressNextClickRef.current = true;
        scheduleSuppressReset();
      }
      recordKanbanMousePanDebug({ type: 'reset', wasActive, scrollLeft: surface.scrollLeft });
      panStateRef.current = null;
      setStateAttribute('idle');
    };

    const handlePointerDown = (event: PointerEvent) => {
      const blocked = (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.pointerType !== 'mouse' ||
        !canScrollHorizontally(surface) ||
        isBlockedMousePanTarget(event.target) ||
        isNativeScrollbarPointer(surface, event)
      );

      recordKanbanMousePanDebug({
        type: 'pointerdown',
        blocked,
        pointerType: event.pointerType,
        target: event.target instanceof Element ? event.target.tagName : null,
        canScrollX: canScrollHorizontally(surface),
      });

      if (blocked) {
        panStateRef.current = null;
        setStateAttribute('idle');
        return;
      }

      panStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: surface.scrollLeft,
        active: false,
      };
      setStateAttribute('armed');
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const wantsHorizontalPan = absX >= PAN_THRESHOLD_PX && absX > absY * 1.15;

      if (!state.active && !wantsHorizontalPan) {
        if (absY >= PAN_THRESHOLD_PX && absY > absX) reset();
        return;
      }

      if (!state.active) {
        state.active = true;
        setStateAttribute('active');
      }

      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      surface.scrollLeft = state.startScrollLeft - deltaX;
      recordKanbanMousePanDebug({
        type: 'pointermove',
        deltaX,
        deltaY,
        scrollLeft: surface.scrollLeft,
      });
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      reset();
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClickRef.current = false;
      clearSuppressTimer();
    };

    setStateAttribute('idle');

    surface.addEventListener('pointerdown', handlePointerDown, true);
    surface.addEventListener('click', handleClickCapture, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    window.addEventListener('blur', reset);

    return () => {
      clearSuppressTimer();
      document.body.removeAttribute('data-kanban-mouse-pan-active');
      surface.removeEventListener('pointerdown', handlePointerDown, true);
      surface.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return surfaceRef;
};
