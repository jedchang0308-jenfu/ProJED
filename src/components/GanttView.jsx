import React, { useRef, useEffect, useState, useMemo } from 'react';
import useBoardStore from '../store/useBoardStore';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Calendar, Filter, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, LayoutList, Folder, FileText } from 'lucide-react';

const BAR_HEIGHT = 42;
const GRID_START = dayjs('2024-01-01');

const GanttView = () => {
    const {
        workspaces,
        activeBoardId,
        activeWorkspaceId,
        statusFilters,
        openModal,
        updateCard,
        updateList,
        updateChecklistItem,
        updateTaskDate,
        isSidebarOpen,
        setSidebarOpen
    } = useBoardStore();

    const [isTaskListOpen, setIsTaskListOpen] = useState(true);

    const [mode, setMode] = useState('Month'); // Month, Quarter, Year
    const [ganttFilters, setGanttFilters] = useState({ list: true, card: true, checklist: true });
    const [dragState, setDragState] = useState(null); // { type: 'move'|'left'|'right', item, ... }
    const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 });
    const [hoveredItemId, setHoveredItemId] = useState(null); // { id, type: 'task' }
    const scrollAreaRef = useRef(null);
    const taskListRef = useRef(null);

    // Get active board data
    const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
    const activeBoard = activeWs?.boards.find(b => b.id === activeBoardId);

    // Flatten data into rows with hierarchy info
    const { flattenedItems, groups } = useMemo(() => {
        if (!activeBoard) return { flattenedItems: [], groups: { lists: [], cards: [] } };
        const items = [];
        const listGroups = [];
        const cardGroups = [];
        let currentRow = 0;

        activeBoard.lists.forEach(list => {
            const listStatus = list.status || 'todo';
            const listStartRow = currentRow;

            // 列表主項
            if (ganttFilters.list && statusFilters[listStatus]) {
                items.push({ ...list, type: 'list', row: currentRow++ });
            }

            // 處理卡片與待辦
            const cards = list.cards || [];
            cards.forEach(card => {
                const cardStatus = card.status || 'todo';
                if (!statusFilters[cardStatus]) return;

                const cardStartRow = currentRow;
                // 卡片主項
                if (ganttFilters.card) {
                    items.push({ ...card, type: 'card', row: currentRow++, listId: list.id });
                }

                // 待辦清單項
                if (ganttFilters.checklist) {
                    (card.checklists || []).forEach(cl => {
                        (cl.items || []).forEach(cli => {
                            items.push({
                                ...cli,
                                type: 'checklist',
                                row: currentRow++,
                                listId: list.id,
                                cardId: card.id,
                                checklistId: cl.id,
                                title: cli.title || '未命名項目',
                                parentCardDates: {
                                    startDate: card.startDate,
                                    endDate: card.endDate
                                }
                            });
                        });
                    });
                }

                const cardEndRow = currentRow - 1;
                if (cardEndRow >= cardStartRow && (ganttFilters.card || ganttFilters.checklist)) {
                    cardGroups.push({
                        start: cardStartRow,
                        end: cardEndRow,
                        id: card.id,
                        startDate: card.startDate,
                        endDate: card.endDate
                    });
                }
            });

            const listEndRow = currentRow - 1;
            if (listEndRow >= listStartRow && (ganttFilters.list || ganttFilters.card || ganttFilters.checklist)) {
                listGroups.push({
                    start: listStartRow,
                    end: listEndRow,
                    id: list.id,
                    startDate: list.startDate,
                    endDate: list.endDate
                });
            }
        });
        return { flattenedItems: items, groups: { lists: listGroups, cards: cardGroups } };
    }, [activeBoard, ganttFilters, statusFilters]);

    // Helpers for X coordinates
    const getX = (date, colWidth) => {
        if (!date) return 0;
        const d = dayjs(date);
        if (!d.isValid()) return 0;
        const mDiff = d.diff(GRID_START, 'month', true);
        if (mode === 'Quarter') return (mDiff / 3) * colWidth;
        if (mode === 'Year') return (mDiff / 12) * colWidth;
        return mDiff * colWidth;
    };

    const getDateFromX = (x, colWidth) => {
        let months = x / colWidth;
        if (mode === 'Quarter') months *= 3;
        if (mode === 'Year') months *= 12;
        return GRID_START.add(months, 'month').format('YYYY-MM-DD');
    };

    const getColWidth = () => {
        if (mode === 'Quarter') return 250;
        if (mode === 'Year') return 600;
        return 160; // Month
    };

    const colWidth = getColWidth();

    // Sync scroll between task list and timeline (Dual-way Sync)
    const handleScroll = (e) => {
        const { scrollTop, scrollLeft } = e.target;
        setViewport(prev => ({ ...prev, scrollLeft: scrollLeft }));

        if (e.target === scrollAreaRef.current && taskListRef.current) {
            taskListRef.current.scrollTop = scrollTop;
        } else if (e.target === taskListRef.current && scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollTop;
        }
    };

    // Drag and Resize Handlers
    const handleDragStart = (e, item, type) => {
        e.stopPropagation();

        // Record history ONCE at start of drag
        useBoardStore.getState().recordHistory();

        const isMilestone = !item.startDate && item.endDate;
        const start = item.startDate || (isMilestone ? item.endDate : dayjs(item.endDate).subtract(3, 'day').format('YYYY-MM-DD'));
        const end = item.endDate || dayjs(start).add(3, 'day').format('YYYY-MM-DD');

        setDragState({
            type, // 'move', 'left', 'right'
            item,
            startX: e.clientX,
            startY: e.clientY,
            originalStart: start,
            originalEnd: end,
            originalStartX: getX(start, colWidth),
            originalEndX: getX(end, colWidth)
        });
    };

    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e) => {
            // Auto-scroll on drag
            if (scrollAreaRef.current) {
                const rect = scrollAreaRef.current.getBoundingClientRect();
                const threshold = 80;
                const scrollSpeed = 15;
                if (e.clientX < rect.left + threshold) {
                    scrollAreaRef.current.scrollLeft -= scrollSpeed;
                } else if (e.clientX > rect.right - threshold) {
                    scrollAreaRef.current.scrollLeft += scrollSpeed;
                }
            }

            const deltaX = e.clientX - dragState.startX;
            const item = dragState.item;

            let newStart = dragState.originalStart;
            let newEnd = dragState.originalEnd;

            if (dragState.type === 'move') {
                const newStartX = dragState.originalStartX + deltaX;
                const newEndX = dragState.originalEndX + deltaX;
                newStart = getDateFromX(newStartX, colWidth);
                newEnd = getDateFromX(newEndX, colWidth);
            } else if (dragState.type === 'left') {
                const newStartX = dragState.originalStartX + deltaX;
                newStart = getDateFromX(newStartX, colWidth);
                if (dayjs(newStart).isAfter(dayjs(newEnd))) {
                    newStart = dayjs(newEnd).subtract(1, 'day').format('YYYY-MM-DD');
                }
            } else if (dragState.type === 'right') {
                const newEndX = dragState.originalEndX + deltaX;
                newEnd = getDateFromX(newEndX, colWidth);
                if (dayjs(newEnd).isBefore(dayjs(newStart))) {
                    newEnd = dayjs(newStart).add(1, 'day').format('YYYY-MM-DD');
                }
            }

            // Update store SILENTLY (no history during movement)
            const updates = { startDate: newStart, endDate: newEnd };

            // 使用新的 Action 統一處理更新與依賴排程
            updateTaskDate(
                activeWorkspaceId,
                activeBoardId,
                item.type,
                item.id,
                updates,
                item.listId,
                item.cardId,
                item.checklistId,
                true // noHistory during draft drag? actually we might want history on drop only? Or just noHistory as drafted
            );
        };

        const handleMouseUp = (e) => {
            setDragState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, colWidth, mode, activeWorkspaceId, activeBoardId, activeBoard, flattenedItems]);

    // Scroll to "Now" and measure viewport on mount
    useEffect(() => {
        if (scrollAreaRef.current) {
            const todayX = getX(dayjs(), colWidth);
            scrollAreaRef.current.scrollLeft = todayX - scrollAreaRef.current.clientWidth / 2;
            setViewport({
                scrollLeft: scrollAreaRef.current.scrollLeft,
                width: scrollAreaRef.current.clientWidth
            });
        }

        const handleResize = () => {
            if (scrollAreaRef.current) {
                setViewport(prev => ({ ...prev, width: scrollAreaRef.current.clientWidth }));
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [mode]);

    // Render Grid Columns with Weekend Shading
    const renderGrid = () => {
        const totalMonths = 60; // Max months for 'Month' mode
        const totalQuarters = 24; // Max quarters for 'Quarter' mode
        const totalYears = 10; // Max years for 'Year' mode

        let totalUnits = 0;
        let unitDuration = 'month'; // Default for Month mode
        if (mode === 'Year') {
            totalUnits = totalYears;
            unitDuration = 'year';
        } else if (mode === 'Quarter') {
            totalUnits = totalQuarters;
            unitDuration = 'quarter';
        } else { // Month mode
            totalUnits = totalMonths;
            unitDuration = 'month';
        }

        const gridElements = [];
        let currentDay = GRID_START.startOf('day');
        const endDate = GRID_START.add(totalUnits, unitDuration).endOf('day');

        // Render vertical grid lines for months/quarters/years
        for (let i = 0; i < totalUnits; i++) {
            gridElements.push(
                <div
                    key={`grid-line-${i}`}
                    className="absolute top-0 bottom-0 border-r border-slate-100"
                    style={{ left: i * colWidth, width: colWidth }}
                />
            );
        }

        // Render weekend shading (day-level)
        // This will overlay on top of the main grid lines
        const dayWidth = colWidth / (mode === 'Month' ? GRID_START.daysInMonth() : (mode === 'Quarter' ? 90 : 365)); // Approximate day width
        let currentX = 0;
        while (currentDay.isBefore(endDate)) {
            const dayOfWeek = currentDay.day(); // 0 for Sunday, 6 for Saturday
            if (dayOfWeek === 0 || dayOfWeek === 6) { // It's a weekend
                gridElements.push(
                    <div
                        key={`weekend-${currentDay.format('YYYY-MM-DD')}`}
                        className="absolute top-0 bottom-0 bg-slate-50/50"
                        style={{
                            left: getX(currentDay, colWidth),
                            width: getX(currentDay.add(1, 'day'), colWidth) - getX(currentDay, colWidth)
                        }}
                    />
                );
            }
            currentDay = currentDay.add(1, 'day');
        }

        return gridElements;
    };
    // Render Header
    const renderHeader = () => {
        const units = mode === 'Year' ? 10 : (mode === 'Quarter' ? 24 : 60);
        const headerItems = [];
        for (let i = 0; i < units; i++) {
            let label = "";
            let subLabel = "";
            if (mode === 'Month') {
                const d = GRID_START.add(i, 'month');
                label = d.format('YYYY');
                subLabel = d.format('M月');
            } else if (mode === 'Quarter') {
                const d = GRID_START.add(i * 3, 'month');
                label = d.format('YYYY');
                subLabel = `Q${Math.floor(d.month() / 3) + 1}`;
            } else {
                const d = GRID_START.add(i, 'year');
                label = d.format('YYYY');
            }

            headerItems.push(
                <div key={i} className="flex-shrink-0 border-r border-slate-200 flex flex-col items-center justify-center bg-slate-50/50" style={{ width: colWidth }}>
                    <span className="text-[10px] font-bold text-slate-400">{label}</span>
                    <span className="text-xs font-bold text-slate-700">{subLabel}</span>
                </div>
            );
        }
        return headerItems;
    };

    const handleItemClick = (item) => {
        if (item.type === 'card') {
            openModal('card', item.id, item.listId);
        } else if (item.type === 'checklist') {
            openModal('card', item.cardId, item.listId);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* Toolbar */}
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white z-40 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex p-0.5 bg-slate-100 rounded-lg">
                        {['Month', 'Quarter', 'Year'].map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${mode === m ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {m === 'Month' ? '月度' : m === 'Quarter' ? '季度' : '年度'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Controls */}
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
                                {key === 'list' ? '列表' : key === 'card' ? '卡片' : '待辦'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Task List Sidebar */}
                <div
                    className={`flex-shrink-0 flex flex-col border-r border-slate-200 bg-white z-20 transition-all duration-300 ease-in-out relative ${isTaskListOpen ? 'w-64' : 'w-10'}`}
                >
                    {!isTaskListOpen ? (
                        <div className="flex-1 flex flex-col items-center pt-4 gap-4 overflow-hidden">
                            <button
                                onClick={() => setIsTaskListOpen(true)}
                                className="p-1.5 hover:bg-slate-100 rounded-full text-primary transition-colors"
                                title="展開任務清單"
                            >
                                <ChevronRight size={18} />
                            </button>
                            <div className="h-full w-px bg-slate-100" />
                        </div>
                    ) : (
                        <>
                            <div className="h-14 flex items-center justify-between px-4 border-b-2 border-slate-200 bg-slate-50 font-bold text-xs text-slate-500 uppercase tracking-wider">
                                <span>任務名稱</span>
                                <button
                                    onClick={() => setIsTaskListOpen(false)}
                                    className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                                    title="收疊任務清單"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                            </div>
                            <div
                                ref={taskListRef}
                                onScroll={handleScroll}
                                className="flex-1 overflow-y-auto scrollbar-thin"
                            >
                                <div style={{ height: flattenedItems.length * BAR_HEIGHT + 100 }}>
                                    {flattenedItems.map((item, idx) => (
                                        <div
                                            key={`${item.type}-${item.id}`}
                                            className={`flex items-center px-4 border-b border-slate-50 hover:bg-slate-50 transition-colors gap-2 
                                                ${item.type === 'list' ? 'font-black text-slate-800' : item.type === 'card' ? 'font-bold text-slate-700' : 'text-slate-500 italic'}`}
                                            style={{
                                                height: BAR_HEIGHT,
                                                paddingLeft: item.type === 'list' ? 12 : (item.type === 'card' ? 24 : 40)
                                            }}
                                        >
                                            <div className="flex-shrink-0">
                                                {item.type === 'list' && <Folder size={14} className="text-primary/70" />}
                                                {item.type === 'card' && <FileText size={12} className="text-slate-400" />}
                                                {item.type === 'checklist' && <div className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />}
                                            </div>
                                            <span className={`truncate ${item.type === 'list' ? 'text-[13px]' : item.type === 'card' ? 'text-[11px]' : 'text-[10px]'}`}>
                                                {item.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Right: Timeline */}
                <div className="flex-1 overflow-hidden relative">
                    <div
                        ref={scrollAreaRef}
                        onScroll={handleScroll}
                        className="h-full overflow-auto relative select-none bg-white scrollbar-thin"
                    >
                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 flex h-14 bg-white border-b-2 border-slate-200">
                            {renderHeader()}
                        </div>

                        {/* Grid Content */}
                        <div className="relative" style={{ width: (mode === 'Year' ? 10 : (mode === 'Quarter' ? 24 : 60)) * colWidth, height: flattenedItems.length * BAR_HEIGHT + 100 }}>
                            {/* Hierarchy Enclosures (Backgrounds) */}
                            <div className="absolute inset-0 pointer-events-none z-0">
                                {groups.lists.map(lg => {
                                    const start = lg.startDate || lg.endDate || dayjs().format('YYYY-MM-DD');
                                    const end = lg.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                                    const x1 = getX(start, colWidth);
                                    const x2 = getX(end, colWidth);
                                    const width = Math.max(x2 - x1, 24) + 20; // Extra padding

                                    return (
                                        <div
                                            key={lg.id}
                                            className="absolute bg-slate-100/40 rounded-lg"
                                            style={{
                                                top: lg.start * BAR_HEIGHT + 2,
                                                height: (lg.end - lg.start + 1) * BAR_HEIGHT - 4,
                                                left: x1 - 10,
                                                width: width
                                            }}
                                        />
                                    );
                                })}
                                {groups.cards.map(cg => {
                                    const start = cg.startDate || cg.endDate || dayjs().format('YYYY-MM-DD');
                                    const end = cg.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                                    const x1 = getX(start, colWidth);
                                    const x2 = getX(end, colWidth);
                                    const width = Math.max(x2 - x1, 24) + 12; // Extra padding

                                    return (
                                        <div
                                            key={cg.id}
                                            className="absolute bg-slate-200/30 rounded-lg border border-slate-200/50"
                                            style={{
                                                top: cg.start * BAR_HEIGHT + 4,
                                                height: (cg.end - cg.start + 1) * BAR_HEIGHT - 8,
                                                left: x1 - 6,
                                                width: width
                                            }}
                                        />
                                    );
                                })}
                            </div>



                            {/* Grid Lines */}
                            <div className="absolute inset-0 pointer-events-none" style={{ backgroundSize: `${colWidth}px 100%`, backgroundImage: 'linear-gradient(to right, #f1f5f9 1px, transparent 1px)' }}></div>
                            {renderGrid()}

                            {/* Task Bars */}
                            {flattenedItems.map(item => {
                                const isMilestone = !item.startDate && item.endDate;
                                let start = item.startDate;
                                let end = item.endDate;

                                // Fallback for checklist items without dates to make them discoverable
                                const isUsingFallback = item.type === 'checklist' && !start && !end;
                                if (isUsingFallback) {
                                    start = item.parentCardDates?.startDate || dayjs().format('YYYY-MM-DD');
                                    end = item.parentCardDates?.endDate || dayjs(start).add(1, 'day').format('YYYY-MM-DD');
                                }

                                if (!end) end = dayjs(start || undefined).add(7, 'day').format('YYYY-MM-DD');
                                if (!start) start = isMilestone ? end : dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');

                                const x1 = getX(start, colWidth);
                                const x2 = getX(end, colWidth);
                                let width = isMilestone ? 10 : Math.max(x2 - x1, 24);

                                const status = item.status || 'todo';
                                const barHeight = 18; // 統一高度與卡片相同

                                // 層次色彩深度邏輯
                                const hierarchyClass = item.type === 'list'
                                    ? 'brightness-75 saturate-150' // 最高階層：最深
                                    : item.type === 'card'
                                        ? 'brightness-100'        // 中間階層：標準
                                        : 'brightness-125 opacity-80'; // 最低階層：最淺

                                // Highlighting Logic
                                const isRelated = hoveredItemId && hoveredItemId.type === 'task' && item.id === hoveredItemId.id;

                                return (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        data-task-id={item.id}
                                        onMouseDown={(e) => handleDragStart(e, item, 'move')}
                                        onMouseEnter={() => setHoveredItemId({ id: item.id, type: 'task' })}
                                        onMouseLeave={() => setHoveredItemId(null)}
                                        onClick={(e) => {
                                            if (!dragState) handleItemClick(item);
                                        }}
                                        className={`absolute flex items-center transition-all hover:scale-[1.02] hover:brightness-110 cursor-move group ${isMilestone ? 'rotate-45' : 'rounded-full shadow-sm'} bg-status-${status} ${hierarchyClass} ${isUsingFallback ? 'opacity-30 border-2 border-dashed border-white/50' : ''} z-20 ${isRelated ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                                        style={{
                                            left: x1,
                                            width: width,
                                            height: barHeight,
                                            top: item.row * BAR_HEIGHT + (BAR_HEIGHT - barHeight) / 2
                                        }}
                                    >
                                        {/* Resize Handles */}
                                        {!isMilestone && !isUsingFallback && (
                                            <>
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-full"
                                                    onMouseDown={(e) => handleDragStart(e, item, 'left')}
                                                />
                                                <div
                                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-full"
                                                    onMouseDown={(e) => handleDragStart(e, item, 'right')}
                                                />
                                            </>
                                        )}

                                        {/* Smart Label Logic */}
                                        {!isMilestone && (() => {
                                            const TEXT_ESTIMATE = item.title.length * 12; // 估計文字長度
                                            const canFitInside = width > TEXT_ESTIMATE + 20;

                                            if (canFitInside) {
                                                // 文字在內部：計算視窗內的可用區域並置中文字
                                                const viewStart = viewport.scrollLeft;
                                                const viewEnd = viewport.scrollLeft + viewport.width;
                                                const visibleStart = Math.max(x1, viewStart);
                                                const visibleEnd = Math.min(x1 + width, viewEnd);
                                                const visibleWidth = visibleEnd - visibleStart;

                                                // 如果可見部分足夠塞下文字，則讓文字跟隨視野中心
                                                const textStyles = {};
                                                if (visibleWidth > TEXT_ESTIMATE) {
                                                    const targetCenter = (visibleStart + visibleEnd) / 2;
                                                    const relativeX = targetCenter - x1;
                                                    textStyles.transform = `translateX(${relativeX}px) translateX(-50%)`;
                                                    textStyles.left = 0;
                                                } else {
                                                    // 若可見區塊太小，則固定在條的中間
                                                    textStyles.left = '50%';
                                                    textStyles.transform = 'translateX(-50%)';
                                                }

                                                return (
                                                    <span
                                                        className="absolute whitespace-nowrap text-[9px] font-bold text-white drop-shadow-sm pointer-events-none select-none px-2 transition-transform duration-75"
                                                        style={textStyles}
                                                    >
                                                        {item.title}
                                                    </span>
                                                );
                                            } else {
                                                // 文字在外部：出現在靠近畫面中心的那一側
                                                const viewCenter = viewport.scrollLeft + viewport.width / 2;
                                                const barCenter = x1 + width / 2;
                                                const isBarOnLeft = barCenter < viewCenter;

                                                return (
                                                    <div
                                                        className={`absolute ${isBarOnLeft ? 'left-full ml-3' : 'right-full mr-3'} text-[10px] font-bold text-slate-500 whitespace-nowrap pointer-events-none select-none z-50`}
                                                    >
                                                        {item.title} {isUsingFallback && "(尚未設定日期)"}
                                                    </div>
                                                );
                                            }
                                        })()}

                                        {/* Milestone Label (Always external) */}
                                        {isMilestone && (
                                            <div className="absolute left-full ml-3 text-[10px] font-bold text-slate-500 whitespace-nowrap -rotate-45 pointer-events-none select-none z-50">
                                                {item.title}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Now Line */}
                            <div
                                className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none shadow-[0_0_8px_rgba(248,113,113,0.5)]"
                                style={{ left: getX(dayjs(), colWidth) }}
                            >
                                <div className="sticky top-14 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full transform -translate-x-1/2 shadow-sm border border-white">今</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GanttView;
