export type MindMapWorldPoint = { x: number; y: number };
export type MindMapClientPoint = { x: number; y: number };

export type MindMapWorldRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type MindMapSceneSize = { width: number; height: number };
export type MindMapViewportSize = { width: number; height: number };

export type MindMapSceneLayout = {
  scale: number;
  translateX: number;
  translateY: number;
  sceneWidth: number;
  sceneHeight: number;
  stageWidth: number;
  stageHeight: number;
};

export type MindMapViewportSnapshot = {
  left: number;
  top: number;
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
};

export interface MindMapCoordinateMapper {
  readonly layout: MindMapSceneLayout;
  readonly viewport: MindMapViewportSnapshot;
  worldToClient(point: MindMapWorldPoint): MindMapClientPoint;
  clientToWorld(point: MindMapClientPoint): MindMapWorldPoint;
  elementToWorldRect(element: HTMLElement): MindMapWorldRect;
}

const finiteOr = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

export const deriveMindMapSceneLayout = (
  scene: MindMapSceneSize,
  viewport: MindMapViewportSize,
  scale: number,
): MindMapSceneLayout => {
  const safeScale = Math.max(0.01, finiteOr(scale, 1));
  const sceneWidth = Math.max(1, finiteOr(scene.width, 1));
  const sceneHeight = Math.max(1, finiteOr(scene.height, 1));
  const viewportWidth = Math.max(0, finiteOr(viewport.width, 0));
  const viewportHeight = Math.max(0, finiteOr(viewport.height, 0));
  const scaledWidth = sceneWidth * safeScale;
  const scaledHeight = sceneHeight * safeScale;
  // Keep a full viewport of world-space breathing room around the scene.
  // The stage is the scroll owner, so this padding must be part of its
  // explicit untransformed size rather than an incidental transformed child.
  // It preserves edge reachability for middle-mouse panning at every scale.
  const stageWidth = Math.max(viewportWidth * 2, scaledWidth);
  const stageHeight = Math.max(viewportHeight * 2, scaledHeight);

  return {
    scale: safeScale,
    translateX: (stageWidth - scaledWidth) / 2,
    translateY: (stageHeight - scaledHeight) / 2,
    sceneWidth,
    sceneHeight,
    stageWidth,
    stageHeight,
  };
};

export const worldToClient = (
  point: MindMapWorldPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapClientPoint => ({
  x: viewport.left + layout.translateX + point.x * layout.scale - viewport.scrollLeft,
  y: viewport.top + layout.translateY + point.y * layout.scale - viewport.scrollTop,
});

export const clientToWorld = (
  point: MindMapClientPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapWorldPoint => ({
  x: (point.x - viewport.left + viewport.scrollLeft - layout.translateX) / layout.scale,
  y: (point.y - viewport.top + viewport.scrollTop - layout.translateY) / layout.scale,
});

export const getAnchoredMindMapScroll = (
  worldAnchor: MindMapWorldPoint,
  clientAnchor: MindMapClientPoint,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
) => ({
  left: viewport.left + layout.translateX + worldAnchor.x * layout.scale - clientAnchor.x,
  top: viewport.top + layout.translateY + worldAnchor.y * layout.scale - clientAnchor.y,
});

export const clampMindMapScroll = (
  scroll: { left: number; top: number },
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSize,
) => ({
  left: Math.min(
    Math.max(0, layout.stageWidth - Math.max(0, finiteOr(viewport.width, 0))),
    Math.max(0, finiteOr(scroll.left, 0)),
  ),
  top: Math.min(
    Math.max(0, layout.stageHeight - Math.max(0, finiteOr(viewport.height, 0))),
    Math.max(0, finiteOr(scroll.top, 0)),
  ),
});

export const createMindMapCoordinateMapper = (
  scene: HTMLElement,
  layout: MindMapSceneLayout,
  viewport: MindMapViewportSnapshot,
): MindMapCoordinateMapper => ({
  layout,
  viewport,
  worldToClient: point => worldToClient(point, layout, viewport),
  clientToWorld: point => clientToWorld(point, layout, viewport),
  elementToWorldRect: element => {
    const rect = element.getBoundingClientRect();
    // Measure against the transformed scene's own border-box origin. This
    // removes stage padding/scroll offsets that are not part of world space,
    // while retaining one inverse matrix for every node and overlay.
    const sceneRect = scene.getBoundingClientRect();
    const safeScale = Math.max(0.01, layout.scale);
    const left = (rect.left - sceneRect.left) / safeScale;
    const top = (rect.top - sceneRect.top) / safeScale;
    const right = (rect.right - sceneRect.left) / safeScale;
    const bottom = (rect.bottom - sceneRect.top) / safeScale;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  },
});
