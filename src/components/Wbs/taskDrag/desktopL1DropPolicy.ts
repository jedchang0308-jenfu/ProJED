import type { TaskDragIndicatorRect } from './taskDragTypes';

export const DESKTOP_L1_MIDPOINT_HYSTERESIS_PX = 14;
export const DESKTOP_L1_INSERTION_RAIL_WIDTH_PX = 6;
export const DESKTOP_L1_FALLBACK_GAP_PX = 12;

export interface DesktopL1ColumnGeometry {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface DesktopL1OrderingTarget {
  targetId: string;
  orderingPosition: 'before' | 'after';
  boundaryIndex: number;
}

const orderedColumns = (columns: DesktopL1ColumnGeometry[]) => (
  [...columns]
    .filter(column => column.id && column.right > column.left && column.bottom >= column.top)
    .sort((left, right) => left.left - right.left)
);

const getBoundaryIndex = (
  columnIndex: number,
  orderingPosition: DesktopL1OrderingTarget['orderingPosition'],
) => columnIndex + (orderingPosition === 'after' ? 1 : 0);

const targetAtColumnMidpoint = ({
  pointerX,
  column,
  columnIndex,
  previousTarget,
  hysteresisPx,
}: {
  pointerX: number;
  column: DesktopL1ColumnGeometry;
  columnIndex: number;
  previousTarget: DesktopL1OrderingTarget | null;
  hysteresisPx: number;
}): DesktopL1OrderingTarget => {
  const midpoint = (column.left + column.right) / 2;
  let orderingPosition: DesktopL1OrderingTarget['orderingPosition'];

  if (previousTarget?.targetId === column.id) {
    orderingPosition = previousTarget.orderingPosition === 'before'
      ? (pointerX > midpoint + hysteresisPx ? 'after' : 'before')
      : (pointerX < midpoint - hysteresisPx ? 'before' : 'after');
  } else {
    orderingPosition = pointerX < midpoint ? 'before' : 'after';
  }

  return {
    targetId: column.id,
    orderingPosition,
    boundaryIndex: getBoundaryIndex(columnIndex, orderingPosition),
  };
};

export const resolveDesktopL1OrderingTarget = ({
  pointerX,
  columns,
  previousTarget = null,
  hysteresisPx = DESKTOP_L1_MIDPOINT_HYSTERESIS_PX,
}: {
  pointerX: number;
  columns: DesktopL1ColumnGeometry[];
  previousTarget?: DesktopL1OrderingTarget | null;
  hysteresisPx?: number;
}): DesktopL1OrderingTarget | null => {
  const ordered = orderedColumns(columns);
  if (ordered.length === 0 || !Number.isFinite(pointerX)) return null;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (pointerX <= first.left) {
    return { targetId: first.id, orderingPosition: 'before', boundaryIndex: 0 };
  }
  if (pointerX >= last.right) {
    return { targetId: last.id, orderingPosition: 'after', boundaryIndex: ordered.length };
  }

  const containingIndex = ordered.findIndex(column => (
    pointerX >= column.left && pointerX <= column.right
  ));
  if (containingIndex >= 0) {
    return targetAtColumnMidpoint({
      pointerX,
      column: ordered[containingIndex],
      columnIndex: containingIndex,
      previousTarget,
      hysteresisPx,
    });
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    if (pointerX <= left.right || pointerX >= right.left) continue;
    const boundaryIndex = index + 1;
    if (previousTarget?.boundaryIndex === boundaryIndex) return previousTarget;
    return pointerX <= (left.right + right.left) / 2
      ? { targetId: left.id, orderingPosition: 'after', boundaryIndex }
      : { targetId: right.id, orderingPosition: 'before', boundaryIndex };
  }

  const nearestIndex = ordered.reduce((bestIndex, column, index) => {
    const best = ordered[bestIndex];
    const columnDistance = Math.abs(pointerX - (column.left + column.right) / 2);
    const bestDistance = Math.abs(pointerX - (best.left + best.right) / 2);
    return columnDistance < bestDistance ? index : bestIndex;
  }, 0);
  return targetAtColumnMidpoint({
    pointerX,
    column: ordered[nearestIndex],
    columnIndex: nearestIndex,
    previousTarget,
    hysteresisPx,
  });
};

export const resolveDesktopL1IndicatorRect = ({
  targetId,
  orderingPosition,
  columns,
  rootDropRect = null,
  viewportRect = null,
}: {
  targetId: string;
  orderingPosition: 'before' | 'after';
  columns: DesktopL1ColumnGeometry[];
  rootDropRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'> | null;
  viewportRect?: Pick<DOMRect, 'top' | 'bottom'> | null;
}): TaskDragIndicatorRect | null => {
  const ordered = orderedColumns(columns);
  if (ordered.length === 0 && rootDropRect) {
    const rawTop = rootDropRect.top;
    const rawBottom = rootDropRect.bottom;
    const top = viewportRect ? Math.max(rawTop, viewportRect.top) : rawTop;
    const bottom = viewportRect ? Math.min(rawBottom, viewportRect.bottom) : rawBottom;
    if (bottom <= top) return null;
    return {
      left: rootDropRect.left,
      top,
      width: DESKTOP_L1_INSERTION_RAIL_WIDTH_PX,
      height: bottom - top,
    };
  }
  const targetIndex = ordered.findIndex(column => column.id === targetId);
  if (targetIndex < 0) return null;

  const target = ordered[targetIndex];
  const neighbor = orderingPosition === 'before'
    ? ordered[targetIndex - 1]
    : ordered[targetIndex + 1];
  const boundaryCenter = orderingPosition === 'before'
    ? neighbor
      ? (neighbor.right + target.left) / 2
      : target.left - DESKTOP_L1_FALLBACK_GAP_PX / 2
    : neighbor
      ? (target.right + neighbor.left) / 2
      : rootDropRect && rootDropRect.left >= target.right
        ? (target.right + rootDropRect.left) / 2
        : target.right + DESKTOP_L1_FALLBACK_GAP_PX / 2;

  const relatedColumns = neighbor ? [target, neighbor] : [target];
  const rawTop = Math.min(...relatedColumns.map(column => column.top));
  const rawBottom = Math.max(...relatedColumns.map(column => column.bottom));
  const top = viewportRect ? Math.max(rawTop, viewportRect.top) : rawTop;
  const bottom = viewportRect ? Math.min(rawBottom, viewportRect.bottom) : rawBottom;
  if (bottom <= top) return null;

  return {
    left: boundaryCenter - DESKTOP_L1_INSERTION_RAIL_WIDTH_PX / 2,
    top,
    width: DESKTOP_L1_INSERTION_RAIL_WIDTH_PX,
    height: bottom - top,
  };
};
