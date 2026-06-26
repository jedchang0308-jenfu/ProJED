import { getElementLocalRect } from './mindMapDomGeometry';
import { MINDMAP_CONTENT_BOUNDS_SELECTOR } from './mindMapDomSelectors';
import type { MindMapLayoutRect } from './mindMapGeometry';
import { clampZoom } from './mindMapZoom';

export type MindMapContentCenterReason = 'initial' | 'fit' | 'repair';

export interface MindMapContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export const getMindMapContentBounds = (
  content: HTMLElement,
  zoomLevel: number,
): MindMapContentBounds | null => {
  const elements = Array.from(content.querySelectorAll<HTMLElement>(MINDMAP_CONTENT_BOUNDS_SELECTOR));
  if (elements.length === 0) return null;
  const rects: MindMapLayoutRect[] = elements.map(element => getElementLocalRect(element, content, zoomLevel));
  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
};

export const centerMindMapContent = (
  surface: HTMLElement,
  content: HTMLElement,
  zoomLevel: number,
  reason: MindMapContentCenterReason = 'repair',
) => {
  const bounds = getMindMapContentBounds(content, zoomLevel);
  if (!bounds) return false;
  const nextLeft = bounds.centerX * zoomLevel - surface.clientWidth / 2;
  const nextTop = bounds.centerY * zoomLevel - surface.clientHeight / 2;
  surface.scrollLeft = Math.max(0, Math.min(surface.scrollWidth - surface.clientWidth, nextLeft));
  surface.scrollTop = Math.max(0, Math.min(surface.scrollHeight - surface.clientHeight, nextTop));
  surface.setAttribute('data-mindmap-content-centered', reason);
  surface.setAttribute('data-mindmap-visible-bounds-width', bounds.width.toFixed(2));
  surface.setAttribute('data-mindmap-visible-bounds-height', bounds.height.toFixed(2));
  return true;
};

export const getFitZoomForBounds = (
  surface: HTMLElement,
  bounds: MindMapContentBounds,
  currentZoom: number,
) => {
  const widthRatio = surface.clientWidth / Math.max(bounds.width, 1);
  const heightRatio = surface.clientHeight / Math.max(bounds.height, 1);
  return clampZoom(currentZoom * Math.min(widthRatio, heightRatio) * 0.86);
};
