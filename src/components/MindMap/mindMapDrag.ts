import type { TaskNode } from '../../types';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';
import { getElementLocalRect, getMapPointFromClient } from './mindMapDomGeometry';
import { MINDMAP_CENTER_SELECTOR, getMindMapNodeSelector } from './mindMapDomSelectors';
import { createLocalConnectorPath } from './mindMapGeometry';

interface MindMapDragPointer {
  clientX: number;
  clientY: number;
}

interface MindMapInsertionPreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MindMapDragPreviewGeometry {
  connectorPath?: string;
  insertionPreview?: MindMapInsertionPreviewRect;
}

export const updateDragPreviewPointerPosition = <T extends { x: number; y: number }>(
  preview: T | null,
  pointer: MindMapDragPointer,
): T | null => preview ? { ...preview, x: pointer.clientX, y: pointer.clientY } : preview;

export const setTransparentDragImage = (dataTransfer: DataTransfer) => {
  const image = document.createElement('canvas');
  image.width = 1;
  image.height = 1;
  dataTransfer.setDragImage(image, 0, 0);
};

export const getDropModeFromPointer = (
  targetElement: HTMLElement,
  pointer: MindMapDragPointer,
): MindMapDropMode => {
  const rect = targetElement.getBoundingClientRect();
  const ratio = (pointer.clientY - rect.top) / Math.max(rect.height, 1);
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'child';
};

export const createPreviewConnectorPath = (
  pointer: MindMapDragPointer,
  targetElement: HTMLElement,
  surface: HTMLElement,
  zoomLevel: number,
  direction: MindMapDirection,
) => {
  const targetRect = getElementLocalRect(targetElement, surface, zoomLevel);
  const pointerPoint = getMapPointFromClient(pointer.clientX, pointer.clientY, surface, zoomLevel);
  const fromX = direction === 'right' ? targetRect.right : targetRect.left;
  const fromY = targetRect.top + targetRect.height / 2;
  return createLocalConnectorPath(fromX, fromY, pointerPoint.x, pointerPoint.y, direction);
};

export const createInsertionPreview = (
  targetElement: HTMLElement,
  targetNode: TaskNode | undefined,
  mode: MindMapDropMode,
  direction: MindMapDirection,
  surface: HTMLElement,
  zoomLevel: number,
): MindMapDragPreviewGeometry => {
  const targetRect = getElementLocalRect(targetElement, surface, zoomLevel);
  const isLeft = direction === 'left';
  const parentSelector = mode === 'child'
    ? getMindMapNodeSelector(targetNode?.id || '')
    : targetNode?.parentId
      ? getMindMapNodeSelector(targetNode.parentId)
      : MINDMAP_CENTER_SELECTOR;
  const parentElement = surface.querySelector(parentSelector) as HTMLElement | null;
  const parentRect = parentElement ? getElementLocalRect(parentElement, surface, zoomLevel) : targetRect;
  const insertionPreview = mode === 'child'
    ? {
        left: isLeft ? targetRect.left - 126 : targetRect.right + 24,
        top: targetRect.top + targetRect.height / 2 - 6,
        width: 112,
        height: 12,
      }
    : {
        left: targetRect.left,
        top: mode === 'before' ? targetRect.top - 12 : targetRect.bottom + 6,
        width: targetRect.width,
        height: 10,
      };
  const fromX = isLeft ? parentRect.left : parentRect.right;
  const fromY = parentRect.top + parentRect.height / 2;
  const toX = isLeft ? insertionPreview.left + insertionPreview.width : insertionPreview.left;
  const toY = insertionPreview.top + insertionPreview.height / 2;
  return {
    insertionPreview,
    connectorPath: createLocalConnectorPath(fromX, fromY, toX, toY, direction),
  };
};

export const createScreenDragConnectorPath = (
  pointer: MindMapDragPointer,
  targetElement: HTMLElement,
  direction: MindMapDirection,
) => {
  const rect = targetElement.getBoundingClientRect();
  const fromX = direction === 'right' ? rect.right : rect.left;
  const fromY = rect.top + rect.height / 2;
  const toX = pointer.clientX;
  const toY = pointer.clientY;
  const delta = Math.max(Math.abs(toX - fromX) * 0.45, 42);
  const c1X = direction === 'right' ? fromX + delta : fromX - delta;
  const c2X = direction === 'right' ? toX - delta : toX + delta;
  return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
};
