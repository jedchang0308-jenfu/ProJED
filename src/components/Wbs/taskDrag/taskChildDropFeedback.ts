export const TASK_CHILD_DROP_SUCCESS_EVENT = 'projed:task-child-drop-success';
export const TASK_CHILD_DROP_HIGHLIGHT_EVENT = 'projed:task-child-drop-highlight';

export interface TaskChildDropSuccessDetail {
  sourceNodeId: string;
  sourceTitle: string;
  targetNodeId: string;
  targetTitle: string;
}

export const emitTaskChildDropSuccess = (detail: TaskChildDropSuccessDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TaskChildDropSuccessDetail>(
    TASK_CHILD_DROP_SUCCESS_EVENT,
    { detail },
  ));

  // Moving into a collapsed target mounts the source only after the success
  // event expands that target. A separate delayed event lets the newly mounted
  // source render the committed highlight without replaying success semantics.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<TaskChildDropSuccessDetail>(
      TASK_CHILD_DROP_HIGHLIGHT_EVENT,
      { detail },
    ));
  }, 160);
};
