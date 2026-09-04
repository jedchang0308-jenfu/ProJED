export interface MiddleMousePanState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface MiddleMousePanVelocity {
  speedX: number;
  speedY: number;
}

const MIDDLE_MOUSE_PAN_DEAD_ZONE = 8;
const MIDDLE_MOUSE_PAN_MAX_SPEED = 36;
const MIDDLE_MOUSE_PAN_ACCELERATION = 0.075;

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
