import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronLeft,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import { useTagStore } from '../store/useTagStore';
import useQuickCaptureStore from '../store/useQuickCaptureStore';
import {
  createBoardAssigneeFilterOptions,
  createDefaultTaskFilters,
  countActiveTaskFilters,
  normalizeTaskFilters,
  projectTaskFilterResults,
  type TaskFilterState,
} from '../features/taskFilters';
import {
  readTaskWorkbenchFilterPrefs,
  readTaskWorkbenchPanelPrefs,
  writeTaskWorkbenchFilterPrefs,
  writeTaskWorkbenchPanelPrefs,
  clampTaskWorkbenchPanelWidth,
  clampTaskWorkbenchUnplacedRatio,
  MAX_TASK_WORKBENCH_WIDTH,
  MAX_TASK_WORKBENCH_UNPLACED_RATIO,
  MIN_TASK_WORKBENCH_WIDTH,
  MIN_TASK_WORKBENCH_UNPLACED_RATIO,
  type TaskWorkbenchPanelPrefs,
} from '../features/taskWorkbench/preferences';
import { TaskPlacementPendingIndicator } from './Wbs/taskDrag/TaskPlacementPendingIndicator';
import {
  createNewUnplacedTaskNode,
  createUnplacedTaskNodeFromInboxItem,
  isTaskWorkbenchUnplacedTask,
  loadTaskWorkbenchUnplacedTasks,
  TASK_WORKBENCH_UNPLACED_BOARD_ID,
} from '../features/taskWorkbench/placement';
import { isTaskWorkbenchSortableTask, listWorkbenchTasks } from '../features/taskWorkbench/source';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import type { InboxItem, TaskNode } from '../types';
import { isTaskPrimaryActionTarget, prepareNewTaskNaming } from '../utils/taskInteractions';
import { useTaskInteractionBinding } from '../interactions/task/useTaskInteractionBinding';
import { formatTaskLocation } from '../utils/taskHierarchy';
import { isPrimaryPointerActivation } from '../interactions/pointerActivation';
import { markLeftPanelClosed, markLeftPanelOpened } from '../utils/leftPanelEscapeStack';
import {
  hydrateAccountLayoutPreferences,
  persistAccountLayoutPreferences,
} from '../services/accountPreferencesService';
import { usePanelPreview } from './panelPreviewContext';
import { CLOSE_PANEL_EVENT, OPEN_PANEL_EVENT, TOGGLE_PANEL_EVENT } from './taskWorkbenchPanelCommands';
import { TaskDateBadge } from './Wbs/TaskDateBadge';
import { KanbanInsertionMarker } from './Wbs/KanbanInsertionMarker';
import { isMobileTaskActionMode } from './Wbs/mobileTaskActionContext';
import { useTaskGestureSurface } from './Wbs/taskDrag/useTaskGestureSurface';
import TaskConditionFilterControls from './ui/TaskConditionFilterControls';
import { taskFilterFieldClass } from './ui/taskConditionFilterStyles';
import { getSharedInlinePanelWidthStyle } from '../features/layout/preferences';
import { buildWorkbenchProjectionTasks } from '../features/taskTracking/model';

type PanelPrefs = TaskWorkbenchPanelPrefs;

const persistTaskWorkbenchWidth = (width: number, accountId: string | null) => {
  const clampedWidth = clampTaskWorkbenchPanelWidth(width);
  const currentPrefs = readTaskWorkbenchPanelPrefs(accountId);
  writeTaskWorkbenchPanelPrefs({ ...currentPrefs, width: clampedWidth }, accountId);
  persistAccountLayoutPreferences(accountId, { taskWorkbenchWidth: clampedWidth });
};

const persistTaskWorkbenchUnplacedRatio = (ratio: number, accountId: string | null) => {
  const clampedRatio = clampTaskWorkbenchUnplacedRatio(ratio);
  const currentPrefs = readTaskWorkbenchPanelPrefs(accountId);
  writeTaskWorkbenchPanelPrefs({ ...currentPrefs, unplacedRatio: clampedRatio }, accountId);
  persistAccountLayoutPreferences(accountId, { taskWorkbenchUnplacedRatio: clampedRatio });
};

type BoardOption = {
  workspaceId: string;
  boardId: string;
  path: string;
};

const compareText = (left: string, right: string) => left.localeCompare(right, 'zh-Hant');

const sortTasks = (tasks: TaskNode[]) => [...tasks].sort((left, right) => {
  const orderCompare = (left.order ?? 0) - (right.order ?? 0);
  if (orderCompare !== 0) return orderCompare;
  return compareText(left.title || '', right.title || '');
});

