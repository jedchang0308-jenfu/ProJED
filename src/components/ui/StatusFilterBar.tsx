import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, GitBranch, Plus, SlidersHorizontal, Tag } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import { useTagStore } from '../../store/useTagStore';
import type { TaskStatus } from '../../types';
import { getTagDotStyle } from '../../utils/tags';

const STATUS_CONFIG: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'todo', label: '待辦', color: 'bg-status-todo' },
  { key: 'in_progress', label: '進行中', color: 'bg-blue-500' },
  { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
  { key: 'completed', label: '完成', color: 'bg-status-completed' },
  { key: 'unsure', label: '未定', color: 'bg-status-unsure' },
  { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
];

const filterPillClass = (active: boolean) =>
  `flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-all ${
    active
      ? 'border-primary ring-2 ring-primary/35 shadow-primary/10'
      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
  }`;

export const StatusFilterBar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedTagSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const hiddenStatusCount = STATUS_CONFIG.filter(status => !statusFilters[status.key]).length;
  const activeTagCount = selectedTagIds.length;
  const hasActiveFilter = hiddenStatusCount > 0 || activeTagCount > 0 || !showDependencies || !showTags;
  const activeFilterCount = hiddenStatusCount + activeTagCount;

  const handleCreateTag = async () => {
    if (!activeWorkspaceId) return;
    const name = window.prompt('請輸入新標籤名稱');
    const trimmed = name?.trim();
    if (!trimmed) return;
    await createTag(activeWorkspaceId, trimmed);
  };

  return (
    <div className={`relative ${isOpen ? 'z-[10000]' : 'z-10'}`}>
      <button
        ref={triggerRef}
        id="filter-menu-trigger"
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
          isOpen
            ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
            : hasActiveFilter
              ? 'border-amber-200 bg-amber-50 text-amber-600 shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal size={13} />
        <span>過濾器</span>
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-amber-400 px-1 py-0.5 text-[9px] font-black leading-none text-white">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          onClick={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
          className="absolute left-0 top-[calc(100%+6px)] z-[10000] w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="px-3 pt-3 pb-2">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">任務狀態</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_CONFIG.map(status => {
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
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">UI 顯示</p>
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
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">標籤</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateTag}
                  disabled={!activeWorkspaceId}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  <Plus size={11} />
                  新增標籤
                </button>
                {activeTagCount > 0 && (
                  <button
                    type="button"
                    onClick={clearTagFilters}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            {tags.length === 0 ? (
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
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
        </div>
      )}
    </div>
  );
};
