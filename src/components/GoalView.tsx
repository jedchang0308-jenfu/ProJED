import React from 'react';
import dayjs from 'dayjs';
import { DndContext, DragOverlay, closestCorners, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link, Loader2, Lock, Unlock } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useTaskFilterStore } from '../store/useTaskFilterStore';
import { useMemberStore } from '../store/useMemberStore';
import { useTagStore } from '../store/useTagStore';
import useRecordStore, { createRecordScopeKey } from '../store/useRecordStore';
import { projectTaskFilterResults } from '../features/taskFilters';
import { buildHierarchicalTaskItems, type HierarchicalTaskViewItem } from '../utils/taskHierarchy';
import { normalizeManualTaskStatus } from '../utils/taskStatus';
import { getNodeTags } from '../utils/tags';
import { isTaskPrimaryActionTarget } from '../utils/taskInteractions';
import {
  projectMeetingTaskQuickNotesByTask,
  type MeetingTaskQuickNoteProjection,
} from '../utils/meetingTaskQuickNotes';
import {
  buildGoalSparseProjection,
  type GoalOwnedCell,
  type GoalProjectionRow,
} from '../features/goalMode/projection';
import type { TaskNode, TaskStatus } from '../types';
import { getTaskStatusSelectClass, taskStatusTitleClass } from './ui/taskStatusStyles';
import { TaskHierarchyIndentedRow } from './Wbs/TaskHierarchyIndentedRow';
import MeetingQuickNoteRows from './TaskNotes/MeetingQuickNoteRows';
import { useTaskPlacementController } from './Wbs/useTaskPlacementController';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { primaryPlacementId } from '../features/taskTracking/model';
import TaskAssignmentPicker, { type TaskAssignmentOption } from './TaskAssignmentPicker';
import { TagChip } from './Tags/TagChip';

type GoalViewProps = {
  boardId: string;
};

const GOAL_CONTENT_ROW_HEIGHT_PX = 32;

const safeTaskDomId = (taskId: string) => `goal-task-${Array.from(taskId)
  .map(character => character.codePointAt(0)?.toString(16) || '0')
  .join('-')}`;

const OwnedCell: React.FC<{
  cell: GoalOwnedCell<string>;
  className?: string;
  children?: React.ReactNode;
  headers?: string;
  ownerAttribute?: string;
  'data-goal-column'?: string;
}> = ({ cell, className, children, headers, ownerAttribute, 'data-goal-column': dataGoalColumn }) => {
  if (cell.kind === 'covered') return null;
  const content = children ?? (cell.kind === 'owner' ? cell.value : null);
  return (
    <td
      rowSpan={cell.kind === 'owner' ? cell.rowSpan : undefined}
      className={className}
      headers={headers}
      data-goal-column={dataGoalColumn}
      data-goal-cell-kind={cell.kind}
      data-goal-span={cell.kind === 'owner' ? cell.rowSpan : undefined}
      data-goal-description-owner={dataGoalColumn === 'description' && cell.kind === 'owner' ? 'true' : undefined}
      data-goal-meeting-owner={dataGoalColumn === 'meeting' && cell.kind === 'owner' ? 'true' : undefined}
      data-goal-owner={ownerAttribute}
    >
      {cell.kind === 'owner' ? (
        <div
          className="min-h-0 max-w-full overflow-y-auto whitespace-pre-wrap break-words leading-5"
          style={{ height: '100%', maxHeight: `${cell.rowSpan * GOAL_CONTENT_ROW_HEIGHT_PX}px` }}
          data-goal-content-scroll="true"
        >
          {content}
        </div>
      ) : content}
    </td>
  );
};

