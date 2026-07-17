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
  const titleElement = geometryElement.querySelector<HTMLElement>('.task-title-text')
    || targetElement.closest<HTMLElement>('[data-task-drop-surface-kind="kanban-card"]')
      ?.querySelector<HTMLElement>('.task-title-text');
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
