import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ChevronDown,
  Filter,
  Inbox,
  NotebookText,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useMemberStore } from '../store/useMemberStore';
import { useTagStore } from '../store/useTagStore';
import useQuickCaptureStore from '../store/useQuickCaptureStore';
import {
  createBoardAssigneeFilterOptions,
  createDefaultTaskFilters,
  countActiveTaskFilters,
  projectTaskFilterResults,
  TASK_STATUS_OPTIONS,
  UNASSIGNED_ASSIGNEE_FILTER,
  type TaskFilterState,
} from '../features/taskFilters';
import {
  createNewUnplacedTaskNode,
  createUnplacedTaskNodeFromInboxItem,
  isTaskWorkbenchUnplacedTask,
  readTaskWorkbenchUnplacedTasks,
} from '../features/taskWorkbench/placement';
import type { InboxItem, TaskNode, TaskStatus } from '../types';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../utils/taskInteractions';
import { TaskDragHandle } from './Wbs/TaskDragHandle';

const PANEL_PREFS_KEY = 'projed-task-workbench-panel:v1';
const OPEN_PANEL_EVENT = 'projed:open-task-workbench-panel';

type PanelPrefs = {
  open: boolean;
  filtersOpen: boolean;
};

type BoardOption = {
  workspaceId: string;
  boardId: string;
  path: string;
};

export const openTaskWorkbenchPanel = () => {
  try {
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify({ open: true, filtersOpen: false }));
    window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT));
  } catch {
    // Best-effort UI preference.
  }
};

const readPanelPrefs = (): PanelPrefs => {
  if (typeof window === 'undefined') return { open: true, filtersOpen: false };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PANEL_PREFS_KEY) || '{}') as Partial<PanelPrefs>;
    return {
      open: parsed.open !== false,
      filtersOpen: Boolean(parsed.filtersOpen),
    };
  } catch {
    return { open: true, filtersOpen: false };
  }
};

const writePanelPrefs = (prefs: PanelPrefs) => {
  try {
    window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort UI preference.
  }
};

const chipClass = (active: boolean) =>
  `inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${
    active
      ? 'border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20'
      : 'border-slate-200 bg-white text-slate-600 hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
  }`;

const fieldClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

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
      className={`border-b border-slate-200 px-4 py-4 transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-inset ring-primary/20' : 'bg-white'}`}
      data-task-workbench-unclassified-section="true"
      data-task-workbench-unplaced-lane="true"
      data-task-workbench-lane-drop-target="unplaced"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <Inbox size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-800">未歸位</div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-md border border-amber-100 bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700"
          data-task-workbench-unclassified-count="true"
        >
          {tasks.length}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="新增未歸位任務"
          data-task-workbench-unclassified-input="true"
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          title="新增未歸位任務"
          data-task-workbench-unclassified-add="true"
        >
          <Plus size={16} />
        </button>
      </form>

      <div className="mt-3 space-y-2.5" data-task-workbench-unclassified-list="true">
        {tasks.map(task => (
          <WorkbenchDragCard
            key={task.id}
            task={task}
            canMoveTask={canMoveTask}
            placement="unplaced"
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
            目前沒有未歸位任務。
          </div>
        ) : null}
      </div>
    </section>
  );
};

