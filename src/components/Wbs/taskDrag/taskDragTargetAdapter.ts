import { useWbsStore } from '../../../store/useWbsStore';
import {
  resolveTaskDropIntent,
  taskDragSourceKindToSurfaceKind,
} from './taskDropIntent';
import type {
  MobileTaskAction,
  MobileTaskDropPosition,
  TaskDragObservation,
  TaskDragSessionState,
  TaskDragTargetRect,
  TaskDropSurfaceKind,
} from './taskDragTypes';

export const MOBILE_PREVIEW_FINGER_CLEARANCE_PX = 12;
export const MOBILE_TARGET_RETAIN_PX = 12;
export const MOBILE_TARGET_CORE_MAX_INSET_PX = 12;
export const MOBILE_TARGET_CORE_HEIGHT_RATIO = 0.34;
export const MOBILE_RELEASE_FRESHNESS_MS = 120;
export const EDGE_SCROLL_THRESHOLD_PX = 56;
export const EDGE_SCROLL_MAX_STEP_PX = 3;

export const TASK_DRAG_TARGET_PRIORITY = [
  'mobile-action',
  'task-position',
  'workbench-placed-lane',
  'none',
] as const;

type Point = { x: number; y: number };

interface TaskTargetCandidate {
  nodeId: string;
  boardId: string | null;
  workspaceId: string | null;
  surfaceKind: TaskDropSurfaceKind;
  dropPosition: MobileTaskDropPosition;
  rect: TaskDragTargetRect;
  indicatorRect: { left: number; top: number; width: number };
}

export const readTaskTouchPoint = (event: TouchEvent | React.TouchEvent | undefined) => {
  if (!event) return null;
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
};

export const getTaskIntentPoint = (rawPoint: Point): Point => ({
  x: rawPoint.x,
  y: rawPoint.y,
});

const toTargetRect = (rect: DOMRect): TaskDragTargetRect => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

const emptyObservation = (
  state: TaskDragSessionState,
  rawPoint: Point | null,
): TaskDragObservation => ({
  sessionId: state.sessionId,
  sequence: state.sequence + 1,
  inputMode: state.source.inputMode,
  source: state.source,
  targetKind: 'none',
  targetNodeId: null,
  targetBoardId: null,
  targetWorkspaceId: null,
  targetSurfaceKind: null,
  action: null,
  dropPosition: null,
  indicatorRect: null,
  lockedTargetRect: null,
  pendingTargetId: null,
  pendingSince: null,
  lastStableAt: null,
  pointer: rawPoint,
  intentPointer: rawPoint ? getTaskIntentPoint(rawPoint) : null,
  observedAt: Date.now(),
});

const readSurfaceKind = (element: HTMLElement): TaskDropSurfaceKind | null => {
  const explicit = element.getAttribute('data-task-drop-surface-kind');
  if (explicit) return explicit as TaskDropSurfaceKind;
  const legacy = element.getAttribute('data-task-drag-surface-kind');
  if (legacy === 'kanban-column-header') return 'column-header';
  if (legacy === 'kanban-card') return 'kanban-card';
  if (legacy === 'checklist-row') return 'checklist-row';
  if (legacy === 'wbs-list-row') return 'kanban-card';
  return null;
};

const pointInsideRect = (point: Point, rect: TaskDragTargetRect, outset = 0) =>
  point.x >= rect.left - outset
  && point.x <= rect.right + outset
  && point.y >= rect.top - outset
  && point.y <= rect.bottom + outset;

const pointInsideTargetCore = (point: Point, rect: TaskDragTargetRect) => {
  const insetX = Math.min(MOBILE_TARGET_CORE_MAX_INSET_PX, Math.max(4, rect.width * 0.08));
  const insetY = Math.min(
    MOBILE_TARGET_CORE_MAX_INSET_PX,
    Math.max(0, rect.height * MOBILE_TARGET_CORE_HEIGHT_RATIO),
  );
  return point.x >= rect.left + insetX
    && point.x <= rect.right - insetX
    && point.y >= rect.top + insetY
    && point.y <= rect.bottom - insetY;
};

