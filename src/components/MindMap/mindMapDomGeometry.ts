import type React from 'react';
import type {
  MindMapLayoutRect,
  MindMapRelationshipAnchor,
  MindMapRelationshipPoint,
} from './mindMapGeometry';
import { clampRatio } from './mindMapGeometry';
import { MINDMAP_NODE_SELECTOR } from './mindMapDomSelectors';

export const getElementLocalRect = (
  element: HTMLElement,
  surface: HTMLElement,
  zoom: number,
): MindMapLayoutRect => {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== surface) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  if (current !== surface) {
    const surfaceRect = surface.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const safeZoom = Math.max(zoom, 0.01);
    left = (rect.left - surfaceRect.left) / safeZoom;
    top = (rect.top - surfaceRect.top) / safeZoom;
  }
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
};

export const getMapPointFromClient = (
  clientX: number,
  clientY: number,
  surface: HTMLElement,
  zoom: number,
): MindMapRelationshipPoint => {
  const rect = surface.getBoundingClientRect();
  const safeZoom = Math.max(zoom, 0.01);
  return {
    x: (clientX - rect.left) / safeZoom,
    y: (clientY - rect.top) / safeZoom,
  };
};

export const getNodeElementAtPoint = (
  surface: HTMLElement,
  clientX: number,
  clientY: number,
) =>
  Array.from(surface.querySelectorAll<HTMLElement>(MINDMAP_NODE_SELECTOR)).find((element) => {
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }) || null;

export const getAnchorForElement = (
  clientX: number,
  clientY: number,
  element: HTMLElement,
): MindMapRelationshipAnchor => {
  const rect = element.getBoundingClientRect();
  return {
    xRatio: clampRatio((clientX - rect.left) / Math.max(rect.width, 1)),
    yRatio: clampRatio((clientY - rect.top) / Math.max(rect.height, 1)),
  };
};

export const getLocalLineSegmentStyle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): React.CSSProperties => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    left: `${(x1 + x2) / 2}px`,
    top: `${(y1 + y2) / 2}px`,
    width: `${Math.max(1, Math.hypot(dx, dy))}px`,
    transform: `translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`,
  };
};
