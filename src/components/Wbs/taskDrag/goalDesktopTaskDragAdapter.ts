import type { TaskNode } from '../../../types';
import type { TaskDropSurfaceKind } from './taskDragTypes';

export type GoalTaskRect = {
  nodeId: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Measured title edge and one-depth child edge in the frozen task cell. */
  titleAnchorLeft: number;
  childAnchorLeft: number;
  /** Center of the target node's own Goal hierarchy rail. */
  treeRailLeft: number;
  /** Visible bottom of the rendered subtree; collapsed descendants are absent. */
  visibleSubtreeBottom: number;
  /** Right edge of the task cell before the four-pixel visual inset. */
  cellRight: number;
};

type GoalClipRect = Pick<GoalTaskRect, 'top' | 'bottom' | 'left' | 'right'> & { nodeId?: string };

export const GOAL_CHILD_ENTRY_WINDOW_SCALE = 0.7;

/**
 * Goal keeps child intent deliberately narrower than ordinary row ordering.
 * The dwell target is the centered 70% of the measured primary task surface,
 * leaving a 15% ordering-only guard band on every edge.
 */
export const resolveGoalChildEntryWindow = (rect: GoalClipRect): GoalClipRect => {
  const width = Math.max(0, rect.right - rect.left);
  const height = Math.max(0, rect.bottom - rect.top);
  const horizontalInset = width * (1 - GOAL_CHILD_ENTRY_WINDOW_SCALE) / 2;
  const verticalInset = height * (1 - GOAL_CHILD_ENTRY_WINDOW_SCALE) / 2;
  return {
    left: rect.left + horizontalInset,
    right: rect.right - horizontalInset,
    top: rect.top + verticalInset,
    bottom: rect.bottom - verticalInset,
    nodeId: rect.nodeId,
  };
};

export type GoalIndicatorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GoalTreePreviewGeometry = {
  relationKind: 'root' | 'sibling' | 'child';
  railCenterX: number;
  stemStartY: number;
  stemEndY: number;
  boundaryY: number;
  branchEndX: number;
};

export type GoalDropGeometry = {
  targetNodeId: string;
  targetSurfaceKind: Extract<TaskDropSurfaceKind, 'column-header' | 'checklist-row'>;
  orderingPosition: 'before' | 'after';
  feedbackKind: 'standard' | 'origin';
  indicatorRect: GoalIndicatorRect;
  childIndicatorRect: GoalIndicatorRect;
  standardPreviewAnchorNodeId: string;
  standardTreePreview: GoalTreePreviewGeometry;
  childTreePreview: GoalTreePreviewGeometry;
};

const containsPoint = (rect: GoalClipRect, point: { x: number; y: number }) =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

