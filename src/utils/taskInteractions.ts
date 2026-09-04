import useBoardStore from '../store/useBoardStore';

export const OPEN_TASK_DETAILS_EVENT = 'open-task-details';
export const CLEAR_TASK_SELECTION_EVENT = 'clear-task-selection';
export const START_MINDMAP_RELATIONSHIP_EVENT = 'start-mindmap-relationship';

type TaskDetailsReturnFocusBookmark = {
  element: HTMLElement | null;
  placementId: string | null;
};

let taskDetailsReturnFocus: TaskDetailsReturnFocusBookmark | null = null;

export const rememberTaskDetailsReturnFocus = (element: HTMLElement | null) => {
  taskDetailsReturnFocus = {
    element,
    placementId: element?.closest<HTMLElement>('[data-task-placement-id]')
      ?.getAttribute('data-task-placement-id') || null,
  };
};

export const restoreTaskDetailsReturnFocus = () => {
  const bookmark = taskDetailsReturnFocus;
  taskDetailsReturnFocus = null;
  if (!bookmark) return false;
  const currentPlacement = bookmark.placementId
    ? Array.from(document.querySelectorAll<HTMLElement>('[data-task-placement-id]'))
      .find(element => element.getAttribute('data-task-placement-id') === bookmark.placementId) || null
    : null;
  const candidates = [bookmark.element?.isConnected ? bookmark.element : null, currentPlacement]
    .filter((element, index, elements): element is HTMLElement => Boolean(element) && elements.indexOf(element) === index);
  return candidates.some(element => {
    element.focus({ preventScroll: true });
    return document.activeElement === element;
  });
};

export const isCoarsePointer = () => (
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches
);

export const isTextInputTarget = (target: EventTarget | null) => (
  target instanceof Element &&
  Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-task-title-input="true"]'))
);

export const isTaskPrimaryActionTarget = (target: EventTarget | null) => (
  target instanceof Element &&
  Boolean(target.closest([
    'input',
    'textarea',
    'select',
    'button',
    'a',
    '[contenteditable="true"]',
    '[data-task-interaction-control="true"]',
    '[data-task-primary-action-control="true"]',
    '[data-mindmap-toggle]',
    '[data-relationship-control]',
    '[data-task-title-input="true"]',
  ].join(',')))
);

export const openTaskDetails = (taskId: string, trackingReferenceId?: string) => {
  document.dispatchEvent(new CustomEvent(OPEN_TASK_DETAILS_EVENT, {
    detail: { taskId, trackingReferenceId },
  }));
};

export const requestMindMapRelationshipStart = (taskId: string) => {
  document.dispatchEvent(new CustomEvent(START_MINDMAP_RELATIONSHIP_EVENT, { detail: { taskId } }));
};

export const selectTask = (taskId: string | null) => {
  useBoardStore.getState().setSelectedTaskId(taskId);
};

export const clearTaskSelection = () => {
  useBoardStore.getState().setSelectedTaskId(null);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(CLEAR_TASK_SELECTION_EVENT));
  }
};

export const selectAndOpenTaskDetails = (taskId: string, trackingReferenceId?: string) => {
  selectTask(taskId);
  openTaskDetails(taskId, trackingReferenceId);
};

export const prepareNewTaskNaming = (taskId: string) => {
  const boardStore = useBoardStore.getState();
  boardStore.setSelectedTaskId(taskId);
  boardStore.setPendingTitleEditNodeId(taskId);
  openTaskDetails(taskId);
};
