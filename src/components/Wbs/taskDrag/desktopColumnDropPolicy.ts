export const DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX = 32;
export const DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX = 12;

export const isDesktopPointerInColumnTailExterior = ({
  pointerX,
  pointerY,
  columnLeft,
  columnRight,
  columnBottom,
  exteriorSlopPx = DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX,
}: {
  pointerX: number;
  pointerY: number;
  columnLeft: number;
  columnRight: number;
  columnBottom: number;
  exteriorSlopPx?: number;
}) => pointerX >= columnLeft
  && pointerX <= columnRight
  && pointerY > columnBottom
  && pointerY <= columnBottom + Math.max(0, exteriorSlopPx);

export interface DesktopColumnTaskRect {
  id: string;
  top: number;
  bottom: number;
}

export type DesktopColumnDropPointerRegion =
  | { kind: 'task-nearest'; candidateIds: string[] }
  | { kind: 'column-append' }
  | { kind: 'none' };

export const resolveDesktopTaskEdgePosition = ({
  pointerY,
  taskTop,
  taskBottom,
}: {
  pointerY: number;
  taskTop: number;
  taskBottom: number;
}): 'before' | 'after' => (
  pointerY <= taskTop + Math.max(0, taskBottom - taskTop) / 2 ? 'before' : 'after'
);

export const resolveDesktopColumnTaskCacheYRange = ({
  pointerY,
  columnTop,
  taskRects,
  candidateIds,
}: {
  pointerY: number;
  columnTop: number;
  taskRects: DesktopColumnTaskRect[];
  candidateIds: string[];
}): { top: number; bottom: number } | null => {
  const ordered = taskRects
    .filter(rect => Number.isFinite(rect.top) && Number.isFinite(rect.bottom) && rect.bottom >= rect.top)
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  const candidates = candidateIds
    .map(id => ordered.find(rect => rect.id === id))
    .filter((rect): rect is DesktopColumnTaskRect => Boolean(rect));

  if (candidates.length >= 2) {
    // The whole visual gap represents one same-level insertion slot, even when
    // its nearest rendered edge changes from the upper card to the lower card.
    const upper = candidates[0];
    const lower = candidates[candidates.length - 1];
    return { top: upper.bottom, bottom: lower.top };
  }

  const task = candidates[0];
  if (!task) return null;
  if (pointerY < task.top) return { top: columnTop, bottom: task.top };
  const midpoint = task.top + Math.max(0, task.bottom - task.top) / 2;
  return pointerY <= midpoint
    ? { top: task.top, bottom: midpoint }
    : { top: midpoint, bottom: task.bottom };
};

export const resolveDesktopColumnDropPointerRegion = ({
  pointerY,
  columnTop,
  columnBottom,
  taskRects,
  tailZonePx = DESKTOP_COLUMN_APPEND_TAIL_ZONE_PX,
}: {
  pointerY: number;
  columnTop: number;
  columnBottom: number;
  taskRects: DesktopColumnTaskRect[];
  tailZonePx?: number;
}): DesktopColumnDropPointerRegion => {
  if (pointerY < columnTop || pointerY > columnBottom) return { kind: 'none' };

  const ordered = taskRects
    .filter(rect => Number.isFinite(rect.top) && Number.isFinite(rect.bottom) && rect.bottom >= rect.top)
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  if (ordered.length === 0) return { kind: 'column-append' };

  const first = ordered[0];
  if (pointerY < first.top) {
    return { kind: 'task-nearest', candidateIds: [first.id] };
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (pointerY >= current.top && pointerY <= current.bottom) {
      return { kind: 'task-nearest', candidateIds: [current.id] };
    }

    const next = ordered[index + 1];
    if (next && pointerY > current.bottom && pointerY < next.top) {
      return { kind: 'task-nearest', candidateIds: [current.id, next.id] };
    }
  }

  const last = ordered[ordered.length - 1];
  const tailBottom = Math.min(columnBottom, last.bottom + Math.max(0, tailZonePx));
  return pointerY >= last.bottom && pointerY <= tailBottom
    ? { kind: 'column-append' }
    : { kind: 'none' };
};

export const selectNearestDesktopTaskGapCandidate = <T extends {
  id: string;
  indicatorTop: number;
}>({
  pointerY,
  candidates,
}: {
  pointerY: number;
  candidates: T[];
}): T | null => candidates.reduce<T | null>((nearest, candidate) => {
  if (!nearest) return candidate;
  const nearestDistance = Math.abs(nearest.indicatorTop - pointerY);
  const candidateDistance = Math.abs(candidate.indicatorTop - pointerY);
  return candidateDistance < nearestDistance ? candidate : nearest;
}, null);
