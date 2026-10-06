import React from 'react';

interface KanbanInsertionMarkerProps {
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  axis?: 'horizontal' | 'vertical';
}

export const KanbanInsertionMarker: React.FC<KanbanInsertionMarkerProps> = ({
  compact = false,
  className = '',
  style,
  axis = 'horizontal',
}) => axis === 'vertical' ? (
  <div
    className={`pointer-events-none flex h-full w-full items-stretch justify-center ${className}`}
    style={style}
    data-kanban-insertion-marker="true"
    data-kanban-insertion-axis="vertical"
    aria-hidden="true"
  >
    <span
      className="h-full w-[6px] rounded-full bg-primary shadow-[0_0_0_2px_rgba(99,102,241,0.12)]"
      data-kanban-insertion-bar="true"
    />
  </div>
) : (
  <div
    className={`pointer-events-none flex w-full items-center gap-1.5 ${compact ? 'py-1' : 'py-1.5'} ${className}`}
    style={style}
    data-kanban-insertion-marker="true"
    data-kanban-insertion-axis="horizontal"
    aria-hidden="true"
  >
    <span
      className={`${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_rgba(99,102,241,0.12)]`}
      data-kanban-insertion-dot="true"
    />
    <span
      className={`${compact ? 'h-1.5' : 'h-2'} min-w-0 flex-1 rounded-full bg-primary shadow-[0_0_0_1px_rgba(99,102,241,0.10)]`}
      data-kanban-insertion-bar="true"
    />
  </div>
);