const getTaskDueTime = (task: TaskNode) => {
  if (!task.endDate) return null;
  const timestamp = Date.parse(`${task.endDate}T00:00:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const sortTasksByDueDate = (tasks: TaskNode[]) => [...tasks].sort((left, right) => {
  const leftDue = getTaskDueTime(left);
  const rightDue = getTaskDueTime(right);
  if (leftDue !== null && rightDue !== null && leftDue !== rightDue) return leftDue - rightDue;
  if (leftDue !== null && rightDue === null) return -1;
  if (leftDue === null && rightDue !== null) return 1;
  const titleCompare = compareText(left.title || '', right.title || '');
  if (titleCompare !== 0) return titleCompare;
  return (left.order ?? 0) - (right.order ?? 0);
});

const getTaskHierarchyDepth = (task: TaskNode, nodesById: Record<string, TaskNode>) => {
  const rootParentIds = new Set(['root', task.boardId, TASK_WORKBENCH_UNPLACED_BOARD_ID]);
  const visited = new Set<string>([task.id]);
  let currentParentId = task.parentId || null;
  let depth = 0;

  while (currentParentId && !rootParentIds.has(currentParentId)) {
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);

    const parent = nodesById[currentParentId];
    if (!parent || parent.isArchived) break;

    depth += 1;
    currentParentId = parent.parentId || null;
  }

  return Math.min(depth, 6);
};

const getUnclassifiedItems = (items: InboxItem[]) => items
  .filter(item => item.captureStatus === 'untriaged' && !item.promotedTaskNodeId)
  .sort((left, right) => right.createdAt - left.createdAt);

const WorkbenchUnclassifiedSection: React.FC<{
  tasks: TaskNode[];
  canCreateTask: boolean;
  canMoveTask: boolean;
  canManageTaskReference: boolean;
  onCreateTask: () => void;
  style?: React.CSSProperties;
}> = ({ tasks, canCreateTask, canMoveTask, canManageTaskReference, onCreateTask, style }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'task-workbench-unplaced-lane',
    disabled: !canMoveTask && !canManageTaskReference,
    data: {
      type: 'task-workbench-unplaced-lane',
      placement: 'unplaced',
    },
  });

  return (
    <section
      ref={setNodeRef}
      className={`scrollbar-subtle min-h-0 shrink-0 overflow-y-auto overscroll-contain bg-slate-100 px-3 pb-3 transition-colors ${isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : ''}`}
      style={style}
      data-task-workbench-unclassified-section="true"
      data-task-workbench-unplaced-lane="true"
      data-task-workbench-lane-drop-target="unplaced"
    >
      <div
        className="sticky top-0 z-20 mt-2 mb-px box-border flex h-8 w-full min-w-0 shrink-0 items-center gap-2 bg-slate-100"
        data-task-workbench-section-header="unplaced"
      >
        <div
          className="box-border mb-px flex h-8 min-w-0 w-[104px] shrink items-center gap-2 rounded-md border border-slate-600 bg-slate-700 px-3 text-white"
          data-task-workbench-section-label="unplaced"
        >
          <span className="min-w-0 truncate text-[13px] font-black leading-5 text-white">未歸位</span>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          disabled={!canCreateTask}
          className="inline-flex h-8 min-w-[80px] shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-yellow-400 bg-yellow-300 px-2.5 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
          title="新增未歸位任務並開啟任務彈窗"
          aria-label="新增未歸位任務"
          data-task-workbench-unclassified-modal-add="true"
          data-mobile-pan-pass-through="true"
        >
          <span>+新增任務</span>
        </button>
        <span className="sr-only" data-task-workbench-unclassified-count="true">
          {tasks.length}
        </span>
      </div>

      <div className="space-y-px" data-task-workbench-unclassified-list="true">
        <WorkbenchUnplacedHierarchy
          tasks={tasks}
          canMoveTask={canMoveTask}
          canManageTaskReference={canManageTaskReference}
        />
        {isOver ? (
          <div
            className="pointer-events-none relative z-30 h-0"
            data-task-workbench-unplaced-insertion-preview="true"
            data-task-workbench-insertion-preview-layer="overlay"
          >
            <div className={`absolute inset-x-0 top-0 ${tasks.length > 0 ? '-translate-y-1/2' : ''}`}>
              <KanbanInsertionMarker compact className="py-0" />
            </div>
          </div>
        ) : null}
        {tasks.length === 0 ? (
          <div
            className={`px-1 py-1 text-sm font-semibold text-slate-500 ${isOver ? 'invisible' : ''}`}
            data-task-workbench-unplaced-empty-state="true"
          >
            目前沒有未歸位任務。
          </div>
        ) : null}
      </div>
    </section>
  );
};

type WorkbenchDragCardProps = {
  task: TaskNode;
  canMoveTask: boolean;
  canManageTaskReference: boolean;
  placement: 'unplaced' | 'placed';
  surface?: 'unplaced-lane' | 'all-tasks';
  hierarchyDepth?: number;
};

interface WorkbenchTaskRowProps extends WorkbenchDragCardProps {
  isDragging: boolean;
  canUseDragSurface: boolean;
  setNodeRef?: (element: HTMLElement | null) => void;
  dropRef?: (element: HTMLElement | null) => void;
  dropTargetActive?: boolean;
  draggableBindings?: Record<string, unknown>;
  gestureHandlers: ReturnType<typeof useTaskGestureSurface>['handlers'];
  touchGestureEnabled: boolean;
  isPlacementPending?: boolean;
}

const WorkbenchTaskRow: React.FC<WorkbenchTaskRowProps> = ({
  task,
  placement,
  surface = placement === 'unplaced' ? 'unplaced-lane' : 'all-tasks',
  hierarchyDepth = 0,
  isDragging,
  canUseDragSurface,
  setNodeRef,
  dropRef,
  dropTargetActive = false,
  draggableBindings = {},
  gestureHandlers,
  touchGestureEnabled,
  isPlacementPending = false,
}) => {
  const canonicalTaskId = task.canonicalTaskId || task.id;
  const isUnplacedLaneRow = placement === 'unplaced' && surface === 'unplaced-lane';
  const isAllTasksCard = surface === 'all-tasks';
  const depth = Math.max(0, Math.min(hierarchyDepth, 6));
  const interactionBinding = useTaskInteractionBinding({
    taskId: canonicalTaskId,
    title: task.title,
    trackingReferenceId: task.trackingReferenceId,
    surfaceId: placement === 'unplaced' ? 'task-workbench.unplaced-row' : 'task-workbench.placed-row',
    origin: 'task-workbench',
    nodeRole: placement === 'unplaced' ? 'unplaced' : (task.nodeType || 'task'),
  });
  const hierarchyTextClass = depth === 0
    ? 'font-semibold text-slate-800'
    : depth === 1
      ? 'font-medium text-slate-700'
      : 'font-medium text-slate-600';
  const dependencies = useWbsStore(s => s.dependencies);
  const nodes = useWbsStore(s => s.nodes);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(canonicalTaskId, dependencies);
  const taskLocation = isUnplacedLaneRow
    ? (task.isTrackingReference ? '未歸位（追蹤副本）' : '未歸位')
    : formatTaskLocation(task, nodes);
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMobileTaskActionMode()) return;
    void interactionBinding.openMenu({ x: event.clientX, y: event.clientY });
  };
  const renderWorkbenchTaskRow = ({
    className,
    style,
    children,
    unplacedLane,
  }: {
    className: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
    unplacedLane: boolean;
  }) => (
    <div
      ref={(element) => {
        if (canUseDragSurface) setNodeRef?.(element);
        dropRef?.(element);
      }}
      {...draggableBindings}
      {...gestureHandlers}
      onClick={(event) => {
        if (isDragging || isTaskPrimaryActionTarget(event.target)) return;
        // Compatibility contract: selectAndOpenTaskDetails(task.id) is dispatched by the interaction kernel.
        void interactionBinding.dispatch('pointer.primary');
      }}
      onContextMenu={handleContextMenu}
      className={`${className} ${task.isTrackingReference ? 'border-l-2 border-dashed border-violet-300 bg-violet-50/20' : ''} ${dropTargetActive ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : ''}`}
      aria-label={task.isTrackingReference ? `追蹤副本：${task.title || '未命名任務'}` : task.title || '未命名任務'}
      style={style}
      data-task-workbench-task-card="true"
      data-task-canonical-id={canonicalTaskId}
      data-task-placement-id={task.trackingReferenceId || undefined}
      data-task-placement-hover-surface="true"
      data-task-workbench-tracking-reference={task.isTrackingReference ? 'true' : undefined}
      data-task-workbench-drag-surface={canUseDragSurface ? 'task-row-root' : undefined}
      data-task-drag-surface={canUseDragSurface ? 'true' : undefined}
      data-task-drag-surface-kind={canUseDragSurface ? 'workbench-unplaced-row' : undefined}
      data-task-workbench-unplaced-task-card={unplacedLane ? 'true' : undefined}
      data-task-workbench-all-task-card={isAllTasksCard ? 'true' : undefined}
      data-task-workbench-placed-task-card={placement === 'placed' ? 'true' : undefined}
      data-task-workbench-readonly-task-card={placement === 'placed' ? 'true' : undefined}
      data-task-workbench-unclassified-item={unplacedLane ? 'true' : undefined}
      data-task-workbench-task-placement={placement}
      data-task-workbench-unplaced-compact-row={unplacedLane ? 'true' : undefined}
      data-task-workbench-hierarchy-row="true"
      data-task-workbench-hierarchy-depth={depth}
      data-task-surface-source={unplacedLane ? 'true' : undefined}
      data-desktop-task-hover-preview={!isDragging ? 'true' : undefined}
      data-touch-tap-guard="true"
      data-task-touch-gesture-surface={touchGestureEnabled ? 'true' : undefined}
      data-task-id={canonicalTaskId}
      data-mobile-drop-target={canonicalTaskId}
      data-task-drop-surface-kind={canUseDragSurface ? 'workbench-unplaced-row' : undefined}
      data-task-placement-pending={isPlacementPending ? 'true' : undefined}
    >
      {task.isTrackingReference ? <span className="sr-only">追蹤副本</span> : null}
      {children}
    </div>
  );
  const renderWorkbenchTaskContent = ({
    titleClassName,
  }: {
    titleClassName: string;
  }) => (
    <div className={`flex min-w-0 flex-1 items-center ${isUnplacedLaneRow ? 'gap-1' : 'gap-3'}`} data-task-workbench-task-content="true">
      <div
        className={titleClassName}
        title={taskLocation}
        data-task-workbench-task-title="true"
        data-task-workbench-task-location={taskLocation}
      >
        {task.title || '未命名任務'}
      </div>
      <TaskDateBadge
        startDate={task.startDate}
        endDate={task.endDate}
        status={task.status}
        showStartDate={false}
        startLocked={lockStatus.startLocked}
        endLocked={lockStatus.endLocked}
        durationLocked={Boolean(task.isDurationLocked)}
        surface="workbench"
      />
      {isPlacementPending ? (
        <TaskPlacementPendingIndicator />
      ) : null}
    </div>
  );

  if (isUnplacedLaneRow) {
    return renderWorkbenchTaskRow({
      unplacedLane: true,
      className: `kanban-checklist-item task-workbench-unplaced-hierarchy-row group flex min-h-5 cursor-pointer items-center pr-1 py-0 transition-colors ${
          isDragging ? 'bg-primary/5 opacity-40' : 'hover:bg-white'
        }`,
      style: { '--kanban-checklist-depth': depth } as React.CSSProperties,
      children: renderWorkbenchTaskContent({
        titleClassName: `min-w-0 flex-1 truncate text-xs leading-tight ${hierarchyTextClass}`,
      }),
    });
  }

  return renderWorkbenchTaskRow({
    unplacedLane: false,
    className: `group flex min-h-[23px] cursor-pointer items-center px-1.5 py-0 transition-colors ${
        isDragging ? 'bg-primary/5 opacity-40' : 'hover:bg-white'
    }`,
    children: renderWorkbenchTaskContent({
      titleClassName: `min-w-0 flex-1 truncate text-sm leading-5 ${hierarchyTextClass}`,
    }),
  });
};

const WorkbenchUnplacedDragCard: React.FC<WorkbenchDragCardProps> = ({
  task,
  canMoveTask,
  canManageTaskReference,
  surface = 'unplaced-lane',
  hierarchyDepth = 0,
}) => {
  const canonicalTaskId = task.canonicalTaskId || task.id;
  const canDragTask = task.isTrackingReference ? canManageTaskReference : canMoveTask;
  const taskGesture = useTaskGestureSurface({
    task: {
      ...task,
      id: canonicalTaskId,
      placementId: task.trackingReferenceId,
      placementKind: task.isTrackingReference ? 'tracking_reference' : 'primary',
    },
    sourceKind: 'workbench-unplaced-row',
    mobileActionEnabled: true,
    onNonMobileLongPress: (event) => {
      event.preventDefault();
      const touch = event.touches[0];
      void interactionBinding.openMenu({ x: touch.clientX, y: touch.clientY });
    },
  });
  const interactionBinding = useTaskInteractionBinding({
    taskId: canonicalTaskId,
    title: task.title,
    trackingReferenceId: task.trackingReferenceId,
    surfaceId: 'task-workbench.unplaced-row',
    origin: 'task-workbench',
    nodeRole: 'unplaced',
  });
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-workbench-${surface}-${task.trackingReferenceId || task.id}`,
    disabled: !canDragTask || taskGesture.mobileActionMode || taskGesture.isPlacementPending,
    data: {
      type: 'wbs-card',
      source: 'task-workbench',
      placement: 'unplaced',
      nodeId: canonicalTaskId,
      placementId: task.trackingReferenceId,
      trackingReference: task.trackingReferenceId ? { id: task.trackingReferenceId, staged: true } : undefined,
      sourceWorkspaceId: task.workspaceId,
      sourceBoardId: task.boardId,
      title: task.title,
    },
  });
  const canUseDragSurface = canDragTask && !taskGesture.mobileActionMode && !taskGesture.isPlacementPending;

  return (
    <WorkbenchTaskRow
      task={task}
      canMoveTask={canMoveTask}
      canManageTaskReference={canManageTaskReference}
      placement="unplaced"
      surface={surface}
      hierarchyDepth={hierarchyDepth}
      isDragging={isDragging}
      canUseDragSurface={canUseDragSurface}
      setNodeRef={setNodeRef}
      draggableBindings={canUseDragSurface ? { ...attributes, ...listeners } : {}}
      gestureHandlers={taskGesture.handlers}
      touchGestureEnabled={taskGesture.touchGestureEnabled}
      isPlacementPending={taskGesture.isPlacementPending}
    />
  );
};

