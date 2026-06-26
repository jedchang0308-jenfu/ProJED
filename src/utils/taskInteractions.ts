import useBoardStore from '../store/useBoardStore';

export const OPEN_TASK_DETAILS_EVENT = 'open-task-details';

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
    '[data-task-drag-handle="true"]',
    '[data-mindmap-toggle]',
    '[data-relationship-control]',
    '[data-task-title-input="true"]',
  ].join(',')))
);

export const openTaskDetails = (taskId: string) => {
  document.dispatchEvent(new CustomEvent(OPEN_TASK_DETAILS_EVENT, { detail: { taskId } }));
};

export const selectTask = (taskId: string | null) => {
  useBoardStore.getState().setSelectedTaskId(taskId);
};

export const selectAndOpenTaskDetails = (taskId: string) => {
  selectTask(taskId);
  openTaskDetails(taskId);
};

export const prepareNewTaskNaming = (taskId: string) => {
  const boardStore = useBoardStore.getState();
  boardStore.setSelectedTaskId(taskId);
  if (isCoarsePointer()) {
    boardStore.setPendingTitleEditNodeId(taskId);
    boardStore.setPendingDirectTitleEditNodeId(null);
    return;
  }
  boardStore.setPendingDirectTitleEditNodeId(taskId);
};
