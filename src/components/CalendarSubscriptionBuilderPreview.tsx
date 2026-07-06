import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Eye, Filter, RotateCcw, Search } from 'lucide-react';
import {
  createDefaultTaskFilters,
  matchesTaskFilters,
  normalizeTaskFilters,
  TASK_STATUS_OPTIONS,
  type TaskFilterState,
} from '../features/taskFilters';
import { useTagStore } from '../store/useTagStore';
import { useWbsStore } from '../store/useWbsStore';
import type {
  CalendarSubscriptionBoardFilterOverride,
  CalendarSubscriptionDateType,
} from '../services/supabase/database.types';
import type { TaskNode } from '../types';

export type CalendarSubscriptionBuilderBoard = {
  id: string;
  workspaceId: string;
  boardTitle: string;
  workspaceTitle: string;
  path: string;
};

export type CalendarSubscriptionBuilderPayload = {
  version: 2;
  v2_scope_type: 'all_accessible_boards_snapshot';
  workspace_ids: string[];
  project_ids: string[];
  global_filter: TaskFilterState;
  board_overrides: Record<string, CalendarSubscriptionBoardFilterOverride>;
  date_types: CalendarSubscriptionDateType[];
};

type Props = {
  boards: CalendarSubscriptionBuilderBoard[];
  dateTypes: CalendarSubscriptionDateType[];
  selectedAssigneeIds: string[];
  onPayloadChange?: (payload: CalendarSubscriptionBuilderPayload) => void;
};

type BoardOverrideDraft = {
  enabled: boolean;
  useCustomFilter: boolean;
  filters: TaskFilterState;
};

type PreviewTask = {
  node: TaskNode;
  board: CalendarSubscriptionBuilderBoard;
};

const createCalendarDefaultTaskFilters = (): TaskFilterState => ({
  ...createDefaultTaskFilters(),
  selectedAssigneeIds: [],
});

const hasTaskCalendarDate = (node: TaskNode, dateTypes: CalendarSubscriptionDateType[]) => {
  if (dateTypes.length === 0) return false;
  return dateTypes.some((type) => type === 'start_date' ? Boolean(node.startDate) : Boolean(node.endDate));
};

const areFiltersEqual = (a: TaskFilterState, b: TaskFilterState) =>
  JSON.stringify(a) === JSON.stringify(b);

const getBoardModeLabel = (override: BoardOverrideDraft | undefined) => {
  if (override?.enabled === false) return '排除';
  if (override?.useCustomFilter) return '自訂';
  return '沿用';
};