const buildCandidate = (
  targetElement: HTMLElement,
  state: TaskDragSessionState,
  point: Point,
): TaskTargetCandidate | null => {
  const nodeId = targetElement.getAttribute('data-task-id');
  const domSurfaceKind = readSurfaceKind(targetElement);
  if (!nodeId || nodeId === state.nodeId || !domSurfaceKind) return null;

  const nodes = useWbsStore.getState().nodes;
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(state.source.kind);
  const targetNode = nodes[nodeId];
  if (!sourceSurfaceKind || !targetNode || targetNode.isArchived) return null;
  const surfaceKind = sourceSurfaceKind === 'checklist-row' && domSurfaceKind === 'kanban-card'
    ? 'checklist-drop'
    : domSurfaceKind;
  const intent = resolveTaskDropIntent({
    source: { nodeId: state.nodeId, surfaceKind: sourceSurfaceKind },
    target: { nodeId, surfaceKind },
    nodesRecord: nodes,
  });
  if (!intent) return null;

  const geometryElement = domSurfaceKind === 'kanban-card'
    ? targetElement.querySelector<HTMLElement>('[data-mobile-task-card-primary="true"]') || targetElement
    : targetElement;
  const domRect = geometryElement.getBoundingClientRect();
  const rect = toTargetRect(domRect);
  if (!pointInsideRect(point, rect)) return null;
  const titleElement = geometryElement.querySelector('.task-title-text') as HTMLElement | null;
  const titleRect = titleElement?.getBoundingClientRect();
  const indicatorLeft = titleRect?.left ?? rect.left;
  const dropPosition: MobileTaskDropPosition = intent.displayPosition === 'before' ? 'before' : 'after';
  return {
    nodeId,
    boardId: targetNode.boardId || null,
    workspaceId: targetNode.workspaceId || null,
    surfaceKind,
    dropPosition,
    rect,
    indicatorRect: {
      left: indicatorLeft,
      top: dropPosition === 'after' ? rect.bottom : rect.top,
      width: Math.max(24, rect.right - indicatorLeft),
    },
  };
};

const collectDirectCandidates = (point: Point, state: TaskDragSessionState) => {
  const element = document.elementFromPoint(point.x, point.y);
  const targetElement = element instanceof Element
    ? element.closest('[data-mobile-drop-target][data-task-id]') as HTMLElement | null
    : null;
  if (!targetElement) return [];

  // The innermost task surface owns the point. If it is the source or resolves
  // to an invalid intent, an ancestor card must not silently take its place.
  const candidate = buildCandidate(targetElement, state, point);
  return candidate ? [candidate] : [];
};

const candidateObservation = (
  base: TaskDragObservation,
  candidate: TaskTargetCandidate,
  now: number,
): TaskDragObservation => ({
  ...base,
  targetKind: 'task-position',
  targetNodeId: candidate.nodeId,
  targetBoardId: candidate.boardId,
  targetWorkspaceId: candidate.workspaceId,
  targetSurfaceKind: candidate.surfaceKind,
  dropPosition: candidate.dropPosition,
  indicatorRect: candidate.indicatorRect,
  lockedTargetRect: candidate.rect,
  pendingTargetId: null,
  pendingSince: null,
  lastStableAt: now,
});

const lockedObservation = (
  base: TaskDragObservation,
  state: TaskDragSessionState,
  pendingTargetId: string | null,
  pendingSince: number | null,
): TaskDragObservation => ({
  ...base,
  targetKind: state.targetKind === 'task-position' ? 'task-position' : 'none',
  targetNodeId: state.hoverTargetId,
  targetBoardId: state.targetBoardId,
  targetWorkspaceId: state.targetWorkspaceId,
  targetSurfaceKind: state.targetSurfaceKind,
  dropPosition: state.dropPosition,
  indicatorRect: state.dropIndicatorRect,
  lockedTargetRect: state.lockedTargetRect,
  pendingTargetId,
  pendingSince,
  lastStableAt: state.lastStableAt,
});

