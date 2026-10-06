import React from 'react';

/** Shared visual surface for task-note content and read-only meeting history. */
export const TASK_NOTE_CONTENT_SURFACE_CLASS_NAME = [
  'min-h-[36px] w-full max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200/70',
  'bg-transparent px-2 py-1.5 text-sm leading-6 text-slate-700 outline-none transition',
  'hover:border-slate-300/70 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100',
].join(' ');

export type TaskNoteContentSurfaceProps = React.HTMLAttributes<HTMLDivElement>;

const TaskNoteContentSurface = React.forwardRef<HTMLDivElement, TaskNoteContentSurfaceProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className={[TASK_NOTE_CONTENT_SURFACE_CLASS_NAME, className].filter(Boolean).join(' ')}
      data-task-note-content-surface="true"
    />
  ),
);

TaskNoteContentSurface.displayName = 'TaskNoteContentSurface';

export default TaskNoteContentSurface;
