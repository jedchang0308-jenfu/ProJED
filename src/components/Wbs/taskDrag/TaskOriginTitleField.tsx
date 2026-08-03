import React from 'react';
import type { TaskDropSurfaceKind } from './taskDragTypes';

interface TaskOriginTitleFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  surfaceKind: TaskDropSurfaceKind;
}

export const TaskOriginTitleField: React.FC<TaskOriginTitleFieldProps> = ({
  title,
  surfaceKind,
  className = '',
  ...props
}) => (
  <div
    {...props}
    className={`task-title-text flex h-full w-full items-center rounded bg-blue-500 px-1.5 font-medium text-white shadow-[0_0_0_2px_rgba(59,130,246,0.18)] ${
      surfaceKind === 'checklist-row' ? 'text-xs' : 'text-sm'
    } ${className}`}
    aria-hidden="true"
  >
    <span className="truncate">{title}</span>
  </div>
);
