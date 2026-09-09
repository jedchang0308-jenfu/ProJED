import React from 'react';
import { AlignLeft } from 'lucide-react';

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
      className={`pointer-events-none inline-flex h-[11px] w-[11px] shrink-0 items-center justify-center text-slate-400/90 ${className}`}
    >
      <AlignLeft size={9} strokeWidth={1.75} />
    </span>
  );
};
