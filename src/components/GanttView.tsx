// @ts-nocheck
import React, { useRef, useState, useEffect, useMemo } from 'react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useTaskFilterStore } from '../store/useTaskFilterStore';
import dayjs from 'dayjs';
import { Calendar } from 'lucide-react';
import SharedTaskSidebar from './SharedTaskSidebar';
import { ViewToolbar } from './ui/ViewToolbar';
import { GanttHeader, GanttGrid, GanttRow, GanttTaskBar, getColWidth, getX, BAR_HEIGHT } from './Gantt';
import { compactClassNames, compactSegmentedButtonClass } from './ui/compactTokens';
import { selectAndOpenTaskDetails } from '../utils/taskInteractions';
import { buildHierarchicalTaskItems } from '../utils/taskHierarchy';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { projectTaskFilterResults } from '../features/taskFilters';
import { TaskFilterResultState } from './ui/TaskFilterResultState';
import { buildCollapsedProjectionTasks, buildProjectionParentIndex } from '../features/taskTracking/model';

const DEFAULT_GRID_START = dayjs().startOf('year');

const GanttView = () => {
    const {
        activeBoardId,
        activeWorkspaceId,
        showDependencies,
    } = useBoardStore();
    const taskFilters = useTaskFilterStore(state => state.filters);
    const resetTaskFilters = useTaskFilterStore(state => state.resetFilters);

    const [isTaskListOpen, setIsTaskListOpen] = useState(true);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const isCoarsePointer = useCoarsePointer();
    const ganttRowHeight = isCoarsePointer ? 22 : BAR_HEIGHT;

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
    const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 });
    const [simulatedDates, setSimulatedDates] = useState(null);

    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // (activeBoard 已不再需要，WBS 資料由 useWbsStore 驅動)

    // Subscribe to nodes so GanttView re-renders when task dates or orders change
    const nodes = useWbsStore(s => s.nodes);
    const trackingReferences = useWbsStore(s => s.trackingReferences);
    const projectionTasks = useMemo(
        () => buildCollapsedProjectionTasks(Object.values(nodes), trackingReferences, activeBoardId || ''),
        [activeBoardId, nodes, trackingReferences],
    );
    const projectionNodes = useMemo(
        () => Object.fromEntries(projectionTasks.map(task => [task.id, task])),
        [projectionTasks],
    );
    const projectionParentNodesIndex = useMemo(
        () => buildProjectionParentIndex(projectionTasks),
        [projectionTasks],
    );
    const taskLoading = useWbsStore(s => s.loading);
    const taskLoadError = useWbsStore(s => s.error);
    const filterProjection = useMemo(
        () => projectTaskFilterResults(projectionNodes, taskFilters, { boardId: activeBoardId }),
        [activeBoardId, projectionNodes, taskFilters],
    );


    const { flattenedItems, groups, gridStart, gridEnd, totalUnits } = useMemo(() => {
        if (!activeBoardId) return { flattenedItems: [], groups: [], gridStart: DEFAULT_GRID_START, gridEnd: dayjs(DEFAULT_GRID_START).add(60, 'day'), totalUnits: 60 };

        let minDate: dayjs.Dayjs | null = null;
        let maxDate: dayjs.Dayjs | null = null;

        const updateBounds = (start: string | null, end: string | null) => {
            if (start) {
                const s = dayjs(start);
                if (s.isValid() && (!minDate || s.isBefore(minDate))) minDate = s;
            }
            if (end) {
                const e = dayjs(end);
                if (e.isValid() && (!maxDate || e.isAfter(maxDate))) maxDate = e;
            }
        };

        const { items, groups } = buildHierarchicalTaskItems({
            nodes: projectionNodes,
            parentNodesIndex: projectionParentNodesIndex,
            activeBoardId,
            visibleTaskIds: filterProjection.visibleTaskIds,
            collapsedIds,
        });
        items.forEach(item => updateBounds(item.startDate || null, item.endDate || null));

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
            groups,
            gridStart: calculatedGridStart,
            gridEnd: calculatedGridEnd,
            totalUnits: units
        };
    }, [activeBoardId, filterProjection, mode, collapsedIds, projectionNodes, projectionParentNodesIndex]);
    const isTimelineEligible = (item: any) => [item.startDate, item.endDate]
        .some(value => Boolean(value && dayjs(value).isValid()));
    const timelineItems = flattenedItems.filter(isTimelineEligible);
    const hasScheduledItems = timelineItems.length > 0;

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
        selectAndOpenTaskDetails(item.id, item.trackingReferenceId);
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
            <ViewToolbar
                rightControls={(
                    <>
                    <div className="flex items-center gap-[8px]">
                        <div className={compactClassNames.segmented}>
                            {['Day', 'Month', 'Quarter', 'Year'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={compactSegmentedButtonClass(mode === m)}
                                >
                                    {m === 'Day' ? '日度' : m === 'Month' ? '月度' : m === 'Quarter' ? '季度' : '年度'}
                                </button>
                            ))}
                        </div>
                        <button onClick={scrollToNow} className={`${compactClassNames.textButtonBase} group`} title="跳轉至今天">
                            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
                            <span>今天</span>
                        </button>
                    </div>

                    </>
                )}
            />

            <TaskFilterResultState
                projection={filterProjection}
                loading={taskLoading}
                error={taskLoadError}
                onReset={resetTaskFilters}
            />
            {!taskLoading && !taskLoadError && filterProjection.matchedTaskIds.size > 0 ? <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <SharedTaskSidebar
                    flattenedItems={flattenedItems}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    onItemClick={handleItemClick}
                    isTaskListOpen={isTaskListOpen}
                    setIsTaskListOpen={setIsTaskListOpen}
                    surface="gantt"
                    rowHeight={ganttRowHeight}
                />

                {/* Right Timeline */}
                <div className="flex-1 overflow-hidden relative">
                    {!hasScheduledItems ? (
                        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 text-center text-xs text-slate-500" data-task-date-empty-hint="gantt">
                            符合篩選的任務尚未設定日期
                        </div>
                    ) : null}
                    <div
                        ref={scrollAreaRef}
                        onScroll={handleScroll}
                        className="mobile-pan-surface h-full overflow-scroll relative select-none bg-white scrollbar-gantt"
                        data-mobile-pan-surface="gantt"
                    >
                        <GanttHeader mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />

                        <div className="relative" style={{ width: totalUnits * colWidth, minHeight: '100%', height: `calc(${Math.max(flattenedItems.length * ganttRowHeight, 100)}px + 65vh)` }}>
                            
                            <GanttGrid mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />
                            
                            <GanttRow groups={groups} colWidth={colWidth} mode={mode} gridStart={gridStart} />

                            {timelineItems.map((item: any) => (
                                <GanttTaskBar
                                    key={`${item.type}-${item.id}`}
                                    item={item}
                                    colWidth={colWidth}
                                    mode={mode}
                                    gridStart={gridStart}
                                    gridEnd={gridEnd}
                                    activeBoard={null}
                                    activeWorkspaceId={activeWorkspaceId || ''}
                                    setSimulatedDates={setSimulatedDates}
                                    simulatedDates={simulatedDates}
                                    showDependencies={showDependencies}
                                    viewport={viewport}
                                    scrollAreaRef={scrollAreaRef}
                                    onItemClick={handleItemClick}
                                    rowHeight={ganttRowHeight}
                                />
                            ))}

                            <div className="mobile-pan-rail absolute bottom-0 left-0 right-0" data-mobile-pan-rail="gantt" aria-hidden="true" />
                        </div>
                    </div>
                </div>
            </div> : null}
        </div>
    );
};

export default GanttView;
