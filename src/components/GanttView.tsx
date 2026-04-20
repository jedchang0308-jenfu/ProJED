import React, { useRef, useState, useEffect, useMemo } from 'react';
import useBoardStore, { calculateCascadedDates } from '../store/useBoardStore';
import dayjs from 'dayjs';
import { Calendar, PanelLeftClose, PanelLeftOpen, LayoutList, GitBranch } from 'lucide-react';
import SharedTaskSidebar from './SharedTaskSidebar';
import { GanttHeader, GanttGrid, GanttRow, GanttTaskBar, getColWidth, getX, BAR_HEIGHT } from './Gantt';

const DEFAULT_GRID_START = dayjs().startOf('year');

const GanttView = () => {
    const {
        workspaces,
        activeBoardId,
        activeWorkspaceId,
        statusFilters,
        openModal,
        isSidebarOpen,
        setSidebarOpen,
        toggleStatusFilter,
    } = useBoardStore();

    const [isTaskListOpen, setIsTaskListOpen] = useState(true);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    const toggleCollapse = (id: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const [mode, setMode] = useState('Month');
    const [ganttFilters, setGanttFilters] = useState<any>({ list: true, card: true, checklist: true });
    const [showDependencies, setShowDependencies] = useState(true);
    const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 });
    const [simulatedDates, setSimulatedDates] = useState(null);

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
    const activeBoard = activeWs?.boards.find(b => b.id === activeBoardId);

    const statuses = [
        { key: 'todo', label: '進行中', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    const { flattenedItems, groups, gridStart, gridEnd, totalUnits } = useMemo(() => {
        if (!activeBoard) return { flattenedItems: [], groups: { lists: [], cards: [] }, gridStart: DEFAULT_GRID_START, gridEnd: dayjs(DEFAULT_GRID_START).add(60, 'day'), totalUnits: 60 };
        const items: any[] = [];
        const listGroups: any[] = [];
        const cardGroups: any[] = [];
        let currentRow = 0;

        const cascadedDates = calculateCascadedDates(activeBoard);

        let minDate: dayjs.Dayjs | null = null;
        let maxDate: dayjs.Dayjs | null = null;

        const updateBounds = (start: string | null, end: string | null) => {
            if (start) {
                const s = dayjs(start);
                if (s.isValid()) {
                    if (!minDate || s.isBefore(minDate)) minDate = s;
                }
            }
            if (end) {
                const e = dayjs(end);
                if (e.isValid()) {
                    if (!maxDate || e.isAfter(maxDate)) maxDate = e;
                }
            }
        };

        (activeBoard.lists || []).forEach(list => {
            if (list.isArchived) return;
            const listStatus = list.status || 'todo';
            const listStartRow = currentRow;
            const isListCollapsed = collapsedIds.has(list.id);

            const computedList = cascadedDates.get(list.id);
            const listStartDate = computedList?.startDate || list.startDate;
            const listEndDate = computedList?.endDate || list.endDate;

            updateBounds(listStartDate, listEndDate);

            if (ganttFilters.list && statusFilters[listStatus]) {
                items.push({ ...list, type: 'list', row: currentRow++, startDate: listStartDate, endDate: listEndDate });
            }

            if (isListCollapsed) return;

            const cards = list.cards || [];
            cards.forEach(card => {
                if (card.isArchived) return;
                const cardStatus = card.status || 'todo';
                if (!statusFilters[cardStatus]) return;

                const computedCard = cascadedDates.get(card.id);
                const cardStartDate = computedCard?.startDate || card.startDate;
                const cardEndDate = computedCard?.endDate || card.endDate;

                updateBounds(cardStartDate, cardEndDate);

                const cardStartRow = currentRow;
                const isCardCollapsed = collapsedIds.has(card.id);
                
                if (ganttFilters.card) {
                    items.push({ ...card, type: 'card', row: currentRow++, listId: list.id, startDate: cardStartDate, endDate: cardEndDate });
                }

                if (!isCardCollapsed) {
                    if (ganttFilters.checklist) {
                        (card.checklists || []).forEach(cl => {
                            if (cl.isArchived) return;
                            (cl.items || []).forEach(cli => {
                                if (cli.isArchived) return;
                                const cliStatus = cli.status || 'todo';
                                if (!statusFilters[cliStatus]) return;

                                const computedCli = cascadedDates.get(cli.id);
                                const cliStartDate = computedCli?.startDate || cli.startDate;
                                const cliEndDate = computedCli?.endDate || cli.endDate;

                                updateBounds(cliStartDate, cliEndDate);
                                items.push({
                                    ...cli,
                                    type: 'checklist',
                                    row: currentRow++,
                                    listId: list.id,
                                    cardId: card.id,
                                    checklistId: cl.id,
                                    title: cli.title || '未命名項目',
                                    startDate: cliStartDate,
                                    endDate: cliEndDate,
                                    parentCardDates: {
                                        startDate: cardStartDate,
                                        endDate: cardEndDate
                                    }
                                });
                            });
                        });
                    }
                }

                const cardEndRow = currentRow - 1;
                if (cardEndRow >= cardStartRow && (ganttFilters.card || ganttFilters.checklist)) {
                    cardGroups.push({
                        start: cardStartRow,
                        end: cardEndRow,
                        id: card.id,
                        startDate: cardStartDate,
                        endDate: cardEndDate
                    });
                }
            });

            const listEndRow = currentRow - 1;
            if (listEndRow >= listStartRow && (ganttFilters.list || ganttFilters.card || ganttFilters.checklist)) {
                listGroups.push({
                    start: listStartRow,
                    end: listEndRow,
                    id: list.id,
                    startDate: listStartDate,
                    endDate: listEndDate
                });
            }
        });

        const today = dayjs();
        const start = (minDate && minDate.isBefore(today)) ? minDate : today;
        const end = (maxDate && maxDate.isAfter(today)) ? maxDate : today;

        let calculatedGridStart = start.subtract(6, 'month').startOf('month');
        let calculatedGridEnd = end.add(12, 'month').endOf('month');

        if (mode === 'Quarter') {
            calculatedGridStart = calculatedGridStart.startOf('month').subtract(calculatedGridStart.month() % 3, 'month');
            const endMonthDiff = 2 - (calculatedGridEnd.month() % 3);
            calculatedGridEnd = calculatedGridEnd.add(endMonthDiff, 'month').endOf('month');
        } else if (mode === 'Year') {
            calculatedGridStart = calculatedGridStart.startOf('year');
            calculatedGridEnd = calculatedGridEnd.endOf('year');
        }

        let units = 60;
        if (mode === 'Day') {
            units = calculatedGridEnd.diff(calculatedGridStart, 'day') + 1;
        } else if (mode === 'Quarter') {
            units = Math.ceil(calculatedGridEnd.diff(calculatedGridStart, 'month') / 3);
        } else if (mode === 'Year') {
            units = calculatedGridEnd.diff(calculatedGridStart, 'year') + 1;
        } else {
            units = calculatedGridEnd.diff(calculatedGridStart, 'month') + 1;
        }

        return {
            flattenedItems: items,
            groups: { lists: listGroups, cards: cardGroups },
            gridStart: calculatedGridStart,
            gridEnd: calculatedGridEnd,
            totalUnits: units
        };
    }, [activeBoard, ganttFilters, statusFilters, mode, collapsedIds]);

    const colWidth = getColWidth(mode);

    const handleScroll = (e: any) => {
        const { scrollLeft } = e.target;
        setViewport(prev => ({ ...prev, scrollLeft }));
    };

    const scrollToNow = () => {
        if (scrollAreaRef.current) {
            const todayX = getX(dayjs(), colWidth, mode, gridStart);
            scrollAreaRef.current.scrollTo({
                left: Math.max(0, todayX - scrollAreaRef.current.clientWidth / 2),
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        if (scrollAreaRef.current) {
            const todayX = getX(dayjs(), colWidth, mode, gridStart);
            scrollAreaRef.current.scrollLeft = Math.max(0, todayX - scrollAreaRef.current.clientWidth / 2);
            setViewport({
                scrollLeft: scrollAreaRef.current.scrollLeft,
                width: scrollAreaRef.current.clientWidth
            });
        }

        const handleResize = () => {
            if (scrollAreaRef.current) {
                setViewport(prev => ({ ...prev, width: scrollAreaRef.current!.clientWidth }));
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [mode, colWidth, gridStart]);

    const handleItemClick = (item: any) => {
        if (item.type === 'list') {
            openModal('list', item.id);
        } else if (item.type === 'card') {
            openModal('card', item.id, item.listId);
        } else if (item.type === 'checklist') {
            openModal('checklistitem', item.id, item.listId, { cardId: item.cardId, checklistId: item.checklistId });
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            {/* Toolbar */}
            <div className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0" style={{ zIndex: 110 }}>
                {/* Left: Status Filters */}
                <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-2 mr-4 flex-1">
                    {statuses.map(s => (
                        <button
                            key={s.key}
                            onClick={() => toggleStatusFilter(s.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${statusFilters[s.key] ? 'bg-white border-slate-200 text-slate-700 shadow-sm' : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'}`}
                        >
                            <div className={`w-2 h-2 rounded-full ${s.color}`}></div>
                            <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* Right: Controls */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex p-0.5 bg-slate-100 rounded-lg">
                            {['Day', 'Month', 'Quarter', 'Year'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${mode === m ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {m === 'Day' ? '日度' : m === 'Month' ? '月度' : m === 'Quarter' ? '季度' : '年度'}
                                </button>
                            ))}
                        </div>
                        <button onClick={scrollToNow} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 hover:bg-primary/5 rounded-lg text-xs font-bold transition-all shadow-sm group" title="跳轉至今天">
                            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
                            <span>今天</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg mr-2">
                            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className={`p-1.5 rounded transition-all ${!isSidebarOpen ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title={isSidebarOpen ? "收疊工作區選單" : "展開工作區選單"}>
                                {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                            </button>
                            <button onClick={() => setIsTaskListOpen(!isTaskListOpen)} className={`p-1.5 rounded transition-all ${!isTaskListOpen ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title={isTaskListOpen ? "收疊任務清單" : "展開任務清單"}>
                                <LayoutList size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                            {['list', 'card', 'checklist'].map((key) => (
                                <button
                                    key={key}
                                    onClick={() => setGanttFilters((prev: any) => ({ ...prev, [key]: !prev[key] }))}
                                    className={`px-2 py-1 text-[10px] font-bold rounded ${ganttFilters[key] ? 'bg-white text-slate-700 shadow-xs' : 'text-slate-400'}`}
                                >
                                    {key === 'list' ? '列表' : key === 'card' ? '卡片' : '待辦'}
                                </button>
                            ))}
                        </div>

                        <button onClick={() => setShowDependencies(prev => !prev)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex-shrink-0 ${showDependencies ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' : 'bg-slate-100 border-transparent text-slate-400 hover:text-slate-600'}`}>
                            <GitBranch size={11} />
                            <span>依賴關係</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <SharedTaskSidebar
                    flattenedItems={flattenedItems}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    onItemClick={handleItemClick}
                    isTaskListOpen={isTaskListOpen}
                    setIsTaskListOpen={setIsTaskListOpen}
                    rowHeight={BAR_HEIGHT}
                />

                {/* Right Timeline */}
                <div className="flex-1 overflow-hidden relative">
                    <div ref={scrollAreaRef} onScroll={handleScroll} className="h-full overflow-scroll relative select-none bg-white scrollbar-gantt">
                        <GanttHeader mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />

                        <div className="relative" style={{ width: totalUnits * colWidth, minHeight: '100%', height: `calc(${Math.max(flattenedItems.length * BAR_HEIGHT, 100)}px + 65vh)` }}>
                            
                            <GanttGrid mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />
                            
                            <GanttRow groups={groups} colWidth={colWidth} mode={mode} gridStart={gridStart} />

                            {flattenedItems.map((item: any) => (
                                <GanttTaskBar
                                    key={`${item.type}-${item.id}`}
                                    item={item}
                                    colWidth={colWidth}
                                    mode={mode}
                                    gridStart={gridStart}
                                    gridEnd={gridEnd}
                                    activeBoard={activeBoard}
                                    activeWorkspaceId={activeWorkspaceId}
                                    setSimulatedDates={setSimulatedDates}
                                    simulatedDates={simulatedDates}
                                    showDependencies={showDependencies}
                                    viewport={viewport}
                                    scrollAreaRef={scrollAreaRef}
                                    onItemClick={handleItemClick}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GanttView;
