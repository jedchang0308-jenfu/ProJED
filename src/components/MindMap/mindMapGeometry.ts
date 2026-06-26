import type { MindMapDirection } from './MindMapNode';

export interface MindMapConnectorPath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  depth: number;
  direction: MindMapDirection;
  d: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface MindMapNoteRelationship {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  label: string;
  createdAt: number;
  updatedAt: number;
  style?: MindMapRelationshipStyle;
  geometry?: MindMapRelationshipGeometry;
}

export interface MindMapRelationshipStyle {
  strokeColor?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  labelColor?: string;
  labelFontSize?: number;
}

export interface MindMapRelationshipGeometry {
  fromAnchor?: MindMapRelationshipAnchor;
  toAnchor?: MindMapRelationshipAnchor;
  controlPoints?: MindMapRelationshipPoint[];
}

export interface MindMapRelationshipAnchor {
  xRatio: number;
  yRatio: number;
}

export interface MindMapRelationshipPoint {
  x: number;
  y: number;
}

export interface MindMapLayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MindMapRelationshipPath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  d: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  c1X: number;
  c1Y: number;
  c2X: number;
  c2Y: number;
  labelX: number;
  labelY: number;
  style: Required<MindMapRelationshipStyle>;
}

export interface MindMapRelationshipDraftPreview {
  fromNodeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  c1X: number;
  c1Y: number;
  c2X: number;
  c2Y: number;
  d: string;
}

const defaultRelationshipStyle: Required<MindMapRelationshipStyle> = {
  strokeColor: '#0284c7',
  strokeWidth: 2.25,
  strokeDasharray: '7 6',
  arrowStart: false,
  arrowEnd: true,
  labelColor: '#334155',
  labelFontSize: 12,
};

export const relationshipColorOptions = ['#0284c7', '#0f172a', '#16a34a', '#dc2626', '#9333ea', '#f97316'];
export const relationshipWidthOptions = [1.5, 2.25, 3.5];
export const relationshipDashOptions = [
  { label: '??', value: '' },
  { label: '??', value: '7 6' },
  { label: '??', value: '2 5' },
];
const mergeRelationshipStyle = (style?: MindMapRelationshipStyle): Required<MindMapRelationshipStyle> => ({
  ...defaultRelationshipStyle,
  ...style,
});

export const clampRatio = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));

const isFinitePoint = (point?: MindMapRelationshipPoint): point is MindMapRelationshipPoint =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

const isReasonableRelationshipControlPoint = (
  point: MindMapRelationshipPoint | undefined,
  anchor: MindMapRelationshipPoint,
  oppositeAnchor: MindMapRelationshipPoint,
) => {
  if (!isFinitePoint(point)) return false;
  const anchorDistance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
  const endpointDistance = Math.hypot(oppositeAnchor.x - anchor.x, oppositeAnchor.y - anchor.y);
  const maxControlArm = Math.max(220, Math.min(560, endpointDistance * 1.4 + 120));
  return anchorDistance <= maxControlArm;
};

const getCubicPoint = (
  p0: MindMapRelationshipPoint,
  p1: MindMapRelationshipPoint,
  p2: MindMapRelationshipPoint,
  p3: MindMapRelationshipPoint,
  t: number,
): MindMapRelationshipPoint => {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
};

export const getRelationshipCurveHitSegments = (path: MindMapRelationshipPath) => {
  const p0 = { x: path.fromX, y: path.fromY };
  const p1 = { x: path.c1X, y: path.c1Y };
  const p2 = { x: path.c2X, y: path.c2Y };
  const p3 = { x: path.toX, y: path.toY };
  const samples = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1].map(t => getCubicPoint(p0, p1, p2, p3, t));
  return samples.slice(0, -1).map((start, index) => {
    const end = samples[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return {
      index,
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      length: Math.max(28, Math.hypot(dx, dy) + 18),
      angle: Math.atan2(dy, dx),
    };
  });
};