const WorkbenchPlacedReadOnlyCard: React.FC<WorkbenchDragCardProps> = ({
  task,
  canMoveTask,
  canManageTaskReference,
  surface = 'all-tasks',
  hierarchyDepth = 0,
}) => {
  const taskGesture = useTaskGestureSurface({
    task,
    sourceKind: null,
    mobileActionEnabled: false,
  });
  const { setNodeRef: setDropNodeRef, isOver: isDropTargetActive } = useDroppable({
    id: `task-workbench-placed-task-${task.id}`,
    data: {
      type: 'task-workbench-placed-task',
      nodeId: task.id,
      boardId: task.boardId,
      workspaceId: task.workspaceId,
      parentId: task.parentId || null,
    },
  });

  return (
    <WorkbenchTaskRow
      task={task}
      canMoveTask={canMoveTask}
      canManageTaskReference={canManageTaskReference}
      placement="placed"
      surface={surface}
      hierarchyDepth={hierarchyDepth}
      isDragging={false}
      canUseDragSurface={false}
      dropRef={setDropNodeRef}
      dropTargetActive={isDropTargetActive}
      gestureHandlers={taskGesture.handlers}
      touchGestureEnabled={taskGesture.touchGestureEnabled}
    />
  );
};

const WorkbenchDragCard: React.FC<WorkbenchDragCardProps> = (props) => (
  props.placement === 'placed'
    ? <WorkbenchPlacedReadOnlyCard {...props} />
    : <WorkbenchUnplacedDragCard {...props} />
);