const GoalRow: React.FC<{
  row: GoalProjectionRow;
  node: HierarchicalTaskViewItem;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  showDescriptionColumn: boolean;
  showMeetingColumn: boolean;
  meetingStatus: 'ready' | 'loading' | 'error' | 'partial' | 'empty';
  isFirstRow: boolean;
  onRetryMeeting: () => void;
  meetingEntries: readonly MeetingTaskQuickNoteProjection[];
  assigneeOptions: TaskAssignmentOption[];
  membersLoading: boolean;
  showStartDate: boolean;
  showTags: boolean;
}> = ({
  row,
  node,
  hasChildren,
  collapsed,
  onToggle,
  showDescriptionColumn,
  showMeetingColumn,
  meetingStatus,
  isFirstRow,
  onRetryMeeting,
  meetingEntries,
  assigneeOptions,
  membersLoading,
  showStartDate,
  showTags,
}) => {
  const dependencies = useWbsStore(state => state.dependencies);
  const getNodeLockStatus = useWbsStore(state => state.getNodeLockStatus);
  const updateNode = useWbsStore(state => state.updateNode);
  const tags = useTagStore(state => state.tags);
  const nodeTags = getNodeTags(node, tags);
  const [localStartDate, setLocalStartDate] = React.useState(node.startDate || '');
  const [localEndDate, setLocalEndDate] = React.useState(node.endDate || '');
  const placementController = useTaskPlacementController({
    task: node,
    surfaceId: 'goal.row',
    sortableType: 'goal-row',
    origin: 'mode-primary',
  });
  const { interactionBinding, permissions, sortable } = placementController;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const { onKeyDown: sortableKeyDown, ...pointerDragListeners } = listeners ?? {};
  void sortableKeyDown;
  const lockStatus = getNodeLockStatus(node.id, dependencies);
  const isEndDateEffectivelyLocked = lockStatus.endLocked || Boolean(node.isDurationLocked);
  const isStartDateReadOnly = !permissions.canEditTask || lockStatus.startLocked;
  const isEndDateReadOnly = !permissions.canEditTask || isEndDateEffectivelyLocked;
  const isDueToday = node.status !== 'completed'
    && Boolean(localEndDate)
    && dayjs(localEndDate).isSame(dayjs(), 'day');

  React.useEffect(() => {
    setLocalStartDate(node.startDate || '');
    setLocalEndDate(node.endDate || '');
  }, [node.startDate, node.endDate]);

  const validateDateBoundary = (field: 'startDate' | 'endDate', value: string) => {
    if (!value) return true;
    const nextStart = field === 'startDate' ? value : localStartDate;
    const nextEnd = field === 'endDate' ? value : localEndDate;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      alert('防呆機制：結束日期不得早於開始日期。');
      return false;
    }
    const state = useWbsStore.getState();
    const parent = node.parentId ? state.nodes[node.parentId] : null;
    if (parent?.startDate && value < parent.startDate) {
      alert(`防呆機制：下層任務的日期不得超出上層任務的範圍\n(上層任務最早開始日期為 ${parent.startDate})`);
      return false;
    }
    if (parent?.endDate && value > parent.endDate) {
      alert(`防呆機制：下層任務的日期不得超出上層任務的範圍\n(上層任務最晚結束日期為 ${parent.endDate})`);
      return false;
    }
    const children = (state.parentNodesIndex[node.id] || [])
      .map(childId => state.nodes[childId])
      .filter((child): child is TaskNode => Boolean(child));
    if (field === 'startDate') {
      const blockingChild = children.find(child => child.startDate && value > child.startDate);
      if (blockingChild) {
        alert(`防呆機制：上層任務的開始日期不能晚於其下層任務\n(下層任務「${blockingChild.title}」已排定於 ${blockingChild.startDate} 開始)`);
        return false;
      }
    } else {
      const blockingChild = children.find(child => child.endDate && value < child.endDate);
      if (blockingChild) {
        alert(`防呆機制：上層任務的結束日期不能早於其下層任務\n(下層任務「${blockingChild.title}」排定至 ${blockingChild.endDate} 才結束)`);
        return false;
      }
    }
    return true;
  };
  const durationDays = localStartDate && localEndDate && dayjs(localStartDate).isValid() && dayjs(localEndDate).isValid()
    ? dayjs(localEndDate).diff(dayjs(localStartDate), 'day')
    : '';
  const handleStartDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!permissions.canEditTask) return;
    const value = event.target.value;
    if (!validateDateBoundary('startDate', value)) {
      event.target.value = localStartDate;
      return;
    }
    setLocalStartDate(value);
    if (node.isDurationLocked && durationDays !== '') {
      const nextEndDate = dayjs(value).add(durationDays, 'day').format('YYYY-MM-DD');
      if (validateDateBoundary('endDate', nextEndDate)) {
        setLocalEndDate(nextEndDate);
        updateNode(node.id, { startDate: value, endDate: nextEndDate });
        return;
      }
    }
    updateNode(node.id, { startDate: value });
  };
  const handleEndDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!permissions.canEditTask) return;
    const value = event.target.value;
    if (!validateDateBoundary('endDate', value)) {
      event.target.value = localEndDate;
      return;
    }
    setLocalEndDate(value);
    updateNode(node.id, { endDate: value });
  };
  const handleDurationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!permissions.canEditTask) return;
    if (!event.target.value) return;
    const value = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(value) || value < 0) return;
    if (!localStartDate) {
      alert('防呆機制：請先設定開始日期，才能計算工期');
      event.target.value = '';
      return;
    }
    const nextEndDate = dayjs(localStartDate).add(value, 'day').format('YYYY-MM-DD');
    if (!validateDateBoundary('endDate', nextEndDate)) {
      event.target.value = String(durationDays);
      return;
    }
    setLocalEndDate(nextEndDate);
    updateNode(node.id, { endDate: nextEndDate });
  };
  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative' as const,
    zIndex: isDragging ? 40 : 1,
  };
  const hierarchyInteractionProps = {
    ...placementController.activationProps,
    ...attributes,
    ...pointerDragListeners,
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDragging || isTaskPrimaryActionTarget(event.target)) return;
      void interactionBinding.dispatch('pointer.primary');
    },
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void interactionBinding.openMenu({ x: event.clientX, y: event.clientY });
    },
    'data-goal-task-id': node.id,
    'data-task-drag-surface': 'true',
    'data-task-drag-surface-kind': 'goal-row',
  } as React.HTMLAttributes<HTMLDivElement>;

  return (
    <tr
      ref={setNodeRef}
      style={dndStyle}
      className={`border-b border-slate-200 ${isDragging ? 'opacity-50' : ''}`}
      data-goal-task-row="true"
      data-goal-task-row-id={node.id}
      data-goal-level={node.level}
      data-task-id={node.id}
      data-task-drag-surface="true"
      data-task-drag-surface-kind="goal-row"
    >
      <th
        scope="row"
        id={safeTaskDomId(node.id)}
        className={`sticky left-0 z-[2] min-w-[252px] border-r border-slate-200 px-[10px] py-0 align-middle text-left font-normal ${node.level === 0 ? 'bg-surface-panel' : node.level === 1 ? 'bg-white' : 'bg-slate-50'}`}
      >
        <TaskHierarchyIndentedRow
          depth={node.level}
          hasChildren={hasChildren}
          expanded={!collapsed}
          onToggle={onToggle}
          taskId={node.id}
          taskTitle={node.title || '未命名任務'}
          surface="goal"
          className="pr-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          disclosureAttributes={{ 'data-goal-collapse-toggle': node.id }}
          containerProps={hierarchyInteractionProps}
        >
          {node.nodeType === 'milestone' ? <span className="mr-1 shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] leading-none text-amber-600">里程碑</span> : null}
          <span className={`task-title-text relative flex min-w-0 flex-1 items-center gap-[2px] px-1 text-sm ${node.level === 0 ? 'font-semibold' : 'font-medium'} ${taskStatusTitleClass[node.status]}`}>
            <span className="min-w-0 truncate">{node.title || '未命名任務'}</span>
          </span>
          {showTags && nodeTags.length > 0 ? (
            <div className="hidden max-w-[150px] shrink-0 gap-1 xl:flex" data-goal-task-tags="true">
              {nodeTags.slice(0, 2).map(tag => <TagChip key={tag.id} tag={tag} compact />)}
            </div>
          ) : null}
        </TaskHierarchyIndentedRow>
      </th>
      {showDescriptionColumn ? (
        <OwnedCell cell={row.descriptionCell} headers={`goal-column-description ${safeTaskDomId(node.id)}`} ownerAttribute={row.descriptionCell.kind === 'owner' ? node.id : undefined} className="max-w-[360px] border-r border-slate-200 px-3 py-0 align-top text-xs text-slate-600" data-goal-column="description">
          {row.descriptionCell.kind === 'owner' ? row.descriptionCell.value : ''}
        </OwnedCell>
      ) : null}
      {showMeetingColumn ? (
        <OwnedCell cell={row.meetingCell} headers={`goal-column-meeting ${safeTaskDomId(node.id)}`} ownerAttribute={row.meetingCell.kind === 'owner' ? node.id : undefined} className="max-w-[380px] border-r border-slate-200 px-3 py-0 align-top text-xs text-slate-600" data-goal-column="meeting">
          {row.meetingCell.kind === 'owner' ? <MeetingQuickNoteRows entries={meetingEntries} /> : isFirstRow && meetingStatus === 'loading' ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={12} className="animate-spin" />載入中…</span> : isFirstRow && meetingStatus === 'error' ? <span className="inline-flex flex-wrap items-center gap-2 text-red-600">紀錄載入失敗<button type="button" onClick={onRetryMeeting} className="font-semibold underline">重試</button></span> : null}
        </OwnedCell>
      ) : null}
      <td className="border-r border-slate-200 px-2 py-0 align-middle" data-goal-column="owner" data-goal-planning-control="assignee">
        <TaskAssignmentPicker
          node={node}
          options={assigneeOptions}
          membersLoading={membersLoading}
          disabled={!permissions.canAssignTask}
          compact
          portal
          showIcon={false}
          onChange={(primaryIds, collaboratorIds) => {
            if (!permissions.canAssignTask) return;
            updateNode(node.id, { assigneeIds: primaryIds, collaboratorIds, updatedAt: Date.now() });
          }}
        />
      </td>
      <td className="whitespace-nowrap border-r border-slate-200 px-2 py-0 align-middle" data-goal-column="status" data-goal-planning-control="status">
        <select
          value={normalizeManualTaskStatus(node.status)}
          onChange={event => {
            event.stopPropagation();
            if (permissions.canEditTask) updateNode(node.id, { status: event.target.value as TaskStatus });
          }}
          disabled={!permissions.canEditTask}
          className={getTaskStatusSelectClass(node.status)}
          title="修改狀態"
          aria-label={`修改「${node.title || '未命名任務'}」狀態`}
        >
          <option value="todo">待辦</option>
          <option value="in_progress">進行中</option>
          <option value="onhold">暫緩</option>
          <option value="completed">完成</option>
        </select>
      </td>
      {showStartDate ? (
        <td className="border-r border-slate-200 px-2 py-0 align-middle" data-goal-column="start-date" data-goal-planning-control="start-date">
          <div className="relative flex h-8 min-w-0 items-center">
            <input
              type="date"
              value={localStartDate}
              onChange={handleStartDateChange}
              readOnly={isStartDateReadOnly}
              className={`h-7 w-full min-w-0 rounded-md px-1.5 text-xs ${isStartDateReadOnly ? 'pointer-events-none border border-dashed border-slate-300 bg-slate-50 text-slate-500' : 'border border-slate-200 bg-white text-slate-600 focus:border-primary focus:outline-none'}`}
              title={lockStatus.startLocked ? '此日期受依賴關係鎖定，請至甘特圖追蹤' : ''}
              aria-label={`修改「${node.title || '未命名任務'}」開始日期`}
            />
            {lockStatus.startLocked ? <Link size={11} className="pointer-events-none absolute right-7 text-slate-400" /> : null}
          </div>
        </td>
      ) : null}
      <td className={`border-r border-slate-200 px-2 py-0 align-middle ${isDueToday ? 'bg-orange-50/80' : ''}`} data-goal-column="end-date" data-goal-planning-control="end-date">
        <div className="relative flex h-8 min-w-0 items-center">
          <input
            type="date"
            value={localEndDate}
            onChange={handleEndDateChange}
            readOnly={isEndDateReadOnly}
            className={`h-7 w-full min-w-0 rounded-md px-1.5 text-xs ${isEndDateReadOnly ? 'pointer-events-none border border-dashed border-slate-300 bg-slate-50 text-slate-500' : 'border border-slate-200 bg-white text-slate-600 focus:border-primary focus:outline-none'}`}
            title={isEndDateEffectivelyLocked ? (node.isDurationLocked ? '因工期鎖定，請調整開始日期或修改工期' : '此日期受依賴關係鎖定，請至甘特圖追蹤') : ''}
            aria-label={`修改「${node.title || '未命名任務'}」結束日期`}
          />
          {isEndDateEffectivelyLocked ? (node.isDurationLocked && !lockStatus.endLocked ? <span className="pointer-events-none absolute right-7 text-[10px] font-semibold text-slate-400">L</span> : <Link size={11} className="pointer-events-none absolute right-7 text-slate-400" />) : null}
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-0 align-middle" data-goal-column="duration" data-goal-planning-control="duration">
        <div className={`flex h-7 items-stretch overflow-hidden rounded-md border ${node.isDurationLocked ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50/80'}`}>
          <button
            type="button"
            onClick={() => {
              if (permissions.canEditTask) updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
            }}
            disabled={!permissions.canEditTask}
            className={`flex w-7 shrink-0 items-center justify-center border-r ${node.isDurationLocked ? 'border-amber-200 text-amber-600' : 'border-slate-200 text-slate-400'}`}
            title={node.isDurationLocked ? '解除工期鎖定' : '鎖定工期'}
            aria-label={`${node.isDurationLocked ? '解除' : '啟用'}「${node.title || '未命名任務'}」工期鎖定`}
          >
            {node.isDurationLocked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <input
            type="number"
            min="0"
            value={durationDays}
            onChange={handleDurationChange}
            disabled={!permissions.canEditTask || !node.isDurationLocked}
            className={`h-full w-12 border-0 bg-transparent px-1 text-center text-xs outline-none ${node.isDurationLocked ? 'text-slate-600' : 'pointer-events-none text-slate-400'}`}
            aria-label={`修改「${node.title || '未命名任務'}」工期天數`}
          />
        </div>
      </td>
    </tr>
  );
};

