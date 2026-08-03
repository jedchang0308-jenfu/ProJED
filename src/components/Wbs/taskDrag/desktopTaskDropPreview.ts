import type { TaskNode } from '../../../types';
import type { TaskDragIndicatorRect, TaskDropSurfaceKind } from './taskDragTypes';
import {
  desktopTargetTypeToSurfaceKind,
  resolveTaskDropIntent,
  taskDragSourceKindToSurfaceKind,
  type TaskDropIntent,
} from './taskDropIntent';

type DesktopDragData = Record<string, any>;

export interface DesktopTaskDropPreview {
  sourceNodeId: string;
  targetNodeId: string;
  targetDndId: string;
  targetSurfaceKind: TaskDropSurfaceKind;
  displayPosition: TaskDropIntent['displayPosition'];
  intent: TaskDropIntent;
  indicatorRect: TaskDragIndicatorRect;
}

export interface DesktopTaskOriginIndicator {
  sourceNodeId: string;
  sourceTitle: string;
  sourceSurfaceKind: TaskDropSurfaceKind;
  fieldRect: TaskDragIndicatorRect & { height: number };
}

const escapeAttributeToken = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
};

export const findDesktopTaskDropElement = (targetDndId: string) => {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(
    `[data-desktop-drop-id~="${escapeAttributeToken(targetDndId)}"]`,
  );
};

export const resolveDesktopTaskDropIntent = ({
  activeData,
  targetData,
  nodesRecord,
}: {
  activeData: DesktopDragData;
  targetData: DesktopDragData;
  nodesRecord: Record<string, TaskNode>;
}) => {
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(activeData?.type);
  const targetSurfaceKind = desktopTargetTypeToSurfaceKind(targetData?.type);
  if (!sourceSurfaceKind || !targetSurfaceKind || !activeData?.nodeId || !targetData?.nodeId) {
    return null;
  }

  const intent = resolveTaskDropIntent({
    source: { nodeId: activeData.nodeId, surfaceKind: sourceSurfaceKind },
    target: { nodeId: targetData.nodeId, surfaceKind: targetSurfaceKind },
    nodesRecord,
  });
  if (!intent) return null;

  return { intent, sourceSurfaceKind, targetSurfaceKind };
};

const getPrimaryGeometryElement = (
  targetElement: HTMLElement,
  targetSurfaceKind: TaskDropSurfaceKind,
) => {
  if (targetSurfaceKind !== 'kanban-card') return targetElement;
  return targetElement.querySelector<HTMLElement>('[data-task-card-primary="true"]') || targetElement;
};

const getTaskTitleElement = (
  targetElement: HTMLElement,
  targetSurfaceKind: TaskDropSurfaceKind,
) => {
  const geometryElement = getPrimaryGeometryElement(targetElement, targetSurfaceKind);
  return geometryElement.querySelector<HTMLElement>('.task-title-text')
    || targetElement.closest<HTMLElement>('[data-task-drop-surface-kind="kanban-card"]')
      ?.querySelector<HTMLElement>('.task-title-text')
    || null;
};

const getAppendAnchor = (
  targetElement: HTMLElement,
  targetSurfaceKind: TaskDropSurfaceKind,
) => {
  if (targetSurfaceKind === 'column-drop') {
    return targetElement.querySelector<HTMLElement>('[data-kanban-add-task-button="true"]') || targetElement;
  }
  if (targetSurfaceKind === 'checklist-drop') {
    const card = targetElement.matches('[data-task-drop-surface-kind="kanban-card"]')
      ? targetElement
      : targetElement.closest<HTMLElement>('[data-task-drop-surface-kind="kanban-card"]');
    return card?.querySelector<HTMLElement>('[data-desktop-checklist-append-anchor="true"]')
      || targetElement;
  }
  return targetElement;
};

const getIndicatorRect = ({
  targetElement,
  targetSurfaceKind,
  displayPosition,
}: {
  targetElement: HTMLElement;
  targetSurfaceKind: TaskDropSurfaceKind;
  displayPosition: TaskDropIntent['displayPosition'];
}): TaskDragIndicatorRect | null => {
  const geometryElement = getPrimaryGeometryElement(targetElement, targetSurfaceKind);
  const geometryRect = geometryElement.getBoundingClientRect();
  if (geometryRect.width <= 0 || geometryRect.height < 0) return null;

  const columnRect = targetElement.closest<HTMLElement>('[data-kanban-column="true"]')?.getBoundingClientRect();
  const titleElement = getTaskTitleElement(targetElement, targetSurfaceKind);
  const titleRect = titleElement?.getBoundingClientRect();
  const horizontalInset = 4;
  const visibleLeft = columnRect ? columnRect.left + horizontalInset : geometryRect.left;
  const visibleRight = columnRect ? columnRect.right - horizontalInset : geometryRect.right;
  const preferredLeft = titleRect?.left ?? geometryRect.left;
  const left = Math.max(visibleLeft, Math.min(preferredLeft, visibleRight - 24));
  const right = Math.max(left + 24, Math.min(visibleRight, geometryRect.right));

  if (displayPosition === 'append') {
    const anchorRect = getAppendAnchor(targetElement, targetSurfaceKind).getBoundingClientRect();
    const top = targetSurfaceKind === 'column-drop'
      ? anchorRect.top
      : anchorRect.height > 0
        ? anchorRect.bottom
        : anchorRect.top;
    return { left, top, width: right - left };
  }

  return {
    left,
    top: displayPosition === 'after' ? geometryRect.bottom : geometryRect.top,
    width: right - left,
  };
};

