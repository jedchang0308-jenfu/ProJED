import React from 'react';
import dayjs from 'dayjs';
import { closestCorners, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft, Link, Loader2, Lock, Unlock } from 'lucide-react';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
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
import {
  buildGoalHierarchyDecorations,
  type GoalHierarchyDecoration,
} from '../features/goalMode/hierarchyPresentation';
import type { TaskNode, TaskStatus } from '../types';
import { taskStatusTitleClass } from './ui/taskStatusStyles';
import { TaskHierarchyIndentedRow } from './Wbs/TaskHierarchyIndentedRow';
import MeetingQuickNoteRows from './TaskNotes/MeetingQuickNoteRows';
import { useTaskPlacementController } from './Wbs/useTaskPlacementController';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useDragSensors } from '../hooks/useDragSensors';
import { primaryPlacementId } from '../features/taskTracking/model';
import DesktopTaskDragHost from './Wbs/taskDrag/DesktopTaskDragHost';
import { DesktopTaskInsertionIndicator } from './Wbs/taskDrag/DesktopTaskDragLayer';
import GoalHierarchyGuides from './Wbs/GoalHierarchyGuides';
import { commitPrimaryDesktopTaskDrag } from './Wbs/taskDrag/taskDragCommit';
import {
  advanceTaskChildIntent,
  getTaskChildIntentRemainingMs,
  type TaskChildIntentSnapshot,
} from './Wbs/taskDrag/taskChildDropTarget';
import {
  resolveGoalDropPosition,
  resolveGoalChildEntryWindow,
  resolveGoalTaskRowDropGeometry,
  type GoalDropGeometry,
  type GoalTaskRect,
} from './Wbs/taskDrag/goalDesktopTaskDragAdapter';
import TaskAssignmentPicker, { type TaskAssignmentOption } from './TaskAssignmentPicker';
import { TagChip } from './Tags/TagChip';
import { useGoalCellSession } from './GoalCellSessionProvider';
import {
  hydrateAccountLayoutPreferences,
  persistAccountLayoutPreferences,
} from '../services/accountPreferencesService';

const TaskDetailNoteEditor = React.lazy(() => import('./TaskNotes/TaskDetailNoteEditor'));

type GoalViewProps = {
  boardId: string;
};

const GOAL_CONTENT_ROW_HEIGHT_PX = 32;
const GOAL_CONTENT_LINE_HEIGHT_PX = 20;
const GOAL_CONTENT_EDGE_HIT_PX = 12;
const GOAL_TASK_COLUMN_WIDTH_PX = 252;
const GOAL_CONTENT_COLUMN_MIN_WIDTH_PX = 220;
const GOAL_COLLAPSED_COLUMN_WIDTH_PX = 22.4;
const GOAL_PLANNING_WIDTHS = {
  owner: 144,
  status: 72,
  start: 112,
  end: 112,
  duration: 84,
} as const;
const GOAL_STATUS_SELECT_CLASS = 'h-7 w-full appearance-none border-0 bg-transparent px-1 py-0 text-center text-[11px] font-semibold outline-none transition-colors focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/50';
const GOAL_DATE_INPUT_CLASS = 'peer block h-7 w-full min-w-0 border border-transparent bg-transparent px-1 py-0 text-xs text-slate-600 outline-none transition-colors hover:bg-slate-100/50 focus:bg-white focus-visible:border-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/50 [&::-webkit-calendar-picker-indicator]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 focus:[&::-webkit-calendar-picker-indicator]:opacity-100';
const EMPTY_COLLAPSED_IDS: ReadonlySet<string> = new Set();
const EMPTY_GOAL_HIERARCHY_DECORATION: GoalHierarchyDecoration = Object.freeze({
  parentId: null,
  isLastVisibleSibling: true,
  hasVisibleChildren: false,
  ancestorTaskIds: Object.freeze([]),
  ancestorContinuations: Object.freeze([]),
  eligibleDescendantCount: 0,
});

const safeTaskDomId = (taskId: string) => `goal-task-${Array.from(taskId)
  .map(character => character.codePointAt(0)?.toString(16) || '0')
  .join('-')}`;

type GoalCellColumn = 'description' | 'meeting';
type GoalColumnKey = 'description' | 'meeting' | 'owner' | 'status' | 'start-date' | 'end-date' | 'duration';

const GOAL_COLUMN_LABELS: Record<GoalColumnKey, string> = {
  description: '任務目的',
  meeting: '會議紀錄',
  owner: '負責人',
  status: '狀態',
  'start-date': '開始日期',
  'end-date': '結束日期',
  duration: '工期(天)',
};

const normalizeGoalCollapsedColumns = (value: unknown): Set<GoalColumnKey> => {
  if (!Array.isArray(value)) return new Set();
  const allowed = new Set<GoalColumnKey>(['description', 'meeting', 'owner', 'status', 'start-date', 'end-date', 'duration']);
  return new Set(value.filter((column): column is GoalColumnKey => typeof column === 'string' && allowed.has(column as GoalColumnKey)));
};

const GoalColumnHeader: React.FC<{
  id: string;
  column: GoalColumnKey;
  collapsed: boolean;
  onToggle: () => void;
  className: string;
  collapsedClassName?: string;
}> = ({ id, column, collapsed, onToggle, className, collapsedClassName = 'w-[22.4px] min-w-[22.4px] px-0 text-center' }) => (
  <th
    id={id}
    scope="col"
    className={`${className} ${collapsed ? collapsedClassName : ''}`}
    data-goal-column-header={column}
  >
    <span className={`flex w-full min-w-0 items-center ${collapsed ? 'justify-center' : 'justify-between gap-1'}`}>
      <span className={collapsed ? 'sr-only' : 'shrink-0 whitespace-nowrap leading-none'} data-goal-column-label={column}>{GOAL_COLUMN_LABELS[column]}</span>
      <button
        type="button"
        className={`group inline-grid ${collapsed ? 'h-5 w-5' : 'h-6 w-6'} shrink-0 place-items-center rounded-md text-slate-400 transition-transform duration-150 ease-out hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-panel active:scale-95 motion-reduce:transform-none motion-reduce:transition-none`}
        aria-label={collapsed ? `展開${GOAL_COLUMN_LABELS[column]}欄` : `收合${GOAL_COLUMN_LABELS[column]}欄`}
        aria-expanded={!collapsed}
        title={collapsed ? `展開${GOAL_COLUMN_LABELS[column]}欄` : `收合${GOAL_COLUMN_LABELS[column]}欄`}
        data-goal-column-toggle={column}
        data-goal-column-toggle-state={collapsed ? 'collapsed' : 'expanded'}
        data-goal-description-column-toggle={column === 'description' ? 'true' : undefined}
        onClick={onToggle}
      >
        <span
          className={`grid ${collapsed ? 'h-4 w-4 rounded-[4px]' : 'h-[18px] w-[18px] rounded-[5px]'} place-items-center border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out group-hover:border-primary/30 group-hover:bg-white group-hover:text-primary group-hover:shadow-sm motion-reduce:transition-none ${collapsed
            ? 'border-primary/25 bg-primary/10 text-primary shadow-[0_1px_2px_rgb(79_70_229/0.10)]'
            : 'border-slate-300/70 bg-white/70 text-slate-400 shadow-[0_1px_1px_rgb(15_23_42/0.04)]'
          }`}
          data-goal-column-toggle-glyph="true"
          aria-hidden="true"
        >
          <ChevronLeft
            size={11}
            strokeWidth={2.25}
            className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
    </span>
  </th>
);