export const createLocalConnectorPath = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  direction: MindMapDirection,
) => {
  const delta = Math.max(Math.abs(toX - fromX) * 0.45, 42);
  const c1X = direction === 'right' ? fromX + delta : fromX - delta;
  const c2X = direction === 'right' ? toX - delta : toX + delta;
  return `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${fromY.toFixed(2)} ${c2X.toFixed(2)} ${toY.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
};

export const makeConnectorPath = (
  fromRect: MindMapLayoutRect,
  toRect: MindMapLayoutRect,
  direction: MindMapDirection,
  variant: 'curve' | 'bracket' = 'curve',
) => {
  const fromX = direction === 'right' ? fromRect.right : fromRect.left;
  const toX = direction === 'right' ? toRect.left : toRect.right;
  const fromY = fromRect.top + fromRect.height / 2;
  const toY = toRect.top + toRect.height / 2;
  if (variant === 'bracket') {
    const gap = Math.max(Math.min(Math.abs(toX - fromX) * 0.42, 72), 34);
    const trunkX = direction === 'right'
      ? Math.min(fromX + gap, toX - 18)
      : Math.max(fromX - gap, toX + 18);
    return {
      d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} H ${trunkX.toFixed(2)} V ${toY.toFixed(2)} H ${toX.toFixed(2)}`,
      fromX,
      fromY,
      toX,
      toY,
    };
  }
  return {
    d: createLocalConnectorPath(fromX, fromY, toX, toY, direction),
    fromX,
    fromY,
    toX,
    toY,
  };
};

export const makeRelationshipPath = (
  relationship: MindMapNoteRelationship,
  fromRect: MindMapLayoutRect,
  toRect: MindMapLayoutRect,
) => {
  const style = mergeRelationshipStyle(relationship.style);
  const fromCenterX = fromRect.left + fromRect.width / 2;
  const toCenterX = toRect.left + toRect.width / 2;
  const exitsRight = fromCenterX <= toCenterX;
  const fromAnchor = relationship.geometry?.fromAnchor;
  const toAnchor = relationship.geometry?.toAnchor;
  const fromX = fromAnchor
    ? fromRect.left + fromRect.width * clampRatio(fromAnchor.xRatio)
    : (exitsRight ? fromRect.right : fromRect.left);
  const toX = toAnchor
    ? toRect.left + toRect.width * clampRatio(toAnchor.xRatio)
    : (exitsRight ? toRect.left : toRect.right);
  const fromY = fromAnchor
    ? fromRect.top + fromRect.height * clampRatio(fromAnchor.yRatio)
    : fromRect.top + fromRect.height / 2;
  const toY = toAnchor
    ? toRect.top + toRect.height * clampRatio(toAnchor.yRatio)
    : toRect.top + toRect.height / 2;
  const horizontalSpan = Math.abs(toX - fromX);
  const verticalSpan = Math.abs(toY - fromY);
  const curveOffset = Math.max(44, Math.min(96, horizontalSpan * 0.34 + verticalSpan * 0.2));
  const [controlOne, controlTwo] = relationship.geometry?.controlPoints || [];
  const canUseStoredControls =
    isReasonableRelationshipControlPoint(controlOne, { x: fromX, y: fromY }, { x: toX, y: toY }) &&
    isReasonableRelationshipControlPoint(controlTwo, { x: toX, y: toY }, { x: fromX, y: fromY });
  const c1X = canUseStoredControls ? controlOne.x : (exitsRight ? fromX + curveOffset : fromX - curveOffset);
  const c1Y = canUseStoredControls ? controlOne.y : fromY;
  const c2X = canUseStoredControls ? controlTwo.x : (exitsRight ? toX + curveOffset : toX - curveOffset);
  const c2Y = canUseStoredControls ? controlTwo.y : toY;
  const labelX = (c1X + c2X) / 2;
  const labelY = (c1Y + c2Y) / 2;

  return {
    d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${c1Y.toFixed(2)} ${c2X.toFixed(2)} ${c2Y.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`,
    fromX,
    fromY,
    toX,
    toY,
    c1X,
    c1Y,
    c2X,
    c2Y,
    labelX,
    labelY,
    style,
  };
};

export const makeRelationshipDraftPreview = (
  fromNodeId: string,
  sourceRect: MindMapLayoutRect,
  cursor: MindMapRelationshipPoint,
): MindMapRelationshipDraftPreview => {
  const exitsRight = cursor.x >= sourceRect.left + sourceRect.width / 2;
  const fromX = exitsRight ? sourceRect.right : sourceRect.left;
  const fromY = sourceRect.top + sourceRect.height / 2;
  const toX = cursor.x;
  const toY = cursor.y;
  const offset = Math.max(72, Math.min(180, Math.abs(toX - fromX) * 0.55 + Math.abs(toY - fromY) * 0.18));
  const c1X = exitsRight ? fromX + offset : fromX - offset;
  const c2X = exitsRight ? toX - offset * 0.45 : toX + offset * 0.45;
  const c1Y = fromY;
  const c2Y = toY;

  return {
    fromNodeId,
    fromX,
    fromY,
    toX,
    toY,
    c1X,
    c1Y,
    c2X,
    c2Y,
    d: `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} C ${c1X.toFixed(2)} ${c1Y.toFixed(2)} ${c2X.toFixed(2)} ${c2Y.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`,
  };
};