const isDescendant = (nodeId: string, ancestorId: string, nodesRecord: Record<string, TaskNode>) => {
  let current = nodesRecord[nodeId]?.parentId || null;
  const visited = new Set<string>();
  while (current) {
    if (current === ancestorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = nodesRecord[current]?.parentId || null;
  }
  return false;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Keep the full 8px marker bounds inside the intersection of the frozen task
 * lane and the Goal viewport. The semantic Y remains four pixels away from a
 * clipping edge so the dot/bar cannot be cut in half by a sticky boundary.
 */
const resolveIndicatorRect = ({
  anchorLeft,
  rawTop,
  cellRight,
  taskLaneRect,
  viewportRect,
}: {
  anchorLeft: number;
  rawTop: number;
  cellRight: number;
  taskLaneRect: GoalClipRect;
  viewportRect: GoalClipRect;
}): GoalIndicatorRect | null => {
  const clipLeft = Math.max(taskLaneRect.left, viewportRect.left);
  const clipRight = Math.min(taskLaneRect.right, viewportRect.right);
  const clipTop = Math.max(taskLaneRect.top, viewportRect.top);
  const clipBottom = Math.min(taskLaneRect.bottom, viewportRect.bottom);
  const minimumWidth = 24;
  const visualInset = 4;
  if (clipRight - clipLeft < minimumWidth + visualInset * 2 || clipBottom - clipTop < visualInset * 2) return null;

  const right = Math.min(clipRight - visualInset, Math.max(clipLeft + visualInset + minimumWidth, cellRight - visualInset));
  const left = clamp(anchorLeft, clipLeft + visualInset, right - minimumWidth);
  const top = clamp(rawTop, clipTop + visualInset, clipBottom - visualInset);
  return { left, top, width: Math.max(minimumWidth, right - left), height: 0 };
};

/** Shared Goal geometry policy: clip to the task lane and viewport, then use
 * row Y/midpoint only. Rows are never transformed to preview a drop. */
export const resolveGoalTaskRowDropGeometry = ({
  sourceNodeId,
  pointer,
  rows,
  taskLaneRect,
  viewportRect,
  nodesRecord,
}: {
  sourceNodeId: string;
  pointer: { x: number; y: number };
  rows: readonly GoalTaskRect[];
  taskLaneRect: GoalClipRect;
  viewportRect: GoalClipRect;
  nodesRecord: Record<string, TaskNode>;
}): GoalDropGeometry | null => {
  if (!containsPoint(taskLaneRect, pointer) || !containsPoint(viewportRect, pointer)) return null;
  const candidate = rows.find(row => containsPoint(row, pointer));
  if (!candidate || isDescendant(candidate.nodeId, sourceNodeId, nodesRecord)) return null;
  const targetNode = nodesRecord[candidate.nodeId];
  if (!targetNode || targetNode.isArchived) return null;
  const midpoint = candidate.top + (candidate.bottom - candidate.top) / 2;
  const orderingPosition = pointer.y >= midpoint ? 'after' : 'before';
  const getVisibleSubtreeBottom = (anchor: GoalTaskRect) => rows.reduce((bottom, row) => {
    if (row.nodeId === anchor.nodeId || isDescendant(row.nodeId, anchor.nodeId, nodesRecord)) {
      return Math.max(bottom, row.bottom, row.visibleSubtreeBottom);
    }
    return bottom;
  }, Math.max(anchor.bottom, anchor.visibleSubtreeBottom));
  const visibleSubtreeBottom = getVisibleSubtreeBottom(candidate);
  const candidateIndex = rows.findIndex(row => row.nodeId === candidate.nodeId);
  const previousVisibleSibling = orderingPosition === 'before' && candidateIndex > 0
    ? rows.slice(0, candidateIndex).reverse().find(row => {
      const rowNode = nodesRecord[row.nodeId];
      if (!rowNode || rowNode.parentId !== targetNode.parentId) return false;
      if (row.nodeId === sourceNodeId || isDescendant(row.nodeId, sourceNodeId, nodesRecord)) return false;
      return Math.abs(getVisibleSubtreeBottom(row) - candidate.top) <= 1;
    })
    : undefined;
  const visibleParentAnchor = orderingPosition === 'before' && targetNode.parentId
    ? rows.find(row => {
      if (row.nodeId !== targetNode.parentId) return false;
      if (row.nodeId === sourceNodeId || isDescendant(row.nodeId, sourceNodeId, nodesRecord)) return false;
      const rowCenterY = row.top + (row.bottom - row.top) / 2;
      return rowCenterY <= candidate.top + 1;
    })
    : undefined;
  const standardPreviewAnchor = previousVisibleSibling ?? visibleParentAnchor ?? candidate;
  const rawTop = orderingPosition === 'after' ? visibleSubtreeBottom : candidate.top;
  const indicatorRect = resolveIndicatorRect({
    anchorLeft: candidate.titleAnchorLeft,
    rawTop,
    cellRight: candidate.cellRight,
    taskLaneRect,
    viewportRect,
  });
  const childIndicatorRect = resolveIndicatorRect({
    anchorLeft: candidate.childAnchorLeft,
    rawTop: visibleSubtreeBottom,
    cellRight: candidate.cellRight,
    taskLaneRect,
    viewportRect,
  });
  if (!indicatorRect || !childIndicatorRect) return null;
  const clipTop = Math.max(taskLaneRect.top, viewportRect.top);
  const clipBottom = Math.min(taskLaneRect.bottom, viewportRect.bottom);
  const rowCenterY = candidate.top + (candidate.bottom - candidate.top) / 2;
  const standardPreviewRowCenterY = standardPreviewAnchor.top
    + (standardPreviewAnchor.bottom - standardPreviewAnchor.top) / 2;
  const clippedRowCenterY = clamp(rowCenterY, clipTop, clipBottom);
  const clippedStandardPreviewRowCenterY = clamp(standardPreviewRowCenterY, clipTop, clipBottom);
  const hierarchyIndent = Math.max(0, candidate.childAnchorLeft - candidate.titleAnchorLeft);
  const isRootTarget = targetNode.parentId === null;
  const standardBoundaryY = indicatorRect.top;
  const standardRailCenterX = isRootTarget
    ? candidate.treeRailLeft
    : candidate.treeRailLeft - hierarchyIndent;
  const topDownStandardStemStartY = isRootTarget
    ? standardBoundaryY
    : Math.min(clippedStandardPreviewRowCenterY, standardBoundaryY);
  const childBoundaryY = childIndicatorRect.top;
  return {
    targetNodeId: candidate.nodeId,
    targetSurfaceKind: targetNode.parentId ? 'checklist-row' : 'column-header',
    orderingPosition,
    feedbackKind: candidate.nodeId === sourceNodeId ? 'origin' : 'standard',
    indicatorRect,
    childIndicatorRect,
    standardPreviewAnchorNodeId: standardPreviewAnchor.nodeId,
    standardTreePreview: {
      relationKind: isRootTarget ? 'root' : 'sibling',
      railCenterX: standardRailCenterX,
      stemStartY: topDownStandardStemStartY,
      stemEndY: standardBoundaryY,
      boundaryY: standardBoundaryY,
      branchEndX: indicatorRect.left,
    },
    childTreePreview: {
      relationKind: 'child',
      railCenterX: candidate.treeRailLeft,
      stemStartY: clamp(clippedRowCenterY, clipTop, childBoundaryY),
      stemEndY: childBoundaryY,
      boundaryY: childBoundaryY,
      branchEndX: childIndicatorRect.left,
    },
  };
};

/** Keyboard/sortable fallback when a pointer is not available. */
export const resolveGoalDropPosition = (
  activeRect: { top: number; height: number } | null | undefined,
  targetRect: { top: number; height: number },
) => {
  const center = activeRect ? activeRect.top + activeRect.height / 2 : targetRect.top + targetRect.height / 2;
  return center >= targetRect.top + targetRect.height / 2 ? 'after' as const : 'before' as const;
};
