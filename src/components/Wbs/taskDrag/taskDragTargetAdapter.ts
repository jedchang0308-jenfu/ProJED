import { useWbsStore } from '../../../store/useWbsStore';
import {
  resolveTaskDropOutcome,
  taskDragSourceKindToSurfaceKind,
  type TaskDropOutcome,
} from './taskDropIntent';
import { resolveTaskOriginFieldRect } from './desktopTaskDropPreview';
import { findTaskTitleAnchorElement } from './taskTitleAnchor';
import { findTaskOrderingGeometryElement } from './taskOrderingGeometry';
import {
  resolveDesktopColumnDropPointerRegion,
  resolveDesktopColumnTaskCacheYRange,
  selectNearestDesktopTaskGapCandidate,
  type DesktopColumnTaskRect,
} from './desktopColumnDropPolicy';
import {
  resolveMobileL1IndicatorRect,
  resolveMobileL1OrderingTarget,
  type MobileL1ColumnGeometry,
  type MobileL1OrderingTarget,
} from './mobileL1DropPolicy';
import { resolveMobileTaskEdgePosition } from './mobileTaskDropPolicy';
import {
  advanceTaskChildIntent,
  resolveTaskTitleChildDropTarget,
  resolveTaskTitleChildDropZone,
} from './taskChildDropTarget';
import type {
  MobileTaskAction,
  MobileTaskDropPosition,
  TaskDragObservation,
  TaskDragIndicatorAxis,
  TaskDragIndicatorRect,
  TaskDragOriginFieldRect,
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
  'workbench-unplaced-lane',
  'workbench-placed-lane',
  'none',
] as const;

type Point = { x: number; y: number };

interface TaskTargetCandidate {
  nodeId: string;
  boardId: string | null;
  workspaceId: string | null;
  surfaceKind: TaskDropSurfaceKind;
  outcomeKind: Exclude<TaskDropOutcome['kind'], 'invalid'>;
  dropPosition: MobileTaskDropPosition;
  rect: TaskDragTargetRect;
  indicatorRect: TaskDragIndicatorRect;
  indicatorAxis: TaskDragIndicatorAxis;
  originFieldRect: TaskDragOriginFieldRect | null;
}

