import React from 'react';

interface KanbanInsertionMarkerProps {
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const KanbanInsertionMarker: React.FC<KanbanInsertionMarkerProps> = ({
  compact = false,
  className = '',
  style,
}) => (
  <div
    className={`pointer-events-none flex w-full items-center gap-1.5 ${compact ? 'py-1' : 'py-1.5'} ${className}`}
    style={style}
    data-kanban-insertion-marker="true"
    aria-hidden="true"
  >
    <span
      className={`${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_rgba(59,130,246,0.12)]`}
      data-kanban-insertion-dot="true"
    />
    <span
      className={`${compact ? 'h-1.5' : 'h-2'} min-w-0 flex-1 rounded-full bg-primary shadow-[0_0_0_1px_rgba(59,130,246,0.10)]`}
      data-kanban-insertion-bar="true"
    />
  </div>
);
