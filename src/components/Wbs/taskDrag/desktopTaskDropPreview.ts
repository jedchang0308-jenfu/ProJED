import type { TaskNode } from '../../../types';
import type { TaskDragIndicatorRect, TaskDragOriginFieldRect, TaskDropSurfaceKind } from './taskDragTypes';
import {
  desktopTargetTypeToSurfaceKind,
  resolveTaskDropOutcome,
  taskDragSourceKindToSurfaceKind,
  type TaskDropOutcome,
  type TaskDropIntent,
} from './taskDropIntent';
import { findTaskTitleAnchorElement } from './taskTitleAnchor';
import { findTaskOrderingGeometryElement } from './taskOrderingGeometry';
import {
  resolveDesktopL1IndicatorRect,
  type DesktopL1ColumnGeometry,
} from './desktopL1DropPolicy';

type DesktopDragData = Record<string, any>;

export interface DesktopTaskDropPreview {
  sourceNodeId: string;
  targetNodeId: string | null;
  targetDndId: string;
  targetSurfaceKind: TaskDropSurfaceKind;
  outcomeKind: Exclude<TaskDropOutcome['kind'], 'invalid'>;
  displayPosition: TaskDropIntent['displayPosition'];
  intent: TaskDropIntent;
  indicatorAxis: 'horizontal' | 'vertical';
  indicatorRect: TaskDragIndicatorRect;
}

export interface DesktopTaskOriginIndicator {
  sourceNodeId: string;
  sourceTitle: string;
  sourceSurfaceKind: TaskDropSurfaceKind;
  fieldRect: TaskDragOriginFieldRect;
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
  if (!sourceSurfaceKind || !targetSurfaceKind || !activeData?.nodeId) {
    return null;
  }

  if (targetSurfaceKind === 'root-drop' && !targetData?.nodeId) {
    const draggedNode = nodesRecord[activeData.nodeId];
    if (!draggedNode || draggedNode.isArchived || !targetData?.boardId || !targetData?.workspaceId) {
      return null;
    }
    return {
      intent: {
        parentId: null,
        order: 0,
        nodeType: activeData?.source === 'task-workbench'
          ? (draggedNode.nodeType || 'task')
          : (sourceSurfaceKind === 'column-header' ? draggedNode.nodeType : 'group'),
        displayPosition: 'append' as const,
      },
      outcomeKind: 'move' as const,
      sourceSurfaceKind,
      targetSurfaceKind,
    };
  }
  if (!targetData?.nodeId) return null;

  const outcome = resolveTaskDropOutcome({
    source: { nodeId: activeData.nodeId, surfaceKind: sourceSurfaceKind },
    target: {
      nodeId: targetData.nodeId,
      surfaceKind: targetSurfaceKind,
      orderingPosition: targetData.orderingPosition,
    },
    nodesRecord,
  });
  if (outcome.kind === 'invalid') return null;

  return {
    intent: outcome.intent,
    outcomeKind: outcome.kind,
    sourceSurfaceKind,
    targetSurfaceKind,
  };
};

const getPrimaryGeometryElement = (targetElement: HTMLElement) => {
  if (targetElement.matches('[data-task-surface-source="true"]')) return targetElement;
  return targetElement.querySelector<HTMLElement>('[data-task-surface-source="true"]') || targetElement;
};

const getTaskTitleElement = (targetElement: HTMLElement) => {
  const geometryElement = getPrimaryGeometryElement(targetElement);
  return findTaskTitleAnchorElement(geometryElement)
    || findTaskTitleAnchorElement(
      targetElement.closest<HTMLElement>('[data-task-surface-scope="true"]'),
    );
};

const getAppendAnchor = (
  targetElement: HTMLElement,
  targetSurfaceKind: TaskDropSurfaceKind,
) => {
  if (targetSurfaceKind === 'column-drop') {
    return targetElement.querySelector<HTMLElement>('[data-kanban-column-append-anchor="true"]') || targetElement;
  }
  if (targetSurfaceKind === 'checklist-drop') {
    const card = targetElement.matches('[data-task-surface-scope="true"]')
      ? targetElement
      : targetElement.closest<HTMLElement>('[data-task-surface-scope="true"]');
    return card?.querySelector<HTMLElement>('[data-desktop-checklist-append-anchor="true"]')
      || targetElement;
  }
  return targetElement;
};

const getColumnLastTaskBottom = (targetElement: HTMLElement) => {
  const subtree = targetElement.querySelector<HTMLElement>(
    ':scope > [data-kanban-column-subtree-scope]',
  );
  const tasks = Array.from(subtree?.children || [])
    .filter((element): element is HTMLElement => (
      element instanceof HTMLElement
      && element.matches('[data-task-surface-scope="true"][data-task-id]')
    ));
  const lastTask = tasks[tasks.length - 1];
  return lastTask?.getBoundingClientRect().bottom ?? null;
};