const OwnedCell: React.FC<{
  cell: GoalOwnedCell<string>;
  column: GoalCellColumn;
  ownerTaskId?: string;
  className?: string;
  children?: React.ReactNode;
  headers?: string;
  ownerAttribute?: string;
  activeScope?: boolean;
  selected: boolean;
  expanded: boolean;
  lineAlignedScroll?: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onHierarchyScopeChange: (taskId: string | null) => void;
  onToggleExpanded: () => void;
  onOpenMenu: (event: React.MouseEvent<HTMLTableCellElement> | React.KeyboardEvent<HTMLTableCellElement>) => void;
  'data-goal-column'?: string;
}> = ({ cell, column, ownerTaskId, className, children, headers, ownerAttribute, activeScope, selected, expanded, lineAlignedScroll = false, canEdit, onSelect, onHierarchyScopeChange, onToggleExpanded, onOpenMenu, 'data-goal-column': dataGoalColumn }) => {
  const goalSession = useGoalCellSession();
  const isDescriptionOwner = column === 'description' && cell.kind === 'owner' && Boolean(ownerTaskId);
  const isSessionCell = Boolean(ownerTaskId && goalSession.isCellActive(ownerTaskId, column));
  const draftNote = isSessionCell ? goalSession.session.draftNote : null;
  const isEditorVisible = isDescriptionOwner && isSessionCell && Boolean(draftNote);
  const cellLabel = column === 'description' ? '任務目的' : '會議紀錄';
  const cellKey = ownerTaskId ? `${column}:${ownerTaskId}` : undefined;
  const content = children ?? (cell.kind === 'owner' ? cell.value : null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  // Keep the meeting history viewport scrollable, but round its height down
  // to a complete text-line boundary so the last visible glyph is never cut
  // halfway by the rowSpan edge.
  const lineAlignedViewportHeight = cell.kind === 'owner' && lineAlignedScroll
    ? Math.max(GOAL_CONTENT_LINE_HEIGHT_PX, Math.floor((cell.rowSpan * GOAL_CONTENT_ROW_HEIGHT_PX) / GOAL_CONTENT_LINE_HEIGHT_PX) * GOAL_CONTENT_LINE_HEIGHT_PX)
    : null;
  React.useLayoutEffect(() => {
    if (!lineAlignedScroll || expanded || cell.kind !== 'owner') return undefined;
    const contentElement = contentRef.current;
    if (!contentElement) return undefined;
    const syncClippedRows = () => {
      const viewport = contentElement.getBoundingClientRect();
      contentElement.querySelectorAll<HTMLElement>('[data-task-meeting-quick-note-row]').forEach(row => {
        const rect = row.getBoundingClientRect();
        const intersectsViewport = rect.bottom > viewport.top + 0.5 && rect.top < viewport.bottom - 0.5;
        const fullyVisible = rect.top >= viewport.top - 0.5 && rect.bottom <= viewport.bottom + 0.5;
        row.setAttribute('data-goal-content-row-clipped', intersectsViewport && !fullyVisible ? 'true' : 'false');
      });
    };
    syncClippedRows();
    contentElement.addEventListener('scroll', syncClippedRows, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncClippedRows);
    resizeObserver?.observe(contentElement);
    return () => {
      contentElement.removeEventListener('scroll', syncClippedRows);
      resizeObserver?.disconnect();
    };
  }, [cell.kind, content, expanded, lineAlignedScroll]);
  React.useEffect(() => {
    if (!isEditorVisible || !cellKey) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const editor = Array.from(document.querySelectorAll<HTMLElement>('[data-goal-cell-key]'))
        .find(element => element.dataset.goalCellKey === cellKey)
        ?.querySelector<HTMLElement>('[contenteditable="true"]');
      editor?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cellKey, isEditorVisible]);
  if (cell.kind === 'covered') return null;
  const handleDoubleClick = (event: React.MouseEvent<HTMLTableCellElement>) => {
    if (cell.kind !== 'owner' || isSessionCell) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY >= rect.bottom - GOAL_CONTENT_EDGE_HIT_PX) {
      event.preventDefault();
      onToggleExpanded();
      return;
    }
    if (isDescriptionOwner && canEdit && ownerTaskId) {
      event.preventDefault();
      const node = useWbsStore.getState().nodes[ownerTaskId];
      if (node) goalSession.beginEditing(node);
    }
  };
  const handleContentDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (cell.kind !== 'owner' || isSessionCell) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY < rect.bottom - GOAL_CONTENT_EDGE_HIT_PX) return;
    event.preventDefault();
    event.stopPropagation();
    onToggleExpanded();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableCellElement>) => {
    if (event.key === 'Escape' && isSessionCell) {
      event.preventDefault();
      event.stopPropagation();
      goalSession.cancel();
      return;
    }
    if (event.key === 'F2' && isDescriptionOwner && canEdit && ownerTaskId) {
      event.preventDefault();
      event.stopPropagation();
      const node = useWbsStore.getState().nodes[ownerTaskId];
      if (node) goalSession.beginEditing(node);
      return;
    }
    if (event.shiftKey && event.key === 'F10') {
      event.preventDefault();
      event.stopPropagation();
      onOpenMenu(event);
    }
  };
  return (
    <td
      rowSpan={cell.kind === 'owner' ? cell.rowSpan : undefined}
      className={[className, selected && !isEditorVisible ? 'outline outline-2 outline-inset outline-primary/70' : ''].filter(Boolean).join(' ')}
      headers={headers}
      tabIndex={cell.kind === 'owner' ? 0 : undefined}
      aria-label={cell.kind === 'owner' ? `${cellLabel}${ownerTaskId ? `：${ownerTaskId}` : ''}` : undefined}
      data-goal-cell-key={cellKey}
      data-goal-cell-selected={selected ? 'true' : undefined}
      onClick={cell.kind === 'owner' ? onSelect : undefined}
      onDoubleClick={cell.kind === 'owner' ? handleDoubleClick : undefined}
      onContextMenu={cell.kind === 'owner' ? event => { event.preventDefault(); onSelect(); onOpenMenu(event); } : undefined}
      onKeyDown={cell.kind === 'owner' ? handleKeyDown : undefined}
      data-goal-column={dataGoalColumn}
      data-goal-cell-kind={cell.kind}
      data-goal-span={cell.kind === 'owner' ? cell.rowSpan : undefined}
      data-goal-group-span={cell.kind === 'owner' && cell.rowSpan > 1 ? 'true' : undefined}
      data-goal-description-owner={dataGoalColumn === 'description' && cell.kind === 'owner' ? 'true' : undefined}
      data-goal-meeting-owner={dataGoalColumn === 'meeting' && cell.kind === 'owner' ? 'true' : undefined}
      data-goal-owner={ownerAttribute}
      data-goal-content-scope={activeScope ? 'active' : undefined}
      data-goal-cell-editing={isEditorVisible ? 'true' : undefined}
      onMouseEnter={cell.kind === 'owner' && ownerTaskId ? () => onHierarchyScopeChange(ownerTaskId) : undefined}
      onMouseLeave={cell.kind === 'owner' && ownerTaskId ? event => {
        if (!event.currentTarget.contains(document.activeElement)) onHierarchyScopeChange(null);
      } : undefined}
      onFocusCapture={cell.kind === 'owner' && ownerTaskId ? () => onHierarchyScopeChange(ownerTaskId) : undefined}
      onBlurCapture={cell.kind === 'owner' && ownerTaskId ? event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(':hover')) {
          onHierarchyScopeChange(null);
        }
      } : undefined}
    >
      {cell.kind === 'owner' ? (
        <div
          ref={contentRef}
          className={expanded ? 'whitespace-pre-wrap break-words leading-5' : 'overflow-y-auto whitespace-pre-wrap break-words leading-5'}
          style={expanded
            ? { height: 'auto', maxHeight: 'none' }
            : lineAlignedViewportHeight
              ? { height: `${lineAlignedViewportHeight}px`, maxHeight: `${lineAlignedViewportHeight}px` }
              : { height: '100%', maxHeight: `${cell.rowSpan * GOAL_CONTENT_ROW_HEIGHT_PX}px` }}
          data-goal-content-scroll="true"
          data-goal-content-expanded={expanded ? 'true' : 'false'}
          data-goal-content-line-aligned={lineAlignedViewportHeight ? 'true' : 'false'}
          onDoubleClick={handleContentDoubleClick}
        >
          {isEditorVisible && draftNote ? (
            <React.Suspense fallback={<span data-goal-cell-editor-fallback="true">{draftNote.content}</span>}>
              <TaskDetailNoteEditor
                key={`${ownerTaskId}:${goalSession.session.attemptId || 'editing'}`}
                variant="cell"
                taskId={ownerTaskId || ''}
                note={draftNote}
                canEdit={canEdit && goalSession.session.status !== 'saving' && goalSession.session.status !== 'unknown'}
                onUpdate={goalSession.updateDraft}
                onCommit={goalSession.commit}
                onCancel={goalSession.cancel}
              />
            </React.Suspense>
          ) : content}
          {isSessionCell && goalSession.session.status === 'saving' ? <span className="mt-1 block text-[11px] text-slate-400" role="status" data-goal-cell-saving="true">儲存中…</span> : null}
          {isSessionCell && goalSession.session.status === 'unknown' ? <span className="mt-1 block text-[11px] text-amber-700" role="status" data-goal-cell-unknown="true">儲存結果未確認</span> : null}
          {isSessionCell && goalSession.session.status === 'error' ? (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-red-600" role="alert" data-goal-cell-save-error="true">
              <span>{goalSession.session.error || '儲存失敗'}</span>
              <button type="button" className="font-semibold underline" onClick={goalSession.retry}>重試</button>
            </span>
          ) : null}
        </div>
      ) : content}
    </td>
  );
};

