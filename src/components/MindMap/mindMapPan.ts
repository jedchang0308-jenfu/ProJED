export interface MiddleMousePanState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface LeftMousePanState {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  active: boolean;
}

export interface LeftMousePanUpdate {
  active: boolean;
  scrollLeft: number;
  scrollTop: number;
}

interface MiddleMousePanVelocity {
  speedX: number;
  speedY: number;
}

const MIDDLE_MOUSE_PAN_DEAD_ZONE = 8;
const MIDDLE_MOUSE_PAN_MAX_SPEED = 36;
const MIDDLE_MOUSE_PAN_ACCELERATION = 0.075;
export const LEFT_MOUSE_PAN_THRESHOLD_PX = 6;

const LEFT_MOUSE_PAN_BLOCKED_SELECTOR = [
  '[data-mindmap-node]',
  '[data-mindmap-center]',
  '[data-mindmap-toggle-hover-target]',
  '[data-mindmap-quick-title-input="true"]',
  '[data-mindmap-note-relationship-click-target]',
  '[data-mindmap-note-relationship-line-click-target]',
  '[data-mindmap-note-relationship-curve-click-target]',
  '[data-mindmap-note-relationship-endpoint]',
  '[data-mindmap-note-relationship-control-point]',
  '[data-mindmap-note-relationship-style-panel]',
  '[data-task-interaction-control="true"]',
  '[data-task-primary-action-control="true"]',
  'input',
  'textarea',
  'select',
  'button',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
].join(',');

export const createLeftMousePanState = (
  pointerId: number,
  clientX: number,
  clientY: number,
  scrollLeft: number,
  scrollTop: number,
): LeftMousePanState => ({
  pointerId,
  startX: clientX,
  startY: clientY,
  startScrollLeft: scrollLeft,
  startScrollTop: scrollTop,
  active: false,
});

export const getLeftMousePanUpdate = (
  pan: LeftMousePanState,
  clientX: number,
  clientY: number,
): LeftMousePanUpdate => {
  const deltaX = clientX - pan.startX;
  const deltaY = clientY - pan.startY;
  const active = pan.active || Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= LEFT_MOUSE_PAN_THRESHOLD_PX;
  return {
    active,
    scrollLeft: pan.startScrollLeft - deltaX,
    scrollTop: pan.startScrollTop - deltaY,
  };
};

export const isLeftMousePanBlockedTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return true;
  if (target.closest(LEFT_MOUSE_PAN_BLOCKED_SELECTOR)) return true;
  const selection = document.getSelection();
  return Boolean(selection && selection.type === 'Range');
};

export const isMindMapNativeScrollbarPointer = (
  surface: HTMLElement,
  clientX: number,
  clientY: number,
) => {
  const rect = surface.getBoundingClientRect();
  const horizontalScrollbarZone = surface.scrollWidth > surface.clientWidth && clientY >= rect.bottom - 12;
  const verticalScrollbarZone = surface.scrollHeight > surface.clientHeight && clientX >= rect.right - 12;
  return horizontalScrollbarZone || verticalScrollbarZone;
};

export type LeftMousePanTelemetryState = 'idle' | 'armed' | 'active';

export const setLeftMousePanTelemetry = (
  surface: HTMLElement | null | undefined,
  state: LeftMousePanTelemetryState,
) => {
  surface?.setAttribute('data-mindmap-left-pan-state', state);
  if (typeof document === 'undefined') return;
  if (state === 'active') {
    document.body.setAttribute('data-mindmap-left-pan-active', 'true');
  } else {
    document.body.removeAttribute('data-mindmap-left-pan-active');
  }
};

export const clearLeftMousePanTelemetry = (surface: HTMLElement | null | undefined) => {
  setLeftMousePanTelemetry(surface, 'idle');
  surface?.removeAttribute('data-mindmap-left-pan-delta-x');
  surface?.removeAttribute('data-mindmap-left-pan-delta-y');
};

export const createMiddleMousePanState = (clientX: number, clientY: number): MiddleMousePanState => ({
  startX: clientX,
  startY: clientY,
  currentX: clientX,
  currentY: clientY,
});

export const updateMiddleMousePanPointer = (pan: MiddleMousePanState, clientX: number, clientY: number) => {
  pan.currentX = clientX;
  pan.currentY = clientY;
};

const getAxisVelocity = (distance: number) => {
  const magnitude = Math.abs(distance);
  if (magnitude <= MIDDLE_MOUSE_PAN_DEAD_ZONE) return 0;
  return Math.sign(distance) * Math.min(
    MIDDLE_MOUSE_PAN_MAX_SPEED,
    (magnitude - MIDDLE_MOUSE_PAN_DEAD_ZONE) * MIDDLE_MOUSE_PAN_ACCELERATION,
  );
};

export const getMiddleMousePanVelocity = (pan: MiddleMousePanState): MiddleMousePanVelocity => ({
  speedX: getAxisVelocity(pan.currentX - pan.startX),
  speedY: getAxisVelocity(pan.currentY - pan.startY),
});

export const markMiddleMousePanActive = (surface: HTMLElement) => {
  surface.setAttribute('data-mindmap-middle-pan-active', 'true');
  surface.setAttribute('data-mindmap-middle-pan-mode', 'velocity');
};

export const clearMiddleMousePanTelemetry = (surface: HTMLElement | null | undefined) => {
  surface?.removeAttribute('data-mindmap-middle-pan-active');
  surface?.removeAttribute('data-mindmap-middle-pan-mode');
  surface?.removeAttribute('data-mindmap-middle-pan-speed-x');
  surface?.removeAttribute('data-mindmap-middle-pan-speed-y');
};

export const applyMiddleMousePanFrame = (
  surface: HTMLElement,
  pan: MiddleMousePanState,
): MiddleMousePanVelocity => {
  const velocity = getMiddleMousePanVelocity(pan);
  if (velocity.speedX || velocity.speedY) {
    surface.scrollLeft += velocity.speedX;
    surface.scrollTop += velocity.speedY;
    surface.setAttribute('data-mindmap-middle-pan-speed-x', velocity.speedX.toFixed(2));
    surface.setAttribute('data-mindmap-middle-pan-speed-y', velocity.speedY.toFixed(2));
  }
  return velocity;
};
