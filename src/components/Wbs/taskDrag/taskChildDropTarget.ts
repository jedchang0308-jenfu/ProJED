import type { TaskNode } from '../../../types';
import type {
  TaskChildDropPreviewRect,
  TaskChildIntentPhase,
  TaskDragInputMode,
  TaskDragTargetRect,
  TaskDropSurfaceKind,
} from './taskDragTypes';
import {
  isTaskDropIntentOrigin,
  resolveTaskDropIntent,
  type TaskDropIntent,
} from './taskDropIntent';

export const TASK_CHILD_DROP_DWELL_MS = 1000;
export const TASK_CHILD_DROP_SURFACE_KIND = 'task-title-child' as const;

type Point = { x: number; y: number };

export interface TaskChildIntentSnapshot {
  phase: TaskChildIntentPhase;
  targetId: string | null;
  candidateSince: number | null;
}

export interface TaskChildDropTarget {
  targetNodeId: string;
  targetTitle: string;
  targetSurfaceKind: typeof TASK_CHILD_DROP_SURFACE_KIND;
  intent: TaskDropIntent;
  isOrigin: boolean;
  previewRect: TaskChildDropPreviewRect;
}

export interface TaskTitleChildDropZone {
  targetNodeId: string;
  targetTitle: string;
  previewRect: TaskChildDropPreviewRect;
}

const toTargetRect = ({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): TaskDragTargetRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const pointInsideRect = (point: Point, rect: TaskDragTargetRect) =>
  point.x >= rect.left
  && point.x <= rect.right
  && point.y >= rect.top
  && point.y <= rect.bottom;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const roundGeometry = (value: number) => Math.round(value * 1000) / 1000;

export const TASK_CHILD_INSERT_INDENT_PX = 14;
export const TASK_CHILD_INSERT_MIN_WIDTH_PX = 48;
export const TASK_CHILD_INSERT_VIEWPORT_GAP_PX = 8;

export const resolveTaskChildInsertionMarkerRect = ({
  safeRect,
  primaryRect,
  subtreeRect,
  scopeKind,
  primaryPaddingLeft,
  directChildContentLeft,
  directChildContentRight,
  inputMode,
  viewportWidth,
  viewportHeight,
}: {
  safeRect: TaskDragTargetRect;
  primaryRect: TaskDragTargetRect;
  subtreeRect: TaskDragTargetRect | null;
  scopeKind: string | null;
  primaryPaddingLeft: number;
  directChildContentLeft: number | null;
  directChildContentRight: number | null;
  inputMode: TaskDragInputMode;
  viewportWidth: number;
  viewportHeight: number;
}) => {
  const fallbackIndent = scopeKind === 'column'
    ? Math.max(12, primaryPaddingLeft + 4)
    : scopeKind === 'card'
      ? Math.max(16, primaryPaddingLeft + 11)
      : primaryPaddingLeft + TASK_CHILD_INSERT_INDENT_PX;
  const desiredLeft = directChildContentLeft ?? primaryRect.left + fallbackIndent;
  const desiredRight = directChildContentRight ?? Math.min(primaryRect.right, safeRect.right);
  const right = Math.min(viewportWidth - TASK_CHILD_INSERT_VIEWPORT_GAP_PX, desiredRight);
  const left = clamp(
    desiredLeft,
    TASK_CHILD_INSERT_VIEWPORT_GAP_PX,
    Math.max(TASK_CHILD_INSERT_VIEWPORT_GAP_PX, right - TASK_CHILD_INSERT_MIN_WIDTH_PX),
  );
  const hasVisibleSubtree = Boolean(subtreeRect && subtreeRect.width > 0 && subtreeRect.height > 0);
  const desiredTop = hasVisibleSubtree && subtreeRect
    ? Math.min(safeRect.bottom - 2, subtreeRect.bottom + 3)
    : primaryRect.bottom + (scopeKind === 'column' ? 10 : 3);
  const minimumTop = inputMode === 'touch' ? 52 : TASK_CHILD_INSERT_VIEWPORT_GAP_PX;
  const top = clamp(
    desiredTop,
    minimumTop,
    viewportHeight - TASK_CHILD_INSERT_VIEWPORT_GAP_PX,
  );

  return {
    left: roundGeometry(left),
    top: roundGeometry(top),
    width: roundGeometry(Math.max(TASK_CHILD_INSERT_MIN_WIDTH_PX, right - left)),
  };
};

const getElementDepth = (element: Element) => {
  let depth = 0;
  let current: Element | null = element;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
};

const getPreviewRect = (
  safeRect: TaskDragTargetRect,
  primaryElement: HTMLElement,
  subtreeElement: HTMLElement | null,
  directChildPrimaryElement: HTMLElement | null,
  scopeKind: string | null,
  inputMode: TaskDragInputMode,
): TaskChildDropPreviewRect => {
  const primaryRect = primaryElement.getBoundingClientRect();
  const rawSubtreeRect = subtreeElement?.getBoundingClientRect() || null;
  const subtreeRect = rawSubtreeRect && rawSubtreeRect.width > 0 && rawSubtreeRect.height > 0
    ? rawSubtreeRect
    : null;
  const directChildPrimaryRect = directChildPrimaryElement?.getBoundingClientRect() || null;
  const primaryPaddingLeft = Number.parseFloat(getComputedStyle(primaryElement).paddingLeft) || 0;
  const directChildStyle = directChildPrimaryElement ? getComputedStyle(directChildPrimaryElement) : null;
  const directChildPaddingLeft = Number.parseFloat(directChildStyle?.paddingLeft || '') || 0;
  const directChildPaddingRight = Number.parseFloat(directChildStyle?.paddingRight || '') || 0;
  const viewportWidth = typeof window === 'undefined' ? 390 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 844 : window.innerHeight;
  const insertion = resolveTaskChildInsertionMarkerRect({
    safeRect,
    primaryRect: toTargetRect(primaryRect),
    subtreeRect: subtreeRect ? toTargetRect(subtreeRect) : null,
    scopeKind,
    primaryPaddingLeft,
    directChildContentLeft: directChildPrimaryRect
      ? directChildPrimaryRect.left + directChildPaddingLeft
      : null,
    directChildContentRight: directChildPrimaryRect
      ? directChildPrimaryRect.right - directChildPaddingRight
      : null,
    inputMode,
    viewportWidth,
    viewportHeight,
  });

  return {
    parent: toTargetRect(primaryRect),
    safe: safeRect,
    scope: scopeKind === 'column' ? safeRect : null,
    subtree: subtreeRect ? toTargetRect(subtreeRect) : null,
    insertion,
  };
};

const TASK_CHILD_DROP_INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[data-task-primary-action="true"]',
].join(', ');

