import type React from 'react';
import type {
  MindMapLayoutRect,
  MindMapRelationshipAnchor,
  MindMapRelationshipPoint,
} from './mindMapGeometry';
import {
  createMindMapCoordinateMapper,
  type MindMapCoordinateMapper,
  type MindMapSceneLayout,
  type MindMapSceneSize,
  type MindMapViewportSnapshot,
  type MindMapViewportSize,
} from './mindMapCoordinateSystem';
import { clampRatio } from './mindMapGeometry';
import { MINDMAP_NODE_SELECTOR } from './mindMapDomSelectors';

export const getMindMapViewportSize = (surface: HTMLElement): MindMapViewportSize => ({
  width: surface.clientWidth,
  height: surface.clientHeight,
});

export const getMindMapViewportSnapshot = (surface: HTMLElement): MindMapViewportSnapshot => {
  const rect = surface.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    scrollLeft: surface.scrollLeft,
    scrollTop: surface.scrollTop,
    clientWidth: surface.clientWidth,
    clientHeight: surface.clientHeight,
  };
};

export const getMindMapSceneSize = (scene: HTMLElement): MindMapSceneSize => ({
  // `scrollWidth/scrollHeight` include transformed descendants in Chromium;
  // reading them after a zoom would feed the scaled scene back into the
  // layout, growing the stage on every zoom frame. The world scene is sized
  // by its untransformed border box, while the viewport owns scrolling.
  width: Math.max(1, scene.offsetWidth),
  height: Math.max(1, scene.offsetHeight),
});

export const getMindMapCoordinateMapper = (
  scene: HTMLElement,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapCoordinateMapper => createMindMapCoordinateMapper(scene, layout, viewport);

export const getElementWorldRect = (
  element: HTMLElement,
  mapper: MindMapCoordinateMapper,
): MindMapLayoutRect => mapper.elementToWorldRect(element);

export const getWorldPointFromClient = (
  clientX: number,
  clientY: number,
  mapper: MindMapCoordinateMapper,
): MindMapRelationshipPoint => mapper.clientToWorld({ x: clientX, y: clientY });

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
