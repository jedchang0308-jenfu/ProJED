import React from 'react';
import { CircleHelp } from 'lucide-react';

interface TaskDescriptionIndicatorProps {
  description?: string | null;
  className?: string;
}

export const TaskDescriptionIndicator: React.FC<TaskDescriptionIndicatorProps> = ({
  description,
  className = '',
}) => {
  if (!description?.trim()) return null;

  return (
    <span
      aria-hidden="true"
      data-task-description-indicator="true"
      data-task-description-hover-trigger="true"
      className={`inline-flex h-3 w-3 shrink-0 items-center justify-center text-slate-400/90 ${className}`}
    >
      <CircleHelp size={11} strokeWidth={1.75} />
    </span>
  );
};