const pointInsideInteractiveControl = (scope: HTMLElement, point: Point) => (
  Array.from(scope.querySelectorAll<HTMLElement>(TASK_CHILD_DROP_INTERACTIVE_SELECTOR)).some((control) => {
    if (control.getAttribute('data-task-surface-source') === 'true') return false;
    const rect = control.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && point.x >= rect.left
      && point.x <= rect.right
      && point.y >= rect.top
      && point.y <= rect.bottom;
  })
);

export const advanceTaskChildIntent = ({
  current,
  targetId,
  now,
}: {
  current: TaskChildIntentSnapshot;
  targetId: string | null;
  now: number;
}): TaskChildIntentSnapshot => {
  if (!targetId) return { phase: 'none', targetId: null, candidateSince: null };
  if (current.targetId !== targetId || current.candidateSince === null) {
    return { phase: 'candidate', targetId, candidateSince: now };
  }
  return {
    phase: now - current.candidateSince >= TASK_CHILD_DROP_DWELL_MS ? 'armed' : current.phase,
    targetId,
    candidateSince: current.candidateSince,
  };
};

export const getTaskChildIntentRemainingMs = (
  snapshot: TaskChildIntentSnapshot,
  now = Date.now(),
) => snapshot.phase === 'candidate' && snapshot.candidateSince !== null
  ? Math.max(0, TASK_CHILD_DROP_DWELL_MS - (now - snapshot.candidateSince))
  : null;

/**
 * Resolves the one complete DEV-065 hover scope that owns the pointer, independently of
 * whether the current source is allowed to become that task's child. This
 * distinction prevents an invalid self/descendant scope from falling through
 * to a same-level reorder or to an ancestor surface.
 */
