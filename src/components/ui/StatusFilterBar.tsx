import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, GitBranch, Plus, SlidersHorizontal, Tag, UserRound } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import { useMemberStore } from '../../store/useMemberStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useTagStore } from '../../store/useTagStore';
import {
  createBoardAssigneeFilterOptions,
  countActiveTaskFilters,
  TASK_STATUS_OPTIONS,
  UNASSIGNED_ASSIGNEE_FILTER,
} from '../../features/taskFilters';
import { getTagDotStyle } from '../../utils/tags';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { compactClassNames } from './compactTokens';

const filterPillClass = (active: boolean) =>
  `flex h-[26px] items-center gap-1.5 rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all ${
    active
      ? 'border-primary/40 bg-primary/5 text-primary ring-2 ring-primary/20'
      : 'border-slate-200 hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
  }`;

const FILTER_PANEL_WIDTH = 288;
const FILTER_PANEL_GUTTER = 8;

type FilterPanelPosition = {
  left: number;
  top: number;
  maxHeight: number;
};

const getFilterPanelPosition = (trigger: HTMLButtonElement): FilterPanelPosition => {
  const rect = trigger.getBoundingClientRect();
  const navBottom = trigger.closest('nav')?.getBoundingClientRect().bottom ?? 0;
  const maxLeft = Math.max(FILTER_PANEL_GUTTER, window.innerWidth - FILTER_PANEL_WIDTH - FILTER_PANEL_GUTTER);
  const left = Math.min(Math.max(rect.left, FILTER_PANEL_GUTTER), maxLeft);
  const top = Math.max(rect.bottom + 4, navBottom + 4);

  return {
    left,
    top,
    maxHeight: Math.max(160, window.innerHeight - top - FILTER_PANEL_GUTTER),
  };
};

type StatusFilterBarProps = {
  compactLabel?: boolean;
};

