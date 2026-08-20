import type { MindMapWorldPoint } from './mindMapCoordinateSystem';

export interface MindMapZoomAnchor {
  clientX: number;
  clientY: number;
  world: MindMapWorldPoint;
}

export interface MindMapZoomIntent {
  targetZoom: number;
  anchor: MindMapZoomAnchor | null;
  centerContent: boolean;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_PRECISION = 3;
export const ZOOM_BUTTON_STEP = 0.05;
export const ZOOM_WHEEL_STEP = 0.03;

export const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(ZOOM_PRECISION))));

export const formatZoomLevel = (value: number) => clampZoom(value).toFixed(ZOOM_PRECISION);

export const getZoomPercentText = (value: number) => `${Math.round(clampZoom(value) * 100)}%`;

export const syncCommittedZoomTelemetry = (
  surface: HTMLElement | null,
  label: HTMLElement | null,
  zoomLevel: number,
) => {
  surface?.setAttribute('data-mindmap-zoom-committed-level', formatZoomLevel(zoomLevel));
  if (label) label.textContent = getZoomPercentText(zoomLevel);
};

export const getWheelZoomDelta = (deltaY: number) => {
  const direction = deltaY < 0 ? 1 : -1;
  const magnitude = Math.min(3, Math.max(1, Math.abs(deltaY) / 120));
  return direction * ZOOM_WHEEL_STEP * magnitude;
};

export const createMindMapZoomIntent = (
  targetZoom: number,
  anchor: MindMapZoomAnchor | null,
  centerContent = false,
): MindMapZoomIntent => ({
  targetZoom: clampZoom(targetZoom),
  anchor,
  centerContent,
});
