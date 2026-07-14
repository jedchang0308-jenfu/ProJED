import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Copy, LockKeyhole, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  countActiveTaskFilters,
  matchesTaskFilters,
  normalizeTaskFilters,
  TASK_STATUS_OPTIONS,
  type TaskFilterState,
} from '../features/taskFilters';
import {
  cloneCalendarBoardFilterSnapshot,
  createCalendarSafeDefaultTaskFilters,
  materializeCalendarBoardFilters,
} from '../features/calendarSubscriptions/filters';
import { nodeService } from '../services/dataBackend';
import type {
  CalendarSubscriptionBoardFilterSnapshot,
  CalendarSubscriptionDateType,
  CalendarSubscriptionFilters,
} from '../services/supabase/database.types';
import { useTagStore } from '../store/useTagStore';
import type { TaskNode } from '../types';
import TaskConditionFilterControls, { type TaskConditionAssigneeOption } from './ui/TaskConditionFilterControls';
import { taskFilterFieldClass } from './ui/taskConditionFilterStyles';

export type CalendarSubscriptionBuilderBoard = {
  id: string;
  storageId?: string;
  workspaceId: string;
  storageWorkspaceId?: string;
  boardTitle: string;
  workspaceTitle: string;
  path: string;
};

export type CalendarSubscriptionBuilderAssigneeOption = TaskConditionAssigneeOption & {
  workspaceIds?: string[];
};

export type CalendarSubscriptionBuilderPayload = {
  version: 3;
  v3_scope_type: 'per_board_filter_snapshot';
  workspace_ids: string[];
  project_ids: string[];
  board_filters: Record<string, CalendarSubscriptionBoardFilterSnapshot>;
};

export type CalendarSubscriptionBuilderValidation = {
  isComplete: boolean;
  loading: boolean;
  failedBoardIds: string[];
  includedBoardCount: number;
  missingDateTypeBoardIds: string[];
};

type Props = {
  boards: CalendarSubscriptionBuilderBoard[];
  currentUserId?: string | null;
  assigneeOptions?: CalendarSubscriptionBuilderAssigneeOption[];
  manageableWorkspaceIds?: string[];
  allowAllAssignees?: boolean;
  initialFilters?: CalendarSubscriptionFilters | null;
  resetKey?: string | number;
  onPayloadChange?: (payload: CalendarSubscriptionBuilderPayload) => void;
  onValidationChange?: (validation: CalendarSubscriptionBuilderValidation) => void;
};

type PreviewTask = {
  node: TaskNode;
  board: CalendarSubscriptionBuilderBoard;
};

type PreviewEvent = PreviewTask & {
  date: string;
  dateType: CalendarSubscriptionDateType;
};

type MissingPreviewEvent = PreviewTask & {
  dateType: CalendarSubscriptionDateType;
};

type PreviewGroupMode = 'date' | 'board';

const unique = (values: Array<string | undefined>) => Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const boardAliases = (board: CalendarSubscriptionBuilderBoard) => unique([board.id, board.storageId]);
const workspaceAliases = (board: CalendarSubscriptionBuilderBoard) => unique([board.workspaceId, board.storageWorkspaceId]);
const statusLabelByKey = new Map(TASK_STATUS_OPTIONS.map(option => [option.key, option.label]));
const dateTypeLabel = (dateType: CalendarSubscriptionDateType) => dateType === 'start_date' ? '開始' : '到期';
const taskDateForType = (node: TaskNode, dateType: CalendarSubscriptionDateType) =>
  dateType === 'start_date' ? node.startDate : node.endDate;
const formatCalendarDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed);
};