const GoalCellActionMenu: React.FC<{
  taskId: string;
  column: GoalCellColumn;
  expanded: boolean;
  canEdit: boolean;
  x: number;
  y: number;
  onEdit: () => void;
  onToggleExpanded: () => void;
  onClose: () => void;
}> = ({ taskId, column, expanded, canEdit, x, y, onEdit, onToggleExpanded, onClose }) => {
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${column === 'description' ? '任務目的' : '會議紀錄'}操作`}
      className="fixed z-[60] min-w-36 border border-slate-200 bg-white py-1 text-xs shadow-lg"
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
      data-goal-cell-menu="true"
      data-goal-cell-menu-task-id={taskId}
    >
      {column === 'description' && canEdit ? (
        <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none" onClick={() => { onEdit(); onClose(); }}>
          編輯內容
        </button>
      ) : null}
      <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none" onClick={() => { onToggleExpanded(); onClose(); }}>
        {expanded ? '收合內容' : '展開全部內容'}
      </button>
    </div>
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
  collapsedColumns: ReadonlySet<GoalColumnKey>;
  meetingStatus: 'ready' | 'loading' | 'error' | 'partial' | 'empty';
  isFirstRow: boolean;
  onRetryMeeting: () => void;
  meetingEntries: readonly MeetingTaskQuickNoteProjection[];
  assigneeOptions: TaskAssignmentOption[];
  membersLoading: boolean;
  showStartDate: boolean;
  showTags: boolean;
  hierarchyDecoration: GoalHierarchyDecoration;
  activeHierarchyScopeId: string | null;
  childDropCandidate: boolean;
  childDropTarget: boolean;
  activeDescriptionOwner: boolean;
  activeMeetingOwner: boolean;
  onHierarchyScopeChange: (taskId: string | null) => void;
  selectedCellKey: string | null;
  expandedCellKeys: ReadonlySet<string>;
  onSelectCell: (key: string) => void;
  onToggleCell: (key: string) => void;
  onOpenCellMenu: (key: string, column: GoalCellColumn, taskId: string, event: React.MouseEvent<HTMLTableCellElement> | React.KeyboardEvent<HTMLTableCellElement>) => void;
}> = ({
  row,
  node,
  hasChildren,
  collapsed,
  onToggle,
  showDescriptionColumn,
  showMeetingColumn,
  collapsedColumns,
  meetingStatus,
  isFirstRow,
  onRetryMeeting,
  meetingEntries,
  assigneeOptions,
  membersLoading,
  showStartDate,
  showTags,
  hierarchyDecoration,
  activeHierarchyScopeId,
  childDropCandidate,
  childDropTarget,
  activeDescriptionOwner,
  activeMeetingOwner,
  onHierarchyScopeChange,
  selectedCellKey,
  expandedCellKeys,
  onSelectCell,
  onToggleCell,
  onOpenCellMenu,
}) => {
  const descriptionColumnCollapsed = collapsedColumns.has('description');
  const meetingColumnCollapsed = collapsedColumns.has('meeting');
  const ownerColumnCollapsed = collapsedColumns.has('owner');
  const statusColumnCollapsed = collapsedColumns.has('status');
  const startDateColumnCollapsed = collapsedColumns.has('start-date');
  const endDateColumnCollapsed = collapsedColumns.has('end-date');
  const durationColumnCollapsed = collapsedColumns.has('duration');
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
  const { attributes, listeners, setNodeRef, isDragging } = sortable;
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
    position: 'relative' as const,
    zIndex: isDragging ? 40 : 1,
  };
  const hierarchyScope = activeHierarchyScopeId === node.id
    ? 'parent'
    : activeHierarchyScopeId && hierarchyDecoration.ancestorTaskIds.includes(activeHierarchyScopeId)
      ? 'descendant'
      : undefined;
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
    onMouseEnter: () => {
      onHierarchyScopeChange(node.id);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(document.activeElement)) onHierarchyScopeChange(null);
    },
    onFocusCapture: () => {
      onHierarchyScopeChange(node.id);
    },
    onBlurCapture: (event: React.FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(':hover')) {
        onHierarchyScopeChange(null);
      }
    },
    'data-goal-task-id': node.id,
    'data-task-drag-surface': 'true',
    'data-task-drag-surface-kind': 'goal-row',
  } as React.HTMLAttributes<HTMLDivElement>;

  return (
    <tr
      ref={setNodeRef}
      style={dndStyle}
      className={isDragging ? 'opacity-50' : ''}
      onMouseEnter={() => onHierarchyScopeChange(node.id)}
      onMouseLeave={event => {
        if (!event.currentTarget.contains(document.activeElement)) onHierarchyScopeChange(null);
      }}
      onFocusCapture={() => onHierarchyScopeChange(node.id)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(':hover')) {
          onHierarchyScopeChange(null);
        }
      }}
      data-goal-task-row="true"
      data-goal-task-row-id={node.id}
      data-goal-level={node.level}
      data-goal-hierarchy-last-sibling={hierarchyDecoration.isLastVisibleSibling ? 'true' : 'false'}
      data-goal-hierarchy-scope={hierarchyScope}
      data-goal-child-drop-candidate={childDropCandidate ? 'true' : undefined}
      data-goal-child-drop-target={childDropTarget ? 'true' : undefined}
      data-task-id={node.id}
      data-task-drag-surface="true"
      data-task-drag-surface-kind="goal-row"
    >
      <th
        scope="row"
        id={safeTaskDomId(node.id)}
        className="relative sticky left-0 z-[2] border-r border-t-0 border-slate-200 bg-white py-0 align-middle text-left font-normal min-w-[252px] px-[10px]"
        data-goal-task-cell="true"
        data-goal-task-cell-located={hierarchyScope}
      >
        <TaskHierarchyIndentedRow
          depth={node.level}
          hasChildren={hasChildren}
          expanded={!collapsed}
          onToggle={onToggle}
          taskId={node.id}
          taskTitle={node.title || '未命名任務'}
          surface="goal"
          className="goal-task-hierarchy-row relative z-[1] pr-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          disclosureAttributes={{ 'data-goal-collapse-toggle': node.id }}
          containerProps={hierarchyInteractionProps}
        >
          <GoalHierarchyGuides
            nodeId={node.id}
            level={node.level}
            hasChildren={hasChildren}
            decoration={hierarchyDecoration}
            activeScopeId={activeHierarchyScopeId}
          />
          {node.nodeType === 'milestone' ? <span className="mr-1 shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] leading-none text-amber-600">里程碑</span> : null}
          <span className={`task-title-text min-w-0 flex-1 truncate pr-1 text-sm ${node.level === 0 ? 'font-semibold' : 'font-medium'} ${taskStatusTitleClass[node.status]}`} data-task-title-slot="true">
            {node.title || '未命名任務'}
          </span>
          {collapsed && hierarchyDecoration.eligibleDescendantCount > 0 ? (
            <span
              className="relative z-[1] shrink-0 px-0.5 text-[10px] font-medium text-slate-400"
              aria-label={`已收合 ${hierarchyDecoration.eligibleDescendantCount} 個下層任務`}
              data-goal-descendant-count={hierarchyDecoration.eligibleDescendantCount}
            >
              +{hierarchyDecoration.eligibleDescendantCount}
            </span>
          ) : null}
          {showTags && nodeTags.length > 0 ? (
            <div className="hidden max-w-[150px] shrink-0 gap-1 xl:flex" data-goal-task-tags="true">
              {nodeTags.slice(0, 2).map(tag => <TagChip key={tag.id} tag={tag} compact />)}
            </div>
          ) : null}
        </TaskHierarchyIndentedRow>
      </th>
      {showDescriptionColumn && !descriptionColumnCollapsed ? (
        <OwnedCell cell={row.descriptionCell} column="description" ownerTaskId={row.descriptionCell.kind === 'owner' ? node.id : undefined} headers={`goal-column-description ${safeTaskDomId(node.id)}`} ownerAttribute={row.descriptionCell.kind === 'owner' ? node.id : undefined} activeScope={activeDescriptionOwner} className="max-w-[360px] border-r border-slate-200 px-3 py-0 align-top text-xs text-slate-600" selected={selectedCellKey === `description:${node.id}`} expanded={expandedCellKeys.has(`description:${node.id}`)} canEdit={permissions.canEditTask} onSelect={() => onSelectCell(`description:${node.id}`)} onHierarchyScopeChange={onHierarchyScopeChange} onToggleExpanded={() => onToggleCell(`description:${node.id}`)} onOpenMenu={event => onOpenCellMenu(`description:${node.id}`, 'description', node.id, event)} data-goal-column="description">
          {row.descriptionCell.kind === 'owner' ? row.descriptionCell.value : ''}
        </OwnedCell>
      ) : descriptionColumnCollapsed ? (
        <td
          className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0"
          data-goal-column="description"
          data-goal-column-collapsed="true"
          data-goal-description-column-collapsed="true"
          aria-hidden="true"
        />
      ) : null}
      {showMeetingColumn && !meetingColumnCollapsed ? (
        <OwnedCell cell={row.meetingCell} column="meeting" ownerTaskId={row.meetingCell.kind === 'owner' ? node.id : undefined} headers={`goal-column-meeting ${safeTaskDomId(node.id)}`} ownerAttribute={row.meetingCell.kind === 'owner' ? node.id : undefined} activeScope={activeMeetingOwner} className="max-w-[380px] border-r border-slate-200 px-3 py-0 align-top text-xs text-slate-600" selected={selectedCellKey === `meeting:${node.id}`} expanded={expandedCellKeys.has(`meeting:${node.id}`)} lineAlignedScroll canEdit={false} onSelect={() => onSelectCell(`meeting:${node.id}`)} onHierarchyScopeChange={onHierarchyScopeChange} onToggleExpanded={() => onToggleCell(`meeting:${node.id}`)} onOpenMenu={event => onOpenCellMenu(`meeting:${node.id}`, 'meeting', node.id, event)} data-goal-column="meeting">
          {row.meetingCell.kind === 'owner' ? <MeetingQuickNoteRows entries={meetingEntries} /> : isFirstRow && meetingStatus === 'loading' ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 size={12} className="animate-spin" />載入中…</span> : isFirstRow && meetingStatus === 'error' ? <span className="inline-flex flex-wrap items-center gap-2 text-red-600">紀錄載入失敗<button type="button" onClick={onRetryMeeting} className="font-semibold underline">重試</button></span> : null}
        </OwnedCell>
      ) : showMeetingColumn && meetingColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="meeting" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : null}
      {ownerColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="owner" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : (
      <td className="border-l border-slate-200/70 px-1 py-0 align-middle" data-goal-column="owner" data-goal-planning-control="assignee">
        <TaskAssignmentPicker
          node={node}
          options={assigneeOptions}
          membersLoading={membersLoading}
          disabled={!permissions.canAssignTask}
          compact
          fullSummary
          portal
          showIcon={false}
          triggerVariant="quiet"
          onChange={(primaryIds, collaboratorIds) => {
            if (!permissions.canAssignTask) return;
            updateNode(node.id, { assigneeIds: primaryIds, collaboratorIds, updatedAt: Date.now() });
          }}
        />
      </td>
      )}
      {statusColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="status" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : (
      <td className="whitespace-nowrap px-1 py-0 align-middle" data-goal-column="status" data-goal-planning-control="status">
        <select
          value={normalizeManualTaskStatus(node.status)}
          onChange={event => {
            event.stopPropagation();
            if (permissions.canEditTask) updateNode(node.id, { status: event.target.value as TaskStatus });
          }}
          disabled={!permissions.canEditTask}
          className={`${GOAL_STATUS_SELECT_CLASS} ${taskStatusTitleClass[node.status]}`}
          title="修改狀態"
          aria-label={`修改「${node.title || '未命名任務'}」狀態`}
        >
          <option value="todo">待辦</option>
          <option value="in_progress">進行中</option>
          <option value="onhold">暫緩</option>
          <option value="completed">完成</option>
        </select>
      </td>
      )}
      {showStartDate && !startDateColumnCollapsed ? (
        <td className="relative min-w-0 px-1 py-0 align-middle" data-goal-column="start-date" data-goal-planning-control="start-date">
          <input
            type="date"
            value={localStartDate}
            onChange={handleStartDateChange}
            readOnly={isStartDateReadOnly}
            className={`${GOAL_DATE_INPUT_CLASS} ${isStartDateReadOnly ? 'pointer-events-none cursor-not-allowed text-slate-500' : ''}`}
            title={lockStatus.startLocked ? '此日期受依賴關係鎖定，請至甘特圖追蹤' : ''}
            aria-label={`修改「${node.title || '未命名任務'}」開始日期`}
          />
          {lockStatus.startLocked ? <Link size={11} className="pointer-events-none absolute right-7 text-slate-400" /> : null}
        </td>
      ) : showStartDate && startDateColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="start-date" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : null}
      {endDateColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="end-date" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : (
      <td className="relative min-w-0 px-1 py-0 align-middle" data-goal-column="end-date" data-goal-planning-control="end-date">
        <input
          type="date"
          value={localEndDate}
          onChange={handleEndDateChange}
          readOnly={isEndDateReadOnly}
          className={`${GOAL_DATE_INPUT_CLASS} ${isDueToday ? 'font-semibold text-orange-600' : ''} ${isEndDateReadOnly ? 'pointer-events-none cursor-not-allowed text-slate-500' : ''}`}
          title={isEndDateEffectivelyLocked ? (node.isDurationLocked ? '因工期鎖定，請調整開始日期或修改工期' : '此日期受依賴關係鎖定，請至甘特圖追蹤') : ''}
          aria-label={`修改「${node.title || '未命名任務'}」結束日期`}
        />
        {lockStatus.endLocked ? <Link size={11} className="pointer-events-none absolute right-7 text-slate-400" /> : null}
      </td>
      )}
      {durationColumnCollapsed ? (
        <td className="w-[22.4px] min-w-[22.4px] border-r border-slate-200 px-0 py-0" data-goal-column="duration" data-goal-column-collapsed="true" aria-hidden="true" />
      ) : (
      <td className="px-1 py-0 align-middle" data-goal-column="duration" data-goal-planning-control="duration">
        <div className={`group relative flex h-7 items-center gap-0.5 rounded-sm focus-within:outline focus-within:outline-1 focus-within:outline-primary/50 ${node.isDurationLocked ? 'text-amber-600' : 'text-slate-400'}`}>
          <button
            type="button"
            onClick={() => {
              if (permissions.canEditTask) updateNode(node.id, { isDurationLocked: !node.isDurationLocked });
            }}
            disabled={!permissions.canEditTask}
            className={`flex h-7 w-5 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/50 ${node.isDurationLocked ? 'text-amber-600' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
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
            className={`peer h-7 w-8 border-0 bg-transparent px-0 text-center text-xs outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/50 ${node.isDurationLocked ? 'text-slate-600' : 'pointer-events-none text-slate-400'}`}
            aria-label={`修改「${node.title || '未命名任務'}」工期天數`}
          />
          {durationDays === '' ? <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center px-1 text-xs text-slate-400 peer-focus:hidden">—</span> : null}
        </div>
      </td>
      )}
    </tr>
  );
};

