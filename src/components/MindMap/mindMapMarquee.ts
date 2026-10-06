export const MINDMAP_MARQUEE_THRESHOLD_PX = 6;

export type ClientPoint = Readonly<{ x: number; y: number }>;
export type ClientRectBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type MindMapMarqueeNodeCenter = Readonly<{
  placementId: string;
  nodeId: string;
  x: number;
  y: number;
}>;

export const getClientRectBounds = (start: ClientPoint, current: ClientPoint): ClientRectBounds => ({
  left: Math.min(start.x, current.x),
  top: Math.min(start.y, current.y),
  right: Math.max(start.x, current.x),
  bottom: Math.max(start.y, current.y),
});

export const hasReachedMindMapMarqueeThreshold = (start: ClientPoint, current: ClientPoint) => (
  Math.hypot(current.x - start.x, current.y - start.y) >= MINDMAP_MARQUEE_THRESHOLD_PX
);

export const getMindMapMarqueeHits = (
  bounds: ClientRectBounds,
  centers: readonly MindMapMarqueeNodeCenter[],
) => centers.filter(center => (
  center.x >= bounds.left
  && center.x <= bounds.right
  && center.y >= bounds.top
  && center.y <= bounds.bottom
));

export const getMindMapMarqueePrimary = (
  hitPlacementIds: readonly string[],
  previousPrimaryPlacementId: string | null,
  navigationPlacementIds: readonly string[],
) => {
  if (previousPrimaryPlacementId && hitPlacementIds.includes(previousPrimaryPlacementId)) {
    return previousPrimaryPlacementId;
  }
  const hits = new Set(hitPlacementIds);
  return navigationPlacementIds.find(placementId => hits.has(placementId)) || hitPlacementIds[0] || null;
};

export const getMindMapMarqueeOverlayStyle = (
  bounds: ClientRectBounds,
) => ({
  left: bounds.left,
  top: bounds.top,
  width: Math.max(0, bounds.right - bounds.left),
  height: Math.max(0, bounds.bottom - bounds.top),
});