const stabilizeCandidate = (
  base: TaskDragObservation,
  candidate: TaskTargetCandidate | null,
  state: TaskDragSessionState,
  intentPoint: Point,
): TaskDragObservation => {
  const now = base.observedAt;
  if (!state.hoverTargetId || !state.lockedTargetRect || state.targetKind !== 'task-position') {
    return candidate ? candidateObservation(base, candidate, now) : base;
  }

  if (candidate?.nodeId === state.hoverTargetId) return candidateObservation(base, candidate, now);

  // A deliberate move into the central area changes target immediately.
  if (candidate && pointInsideTargetCore(intentPoint, candidate.rect)) {
    return candidateObservation(base, candidate, now);
  }

  const withinRetainRegion = pointInsideRect(intentPoint, state.lockedTargetRect, MOBILE_TARGET_RETAIN_PX);
  if (!candidate) {
    const stillFresh = state.lastStableAt !== null && now - state.lastStableAt <= MOBILE_RELEASE_FRESHNESS_MS;
    return withinRetainRegion && stillFresh
      ? lockedObservation(base, state, null, null)
      : base;
  }

  const pendingSince = state.pendingTargetId === candidate.nodeId && state.pendingSince !== null
    ? state.pendingSince
    : now;
  // The old indicator may only survive while the pointer is geometrically near
  // its target. Time-based dwell here strands a stale line when a finger crosses
  // several compact rows before any single pending candidate reaches the timer.
  if (!withinRetainRegion) {
    return candidateObservation(base, candidate, now);
  }
  return lockedObservation(base, state, candidate.nodeId, pendingSince);
};

export const resolveTaskDragObservation = ({
  point,
  state,
  canMoveTask,
}: {
  point: Point;
  state: TaskDragSessionState;
  canMoveTask: boolean;
}): TaskDragObservation => {
  const observation = emptyObservation(state, point);
  const rawElement = document.elementFromPoint(point.x, point.y);
  const actionElement = rawElement instanceof Element
    ? rawElement.closest('[data-mobile-task-action]')
    : null;
  if (actionElement) {
    return {
      ...observation,
      targetKind: 'mobile-action',
      action: actionElement.getAttribute('data-mobile-task-action') as MobileTaskAction | null,
    };
  }

  if (rawElement instanceof Element && rawElement.closest('[data-kanban-add-task-button="true"]')) {
    return observation;
  }

  const intentPoint = getTaskIntentPoint(point);
  if (canMoveTask && state.source.kind !== 'workbench-unplaced-row') {
    const directCandidate = collectDirectCandidates(intentPoint, state)[0] || null;
    const stabilized = stabilizeCandidate(observation, directCandidate, state, intentPoint);
    if (stabilized.targetKind === 'task-position') return stabilized;
  }

  const placedLaneElement = document.elementFromPoint(intentPoint.x, intentPoint.y);
  const placedLane = placedLaneElement instanceof Element
    ? placedLaneElement.closest('[data-task-workbench-placed-board-lane="true"]') as HTMLElement | null
    : null;
  if (placedLane && state.source.kind === 'workbench-unplaced-row' && canMoveTask) {
    return {
      ...observation,
      targetKind: 'workbench-placed-lane',
      targetBoardId: placedLane.getAttribute('data-board-id'),
      targetWorkspaceId: placedLane.getAttribute('data-workspace-id'),
      targetSurfaceKind: 'workbench-placed-lane',
    };
  }

  return observation;
};

