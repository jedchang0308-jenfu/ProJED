import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronLeft,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import { useTagStore } from '../store/useTagStore';
import useQuickCaptureStore from '../store/useQuickCaptureStore';
import {
  createBoardAssigneeFilterOptions,
  createDefaultTaskFilters,
  BOARD_TASK_FILTER_PREFS_VERSION,
  countActiveTaskFilters,
  isTaskEffectivelyVisible,
  migrateLegacyDefaultTaskFilters,
  normalizeTaskFilters,
  projectTaskFilterResults,
  type TaskFilterState,
} from '../features/taskFilters';
import {
  createNewUnplacedTaskNode,
  createUnplacedTaskNodeFromInboxItem,
  isTaskWorkbenchUnplacedTask,
  readTaskWorkbenchUnplacedTasks,
  TASK_WORKBENCH_UNPLACED_BOARD_ID,
} from '../features/taskWorkbench/placement';
import { isTaskWorkbenchSortableTask, listWorkbenchTasks } from '../features/taskWorkbench/source';
import type { InboxItem, TaskNode } from '../types';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../utils/taskInteractions';
import { markLeftPanelClosed, markLeftPanelOpened } from '../utils/leftPanelEscapeStack';
import { CLOSE_PANEL_EVENT, OPEN_PANEL_EVENT, TOGGLE_PANEL_EVENT } from './taskWorkbenchPanelCommands';
import { TaskDateBadge } from './Wbs/TaskDateBadge';
import { isMobileTaskActionMode } from './Wbs/mobileTaskActionContext';
import { useTaskGestureSurface } from './Wbs/taskDrag/useTaskGestureSurface';
import TaskConditionFilterControls from './ui/TaskConditionFilterControls';
import { taskFilterFieldClass } from './ui/taskConditionFilterStyles';

const PANEL_PREFS_KEY = 'projed-task-workbench-panel:v1';
const TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v1';

type PanelPrefs = {
  open: boolean;
  filtersOpen: boolean;
  showContainersInAllTasks: boolean;
};

type WorkbenchFilterPrefs = {
  selectedBoardId: string | null;
  filtersByBoardId: Record<string, TaskFilterState>;
};

type BoardOption = {
  workspaceId: string;
  boardId: string;
  path: string;
};

const readPanelPrefs = (): PanelPrefs => {
  if (typeof window === 'undefined') return { open: false, filtersOpen: false, showContainersInAllTasks: false };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PANEL_PREFS_KEY) || '{}') as Partial<PanelPrefs>;
    return {
      open: parsed.open === true,
      filtersOpen: Boolean(parsed.filtersOpen),
      showContainersInAllTasks: Boolean(parsed.showContainersInAllTasks),
    };
  } catch {
    return { open: false, filtersOpen: false, showContainersInAllTasks: false };
  }
};

const writePanelPrefs = (prefs: PanelPrefs) => {
  try {
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort UI preference.
  }
};

const readWorkbenchFilterPrefs = (): WorkbenchFilterPrefs => {
  if (typeof window === 'undefined') return { selectedBoardId: null, filtersByBoardId: {} };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(TASK_WORKBENCH_FILTER_PREFS_KEY) || '{}') as Partial<WorkbenchFilterPrefs & { version: number }>;
    const prefsVersion = typeof parsed.version === 'number' ? parsed.version : 1;
    const filtersByBoardId = Object.entries(parsed.filtersByBoardId || {}).reduce<Record<string, TaskFilterState>>((acc, [boardId, filters]) => {
      if (typeof boardId === 'string' && filters && typeof filters === 'object') {
        acc[boardId] = normalizeTaskFilters(migrateLegacyDefaultTaskFilters(filters as Partial<TaskFilterState>, prefsVersion));
      }
      return acc;
    }, {});

    return {
      selectedBoardId: typeof parsed.selectedBoardId === 'string' ? parsed.selectedBoardId : null,
      filtersByBoardId,
    };
  } catch {
    return { selectedBoardId: null, filtersByBoardId: {} };
  }
};

