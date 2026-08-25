export const TASK_TITLE_ANCHOR_SELECTOR = '[data-task-title-slot="true"]';

export const findTaskTitleAnchorElement = (surface: HTMLElement | null) => {
  if (!surface) return null;
  if (surface.matches(TASK_TITLE_ANCHOR_SELECTOR)) return surface;
  return surface.querySelector<HTMLElement>(TASK_TITLE_ANCHOR_SELECTOR);
};