type WorkbenchUnplacedHierarchyProps = {
  tasks: TaskNode[];
  canMoveTask: boolean;
  canManageTaskReference: boolean;
};

type WorkbenchUnplacedHierarchyProjection = {
  roots: TaskNode[];
  childrenByParentId: Map<string, TaskNode[]>;
};

const projectWorkbenchUnplacedHierarchy = (tasks: TaskNode[]): WorkbenchUnplacedHierarchyProjection => {
  const orderedTasks = sortTasks(tasks);
  const taskById = new Map(orderedTasks.map(task => [task.id, task]));
  const childrenByParentId = new Map<string, TaskNode[]>();
  const roots: TaskNode[] = [];

  orderedTasks.forEach((task) => {
    const parentId = task.parentId || null;
    if (!parentId || parentId === task.id || !taskById.has(parentId)) {
      roots.push(task);
      return;
    }
    childrenByParentId.set(parentId, [
      ...(childrenByParentId.get(parentId) || []),
      task,
    ]);
  });

  const reached = new Set<string>();
  const markReached = (taskId: string, path: Set<string>) => {
    if (path.has(taskId)) return;
    reached.add(taskId);
    const nextPath = new Set(path).add(taskId);
    (childrenByParentId.get(taskId) || []).forEach(child => markReached(child.id, nextPath));
  };
  roots.forEach(root => markReached(root.id, new Set()));
  orderedTasks.forEach((task) => {
    if (reached.has(task.id)) return;
    roots.push(task);
    markReached(task.id, new Set());
  });

  return { roots, childrenByParentId };
};