export const StatusFilterBar: React.FC<StatusFilterBarProps> = ({ compactLabel = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<FilterPanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const statusFilters = useBoardStore(s => s.statusFilters);
  const toggleStatusFilter = useBoardStore(s => s.toggleStatusFilter);
  const showDependencies = useBoardStore(s => s.showDependencies);
  const toggleDependencies = useBoardStore(s => s.toggleDependencies);
  const showStartDate = useBoardStore(s => s.showStartDate);
  const toggleStartDate = useBoardStore(s => s.toggleStartDate);
  const showTags = useBoardStore(s => s.showTags);
  const toggleTags = useBoardStore(s => s.toggleTags);
  const dueWithinDays = useBoardStore(s => s.dueWithinDays);
  const setDueWithinDays = useBoardStore(s => s.setDueWithinDays);
  const selectedAssigneeIds = useBoardStore(s => s.selectedAssigneeIds);
  const toggleAssigneeFilter = useBoardStore(s => s.toggleAssigneeFilter);
  const clearAssigneeFilters = useBoardStore(s => s.clearAssigneeFilters);
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const nodes = useWbsStore(s => s.nodes);
  const { canEditTask } = useBoardPermissions();
  const boardMembers = useMemberStore(s => s.boardMembers);

  const tags = useTagStore(s => s.tags);
  const selectedTagIds = useTagStore(s => s.selectedTagIds);
  const createTag = useTagStore(s => s.createTag);
  const toggleTagFilter = useTagStore(s => s.toggleTagFilter);
  const clearTagFilters = useTagStore(s => s.clearTagFilters);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePanelPosition = () => {
      if (!triggerRef.current) return;
      setPanelPosition(getFilterPanelPosition(triggerRef.current));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setIsOpen(false);
    };

    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen]);

  const selectedTagSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const selectedAssigneeSet = useMemo(() => new Set(selectedAssigneeIds), [selectedAssigneeIds]);
  const assigneeOptions = useMemo(
    () => createBoardAssigneeFilterOptions(activeBoardId, boardMembers, nodes),
    [activeBoardId, boardMembers, nodes]
  );
  const activeTagCount = selectedTagIds.length;
  const activeAssigneeCount = selectedAssigneeIds.length;
  const hasDueFilter = dueWithinDays !== null && dueWithinDays !== undefined;
  const activeFilterCount = countActiveTaskFilters({
    statusFilters,
    dueWithinDays,
    selectedAssigneeIds,
    selectedTagIds,
    keyword: '',
  });
  const hasActiveFilter = activeFilterCount > 0;

  const handleDueDaysChange = (value: string) => {
    if (value === '') {
      setDueWithinDays(null);
      return;
    }

    const nextDays = Number(value);
    if (Number.isFinite(nextDays)) {
      setDueWithinDays(nextDays);
    }
  };

  const handleCreateTag = async () => {
    if (!canEditTask) return;
    if (!activeWorkspaceId) return;
    const name = window.prompt('請輸入新標籤名稱');
    const trimmed = name?.trim();
    if (!trimmed) return;
    await createTag(activeWorkspaceId, trimmed);
  };

  const handleFilterToggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (triggerRef.current) {
      setPanelPosition(getFilterPanelPosition(triggerRef.current));
    }
    setIsOpen(true);
  };

  return (
    <div className={`relative ${isOpen ? 'z-[10000]' : 'z-10'}`}>
      <button
        ref={triggerRef}
        id="filter-menu-trigger"
        type="button"
        aria-label="過濾器"
        onClick={handleFilterToggle}
        className={`${compactClassNames.segmentedButtonBase} border ${
          isOpen
            ? 'border-primary/35 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
            : hasActiveFilter
              ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200/70'
              : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-primary/25 hover:bg-primary/5 hover:text-primary'
        }`}
        data-active-task-filter-count={activeFilterCount}
      >
        <SlidersHorizontal size={13} />
        <span className={compactLabel ? 'hidden sm:inline' : undefined}>過濾器</span>
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-amber-400 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && panelPosition && createPortal(
        <div
          ref={panelRef}
          data-filter-menu-panel
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          className="fixed z-[10000] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in duration-150"
          style={{
            left: panelPosition.left,
            top: panelPosition.top,
            maxHeight: panelPosition.maxHeight,
          }}
        >
          <div className="px-3 pt-2 pb-2">
            <p className="mb-2 text-[10px] font-semibold text-slate-500">任務狀態</p>
            <div className="flex flex-wrap gap-2">
              {TASK_STATUS_OPTIONS.map(status => {
                const isActive = statusFilters[status.key];
                return (
                  <button
                    key={status.key}
                    type="button"
                    onClick={() => toggleStatusFilter(status.key)}
                    className={filterPillClass(isActive)}
                    aria-pressed={isActive}
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${status.color}`} />
                    {status.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          <div className="px-3 pt-2 pb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-slate-500">到期日</p>
              {hasDueFilter && (
                <button
                  type="button"
                  onClick={() => setDueWithinDays(null)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                >
                  清除
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDueWithinDays(hasDueFilter ? null : 7)}
                className={filterPillClass(hasDueFilter)}
                aria-pressed={hasDueFilter}
              >
                <CalendarDays size={12} className="text-amber-600" />
                到期日
              </button>

              <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={dueWithinDays ?? ''}
                  onChange={event => handleDueDaysChange(event.target.value)}
                  placeholder="天數"
                  className="w-12 bg-transparent text-right text-[11px] font-semibold text-slate-700 outline-none placeholder:text-slate-300"
                  aria-label="到期天數"
                />
                <span>天內</span>
              </label>
            </div>
          </div>

          <div className="px-3 pt-2 pb-3" data-task-display-settings="true">
            <p className="mb-2 text-[10px] font-semibold text-slate-500">介面顯示</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleDependencies}
                className={filterPillClass(showDependencies)}
                aria-pressed={showDependencies}
              >
                <GitBranch size={12} className="text-amber-600" />
                依賴連線
              </button>

              <button
                type="button"
                onClick={toggleStartDate}
                className={filterPillClass(showStartDate)}
                aria-pressed={showStartDate}
              >
                <CalendarDays size={12} className="text-amber-600" />
                開始日期
              </button>

              <button
                type="button"
                onClick={toggleTags}
                className={filterPillClass(showTags)}
                aria-pressed={showTags}
              >
                <Tag size={12} className="text-amber-600" />
                標籤
              </button>
            </div>
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          <div className="px-3 pt-2 pb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-slate-500">標籤</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateTag}
                  disabled={!activeWorkspaceId || !canEditTask}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  <Plus size={11} />
                  新增標籤
                </button>
                {activeTagCount > 0 && (
                  <button
                    type="button"
                    onClick={clearTagFilters}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            {tags.length === 0 ? (
                <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">
                <Tag size={12} />
                尚未建立標籤
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => {
                  const isActive = selectedTagSet.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTagFilter(tag.id)}
                      className={filterPillClass(isActive)}
                      aria-pressed={isActive}
                    >
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${getTagDotStyle(tag.color)}`} />
                      <span className="max-w-[7rem] truncate">{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mx-3 h-px bg-slate-100" />

          <div className="px-3 pt-2 pb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-slate-500">負責人</p>
              {activeAssigneeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAssigneeFilters}
                  className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                >
                  清除
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleAssigneeFilter(UNASSIGNED_ASSIGNEE_FILTER)}
                className={filterPillClass(selectedAssigneeSet.has(UNASSIGNED_ASSIGNEE_FILTER))}
                aria-pressed={selectedAssigneeSet.has(UNASSIGNED_ASSIGNEE_FILTER)}
              >
                <UserRound size={12} className="text-slate-500" />
                未指派
              </button>
              {assigneeOptions.length === 0 ? (
                <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-400 shadow-sm">
                  <UserRound size={12} />
                  尚無看板成員
                </div>
              ) : (
                assigneeOptions.map(member => {
                  const isActive = selectedAssigneeSet.has(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleAssigneeFilter(member.id)}
                      className={filterPillClass(isActive)}
                      aria-pressed={isActive}
                    >
                      <UserRound size={12} className="text-blue-600" />
                      <span className="max-w-[7rem] truncate">{member.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