export const resolveTaskTitleChildDropZone = ({
  point,
  inputMode,
  nodesRecord,
}: {
  point: Point;
  inputMode: TaskDragInputMode;
  nodesRecord: Record<string, TaskNode>;
}): TaskTitleChildDropZone | null => {
  if (typeof document === 'undefined') return null;

  const matches = Array.from(document.querySelectorAll<HTMLElement>('[data-task-child-drop-target="true"]'))
    .map((element) => {
      const targetNodeId = element.getAttribute('data-task-id');
      if (!targetNodeId) return null;

      const primaryElement = element.querySelector<HTMLElement>(':scope > [data-task-surface-source="true"]');
      if (!primaryElement || primaryElement.getAttribute('data-kanban-drag-source-placeholder') === 'true') return null;
      if (element.getAttribute('data-kanban-drag-source-placeholder') === 'true') return null;
      const subtreeElement = element.querySelector<HTMLElement>(
        ':scope > [data-task-surface-subtree="true"], [data-kanban-column-subtree-scope="true"]',
      );
      const directChildTarget = Array.from(
        element.querySelectorAll<HTMLElement>('[data-task-child-drop-target="true"]'),
      ).find((candidate) => (
        candidate.parentElement?.closest('[data-task-child-drop-target="true"]') === element
      ));
      const directChildPrimaryElement = directChildTarget?.querySelector<HTMLElement>(
        ':scope > [data-task-surface-source="true"]',
      ) || null;
      const scopeRect = element.getBoundingClientRect();
      const primaryRect = primaryElement.getBoundingClientRect();
      if (scopeRect.width <= 0 || scopeRect.height <= 0 || primaryRect.width <= 0 || primaryRect.height <= 0) return null;
      const safeRect = toTargetRect(scopeRect);
      if (!pointInsideRect(point, safeRect)) return null;
      if (pointInsideInteractiveControl(element, point)) return null;

      const centerX = scopeRect.left + scopeRect.width / 2;
      const centerY = scopeRect.top + scopeRect.height / 2;
      const targetNode = nodesRecord[targetNodeId];
      return {
        element,
        area: scopeRect.width * scopeRect.height,
        distance: Math.hypot(point.x - centerX, point.y - centerY),
        depth: getElementDepth(element),
        zone: {
          targetNodeId,
          targetTitle: targetNode?.title || primaryElement.getAttribute('aria-label') || '未命名任務',
          previewRect: getPreviewRect(
            safeRect,
            primaryElement,
            subtreeElement,
            directChildPrimaryElement,
            element.getAttribute('data-task-hover-scope-kind'),
            inputMode,
          ),
        } satisfies TaskTitleChildDropZone,
      };
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((left, right) => right.depth - left.depth || left.area - right.area || left.distance - right.distance);

  return matches[0]?.zone || null;
};

export const resolveTaskTitleChildDropTarget = ({
  point,
  inputMode,
  sourceNodeId,
  sourceSurfaceKind,
  nodesRecord,
}: {
  point: Point;
  inputMode: TaskDragInputMode;
  sourceNodeId: string;
  sourceSurfaceKind: TaskDropSurfaceKind;
  nodesRecord: Record<string, TaskNode>;
}): TaskChildDropTarget | null => {
  const zone = resolveTaskTitleChildDropZone({ point, inputMode, nodesRecord });
  if (!zone) return null;
  const targetNode = nodesRecord[zone.targetNodeId];
  if (!targetNode || targetNode.isArchived || zone.targetNodeId === sourceNodeId) return null;

  const intent = resolveTaskDropIntent({
    source: { nodeId: sourceNodeId, surfaceKind: sourceSurfaceKind },
    target: { nodeId: zone.targetNodeId, surfaceKind: TASK_CHILD_DROP_SURFACE_KIND },
    nodesRecord,
  });
  if (!intent) return null;

  return {
    ...zone,
    targetSurfaceKind: TASK_CHILD_DROP_SURFACE_KIND,
    intent,
    isOrigin: isTaskDropIntentOrigin(sourceNodeId, intent, nodesRecord),
  };
};