const WorkbenchDragCard: React.FC<{
  task: TaskNode;
  canMoveTask: boolean;
  placement: 'unplaced' | 'placed';
  surface?: 'unplaced-lane' | 'all-tasks';
}> = ({ task, canMoveTask, placement, surface = placement === 'unplaced' ? 'unplaced-lane' : 'all-tasks' }) => {
  const isUnplacedLaneRow = placement === 'unplaced' && surface === 'unplaced-lane';
  const isAllTasksCard = surface === 'all-tasks';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-workbench-${surface}-${task.id}`,
    disabled: !canMoveTask,
    data: {
      type: 'wbs-card',
      source: 'task-workbench',
      placement,
      nodeId: task.id,
      sourceWorkspaceId: task.workspaceId,
      sourceBoardId: task.boardId,
      title: task.title,
    },
  });

  if (isUnplacedLaneRow) {
    return (
      <div
        ref={setNodeRef}
        onClick={(event) => {
          if (isDragging || isTaskPrimaryActionTarget(event.target)) return;
          selectAndOpenTaskDetails(task.id);
        }}
        className={`kanban-checklist-item group flex min-h-[32px] cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors ${
          isDragging ? 'bg-primary/5 opacity-40' : 'hover:bg-slate-50'
        }`}
        data-task-workbench-task-card="true"
        data-task-workbench-unplaced-task-card="true"
        data-task-workbench-unclassified-item="true"
        data-task-workbench-task-placement={placement}
        data-task-workbench-unplaced-compact-row="true"
        data-task-id={task.id}
      >
        <TaskDragHandle
          attributes={attributes}
          listeners={listeners}
          disabled={!canMoveTask}
          title={canMoveTask ? '拖移任務' : '此看板沒有移動權限'}
          size="xs"
          className="shrink-0"
        />
        <span
          className="task-title-text min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-slate-700"
          title={task.title || '未命名任務'}
        >
          {task.title || '未命名任務'}
        </span>
        {task.endDate ? (
          <span className="ml-1 shrink-0 rounded border border-slate-200 bg-white px-1 py-0 text-[9px] font-semibold text-slate-400">
            {task.endDate}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      onClick={(event) => {
        if (isDragging || isTaskPrimaryActionTarget(event.target)) return;
        selectAndOpenTaskDetails(task.id);
      }}
      className={`cursor-pointer rounded-md border border-sky-100 bg-white p-4 shadow-sm transition ${
        isDragging ? 'opacity-40' : 'hover:border-primary/30 hover:shadow-md'
      }`}
      data-task-workbench-task-card="true"
      data-task-workbench-all-task-card={isAllTasksCard ? 'true' : undefined}
      data-task-workbench-placed-task-card={placement === 'placed' ? 'true' : undefined}
      data-task-workbench-task-placement={placement}
      data-task-id={task.id}
    >
      <div className="flex items-start gap-2">
        <TaskDragHandle
          attributes={attributes}
          listeners={listeners}
          disabled={!canMoveTask}
          title={canMoveTask ? '拖移任務' : '此看板沒有移動權限'}
          size="sm"
          className="-ml-1 mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-800">{task.title || '未命名任務'}</div>
        </div>
      </div>
    </div>
  );
};

const WorkbenchFilterControls: React.FC<{
  assigneeOptions: Array<{ id: string; label: string }>;
  boardOptions: BoardOption[];
  filters: TaskFilterState;
  selectedBoardId: string | null;
  tags: ReturnType<typeof useTagStore.getState>['tags'];
  onSelectedBoardChange: (boardId: string | null) => void;
  updateFilters: (updates: Partial<TaskFilterState>) => void;
  resetFilters: () => void;
}> = ({ assigneeOptions, boardOptions, filters, selectedBoardId, tags, onSelectedBoardChange, updateFilters, resetFilters }) => {
  const toggleStatus = (status: TaskStatus) => {
    updateFilters({
      statusFilters: {
        ...filters.statusFilters,
        [status]: !filters.statusFilters[status],
      },
    });
  };

  const toggleAssignee = (assigneeId: string) => {
    updateFilters({
      selectedAssigneeIds: filters.selectedAssigneeIds.includes(assigneeId)
        ? filters.selectedAssigneeIds.filter(id => id !== assigneeId)
        : [...filters.selectedAssigneeIds, assigneeId],
    });
  };

  const toggleTag = (tagId: string) => {
    updateFilters({
      selectedTagIds: filters.selectedTagIds.includes(tagId)
        ? filters.selectedTagIds.filter(id => id !== tagId)
        : [...filters.selectedTagIds, tagId],
    });
  };

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
          className={`${fieldClass} w-full`}
          data-task-workbench-board-select="true"
        >
          {boardOptions.map(option => (
            <option key={option.boardId} value={option.boardId}>{option.path}</option>
          ))}
        </select>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <Filter size={13} />
          任務狀態
        </label>
        <div className="flex flex-wrap gap-2">
          {TASK_STATUS_OPTIONS.map(status => (
            <button
              key={status.key}
              type="button"
              onClick={() => toggleStatus(status.key)}
              className={chipClass(filters.statusFilters[status.key])}
              aria-pressed={filters.statusFilters[status.key]}
            >
              <span className={`h-2 w-2 rounded-full ${status.color}`} />
              {status.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">到期日與關鍵字</label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            min={0}
            max={365}
            value={filters.dueWithinDays ?? ''}
            onChange={event => updateFilters({ dueWithinDays: event.target.value === '' ? null : Number(event.target.value) })}
            className={fieldClass}
            placeholder="天數"
          />
          <button type="button" onClick={() => updateFilters({ dueWithinDays: null })} className="btn-outline h-8 px-2 text-xs font-semibold">
            清除
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2">
          <Search size={14} className="text-slate-400" />
          <input
            value={filters.keyword}
            onChange={event => updateFilters({ keyword: event.target.value })}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
            placeholder="搜尋任務名稱"
          />
        </label>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">負責人</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleAssignee(UNASSIGNED_ASSIGNEE_FILTER)}
            className={chipClass(filters.selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER))}
          >
            <UserRound size={13} />
            未指派
          </button>
          {assigneeOptions.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggleAssignee(option.id)}
              className={chipClass(filters.selectedAssigneeIds.includes(option.id))}
            >
              <UserRound size={13} />
              <span className="max-w-[7rem] truncate">{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">標籤</label>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-400">尚無標籤</span>
          ) : tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={chipClass(filters.selectedTagIds.includes(tag.id))}
            >
              {tag.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

const TaskWorkbenchPanel: React.FC<{ canMoveTask?: boolean }> = ({ canMoveTask = false }) => {
  const [panelPrefs, setPanelPrefs] = React.useState<PanelPrefs>(() => readPanelPrefs());
  const [isNarrowViewport, setIsNarrowViewport] = React.useState(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = React.useState(false);
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(null);
  const [filtersByBoardId, setFiltersByBoardId] = React.useState<Record<string, TaskFilterState>>({});
  const filterToggleRef = React.useRef<HTMLButtonElement>(null);
  const filterPopoverRef = React.useRef<HTMLDivElement>(null);
  const workspaces = useBoardStore(state => state.workspaces);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const nodes = useWbsStore(state => state.nodes);
  const addNode = useWbsStore(state => state.addNode);
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

  React.useEffect(() => {
    if (selectedBoardId && boardOptions.some(option => option.boardId === selectedBoardId)) return;
    setSelectedBoardId(activeBoardId || boardOptions[0]?.boardId || null);
  }, [activeBoardId, boardOptions, selectedBoardId]);

  const selectedFilters = React.useMemo(
    () => selectedBoardId ? (filtersByBoardId[selectedBoardId] || createDefaultTaskFilters()) : createDefaultTaskFilters(),
    [filtersByBoardId, selectedBoardId],
  );

  const updateSelectedFilters = React.useCallback((updates: Partial<TaskFilterState>) => {
    if (!selectedBoardId) return;
    setFiltersByBoardId(current => ({
      ...current,
      [selectedBoardId]: {
        ...(current[selectedBoardId] || createDefaultTaskFilters()),
        ...updates,
      },
    }));
  }, [selectedBoardId]);

  const resetSelectedFilters = React.useCallback(() => {
    if (!selectedBoardId) return;
    setFiltersByBoardId(current => ({
      ...current,
      [selectedBoardId]: createDefaultTaskFilters(),
    }));
  }, [selectedBoardId]);

  const selectedBoardActiveFilterCount = React.useMemo(() => countActiveTaskFilters(selectedFilters), [selectedFilters]);
  const selectedBoardOption = React.useMemo(
    () => boardOptions.find(option => option.boardId === selectedBoardId) || null,
    [boardOptions, selectedBoardId],
  );
  const fallbackWorkspaceId = selectedBoardOption?.workspaceId || activeWorkspaceId || boardOptions[0]?.workspaceId || '';

  const assigneeOptions = React.useMemo(
    () => createBoardAssigneeFilterOptions(selectedBoardId, boardMembers, nodes),
    [boardMembers, nodes, selectedBoardId],
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
    .filter((task): task is TaskNode => Boolean(task) && !task.isArchived && Boolean(task.boardId) && !isTaskWorkbenchUnplacedTask(task)), [nodes]);

  const visiblePlacedTasks = React.useMemo(
    () => loadedPlacedTasks.filter(task => filterProjectionByBoardId.get(task.boardId)?.matchedTaskIds.has(task.id)),
    [filterProjectionByBoardId, loadedPlacedTasks],
  );

  const unplacedTasks = React.useMemo(() => sortTasks(Object.values(nodes)
    .filter((task): task is TaskNode => Boolean(task) && !task.isArchived && isTaskWorkbenchUnplacedTask(task))), [nodes]);

  const allSortedTasks = React.useMemo(
    () => sortTasksByDueDate([...visiblePlacedTasks, ...unplacedTasks]),
    [unplacedTasks, visiblePlacedTasks],
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

  if (!isExpanded) {
    return (
      <aside
        className="flex w-12 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-3"
        data-task-workbench-panel="collapsed"
        aria-label="全域任務平台"
      >
        <button
          type="button"
          onClick={() => {
            if (isNarrowViewport) setMobileOverlayOpen(true);
            else patchPanelPrefs({ open: true });
          }}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/15"
          title="開啟全域任務平台"
        >
          <NotebookText size={18} />
        </button>
        <div className="mt-3 rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-600">
          {allSortedTasks.length}
        </div>
      </aside>
    );
  }

  return (
    <>
      {isNarrowViewport ? (
        <button
          type="button"
          className="fixed bottom-0 right-0 top-10 z-40 bg-slate-900/20 md:hidden"
          style={{ left: 'min(340px, calc(100vw - 52px))' }}
          onClick={() => setMobileOverlayOpen(false)}
          aria-label="關閉全域任務平台遮罩"
        />
      ) : null}
      <aside
        className={`flex max-w-[calc(100vw-48px)] shrink-0 flex-col border-r border-slate-200 bg-white shadow-[8px_0_24px_rgba(15,23,42,0.06)] ${
          isNarrowViewport
            ? 'fixed bottom-0 left-0 top-10 z-50'
            : 'w-[340px]'
        }`}
        style={isNarrowViewport ? { width: 'min(340px, calc(100vw - 52px))' } : undefined}
        data-task-workbench-panel="true"
        aria-label="全域任務平台"
      >
        <div className="relative border-b border-slate-200 px-3 py-3" data-task-workbench-filter-control-area="true">
          <div className="flex items-center gap-2">
            <div className="min-w-0 shrink-0">
              <div className="flex items-center gap-2 whitespace-nowrap text-sm font-black text-slate-900">
                <SlidersHorizontal size={16} className="text-primary" />
                全域任務平台
              </div>
            </div>
            <button
              ref={filterToggleRef}
              type="button"
              onClick={() => patchPanelPrefs({ filtersOpen: !panelPrefs.filtersOpen })}
              className={`inline-flex h-8 min-w-[6.5rem] shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-bold transition ${
                panelPrefs.filtersOpen
                  ? 'border-primary/35 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
                  : selectedBoardActiveFilterCount > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200/70'
                    : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
              }`}
              data-task-workbench-filter-toggle="true"
              data-active-task-workbench-filter-count={selectedBoardActiveFilterCount}
              aria-expanded={panelPrefs.filtersOpen}
              title="調整過濾器"
            >
              <SlidersHorizontal size={13} />
              <span>過濾器</span>
              {selectedBoardActiveFilterCount > 0 ? (
                <span className="rounded-full bg-amber-400 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                  {selectedBoardActiveFilterCount}
                </span>
              ) : null}
              <ChevronDown size={11} className={`transition-transform duration-200 ${panelPrefs.filtersOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isNarrowViewport) setMobileOverlayOpen(false);
                else patchPanelPrefs({ open: false });
              }}
              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="收合全域任務平台"
            >
              <PanelLeftClose size={16} />
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
                tags={tags}
                onSelectedBoardChange={setSelectedBoardId}
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
          className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 transition-colors ${isPlacedBoardLaneOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/20' : 'bg-sky-50/70'}`}
          data-task-workbench-placed-board-lane="true"
          data-task-workbench-lane-drop-target="placed-board"
        >
          <div className="mb-4 text-base font-black text-slate-800">
            所有任務排序
          </div>

          <div className="space-y-3" data-task-workbench-all-tasks-list="true">
            {allSortedTasks.map(task => (
              <WorkbenchDragCard
                key={`all-${task.id}`}
                task={task}
                canMoveTask={canMoveTask}
                placement={isTaskWorkbenchUnplacedTask(task) ? 'unplaced' : 'placed'}
                surface="all-tasks"
              />
            ))}
            {allSortedTasks.length === 0 ? (
              <div className="rounded-md border border-dashed border-sky-200 bg-white/75 p-4 text-center text-sm font-semibold text-slate-500">
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
