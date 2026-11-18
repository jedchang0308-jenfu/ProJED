import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'lucide-react';
import type { GoalHierarchyDecoration } from '../../features/goalMode/hierarchyPresentation';
import type { HierarchicalTaskViewItem } from '../../utils/taskHierarchy';
import { useWbsStore } from '../../store/useWbsStore';
import { taskStatusTitleClass } from '../ui/taskStatusStyles';
import GoalHierarchyGuides from './GoalHierarchyGuides';
import { TaskHierarchyIndentedRow } from './TaskHierarchyIndentedRow';

type Props = {
  task: Pick<HierarchicalTaskViewItem, 'id' | 'title' | 'level' | 'status' | 'nodeType'>;
  rowId: string;
  surface: 'goal' | 'gantt' | 'calendar';
  isTrackingReference: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  decoration: GoalHierarchyDecoration;
  activeScopeId?: string | null;
  containerProps?: ComponentProps<typeof TaskHierarchyIndentedRow>['containerProps'];
  titleIndicator?: ReactNode;
  children?: ReactNode;
};

export const TaskListNameRow = ({
  task, rowId, surface, isTrackingReference, hasChildren, collapsed, onToggle,
  decoration, activeScopeId = null, containerProps, titleIndicator, children,
}: Props) => {
  const progress = useWbsStore(state => state.getNodeProgress(task.id));
  const title = task.title || '未命名任務';

  return (
    <TaskHierarchyIndentedRow
      depth={task.level}
      hasChildren={hasChildren}
      expanded={!collapsed}
      onToggle={onToggle}
      taskId={task.id}
      taskTitle={title}
      surface={surface}
      className="goal-task-hierarchy-row relative z-[1] pr-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      disclosureAttributes={{ 'data-goal-collapse-toggle': rowId }}
      containerProps={containerProps}
    >
      <GoalHierarchyGuides
        nodeId={rowId}
        level={task.level}
        hasChildren={hasChildren}
        decoration={decoration}
        activeScopeId={activeScopeId}
      />
      {isTrackingReference ? <Link size={12} className="mr-1 shrink-0 text-slate-500" aria-label="追蹤副本" /> : null}
      {task.nodeType === 'milestone' ? <span className="mr-1 shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] leading-none text-amber-600">里程碑</span> : null}
      <span className="flex min-w-0 flex-1 items-center gap-0.5 pr-1" data-task-title-slot="true">
        <span className={`task-title-text min-w-0 truncate text-sm ${task.level === 0 ? 'font-semibold' : 'font-medium'} ${taskStatusTitleClass[task.status]}`}>
          {title}
        </span>
        {titleIndicator}
      </span>
      <span
        className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-slate-400/40"
        style={{ backgroundImage: `conic-gradient(var(--color-primary) ${progress}%, var(--color-slate-200) 0)` }}
        role="img"
        aria-label={`任務進度 ${progress}%`}
        title={`${progress}%`}
        data-task-progress-indicator="true"
      />
      {collapsed && decoration.eligibleDescendantCount > 0 ? (
        <span
          className="relative z-[1] shrink-0 px-0.5 text-[10px] font-medium text-slate-400"
          aria-label={`已收合 ${decoration.eligibleDescendantCount} 個下層任務`}
          data-goal-descendant-count={decoration.eligibleDescendantCount}
        >
          +{decoration.eligibleDescendantCount}
        </span>
      ) : null}
      {children}
    </TaskHierarchyIndentedRow>
  );
};
