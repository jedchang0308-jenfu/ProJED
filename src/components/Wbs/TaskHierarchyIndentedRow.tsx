import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type TaskHierarchyIndentedRowProps = {
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  taskId: string;
  taskTitle: string;
  surface: string;
  className?: string;
  baseInset?: string;
  disclosureAttributes?: {
    'data-goal-collapse-toggle'?: string;
  };
  containerProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>;
  children: React.ReactNode;
};

export const TaskHierarchyIndentedRow: React.FC<TaskHierarchyIndentedRowProps> = ({
  depth,
  hasChildren,
  expanded,
  onToggle,
  taskId,
  taskTitle,
  surface,
  className = '',
  baseInset = '0px',
  disclosureAttributes,
  containerProps,
  children,
}) => (
  <div
    {...containerProps}
    className={`task-hierarchy-indented-row relative flex min-w-0 items-center gap-1 overflow-hidden ${className}`}
    style={{
      '--task-hierarchy-depth': depth,
      '--task-hierarchy-base': baseInset,
    } as React.CSSProperties}
    data-task-hierarchy-row="true"
    data-task-hierarchy-surface={surface}
    data-task-hierarchy-depth={depth}
    data-task-id={taskId}
  >
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (hasChildren) onToggle();
      }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 ${hasChildren ? '' : 'invisible'}`}
      aria-label={hasChildren ? `${expanded ? '收合' : '展開'} ${taskTitle}` : undefined}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-hidden={hasChildren ? undefined : true}
      tabIndex={hasChildren ? undefined : -1}
      data-task-hierarchy-disclosure="true"
      {...disclosureAttributes}
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
    {children}
  </div>
);