const CalendarSubscriptionBuilderPreview: React.FC<Props> = ({
  boards,
  currentUserId,
  assigneeOptions = [],
  manageableWorkspaceIds = [],
  allowAllAssignees = false,
  initialFilters,
  resetKey = 'default',
  onPayloadChange,
  onValidationChange,
}) => {
  const tags = useTagStore(state => state.tags);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const initializedResetKeyRef = useRef<string | number | null>(null);
  const [boardFilters, setBoardFilters] = useState<Record<string, CalendarSubscriptionBoardFilterSnapshot>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([]);
  const [previewGroupMode, setPreviewGroupMode] = useState<PreviewGroupMode>('date');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [missingEventsOpen, setMissingEventsOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<{
    loading: boolean;
    failedBoardIds: string[];
    nodes: TaskNode[];
  }>({ loading: true, failedBoardIds: [], nodes: [] });

  const boardKey = useMemo(
    () => boards.map(board => `${board.id}:${board.storageId ?? ''}:${board.workspaceId}:${board.storageWorkspaceId ?? ''}`).join('|'),
    [boards],
  );

  useEffect(() => {
    const materialized = materializeCalendarBoardFilters(boards, initialFilters, currentUserId);
    const shouldReset = initializedResetKeyRef.current !== resetKey;
    initializedResetKeyRef.current = resetKey;

    setBoardFilters(current => {
      if (shouldReset) return materialized;
      return Object.fromEntries(boards.map(board => [
        board.id,
        current[board.id] ?? materialized[board.id],
      ]));
    });
    setSelectedBoardId(current => boards.some(board => board.id === current) ? current : boards[0]?.id ?? null);
    if (shouldReset) {
      setCopyOpen(false);
      setCopyTargetIds([]);
      setFiltersOpen(false);
      setPreviewGroupMode('date');
      setPreviewExpanded(false);
      setMissingEventsOpen(false);
    }
  }, [boardKey, boards, currentUserId, initialFilters, resetKey]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPreviewSource({ loading: true, failedBoardIds: [], nodes: [] });
    });

    void Promise.allSettled(
      boards.map(async board => ({ boardId: board.id, nodes: await nodeService.listByProject(board.workspaceId, board.id) })),
    ).then(results => {
      if (cancelled) return;
      const failedBoardIds: string[] = [];
      const nodesById = new Map<string, TaskNode>();
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedBoardIds.push(boards[index]?.id ?? 'unknown');
          return;
        }
        result.value.nodes.forEach(node => nodesById.set(node.id, node));
      });
      setPreviewSource({ loading: false, failedBoardIds, nodes: Array.from(nodesById.values()) });
    });

    return () => {
      cancelled = true;
    };
  }, [boardKey, boards]);

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (filterPanelRef.current?.contains(target) || filterToggleRef.current?.contains(target)) return;
      setFiltersOpen(false);
      setCopyOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setFiltersOpen(false);
      setCopyOpen(false);
      requestAnimationFrame(() => filterToggleRef.current?.focus());
    };
    document.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape, { capture: true });
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape, { capture: true });
    };
  }, [filtersOpen]);

  const boardByAlias = useMemo(() => {
    const map = new Map<string, CalendarSubscriptionBuilderBoard>();
    boards.forEach(board => boardAliases(board).forEach(alias => map.set(alias, board)));
    return map;
  }, [boards]);

  const includedBoards = useMemo(
    () => boards.filter(board => boardFilters[board.id]?.included),
    [boardFilters, boards],
  );

  const payload = useMemo<CalendarSubscriptionBuilderPayload>(() => ({
    version: 3,
    v3_scope_type: 'per_board_filter_snapshot',
    workspace_ids: unique(boards.flatMap(board => [board.workspaceId])),
    project_ids: boards.map(board => board.id),
    board_filters: Object.fromEntries(boards.map(board => [
      board.id,
      cloneCalendarBoardFilterSnapshot(boardFilters[board.id] ?? {
        included: true,
        date_types: ['due_date'],
        filters: createCalendarSafeDefaultTaskFilters(currentUserId),
      }),
    ])),
  }), [boardFilters, boards, currentUserId]);

  const missingDateTypeBoardIds = useMemo(
    () => includedBoards
      .filter(board => (boardFilters[board.id]?.date_types.length ?? 0) === 0)
      .map(board => board.id),
    [boardFilters, includedBoards],
  );

  const isComplete = boards.length > 0
    && includedBoards.length > 0
    && missingDateTypeBoardIds.length === 0
    && !previewSource.loading
    && previewSource.failedBoardIds.length === 0
    && boards.every(board => Boolean(boardFilters[board.id]));

  useEffect(() => {
    onPayloadChange?.(payload);
  }, [onPayloadChange, payload]);

  useEffect(() => {
    onValidationChange?.({
      isComplete,
      loading: previewSource.loading,
      failedBoardIds: previewSource.failedBoardIds,
      includedBoardCount: includedBoards.length,
      missingDateTypeBoardIds,
    });
  }, [includedBoards.length, isComplete, missingDateTypeBoardIds, onValidationChange, previewSource.failedBoardIds, previewSource.loading]);

  const matchedPreviewTasks = useMemo<PreviewTask[]>(() => previewSource.nodes
    .filter(node => !node.isArchived)
    .filter(node => node.nodeType !== 'group')
    .flatMap(node => {
      const board = boardByAlias.get(node.boardId);
      if (!board) return [];
      const snapshot = boardFilters[board.id];
      if (!snapshot?.included) return [];
      return matchesTaskFilters(node, snapshot.filters) ? [{ node, board }] : [];
    })
    .sort((left, right) => {
      const boardCompare = left.board.path.localeCompare(right.board.path, 'zh-TW');
      if (boardCompare !== 0) return boardCompare;
      return (left.node.endDate || left.node.startDate || '').localeCompare(right.node.endDate || right.node.startDate || '');
    }), [boardByAlias, boardFilters, previewSource.nodes]);

  const { previewEvents, missingPreviewEvents } = useMemo(() => {
    const events: PreviewEvent[] = [];
    const missingEvents: MissingPreviewEvent[] = [];
    matchedPreviewTasks.forEach(task => {
      const dateTypes = boardFilters[task.board.id]?.date_types ?? [];
      dateTypes.forEach(dateType => {
        const date = taskDateForType(task.node, dateType);
        if (date) events.push({ ...task, date, dateType });
        else missingEvents.push({ ...task, dateType });
      });
    });
    return { previewEvents: events, missingPreviewEvents: missingEvents };
  }, [boardFilters, matchedPreviewTasks]);

  const subscribedTaskCount = useMemo(
    () => new Set(previewEvents.map(event => event.node.id)).size,
    [previewEvents],
  );
  const startEventCount = previewEvents.filter(event => event.dateType === 'start_date').length;
  const dueEventCount = previewEvents.length - startEventCount;
  const orderedPreviewEvents = useMemo(() => [...previewEvents].sort((left, right) => {
    if (previewGroupMode === 'date') {
      const dateCompare = left.date.localeCompare(right.date);
      if (dateCompare !== 0) return dateCompare;
      const boardCompare = left.board.path.localeCompare(right.board.path, 'zh-TW');
      if (boardCompare !== 0) return boardCompare;
    } else {
      const boardCompare = left.board.path.localeCompare(right.board.path, 'zh-TW');
      if (boardCompare !== 0) return boardCompare;
      const dateCompare = left.date.localeCompare(right.date);
      if (dateCompare !== 0) return dateCompare;
    }
    const titleCompare = left.node.title.localeCompare(right.node.title, 'zh-TW');
    if (titleCompare !== 0) return titleCompare;
    return left.dateType.localeCompare(right.dateType);
  }), [previewEvents, previewGroupMode]);
  const visiblePreviewEvents = previewExpanded ? orderedPreviewEvents : orderedPreviewEvents.slice(0, 12);
  const groupedPreviewEvents = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; events: PreviewEvent[] }>();
    visiblePreviewEvents.forEach(event => {
      const key = previewGroupMode === 'date' ? event.date : event.board.id;
      const label = previewGroupMode === 'date' ? formatCalendarDate(event.date) : event.board.path;
      const current = groups.get(key) ?? { key, label, events: [] };
      current.events.push(event);
      groups.set(key, current);
    });
    return Array.from(groups.values());
  }, [previewGroupMode, visiblePreviewEvents]);

  const selectedBoard = selectedBoardId ? boards.find(board => board.id === selectedBoardId) : undefined;
  const selectedSnapshot = selectedBoard ? boardFilters[selectedBoard.id] : undefined;
  const selectedFilters = selectedSnapshot?.filters ?? createCalendarSafeDefaultTaskFilters(currentUserId);
  const selectedDateTypes = selectedSnapshot?.date_types ?? ['due_date'];
  const activeFilterCount = countActiveTaskFilters(selectedFilters);
  const manageableWorkspaceSet = useMemo(() => new Set(manageableWorkspaceIds), [manageableWorkspaceIds]);
  const canManageSelectedBoard = allowAllAssignees || !selectedBoard || workspaceAliases(selectedBoard).some(id => manageableWorkspaceSet.has(id));
  const visibleAssigneeOptions = useMemo(() => {
    const selectedWorkspaceAliases = selectedBoard ? workspaceAliases(selectedBoard) : [];
    const options = assigneeOptions
      .filter(option => !option.workspaceIds?.length || option.workspaceIds.some(id => selectedWorkspaceAliases.includes(id)))
      .map(option => ({
        ...option,
        disabled: option.id !== currentUserId && !canManageSelectedBoard,
        disabledReason: option.id !== currentUserId && !canManageSelectedBoard
          ? '你只能訂閱自己負責的任務。'
          : option.disabledReason,
    }));
    if (currentUserId && !options.some(option => option.id === currentUserId)) {
      options.unshift({ id: currentUserId, label: '我', disabled: false, disabledReason: undefined });
    }
    return options;
  }, [assigneeOptions, canManageSelectedBoard, currentUserId, selectedBoard]);

  const updateSelectedFilters = (updates: Partial<TaskFilterState>) => {
    if (!selectedBoard) return;
    const guardedUpdates = !canManageSelectedBoard && currentUserId && updates.selectedAssigneeIds
      ? { ...updates, selectedAssigneeIds: [currentUserId] }
      : updates;
    setBoardFilters(current => ({
      ...current,
      [selectedBoard.id]: {
        ...(current[selectedBoard.id] ?? { included: true, date_types: ['due_date'], filters: createCalendarSafeDefaultTaskFilters(currentUserId) }),
        filters: normalizeTaskFilters({
          ...(current[selectedBoard.id]?.filters ?? createCalendarSafeDefaultTaskFilters(currentUserId)),
          ...guardedUpdates,
          statusFilters: guardedUpdates.statusFilters
            ? { ...(current[selectedBoard.id]?.filters.statusFilters ?? {}), ...guardedUpdates.statusFilters }
            : current[selectedBoard.id]?.filters.statusFilters,
        }),
      },
    }));
  };

  const toggleSelectedDateType = (dateType: CalendarSubscriptionDateType) => {
    if (!selectedBoard) return;
    setBoardFilters(current => {
      const snapshot = current[selectedBoard.id] ?? {
        included: true,
        date_types: ['due_date'] as CalendarSubscriptionDateType[],
        filters: createCalendarSafeDefaultTaskFilters(currentUserId),
      };
      return {
        ...current,
        [selectedBoard.id]: {
          ...snapshot,
          date_types: snapshot.date_types.includes(dateType)
            ? snapshot.date_types.filter(value => value !== dateType)
            : [...snapshot.date_types, dateType],
        },
      };
    });
  };

  const resetSelectedFilters = () => {
    if (!selectedBoard) return;
    setBoardFilters(current => ({
      ...current,
      [selectedBoard.id]: {
        ...(current[selectedBoard.id] ?? { included: true, date_types: ['due_date'], filters: selectedFilters }),
        date_types: ['due_date'],
        filters: createCalendarSafeDefaultTaskFilters(currentUserId),
      },
    }));
  };

  const toggleSelectedIncluded = () => {
    if (!selectedBoard) return;
    setBoardFilters(current => ({
      ...current,
      [selectedBoard.id]: {
        ...(current[selectedBoard.id] ?? { included: true, date_types: ['due_date'], filters: selectedFilters }),
        included: !(current[selectedBoard.id]?.included ?? true),
      },
    }));
  };

  const toggleCopyTarget = (boardId: string) => {
    setCopyTargetIds(current => current.includes(boardId)
      ? current.filter(id => id !== boardId)
      : [...current, boardId]);
  };

  const applyBatchCopy = () => {
    if (!selectedBoard || copyTargetIds.length === 0) return;
    setBoardFilters(current => {
      const source = current[selectedBoard.id];
      if (!source) return current;
      const next = { ...current };
      copyTargetIds.forEach(boardId => {
        const target = current[boardId];
        if (!target) return;
        const copiedSnapshot = cloneCalendarBoardFilterSnapshot(source);
        next[boardId] = {
          included: target.included,
          date_types: copiedSnapshot.date_types,
          filters: copiedSnapshot.filters,
        };
      });
      return next;
    });
    setCopyOpen(false);
    setCopyTargetIds([]);
  };

  const includedWorkspaceCount = unique(includedBoards.map(board => board.workspaceId)).length;

  return (
    <section
      className="relative mt-3 space-y-3 border-t border-slate-200 pt-3"
      data-calendar-subscription-builder="true"
      data-calendar-subscription-builder-version="3"
      data-calendar-subscription-builder-preview-count={previewEvents.length}
      data-calendar-subscription-builder-preview-task-count={subscribedTaskCount}
      data-calendar-subscription-builder-preview-event-count={previewEvents.length}
      data-calendar-subscription-builder-missing-event-count={missingPreviewEvents.length}
      data-calendar-subscription-builder-board-count={includedBoards.length}
      data-calendar-subscription-builder-snapshot-board-count={boards.length}
      data-calendar-subscription-preview-source-state={previewSource.loading ? 'loading' : previewSource.failedBoardIds.length ? 'partial' : 'ready'}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">任務條件與事件預覽</div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500" data-calendar-subscription-preview-count-label="true">
            {previewSource.loading ? '正在整理看板與事件' : `已納入 ${includedBoards.length} / ${boards.length} 張看板`}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            ref={filterToggleRef}
            type="button"
            onClick={() => setFiltersOpen(current => !current)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
              filtersOpen || activeFilterCount > 0
                ? 'border-primary/35 bg-primary/10 text-primary'
                : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
            }`}
            aria-label="過濾器"
            aria-expanded={filtersOpen}
            title="調整過濾器"
            data-calendar-subscription-filter-toggle="true"
          >
            <SlidersHorizontal size={14} />
            <span>條件</span>
            {activeFilterCount > 0 ? (
              <span className="min-w-4 rounded bg-primary px-1 text-center text-[10px] font-bold leading-4 text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/25 sm:hidden"
            aria-label="關閉過濾器"
            onClick={() => setFiltersOpen(false)}
          />
          <div
            ref={filterPanelRef}
            className="fixed inset-x-2 bottom-2 top-12 z-50 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-12 sm:max-h-[min(620px,calc(100vh-160px))]"
            data-calendar-subscription-filter-panel="true"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-700">過濾器</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={resetSelectedFilters}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:text-primary"
                  title="重設目前看板過濾器"
                >
                  <RotateCcw size={13} />
                  重設
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiltersOpen(false);
                    requestAnimationFrame(() => filterToggleRef.current?.focus());
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label="關閉過濾器"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {boards.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                目前沒有可建立訂閱的看板。請先建立或加入可讀取看板。
              </div>
            ) : (
              <div className="space-y-3">
                <section className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400">看板</label>
                  <select
                    value={selectedBoardId ?? ''}
                    onChange={event => {
                      setSelectedBoardId(event.target.value || null);
                      setCopyOpen(false);
                      setCopyTargetIds([]);
                    }}
                    className={`${taskFilterFieldClass} w-full`}
                    data-calendar-subscription-board-select="true"
                  >
                    {boards.map(board => <option key={board.id} value={board.id}>{board.path}</option>)}
                  </select>
                </section>

                <section className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span className="min-w-0 truncate">納入此訂閱</span>
                    <input
                      type="checkbox"
                      checked={selectedSnapshot?.included ?? false}
                      onChange={toggleSelectedIncluded}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      data-calendar-subscription-board-included-toggle="true"
                    />
                  </label>
                </section>

                <fieldset className="space-y-2" data-calendar-subscription-board-date-types="true">
                  <legend className="text-[11px] font-bold text-slate-400">事件日期</legend>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                    {([
                      ['start_date', '開始日'],
                      ['due_date', '到期日'],
                    ] as const).map(([value, label]) => (
                      <label key={value} className="inline-flex min-h-8 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedDateTypes.includes(value)}
                          onChange={() => toggleSelectedDateType(value)}
                          data-calendar-subscription-board-date-type={value}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {selectedSnapshot?.included && selectedDateTypes.length === 0 ? (
                    <div className="text-xs text-amber-700">請至少選擇一種事件日期。</div>
                  ) : null}
                </fieldset>

                {!canManageSelectedBoard ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    你在這張看板只能訂閱自己的任務；其他負責人與未指派選項不可使用。
                  </div>
                ) : null}

                <TaskConditionFilterControls
                  assigneeOptions={visibleAssigneeOptions}
                  filters={selectedFilters}
                  tags={tags}
                  unassignedDisabled={!canManageSelectedBoard}
                  unassignedDisabledReason="你只能訂閱自己負責的任務。"
                  onChange={updateSelectedFilters}
                />

                <section className="border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setCopyOpen(current => !current)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:border-primary/30 hover:text-primary"
                    data-calendar-subscription-copy-filters-toggle="true"
                  >
                    <Copy size={13} />
                    複製到其他看板
                  </button>
                  {copyOpen ? (
                    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3" data-calendar-subscription-copy-panel="true">
                      <div className="text-xs leading-5 text-slate-600">
                        從「{selectedBoard?.path}」複製任務條件與事件日期，不改變目標看板是否納入。
                      </div>
                      <div className="max-h-36 space-y-1 overflow-y-auto">
                        {boards.filter(board => board.id !== selectedBoardId).map(board => (
                          <label key={board.id} className="flex items-start gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-white">
                            <input
                              type="checkbox"
                              checked={copyTargetIds.includes(board.id)}
                              onChange={() => toggleCopyTarget(board.id)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="min-w-0 truncate">{board.path}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">將覆寫 {copyTargetIds.length} 張看板</span>
                        <button
                          type="button"
                          disabled={copyTargetIds.length === 0}
                          onClick={applyBatchCopy}
                          className="h-8 rounded-md bg-primary px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                          data-calendar-subscription-copy-apply="true"
                        >
                          套用複製
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            )}
          </div>
        </>
      ) : null}

      <div className="overflow-hidden border border-slate-200 bg-white" data-calendar-subscription-live-preview="true">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <CalendarDays size={15} className="text-primary" />
            訂閱事件預覽
          </div>
          <div className="ml-auto inline-flex border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="預覽分組方式">
            {([
              ['date', '依日期'],
              ['board', '依看板'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={previewGroupMode === mode}
                onClick={() => {
                  setPreviewGroupMode(mode);
                  setPreviewExpanded(false);
                }}
                className={`h-7 px-2 text-xs font-semibold ${previewGroupMode === mode ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                data-calendar-subscription-preview-group={mode}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5" data-calendar-subscription-event-summary="true">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-600">
            <span>外部行事曆會收到</span>
            <span className="text-base font-bold text-slate-900">{previewEvents.length} 個行事曆事件</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{includedWorkspaceCount} 個工作區 · {includedBoards.length} 張看板 · {subscribedTaskCount} 項任務</span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span className="font-semibold text-blue-700">開始 {startEventCount}</span>
            <span className="font-semibold text-rose-700">到期 {dueEventCount}</span>
            {missingPreviewEvents.length > 0 ? (
              <button
                type="button"
                onClick={() => setMissingEventsOpen(current => !current)}
                className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-700 hover:border-amber-300"
                aria-expanded={missingEventsOpen}
                data-calendar-subscription-missing-events-toggle="true"
              >
                未產生 {missingPreviewEvents.length}
                {missingEventsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-1.5 border-b border-slate-100 px-3 py-2 text-xs leading-5 text-amber-700">
          <LockKeyhole size={13} className="mt-0.5 shrink-0" />
          <span>任何持有此連結的人都能讀取下列事件內容；請只輸出必要任務。</span>
        </div>

        {previewSource.loading ? (
          <div className="m-3 border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">正在載入所有看板任務，完成後才能儲存。</div>
        ) : previewSource.failedBoardIds.length > 0 ? (
          <div className="m-3 border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">
            有 {previewSource.failedBoardIds.length} 張看板載入失敗，預覽不完整。請重新整理後再產生連結。
          </div>
        ) : missingDateTypeBoardIds.length > 0 ? (
          <div className="m-3 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">有 {missingDateTypeBoardIds.length} 張已納入看板尚未選擇事件日期。</div>
        ) : includedBoards.length === 0 ? (
          <div className="m-3 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">請開啟至少一張看板的「納入此訂閱」。</div>
        ) : previewEvents.length === 0 ? (
          <div className="m-3 flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <span>{missingPreviewEvents.length > 0 ? '符合條件的任務缺少所選日期，因此不會產生事件。' : '目前沒有符合條件的任務。'}</span>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="h-8 border border-slate-200 bg-white px-2 text-xs font-bold text-primary hover:border-primary/30"
            >
              調整過濾器
            </button>
          </div>
        ) : (
          <div className="space-y-3 px-3 py-3" data-calendar-subscription-preview-events="true">
            {groupedPreviewEvents.map(group => (
              <section key={group.key}>
                <div className="mb-1.5 flex min-w-0 items-center gap-2 border-b border-slate-200 pb-1.5">
                  <div className="min-w-0 flex-1 break-words text-xs font-bold text-slate-600 sm:truncate">{group.label}</div>
                  <span className="shrink-0 text-[11px] text-slate-400">{group.events.length} 個事件</span>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200">
                  {group.events.map(event => (
                    <div
                      key={`${event.node.id}:${event.dateType}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 bg-white px-2.5 py-2 text-sm"
                      data-calendar-subscription-preview-event="true"
                      data-preview-event-task-id={event.node.storageId ?? event.node.id}
                      data-preview-event-board-id={event.board.storageId ?? event.board.id}
                      data-preview-event-date={event.date}
                      data-preview-event-date-type={event.dateType}
                    >
                      <span className={`mt-0.5 inline-flex h-5 items-center border px-1.5 text-[10px] font-bold ${event.dateType === 'start_date' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {dateTypeLabel(event.dateType)}
                      </span>
                      <div className="min-w-0">
                        <div className="break-words font-bold leading-5 text-slate-800 sm:truncate">{event.node.title}</div>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                          <span className="min-w-0 break-words sm:truncate">{previewGroupMode === 'date' ? event.board.path : formatCalendarDate(event.date)}</span>
                          <span className="text-slate-300">·</span>
                          <span>{statusLabelByKey.get(event.node.status) ?? event.node.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {previewEvents.length > 12 ? (
              <button
                type="button"
                onClick={() => setPreviewExpanded(current => !current)}
                className="inline-flex h-8 w-full items-center justify-center gap-1 border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 hover:border-primary/30 hover:text-primary"
                aria-expanded={previewExpanded}
                data-calendar-subscription-preview-expand="true"
              >
                {previewExpanded ? '收合事件' : `查看全部 ${previewEvents.length} 個事件`}
                {previewExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : null}
          </div>
        )}

        {missingEventsOpen && missingPreviewEvents.length > 0 ? (
          <div className="border-t border-amber-200 bg-amber-50 px-3 py-3" data-calendar-subscription-missing-events="true">
            <div className="text-xs font-bold text-amber-800">未產生事件</div>
            <div className="mt-1 text-xs leading-5 text-amber-700">下列任務符合條件，但缺少該看板所選日期，因此不會出現在外部行事曆。</div>
            <div className="mt-2 divide-y divide-amber-100 border border-amber-200 bg-white">
              {missingPreviewEvents.slice(0, 20).map(event => (
                <div key={`${event.node.id}:${event.dateType}`} className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-xs">
                  <span className="shrink-0 font-bold text-amber-700">缺少{dateTypeLabel(event.dateType)}日</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{event.node.title}</span>
                  <span className="hidden max-w-[45%] truncate text-slate-400 sm:block">{event.board.path}</span>
                </div>
              ))}
            </div>
            {missingPreviewEvents.length > 20 ? <div className="mt-2 text-xs text-amber-700">另有 {missingPreviewEvents.length - 20} 個未產生事件。</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default CalendarSubscriptionBuilderPreview;
