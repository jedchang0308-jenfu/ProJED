import React from 'react';

const MOBILE_BOARD_PAN_QUERY = '(max-width: 640px), (hover: none) and (pointer: coarse)';
const DEFAULT_THRESHOLD = 10;
const CLICK_SUPPRESS_MS = 700;

const INTERACTIVE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[data-task-title-input="true"]',
  '[data-task-drag-handle="true"]',
  '[data-task-interaction-control="true"]',
  '[data-board-share-dialog]',
  '[data-task-details-modal="true"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-radix-popper-content-wrapper]',
].join(',');

const PAN_ALLOWED_INTERACTIVE_SELECTOR = '[data-mobile-board-pan-allow="true"]';

type MobileBoardPanGesture = {
  active: boolean;
  panned: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  columnSurface: HTMLElement | null;
};

const isElement = (target: EventTarget | null): target is Element => target instanceof Element;

const getClosestHTMLElement = (target: EventTarget | null, selector: string) => {
  if (!isElement(target)) return null;
  const element = target.closest(selector);
  return element instanceof HTMLElement ? element : null;
};

const getTargetLabel = (target: EventTarget | null) => {
  if (getClosestHTMLElement(target, '.kanban-checklist-item')) return 'checklist';
  if (getClosestHTMLElement(target, '.kanban-task-card')) return 'card';
  if (getClosestHTMLElement(target, '[data-mobile-pan-surface="kanban-column"]')) return 'column';
  return 'board';
};

const shouldIgnoreTarget = (target: EventTarget | null) => (
  !isElement(target) ||
  (
    Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR)) &&
    !target.closest(PAN_ALLOWED_INTERACTIVE_SELECTOR)
  )
);

const isMobileBoardPanEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth <= 640) return true;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_BOARD_PAN_QUERY).matches;
};

type UseMobileBoardDragScrollOptions = {
  threshold?: number;
};

export const useMobileBoardDragScroll = (
  surfaceRef: React.RefObject<HTMLElement | null>,
  options: UseMobileBoardDragScrollOptions = {},
) => {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  React.useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof window === 'undefined') return undefined;

    let gesture: MobileBoardPanGesture | null = null;
    let suppressNextClick = false;
    let suppressTimer: number | null = null;

    const clearSuppressTimer = () => {
      if (suppressTimer !== null) {
        window.clearTimeout(suppressTimer);
        suppressTimer = null;
      }
    };

    const clearClickSuppression = () => {
      suppressNextClick = false;
      clearSuppressTimer();
      surface.removeAttribute('data-mobile-board-pan-suppressed-click');
    };

    const scheduleClickSuppression = () => {
      suppressNextClick = true;
      surface.setAttribute('data-mobile-board-pan-suppressed-click', 'true');
      clearSuppressTimer();
      suppressTimer = window.setTimeout(clearClickSuppression, CLICK_SUPPRESS_MS);
    };

    const finishGesture = () => {
      const shouldSuppressClick = Boolean(gesture?.panned);
      gesture = null;
      surface.removeAttribute('data-mobile-board-pan-active');
      if (shouldSuppressClick) scheduleClickSuppression();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!isMobileBoardPanEnabled() || event.touches.length !== 1 || shouldIgnoreTarget(event.target)) {
        gesture = null;
        return;
      }

      const touch = event.touches[0];
      const columnSurface = getClosestHTMLElement(event.target, '[data-mobile-pan-surface="kanban-column"]');
      gesture = {
        active: false,
        panned: false,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        columnSurface,
      };
      surface.setAttribute('data-mobile-board-pan-last-target', getTargetLabel(event.target));
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const totalX = touch.clientX - gesture.startX;
      const totalY = touch.clientY - gesture.startY;
      const hasPassedThreshold = Math.hypot(totalX, totalY) > threshold;
      if (!gesture.active && !hasPassedThreshold) return;

      event.preventDefault();
      const deltaX = touch.clientX - gesture.lastX;
      const deltaY = touch.clientY - gesture.lastY;

      surface.scrollLeft -= deltaX;
      if (gesture.columnSurface) {
        gesture.columnSurface.scrollTop -= deltaY;
      }

      gesture.active = true;
      gesture.panned = true;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      surface.setAttribute('data-mobile-board-pan-active', 'true');
      surface.setAttribute('data-mobile-board-pan-delta-x', String(Math.round(totalX)));
      surface.setAttribute('data-mobile-board-pan-delta-y', String(Math.round(totalY)));
    };

    const handleTouchEnd = () => {
      finishGesture();
    };

    const handleTouchCancel = () => {
      finishGesture();
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      clearClickSuppression();
    };

    surface.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    surface.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    surface.addEventListener('touchend', handleTouchEnd, { capture: true });
    surface.addEventListener('touchcancel', handleTouchCancel, { capture: true });
    surface.addEventListener('click', handleClickCapture, true);

    return () => {
      clearSuppressTimer();
      surface.removeAttribute('data-mobile-board-pan-active');
      surface.removeAttribute('data-mobile-board-pan-suppressed-click');
      surface.removeEventListener('touchstart', handleTouchStart, { capture: true });
      surface.removeEventListener('touchmove', handleTouchMove, { capture: true });
      surface.removeEventListener('touchend', handleTouchEnd, { capture: true });
      surface.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
      surface.removeEventListener('click', handleClickCapture, true);
    };
  }, [surfaceRef, threshold]);
};