export const resolveDesktopTaskDropPreview = ({
  activeData,
  targetData,
  targetDndId,
  targetElement,
  nodesRecord,
}: {
  activeData: DesktopDragData;
  targetData: DesktopDragData;
  targetDndId: string;
  targetElement: HTMLElement | null;
  nodesRecord: Record<string, TaskNode>;
}): DesktopTaskDropPreview | null => {
  if (!targetElement) return null;
  const resolved = resolveDesktopTaskDropIntent({ activeData, targetData, nodesRecord });
  if (!resolved) return null;
  const indicatorRect = getIndicatorRect({
    targetElement,
    targetSurfaceKind: resolved.targetSurfaceKind,
    displayPosition: resolved.intent.displayPosition,
  });
  if (!indicatorRect) return null;

  return {
    sourceNodeId: activeData.nodeId,
    targetNodeId: targetData.nodeId,
    targetDndId,
    targetSurfaceKind: resolved.targetSurfaceKind,
    displayPosition: resolved.intent.displayPosition,
    intent: resolved.intent,
    indicatorRect,
  };
};

const getOriginFieldRect = ({
  sourceElement,
  sourceSurfaceKind,
}: {
  sourceElement: HTMLElement;
  sourceSurfaceKind: TaskDropSurfaceKind;
}): (TaskDragIndicatorRect & { height: number }) | null => {
  const geometryElement = getPrimaryGeometryElement(sourceElement, sourceSurfaceKind);
  const geometryRect = geometryElement.getBoundingClientRect();
  if (geometryRect.width <= 0 || geometryRect.height <= 0) return null;

  const titleRect = getTaskTitleElement(sourceElement, sourceSurfaceKind)?.getBoundingClientRect();
  if (!titleRect) {
    const horizontalInset = sourceSurfaceKind === 'column-header' ? 10
      : sourceSurfaceKind === 'kanban-card' ? 9 : 0;
    const topInset = sourceSurfaceKind === 'column-header' ? 8
      : sourceSurfaceKind === 'kanban-card' ? 6 : 0;
    const height = Math.min(sourceSurfaceKind === 'checklist-row' ? geometryRect.height : 20, geometryRect.height - topInset);
    const width = geometryRect.width - horizontalInset * 2;
    if (width < 24 || height < 12) return null;
    return {
      left: geometryRect.left + horizontalInset,
      top: geometryRect.top + topInset,
      width,
      height,
    };
  }

  const horizontalPadding = 4;
  const verticalPadding = 2;
  const left = Math.max(geometryRect.left, titleRect.left - horizontalPadding);
  const right = geometryRect.right;
  const top = Math.max(geometryRect.top, titleRect.top - verticalPadding);
  const bottom = Math.min(geometryRect.bottom, titleRect.bottom + verticalPadding);
  if (right - left < 24 || bottom - top < 12) return null;

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

export const resolveDesktopTaskOriginIndicator = ({
  activeData,
  sourceElement,
  sourceTitle,
}: {
  activeData: DesktopDragData;
  sourceElement: HTMLElement | null;
  sourceTitle?: string;
}): DesktopTaskOriginIndicator | null => {
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(activeData?.type);
  if (
    !sourceElement
    || !activeData?.nodeId
    || !sourceSurfaceKind
    || sourceSurfaceKind === 'workbench-unplaced-row'
  ) {
    return null;
  }

  const fieldRect = getOriginFieldRect({
    sourceElement,
    sourceSurfaceKind,
  });
  if (!fieldRect) return null;

  return {
    sourceNodeId: activeData.nodeId,
    sourceTitle: sourceTitle?.trim() || '未命名任務',
    sourceSurfaceKind,
    fieldRect,
  };
};

export const desktopTaskDropPreviewMatches = (
  left: DesktopTaskDropPreview | null,
  right: DesktopTaskDropPreview | null,
) => Boolean(left && right
  && left.sourceNodeId === right.sourceNodeId
  && left.targetNodeId === right.targetNodeId
  && left.targetDndId === right.targetDndId
  && left.targetSurfaceKind === right.targetSurfaceKind
  && left.displayPosition === right.displayPosition
  && left.intent.parentId === right.intent.parentId
  && left.intent.order === right.intent.order
  && left.intent.nodeType === right.intent.nodeType);