const getL1IndicatorRect = ({
  targetElement,
  targetNodeId,
  targetSurfaceKind,
  displayPosition,
}: {
  targetElement: HTMLElement;
  targetNodeId: string;
  targetSurfaceKind: TaskDropSurfaceKind;
  displayPosition: TaskDropIntent['displayPosition'];
}) => {
  if (targetSurfaceKind !== 'column-header' && targetSurfaceKind !== 'root-drop') return null;
  const boardCanvas = targetElement.closest<HTMLElement>('[data-layout-region="board-canvas"]');
  const columnElements = Array.from(
    boardCanvas?.querySelectorAll<HTMLElement>('[data-kanban-column="true"][data-task-id]') || [],
  );
  const columns: DesktopL1ColumnGeometry[] = columnElements.map((column) => {
    const rect = column.getBoundingClientRect();
    return {
      id: column.getAttribute('data-task-id') || '',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
  }).filter(column => Boolean(column.id));
  const resolvedTargetId = targetSurfaceKind === 'root-drop'
    ? columns[columns.length - 1]?.id || targetNodeId
    : targetNodeId;
  const orderingPosition = targetSurfaceKind === 'root-drop'
    ? 'after'
    : displayPosition === 'after' ? 'after' : 'before';
  const rootDropElement = targetSurfaceKind === 'root-drop'
    ? targetElement
    : boardCanvas?.querySelector<HTMLElement>('[data-kanban-root-drop-zone="true"]');

  return resolveDesktopL1IndicatorRect({
    targetId: resolvedTargetId,
    orderingPosition,
    columns,
    rootDropRect: rootDropElement?.getBoundingClientRect() || null,
    viewportRect: boardCanvas?.getBoundingClientRect() || null,
  });
};

const getIndicatorRect = ({
  targetElement,
  targetNodeId,
  targetSurfaceKind,
  displayPosition,
}: {
  targetElement: HTMLElement;
  targetNodeId: string;
  targetSurfaceKind: TaskDropSurfaceKind;
  displayPosition: TaskDropIntent['displayPosition'];
}): TaskDragIndicatorRect | null => {
  const l1IndicatorRect = getL1IndicatorRect({
    targetElement,
    targetNodeId,
    targetSurfaceKind,
    displayPosition,
  });
  if (l1IndicatorRect) return l1IndicatorRect;

  const geometryElement = getPrimaryGeometryElement(targetElement);
  const geometryRect = geometryElement.getBoundingClientRect();
  if (geometryRect.width <= 0 || geometryRect.height < 0) return null;
  const orderingGeometryRect = (
    findTaskOrderingGeometryElement(targetElement, targetSurfaceKind) || geometryElement
  ).getBoundingClientRect();

  const columnRect = targetElement.closest<HTMLElement>('[data-kanban-column="true"]')?.getBoundingClientRect();
  const titleElement = getTaskTitleElement(targetElement);
  const titleRect = titleElement?.getBoundingClientRect();
  const horizontalInset = 4;
  const visibleLeft = columnRect ? columnRect.left + horizontalInset : geometryRect.left;
  const visibleRight = columnRect ? columnRect.right - horizontalInset : geometryRect.right;
  const preferredLeft = titleRect?.left ?? geometryRect.left;
  const left = Math.max(visibleLeft, Math.min(preferredLeft, visibleRight - 24));
  const right = Math.max(left + 24, Math.min(visibleRight, geometryRect.right));

  if (displayPosition === 'append') {
    const anchorRect = getAppendAnchor(targetElement, targetSurfaceKind).getBoundingClientRect();
    const columnLastTaskBottom = targetSurfaceKind === 'column-drop'
      ? getColumnLastTaskBottom(targetElement)
      : null;
    const top = targetSurfaceKind === 'column-drop'
      ? columnLastTaskBottom ?? anchorRect.top
      : targetSurfaceKind === 'root-drop'
        ? anchorRect.top
        : anchorRect.height > 0
          ? anchorRect.bottom
          : anchorRect.top;
    return { left, top, width: right - left };
  }

  return {
    left,
    top: displayPosition === 'after' ? orderingGeometryRect.bottom : orderingGeometryRect.top,
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
    targetNodeId: targetData.nodeId || '',
    targetSurfaceKind: resolved.targetSurfaceKind,
    displayPosition: resolved.intent.displayPosition,
  });
  if (!indicatorRect) return null;

  return {
    sourceNodeId: activeData.nodeId,
    targetNodeId: targetData.nodeId || null,
    targetDndId,
    targetSurfaceKind: resolved.targetSurfaceKind,
    outcomeKind: resolved.outcomeKind,
    displayPosition: resolved.intent.displayPosition,
    intent: resolved.intent,
    indicatorAxis: resolved.targetSurfaceKind === 'column-header'
      || resolved.targetSurfaceKind === 'root-drop'
      ? 'vertical'
      : 'horizontal',
    indicatorRect,
  };
};

export const resolveTaskOriginFieldRect = ({
  sourceElement,
  sourceSurfaceKind,
}: {
  sourceElement: HTMLElement;
  sourceSurfaceKind: TaskDropSurfaceKind;
}): TaskDragOriginFieldRect | null => {
  const geometryElement = getPrimaryGeometryElement(sourceElement);
  const geometryRect = geometryElement.getBoundingClientRect();
  if (geometryRect.width <= 0 || geometryRect.height <= 0) return null;

  const titleRect = getTaskTitleElement(sourceElement)?.getBoundingClientRect();
  if (!titleRect) {
    // Column/card placeholders intentionally remove their title DOM. Their
    // remaining shell starts 4px/0px before the blue field respectively, so
    // the field's fixed 6px text padding lands on the original title anchor.
    const horizontalInset = sourceSurfaceKind === 'column-header' ? 4 : 0;
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

  // TaskOriginTitleField uses px-1.5 (6px); offset the field by the same amount
  // so its rendered text starts exactly at the source title anchor.
  const horizontalPadding = 6;
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

  const fieldRect = resolveTaskOriginFieldRect({
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
  && left.outcomeKind === right.outcomeKind
  && left.indicatorAxis === right.indicatorAxis
  && left.displayPosition === right.displayPosition
  && left.intent.parentId === right.intent.parentId
  && left.intent.order === right.intent.order
  && left.intent.nodeType === right.intent.nodeType);
