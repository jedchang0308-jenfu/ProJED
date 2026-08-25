import React from 'react';
import { Loader2 } from 'lucide-react';

interface TaskPlacementPendingIndicatorProps {
  className?: string;
}

export const TaskPlacementPendingIndicator: React.FC<TaskPlacementPendingIndicatorProps> = ({
  className = '',
}) => (
  <span
    className={`inline-flex shrink-0 items-center ${className}`}
    aria-live="polite"
    aria-label="任務搬移中"
    data-task-placement-pending-indicator="true"
  >
    <Loader2 size={11} className="animate-spin text-primary-600" aria-hidden="true" />
  </span>
);
