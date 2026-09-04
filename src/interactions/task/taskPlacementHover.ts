const TASK_PLACEMENT_HOVER_SURFACE_SELECTOR = '[data-task-placement-hover-surface="true"]';
const TASK_LINKED_HOVER_ATTRIBUTE = 'data-task-linked-hover';

const getPlacementKind = (surface: HTMLElement) => (
  surface.getAttribute('data-task-placement-kind')
  || surface.getAttribute('data-mindmap-placement-kind')
  || surface.getAttribute('data-gantt-placement-kind')
  || surface.getAttribute('data-calendar-placement-kind')
);

export const getTaskPlacementHoverSurface = (target: EventTarget | null): HTMLElement | null => {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  return target.closest<HTMLElement>(TASK_PLACEMENT_HOVER_SURFACE_SELECTOR);
};

export const getTaskPlacementCanonicalId = (surface: HTMLElement) => (
  surface.getAttribute('data-task-canonical-id')
  || surface.getAttribute('data-task-id')
  || null
);

export const isTrackingTaskPlacementSurface = (surface: HTMLElement) => (
  getPlacementKind(surface) === 'tracking-reference'
  || surface.getAttribute('data-task-workbench-tracking-reference') === 'true'
);

const isPrimaryTaskPlacementSurface = (surface: HTMLElement) => (
  getPlacementKind(surface) === 'primary'
  || (
    surface.getAttribute('data-task-workbench-task-card') === 'true'
    && surface.getAttribute('data-task-workbench-tracking-reference') !== 'true'
  )
);

export const clearTaskPlacementLinkedHover = () => {
  document
    .querySelectorAll<HTMLElement>(`[${TASK_LINKED_HOVER_ATTRIBUTE}="true"]`)
    .forEach(surface => surface.removeAttribute(TASK_LINKED_HOVER_ATTRIBUTE));
};

/**
 * Mirror a tracking-reference hover to every rendered canonical primary
 * surface for the same task. The attribute is intentionally DOM-local: hover
 * is transient UI state and must not enter the task store or affect commands.
 */
export const syncTaskPlacementLinkedHover = (hoveredSurface: HTMLElement | null) => {
  clearTaskPlacementLinkedHover();
  if (!hoveredSurface || !isTrackingTaskPlacementSurface(hoveredSurface)) return;

  const taskId = getTaskPlacementCanonicalId(hoveredSurface);
  if (!taskId) return;

  document
    .querySelectorAll<HTMLElement>(TASK_PLACEMENT_HOVER_SURFACE_SELECTOR)
    .forEach(surface => {
      if (
        surface === hoveredSurface
        || !isPrimaryTaskPlacementSurface(surface)
        || getTaskPlacementCanonicalId(surface) !== taskId
      ) return;
      surface.setAttribute(TASK_LINKED_HOVER_ATTRIBUTE, 'true');
    });
};
