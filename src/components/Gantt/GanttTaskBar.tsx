import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'lucide-react';
import dayjs from 'dayjs';
import useBoardStore, { calculateCascadedDates } from '../../store/useBoardStore';
import { getX, getDateFromX, getDependencyLabel, GANTT_COLOR_MAP, BAR_HEIGHT } from './utils';

interface TaskItem {
    id: string;
    type: string;
    status?: string | null;
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    listId?: string;
    cardId?: string;
    checklistId?: string;
    row: number;
    parentCardDates?: { startDate: string | null; endDate: string | null };
}

interface GanttTaskBarProps {
    item: TaskItem;
    colWidth: number;
    mode: string;
    gridStart: dayjs.Dayjs;
    gridEnd: dayjs.Dayjs;
    activeBoard: any;
    activeWorkspaceId: string;
    setSimulatedDates: (dates: any) => void;
    simulatedDates: any;
    showDependencies: boolean;
    viewport: { scrollLeft: number; width: number };
    scrollAreaRef: React.RefObject<HTMLDivElement | null>;
    onItemClick: (item: TaskItem) => void;
}

const GanttTaskBar: React.FC<GanttTaskBarProps> = ({
    item, colWidth, mode, gridStart, gridEnd, activeBoard, activeWorkspaceId,
    setSimulatedDates, simulatedDates, showDependencies, viewport, scrollAreaRef, onItemClick
}) => {
    const { updateTaskDate } = useBoardStore();

    // Hover state
    const [isHovered, setIsHovered] = useState(false);

    // Dragging State
    const [dragState, setDragState] = useState<any>(null);
    const [dragDates, setDragDates] = useState<{ start: string; end: string } | null>(null);
    const [dragDeltaX, setDragDeltaX] = useState(0);

    const dragStateRef = useRef<any>(null);
    const rafIdRef = useRef<number | null>(null);

    const isMilestone = false;
    let start = item.startDate;
    let end = item.endDate;

    if (simulatedDates && simulatedDates[item.id]) {
        start = simulatedDates[item.id].startDate;
        end = simulatedDates[item.id].endDate;
    }

    const hasNoDates = !start && !end;
    let isInfiniteFallback = false;

    if (hasNoDates) {
        if (item.type === 'checklist' && item.parentCardDates?.startDate && item.parentCardDates?.endDate) {
            start = item.parentCardDates.startDate;
            end = item.parentCardDates.endDate;
        } else {
            start = dayjs(gridStart).format('YYYY-MM-DD');
            end = dayjs(gridEnd).format('YYYY-MM-DD');
            isInfiniteFallback = true;
        }
    } else {
        if (!end) end = dayjs(start!).add(7, 'day').format('YYYY-MM-DD');
        if (!start) start = dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');
    }

    const status = item.status || 'todo';
    const baseStyleClass = GANTT_COLOR_MAP[status]?.[item.type] || GANTT_COLOR_MAP.todo[item.type];
    
    // Position
    const x1 = getX(start, colWidth, mode, gridStart);
    const x2 = getX(dayjs(end).add(1, 'day'), colWidth, mode, gridStart);
    let width = Math.max(x2 - x1, 24);
    const barHeight = 25; // fixed

    const isDragging = dragState && dragState.item.id === item.id;
    const isRelated = isHovered;

    // Dependencies Logic
    const taskDependencies = (activeBoard?.dependencies || []).map((dep: any, idx: number) => ({
        ...dep,
        label: getDependencyLabel(idx),
        originalIndex: idx
    })).filter((d: any) => d.fromId === item.id || d.toId === item.id);

    let isLeftLocked = false;
    let isRightLocked = false;
    let isMoveLocked = false;

    taskDependencies.forEach((dep: any) => {
        if (dep.toId === item.id && dep.fromId !== item.id) {
            if (dep.toSide === 'start' || !dep.toSide) {
                isLeftLocked = true;
                isMoveLocked = true;
            }
            if (dep.toSide === 'end') {
                isRightLocked = true;
                isMoveLocked = true;
            }
        }
        if (dep.fromId === item.id && dep.toId === item.id) {
            if (dep.fromSide === 'start' && dep.toSide === 'end') isRightLocked = true;
            if (dep.fromSide === 'end' && dep.toSide === 'start') isLeftLocked = true;
        }
    });

    const handleDragStart = (e: React.MouseEvent, type: string) => {
        e.stopPropagation();

        const s = item.startDate || (isMilestone ? item.endDate : dayjs(item.endDate).subtract(3, 'day').format('YYYY-MM-DD'));
        const eDate = item.endDate || dayjs(s).add(3, 'day').format('YYYY-MM-DD');

        const initialDragState = {
            type, // 'move', 'left', 'right'
            item,
            startX: e.clientX,
            startY: e.clientY,
            originalStart: s,
            originalEnd: eDate,
            originalStartX: getX(s, colWidth, mode, gridStart),
            originalEndX: getX(dayjs(eDate).add(1, 'day'), colWidth, mode, gridStart),
            hasDragged: false
        };

        setDragState(initialDragState);
        setDragDates({ start: s!, end: eDate! });
    };

    useEffect(() => {
        if (!dragState) return;

        dragStateRef.current = dragState;

        const calcDragDates = (clientX: number) => {
            const ds = dragStateRef.current;
            const rawDeltaX = clientX - ds.startX;
            let tempStart = ds.originalStart;
            let tempEnd = ds.originalEnd;

            if (ds.type === 'move') {
                tempStart = getDateFromX(ds.originalStartX + rawDeltaX, colWidth, mode, gridStart);
                const rawTempEnd = getDateFromX(ds.originalEndX + rawDeltaX, colWidth, mode, gridStart);
                tempEnd = dayjs(rawTempEnd).subtract(1, 'day').format('YYYY-MM-DD');
            } else if (ds.type === 'left') {
                tempStart = getDateFromX(ds.originalStartX + rawDeltaX, colWidth, mode, gridStart);
                if (dayjs(tempStart).isAfter(dayjs(tempEnd))) {
                    tempStart = dayjs(tempEnd).format('YYYY-MM-DD');
                }
            } else if (ds.type === 'right') {
                const rawTempEnd = getDateFromX(ds.originalEndX + rawDeltaX, colWidth, mode, gridStart);
                tempEnd = dayjs(rawTempEnd).subtract(1, 'day').format('YYYY-MM-DD');
                if (dayjs(tempEnd).isBefore(dayjs(tempStart))) {
                    tempEnd = dayjs(tempStart).format('YYYY-MM-DD');
                }
            }
            return { tempStart, tempEnd };
        };

        const handleMouseMove = (e: MouseEvent) => {
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

            const latestClientX = e.clientX;
            const ds = dragStateRef.current;
            if (!ds) return;

            if (Math.abs(latestClientX - ds.startX) > 5) {
                ds.hasDragged = true;
            }

            if (rafIdRef.current !== null) return; 

            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null; 

                const currentDs = dragStateRef.current;
                if (!currentDs) return; 

                const { tempStart, tempEnd } = calcDragDates(latestClientX);
                setDragDates({ start: tempStart, end: tempEnd });

                if (activeBoard) {
                    const overriddenDates = {
                        [currentDs.item.id]: { startDate: tempStart, endDate: tempEnd }
                    };
                    const previewDatesMap = calculateCascadedDates(activeBoard, overriddenDates);
                    previewDatesMap.set(currentDs.item.id, { startDate: tempStart, endDate: tempEnd });

                    const previewObj: any = {};
                    previewDatesMap.forEach((val: any, key: string) => { previewObj[key] = val; });
                    setSimulatedDates(previewObj);
                }

                let snappedDeltaX = 0;
                if (currentDs.type === 'move' || currentDs.type === 'left') {
                    snappedDeltaX = getX(tempStart, colWidth, mode, gridStart) - currentDs.originalStartX;
                } else {
                    snappedDeltaX = getX(dayjs(tempEnd).add(1, 'day'), colWidth, mode, gridStart) - currentDs.originalEndX;
                }
                setDragDeltaX(snappedDeltaX);
            });
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }

            const ds = dragStateRef.current;
            if (ds) {
                const { tempStart, tempEnd } = calcDragDates(e.clientX);
                let finalSnappedDeltaX = 0;
                if (ds.type === 'move' || ds.type === 'left') {
                    finalSnappedDeltaX = getX(tempStart, colWidth, mode, gridStart) - ds.originalStartX;
                } else {
                    finalSnappedDeltaX = getX(dayjs(tempEnd).add(1, 'day'), colWidth, mode, gridStart) - ds.originalEndX;
                }

                const deltaX = finalSnappedDeltaX;
                const itm = ds.item;

                let newStart = ds.originalStart;
                let newEnd = ds.originalEnd;

                if (ds.type === 'move') {
                    newStart = getDateFromX(ds.originalStartX + deltaX, colWidth, mode, gridStart);
                    const rawNewEnd = getDateFromX(ds.originalEndX + deltaX, colWidth, mode, gridStart);
                    newEnd = dayjs(rawNewEnd).subtract(1, 'day').format('YYYY-MM-DD');
                } else if (ds.type === 'left') {
                    newStart = getDateFromX(ds.originalStartX + deltaX, colWidth, mode, gridStart);
                    if (dayjs(newStart).isAfter(dayjs(newEnd))) {
                        newStart = dayjs(newEnd).format('YYYY-MM-DD');
                    }
                } else if (ds.type === 'right') {
                    const rawNewEnd = getDateFromX(ds.originalEndX + deltaX, colWidth, mode, gridStart);
                    newEnd = dayjs(rawNewEnd).subtract(1, 'day').format('YYYY-MM-DD');
                    if (dayjs(newEnd).isBefore(dayjs(newStart))) {
                        newEnd = dayjs(newStart).format('YYYY-MM-DD');
                    }
                }

                updateTaskDate(
                    activeWorkspaceId,
                    activeBoard?.id,
                    itm.type,
                    itm.id,
                    { startDate: newStart, endDate: newEnd },
                    itm.listId,
                    itm.cardId,
                    itm.checklistId,
                    false,
                    { startDate: ds.originalStart, endDate: ds.originalEnd },
                    ds.type
                );
            }

            dragStateRef.current = null;
            setDragState(null);
            setDragDeltaX(0);
            setDragDates(null);
            setSimulatedDates(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [dragState, colWidth, mode, activeWorkspaceId, activeBoard, setSimulatedDates, updateTaskDate, gridStart, scrollAreaRef]);


    const renderDependencies = () => {
        if (taskDependencies.length === 0 || isMilestone) return null;
        
        const leftDeps: any[] = [];
        const rightDeps: any[] = [];
        const selfWorkDays = taskDependencies
            .filter((d: any) => d.fromId === item.id && d.toId === item.id && d.fromSide === 'start' && d.toSide === 'end')
            .map((d: any) => d.offset ?? 0);

        taskDependencies.forEach((dep: any) => {
            const isSelf = dep.fromId === dep.toId;
            if (isSelf) return;

            if (dep.fromId === item.id && (dep.fromSide === 'start' || !dep.fromSide)) {
                leftDeps.push({ ...dep, isMarkerSource: true });
            } else if (dep.toId === item.id && (dep.toSide === 'start' || !dep.toSide)) {
                leftDeps.push({ ...dep, isMarkerSource: false });
            }
                                        
            if (dep.fromId === item.id && dep.fromSide === 'end') {
                rightDeps.push({ ...dep, isMarkerSource: true });
            } else if (dep.toId === item.id && dep.toSide === 'end') {
                rightDeps.push({ ...dep, isMarkerSource: false });
            } 
        });

        return (
            <>
                {showDependencies && selfWorkDays.length > 0 && (
                    <div
                        className="absolute right-1 top-1/2 -translate-y-1/2 z-30 pointer-events-none"
                        title={`執行天數：${selfWorkDays[0]} 工作天`}
                    >
                        <span className="px-1 py-0.5 bg-black/20 text-white text-[8px] font-bold rounded whitespace-nowrap truncate">
                            {selfWorkDays[0]} 工作天
                        </span>
                    </div>
                )}

                {showDependencies ? (
                    <>
                        {leftDeps.length > 0 && (
                            <div className="absolute left-[-6px] -top-2 flex gap-0.5 z-40">
                                {leftDeps.map((dep: any) => (
                                    <div
                                        key={`dep-l-${dep.id}`}
                                        className={`w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold bg-white transition-all ${dep.isMarkerSource 
                                            ? 'border-2 border-slate-600 text-slate-800' 
                                            : 'border border-slate-200 text-slate-400'}`}
                                        title={dep.isMarkerSource ? `前置任務 (編號: ${dep.label})` : `後置任務 (編號: ${dep.label})`}
                                    >
                                        {dep.label}
                                    </div>
                                ))}
                            </div>
                        )}
                        {rightDeps.length > 0 && (
                            <div className="absolute right-[-6px] -top-2 flex gap-0.5 z-40">
                                {rightDeps.map((dep: any) => (
                                    <div
                                        key={`dep-r-${dep.id}`}
                                        className={`w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold bg-white transition-all ${dep.isMarkerSource 
                                            ? 'border-2 border-slate-600 text-slate-800' 
                                            : 'border border-slate-200 text-slate-400'}`}
                                        title={dep.isMarkerSource ? `前置任務 (編號: ${dep.label})` : `後置任務 (編號: ${dep.label})`}
                                    >
                                        {dep.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    (leftDeps.length > 0 || rightDeps.length > 0) && (
                        <div className="absolute left-[-6px] -top-2 z-40 text-amber-400/80" title="此任務具有依賴關係">
                            <Link size={10} />
                        </div>
                    )
                )}
            </>
        );
    };

    const renderSmartLabel = () => {
        if (isMilestone) return null;
        
        const TEXT_ESTIMATE = item.title.length * 12;
        const canFitInside = width > TEXT_ESTIMATE + 20;

        if (canFitInside) {
            const viewStart = viewport.scrollLeft;
            const viewEnd = viewport.scrollLeft + viewport.width;
            const visibleStart = Math.max(x1, viewStart);
            const visibleEnd = Math.min(x1 + width, viewEnd);
            const visibleWidth = visibleEnd - visibleStart;

            const textStyles: any = {};
            if (visibleWidth > TEXT_ESTIMATE) {
                const targetCenter = (visibleStart + visibleEnd) / 2;
                const relativeX = targetCenter - x1;
                textStyles.transform = `translateX(${relativeX}px) translateX(-50%)`;
                textStyles.left = 0;
            } else {
                textStyles.left = '50%';
                textStyles.transform = 'translateX(-50%)';
            }

            return (
                <span
                    className={`absolute whitespace-nowrap text-[11px] font-bold pointer-events-none select-none px-2 transition-transform duration-75
                        ${item.type === 'list'
                            ? 'text-white drop-shadow-sm'
                            : item.type === 'card'
                                ? `${GANTT_COLOR_MAP[status]?.card.match(/text-status-\w+/)?.[0] || 'text-status-todo'} font-extrabold`
                                : `${GANTT_COLOR_MAP[status]?.checklist.match(/text-status-\w+/)?.[0] || 'text-status-todo'} opacity-80`}
                    `}
                    style={textStyles}
                >
                    {item.title}
                </span>
            );
        } else {
            const viewCenter = viewport.scrollLeft + viewport.width / 2;
            const barCenter = x1 + width / 2;
            const isBarOnLeft = barCenter < viewCenter;

            return (
                <div
                    className={`absolute ${isBarOnLeft ? 'left-full ml-3' : 'right-full mr-3'} text-[12px] font-bold whitespace-nowrap pointer-events-none select-none
                        ${item.type === 'list'
                            ? `${GANTT_COLOR_MAP[status]?.list.match(/bg-status-\w+/)?.[0].replace('bg-', 'text-') || 'text-status-todo'} brightness-75`
                            : item.type === 'card'
                                ? `${GANTT_COLOR_MAP[status]?.card.match(/text-status-\w+/)?.[0] || 'text-status-todo'} font-extrabold`
                                : `${GANTT_COLOR_MAP[status]?.checklist.match(/text-status-\w+/)?.[0] || 'text-status-todo'} opacity-80`}
                    `}
                >
                    {item.title} {isInfiniteFallback && "(尚未設定日期)"}
                </div>
            );
        }
    };

    return (
        <div
            data-task-id={item.id}
            onMouseDown={(e) => {
                if (isMoveLocked) return;
                handleDragStart(e, 'move');
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseUp={(e) => {
                if (!dragState || !dragState.hasDragged) {
                    onItemClick(item);
                }
            }}
            className={`absolute flex items-center transition-all ${isDragging ? '' : (isMoveLocked ? '' : 'hover:brightness-110')} ${isMoveLocked ? 'cursor-not-allowed' : 'cursor-pointer'} group rounded-[6px] shadow-sm ${baseStyleClass} ${isInfiniteFallback ? 'opacity-30 border-2 border-dashed border-slate-400/40' : ''} z-20 ${isRelated ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            style={{
                left: x1,
                width: width,
                height: barHeight,
                top: item.row * BAR_HEIGHT + (BAR_HEIGHT - barHeight) / 2,
                transition: isDragging ? 'none' : 'all 0.2s'
            }}
        >
            {isDragging && dragDates && (
                <>
                    <div className="absolute -top-7 left-0 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-50 transform -translate-x-1/2 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-slate-800">
                        {dayjs(dragDates.start).format('M/D')}
                    </div>
                    <div className="absolute -top-7 right-0 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-50 transform translate-x-1/2 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-slate-800">
                        {dayjs(dragDates.end).format('M/D')}
                    </div>
                </>
            )}

            {!isMilestone && !isInfiniteFallback && (
                <>
                    <div
                        className={`absolute left-0 top-0 bottom-0 w-2 ${isLeftLocked ? 'cursor-not-allowed bg-slate-400/20' : 'cursor-ew-resize hover:bg-white/30'} rounded-l-[6px]`}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            if (isLeftLocked) return;
                            handleDragStart(e, 'left');
                        }}
                    />
                    <div
                        className={`absolute right-0 top-0 bottom-0 w-2 ${isRightLocked ? 'cursor-not-allowed bg-slate-400/20' : 'cursor-ew-resize hover:bg-white/30'} rounded-r-[6px]`}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            if (isRightLocked) return;
                            handleDragStart(e, 'right');
                        }}
                    />
                </>
            )}

            {renderDependencies()}
            {renderSmartLabel()}
        </div>
    );
};

export default GanttTaskBar;