const ConditionControls: React.FC<{
  title: string;
  filters: TaskFilterState;
  onChange: (updates: Partial<TaskFilterState>) => void;
}> = ({ title, filters, onChange }) => {
  const tags = useTagStore((state) => state.tags);

  const toggleStatus = (statusKey: keyof TaskFilterState['statusFilters']) => {
    onChange({
      statusFilters: {
        ...filters.statusFilters,
        [statusKey]: !filters.statusFilters[statusKey],
      },
    });
  };

  const toggleTag = (tagId: string) => {
    onChange({
      selectedTagIds: filters.selectedTagIds.includes(tagId)
        ? filters.selectedTagIds.filter((id) => id !== tagId)
        : [...filters.selectedTagIds, tagId],
    });
  };

  return (
    <div className="space-y-3" data-calendar-subscription-condition-controls="true">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="flex flex-wrap gap-1.5" aria-label={`${title}狀態`}>
        {TASK_STATUS_OPTIONS.map((status) => {
          const isActive = filters.statusFilters[status.key];
          return (
            <button
              key={status.key}
              type="button"
              onClick={() => toggleStatus(status.key)}
              className={`h-7 border px-2 text-xs font-bold ${
                isActive
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-slate-200 bg-white text-slate-400'
              }`}
              aria-pressed={isActive}
            >
              {status.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          到期範圍
          <select
            value={filters.dueWithinDays ?? ''}
            onChange={(event) => onChange({
              dueWithinDays: event.target.value === '' ? null : Number(event.target.value),
            })}
            className="h-9 border border-slate-200 bg-white px-2 text-sm font-normal text-slate-700 outline-none focus:border-primary"
          >
            <option value="">不限</option>
            <option value="7">7 天內</option>
            <option value="14">14 天內</option>
            <option value="30">30 天內</option>
            <option value="90">90 天內</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
          關鍵字
          <span className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.keyword}
              onChange={(event) => onChange({ keyword: event.target.value })}
              className="h-9 w-full border border-slate-200 bg-white pl-7 pr-2 text-sm font-normal text-slate-700 outline-none focus:border-primary"
              placeholder="任務名稱"
            />
          </span>
        </label>
      </div>
      <div>
        <div className="mb-1 text-xs font-bold text-slate-500">標籤</div>
        {tags.length === 0 ? (
          <div className="text-xs text-slate-400">目前沒有可用標籤</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const isActive = filters.selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`h-7 max-w-full border px-2 text-xs font-bold ${
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="block max-w-[9rem] truncate">{tag.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const CalendarSubscriptionBuilderPreview: React.FC<Props> = ({
  boards,
  dateTypes,
  selectedAssigneeIds,
  onPayloadChange,
}) => {
  const nodes = useWbsStore((state) => state.nodes);
  const [globalFilter, setGlobalFilter] = useState<TaskFilterState>(() => createCalendarDefaultTaskFilters());
  const [boardOverrides, setBoardOverrides] = useState<Record<string, BoardOverrideDraft>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBoardId && boards[0]) setSelectedBoardId(boards[0].id);
  }, [boards, selectedBoardId]);

  const boardById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards]);
  const enabledBoards = useMemo(
    () => boards.filter((board) => boardOverrides[board.id]?.enabled !== false),
    [boardOverrides, boards],
  );

  const buildEffectiveFilter = (boardId: string): TaskFilterState | null => {
    const override = boardOverrides[boardId];
    if (override?.enabled === false) return null;
    const base = override?.useCustomFilter ? override.filters : globalFilter;
    return normalizeTaskFilters({
      ...base,
      selectedAssigneeIds,
    });
  };

  const previewTasks = useMemo<PreviewTask[]>(() => {
    if (dateTypes.length === 0) return [];
    return Object.values(nodes)
      .filter((node): node is TaskNode => Boolean(node && !node.isArchived))
      .flatMap((node) => {
        const board = boardById.get(node.boardId);
        if (!board) return [];
        if (!hasTaskCalendarDate(node, dateTypes)) return [];
        const effectiveFilter = buildEffectiveFilter(node.boardId);
        if (!effectiveFilter || !matchesTaskFilters(node, effectiveFilter)) return [];
        return [{ node, board }];
      })
      .sort((a, b) => {
        const byBoard = a.board.path.localeCompare(b.board.path, 'zh-TW');
        if (byBoard !== 0) return byBoard;
        return (a.node.endDate || a.node.startDate || '').localeCompare(b.node.endDate || b.node.startDate || '');
      });
  }, [boardById, boardOverrides, dateTypes, globalFilter, nodes, selectedAssigneeIds]);

  const groupedPreview = useMemo(() => {
    const groups = new Map<string, { board: CalendarSubscriptionBuilderBoard; tasks: PreviewTask[] }>();
    previewTasks.forEach((task) => {
      const current = groups.get(task.board.id) ?? { board: task.board, tasks: [] };
      current.tasks.push(task);
      groups.set(task.board.id, current);
    });
    return Array.from(groups.values());
  }, [previewTasks]);

  const payload = useMemo<CalendarSubscriptionBuilderPayload>(() => {
    const normalizedGlobalFilter = normalizeTaskFilters({
      ...globalFilter,
      selectedAssigneeIds,
    });
    const normalizedOverrides = Object.fromEntries(
      Object.entries(boardOverrides)
        .flatMap(([boardId, override]) => {
          if (override.enabled === false) return [[boardId, { enabled: false }]];
          if (!override.useCustomFilter) return [];
          const filters = normalizeTaskFilters({
            ...override.filters,
            selectedAssigneeIds,
          });
          if (areFiltersEqual(filters, normalizedGlobalFilter)) return [];
          return [[boardId, { ...filters, enabled: true }]];
        }),
    );
    return {
      version: 2,
      v2_scope_type: 'all_accessible_boards_snapshot',
      workspace_ids: Array.from(new Set(enabledBoards.map((board) => board.workspaceId))),
      project_ids: enabledBoards.map((board) => board.id),
      global_filter: normalizedGlobalFilter,
      board_overrides: normalizedOverrides,
      date_types: dateTypes,
    };
  }, [boardOverrides, dateTypes, enabledBoards, globalFilter, selectedAssigneeIds]);

  useEffect(() => {
    onPayloadChange?.(payload);
  }, [onPayloadChange, payload]);

  const selectedBoard = selectedBoardId ? boardById.get(selectedBoardId) : undefined;
  const selectedOverride = selectedBoard ? boardOverrides[selectedBoard.id] : undefined;
  const selectedBoardFilter = selectedOverride?.filters ?? globalFilter;
  const outputSummary = `這條連結會輸出 ${payload.workspace_ids.length} 個工作區 / ${payload.project_ids.length} 張看板中的 ${previewTasks.length} 個任務。`;

  const updateGlobalFilter = (updates: Partial<TaskFilterState>) => {
    setGlobalFilter((current) => normalizeTaskFilters({ ...current, ...updates }));
  };

  const updateSelectedBoardOverride = (updates: Partial<BoardOverrideDraft>) => {
    if (!selectedBoard) return;
    setBoardOverrides((current) => {
      const existing = current[selectedBoard.id] ?? {
        enabled: true,
        useCustomFilter: false,
        filters: globalFilter,
      };
      return {
        ...current,
        [selectedBoard.id]: {
          ...existing,
          ...updates,
          filters: updates.filters ? normalizeTaskFilters(updates.filters) : existing.filters,
        },
      };
    });
  };

  return (
    <section
      className="mt-4 space-y-4 border border-primary/20 bg-primary/5 p-3"
      data-calendar-subscription-builder="true"
      data-calendar-subscription-builder-preview-count={previewTasks.length}
      data-calendar-subscription-builder-board-count={payload.project_ids.length}
    >
      <div className="flex items-start gap-2">
        <Filter size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">建立行事曆訂閱</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            像篩選任務一樣調整條件，預覽確認後產生一條只讀行事曆連結。
          </p>
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-3">
        <ConditionControls title="全域條件" filters={globalFilter} onChange={updateGlobalFilter} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-bold text-slate-500">看板條件</div>
          <div className="max-h-56 space-y-1 overflow-auto pr-1">
            {boards.length === 0 ? (
              <div className="text-sm text-slate-400">目前沒有可讀取看板。</div>
            ) : (
              boards.map((board) => {
                const isSelected = selectedBoardId === board.id;
                const modeLabel = getBoardModeLabel(boardOverrides[board.id]);
                return (
                  <button
                    key={`${board.workspaceId}:${board.id}`}
                    type="button"
                    onClick={() => setSelectedBoardId(board.id)}
                    className={`flex w-full items-center justify-between gap-2 border px-2 py-2 text-left text-sm ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{board.boardTitle}</span>
                      <span className="block truncate text-xs text-slate-500">{board.workspaceTitle}</span>
                    </span>
                    <span className="shrink-0 border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-500">
                      {modeLabel}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-3">
          {selectedBoard ? (
            <div className="space-y-3" data-calendar-subscription-board-override="true">
              <div>
                <div className="text-xs font-bold text-slate-500">目前看板</div>
                <div className="mt-1 truncate text-sm font-bold text-slate-900">{selectedBoard.path}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateSelectedBoardOverride({ enabled: true, useCustomFilter: false })}
                  className={`inline-flex h-9 items-center justify-center gap-1 border px-2 text-xs font-bold ${
                    selectedOverride?.enabled !== false && !selectedOverride?.useCustomFilter
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Check size={13} />
                  沿用
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedBoardOverride({
                    enabled: true,
                    useCustomFilter: true,
                    filters: selectedOverride?.filters ?? globalFilter,
                  })}
                  className={`inline-flex h-9 items-center justify-center gap-1 border px-2 text-xs font-bold ${
                    selectedOverride?.enabled !== false && selectedOverride?.useCustomFilter
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Filter size={13} />
                  自訂
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedBoardOverride({ enabled: false })}
                  className={`inline-flex h-9 items-center justify-center gap-1 border px-2 text-xs font-bold ${
                    selectedOverride?.enabled === false
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Ban size={13} />
                  排除
                </button>
              </div>
              {selectedOverride?.enabled === false ? (
                <div className="border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                  這張看板不會出現在預覽摘要或輸出的訂閱範圍。
                </div>
              ) : selectedOverride?.useCustomFilter ? (
                <ConditionControls
                  title="此看板自訂條件"
                  filters={selectedBoardFilter}
                  onChange={(updates) => updateSelectedBoardOverride({
                    enabled: true,
                    useCustomFilter: true,
                    filters: normalizeTaskFilters({ ...selectedBoardFilter, ...updates }),
                  })}
                />
              ) : (
                <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  這張看板沿用全域條件。
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400">請選擇看板。</div>
          )}
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-3" data-calendar-subscription-live-preview="true">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <Eye size={15} className="text-primary" />
            即時預覽
          </div>
          <button
            type="button"
            onClick={() => {
              setGlobalFilter(createCalendarDefaultTaskFilters());
              setBoardOverrides({});
            }}
            className="inline-flex h-8 items-center gap-1 border border-slate-200 bg-white px-2 text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            <RotateCcw size={13} />
            重設
          </button>
        </div>
        <div className="border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-slate-700">
          {outputSummary}
        </div>
        <div className="mt-2 text-xs leading-5 text-amber-700">
          任何持有此連結的人都能讀取連結中的事件內容；請只輸出必要任務。
        </div>
        {dateTypes.length === 0 ? (
          <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            請至少選擇一種日期類型，預覽才會產生事件。
          </div>
        ) : previewTasks.length === 0 ? (
          <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            目前沒有符合條件且具備所選日期的任務。
          </div>
        ) : (
          <div className="mt-3 max-h-72 space-y-3 overflow-auto pr-1">
            {groupedPreview.slice(0, 8).map((group) => (
              <div key={group.board.id}>
                <div className="mb-1 truncate text-xs font-bold text-slate-500">{group.board.path}</div>
                <div className="space-y-1">
                  {group.tasks.slice(0, 6).map(({ node }) => (
                    <div key={node.id} className="border border-slate-100 bg-slate-50 px-2 py-2 text-sm">
                      <div className="truncate font-bold text-slate-800">{node.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{node.status}</span>
                        {node.startDate && <span>開始 {node.startDate}</span>}
                        {node.endDate && <span>到期 {node.endDate}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {previewTasks.length > 48 && (
              <div className="text-xs text-slate-400">僅顯示前 48 筆，完整輸出仍依篩選條件計算。</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default CalendarSubscriptionBuilderPreview;
