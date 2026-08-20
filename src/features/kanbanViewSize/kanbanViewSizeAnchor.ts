import type {
  KanbanViewAnchor,
  KanbanViewAnchorKind,
  KanbanViewSizeChangeOrigin,
} from './kanbanViewSize';

export interface KanbanViewportAdapter {
  capture: (origin: KanbanViewSizeChangeOrigin) => KanbanViewAnchor | null;
  restore: (anchor: KanbanViewAnchor) => { driftPx: number; clamped: boolean };
  clear: () => void;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

const closestInside = <T extends Element>(target: EventTarget | null, selector: string, root: Element) => {
  if (!(target instanceof Element)) return null;
  const element = target.closest<T>(selector);
  return element && root.contains(element) ? element : null;
};

const findByDataId = (root: Element, selector: string, id: string | null) => {
  if (!id) return null;
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .find((element) => element.getAttribute('data-task-id') === id) || null;
};

const isVisible = (rect: DOMRect, rootRect: DOMRect) =>
  rect.bottom > rootRect.top && rect.top < rootRect.bottom
  && rect.right > rootRect.left && rect.left < rootRect.right;

const getBoardContentPoint = (surface: HTMLElement, clientX: number, clientY: number) => {
  const rect = surface.getBoundingClientRect();
  return { x: surface.scrollLeft + clientX - rect.left, y: clientY - rect.top };
};

export const createKanbanViewportAdapter = (
  getSurface: () => HTMLElement | null,
  getScopeKey: () => string | null,
): KanbanViewportAdapter => {
  let pending = false;

  const clear = () => { pending = false; };

  const capture = (origin: KanbanViewSizeChangeOrigin): KanbanViewAnchor | null => {
    const surface = getSurface();
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const clientX = origin.kind === 'pinch' && Number.isFinite(origin.clientX)
      ? origin.clientX : rect.left + Math.min(rect.width / 2, Math.max(0, rect.width - 1));
    const clientY = origin.kind === 'pinch' && Number.isFinite(origin.clientY)
      ? origin.clientY : rect.top + Math.min(rect.height / 2, Math.max(0, rect.height - 1));
    const boardPoint = getBoardContentPoint(surface, clientX, clientY);
    const task = closestInside(origin.kind === 'pinch' ? origin.target : document.elementFromPoint(clientX, clientY),
      '[data-task-id][data-task-hierarchy-level]', surface);
    const column = task?.closest<HTMLElement>('[data-kanban-column]')
      || closestInside(origin.kind === 'pinch' ? origin.target : document.elementFromPoint(clientX, clientY),
        '[data-kanban-column]', surface);
    const columnSurface = column?.querySelector<HTMLElement>('[data-mobile-pan-surface="kanban-column"]') || null;
    const taskRect = task?.getBoundingClientRect();
    const columnRect = column?.getBoundingClientRect();
    const targetRect = taskRect || columnRect;
    let kind: KanbanViewAnchorKind = task ? 'task' : column ? 'column' : 'board-content';
    let nodeId = task?.getAttribute('data-task-id') || null;
    let columnId = column?.getAttribute('data-task-id') || null;
    if (!targetRect || !isVisible(targetRect, rect)) {
      const visibleTask = Array.from(surface.querySelectorAll<HTMLElement>('[data-task-hierarchy-level][data-task-id]'))
        .find((element) => isVisible(element.getBoundingClientRect(), rect));
      const visibleColumn = visibleTask?.closest<HTMLElement>('[data-kanban-column]')
        || Array.from(surface.querySelectorAll<HTMLElement>('[data-kanban-column]'))
          .find((element) => isVisible(element.getBoundingClientRect(), rect));
      const fallbackRect = visibleTask?.getBoundingClientRect() || visibleColumn?.getBoundingClientRect();
      if (fallbackRect) {
        kind = visibleTask ? 'task' : 'column';
        nodeId = visibleTask?.getAttribute('data-task-id') || null;
        columnId = visibleColumn?.getAttribute('data-task-id') || null;
      }
    }
    const resolvedRect = targetRect || (columnId ? findByDataId(surface, '[data-kanban-column]', columnId)?.getBoundingClientRect() : null);
    const normalizedX = resolvedRect && resolvedRect.width > 0
      ? clamp((clientX - resolvedRect.left) / resolvedRect.width) : 0.5;
    const normalizedY = resolvedRect && resolvedRect.height > 0
      ? clamp((clientY - resolvedRect.top) / resolvedRect.height) : 0.5;
    const columnContentY = columnSurface
      ? columnSurface.scrollTop + clientY - columnSurface.getBoundingClientRect().top
      : null;
    pending = true;
    return {
      scopeKey: getScopeKey(),
      kind,
      nodeId,
      columnId,
      normalizedX,
      normalizedY,
      clientX,
      clientY,
      boardContentX: finite(boardPoint.x, surface.scrollLeft),
      columnContentY: columnContentY === null ? null : finite(columnContentY),
      boardScrollLeft: finite(surface.scrollLeft),
      columnScrollTop: finite(columnSurface?.scrollTop || 0),
    };
  };

  const restore = (anchor: KanbanViewAnchor) => {
    const surface = getSurface();
    if (!surface || !pending || anchor.scopeKey !== getScopeKey()) return { driftPx: 0, clamped: false };
    const surfaceRect = surface.getBoundingClientRect();
    const target = anchor.nodeId
      ? findByDataId(surface, '[data-task-id][data-task-hierarchy-level]', anchor.nodeId)
      : null;
    const column = (anchor.columnId ? findByDataId(surface, '[data-kanban-column]', anchor.columnId) : null)
      || target?.closest<HTMLElement>('[data-kanban-column]');
    const columnSurface = column?.querySelector<HTMLElement>('[data-mobile-pan-surface="kanban-column"]') || null;
    const before = surface.scrollLeft;
    if (target || column) {
      const targetRect = target?.getBoundingClientRect() || column?.getBoundingClientRect();
      if (targetRect) {
        const desiredX = targetRect.left + targetRect.width * anchor.normalizedX;
        surface.scrollLeft += desiredX - anchor.clientX;
      }
    } else {
      surface.scrollLeft = anchor.boardContentX - (anchor.clientX - surfaceRect.left);
    }
    if (columnSurface && anchor.columnContentY !== null) {
      const current = columnSurface.getBoundingClientRect();
      columnSurface.scrollTop = anchor.columnContentY - (anchor.clientY - current.top);
    }
    let driftPx = 0;
    const restoredTarget = anchor.nodeId
      ? findByDataId(surface, '[data-task-id][data-task-hierarchy-level]', anchor.nodeId)
      : null;
    const restoredRect = restoredTarget?.getBoundingClientRect() || column?.getBoundingClientRect();
    if (restoredRect) {
      const currentX = restoredRect.left + restoredRect.width * anchor.normalizedX;
      const currentY = restoredRect.top + restoredRect.height * anchor.normalizedY;
      driftPx = Math.hypot(currentX - anchor.clientX, currentY - anchor.clientY);
      if (driftPx > 24) {
        surface.scrollLeft += currentX - anchor.clientX;
        if (columnSurface) columnSurface.scrollTop += currentY - anchor.clientY;
      }
    }
    const clamped = Math.abs(surface.scrollLeft - before) < 0.5 && Boolean(surface.scrollWidth > surface.clientWidth);
    pending = false;
    return { driftPx, clamped };
  };

  return { capture, restore, clear };
};
