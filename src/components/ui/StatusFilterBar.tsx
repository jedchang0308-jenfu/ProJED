import React, { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';
import useBoardStore from '../../store/useBoardStore';
import { useTaskFilterStore } from '../../store/useTaskFilterStore';
import { useMemberStore } from '../../store/useMemberStore';
import { useWbsStore } from '../../store/useWbsStore';
import { useTagStore } from '../../store/useTagStore';
import { countActiveTaskFilters, createBoardAssigneeFilterOptions } from '../../features/taskFilters';
import TaskConditionFilterControls from './TaskConditionFilterControls';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import { cn } from '../../utils/cn';
import { getTaskFilterTriggerClass, getTaskFilterChoiceClass } from './taskConditionFilterStyles';

const FILTER_PANEL_WIDTH = 288;
const FILTER_PANEL_GUTTER = 8;

type FilterPanelPosition = { left: number; top: number; maxHeight: number };

const getFilterPanelPosition = (trigger: HTMLButtonElement): FilterPanelPosition => {
  const rect = trigger.getBoundingClientRect();
  const navBottom = trigger.closest('nav')?.getBoundingClientRect().bottom ?? 0;
  const maxLeft = Math.max(FILTER_PANEL_GUTTER, window.innerWidth - FILTER_PANEL_WIDTH - FILTER_PANEL_GUTTER);
  const left = Math.min(Math.max(rect.left, FILTER_PANEL_GUTTER), maxLeft);
  const top = Math.max(rect.bottom + 4, navBottom + 4);
  return { left, top, maxHeight: Math.max(160, window.innerHeight - top - FILTER_PANEL_GUTTER) };
};

type StatusFilterBarProps = {
  compactLabel?: boolean;
  pendingUpdateCount?: number;
  onApplyPendingUpdate?: () => void;
};

export const StatusFilterBar: React.FC<StatusFilterBarProps> = ({
  pendingUpdateCount = 0,
  onApplyPendingUpdate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<FilterPanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeWorkspaceId = useBoardStore(s => s.activeWorkspaceId);
  const showDependencies = useBoardStore(s => s.showDependencies);
  const toggleDependencies = useBoardStore(s => s.toggleDependencies);
  const showStartDate = useBoardStore(s => s.showStartDate);
  const toggleStartDate = useBoardStore(s => s.toggleStartDate);
  const showTags = useBoardStore(s => s.showTags);
  const toggleTags = useBoardStore(s => s.toggleTags);
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const filters = useTaskFilterStore(s => s.filters);
  const setQuery = useTaskFilterStore(s => s.setQuery);
  const clearAssigneeFilters = useTaskFilterStore(s => s.clearAssigneeFilters);
  const clearTagFilters = useTaskFilterStore(s => s.clearTagFilters);
  const resetFilters = useTaskFilterStore(s => s.resetFilters);
  const retrySync = useTaskFilterStore(s => s.retrySync);
  const syncStatus = useTaskFilterStore(s => s.syncStatus);
  const syncWarning = useTaskFilterStore(s => s.warning);
  const hydrationStatus = useTaskFilterStore(s => s.hydrationStatus);
  const nodes = useWbsStore(s => s.nodes);
  const { canEditTask } = useBoardPermissions();
  const workspaceMembers = useMemberStore(s => s.workspaceMembers);
  const boardMembers = useMemberStore(s => s.boardMembers);
  const tags = useTagStore(s => s.tags);
  const createTag = useTagStore(s => s.createTag);
  const assigneeOptions = React.useMemo(
    () => createBoardAssigneeFilterOptions(activeBoardId, boardMembers, nodes, workspaceMembers),
    [activeBoardId, boardMembers, nodes, workspaceMembers],
  );
  const activeFilterCount = countActiveTaskFilters(filters);
  const hasActiveFilter = activeFilterCount > 0;
  const hasPendingUpdate = pendingUpdateCount > 0;
  const hasSyncFailure = syncStatus === 'sync-error';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const updatePanelPosition = () => {
      if (triggerRef.current) setPanelPosition(getFilterPanelPosition(triggerRef.current));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    };
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isOpen]);

  const handleCreateTag = async () => {
    if (!canEditTask || !activeWorkspaceId) return;
    const name = window.prompt('請輸入新標籤名稱')?.trim();
    if (name) await createTag(activeWorkspaceId, name);
  };

  const openPanel = () => {
    if (triggerRef.current) setPanelPosition(getFilterPanelPosition(triggerRef.current));
    setIsOpen(value => !value);
  };

  return (
    <div className={cn('relative', isOpen ? 'z-[10000]' : 'z-10')}>
      <div
        className={cn(
          'inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors',
          isOpen || hasActiveFilter || hasPendingUpdate
            ? hasActiveFilter
              ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200/80'
              : 'border-primary-400 bg-primary-50/70 text-primary-700 ring-2 ring-primary-200/70'
            : 'border-slate-300 bg-white text-slate-600 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700',
        )}
        data-task-filter-control-group="true"
        data-task-filter-control-pending={hasPendingUpdate ? 'true' : 'false'}
        data-task-filter-sync-error={hasSyncFailure ? 'true' : 'false'}
      >
        <button
          ref={triggerRef}
          id="filter-menu-trigger"
          type="button"
          aria-label={hasActiveFilter ? `過濾器已啟用（${activeFilterCount} 項）` : '過濾器'}
          title="過濾器"
          onClick={openPanel}
          className={cn(
            'inline-flex h-full min-w-8 shrink-0 items-center justify-center gap-1 border-0 px-1.5 text-inherit transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45',
            getTaskFilterTriggerClass(hasActiveFilter, isOpen),
          )}
          data-active-task-filter-count={activeFilterCount}
          data-task-filter-active={hasActiveFilter ? 'true' : 'false'}
        >
          <SlidersHorizontal size={13} />
          {hasActiveFilter ? <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-white px-1 py-0.5 text-[10px] font-bold leading-none text-primary-700" aria-hidden="true">{activeFilterCount > 99 ? '99+' : activeFilterCount}</span> : null}
        </button>
        {hasPendingUpdate ? (
          <button
            type="button"
            onClick={onApplyPendingUpdate}
            className="inline-flex h-full min-w-8 items-center justify-center gap-1 border-0 border-l border-primary/25 bg-primary/[0.07] px-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            title={'更新篩選結果（' + pendingUpdateCount + '）'}
            aria-label={'更新篩選結果（' + pendingUpdateCount + '）'}
          >
            <RefreshCw size={13} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">更新</span>
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-white" data-task-filter-update-count="true">
              {pendingUpdateCount > 99 ? '99+' : pendingUpdateCount}
            </span>
          </button>
        ) : null}
        {hasSyncFailure ? (
          <button
            type="button"
            onClick={() => void retrySync()}
            className="inline-flex h-full w-8 items-center justify-center border-0 border-l border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            title={syncWarning || '重新同步篩選偏好'}
            aria-label={syncWarning || '重新同步篩選偏好'}
          >
            <span aria-hidden="true">!</span>
          </button>
        ) : null}
      </div>

      {isOpen && panelPosition && createPortal(
        <div
          ref={panelRef}
          data-filter-menu-panel
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          className="fixed z-[10000] w-72 overflow-y-auto overscroll-contain rounded-xl border border-primary-200/90 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.16)] animate-in fade-in duration-150"
          style={{ left: panelPosition.left, top: panelPosition.top, maxHeight: panelPosition.maxHeight }}
        >
          <div className="flex items-center justify-between border-b border-primary-100 bg-primary-50/70 px-3 py-2.5">
            <span className="text-xs font-bold text-slate-700">篩選條件</span>
            <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold', hasActiveFilter ? 'bg-primary-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200')}>
              {hasActiveFilter ? `${activeFilterCount} 項啟用` : '未啟用'}
            </span>
          </div>
          <div className="px-3 py-3">
            <TaskConditionFilterControls
              value={filters}
              assigneeOptions={assigneeOptions}
              tags={tags.map(tag => ({ id: tag.id, name: tag.name }))}
              onChange={setQuery}
              onClearPeople={clearAssigneeFilters}
              onClearTags={clearTagFilters}
              disabled={hydrationStatus === 'hydrating'}
              tagActions={(
                <button
                  type="button"
                  onClick={() => void handleCreateTag()}
                  disabled={!activeWorkspaceId || !canEditTask || hydrationStatus === 'hydrating'}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  <Plus size={11} />
                  新增標籤
                </button>
              )}
            />
          </div>

          <div className="border-t border-slate-200/80 px-3 py-3" data-task-display-settings="true">
            <p className="mb-2 text-[11px] font-semibold leading-4 text-slate-500">介面顯示</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleDependencies} className={getTaskFilterChoiceClass(showDependencies)} aria-pressed={showDependencies}>
                依賴連線
              </button>
              <button type="button" onClick={toggleStartDate} className={getTaskFilterChoiceClass(showStartDate)} aria-pressed={showStartDate}>
                開始日期
              </button>
              <button type="button" onClick={toggleTags} className={getTaskFilterChoiceClass(showTags)} aria-pressed={showTags}>
                標籤
              </button>
            </div>
          </div>

          {hasActiveFilter ? (
            <div className="border-t border-slate-200/80 px-3 py-3">
              <button
                type="button"
                onClick={resetFilters}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                data-task-filter-reset="true"
              >
                清除全部篩選
              </button>
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default StatusFilterBar;