const writeWorkbenchFilterPrefs = (prefs: WorkbenchFilterPrefs) => {
  try {
    window.localStorage.setItem(TASK_WORKBENCH_FILTER_PREFS_KEY, JSON.stringify({
      version: BOARD_TASK_FILTER_PREFS_VERSION,
      selectedBoardId: prefs.selectedBoardId,
      filtersByBoardId: prefs.filtersByBoardId,
      updatedAt: Date.now(),
    }));
  } catch {
    // Best-effort UI preference.
  }
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
  canMoveTask: boolean;
  onAddTask: (title: string) => void;
}> = ({ tasks, canMoveTask, onAddTask }) => {
  const [draft, setDraft] = React.useState('');
  const { setNodeRef, isOver } = useDroppable({
    id: 'task-workbench-unplaced-lane',
    disabled: !canMoveTask,
    data: {
      type: 'task-workbench-unplaced-lane',
      placement: 'unplaced',
    },
  });

  const canAdd = draft.trim().length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    onAddTask(draft);
    setDraft('');
  };

  return (
    <section
      ref={setNodeRef}
      className={`max-h-[38vh] shrink-0 overflow-y-auto overscroll-contain border-b border-[#cbd5dc] px-3 pb-3 transition-colors ${isOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'}`}
      data-task-workbench-unclassified-section="true"
      data-task-workbench-unplaced-lane="true"
      data-task-workbench-lane-drop-target="unplaced"
    >
      <form onSubmit={handleSubmit} className="mb-2 mt-2 flex gap-1.5">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="新增任務"
          data-task-workbench-unclassified-input="true"
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          title="新增任務"
          aria-label="新增任務"
          data-task-workbench-unclassified-add="true"
          data-mobile-pan-pass-through="true"
        >
          <Plus size={14} />
        </button>
      </form>

      <div
        className="sticky top-0 z-20 -mx-3 mb-2 flex items-center justify-between gap-2 border-b border-[#c2d0d8] bg-[#e1e9ee]/95 px-3 py-1.5 backdrop-blur"
        data-task-workbench-section-header="unplaced"
      >
        <div className="flex min-w-0 items-center gap-2 truncate text-[13px] font-black leading-5 text-[#324756]">
          <span className="h-3 w-1 shrink-0 rounded-full bg-[#7893a4]" aria-hidden="true" data-task-workbench-header-accent="unplaced" />
          <span className="min-w-0 truncate">未歸位</span>
        </div>
        <span className="sr-only" data-task-workbench-unclassified-count="true">
          {tasks.length}
        </span>
      </div>

      <div className="space-y-0.5" data-task-workbench-unclassified-list="true">
        {tasks.map(task => (
          <WorkbenchDragCard
            key={task.id}
            task={task}
            canMoveTask={canMoveTask}
            placement="unplaced"
          />
        ))}
        {tasks.length === 0 ? (
          <div className="px-1 py-1 text-sm font-semibold text-slate-500">
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
  placement: 'unplaced' | 'placed';
  surface?: 'unplaced-lane' | 'all-tasks';
  hierarchyDepth?: number;
};

interface WorkbenchTaskRowProps extends WorkbenchDragCardProps {
  isDragging: boolean;
  canUseDragSurface: boolean;
  setNodeRef?: (element: HTMLElement | null) => void;
  draggableBindings?: Record<string, unknown>;
  gestureHandlers: ReturnType<typeof useTaskGestureSurface>['handlers'];
}

const WorkbenchTaskRow: React.FC<WorkbenchTaskRowProps> = ({
  task,
  placement,
  surface = placement === 'unplaced' ? 'unplaced-lane' : 'all-tasks',
  hierarchyDepth = 0,
  isDragging,
  canUseDragSurface,
  setNodeRef,
  draggableBindings = {},
  gestureHandlers,
}) => {
  const isUnplacedLaneRow = placement === 'unplaced' && surface === 'unplaced-lane';
  const isAllTasksCard = surface === 'all-tasks';
  const depth = Math.max(0, Math.min(hierarchyDepth, 6));
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const hierarchyTextClass = depth === 0
    ? 'font-semibold text-slate-800'
    : depth === 1
      ? 'font-medium text-slate-700'
      : 'font-medium text-slate-600';
  const dependencies = useWbsStore(s => s.dependencies);
  const getNodeLockStatus = useWbsStore(s => s.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(task.id, dependencies);
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isMobileTaskActionMode()) return;
    setContextMenuState({
      kind: 'task',
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: task.id,
      title: task.title || '未命名任務',
    });
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
      ref={canUseDragSurface ? setNodeRef : undefined}
      {...draggableBindings}
      {...gestureHandlers}
      onClick={(event) => {
        if (isDragging || isTaskPrimaryActionTarget(event.target)) return;
        selectAndOpenTaskDetails(task.id);
      }}
      onContextMenu={handleContextMenu}
      className={className}
      style={style}
      data-task-workbench-task-card="true"
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
      data-task-workbench-hierarchy-row={!unplacedLane ? 'true' : undefined}
      data-task-workbench-hierarchy-depth={unplacedLane ? 0 : depth}
      data-touch-tap-guard="true"
      data-task-id={task.id}
      data-mobile-drop-target={task.id}
      data-task-drop-surface-kind={canUseDragSurface ? 'workbench-unplaced-row' : undefined}
    >
      {children}
    </div>
  );
  const renderWorkbenchTaskContent = ({
    titleClassName,
  }: {
    titleClassName: string;
  }) => (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className={titleClassName}
        title={task.title || '未命名任務'}
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
    </div>
  );

  if (isUnplacedLaneRow) {
    return renderWorkbenchTaskRow({
      unplacedLane: true,
      className: `kanban-checklist-item group flex min-h-[28px] cursor-pointer items-center rounded-md px-1.5 py-0.5 transition-colors ${
          isDragging ? 'bg-primary/5 opacity-40' : 'hover:bg-slate-50'
        }`,
      children: renderWorkbenchTaskContent({
        titleClassName: 'task-title-text min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-slate-700',
      }),
    });
  }

  return renderWorkbenchTaskRow({
    unplacedLane: false,
    className: `group flex min-h-[28px] cursor-pointer items-center rounded-md px-1.5 py-1 transition-colors ${
        isDragging ? 'bg-primary/5 opacity-40' : 'hover:bg-white/80'
    }`,
    style: { paddingLeft: `${0.375 + depth * 0.75}rem` },
    children: renderWorkbenchTaskContent({
      titleClassName: `min-w-0 flex-1 truncate text-sm leading-6 ${hierarchyTextClass}`,
    }),
  });
};

const WorkbenchUnplacedDragCard: React.FC<WorkbenchDragCardProps> = ({
  task,
  canMoveTask,
  surface = 'unplaced-lane',
  hierarchyDepth = 0,
}) => {
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const taskGesture = useTaskGestureSurface({
    task,
    sourceKind: 'workbench-unplaced-row',
    mobileActionEnabled: true,
    onNonMobileLongPress: (event) => {
      event.preventDefault();
      const touch = event.touches[0];
      setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId: task.id,
        title: task.title || '未命名任務',
      });
    },
  });
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-workbench-${surface}-${task.id}`,
    disabled: !canMoveTask || taskGesture.mobileActionMode,
    data: {
      type: 'wbs-card',
      source: 'task-workbench',
      placement: 'unplaced',
      nodeId: task.id,
      sourceWorkspaceId: task.workspaceId,
      sourceBoardId: task.boardId,
      title: task.title,
    },
  });
  const canUseDragSurface = canMoveTask && !taskGesture.mobileActionMode;

  return (
    <WorkbenchTaskRow
      task={task}
      canMoveTask={canMoveTask}
      placement="unplaced"
      surface={surface}
      hierarchyDepth={hierarchyDepth}
      isDragging={isDragging}
      canUseDragSurface={canUseDragSurface}
      setNodeRef={setNodeRef}
      draggableBindings={canUseDragSurface ? { ...attributes, ...listeners } : {}}
      gestureHandlers={taskGesture.handlers}
    />
  );
};

const WorkbenchPlacedReadOnlyCard: React.FC<WorkbenchDragCardProps> = ({
  task,
  canMoveTask,
  surface = 'all-tasks',
  hierarchyDepth = 0,
}) => {
  const taskGesture = useTaskGestureSurface({
    task,
    sourceKind: null,
    mobileActionEnabled: false,
  });

  return (
    <WorkbenchTaskRow
      task={task}
      canMoveTask={canMoveTask}
      placement="placed"
      surface={surface}
      hierarchyDepth={hierarchyDepth}
      isDragging={false}
      canUseDragSurface={false}
      gestureHandlers={taskGesture.handlers}
    />
  );
};

const WorkbenchDragCard: React.FC<WorkbenchDragCardProps> = (props) => (
  props.placement === 'placed'
    ? <WorkbenchPlacedReadOnlyCard {...props} />
    : <WorkbenchUnplacedDragCard {...props} />
);

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

const TaskWorkbenchPanel: React.FC<{ canMoveTask?: boolean }> = ({ canMoveTask = false }) => {
  const [panelPrefs, setPanelPrefs] = React.useState<PanelPrefs>(() => readPanelPrefs());
  const [isNarrowViewport, setIsNarrowViewport] = React.useState(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = React.useState(false);
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(() => readWorkbenchFilterPrefs().selectedBoardId);
  const [filtersByBoardId, setFiltersByBoardId] = React.useState<Record<string, TaskFilterState>>(() => readWorkbenchFilterPrefs().filtersByBoardId);
  const filterToggleRef = React.useRef<HTMLButtonElement>(null);
  const filterPopoverRef = React.useRef<HTMLDivElement>(null);
  const workspaces = useBoardStore(state => state.workspaces);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const nodes = useWbsStore(state => state.nodes);
  const setNodes = useWbsStore(state => state.setNodes);
  const addNode = useWbsStore(state => state.addNode);
  const workspaceMembers = useMemberStore(state => state.workspaceMembers);
  const boardMembers = useMemberStore(state => state.boardMembers);
  const tags = useTagStore(state => state.tags);
  const inboxItems = useQuickCaptureStore(state => state.items);
  const markInboxPromoted = useQuickCaptureStore(state => state.markPromoted);

  const patchPanelPrefs = React.useCallback((updates: Partial<PanelPrefs>) => {
    setPanelPrefs(current => {
      const next = { ...current, ...updates };
      writePanelPrefs(next);
      return next;
    });
  }, []);

  const closePanel = React.useCallback(() => {
    if (isNarrowViewport) {
      setMobileOverlayOpen(false);
      return;
    }
    patchPanelPrefs({ open: false, filtersOpen: false });
  }, [isNarrowViewport, patchPanelPrefs]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => {
      const isNarrow = media.matches;
      setIsNarrowViewport(isNarrow);
      if (!isNarrow) setMobileOverlayOpen(false);
    };
    syncViewport();
    media.addEventListener?.('change', syncViewport);
    return () => media.removeEventListener?.('change', syncViewport);
  }, []);

  React.useEffect(() => {
    const open = () => {
      if (isNarrowViewport) {
        setMobileOverlayOpen(true);
        return;
      }
      patchPanelPrefs({ open: true });
    };
    window.addEventListener(OPEN_PANEL_EVENT, open);
    return () => window.removeEventListener(OPEN_PANEL_EVENT, open);
  }, [isNarrowViewport, patchPanelPrefs]);

  React.useEffect(() => {
    const toggle = () => {
      if (isNarrowViewport) {
        setMobileOverlayOpen(current => !current);
        return;
      }

      setPanelPrefs(current => {
        const next = { ...current, open: !current.open, filtersOpen: false };
        writePanelPrefs(next);
        return next;
      });
    };

    window.addEventListener(TOGGLE_PANEL_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_PANEL_EVENT, toggle);
  }, [isNarrowViewport]);

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
  const boardScopeIdSet = React.useMemo(() => new Set(boardScopeIds), [boardScopeIds]);

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
    writeWorkbenchFilterPrefs({ selectedBoardId: nextSelectedBoardId, filtersByBoardId });
  }, [activeBoardId, boardOptions, filtersByBoardId, selectedBoardId]);

  const selectedFilters = React.useMemo(
    () => selectedBoardId ? (filtersByBoardId[selectedBoardId] || createDefaultTaskFilters()) : createDefaultTaskFilters(),
    [filtersByBoardId, selectedBoardId],
  );

  const handleSelectedBoardChange = React.useCallback((boardId: string | null) => {
    setSelectedBoardId(boardId);
    writeWorkbenchFilterPrefs({ selectedBoardId: boardId, filtersByBoardId });
  }, [filtersByBoardId]);

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
      writeWorkbenchFilterPrefs({ selectedBoardId, filtersByBoardId: nextFiltersByBoardId });
      return nextFiltersByBoardId;
    });
  }, [selectedBoardId]);

  const resetSelectedFilters = React.useCallback(() => {
    if (!selectedBoardId) return;
    setFiltersByBoardId(current => {
      const nextFiltersByBoardId = {
        ...current,
        [selectedBoardId]: createDefaultTaskFilters(),
      };
      writeWorkbenchFilterPrefs({ selectedBoardId, filtersByBoardId: nextFiltersByBoardId });
      return nextFiltersByBoardId;
    });
  }, [selectedBoardId]);

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
  const filterProjectionByBoardId = React.useMemo(() => {
    const lookup = new Map<string, ReturnType<typeof projectTaskFilterResults>>();
    boardOptions.forEach(option => {
      lookup.set(
        option.boardId,
        projectTaskFilterResults(nodes, filtersByBoardId[option.boardId] || createDefaultTaskFilters(), { boardId: option.boardId }),
      );
    });
    return lookup;
  }, [boardOptions, filtersByBoardId, nodes]);

  const loadedPlacedTasks = React.useMemo(() => Object.values(nodes)
    .filter((task): task is TaskNode => {
      if (!task || !task.boardId || isTaskWorkbenchUnplacedTask(task)) return false;
      if (!panelPrefs.showContainersInAllTasks && !isTaskWorkbenchSortableTask(task)) return false;
      if (!boardScopeIdSet.has(task.boardId)) return false;
      return isTaskEffectivelyVisible(task, nodes, { boardId: task.boardId });
    }), [boardScopeIdSet, nodes, panelPrefs.showContainersInAllTasks]);

  const visiblePlacedTasks = React.useMemo(
    () => loadedPlacedTasks.filter(task => filterProjectionByBoardId.get(task.boardId)?.matchedTaskIds.has(task.id)),
    [filterProjectionByBoardId, loadedPlacedTasks],
  );

  const unplacedTasks = React.useMemo(() => sortTasks(Object.values(nodes)
    .filter((task): task is TaskNode => (
      Boolean(task) &&
      !task.isArchived &&
      isTaskWorkbenchUnplacedTask(task) &&
      (panelPrefs.showContainersInAllTasks || isTaskWorkbenchSortableTask(task))
    ))), [nodes, panelPrefs.showContainersInAllTasks]);

  const sortedPlacedTasks = React.useMemo(
    () => sortTasksByDueDate(visiblePlacedTasks),
    [visiblePlacedTasks],
  );

  const nextUnplacedOrder = React.useCallback(() => (
    unplacedTasks.reduce((max, task) => Math.max(max, task.order ?? 0), -1) + 1
  ), [unplacedTasks]);

  React.useEffect(() => {
    if (!fallbackWorkspaceId) return;
    const storedTasks = readTaskWorkbenchUnplacedTasks();
    const legacyItems = getUnclassifiedItems(inboxItems);
    const existingNodes = useWbsStore.getState().nodes;
    const existingIds = new Set(Object.keys(existingNodes));
    const hydratedTasks: TaskNode[] = [];
    let nextOrder = Math.max(
      -1,
      ...storedTasks.map(task => task.order ?? 0),
      ...Object.values(existingNodes)
        .filter(isTaskWorkbenchUnplacedTask)
        .map(task => task.order ?? 0),
    ) + 1;

    storedTasks.forEach(task => {
      if (!existingIds.has(task.id)) hydratedTasks.push(task);
    });

    legacyItems.forEach(item => {
      const taskId = item.promotedTaskNodeId || createUnplacedTaskNodeFromInboxItem(item, fallbackWorkspaceId, nextOrder).id;
      if (existingIds.has(taskId) || storedTasks.some(task => task.id === taskId)) return;
      const task = createUnplacedTaskNodeFromInboxItem({ ...item, promotedTaskNodeId: taskId }, fallbackWorkspaceId, nextOrder);
      hydratedTasks.push(task);
      markInboxPromoted(item.id, task.id);
      nextOrder += 1;
    });

    hydratedTasks.forEach(task => addNode(task));
  }, [addNode, fallbackWorkspaceId, inboxItems, markInboxPromoted]);

  const handleAddUnplacedTask = React.useCallback((title: string) => {
    if (!fallbackWorkspaceId) return;
    addNode(createNewUnplacedTaskNode(title, fallbackWorkspaceId, nextUnplacedOrder()));
  }, [addNode, fallbackWorkspaceId, nextUnplacedOrder]);

  const { setNodeRef: setPlacedBoardLaneRef, isOver: isPlacedBoardLaneOver } = useDroppable({
    id: `task-workbench-placed-board-lane-${selectedBoardId || 'none'}`,
    disabled: !canMoveTask || !selectedBoardOption,
    data: {
      type: 'task-workbench-placed-board-lane',
      placement: 'placed',
      boardId: selectedBoardOption?.boardId || null,
      workspaceId: selectedBoardOption?.workspaceId || null,
    },
  });

  const isExpanded = isNarrowViewport ? mobileOverlayOpen : panelPrefs.open;
  const panelOverlayWidth = isNarrowViewport ? 'min(340px, calc(100vw - 52px))' : '340px';

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
    <>
      {isNarrowViewport ? (
        <button
          type="button"
          className="fixed bottom-0 right-0 top-10 z-40 bg-slate-900/20"
          style={{ left: panelOverlayWidth }}
          onClick={closePanel}
          aria-label="關閉全域任務平台遮罩"
          data-task-workbench-backdrop="true"
          data-mobile-task-workbench-backdrop="true"
        />
      ) : null}
      <aside
        className={`flex max-w-[calc(100vw-48px)] shrink-0 flex-col border-r-2 border-[#b7c5cf] bg-gradient-to-b from-[#f7f9fa] via-[#eef3f6] to-[#e4ebef] ${
          isNarrowViewport
            ? 'fixed bottom-0 left-0 top-10 z-50 shadow-[8px_0_28px_rgba(70,92,106,0.22)]'
            : 'relative z-20 h-full shadow-[4px_0_20px_rgba(70,92,106,0.16)]'
        }`}
        style={{ width: panelOverlayWidth }}
        data-task-workbench-panel="true"
        data-layout-region="task-command-center"
        data-task-workbench-overlay={isNarrowViewport ? 'true' : undefined}
        data-task-workbench-inline={!isNarrowViewport ? 'true' : undefined}
        data-mobile-task-workbench-overlay={isNarrowViewport ? 'true' : undefined}
        aria-label="全域任務平台"
      >
        <div
          className="relative border-b border-[#c3ccd2] bg-gradient-to-r from-[#fbfcfc] via-[#f1f5f7] to-[#e8eef2] px-3 py-2.5 shadow-[0_1px_0_rgba(70,92,106,0.12)]"
          data-task-workbench-filter-control-area="true"
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 shrink-0 rounded-md border border-[#c7d1d8] bg-[#fbfcfc] px-2 py-1 shadow-sm" data-task-command-center-title="true">
              <div className="whitespace-nowrap text-sm font-black text-[#324756]">
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
                    ? 'border-[#a9bbc8] bg-[#e7eef2] text-[#304a5c] shadow-sm ring-1 ring-[#a9bbc8]/50'
                    : 'border-[#c7d1d8] bg-[#fbfcfc] text-[#536b7b] shadow-sm hover:border-[#a9bbc8] hover:bg-[#edf3f6]'
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
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#607789] transition-colors hover:bg-[#e4ecf1] hover:text-[#304a5c]"
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

        <WorkbenchUnclassifiedSection
          tasks={unplacedTasks}
          canMoveTask={canMoveTask}
          onAddTask={handleAddUnplacedTask}
        />

        <div
          ref={setPlacedBoardLaneRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 transition-colors ${isPlacedBoardLaneOver ? 'bg-[#e6edf2] ring-2 ring-inset ring-[#a9bbc8]/60' : 'bg-[#f2f5f7]'}`}
          data-task-workbench-placed-board-lane="true"
          data-task-workbench-lane-drop-target="placed-board"
          data-board-id={selectedBoardOption?.boardId || undefined}
          data-workspace-id={selectedBoardOption?.workspaceId || undefined}
        >
          <div
            className="sticky top-0 z-20 -mx-3 mb-2 flex items-center justify-between gap-2 border-b border-[#c2d0d8] bg-[#e1e9ee]/95 px-3 py-2 backdrop-blur"
            data-task-workbench-section-header="all-tasks"
          >
            <div className="flex min-w-0 items-center gap-2 truncate text-[13px] font-black leading-5 text-[#324756]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7893a4] shadow-[0_0_0_3px_rgba(120,147,164,0.18)]" aria-hidden="true" data-task-workbench-header-accent="placed" />
              <span className="min-w-0 truncate">已歸位</span>
            </div>
            <span className="sr-only" data-task-workbench-all-tasks-count="true">
              {sortedPlacedTasks.length}
            </span>
          </div>

          <div className="space-y-0.5" data-task-workbench-all-tasks-list="true">
            {sortedPlacedTasks.map(task => (
              <WorkbenchDragCard
                key={`all-${task.id}`}
                task={task}
                canMoveTask={canMoveTask}
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

      </aside>
    </>
  );
};

export default TaskWorkbenchPanel;