interface BuildCandidateOptions {
  orderingPosition?: MobileTaskDropPosition;
  hitRect?: TaskDragTargetRect;
  indicatorRect?: TaskDragIndicatorRect;
  indicatorAxis?: TaskDragIndicatorAxis;
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
  indicatorAxis: null,
  originFieldRect: null,
  lockedTargetRect: null,
  pendingTargetId: null,
  pendingSince: null,
  lastStableAt: null,
  childIntentPhase: 'none',
  childTargetId: null,
  childTargetTitle: null,
  childDropIsOrigin: false,
  childCandidateSince: null,
  childPreviewRect: null,
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

const findMobileSourcePlaceholder = (nodeId: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-kanban-drag-source-placeholder="true"][data-task-id]'))
    .find((element) => element.getAttribute('data-task-id') === nodeId) || null;

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

const resolveMobileTaskSourceOriginFieldRect = (state: TaskDragSessionState) => {
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(state.source.kind);
  if (!sourceSurfaceKind || sourceSurfaceKind === 'workbench-unplaced-row') return null;
  const sourceElement = findMobileSourcePlaceholder(state.nodeId);
  if (!sourceElement) return null;
  return resolveTaskOriginFieldRect({ sourceElement, sourceSurfaceKind });
};

export const resolveMobileTaskOriginFieldRect = (
  state: TaskDragSessionState,
  point: Point,
) => {
  const originFieldRect = resolveMobileTaskSourceOriginFieldRect(state);
  if (!originFieldRect) return null;
  const sourceElement = findMobileSourcePlaceholder(state.nodeId);
  if (!sourceElement) return null;
  const sourceRect = toTargetRect(sourceElement.getBoundingClientRect());
  if (!pointInsideRect(point, sourceRect)) return null;
  return originFieldRect;
};

const buildCandidate = (
  targetElement: HTMLElement,
  state: TaskDragSessionState,
  point: Point,
  options: BuildCandidateOptions = {},
): TaskTargetCandidate | null => {
  const nodeId = targetElement.getAttribute('data-task-drop-node-id')
    || targetElement.getAttribute('data-task-id');
  const domSurfaceKind = readSurfaceKind(targetElement);
  if (!nodeId || nodeId === state.nodeId || !domSurfaceKind) return null;

  const nodes = useWbsStore.getState().nodes;
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(state.source.kind);
  const targetNode = nodes[nodeId];
  if (!sourceSurfaceKind || !targetNode || targetNode.isArchived) return null;
  const surfaceKind = domSurfaceKind;
  const outcome = resolveTaskDropOutcome({
    source: { nodeId: state.nodeId, surfaceKind: sourceSurfaceKind },
    target: {
      nodeId,
      surfaceKind,
      orderingPosition: options.orderingPosition,
    },
    nodesRecord: nodes,
  });
  if (outcome.kind === 'invalid') return null;
  const { intent } = outcome;

  const containerOwnsGeometry = surfaceKind === 'column-drop'
    || surfaceKind === 'root-drop'
    || surfaceKind === 'checklist-drop';
  const geometryElement = containerOwnsGeometry
    ? targetElement
    : targetElement.matches('[data-task-surface-source="true"]')
    ? targetElement
    : targetElement.querySelector<HTMLElement>('[data-task-surface-source="true"]') || targetElement;
  const domRect = geometryElement.getBoundingClientRect();
  const geometryRect = toTargetRect(domRect);
  const rect = options.hitRect || geometryRect;
  if (!pointInsideRect(point, rect)) return null;
  const orderingRect = toTargetRect((
    findTaskOrderingGeometryElement(targetElement, surfaceKind) || geometryElement
  ).getBoundingClientRect());
  const titleElement = findTaskTitleAnchorElement(geometryElement);
  const titleRect = titleElement?.getBoundingClientRect();
  const indicatorLeft = titleRect?.left ?? geometryRect.left;
  const dropPosition: MobileTaskDropPosition = intent.displayPosition === 'before' ? 'before' : 'after';
  return {
    nodeId,
    boardId: targetNode.boardId || null,
    workspaceId: targetNode.workspaceId || null,
    surfaceKind,
    outcomeKind: outcome.kind,
    dropPosition,
    rect,
    indicatorRect: options.indicatorRect || {
      left: indicatorLeft,
      top: surfaceKind === 'root-drop'
        ? geometryRect.top
        : dropPosition === 'after' ? orderingRect.bottom : orderingRect.top,
      width: Math.max(24, geometryRect.right - indicatorLeft),
    },
    indicatorAxis: options.indicatorAxis || 'horizontal',
    originFieldRect: outcome.kind === 'origin'
      ? resolveMobileTaskSourceOriginFieldRect(state) || state.sourceOriginFieldRect
      : null,
  };
};

const findMobileL1Columns = (boardCanvas: HTMLElement): Array<{
  element: HTMLElement;
  header: HTMLElement;
  geometry: MobileL1ColumnGeometry;
}> => Array.from(boardCanvas.querySelectorAll<HTMLElement>('[data-kanban-column="true"][data-task-id]'))
  .map((element) => {
    const id = element.getAttribute('data-task-id') || '';
    const header = element.querySelector<HTMLElement>(':scope > [data-kanban-column-header="true"]');
    const rect = element.getBoundingClientRect();
    return header ? {
      element,
      header,
      geometry: {
        id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
    } : null;
  })
  .filter((entry): entry is {
    element: HTMLElement;
    header: HTMLElement;
    geometry: MobileL1ColumnGeometry;
  } => Boolean(entry?.geometry.id && entry.geometry.right > entry.geometry.left));

const resolvePreviousMobileL1Target = (
  state: TaskDragSessionState,
  columns: MobileL1ColumnGeometry[],
): MobileL1OrderingTarget | null => {
  if (state.targetSurfaceKind !== 'column-header'
    || !state.hoverTargetId
    || !state.dropPosition) return null;
  const targetIndex = columns.findIndex(column => column.id === state.hoverTargetId);
  if (targetIndex < 0) return null;
  return {
    targetId: state.hoverTargetId,
    orderingPosition: state.dropPosition,
    boundaryIndex: targetIndex + (state.dropPosition === 'after' ? 1 : 0),
  };
};

const collectMobileL1Candidate = (
  targetElement: HTMLElement,
  state: TaskDragSessionState,
  point: Point,
): TaskTargetCandidate[] => {
  const boardCanvas = targetElement.closest<HTMLElement>('[data-layout-region="board-canvas"]');
  if (!boardCanvas) return [];
  const columns = findMobileL1Columns(boardCanvas);
  if (columns.length === 0) return [];
  const rootDropElement = boardCanvas.querySelector<HTMLElement>('[data-kanban-root-drop-zone="true"]');
  const isRootDrop = readSurfaceKind(targetElement) === 'root-drop';

  if (isRootDrop) {
    const last = columns[columns.length - 1];
    const rootRect = rootDropElement?.getBoundingClientRect() || null;
    const indicatorRect = resolveMobileL1IndicatorRect({
      targetId: last.geometry.id,
      orderingPosition: 'after',
      columns: columns.map(column => column.geometry),
      rootDropRect: rootRect,
      viewportRect: { top: 48, bottom: window.innerHeight - 8 },
    });
    if (!indicatorRect) return [];
    const candidate = buildCandidate(targetElement, state, point, {
      orderingPosition: 'after',
      indicatorRect,
      indicatorAxis: 'vertical',
    });
    return candidate ? [candidate] : [];
  }

  const orderingColumns = state.source.kind === 'column-header'
    ? columns.filter(column => column.geometry.id !== state.nodeId)
    : columns;
  const orderingGeometries = orderingColumns.map(column => column.geometry);
  const orderingTarget = resolveMobileL1OrderingTarget({
    pointerX: point.x,
    columns: orderingGeometries,
    previousTarget: resolvePreviousMobileL1Target(state, orderingGeometries),
  });
  if (!orderingTarget) return [];
  const target = columns.find(column => column.geometry.id === orderingTarget.targetId);
  if (!target) return [];
  const rootRect = rootDropElement?.getBoundingClientRect() || null;
  const indicatorRect = resolveMobileL1IndicatorRect({
    targetId: orderingTarget.targetId,
    orderingPosition: orderingTarget.orderingPosition,
    columns: columns.map(column => column.geometry),
    rootDropRect: rootRect,
    viewportRect: { top: 48, bottom: window.innerHeight - 8 },
  });
  if (!indicatorRect) return [];
  const candidate = buildCandidate(target.header, state, point, {
    orderingPosition: orderingTarget.orderingPosition,
    hitRect: toTargetRect(target.element.getBoundingClientRect()),
    indicatorRect,
    indicatorAxis: 'vertical',
  });
  return candidate ? [candidate] : [];
};

const findDirectColumnTaskScopes = (columnDrop: HTMLElement) => (
  Array.from(columnDrop.querySelectorAll<HTMLElement>(
    '[data-kanban-column-subtree-scope] > [data-task-surface-scope="true"][data-task-id]',
  )).filter(scope => scope.closest('[data-task-drop-surface-kind="column-drop"]') === columnDrop)
);

const collectMobileColumnOrderingCandidates = (
  columnDrop: HTMLElement,
  state: TaskDragSessionState,
  point: Point,
): TaskTargetCandidate[] => {
  const columnRect = toTargetRect(columnDrop.getBoundingClientRect());
  const taskScopes = findDirectColumnTaskScopes(columnDrop);
  const taskRects: DesktopColumnTaskRect[] = taskScopes.map(scope => {
    const rect = scope.getBoundingClientRect();
    return {
      id: scope.getAttribute('data-task-id') || '',
      top: rect.top,
      bottom: rect.bottom,
    };
  }).filter(rect => Boolean(rect.id));
  const region = resolveDesktopColumnDropPointerRegion({
    pointerY: point.y,
    columnTop: columnRect.top,
    columnBottom: columnRect.bottom,
    taskRects,
  });

  if (region.kind === 'none') return [];
  if (region.kind === 'column-append') {
    const appendAnchor = columnDrop.querySelector<HTMLElement>('[data-kanban-column-append-anchor="true"]');
    const appendRect = appendAnchor?.getBoundingClientRect();
    const titleAnchor = columnDrop.closest<HTMLElement>('[data-kanban-column="true"]')
      ?.querySelector<HTMLElement>('[data-task-direct-child-title-anchor="true"]');
    const anchorRect = titleAnchor?.getBoundingClientRect();
    const candidate = buildCandidate(columnDrop, state, point, {
      indicatorRect: {
        left: anchorRect?.left ?? columnRect.left,
        top: appendRect?.top ?? taskRects[taskRects.length - 1]?.bottom ?? columnRect.top,
        width: Math.max(24, columnRect.right - (anchorRect?.left ?? columnRect.left)),
      },
    });
    return candidate ? [candidate] : [];
  }

  const hitRange = resolveDesktopColumnTaskCacheYRange({
    pointerY: point.y,
    columnTop: columnRect.top,
    taskRects,
    candidateIds: region.candidateIds,
  });
  if (!hitRange) return [];
  const hitRect: TaskDragTargetRect = {
    left: columnRect.left,
    right: columnRect.right,
    top: hitRange.top,
    bottom: hitRange.bottom,
    width: columnRect.width,
    height: Math.max(0, hitRange.bottom - hitRange.top),
  };
  const candidates = region.candidateIds.map((id) => {
    const scope = taskScopes.find(candidate => candidate.getAttribute('data-task-id') === id);
    const primary = scope?.querySelector<HTMLElement>(':scope > [data-task-surface-source="true"]');
    if (!scope || !primary) return null;
    const scopeRect = scope.getBoundingClientRect();
    const previousPosition = state.hoverTargetId === id
      && state.targetSurfaceKind === 'kanban-card'
      ? state.dropPosition
      : null;
    const orderingPosition = resolveMobileTaskEdgePosition({
      pointerY: point.y,
      taskTop: scopeRect.top,
      taskBottom: scopeRect.bottom,
      previousPosition,
    });
    const candidate = buildCandidate(primary, state, point, { orderingPosition, hitRect });
    return candidate ? { ...candidate, id, indicatorTop: candidate.indicatorRect.top } : null;
  }).filter((candidate): candidate is TaskTargetCandidate & { id: string; indicatorTop: number } => Boolean(candidate));
  const nearest = selectNearestDesktopTaskGapCandidate({ pointerY: point.y, candidates });
  return nearest ? [nearest] : [];
};

const collectDirectCandidates = (point: Point, state: TaskDragSessionState) => {
  const element = document.elementFromPoint(point.x, point.y);
  const targetElement = element instanceof Element
    ? element.closest(
      '[data-mobile-drop-target][data-task-id], [data-mobile-drop-target][data-task-drop-node-id]',
    ) as HTMLElement | null
    : null;
  if (!targetElement) return [];

  const surfaceKind = readSurfaceKind(targetElement);
  if (state.source.kind === 'column-header'
    || surfaceKind === 'column-header'
    || surfaceKind === 'root-drop') {
    return collectMobileL1Candidate(targetElement, state, point);
  }
  if (surfaceKind === 'column-drop') {
    return collectMobileColumnOrderingCandidates(targetElement, state, point);
  }

  // The innermost task surface owns the point. If it is the source or resolves
  // to an invalid intent, an ancestor card must not silently take its place.
  const nodeId = targetElement.getAttribute('data-task-drop-node-id')
    || targetElement.getAttribute('data-task-id');
  const orderingElement = surfaceKind
    ? findTaskOrderingGeometryElement(targetElement, surfaceKind)
    : null;
  const orderingRect = orderingElement?.getBoundingClientRect();
  const previousPosition = nodeId === state.hoverTargetId
    && surfaceKind === state.targetSurfaceKind
    ? state.dropPosition
    : null;
  const orderingPosition = orderingRect
    ? resolveMobileTaskEdgePosition({
      pointerY: point.y,
      taskTop: orderingRect.top,
      taskBottom: orderingRect.bottom,
      previousPosition,
    })
    : undefined;
  const candidate = buildCandidate(targetElement, state, point, { orderingPosition });
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
  indicatorRect: candidate.outcomeKind === 'move' ? candidate.indicatorRect : null,
  indicatorAxis: candidate.outcomeKind === 'move' ? candidate.indicatorAxis : null,
  originFieldRect: candidate.outcomeKind === 'origin' ? candidate.originFieldRect : null,
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
  indicatorAxis: state.dropIndicatorAxis,
  originFieldRect: state.originFieldRect,
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

  const originFieldRect = resolveMobileTaskOriginFieldRect(state, point);
  if (originFieldRect) {
    return {
      ...observation,
      originFieldRect,
    };
  }

  const intentPoint = getTaskIntentPoint(point);
  const unplacedLane = rawElement instanceof Element
    ? rawElement.closest('[data-task-workbench-unplaced-lane="true"]') as HTMLElement | null
    : null;
  if (unplacedLane && state.source.kind !== 'workbench-unplaced-row' && canMoveTask) {
    const unplacedList = unplacedLane.querySelector<HTMLElement>('[data-task-workbench-unclassified-list="true"]');
    if (unplacedList) {
      const listRect = unplacedList.getBoundingClientRect();
      const visibleRows = Array.from(
        unplacedList.querySelectorAll<HTMLElement>('[data-task-workbench-unplaced-task-card="true"]'),
      ).filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const lastRowRect = visibleRows[visibleRows.length - 1]?.getBoundingClientRect();
      return {
        ...observation,
        targetKind: 'workbench-unplaced-lane',
        targetSurfaceKind: 'workbench-unplaced-lane',
        indicatorRect: {
          left: listRect.left,
          top: lastRowRect?.bottom ?? listRect.top,
          width: listRect.width,
        },
        indicatorAxis: 'horizontal',
        lockedTargetRect: toTargetRect(unplacedLane.getBoundingClientRect()),
        lastStableAt: observation.observedAt,
      };
    }
  }

  if (canMoveTask) {
    if (state.source.kind !== 'workbench-unplaced-row') {
      const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(state.source.kind);
      const nodesRecord = useWbsStore.getState().nodes;
      const childZone = resolveTaskTitleChildDropZone({
        point: intentPoint,
        inputMode: state.source.inputMode,
        nodesRecord,
      });
      const childTarget = sourceSurfaceKind
        ? resolveTaskTitleChildDropTarget({
          point: intentPoint,
          inputMode: state.source.inputMode,
          sourceNodeId: state.nodeId,
          sourceSurfaceKind,
          nodesRecord,
        })
        : null;
      const childIntent = advanceTaskChildIntent({
        current: {
          phase: state.childIntentPhase,
          targetId: state.childTargetId,
          candidateSince: state.childCandidateSince,
        },
        targetId: childTarget?.targetNodeId || null,
        now: observation.observedAt,
      });
      if (childTarget && childIntent.phase !== 'none') {
        const armed = childIntent.phase === 'armed';
        const targetNode = useWbsStore.getState().nodes[childTarget.targetNodeId];
        const childObservation = {
          childIntentPhase: childIntent.phase,
          childTargetId: childTarget.targetNodeId,
          childTargetTitle: childTarget.targetTitle,
          childDropIsOrigin: childTarget.isOrigin,
          childCandidateSince: childIntent.candidateSince,
          childPreviewRect: childTarget.previewRect,
        } as const;
        if (!armed) {
          const directCandidate = collectDirectCandidates(intentPoint, state)[0] || null;
          const stabilized = stabilizeCandidate(observation, directCandidate, state, intentPoint);
          return {
            ...stabilized,
            ...childObservation,
          };
        }
        return {
          ...observation,
          targetKind: 'task-position',
          targetNodeId: childTarget.targetNodeId,
          targetBoardId: targetNode?.boardId || null,
          targetWorkspaceId: targetNode?.workspaceId || null,
          targetSurfaceKind: childTarget.targetSurfaceKind,
          dropPosition: 'after',
          lockedTargetRect: childTarget.previewRect.safe,
          lastStableAt: observation.observedAt,
          ...childObservation,
        };
      }

      // A title center owns the gesture even when self/descendant/stale rules
      // make it invalid. Never reinterpret that same point as row reordering.
      if (childZone) return observation;
    }

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
  dropIndicatorAxis: observation.indicatorAxis,
  originFieldRect: observation.originFieldRect,
  lockedTargetRect: observation.lockedTargetRect,
  pendingTargetId: observation.pendingTargetId,
  pendingSince: observation.pendingSince,
  lastStableAt: observation.lastStableAt,
  childIntentPhase: observation.childIntentPhase,
  childTargetId: observation.childTargetId,
  childTargetTitle: observation.childTargetTitle,
  childDropIsOrigin: observation.childDropIsOrigin,
  childCandidateSince: observation.childCandidateSince,
  childPreviewRect: observation.childPreviewRect,
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