const GoalView: React.FC<GoalViewProps> = ({ boardId }) => {
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const nodes = useWbsStore(state => state.nodes);
  const parentNodesIndex = useWbsStore(state => state.parentNodesIndex);
  const batchUpdateNodes = useWbsStore(state => state.batchUpdateNodes);
  const taskLoading = useWbsStore(state => state.loading);
  const taskError = useWbsStore(state => state.error);
  const taskFilters = useTaskFilterStore(state => state.filters);
  const resetTaskFilters = useTaskFilterStore(state => state.resetFilters);
  const boardMembers = useMemberStore(state => state.boardMembers);
  const membersLoading = useMemberStore(state => state.loading);
  const records = useRecordStore(state => state.records);
  const recordListLoad = useRecordStore(state => state.recordListLoad);
  const loadRecords = useRecordStore(state => state.loadRecords);
  const showStartDate = useBoardStore(state => state.showStartDate);
  const showTags = useBoardStore(state => state.showTags);
  const { canMoveTask } = useBoardPermissions();
  const sensors = useDragSensors();
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => new Set());
  const [activeDragNode, setActiveDragNode] = React.useState<TaskNode | null>(null);
  React.useEffect(() => setCollapsedIds(new Set()), [boardId]);

  const filterProjection = React.useMemo(
    () => projectTaskFilterResults(nodes, taskFilters, { boardId }),
    [boardId, nodes, taskFilters],
  );
  const hierarchy = React.useMemo(
    () => buildHierarchicalTaskItems({
      nodes,
      parentNodesIndex,
      activeBoardId: boardId,
      visibleTaskIds: filterProjection.visibleTaskIds,
      collapsedIds,
    }),
    [boardId, collapsedIds, filterProjection.visibleTaskIds, nodes, parentNodesIndex],
  );
  const recordScopeKey = activeWorkspaceId && boardId ? createRecordScopeKey(activeWorkspaceId, boardId) : null;
  const recordStateIsCurrent = Boolean(recordScopeKey && recordListLoad.scopeKey === recordScopeKey);
  const meetingIndex = React.useMemo(() => {
    if (!recordStateIsCurrent || recordListLoad.status !== 'ready' || !activeWorkspaceId) return { byTaskId: new Map<string, readonly MeetingTaskQuickNoteProjection[]>(), invalidRecordIds: [] as readonly string[] };
    return projectMeetingTaskQuickNotesByTask(records, { workspaceId: activeWorkspaceId, boardId });
  }, [activeWorkspaceId, boardId, recordListLoad.status, recordStateIsCurrent, records]);
  const meetingNotesByTaskId = meetingIndex.byTaskId;
  const meetingStatus: 'ready' | 'loading' | 'error' | 'partial' | 'empty' = recordStateIsCurrent && recordListLoad.status === 'loading'
    ? 'loading'
    : recordStateIsCurrent && recordListLoad.status === 'error' ? 'error'
      : meetingIndex.invalidRecordIds.length > 0 ? 'partial'
        : meetingNotesByTaskId.size > 0 ? 'ready' : 'empty';
  const projection = React.useMemo(() => buildGoalSparseProjection(
    hierarchy.items.map(row => ({
      taskId: row.id,
      level: row.level,
      description: row.description,
      meeting: meetingNotesByTaskId.has(row.id) ? 'meeting-notes' : null,
    })),
  ), [hierarchy.items, meetingNotesByTaskId]);
  const showDescriptionColumn = projection.hasDescriptionColumn;
  const showMeetingColumn = projection.hasMeetingColumn || meetingStatus === 'loading' || meetingStatus === 'error' || meetingStatus === 'partial';
  const assigneeOptions = React.useMemo<TaskAssignmentOption[]>(
    () => boardMembers.map(member => ({
      id: member.userId,
      label: member.profile?.displayName || member.profile?.email || member.userId,
      role: member.role,
    })),
    [boardMembers],
  );
  const wouldCreateCycle = React.useCallback((draggedId: string, nextParentId: string | null) => {
    if (!nextParentId) return false;
    if (draggedId === nextParentId) return true;
    const currentNodes = useWbsStore.getState().nodes;
    const visited = new Set<string>([draggedId]);
    let current: string | null = nextParentId;
    while (current) {
      if (current === draggedId || visited.has(current)) return true;
      visited.add(current);
      current = currentNodes[current]?.parentId || null;
    }
    return false;
  }, []);
  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    setActiveDragNode(null);
    if (!canMoveTask || !event.over || event.active.id === event.over.id) return;
    const activeItem = event.active.data.current?.item as TaskNode | undefined;
    const overItem = event.over.data.current?.item as TaskNode | undefined;
    if (!activeItem || !overItem) return;
    if (activeItem.parentId === overItem.parentId) {
      batchUpdateNodes({
        [activeItem.id]: { order: overItem.order },
        [overItem.id]: { order: activeItem.order },
      }, { label: '重排任務', mergeKey: `reorder:${activeItem.id}` });
      return;
    }
    const nextParentId = overItem.parentId || null;
    if (wouldCreateCycle(activeItem.id, nextParentId)) return;
    batchUpdateNodes({
      [activeItem.id]: { parentId: nextParentId, order: overItem.order + 0.5 },
    }, { label: '移動任務位置', mergeKey: `move:${activeItem.id}` });
  }, [batchUpdateNodes, canMoveTask, wouldCreateCycle]);
  const retryMeeting = React.useCallback(() => {
    if (activeWorkspaceId && boardId) void loadRecords(activeWorkspaceId, boardId);
  }, [activeWorkspaceId, boardId, loadRecords]);

  if (!boardId) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500" data-goal-view="true">請先選擇看板。</div>;
  }
  if (taskLoading) {
    return <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-slate-500" data-goal-view="true"><Loader2 size={16} className="animate-spin" />載入任務中...</div>;
  }
  if (taskError) {
    return <div role="alert" className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700" data-goal-view="true">任務載入失敗：{taskError}</div>;
  }

  const hasNoTasks = filterProjection.totalTaskCount === 0;
  const hasNoFilteredTasks = filterProjection.totalTaskCount > 0 && hierarchy.items.length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-slate-50" data-goal-view="true" data-goal-record-state={meetingStatus}>
      {meetingStatus === 'error' ? <div role="alert" className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5"><span>會議紀錄載入失敗，暫不顯示舊資料。</span><button type="button" onClick={retryMeeting} className="shrink-0 font-semibold underline">重試</button></div> : null}
      {meetingStatus === 'partial' ? <div role="status" className="mx-3 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-5" data-goal-record-warning="partial">部分會議紀錄無法辨識，已略過不可靠內容。</div> : null}
      {hasNoTasks ? <div className="mx-3 flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 sm:mx-5">目前沒有任務</div> : hasNoFilteredTasks ? (
        <div className="mx-3 flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 sm:mx-5">
          <span>目前篩選沒有符合的任務</span>
          <button type="button" onClick={resetTaskFilters} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">清除篩選</button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={event => {
            const item = event.active.data.current?.item as TaskNode | undefined;
            if (canMoveTask && item) setActiveDragNode(item);
          }}
          onDragCancel={() => setActiveDragNode(null)}
          onDragEnd={handleDragEnd}
        >
          <table
            className="mx-3 mb-3 w-[calc(100%-1.5rem)] table-fixed border border-collapse border-slate-200 sm:mx-5 sm:mb-5 sm:w-[calc(100%-2.5rem)]"
            style={{ minWidth: 252 + (showDescriptionColumn ? 220 : 0) + (showMeetingColumn ? 220 : 0) + 150 + 90 + (showStartDate ? 130 : 0) + 130 + 80 }}
            data-goal-task-table="true"
          >
            <caption className="sr-only">任務名稱、任務目的、會議紀錄、負責人、狀態、開始日期、結束日期與工期</caption>
            <colgroup>
              <col className="w-[252px]" />
              {showDescriptionColumn ? <col className="w-[220px]" /> : null}
              {showMeetingColumn ? <col className="w-[220px]" /> : null}
              <col className="w-[150px]" />
              <col className="w-[90px]" />
              {showStartDate ? <col className="w-[130px]" /> : null}
              <col className="w-[130px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="text-left text-[11px] font-semibold text-white" data-goal-sticky-header="true">
              <tr>
                <th id="goal-column-task" scope="col" className="sticky left-0 top-0 z-[8] border-b border-r border-slate-600 bg-slate-800 py-2 pl-[38px] pr-[10px]">任務名稱</th>
                {showDescriptionColumn ? <th id="goal-column-description" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">任務目的</th> : null}
                {showMeetingColumn ? <th id="goal-column-meeting" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">會議紀錄</th> : null}
                <th id="goal-column-owner" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">負責人</th>
                <th id="goal-column-status" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">狀態</th>
                {showStartDate ? <th id="goal-column-start-date" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">開始日期</th> : null}
                <th id="goal-column-end-date" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">結束日期</th>
                <th id="goal-column-duration" scope="col" className="sticky top-0 z-[7] border-b border-r border-slate-600 bg-slate-800 px-3 py-2">工期(天)</th>
              </tr>
            </thead>
            <tbody>
              <SortableContext items={hierarchy.items.map(node => primaryPlacementId(node.id))} strategy={verticalListSortingStrategy}>
                {projection.rows.map((row, index) => {
                  const node = hierarchy.items[index];
                  return (
                    <GoalRow
                      key={node.id}
                      row={row}
                      node={node}
                      hasChildren={(parentNodesIndex[node.id] || []).length > 0}
                      collapsed={collapsedIds.has(node.id)}
                      onToggle={() => setCollapsedIds(previous => {
                        const next = new Set(previous);
                        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                        return next;
                      })}
                      showDescriptionColumn={showDescriptionColumn}
                      showMeetingColumn={showMeetingColumn}
                      meetingStatus={meetingStatus}
                      isFirstRow={index === 0}
                      onRetryMeeting={retryMeeting}
                      meetingEntries={meetingNotesByTaskId.get(node.id) ?? []}
                      assigneeOptions={assigneeOptions}
                      membersLoading={membersLoading}
                      showStartDate={showStartDate}
                      showTags={showTags}
                    />
                  );
                })}
              </SortableContext>
            </tbody>
          </table>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeDragNode ? (
              <div
                className="task-title-text pointer-events-none z-50 max-w-[252px] rotate-1 scale-[1.02] truncate rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xl ring-2 ring-primary/20"
                data-task-drag-source-id={activeDragNode.id}
                data-goal-drag-overlay="true"
              >
                {activeDragNode.title || '未命名任務'}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        )}
    </div>
  );
};

export default GoalView;
