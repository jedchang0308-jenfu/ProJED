import React from 'react';
import { GripVertical } from 'lucide-react';

interface TaskDragHandleProps {
  attributes?: Record<string, any>;
  listeners?: Record<string, any>;
  disabled?: boolean;
  dragDisabled?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  title?: string;
}

const sizeClassMap = {
  xs: 'h-6 w-5',
  sm: 'h-7 w-5',
  md: 'h-8 w-5',
};

const iconSizeMap = {
  xs: 12,
  sm: 14,
  md: 15,
};

export const TaskDragHandle: React.FC<TaskDragHandleProps> = ({
  attributes,
  listeners,
  disabled = false,
  dragDisabled = false,
  size = 'md',
  className = '',
  title = '拖曳任務',
}) => {
  const bindDrag = !disabled && !dragDisabled;

  return (
    <button
      type="button"
      data-kanban-drag-handle="true"
      data-task-drag-handle="true"
      data-mobile-pan-pass-through={dragDisabled ? 'true' : undefined}
      data-mobile-drag-disabled={dragDisabled ? 'true' : undefined}
      aria-label={title}
      title={title}
      disabled={disabled}
      {...(bindDrag ? attributes : {})}
      {...(bindDrag ? listeners : {})}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      style={dragDisabled ? { touchAction: 'pan-x pan-y' } : undefined}
      className={`task-drag-hitbox ${sizeClassMap[size]} flex shrink-0 ${
        dragDisabled ? 'cursor-pointer' : 'cursor-grab touch-none active:cursor-grabbing'
      } items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        disabled ? 'pointer-events-none opacity-0' : ''
      } ${className}`}
    >
      <GripVertical size={iconSizeMap[size]} strokeWidth={2.5} />
    </button>
  );
};