const WorkbenchUnplacedHierarchyBranch: React.FC<{
  task: TaskNode;
  canMoveTask: boolean;
  canManageTaskReference: boolean;
  childrenByParentId: Map<string, TaskNode[]>;
  depth: number;
  ancestorIds: Set<string>;
}> = ({ task, canMoveTask, canManageTaskReference, childrenByParentId, depth, ancestorIds }) => {
  if (ancestorIds.has(task.id)) return null;
  const children = childrenByParentId.get(task.id) || [];
  const hasDescendants = children.length > 0;
  const nextAncestorIds = new Set(ancestorIds).add(task.id);

  return (
    <div
      className="relative"
      data-task-surface-scope="true"
      data-desktop-task-hover-scope="true"
      data-task-hover-scope-kind="workbench-unplaced"
      data-task-hover-scope-source-id={task.id}
      data-task-hover-has-descendants={hasDescendants ? 'true' : undefined}
      data-task-workbench-unplaced-hierarchy-branch="true"
    >
      <WorkbenchDragCard
        task={task}
        canMoveTask={canMoveTask}
        canManageTaskReference={canManageTaskReference}
        placement="unplaced"
        hierarchyDepth={depth}
      />
      {hasDescendants ? (
        <div
          className={depth === 0 ? 'task-workbench-unplaced-subtree-rail' : undefined}
          data-task-surface-subtree="true"
          data-task-workbench-unplaced-subtree="true"
        >
          {children.map(child => (
            <WorkbenchUnplacedHierarchyBranch
              key={child.id}
              task={child}
              canMoveTask={canMoveTask}
              canManageTaskReference={canManageTaskReference}
              childrenByParentId={childrenByParentId}
              depth={Math.min(depth + 1, 6)}
              ancestorIds={nextAncestorIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const WorkbenchUnplacedHierarchy: React.FC<WorkbenchUnplacedHierarchyProps> = ({
  tasks,
  canMoveTask,
  canManageTaskReference,
}) => {
  const projection = React.useMemo(() => projectWorkbenchUnplacedHierarchy(tasks), [tasks]);

  return (
    <div data-task-workbench-unplaced-hierarchy="true">
      {projection.roots.map(root => (
        <WorkbenchUnplacedHierarchyBranch
          key={root.id}
          task={root}
          canMoveTask={canMoveTask}
          canManageTaskReference={canManageTaskReference}
          childrenByParentId={projection.childrenByParentId}
          depth={0}
          ancestorIds={new Set()}
        />
      ))}
    </div>
  );
};

const WorkbenchFilterControls: React.FC<{
  assigneeOptions: Array<{ id: string; label: string }>;
  boardOptions: BoardOption[];
  filters: TaskFilterState;
  selectedBoardId: string | null;
  showContainersInAllTasks: boolean;
  tags: ReturnType<typeof useTagStore.getState>['tags'];
  onSelectedBoardChange: (boardId: string | null) => void;
  onShowContainersInAllTasksChange: (show: boolean) => void;
  updateFilters: (updates: Partial<TaskFilterState>) => void;
  resetFilters: () => void;
}> = ({
  assigneeOptions,
  boardOptions,
  filters,
  selectedBoardId,
  showContainersInAllTasks,
  tags,
  onSelectedBoardChange,
  onShowContainersInAllTasksChange,
  updateFilters,
  resetFilters,
}) => {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xl" data-task-workbench-filter-panel="true">
      <section className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-600">過濾器</div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-500 hover:border-primary/30 hover:text-primary"
          title="重設過濾器"
        >
          <RotateCcw size={13} />
          重設
        </button>
      </section>

      <section className="space-y-1.5">
        <label className="block text-[11px] font-bold text-slate-400">看板</label>
        <select
          value={selectedBoardId || ''}
          onChange={event => onSelectedBoardChange(event.target.value || null)}
          className={`${taskFilterFieldClass} w-full`}
          data-task-workbench-board-select="true"
        >
          {boardOptions.map(option => (
            <option key={option.boardId} value={option.boardId}>{option.path}</option>
          ))}
        </select>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">顯示</label>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          <span>列表 / 群組</span>
          <input
            type="checkbox"
            checked={showContainersInAllTasks}
            onChange={event => onShowContainersInAllTasksChange(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            data-task-workbench-show-containers-toggle="true"
          />
        </label>
      </section>

      <TaskConditionFilterControls
        assigneeOptions={assigneeOptions}
        filters={filters}
        tags={tags}
        onChange={updateFilters}
      />
    </div>
  );
};

const TaskWorkbenchPanel: React.FC<{
  canMoveTask?: boolean;
  canManageTaskReference?: boolean;
}> = ({ canMoveTask = false, canManageTaskReference = false }) => {
  const accountId = useAuthStore(state => state.user?.uid ?? null);
  const { canCreateTask } = useBoardPermissions();
  const { previewedPanel } = usePanelPreview();
  const [panelPrefs, setPanelPrefs] = React.useState<PanelPrefs>(() => readTaskWorkbenchPanelPrefs(accountId));
  const [panelWidth, setPanelWidth] = React.useState(() => readTaskWorkbenchPanelPrefs(accountId).width);
  const [unplacedRatio, setUnplacedRatio] = React.useState(() => readTaskWorkbenchPanelPrefs(accountId).unplacedRatio);
  const [isResizing, setIsResizing] = React.useState(false);
  const [isResizingLanes, setIsResizingLanes] = React.useState(false);
  const panelWidthRef = React.useRef(panelWidth);
  const unplacedRatioRef = React.useRef(unplacedRatio);
  const resizeCleanupRef = React.useRef<(() => void) | null>(null);
  const laneResizeCleanupRef = React.useRef<(() => void) | null>(null);
  const laneStackRef = React.useRef<HTMLDivElement>(null);
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(() => readTaskWorkbenchFilterPrefs(accountId).selectedBoardId);
  const [filtersByBoardId, setFiltersByBoardId] = React.useState<Record<string, TaskFilterState>>(() => readTaskWorkbenchFilterPrefs(accountId).filtersByBoardId);
  const filterToggleRef = React.useRef<HTMLButtonElement>(null);
  const filterPopoverRef = React.useRef<HTMLDivElement>(null);
  const workspaces = useBoardStore(state => state.workspaces);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const nodes = useWbsStore(state => state.nodes);
  const trackingReferences = useWbsStore(state => state.trackingReferences);
  const stagedTrackingReferences = useWbsStore(state => state.stagedTrackingReferences);
  const setNodes = useWbsStore(state => state.setNodes);
  const hydrateUnplacedTasks = useWbsStore(state => state.hydrateUnplacedTasks);
  const addNode = useWbsStore(state => state.addNode);
  const workspaceMembers = useMemberStore(state => state.workspaceMembers);
  const boardMembers = useMemberStore(state => state.boardMembers);
  const tags = useTagStore(state => state.tags);
  const inboxItems = useQuickCaptureStore(state => state.items);
  const markInboxPromoted = useQuickCaptureStore(state => state.markPromoted);

  const patchPanelPrefs = React.useCallback((updates: Partial<PanelPrefs>) => {
    setPanelPrefs(current => {
      const next = { ...current, ...updates };
      writeTaskWorkbenchPanelPrefs(next, accountId);
      return next;
    });
  }, [accountId]);

  const closePanel = React.useCallback(() => {
    patchPanelPrefs({ open: false, filtersOpen: false });
  }, [patchPanelPrefs]);

  React.useEffect(() => {
    const nextPanelPrefs = readTaskWorkbenchPanelPrefs(accountId);
    setPanelPrefs(nextPanelPrefs);
    panelWidthRef.current = nextPanelPrefs.width;
    setPanelWidth(nextPanelPrefs.width);
    unplacedRatioRef.current = nextPanelPrefs.unplacedRatio;
    setUnplacedRatio(nextPanelPrefs.unplacedRatio);
    const filterPrefs = readTaskWorkbenchFilterPrefs(accountId);
    setSelectedBoardId(filterPrefs.selectedBoardId);
    setFiltersByBoardId(filterPrefs.filtersByBoardId);

    let cancelled = false;
    void hydrateAccountLayoutPreferences(accountId).then(preferences => {
      if (cancelled) return;
      const hasHydratedWidth = typeof preferences.taskWorkbenchWidth === 'number';
      const hasHydratedRatio = typeof preferences.taskWorkbenchUnplacedRatio === 'number';
      if (!hasHydratedWidth && !hasHydratedRatio) return;
      const currentPrefs = readTaskWorkbenchPanelPrefs(accountId);
      const hydratedWidth = hasHydratedWidth
        ? clampTaskWorkbenchPanelWidth(preferences.taskWorkbenchWidth!)
        : currentPrefs.width;
      const hydratedRatio = hasHydratedRatio
        ? clampTaskWorkbenchUnplacedRatio(preferences.taskWorkbenchUnplacedRatio!)
        : currentPrefs.unplacedRatio;
      const hydratedPrefs = {
        ...currentPrefs,
        width: hydratedWidth,
        unplacedRatio: hydratedRatio,
      };
      panelWidthRef.current = hydratedWidth;
      unplacedRatioRef.current = hydratedRatio;
      setPanelWidth(hydratedWidth);
      setUnplacedRatio(hydratedRatio);
      setPanelPrefs(current => ({
        ...current,
        width: hydratedWidth,
        unplacedRatio: hydratedRatio,
      }));
      writeTaskWorkbenchPanelPrefs(hydratedPrefs, accountId);
    });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  React.useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  React.useEffect(() => {
    unplacedRatioRef.current = unplacedRatio;
  }, [unplacedRatio]);

  React.useEffect(() => {
    const handleViewportResize = () => {
      setPanelWidth(previousWidth => {
        const nextWidth = clampTaskWorkbenchPanelWidth(previousWidth);
        panelWidthRef.current = nextWidth;
        persistTaskWorkbenchWidth(nextWidth, accountId);
        return nextWidth;
      });
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [accountId]);

  React.useEffect(() => () => {
    resizeCleanupRef.current?.();
    laneResizeCleanupRef.current?.();
  }, []);

  React.useEffect(() => {
    const open = () => {
      patchPanelPrefs({ open: true });
    };
    window.addEventListener(OPEN_PANEL_EVENT, open);
    return () => window.removeEventListener(OPEN_PANEL_EVENT, open);
  }, [patchPanelPrefs]);

  React.useEffect(() => {
    const toggle = () => {
      setPanelPrefs(current => {
        const next = { ...current, open: !current.open, filtersOpen: false };
        writeTaskWorkbenchPanelPrefs(next, accountId);
        return next;
      });
    };

    window.addEventListener(TOGGLE_PANEL_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_PANEL_EVENT, toggle);
  }, [accountId]);

  React.useEffect(() => {
    window.addEventListener(CLOSE_PANEL_EVENT, closePanel);
    return () => window.removeEventListener(CLOSE_PANEL_EVENT, closePanel);
  }, [closePanel]);

  React.useEffect(() => {
    if (!panelPrefs.filtersOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (filterPopoverRef.current?.contains(target) || filterToggleRef.current?.contains(target)) return;
      patchPanelPrefs({ filtersOpen: false });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      patchPanelPrefs({ filtersOpen: false });
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [panelPrefs.filtersOpen, patchPanelPrefs]);

  const boardOptions = React.useMemo<BoardOption[]>(() => workspaces.flatMap(workspace =>
    workspace.boards.map(board => ({
      workspaceId: workspace.id,
      boardId: board.id,
      path: `${workspace.title} / ${board.title}`,
    })),
  ), [workspaces]);
  const boardScopeIds = React.useMemo(() => boardOptions.map(option => option.boardId), [boardOptions]);

  React.useEffect(() => {
    if (boardOptions.length === 0) return;

    let cancelled = false;
    void listWorkbenchTasks(boardOptions).then(workbenchSource => {
      if (cancelled) return;
      setNodes(workbenchSource.tasks, {
        scopeBoardIds: workbenchSource.loadedBoardIds,
        preserveOutOfScope: workbenchSource.failedBoardIds.length > 0,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [boardOptions, boardScopeIds, setNodes]);

  React.useEffect(() => {
    if (selectedBoardId && boardOptions.some(option => option.boardId === selectedBoardId)) return;
    const nextSelectedBoardId = activeBoardId || boardOptions[0]?.boardId || null;
    setSelectedBoardId(nextSelectedBoardId);
    writeTaskWorkbenchFilterPrefs({ selectedBoardId: nextSelectedBoardId, filtersByBoardId }, accountId);
  }, [accountId, activeBoardId, boardOptions, filtersByBoardId, selectedBoardId]);

  const selectedFilters = React.useMemo(
    () => selectedBoardId ? (filtersByBoardId[selectedBoardId] || createDefaultTaskFilters()) : createDefaultTaskFilters(),
    [filtersByBoardId, selectedBoardId],
  );

  const handleSelectedBoardChange = React.useCallback((boardId: string | null) => {
    setSelectedBoardId(boardId);
    writeTaskWorkbenchFilterPrefs({ selectedBoardId: boardId, filtersByBoardId }, accountId);
  }, [accountId, filtersByBoardId]);

  const updateSelectedFilters = React.useCallback((updates: Partial<TaskFilterState>) => {
    if (!selectedBoardId) return;
    setFiltersByBoardId(current => {
      const currentFilters = current[selectedBoardId] || createDefaultTaskFilters();
      const nextFiltersByBoardId = {
        ...current,
        [selectedBoardId]: normalizeTaskFilters({
          ...currentFilters,
          ...updates,
          statusFilters: updates.statusFilters
            ? { ...currentFilters.statusFilters, ...updates.statusFilters }
            : currentFilters.statusFilters,
        }),
      };
      writeTaskWorkbenchFilterPrefs({ selectedBoardId, filtersByBoardId: nextFiltersByBoardId }, accountId);
      return nextFiltersByBoardId;
    });
  }, [accountId, selectedBoardId]);

  const resetSelectedFilters = React.useCallback(() => {
    if (!selectedBoardId) return;
    setFiltersByBoardId(current => {
      const nextFiltersByBoardId = {
        ...current,
        [selectedBoardId]: createDefaultTaskFilters(),
      };
      writeTaskWorkbenchFilterPrefs({ selectedBoardId, filtersByBoardId: nextFiltersByBoardId }, accountId);
      return nextFiltersByBoardId;
    });
  }, [accountId, selectedBoardId]);

  const selectedBoardActiveFilterCount = React.useMemo(() => countActiveTaskFilters(selectedFilters), [selectedFilters]);
  const selectedBoardOption = React.useMemo(
    () => boardOptions.find(option => option.boardId === selectedBoardId) || null,
    [boardOptions, selectedBoardId],
  );
  const fallbackWorkspaceId = selectedBoardOption?.workspaceId || activeWorkspaceId || boardOptions[0]?.workspaceId || '';

  const assigneeOptions = React.useMemo(
    () => createBoardAssigneeFilterOptions(selectedBoardId, boardMembers, nodes, workspaceMembers),
    [boardMembers, nodes, selectedBoardId, workspaceMembers],
  );
  const workbenchProjectionTasks = React.useMemo(
    () => buildWorkbenchProjectionTasks(Object.values(nodes), trackingReferences, boardScopeIds),
    [boardScopeIds, nodes, trackingReferences],
  );
  const workbenchProjectionByBoardId = React.useMemo(() => {
    const lookup = new Map<string, TaskNode[]>();
    boardOptions.forEach(option => {
      lookup.set(option.boardId, buildWorkbenchProjectionTasks(Object.values(nodes), trackingReferences, [option.boardId]));
    });
    return lookup;
  }, [boardOptions, nodes, trackingReferences]);
  const filterProjectionByBoardId = React.useMemo(() => {
    const lookup = new Map<string, ReturnType<typeof projectTaskFilterResults>>();
    boardOptions.forEach(option => {
      const projectedTasks = workbenchProjectionByBoardId.get(option.boardId) || [];
      lookup.set(
        option.boardId,
        projectTaskFilterResults(
          Object.fromEntries(projectedTasks.map(task => [task.id, task])),
          filtersByBoardId[option.boardId] || createDefaultTaskFilters(),
          { boardId: option.boardId },
        ),
      );
    });
    return lookup;
  }, [boardOptions, filtersByBoardId, workbenchProjectionByBoardId]);

  const loadedPlacedTasks = React.useMemo(() => workbenchProjectionTasks
    .filter((task): task is TaskNode => {
      if (!task || !task.boardId || isTaskWorkbenchUnplacedTask(task)) return false;
      if (!panelPrefs.showContainersInAllTasks && !isTaskWorkbenchSortableTask(task)) return false;
      return true;
    }), [panelPrefs.showContainersInAllTasks, workbenchProjectionTasks]);

  const visiblePlacedTasks = React.useMemo(() => {
    const matchedTaskIds = new Set<string>();
    filterProjectionByBoardId.forEach(projection => projection.matchedTaskIds.forEach(taskId => matchedTaskIds.add(taskId)));
    return loadedPlacedTasks.filter(task => matchedTaskIds.has(task.id));
  }, [filterProjectionByBoardId, loadedPlacedTasks]);

  const unplacedTasks = React.useMemo(() => {
    const canonicalUnplaced = Object.values(nodes).filter((task): task is TaskNode => (
      Boolean(task)
      && !task.isArchived
      && isTaskWorkbenchUnplacedTask(task)
    ));
    const stagedReferenceRows = stagedTrackingReferences.flatMap((staged) => {
      const canonical = nodes[staged.taskId];
      if (!canonical || canonical.isArchived) return [];
      return [{
        ...canonical,
        id: staged.referenceId,
        canonicalTaskId: canonical.id,
        boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
        parentId: null,
        order: staged.order,
        isTrackingReference: true,
        trackingReferenceId: staged.referenceId,
        trackingReferenceParentPlacementId: null,
      } satisfies TaskNode];
    });
    return sortTasks([...canonicalUnplaced, ...stagedReferenceRows]);
  }, [nodes, stagedTrackingReferences]);

  const sortedPlacedTasks = React.useMemo(
    () => sortTasksByDueDate(visiblePlacedTasks),
    [visiblePlacedTasks],
  );

  const nextUnplacedOrder = React.useCallback(() => (
    unplacedTasks.reduce((max, task) => Math.max(max, task.order ?? 0), -1) + 1
  ), [unplacedTasks]);

  React.useEffect(() => {
    if (!fallbackWorkspaceId) return;
    let cancelled = false;
    const hydrate = async () => {
      const storedTasks = await loadTaskWorkbenchUnplacedTasks(accountId);
      if (cancelled) return;
      hydrateUnplacedTasks(storedTasks);

      const legacyItems = getUnclassifiedItems(inboxItems);
      const existingNodes = useWbsStore.getState().nodes;
      const existingIds = new Set(Object.keys(existingNodes));
      const hydratedTasks: TaskNode[] = [];
      let nextOrder = Math.max(
        -1,
        ...Object.values(existingNodes)
          .filter(isTaskWorkbenchUnplacedTask)
          .map(task => task.order ?? 0),
        ...storedTasks.map(task => task.order ?? 0),
      ) + 1;

      legacyItems.forEach(item => {
        const taskId = item.promotedTaskNodeId || createUnplacedTaskNodeFromInboxItem(item, fallbackWorkspaceId, nextOrder).id;
        if (existingIds.has(taskId) || storedTasks.some(task => task.id === taskId)) return;
        const task = createUnplacedTaskNodeFromInboxItem({ ...item, promotedTaskNodeId: taskId }, fallbackWorkspaceId, nextOrder);
        hydratedTasks.push(task);
        markInboxPromoted(item.id, task.id);
        nextOrder += 1;
      });

      hydratedTasks.forEach(task => addNode(task));
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [accountId, addNode, fallbackWorkspaceId, hydrateUnplacedTasks, inboxItems, markInboxPromoted]);

  const handleCreateUnplacedTask = React.useCallback(() => {
    if (!canCreateTask || !fallbackWorkspaceId) return;
    const newTask = createNewUnplacedTaskNode('', fallbackWorkspaceId, nextUnplacedOrder());
    addNode(newTask);
    prepareNewTaskNaming(newTask.id);
  }, [addNode, canCreateTask, fallbackWorkspaceId, nextUnplacedOrder]);

  const { setNodeRef: setPlacedBoardLaneRef, isOver: isPlacedBoardLaneOver } = useDroppable({
    id: `task-workbench-placed-board-lane-${selectedBoardId || 'none'}`,
    disabled: (!canMoveTask && !canManageTaskReference) || !selectedBoardOption,
    data: {
      type: 'task-workbench-placed-board-lane',
      placement: 'placed',
      boardId: selectedBoardOption?.boardId || null,
      workspaceId: selectedBoardOption?.workspaceId || null,
    },
  });

  const isExpanded = panelPrefs.open;
  const panelWidthStyle = getSharedInlinePanelWidthStyle(panelWidth);

  const applyPanelWidth = (nextWidth: number, persist = false) => {
    const clampedWidth = clampTaskWorkbenchPanelWidth(nextWidth);
    panelWidthRef.current = clampedWidth;
    setPanelWidth(clampedWidth);
    if (persist) persistTaskWorkbenchWidth(clampedWidth, accountId);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPrimaryPointerActivation(event)) return;
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = panelWidthRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      applyPanelWidth(startWidth + moveEvent.clientX - startX);
    };

    const cleanup = () => {
      setIsResizing(false);
      persistTaskWorkbenchWidth(panelWidthRef.current, accountId);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    applyPanelWidth(panelWidth + (event.key === 'ArrowRight' ? 24 : -24), true);
  };

  const applyUnplacedRatio = (nextRatio: number, persist = false) => {
    const clampedRatio = clampTaskWorkbenchUnplacedRatio(nextRatio);
    unplacedRatioRef.current = clampedRatio;
    setUnplacedRatio(clampedRatio);
    if (persist) {
      setPanelPrefs(current => ({ ...current, unplacedRatio: clampedRatio }));
      persistTaskWorkbenchUnplacedRatio(clampedRatio, accountId);
    }
  };

  const handleLaneResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPrimaryPointerActivation(event)) return;
    const laneStackHeight = laneStackRef.current?.getBoundingClientRect().height ?? 0;
    if (laneStackHeight <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    laneResizeCleanupRef.current?.();

    const startY = event.clientY;
    const startRatio = unplacedRatioRef.current;
    const availableHeight = Math.max(laneStackHeight - 12, 1);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    setIsResizingLanes(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      applyUnplacedRatio(startRatio + (moveEvent.clientY - startY) / availableHeight);
    };

    const cleanup = () => {
      setIsResizingLanes(false);
      setPanelPrefs(current => ({ ...current, unplacedRatio: unplacedRatioRef.current }));
      persistTaskWorkbenchUnplacedRatio(unplacedRatioRef.current, accountId);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      laneResizeCleanupRef.current = null;
    };

    laneResizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const handleLaneResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const laneStackHeight = laneStackRef.current?.getBoundingClientRect().height ?? 0;
    const keyboardStep = laneStackHeight > 0 ? 24 / Math.max(laneStackHeight - 12, 1) : 0.05;
    let nextRatio: number | null = null;

    if (event.key === 'ArrowUp') nextRatio = unplacedRatio - keyboardStep;
    if (event.key === 'ArrowDown') nextRatio = unplacedRatio + keyboardStep;
    if (event.key === 'Home') nextRatio = MIN_TASK_WORKBENCH_UNPLACED_RATIO;
    if (event.key === 'End') nextRatio = MAX_TASK_WORKBENCH_UNPLACED_RATIO;
    if (nextRatio === null) return;

    event.preventDefault();
    applyUnplacedRatio(nextRatio, true);
  };

  React.useEffect(() => {
    if (!isExpanded) {
      markLeftPanelClosed('task-workbench');
      return undefined;
    }
    markLeftPanelOpened('task-workbench');
    return () => markLeftPanelClosed('task-workbench');
  }, [isExpanded]);

  if (!isExpanded) {
    return null;
  }

  return (
      <aside
        className={`relative z-20 flex h-full shrink-0 flex-col bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 shadow-[4px_0_20px_rgba(15,23,42,0.12)] ${isResizing ? 'transition-none' : ''}`}
       style={{ width: panelWidthStyle }}
        data-task-workbench-panel="true"
        data-layout-region="task-command-center"
        data-task-workbench-inline="true"
       data-panel-previewed={previewedPanel === 'task-workbench' ? 'task-workbench' : undefined}
       aria-label="全域任務平台"
     >
        <div
          role="separator"
          aria-label="調整全域任務平台寬度"
          aria-orientation="vertical"
          aria-valuemin={MIN_TASK_WORKBENCH_WIDTH}
          aria-valuemax={MAX_TASK_WORKBENCH_WIDTH}
          aria-valuenow={panelWidth}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          title="拖拉調整全域任務平台寬度；方向鍵也可微調"
          className="task-workbench-resize-handle absolute right-0 top-0 z-30 h-full w-3 cursor-col-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          data-task-workbench-resize-handle="true"
        />
        <div
          className={previewedPanel === 'task-workbench' ? 'relative flex min-h-0 flex-1 flex-col ring-2 ring-inset ring-primary-400/95' : 'relative flex min-h-0 flex-1 flex-col'}
          data-panel-preview-subtree={previewedPanel === 'task-workbench' ? 'task-workbench' : undefined}
        >
          <div
            className={previewedPanel === 'task-workbench' ? 'relative border border-primary-500 bg-primary-50/70 px-3 py-2.5 ring-2 ring-inset ring-primary-500' : 'relative border border-slate-300 bg-gradient-to-r from-white via-slate-50 to-slate-100 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.08)]'}
            data-task-workbench-filter-control-area="true"
            data-panel-preview-source={previewedPanel === 'task-workbench' ? 'task-workbench' : undefined}
          >
          <div className="flex items-center gap-2">
            <div className="min-w-0 shrink-0 px-1 py-1" data-task-command-center-title="true">
              <div className="whitespace-nowrap text-sm font-black text-slate-700">
                全域任務平台
              </div>
            </div>
            <button
              ref={filterToggleRef}
              type="button"
              onClick={() => patchPanelPrefs({ filtersOpen: !panelPrefs.filtersOpen })}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                panelPrefs.filtersOpen
                  ? 'border-primary/35 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
                  : selectedBoardActiveFilterCount > 0
                    ? 'border-primary/30 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
                    : 'border-slate-300 bg-white text-slate-600 shadow-sm hover:border-slate-400 hover:bg-slate-100'
              }`}
              data-task-workbench-filter-toggle="true"
              data-active-task-workbench-filter-count={selectedBoardActiveFilterCount}
              aria-expanded={panelPrefs.filtersOpen}
              aria-label={selectedBoardActiveFilterCount > 0 ? '過濾器已啟用' : '過濾器'}
              title="調整過濾器"
            >
              <SlidersHorizontal size={13} />
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
              title="收合全域任務平台"
              data-task-workbench-collapse-toggle="true"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {panelPrefs.filtersOpen ? (
            <div
              ref={filterPopoverRef}
              className="absolute left-3 right-3 top-full z-40 mt-2 overflow-y-auto"
              style={{ maxHeight: 'min(520px, calc(100vh - 220px))' }}
              data-task-workbench-filter-popover="true"
            >
              <WorkbenchFilterControls
                assigneeOptions={assigneeOptions}
                boardOptions={boardOptions}
                filters={selectedFilters}
                selectedBoardId={selectedBoardId}
                showContainersInAllTasks={panelPrefs.showContainersInAllTasks}
                tags={tags}
                onSelectedBoardChange={handleSelectedBoardChange}
                onShowContainersInAllTasksChange={showContainersInAllTasks => patchPanelPrefs({ showContainersInAllTasks })}
                updateFilters={updateSelectedFilters}
                resetFilters={resetSelectedFilters}
              />
            </div>
          ) : null}
        </div>

        <div
          ref={laneStackRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-task-workbench-lane-stack="true"
        >
          <WorkbenchUnclassifiedSection
            tasks={unplacedTasks}
            canCreateTask={canCreateTask}
            canMoveTask={canMoveTask}
            canManageTaskReference={canManageTaskReference}
            onCreateTask={handleCreateUnplacedTask}
            style={{ flexBasis: `calc(${unplacedRatio * 100}% - 6px)` }}
          />

          <div
            role="separator"
            aria-label="調整未歸位與已歸位區域高度"
            aria-orientation="horizontal"
            aria-valuemin={Math.round(MIN_TASK_WORKBENCH_UNPLACED_RATIO * 100)}
            aria-valuemax={Math.round(MAX_TASK_WORKBENCH_UNPLACED_RATIO * 100)}
            aria-valuenow={Math.round(unplacedRatio * 100)}
            aria-valuetext={`未歸位 ${Math.round(unplacedRatio * 100)}%，已歸位 ${Math.round((1 - unplacedRatio) * 100)}%`}
            tabIndex={0}
            onPointerDown={handleLaneResizeStart}
            onKeyDown={handleLaneResizeKeyDown}
            title="拖拉調整未歸位與已歸位高度；上下方向鍵也可微調"
            className={`group relative z-30 flex h-3 shrink-0 touch-none cursor-row-resize items-center bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${isResizingLanes ? 'bg-primary/5' : ''}`}
            data-task-workbench-lane-resize-handle="true"
          >
            <span
              aria-hidden="true"
              className={`h-px w-full transition-colors ${isResizingLanes ? 'bg-primary' : 'bg-slate-400 group-hover:bg-primary group-focus-visible:bg-primary'}`}
              data-task-workbench-lane-divider-line="true"
            />
          </div>

          <div
            ref={setPlacedBoardLaneRef}
            className={`scrollbar-subtle min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-100 px-3 pb-3 transition-colors ${isPlacedBoardLaneOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : ''}`}
            data-task-workbench-placed-board-lane="true"
            data-task-workbench-lane-drop-target="placed-board"
            data-task-workbench-reference-drop-target="true"
            data-board-id={selectedBoardOption?.boardId || undefined}
            data-workspace-id={selectedBoardOption?.workspaceId || undefined}
            title="將追蹤副本拖到此處可移至目前選定看板的根層"
          >
            <div
              className="sticky top-0 z-20 mb-px box-border flex h-8 w-full min-w-0 shrink-0 items-center gap-2 bg-slate-100"
              data-task-workbench-section-header="all-tasks"
            >
              <div
                className="box-border mb-px flex h-8 min-w-0 w-[104px] shrink items-center gap-2 rounded-md border border-slate-600 bg-slate-700 px-3 text-white"
                data-task-workbench-section-label="all-tasks"
              >
                <span className="min-w-0 truncate text-[13px] font-black leading-5 text-white">已歸位</span>
              </div>
              <span className="sr-only" data-task-workbench-all-tasks-count="true">
                {sortedPlacedTasks.length}
              </span>
            </div>

            <div className="space-y-px" data-task-workbench-all-tasks-list="true">
              {sortedPlacedTasks.map(task => (
                <WorkbenchDragCard
                  key={`all-${task.id}`}
                  task={task}
                  canMoveTask={canMoveTask}
                  canManageTaskReference={canManageTaskReference}
                  placement="placed"
                  surface="all-tasks"
                  hierarchyDepth={getTaskHierarchyDepth(task, nodes)}
                />
              ))}
              {sortedPlacedTasks.length === 0 ? (
                <div className="px-1 py-1 text-sm font-semibold text-slate-500">
                  目前沒有可排序的任務。
                </div>
              ) : null}
            </div>
          </div>
        </div>

        </div>
      </aside>
  );
};

export default TaskWorkbenchPanel;