export const observationToSessionState = (
  state: TaskDragSessionState,
  observation: TaskDragObservation,
): TaskDragSessionState => ({
  ...state,
  sequence: observation.sequence,
  pointerX: observation.pointer?.x ?? state.pointerX,
  pointerY: observation.pointer?.y ?? state.pointerY,
  hoverAction: observation.action,
  hoverTargetId: observation.targetNodeId,
  targetBoardId: observation.targetBoardId,
  targetWorkspaceId: observation.targetWorkspaceId,
  targetSurfaceKind: observation.targetSurfaceKind,
  targetKind: observation.targetKind,
  dropPosition: observation.dropPosition,
  dropIndicatorRect: observation.indicatorRect,
  lockedTargetRect: observation.lockedTargetRect,
  pendingTargetId: observation.pendingTargetId,
  pendingSince: observation.pendingSince,
  lastStableAt: observation.lastStableAt,
});

const getEdgeScrollDelta = (position: number, min: number, max: number) => {
  if (position < min + EDGE_SCROLL_THRESHOLD_PX) {
    return -Math.min(
      EDGE_SCROLL_MAX_STEP_PX,
      Math.ceil(((min + EDGE_SCROLL_THRESHOLD_PX - position) / EDGE_SCROLL_THRESHOLD_PX) * EDGE_SCROLL_MAX_STEP_PX),
    );
  }
  if (position > max - EDGE_SCROLL_THRESHOLD_PX) {
    return Math.min(
      EDGE_SCROLL_MAX_STEP_PX,
      Math.ceil(((position - (max - EDGE_SCROLL_THRESHOLD_PX)) / EDGE_SCROLL_THRESHOLD_PX) * EDGE_SCROLL_MAX_STEP_PX),
    );
  }
  return 0;
};

const scrollElementBy = (element: HTMLElement, deltaX: number, deltaY: number) => {
  const beforeLeft = element.scrollLeft;
  const beforeTop = element.scrollTop;
  if (deltaX) element.scrollLeft += deltaX;
  if (deltaY) element.scrollTop += deltaY;
  return beforeLeft !== element.scrollLeft || beforeTop !== element.scrollTop;
};

const findAutoScrollColumn = (point: Point) => {
  const element = document.elementFromPoint(point.x, point.y);
  const direct = element instanceof Element
    ? element.closest('[data-mobile-pan-surface="kanban-column"]') as HTMLElement | null
    : null;
  if (direct) return direct;

  return (Array.from(document.querySelectorAll('[data-mobile-pan-surface="kanban-column"]')) as HTMLElement[])
    .find((column) => {
      const rect = column.getBoundingClientRect();
      return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top - 80 && point.y <= rect.bottom + 80;
    }) || null;
};

export const autoScrollTaskDragSurfaces = ({
  point,
  boardSurface,
}: {
  point: Point;
  boardSurface: HTMLElement | null;
}) => {
  const element = document.elementFromPoint(point.x, point.y);
  if (element instanceof Element && element.closest('[data-mobile-task-action-rail="true"]')) {
    return { didScroll: false, boardScrollLeft: boardSurface?.scrollLeft ?? null, columnScrollTop: null };
  }

  let didScroll = false;
  if (boardSurface) {
    const rect = boardSurface.getBoundingClientRect();
    const visibleLeft = Math.max(0, rect.left);
    const visibleRight = Math.min(window.innerWidth, rect.right);
    const deltaX = getEdgeScrollDelta(point.x, visibleLeft, visibleRight);
    if (deltaX) didScroll = scrollElementBy(boardSurface, deltaX, 0) || didScroll;
  }

  const columnSurface = findAutoScrollColumn(point);
  if (columnSurface) {
    const rect = columnSurface.getBoundingClientRect();
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(window.innerHeight, rect.bottom);
    const deltaY = getEdgeScrollDelta(point.y, visibleTop, visibleBottom);
    if (deltaY) didScroll = scrollElementBy(columnSurface, 0, deltaY) || didScroll;
  }

  return {
    didScroll,
    boardScrollLeft: boardSurface?.scrollLeft ?? null,
    columnScrollTop: columnSurface?.scrollTop ?? null,
  };
};