const GoalView: React.FC<GoalViewProps> = ({ boardId }) => {
  const accountId = useAuthStore(state => state.user?.uid ?? null);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const nodes = useWbsStore(state => state.nodes);
  const parentNodesIndex = useWbsStore(state => state.parentNodesIndex);
  const batchUpdateNodes = useWbsStore(state => state.batchUpdateNodes);
  const recalculateAncestorStatus = useWbsStore(state => state.recalculateAncestorStatus);
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
  const { canMoveTask, canEditTask } = useBoardPermissions();
  const goalSession = useGoalCellSession();
  const sensors = useDragSensors();
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => new Set());
  const [collapsedColumns, setCollapsedColumns] = React.useState<Set<GoalColumnKey>>(() => new Set());
  const descriptionColumnCollapsed = collapsedColumns.has('description');
  const [activeHierarchyScopeId, setActiveHierarchyScopeId] = React.useState<string | null>(null);
  const [selectedCellKey, setSelectedCellKey] = React.useState<string | null>(null);
  const [expandedCellKeys, setExpandedCellKeys] = React.useState<Set<string>>(() => new Set());
  const [cellMenu, setCellMenu] = React.useState<{
    key: string;
    taskId: string;
    column: GoalCellColumn;
    x: number;
    y: number;
  } | null>(null);
  const [activeDragNode, setActiveDragNode] = React.useState<TaskNode | null>(null);
  const visibleHierarchyScopeId = activeDragNode ? null : activeHierarchyScopeId;
  const [goalDragPointer, setGoalDragPointer] = React.useState<{ x: number; y: number } | null>(null);
  const [goalDropPreview, setGoalDropPreview] = React.useState<GoalDropGeometry | null>(null);
  const [goalChildArmedId, setGoalChildArmedId] = React.useState<string | null>(null);
  const [goalChildIntent, setGoalChildIntent] = React.useState<TaskChildIntentSnapshot>(() => ({
    phase: 'none',
    targetId: null,
    candidateSince: null,
  }));
  const goalChildCandidateTargetId = goalChildIntent.phase === 'candidate'
    ? goalChildIntent.targetId
    : null;
  const goalChildTargetId = goalChildIntent.phase === 'candidate' || goalChildIntent.phase === 'armed'
    ? goalChildIntent.targetId
    : null;
  const goalDropPreviewRef = React.useRef<GoalDropGeometry | null>(null);
  const goalChildArmedIdRef = React.useRef<string | null>(null);
  const goalChildIntentRef = React.useRef<TaskChildIntentSnapshot>(goalChildIntent);
  const goalDragPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const updateGoalDropPreview = React.useCallback((next: GoalDropGeometry | null) => {
    goalDropPreviewRef.current = next;
    setGoalDropPreview(next);
  }, []);
  const updateGoalChildArmedId = React.useCallback((next: string | null) => {
    goalChildArmedIdRef.current = next;
    setGoalChildArmedId(next);
  }, []);
  const updateGoalChildIntent = React.useCallback((next: TaskChildIntentSnapshot) => {
    const current = goalChildIntentRef.current;
    if (current.phase === next.phase
      && current.targetId === next.targetId
      && current.candidateSince === next.candidateSince) return;
    goalChildIntentRef.current = next;
    setGoalChildIntent(next);
  }, []);
  const clearGoalChildIntent = React.useCallback(() => {
    updateGoalChildIntent(advanceTaskChildIntent({
      current: goalChildIntentRef.current,
      targetId: null,
      now: Date.now(),
    }));
    updateGoalChildArmedId(null);
  }, [updateGoalChildArmedId, updateGoalChildIntent]);
  React.useEffect(() => {
    let cancelled = false;
    setCollapsedColumns(new Set());
    void hydrateAccountLayoutPreferences(accountId).then(preferences => {
      if (cancelled) return;
      setCollapsedColumns(normalizeGoalCollapsedColumns(preferences.goalCollapsedColumns));
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const toggleGoalColumn = React.useCallback((column: GoalColumnKey) => {
    setCollapsedColumns(current => {
      const next = new Set(current);
      if (next.has(column)) next.delete(column); else next.add(column);
      persistAccountLayoutPreferences(accountId, { goalCollapsedColumns: Array.from(next) });
      return next;
    });
  }, [accountId]);
  React.useEffect(() => {
    setCollapsedIds(new Set());
    setActiveHierarchyScopeId(null);
    setSelectedCellKey(null);
    setExpandedCellKeys(new Set());
    setCellMenu(null);
    goalDragPointerRef.current = null;
    setGoalDragPointer(null);
    updateGoalDropPreview(null);
    clearGoalChildIntent();
  }, [boardId, clearGoalChildIntent, updateGoalDropPreview]);

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
  const fullyExpandedHierarchy = React.useMemo(
    () => buildHierarchicalTaskItems({
      nodes,
      parentNodesIndex,
      activeBoardId: boardId,
      visibleTaskIds: filterProjection.visibleTaskIds,
      collapsedIds: EMPTY_COLLAPSED_IDS,
    }),
    [boardId, filterProjection.visibleTaskIds, nodes, parentNodesIndex],
  );
  const hierarchyDecorations = React.useMemo(
    () => buildGoalHierarchyDecorations({
      renderedItems: hierarchy.items,
      fullyExpandedItems: fullyExpandedHierarchy.items,
    }),
    [fullyExpandedHierarchy.items, hierarchy.items],
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
      description: goalSession.getDescriptionAnchor(row.id, row.description),
      meeting: meetingNotesByTaskId.has(row.id) ? 'meeting-notes' : null,
    })),
  ), [goalSession, hierarchy.items, meetingNotesByTaskId]);
  const activeContentOwnerIds = React.useMemo(() => {
    const description = new Set<string>();
    const meeting = new Set<string>();
    if (!visibleHierarchyScopeId) return { description, meeting };
    const activeRow = projection.rows.find(row => row.taskId === visibleHierarchyScopeId);
    if (!activeRow) return { description, meeting };
    // A shared rowSpan remains visible as the real owner's group context, but
    // it must not look like content belonging to a located descendant row.
    // Only the owner task itself receives the active content tint.
    if (activeRow.descriptionCell.kind === 'owner') description.add(activeRow.taskId);
    if (activeRow.meetingCell.kind === 'owner') meeting.add(activeRow.taskId);
    return { description, meeting };
  }, [visibleHierarchyScopeId, projection.rows]);
  const hasDescriptionColumn = projection.hasDescriptionColumn;
  const showDescriptionColumn = hasDescriptionColumn;
  const showMeetingColumn = projection.hasMeetingColumn || meetingStatus === 'loading' || meetingStatus === 'error' || meetingStatus === 'partial';
  const visibleContentColumnCount = Number(hasDescriptionColumn) + Number(showMeetingColumn);
  const meetingColumnCollapsed = collapsedColumns.has('meeting');
  const ownerColumnCollapsed = collapsedColumns.has('owner');
  const statusColumnCollapsed = collapsedColumns.has('status');
  const startDateColumnCollapsed = collapsedColumns.has('start-date');
  const endDateColumnCollapsed = collapsedColumns.has('end-date');
  const durationColumnCollapsed = collapsedColumns.has('duration');
  const goalTableMinWidth = GOAL_TASK_COLUMN_WIDTH_PX
    + (hasDescriptionColumn ? (descriptionColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_CONTENT_COLUMN_MIN_WIDTH_PX) : 0)
    + (showMeetingColumn ? (meetingColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_CONTENT_COLUMN_MIN_WIDTH_PX) : 0)
    + (ownerColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.owner)
    + (statusColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.status)
    + (showStartDate ? (startDateColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.start) : 0)
    + (endDateColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.end)
    + (durationColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.duration);
  const hasElasticContentColumn = visibleContentColumnCount > 0;
  const assigneeOptions = React.useMemo<TaskAssignmentOption[]>(
    () => boardMembers.map(member => ({
      id: member.userId,
      label: member.profile?.displayName || member.profile?.email || member.userId,
      role: member.role,
    })),
    [boardMembers],
  );
  React.useEffect(() => {
    if (goalChildIntent.phase !== 'candidate' || !goalChildIntent.targetId) return undefined;
    const remaining = getTaskChildIntentRemainingMs(goalChildIntent);
    if (remaining === null) return undefined;
    const targetId = goalChildIntent.targetId;
    const timer = window.setTimeout(() => {
      const next = advanceTaskChildIntent({
        current: goalChildIntentRef.current,
        targetId,
        now: Date.now(),
      });
      if (next.targetId !== targetId) return;
      updateGoalChildIntent(next);
      const latestPreview = goalDropPreviewRef.current;
      updateGoalChildArmedId(next.phase === 'armed'
        && latestPreview?.feedbackKind !== 'origin'
        && latestPreview?.targetNodeId === targetId
        ? targetId
        : null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [goalChildIntent, updateGoalChildArmedId, updateGoalChildIntent]);
  const handleGoalDragMove = React.useCallback((event: DragMoveEvent) => {
    const activeItem = event.active.data.current?.item as TaskNode | undefined;
    const activeRect = event.active.rect.current.translated;
    if (!activeItem || !activeRect) return;
    const pointer = goalDragPointerRef.current || {
      x: activeRect.left + activeRect.width / 2,
      y: activeRect.top + activeRect.height / 2,
    };
    setGoalDragPointer(pointer);
    const root = document.querySelector<HTMLElement>('[data-goal-view="true"]');
    const lane = document.querySelector<HTMLElement>('#goal-column-task');
    if (!root || !lane) {
      clearGoalChildIntent();
      updateGoalDropPreview(null);
      return;
    }
    const laneRect = lane.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const rows: GoalTaskRect[] = Array.from(root.querySelectorAll<HTMLElement>('[data-goal-task-row-id]')).map(row => {
      const rect = row.getBoundingClientRect();
      const hierarchyRow = row.querySelector<HTMLElement>('[data-task-hierarchy-row="true"]');
      const title = hierarchyRow?.querySelector<HTMLElement>('[data-task-title-slot="true"]');
      const titleRect = title?.getBoundingClientRect();
      const hierarchyIndent = Number.parseFloat(
        hierarchyRow ? window.getComputedStyle(hierarchyRow).getPropertyValue('--task-hierarchy-indent') : '',
      );
      const hierarchyStyle = hierarchyRow ? window.getComputedStyle(hierarchyRow) : null;
      const hierarchyLaneStart = Number.parseFloat(hierarchyStyle?.getPropertyValue('--goal-hierarchy-lane-start') || '');
      const level = Number(row.dataset.goalLevel) || 0;
      const resolvedHierarchyIndent = Number.isFinite(hierarchyIndent) ? hierarchyIndent : 10.4;
      const titleAnchorLeft = titleRect?.left ?? (laneRect.left + 14 + level * resolvedHierarchyIndent);
      return {
        nodeId: row.dataset.goalTaskRowId || '',
        left: laneRect.left,
        right: laneRect.right,
        top: rect.top,
        bottom: rect.bottom,
        titleAnchorLeft,
        childAnchorLeft: titleAnchorLeft + resolvedHierarchyIndent,
        treeRailLeft: laneRect.left + (Number.isFinite(hierarchyLaneStart) ? hierarchyLaneStart : 20) + level * resolvedHierarchyIndent,
        visibleSubtreeBottom: rect.bottom,
        cellRight: laneRect.right,
      };
    }).filter(row => Boolean(row.nodeId));
    const geometry = resolveGoalTaskRowDropGeometry({
      sourceNodeId: activeItem.id,
      pointer,
      rows,
      taskLaneRect: { nodeId: 'task-lane', left: laneRect.left, right: laneRect.right, top: rootRect.top, bottom: rootRect.bottom },
      viewportRect: { nodeId: 'goal-viewport', left: rootRect.left, right: rootRect.right, top: rootRect.top, bottom: rootRect.bottom },
      nodesRecord: nodes,
    });
    if (!geometry) {
      clearGoalChildIntent();
      updateGoalDropPreview(null);
      return;
    }
    const targetRow = root.querySelector<HTMLElement>(`[data-goal-task-row-id="${CSS.escape(geometry.targetNodeId)}"]`);
    const primary = targetRow?.querySelector<HTMLElement>('[data-task-drag-surface-kind="goal-row"]');
    const primaryRect = primary?.getBoundingClientRect();
    const childEntryWindow = primaryRect ? resolveGoalChildEntryWindow(primaryRect) : null;
    const pointerTarget = document.elementFromPoint(pointer.x, pointer.y);
    const pointerOnControl = isTaskPrimaryActionTarget(pointerTarget);
    const targetHasHiddenChildren = (parentNodesIndex[geometry.targetNodeId] || []).length > 0
      && collapsedIds.has(geometry.targetNodeId);
    const childCandidate = Boolean(geometry.feedbackKind !== 'origin' && childEntryWindow
      && !targetHasHiddenChildren
      && !pointerOnControl
      && pointer.x >= childEntryWindow.left && pointer.x <= childEntryWindow.right
      && pointer.y >= childEntryWindow.top && pointer.y <= childEntryWindow.bottom);
    if (!childCandidate) {
      clearGoalChildIntent();
      updateGoalDropPreview(geometry);
      return;
    }
    const nextChildIntent = advanceTaskChildIntent({
      current: goalChildIntentRef.current,
      targetId: geometry.targetNodeId,
      now: Date.now(),
    });
    updateGoalChildIntent(nextChildIntent);
    updateGoalChildArmedId(nextChildIntent.phase === 'armed' ? geometry.targetNodeId : null);
    updateGoalDropPreview(geometry);
  }, [clearGoalChildIntent, collapsedIds, nodes, parentNodesIndex, updateGoalChildArmedId, updateGoalChildIntent, updateGoalDropPreview]);
  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    setActiveDragNode(null);
    goalDragPointerRef.current = null;
    setGoalDragPointer(null);
    const presentedPreview = goalDropPreviewRef.current;
    const presentedChildTargetId = goalChildArmedIdRef.current;
    clearGoalChildIntent();
    updateGoalDropPreview(null);
    if (!canMoveTask || !event.over || !presentedPreview || presentedPreview.feedbackKind === 'origin' || event.active.id === event.over.id) return;
    const activeItem = event.active.data.current?.item as TaskNode | undefined;
    const overItem = event.over.data.current?.item as TaskNode | undefined;
    if (!activeItem || !overItem) return;
    const activeRect = event.active.rect.current.translated;
    const overRect = event.over.rect;
    const orderingPosition = resolveGoalDropPosition(
      activeRect ? { top: activeRect.top, height: activeRect.height } : null,
      { top: overRect.top, height: overRect.height },
    );
    const sourceSurfaceKind = activeItem.parentId ? 'checklist-row' : 'column-header';
    const isPresentedChild = presentedChildTargetId === overItem.id
      && presentedPreview?.targetNodeId === overItem.id;
    const targetSurfaceKind = isPresentedChild
      ? 'task-title-child'
      : overItem.parentId ? 'checklist-row' : 'column-header';
    const resolvedOrderingPosition = presentedPreview?.targetNodeId === overItem.id
      ? presentedPreview.orderingPosition
      : orderingPosition;
    commitPrimaryDesktopTaskDrag({
      source: { nodeId: activeItem.id, surfaceKind: sourceSurfaceKind },
      target: { nodeId: overItem.id, surfaceKind: targetSurfaceKind, orderingPosition: isPresentedChild ? undefined : resolvedOrderingPosition },
      dependencies: { canMoveTask, batchUpdateNodes, recalculateAncestorStatus },
    });
  }, [batchUpdateNodes, canMoveTask, clearGoalChildIntent, recalculateAncestorStatus, updateGoalDropPreview]);
  const retryMeeting = React.useCallback(() => {
    if (activeWorkspaceId && boardId) void loadRecords(activeWorkspaceId, boardId);
  }, [activeWorkspaceId, boardId, loadRecords]);

  const focusCell = React.useCallback((key: string) => {
    const target = Array.from(document.querySelectorAll<HTMLElement>('[data-goal-cell-key]'))
      .find(element => element.dataset.goalCellKey === key);
    target?.focus({ preventScroll: true });
  }, []);

  const closeCellMenu = React.useCallback(() => {
    const key = cellMenu?.key;
    setCellMenu(null);
    if (key) window.requestAnimationFrame(() => focusCell(key));
  }, [cellMenu?.key, focusCell]);

  const openCellMenu = React.useCallback((key: string, column: GoalCellColumn, taskId: string, event: React.MouseEvent<HTMLTableCellElement> | React.KeyboardEvent<HTMLTableCellElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedCellKey(key);
    setCellMenu({
      key,
      taskId,
      column,
      x: 'clientX' in event && event.clientX ? event.clientX : rect.left,
      y: 'clientY' in event && event.clientY ? event.clientY : rect.bottom,
    });
  }, []);

  const toggleCell = React.useCallback((key: string) => {
    setExpandedCellKeys(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const sourceIsVisible = Boolean(
    goalSession.session.taskId
    && hierarchy.items.some(item => item.id === goalSession.session.taskId)
    && projection.rows.some(row => row.taskId === goalSession.session.taskId && row.descriptionCell.kind === 'owner'),
  );
  React.useEffect(() => {
    if (goalSession.session.taskId) goalSession.setSourceVisible(goalSession.session.taskId, sourceIsVisible);
  }, [goalSession, sourceIsVisible]);

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
  const goalChildIsArmed = Boolean(goalDropPreview && goalChildArmedId === goalDropPreview.targetNodeId);
  const goalTreePreview = goalDropPreview && goalDropPreview.feedbackKind !== 'origin'
    ? (goalChildIsArmed ? goalDropPreview.childTreePreview : goalDropPreview.standardTreePreview)
    : null;
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
        <DesktopTaskDragHost
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={event => {
            const item = event.active.data.current?.item as TaskNode | undefined;
            if (canMoveTask && item) {
              setActiveDragNode(item);
              const rect = event.active.rect.current.initial;
              if (rect) {
                const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                goalDragPointerRef.current = point;
                setGoalDragPointer(point);
              }
            }
          }}
          onDragMove={handleGoalDragMove}
          onPointerMove={point => {
            goalDragPointerRef.current = point;
            setGoalDragPointer(point);
          }}
          onExternalInvalidate={() => {
            clearGoalChildIntent();
            updateGoalDropPreview(null);
          }}
          onDragCancel={() => {
            setActiveDragNode(null);
            goalDragPointerRef.current = null;
            setGoalDragPointer(null);
            clearGoalChildIntent();
            updateGoalDropPreview(null);
          }}
          onDragEnd={handleDragEnd}
          overlay={(
            <>
              {goalDropPreview && goalTreePreview ? (
                <GoalHierarchyGuides
                  variant="preview"
                  treePreview={goalTreePreview}
                  targetNodeId={goalDropPreview.targetNodeId}
                />
              ) : null}
              {goalDropPreview && goalDropPreview.feedbackKind !== 'origin' ? (
                <DesktopTaskInsertionIndicator
                  indicatorRect={goalChildIsArmed ? goalDropPreview.childIndicatorRect : goalDropPreview.indicatorRect}
                  targetNodeId={goalDropPreview.targetNodeId}
                  position={goalChildIsArmed ? 'child' : goalDropPreview.orderingPosition}
                  surfaceKind={goalChildIsArmed ? 'task-title-child' : goalDropPreview.targetSurfaceKind}
                  feedbackKind={goalChildIsArmed ? 'child' : 'standard'}
                  presentation="kanban-marker"
                  markerDataAttributes={{
                    'data-goal-drag-marker': 'true',
                    'data-goal-drag-position': goalChildIsArmed ? 'child' : goalDropPreview.orderingPosition,
                    'data-goal-drag-preview-anchor': goalChildIsArmed
                      ? goalDropPreview.targetNodeId
                      : goalDropPreview.standardPreviewAnchorNodeId,
                  }}
                />
              ) : null}
              {activeDragNode ? (
                <div
                  className="task-title-text pointer-events-none fixed z-50 max-w-[252px] -translate-x-1/2 -translate-y-1/2 rotate-1 scale-[0.5] truncate rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xl ring-2 ring-primary/20"
                  style={{ left: goalDragPointer?.x ?? 16, top: goalDragPointer?.y ?? 16 }}
                  data-task-drag-source-id={activeDragNode.id}
                  data-goal-drag-overlay="true"
                >
                  {activeDragNode.title || '未命名任務'}
                </div>
              ) : null}
            </>
          )}
        >
          <table
            className="mb-3 w-full table-fixed border-collapse sm:mb-5"
            style={{ width: goalTableMinWidth, minWidth: goalTableMinWidth }}
            data-goal-task-table="true"
            data-goal-collapsed-columns={Array.from(collapsedColumns).join(',')}
            data-goal-description-column-state={hasDescriptionColumn ? (descriptionColumnCollapsed ? 'collapsed' : 'expanded') : 'absent'}
          >
            <caption className="sr-only">任務名稱、任務目的、會議紀錄、負責人、狀態、開始日期、結束日期與工期</caption>
            <colgroup>
              <col style={{ width: hasElasticContentColumn ? GOAL_TASK_COLUMN_WIDTH_PX : undefined }} />
              {hasDescriptionColumn ? <col style={descriptionColumnCollapsed ? { width: GOAL_COLLAPSED_COLUMN_WIDTH_PX } : undefined} /> : null}
              {showMeetingColumn ? <col style={meetingColumnCollapsed ? { width: GOAL_COLLAPSED_COLUMN_WIDTH_PX } : undefined} /> : null}
              <col style={{ width: ownerColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.owner }} />
              <col style={{ width: statusColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.status }} />
              {showStartDate ? <col style={{ width: startDateColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.start }} /> : null}
              <col style={{ width: endDateColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.end }} />
              <col style={{ width: durationColumnCollapsed ? GOAL_COLLAPSED_COLUMN_WIDTH_PX : GOAL_PLANNING_WIDTHS.duration }} />
            </colgroup>
            <thead className="text-left text-[11px] font-semibold text-slate-600" data-goal-sticky-header="true">
              <tr>
                <th
                  id="goal-column-task"
                  scope="col"
                  className="sticky left-0 top-0 z-[8] min-w-[252px] border-b border-r border-slate-200 bg-surface-panel py-1.5 pl-[30px] pr-[38px]"
                  data-goal-column-header="task"
                >
                  任務名稱
                </th>
                {hasDescriptionColumn ? (
                  <GoalColumnHeader
                    id="goal-column-description"
                    column="description"
                    collapsed={descriptionColumnCollapsed}
                    onToggle={() => toggleGoalColumn('description')}
                    className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-3 py-1.5"
                  />
                ) : null}
                {showMeetingColumn ? (
                  <GoalColumnHeader
                    id="goal-column-meeting"
                    column="meeting"
                    collapsed={meetingColumnCollapsed}
                    onToggle={() => toggleGoalColumn('meeting')}
                    className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-3 py-1.5"
                  />
                ) : null}
                <GoalColumnHeader id="goal-column-owner" column="owner" collapsed={ownerColumnCollapsed} onToggle={() => toggleGoalColumn('owner')} className="sticky top-0 z-[7] border-b border-l border-r border-slate-200 bg-surface-panel px-1 py-1.5" />
                <GoalColumnHeader id="goal-column-status" column="status" collapsed={statusColumnCollapsed} onToggle={() => toggleGoalColumn('status')} className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-1 py-1.5" />
                {showStartDate ? <GoalColumnHeader id="goal-column-start-date" column="start-date" collapsed={startDateColumnCollapsed} onToggle={() => toggleGoalColumn('start-date')} className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-1 py-1.5" /> : null}
                <GoalColumnHeader id="goal-column-end-date" column="end-date" collapsed={endDateColumnCollapsed} onToggle={() => toggleGoalColumn('end-date')} className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-1 py-1.5" />
                <GoalColumnHeader id="goal-column-duration" column="duration" collapsed={durationColumnCollapsed} onToggle={() => toggleGoalColumn('duration')} className="sticky top-0 z-[7] border-b border-r border-slate-200 bg-surface-panel px-1 py-1.5" />
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
                      collapsedColumns={collapsedColumns}
                      showMeetingColumn={showMeetingColumn}
                      meetingStatus={meetingStatus}
                      isFirstRow={index === 0}
                      onRetryMeeting={retryMeeting}
                      meetingEntries={meetingNotesByTaskId.get(node.id) ?? []}
                      assigneeOptions={assigneeOptions}
                      membersLoading={membersLoading}
                      showStartDate={showStartDate}
                      showTags={showTags}
                      hierarchyDecoration={hierarchyDecorations.get(node.id) ?? EMPTY_GOAL_HIERARCHY_DECORATION}
                      activeHierarchyScopeId={visibleHierarchyScopeId}
                      childDropCandidate={goalChildCandidateTargetId === node.id}
                      childDropTarget={goalChildTargetId === node.id}
                      activeDescriptionOwner={activeContentOwnerIds.description.has(node.id)}
                      activeMeetingOwner={activeContentOwnerIds.meeting.has(node.id)}
                      onHierarchyScopeChange={setActiveHierarchyScopeId}
                      selectedCellKey={selectedCellKey}
                      expandedCellKeys={expandedCellKeys}
                      onSelectCell={key => setSelectedCellKey(key)}
                      onToggleCell={toggleCell}
                      onOpenCellMenu={openCellMenu}
                    />
                  );
                })}
              </SortableContext>
            </tbody>
          </table>
        </DesktopTaskDragHost>
      )}
      {cellMenu ? (
        <GoalCellActionMenu
          taskId={cellMenu.taskId}
          column={cellMenu.column}
          expanded={expandedCellKeys.has(cellMenu.key)}
          canEdit={cellMenu.column === 'description' && canEditTask && useBoardStore.getState().activeBoardId === boardId}
          x={cellMenu.x}
          y={cellMenu.y}
          onEdit={() => {
            const node = useWbsStore.getState().nodes[cellMenu.taskId];
            if (node) goalSession.beginEditing(node);
          }}
          onToggleExpanded={() => toggleCell(cellMenu.key)}
          onClose={closeCellMenu}
        />
      ) : null}
    </div>
  );
};

export default GoalView;
