// @ts-nocheck
/**
 * CalendarView.jsx - 月曆模式元件
 *
 * 設計意圖 (Design Intent)：
 * 提供 Google Calendar 風格的月檢視，讓使用者以日曆格線直覺查看任務排程。
 *
 * 架構設計：
 * 1. 左側側邊欄：複用 GanttView 的任務層級面板模式
 * 2. 右側月曆主體：逐週渲染（Week-row based），每週分成兩層：
 *    - 底層 (grid)：7 個日期格，只放日期數字與背景色
 *    - 頂層 (absolute overlay)：任務條以絕對定位橫跨多欄，
 *      不被格線 border 切斷，完全仿 Google Calendar 行為
 * 3. 頂部工具列：狀態過濾器 + 月份導覽
 *
 * 跨日任務渲染演算法：
 *   - 將任務按週分割成「線段」(taskSegments)；若任務橫跨週邊界則在該週截斷
 *   - 每條線段在該週的 col (0-6) 起始、橫跨 span 欄
 *   - 以 left = col/7 * 100%、width = span/7 * 100% 精準定位
 *   - 同一天可能有多條任務，用 `lane` (行道) 做垂直堆疊
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useDialogStore from '../store/useDialogStore';
import dayjs from 'dayjs';
import {
    ChevronLeft, ChevronRight, ChevronDown, Calendar,
    PanelLeftClose, PanelLeftOpen, LayoutList
} from 'lucide-react';

// ── 常數 ─────────────────────────────────────────────────
const SIDEBAR_ROW_HEIGHT = 28;
// 每週最低高度（日期數字 + 任務條堆疊空間）
const WEEK_DATE_HEADER_H = 28; // px，日期數字列的高度
const TASK_LANE_H = 22;        // px，每條任務條的高度（含間距）
const TASK_LANE_GAP = 2;       // px，任務條間距
const MAX_VISIBLE_LANES = 3;   // 超過此數顯示「+N 更多」

// 狀態→樣式對照（靜態字典，確保 Tailwind 能掃描到）
const STATUS_STYLES = {
    todo: {
        bar: 'bg-status-todo/20 border-l-2 border-status-todo text-status-todo',
        dot: 'bg-status-todo',
    },
    delayed: {
        bar: 'bg-status-delayed/20 border-l-2 border-status-delayed text-status-delayed',
        dot: 'bg-status-delayed',
    },
    completed: {
        bar: 'bg-status-completed/20 border-l-2 border-status-completed text-status-completed',
        dot: 'bg-status-completed',
    },
    unsure: {
        bar: 'bg-status-unsure/20 border-l-2 border-status-unsure text-status-unsure',
        dot: 'bg-status-unsure',
    },
    onhold: {
        bar: 'bg-status-onhold/20 border-l-0 border border-status-onhold/40 text-status-onhold',
        dot: 'bg-status-onhold',
    },
};

import SharedTaskSidebar from './SharedTaskSidebar';

// ──────────────────────────────────────────────────────────
// 核心算法：將任務清單轉換為「按週分割的線段」
//
// 設計意圖：
// 每個任務可能橫跨多週。我們把它拆成若干個「週線段」，
// 每段記錄：所在週 (weekIndex)、在該週起始欄 (col)、橫跨欄數 (span)
// 以及在垂直方向的「車道」(lane)，用於多任務堆疊。
// ──────────────────────────────────────────────────────────
function buildWeekSegments(flattenedItems, weeks) {
    if (!weeks || weeks.length === 0) return [];

    // 建立日期→週index、日期→欄index的快速查找表
    const dateToWeekCol = {};
    weeks.forEach((week, wIdx) => {
        week.forEach((day, col) => {
            dateToWeekCol[day.dateStr] = { weekIdx: wIdx, col };
        });
    });

    // 取得格線最早和最晚日期
    const gridFirstDate = weeks[0][0].date;
    const gridLastDate = weeks[weeks.length - 1][6].date;

    const rawSegments = []; // 尚未分配 lane

    flattenedItems.forEach(item => {
        const start = item.startDate;
        const end = item.endDate;
        if (!start && !end) return;

        const startDay = dayjs(start || end).startOf('day');
        const endDay = dayjs(end || start).startOf('day');

        // 裁剪超出格線範圍的部分
        const effectiveStart = startDay.isBefore(gridFirstDate) ? gridFirstDate : startDay;
        const effectiveEnd = endDay.isAfter(gridLastDate) ? gridLastDate : endDay;
        if (effectiveStart.isAfter(effectiveEnd)) return;

        // 逐週切割
        weeks.forEach((week, wIdx) => {
            const weekStart = week[0].date;
            const weekEnd = week[6].date;

            // 任務在本週的有效範圍
            const segStart = effectiveStart.isAfter(weekStart) ? effectiveStart : weekStart;
            const segEnd = effectiveEnd.isBefore(weekEnd) ? effectiveEnd : weekEnd;
            if (segStart.isAfter(segEnd)) return;

            const colStart = segStart.day(); // 0=日
            const colEnd = segEnd.day();     // 0=日
            const span = colEnd - colStart + 1;

            // 標記此線段是否為整個任務的起始/結束
            const isTaskStart = segStart.isSame(startDay, 'day');
            const isTaskEnd = segEnd.isSame(endDay, 'day');
            const isSingleDay = startDay.isSame(endDay, 'day');

            rawSegments.push({
                item,
                weekIdx: wIdx,
                col: colStart,
                span,
                isTaskStart,
                isTaskEnd,
                isSingleDay,
            });
        });
    });

    // ── Lane 分配（每週獨立分配）────────────────────────
    // 設計意圖：在同一週內，若兩條線段的欄範圍重疊，則需分配到不同 lane，
    // 確保視覺上不互相覆蓋。
    const weekSegGroups = {}; // weekIdx → segments[]
    rawSegments.forEach(seg => {
        if (!weekSegGroups[seg.weekIdx]) weekSegGroups[seg.weekIdx] = [];
        weekSegGroups[seg.weekIdx].push(seg);
    });

    const finalSegments = [];
    Object.values(weekSegGroups).forEach(segs => {
        // 依欄起始排序，確保分配公平
        segs.sort((a, b) => a.col - b.col || a.item.id.localeCompare(b.item.id));

        // lanes[i] = 該 lane 的最後「佔用結束欄」
        const laneEndCols = [];
        segs.forEach(seg => {
            // 找到第一個可用的 lane（結束欄 < 當前 col）
            let lane = laneEndCols.findIndex(endCol => endCol < seg.col);
            if (lane === -1) {
                lane = laneEndCols.length; // 開新 lane
            }
            laneEndCols[lane] = seg.col + seg.span - 1;
            finalSegments.push({ ...seg, lane });
        });
    });

    return finalSegments;
}


const CalendarView = () => {
    const {
        activeBoardId,
        activeWorkspaceId,
        statusFilters,
        isSidebarOpen,
        setSidebarOpen,
        toggleStatusFilter,
        setView,
    } = useBoardStore();

    const [isTaskListOpen, setIsTaskListOpen] = useState(true);
    const [collapsedIds, setCollapsedIds] = useState(new Set());
    const [ganttFilters, setGanttFilters] = useState({ list: true, card: true, checklist: true });
    const [currentMonth, setCurrentMonth] = useState(dayjs().startOf('month'));
    const nodes = useWbsStore(s => s.nodes);

    const toggleCollapse = (id) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    // (workspaces 已不再需要)
    // (activeBoard 已不再需要)

    const statuses = [
        { key: 'todo', label: '待辦', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    // ── 資料扁平化（與 GanttView 一致）──────────────────
    const flattenedItems = useMemo(() => {
        if (!activeBoardId) return [];
        const items: any[] = [];
        
        Object.values(nodes).forEach((node: any) => {
            if (!node || node.isArchived || node.boardId !== activeBoardId) return;
            const status = node.status || 'todo';
            if (!statusFilters[status]) return;
            
            // Map nodeType to pseudoType for filters
            let pseudoType = 'checklist';
            if (node.nodeType === 'group') pseudoType = 'list';
            else pseudoType = 'card';
            
            if (pseudoType === 'list' && !ganttFilters.list) return;
            if (pseudoType === 'card' && !ganttFilters.card) return;
            if (pseudoType === 'checklist' && !ganttFilters.checklist) return;
            
            // Check visibility based on collapsible (parents must not be collapsed)
            let isVisible = true;
            let currentId = node.parentId;
            while(currentId) {
                if (collapsedIds.has(currentId)) {
                    isVisible = false;
                    break;
                }
                currentId = nodes[currentId]?.parentId;
            }
            if (!isVisible) return;
            
            items.push({
                ...node,
                type: pseudoType,
                startDate: node.startDate,
                endDate: node.endDate
            });
        });
        
        return items;
    }, [activeBoardId, nodes, ganttFilters, statusFilters, collapsedIds]);

    // ── 月曆週陣列：weeks[weekIdx][col(0-6)] = dayInfo ──
    const weeks = useMemo(() => {
        const startOfMonth = currentMonth.startOf('month');
        const startDayOfWeek = startOfMonth.day();
        const daysInMonth = currentMonth.daysInMonth();
        const gridStart = startOfMonth.subtract(startDayOfWeek, 'day');
        const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;
        const allDays = [];
        for (let i = 0; i < totalCells; i++) {
            const date = gridStart.add(i, 'day');
            allDays.push({
                date,
                dateStr: date.format('YYYY-MM-DD'),
                isCurrentMonth: date.month() === currentMonth.month(),
                isToday: date.isSame(dayjs(), 'day'),
                isWeekend: date.day() === 0 || date.day() === 6,
            });
        }
        // 按週分組
        const result = [];
        for (let i = 0; i < allDays.length; i += 7) {
            result.push(allDays.slice(i, i + 7));
        }
        return result;
    }, [currentMonth]);

    // ── 將任務轉換為週線段（核心重構）──────────────────
    const weekSegments = useMemo(() => buildWeekSegments(flattenedItems, weeks), [flattenedItems, weeks]);

    // 按週彙整線段（方便按週存取）
    const segsByWeek = useMemo(() => {
        const map = {};
        weekSegments.forEach(seg => {
            if (!map[seg.weekIdx]) map[seg.weekIdx] = [];
            map[seg.weekIdx].push(seg);
        });
        return map;
    }, [weekSegments]);

    // 計算每週需要的 lane 數（決定行高）
    const lanesPerWeek = useMemo(() => {
        const result = {};
        weekSegments.forEach(seg => {
            result[seg.weekIdx] = Math.max(result[seg.weekIdx] || 0, seg.lane + 1);
        });
        return result;
    }, [weekSegments]);

    // ── 事件處理 ──────────────────────────────────────────
    const handleItemClick = (item) => {
        // 切換到清單視圖，讓使用者在行內編輯此節點
        setView('list');
    };

    const goToPrevMonth = () => setCurrentMonth(prev => prev.subtract(1, 'month'));
    const goToNextMonth = () => setCurrentMonth(prev => prev.add(1, 'month'));
    const goToToday = () => setCurrentMonth(dayjs().startOf('month'));

    const weekDayNames = ['日', '一', '二', '三', '四', '五', '六'];

    // ── 渲染 ──────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* ── Toolbar ── */}
            <div
                className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0"
                style={{ zIndex: 110 }}
            >
                {/* 狀態篩選器 */}
                <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-2 mr-4 flex-1">
                    {statuses.map(s => (
                        <button
                            key={s.key}
                            onClick={() => toggleStatusFilter(s.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${statusFilters[s.key]
                                ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                                : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'}`}
                        >
                            <div className={`w-2 h-2 rounded-full ${s.color}`}></div>
                            <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* 月份導覽 + 控制 */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={goToPrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors" title="上個月">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold text-slate-700 min-w-[100px] text-center">
                            {currentMonth.format('YYYY 年 M 月')}
                        </span>
                        <button onClick={goToNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors" title="下個月">
                            <ChevronRight size={16} />
                        </button>
                        <button onClick={goToToday} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 hover:bg-primary/5 rounded-lg text-xs font-bold transition-all shadow-sm group" title="回到今天">
                            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
                            <span>今天</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg mr-2">
                            <button
                                onClick={() => setSidebarOpen(!isSidebarOpen)}
                                className={`p-1.5 rounded transition-all ${!isSidebarOpen ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                title={isSidebarOpen ? "收疊工作區選單" : "展開工作區選單"}
                            >
                                {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                            </button>
                            <button
                                onClick={() => setIsTaskListOpen(!isTaskListOpen)}
                                className={`p-1.5 rounded transition-all ${!isTaskListOpen ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                title={isTaskListOpen ? "收疊任務清單" : "展開任務清單"}
                            >
                                <LayoutList size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                            {Object.keys(ganttFilters).map(key => (
                                <button
                                    key={key}
                                    onClick={() => setGanttFilters(prev => ({ ...prev, [key]: !prev[key] }))}
                                    className={`px-2 py-1 text-[10px] font-bold rounded ${ganttFilters[key] ? 'bg-white text-slate-700 shadow-xs' : 'text-slate-400'}`}
                                >
                                    {key === 'list' ? '群組' : key === 'card' ? '任務' : '子項'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 主體 ── */}
            <div className="flex-1 flex overflow-hidden">
                {/* 左側側邊欄 */}
                {/* ── 左側：任務清單側邊欄（複用共用側邊欄，支援拖曳）── */}
                <SharedTaskSidebar
                    flattenedItems={flattenedItems}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    onItemClick={handleItemClick}
                    isTaskListOpen={isTaskListOpen}
                    setIsTaskListOpen={setIsTaskListOpen}
                    rowHeight={SIDEBAR_ROW_HEIGHT}
                />

                {/* 右側月曆主體 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* 週標頭（固定，不隨內容捲動）*/}
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">
                        {weekDayNames.map((name, i) => (
                            <div key={i} className={`py-2 text-center text-xs font-bold tracking-wider ${i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-600'}`}>
                                {name}
                            </div>
                        ))}
                    </div>

                    {/* ══════════════════════════════════════════════════
                        月曆格線：逐週渲染（核心重構）
                        每週 = 一個 position:relative 容器，分兩層：
                        Layer 1 (grid)：日期格背景 + 日期數字
                        Layer 2 (absolute)：任務條，橫跨對應欄數
                        ══════════════════════════════════════════════ */}
                    <div className="flex-1 overflow-y-auto">
                        {weeks.map((week, wIdx) => {
                            const segsThisWeek = segsByWeek[wIdx] || [];
                            const numLanes = lanesPerWeek[wIdx] || 0;

                            // 計算本週行高：日期列 + 任務條堆疊高度 + 底部留白
                            const weekH = WEEK_DATE_HEADER_H
                                + Math.min(numLanes, MAX_VISIBLE_LANES) * TASK_LANE_H
                                + 8; // 底部留白

                            // 計算每個日期格顯示「+N 更多」的數量
                            const overflowByCol = {};
                            if (numLanes > MAX_VISIBLE_LANES) {
                                segsThisWeek.forEach(seg => {
                                    if (seg.lane >= MAX_VISIBLE_LANES) {
                                        // 只在起始欄或週首欄計數
                                        const key = seg.col;
                                        overflowByCol[key] = (overflowByCol[key] || 0) + 1;
                                    }
                                });
                            }

                            return (
                                <div
                                    key={wIdx}
                                    className="relative border-b border-slate-100"
                                    style={{ height: Math.max(weekH, 90) }}
                                >
                                    {/* Layer 1：日期格背景與日期數字 */}
                                    <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                                        {week.map((day, col) => (
                                            <div
                                                key={day.dateStr}
                                                className={`border-r border-slate-100 px-1 pt-1
                                                    ${!day.isCurrentMonth ? 'bg-slate-50/80' : 'bg-white'}
                                                    ${day.isWeekend && day.isCurrentMonth ? 'bg-slate-50/50' : ''}
                                                    ${day.isToday ? 'bg-primary/[0.03]' : ''}
                                                `}
                                            >
                                                {/* 日期數字 */}
                                                <span
                                                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                                                        ${day.isToday
                                                            ? 'bg-primary text-white shadow-sm'
                                                            : day.isCurrentMonth
                                                                ? 'text-slate-700'
                                                                : 'text-slate-300'
                                                        }`}
                                                >
                                                    {day.date.date()}
                                                </span>
                                                {/* 超出顯示的「+N 更多」提示 */}
                                                {overflowByCol[col] > 0 && (
                                                    <div className="text-[9px] text-slate-400 font-bold mt-auto pb-1 pointer-events-auto">
                                                        +{overflowByCol[col]} 更多
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Layer 2：任務條（絕對定位，橫跨多欄）*/}
                                    {segsThisWeek
                                        .filter(seg => seg.lane < MAX_VISIBLE_LANES)
                                        .map((seg, sIdx) => {
                                            const styles = STATUS_STYLES[seg.item.status || 'todo'] || STATUS_STYLES.todo;

                                            // 橫向：col/7 ~ (col+span)/7
                                            const leftPct = (seg.col / 7) * 100;
                                            const widthPct = (seg.span / 7) * 100;

                                            // 縱向：日期列高 + lane * 任務列高
                                            const topPx = WEEK_DATE_HEADER_H + seg.lane * TASK_LANE_H;

                                            // 圓角邏輯：
                                            // 起始→左圓角，結束→右圓角，中間段無圓角
                                            const roundLeft = seg.isTaskStart ? 'rounded-l-md' : '';
                                            const roundRight = seg.isTaskEnd ? 'rounded-r-md' : '';

                                            // 水平 padding：左端有名稱，中間、右端為空白條
                                            const horizontalPadding = seg.isTaskStart || seg.isSingleDay
                                                ? 'px-2' : 'pl-0 pr-0';

                                            return (
                                                <div
                                                    key={`seg-${seg.item.id}-${wIdx}-${sIdx}`}
                                                    onClick={() => handleItemClick(seg.item)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        useBoardStore.getState().setContextMenuState({ isOpen: true, x: e.clientX, y: e.clientY, nodeId: seg.item.id, title: seg.item.title });
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: topPx,
                                                        // 左右各留 2px 讓格線依然可見
                                                        left: `calc(${leftPct}% + ${seg.isTaskStart ? 2 : 0}px)`,
                                                        width: `calc(${widthPct}% - ${(seg.isTaskStart ? 2 : 0) + (seg.isTaskEnd ? 2 : 0)}px)`,
                                                        height: TASK_LANE_H - TASK_LANE_GAP,
                                                        zIndex: 10,
                                                    }}
                                                    className={`
                                                        flex items-center overflow-hidden cursor-pointer
                                                        ${styles.bar}
                                                        ${roundLeft} ${roundRight}
                                                        ${horizontalPadding}
                                                        hover:brightness-95 transition-all
                                                    `}
                                                    title={`${seg.item.title}${seg.item.startDate ? ` (${seg.item.startDate}` : ''}${seg.item.endDate ? ` ~ ${seg.item.endDate})` : ')'}`}
                                                >
                                                    {/* 只在起始段或單日顯示圓點 + 文字 */}
                                                    {(seg.isTaskStart || seg.isSingleDay) && (
                                                        <>
                                                            <div className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mr-1.5 ${styles.dot}`} />
                                                            <span className="text-[11px] font-semibold truncate leading-none">
                                                                {seg.item.title}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalendarView;
