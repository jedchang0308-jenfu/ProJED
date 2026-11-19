// @ts-nocheck
import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useTaskFilterStore } from '../store/useTaskFilterStore';
import dayjs from 'dayjs';
import { Calendar } from 'lucide-react';
import SharedTaskSidebar from './SharedTaskSidebar';
import { ViewToolbar } from './ui/ViewToolbar';
import { GanttHeader, GanttGrid, GanttRow, GanttTaskBar, getColWidth, getX, BAR_HEIGHT } from './Gantt';
import { compactClassNames, compactSegmentedButtonClass, taskViewFrameClassName } from './ui/compactTokens';
import { selectAndOpenTaskDetails } from '../utils/taskInteractions';
import { buildHierarchicalTaskItems } from '../utils/taskHierarchy';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { projectTaskFilterResults } from '../features/taskFilters';
import { TaskFilterResultState } from './ui/TaskFilterResultState';
import { buildCollapsedProjectionTasks, buildProjectionParentIndex } from '../features/taskTracking/model';

const DEFAULT_GRID_START = dayjs().startOf('year');
const FULLY_EXPANDED = new Set<string>();

const GanttView = () => {
    const {
        activeBoardId,
        activeWorkspaceId,
        showDependencies,
    } = useBoardStore();
    const taskFilters = useTaskFilterStore(state => state.filters);
    const resetTaskFilters = useTaskFilterStore(state => state.resetFilters);
    const taskFiltersLocked = useTaskFilterStore(state => state.controlsLocked);
    const taskFilterWarning = useTaskFilterStore(state => state.warning);

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
    const taskListRef = useRef<HTMLDivElement>(null);

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
    const taskResultError = taskLoadError || (taskFiltersLocked ? taskFilterWarning || '篩選偏好無法載入' : null);
    const filterProjection = useMemo(
        () => projectTaskFilterResults(projectionNodes, taskFilters, { boardId: activeBoardId }),
        [activeBoardId, projectionNodes, taskFilters],
    );
    const hierarchyInputs = useMemo(() => ({
        nodes: projectionNodes,
        parentNodesIndex: projectionParentNodesIndex,
        activeBoardId,
        visibleTaskIds: filterProjection.visibleTaskIds,
    }), [activeBoardId, filterProjection.visibleTaskIds, projectionNodes, projectionParentNodesIndex]);
    const fullyExpandedHierarchy = useMemo(
        () => buildHierarchicalTaskItems({ ...hierarchyInputs, collapsedIds: FULLY_EXPANDED }),
        [hierarchyInputs],
    );
    const hierarchy = useMemo(
        () => collapsedIds.size ? buildHierarchicalTaskItems({ ...hierarchyInputs, collapsedIds }) : fullyExpandedHierarchy,
        [collapsedIds, fullyExpandedHierarchy, hierarchyInputs],
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

        const { items, groups } = hierarchy;
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
    }, [activeBoardId, hierarchy, mode]);
    const isTimelineEligible = (item: any) => [item.startDate, item.endDate]
        .some(value => Boolean(value && dayjs(value).isValid()));
    const timelineItems = flattenedItems.filter(isTimelineEligible);
    const hasScheduledItems = timelineItems.length > 0;

    const colWidth = getColWidth(mode);
    const timelineWidth = totalUnits * colWidth;
    const todayX = getX(dayjs().startOf('day'), colWidth, mode, gridStart);
    const showTimeline = !taskLoading && !taskResultError && filterProjection.matchedTaskIds.size > 0;

    const getTimelineViewportWidth = useCallback(() => Math.max(0,
        (scrollAreaRef.current?.clientWidth ?? 0) - (taskListRef.current?.offsetWidth ?? 0),
    ), []);
    const updateViewport = useCallback(() => {
        const scrollLeft = scrollAreaRef.current?.scrollLeft ?? 0;
        const width = getTimelineViewportWidth();
        setViewport(previous => previous.scrollLeft === scrollLeft && previous.width === width
            ? previous : { scrollLeft, width });
    }, [getTimelineViewportWidth]);

    const scrollToNow = () => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                left: Math.max(0, todayX - getTimelineViewportWidth() / 2),
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        if (!showTimeline || !scrollAreaRef.current) return;
        scrollAreaRef.current.scrollLeft = Math.max(0, todayX - getTimelineViewportWidth() / 2);
        updateViewport();
    }, [todayX, showTimeline, getTimelineViewportWidth, updateViewport]);

    useEffect(() => {
        if (!showTimeline || !scrollAreaRef.current || !taskListRef.current) return;
        const observer = new ResizeObserver(updateViewport);
        observer.observe(scrollAreaRef.current);
        observer.observe(taskListRef.current);
        return () => observer.disconnect();
    }, [showTimeline, updateViewport]);

    const handleItemClick = (item: any) => {
        selectAndOpenTaskDetails(item.id, item.trackingReferenceId);
    };

    return (
        <div className={`flex-1 flex flex-col bg-slate-50 overflow-hidden ${taskViewFrameClassName}`}>
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
                error={taskResultError}
                onReset={resetTaskFilters}
            />
            {showTimeline ? <div className="relative min-h-0 flex-1 [container-type:inline-size]">
                {!hasScheduledItems ? (
                    <div className="pointer-events-none absolute inset-x-0 top-14 z-20 text-center text-xs text-slate-500" data-task-date-empty-hint="gantt">
                        符合篩選的任務尚未設定日期
                    </div>
                ) : null}
                <div
                    ref={scrollAreaRef}
                    onScroll={updateViewport}
                    className="mobile-pan-surface scrollbar-gantt absolute inset-0 z-0 overflow-auto select-none bg-white"
                    data-mobile-pan-surface="gantt"
                >
                    <div className="flex min-h-full w-max min-w-full">
                        {/* Left Sidebar */}
                        <SharedTaskSidebar
                            flattenedItems={flattenedItems}
                            fullyExpandedItems={fullyExpandedHierarchy.items}
                            collapsedIds={collapsedIds}
                            toggleCollapse={toggleCollapse}
                            onItemClick={handleItemClick}
                            isTaskListOpen={isTaskListOpen}
                            setIsTaskListOpen={setIsTaskListOpen}
                            surface="gantt"
                            rowHeight={ganttRowHeight}
                            listRef={taskListRef}
                        />

                        {/* Right Timeline */}
                        <div className="relative flex-1" style={{ minWidth: timelineWidth }}>
                            <GanttHeader mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />

                            <div className="relative" style={{ height: `calc(${Math.max(flattenedItems.length * ganttRowHeight, 100)}px + 65vh)` }}>

                                <GanttGrid mode={mode} gridStart={gridStart} totalUnits={totalUnits} colWidth={colWidth} />

                                <GanttRow groups={groups} colWidth={colWidth} mode={mode} gridStart={gridStart} rowHeight={ganttRowHeight} />

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
                                        taskListRef={taskListRef}
                                        onItemClick={handleItemClick}
                                        rowHeight={ganttRowHeight}
                                    />
                                ))}

                                <div className="mobile-pan-rail absolute bottom-0 left-0 right-0" data-mobile-pan-rail="gantt" aria-hidden="true" />
                            </div>
                        </div>
                    </div>
                </div>
            </div> : null}
        </div>
    );
};

export default GanttView;
