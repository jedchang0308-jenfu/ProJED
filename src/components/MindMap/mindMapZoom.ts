export interface MindMapZoomAnchor {
  clientX: number;
  clientY: number;
  contentX: number;
  contentY: number;
  baseZoom: number;
}

interface MindMapZoomRect {
  left: number;
  top: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const ZOOM_PRECISION = 3;
export const ZOOM_BUTTON_STEP = 0.05;
export const ZOOM_WHEEL_STEP = 0.03;
export const ZOOM_PREVIEW_COMMIT_DELAY_MS = 150;

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
  if (label) {
    label.textContent = getZoomPercentText(zoomLevel);
  }
};

export const getWheelZoomDelta = (deltaY: number) => {
  const direction = deltaY < 0 ? 1 : -1;
  const magnitude = Math.min(3, Math.max(1, Math.abs(deltaY) / 120));
  return direction * ZOOM_WHEEL_STEP * magnitude;
};

export const getZoomAnchorFromClient = (
  clientX: number,
  clientY: number,
  contentRect: MindMapZoomRect,
  zoom: number,
): MindMapZoomAnchor => {
  const safeZoom = Math.max(zoom, 0.01);
  return {
    clientX,
    clientY,
    contentX: (clientX - contentRect.left) / safeZoom,
    contentY: (clientY - contentRect.top) / safeZoom,
    baseZoom: zoom,
  };
};

export const getZoomPreviewScale = (previewZoom: number, baseZoom: number) =>
  previewZoom / Math.max(baseZoom, 0.01);

export const clearZoomPreviewTelemetry = (
  surface: HTMLElement | null,
  content: HTMLElement | null,
) => {
  if (content) {
    content.style.transform = '';
    content.style.transformOrigin = '';
    content.style.willChange = '';
    content.removeAttribute('data-mindmap-zoom-preview-transform');
  }
  surface?.removeAttribute('data-mindmap-zoom-preview-active');
  surface?.removeAttribute('data-mindmap-zoom-preview-level');
  surface?.removeAttribute('data-mindmap-zoom-preview-scale');
};

export const applyZoomPreviewTelemetry = (
  surface: HTMLElement,
  content: HTMLElement,
  label: HTMLElement | null,
  anchor: MindMapZoomAnchor,
  previewZoom: number,
) => {
  const previewScale = getZoomPreviewScale(previewZoom, anchor.baseZoom);
  content.style.transformOrigin = `${anchor.contentX}px ${anchor.contentY}px`;
  content.style.transform = `scale(${previewScale})`;
  content.style.willChange = 'transform';
  content.setAttribute('data-mindmap-zoom-preview-transform', 'scale');
  surface.setAttribute('data-mindmap-zoom-preview-active', 'true');
  surface.setAttribute('data-mindmap-zoom-preview-level', formatZoomLevel(previewZoom));
  surface.setAttribute('data-mindmap-zoom-preview-scale', previewScale.toFixed(4));
  if (label) {
    label.textContent = getZoomPercentText(previewZoom);
  }
  return previewScale;
};

export const getAnchoredZoomScrollDelta = (
  anchor: MindMapZoomAnchor,
  previousZoom: number,
  targetZoom: number,
) => ({
  left: anchor.contentX * (targetZoom - previousZoom),
  top: anchor.contentY * (targetZoom - previousZoom),
});
