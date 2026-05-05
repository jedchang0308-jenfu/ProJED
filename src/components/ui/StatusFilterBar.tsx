import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, ChevronDown, GitBranch } from 'lucide-react';
import useBoardStore from '../../store/useBoardStore';
import type { TaskStatus } from '../../types';

// ── 任務狀態定義（單一真相來源）────────────────────────────
const STATUS_CONFIG: { key: TaskStatus; label: string; color: string }[] = [
    { key: 'todo',        label: '待辦',   color: 'bg-status-todo' },
    { key: 'in_progress', label: '進行中', color: 'bg-blue-500' },
    { key: 'delayed',     label: '延遲',   color: 'bg-status-delayed' },
    { key: 'completed',   label: '完成',   color: 'bg-status-completed' },
    { key: 'unsure',      label: '未定', color: 'bg-status-unsure' },
    { key: 'onhold',      label: '暫緩',   color: 'bg-status-onhold' },
];

// ── 主元件 ─────────────────────────────────────────────────
export const StatusFilterBar: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // 從全域 Store 取出所有狀態與方法
    const statusFilters     = useBoardStore(s => s.statusFilters);
    const toggleStatusFilter = useBoardStore(s => s.toggleStatusFilter);
    const showDependencies  = useBoardStore(s => s.showDependencies);
    const toggleDependencies = useBoardStore(s => s.toggleDependencies);
    const showStartDate     = useBoardStore(s => s.showStartDate);
    const toggleStartDate   = useBoardStore(s => s.toggleStartDate);

    // 點選面板外部時自動關閉
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // 計算目前有多少過濾項目被「關閉」（作為 badge 數量提示）
    const hiddenStatusCount = STATUS_CONFIG.filter(s => !statusFilters[s.key]).length;
    const hasActiveFilter = hiddenStatusCount > 0 || !showDependencies;

    return (
        <div className="relative">
            {/* ── 觸發按鈕 ── */}
            <button
                ref={triggerRef}
                id="filter-menu-trigger"
                onClick={() => setIsOpen(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    isOpen
                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                        : hasActiveFilter
                            ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                }`}
            >
                <SlidersHorizontal size={13} />
                <span>過濾器</span>
                {hasActiveFilter && hiddenStatusCount > 0 && (
                    <span className="bg-amber-400 text-white text-[9px] font-black px-1 rounded-full leading-none py-0.5">
                        {hiddenStatusCount}
                    </span>
                )}
                <ChevronDown size={11} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* ── 下拉面板 ── */}
            {isOpen && (
                <div
                    ref={panelRef}
                    className="absolute left-0 top-[calc(100%+6px)] z-[200] w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    {/* ── 區塊 1：任務狀態 ── */}
                    <div className="px-3 pt-3 pb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">任務狀態</p>
                        <div className="flex flex-wrap gap-1.5">
                            {STATUS_CONFIG.map(s => {
                                const isActive = statusFilters[s.key];
                                return (
                                    <button
                                        key={s.key}
                                        onClick={() => toggleStatusFilter(s.key)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${
                                            isActive
                                                ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                                                : 'bg-slate-50 border-transparent text-slate-300 line-through opacity-60'
                                        }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color} ${!isActive ? 'opacity-30' : ''}`} />
                                        {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-px bg-slate-100 mx-3" />

                    {/* ── 區塊 2：UI 顯示 ── */}
                    <div className="px-3 pt-2 pb-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">UI 顯示</p>

                        {/* 依賴線開關 */}
                        <button
                            onClick={toggleDependencies}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all mb-1.5 ${
                                showDependencies
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : 'bg-slate-50 border-transparent text-slate-400'
                            }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <GitBranch size={12} />
                                <span>依賴連線</span>
                            </div>
                            {/* Toggle 指示燈 */}
                            <div className={`w-7 h-4 rounded-full transition-colors relative ${showDependencies ? 'bg-amber-400' : 'bg-slate-200'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${showDependencies ? 'left-3.5' : 'left-0.5'}`} />
                            </div>
                        </button>

                        {/* 開始日期開關 */}
                        <button
                            onClick={toggleStartDate}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all mb-1.5 ${
                                showStartDate
                                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                                    : 'bg-slate-50 border-transparent text-slate-400'
                            }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                <span>開始日期</span>
                            </div>
                            {/* Toggle 指示燈 */}
                            <div className={`w-7 h-4 rounded-full transition-colors relative ${showStartDate ? 'bg-amber-400' : 'bg-slate-200'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${showStartDate ? 'left-3.5' : 'left-0.5'}`} />
                            </div>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
