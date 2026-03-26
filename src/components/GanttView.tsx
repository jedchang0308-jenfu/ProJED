import React, { useRef, useEffect, useState, useMemo } from 'react';
import useBoardStore, { calculateCascadedDates } from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Calendar, Filter, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, LayoutList, RefreshCw } from 'lucide-react';
import SharedTaskSidebar from './SharedTaskSidebar';

// 方案 B 優化: 行高從 32px 縮減至 28px，增加視覺緊湊感
const BAR_HEIGHT = 28;
// Default fallback if no dates exist
const DEFAULT_GRID_START = dayjs().startOf('year');



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
        setSidebarOpen,
        toggleStatusFilter, // 加入 toggleStatusFilter
    } = useBoardStore();

    const [isTaskListOpen, setIsTaskListOpen] = useState(true);
    // 記錄被收疊的列表/卡片 ID
    const [collapsedIds, setCollapsedIds] = useState(new Set());

    // 切換收疊/展開狀態
    const toggleCollapse = (id) => {
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

    const [mode, setMode] = useState('Month'); // Month, Quarter, Year
    const [ganttFilters, setGanttFilters] = useState({ list: true, card: true, checklist: true });
    const [dragState, setDragState] = useState(null); // { type: 'move'|'left'|'right', item, ... }
    const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 });
    const [hoveredItemId, setHoveredItemId] = useState(null); // { id, type: 'task' }
    const [dragDeltaX, setDragDeltaX] = useState(0); // For smooth visual dragging
    const [dragDates, setDragDates] = useState(null); // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
    const [simulatedDates, setSimulatedDates] = useState(null); // Real-time preview
    const scrollAreaRef = useRef(null);
    const taskListRef = useRef(null);

    // ─── 效能優化：方案 B ────────────────────────────────────────────
    // dragStateRef：即時儲存當下拖曳資訊（不觸發 React re-render）
    // rafIdRef：記錄 requestAnimationFrame 的 ID，以便在 mouseup 時取消未執行的幀
    const dragStateRef = useRef(null);
    const rafIdRef = useRef(null);
    // ────────────────────────────────────────────────────────────────



    // Get active board data
    const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
    const activeBoard = activeWs?.boards.find(b => b.id === activeBoardId);

    // 狀態設定（與 BoardView 相同）
    const statuses = [
        { key: 'todo', label: '進行中', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    // Flatten data into rows with hierarchy info and calculate date boundaries
    // collapsedIds 作為依賴，收疊的層級將被隙过
    const { flattenedItems, groups, gridStart, totalUnits } = useMemo(() => {
        if (!activeBoard) return { flattenedItems: [], groups: { lists: [], cards: [] }, gridStart: DEFAULT_GRID_START, totalUnits: 60 };
        const items = [];
        const listGroups = [];
        const cardGroups = [];
        let currentRow = 0;

        let minDate = null;
        let maxDate = null;

        const updateBounds = (start, end) => {
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

        activeBoard.lists.forEach(list => {
            const listStatus = list.status || 'todo';
            const listStartRow = currentRow;
            const isListCollapsed = collapsedIds.has(list.id);

            updateBounds(list.startDate, list.endDate);

            // 列表主項
            if (ganttFilters.list && statusFilters[listStatus]) {
                items.push({ ...list, type: 'list', row: currentRow++ });
            }

            // 列表收疊時，跳過其下剀所有子項
            if (isListCollapsed) return;

            // 處理卡片與待辦
            const cards = list.cards || [];
            cards.forEach(card => {
                const cardStatus = card.status || 'todo';
                if (!statusFilters[cardStatus]) return;

                updateBounds(card.startDate, card.endDate);

                const cardStartRow = currentRow;
                const isCardCollapsed = collapsedIds.has(card.id);
                // 卡片主項
                if (ganttFilters.card) {
                    items.push({ ...card, type: 'card', row: currentRow++, listId: list.id });
                }

                // 卡片收疊時，跳過待辦清單
                if (!isCardCollapsed) {
                    // 待辦清單項
                    if (ganttFilters.checklist) {
                        (card.checklists || []).forEach(cl => {
                            (cl.items || []).forEach(cli => {
                                const cliStatus = cli.status || 'todo';
                                if (!statusFilters[cliStatus]) return;

                                updateBounds(cli.startDate, cli.endDate);
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

        // 決定最終邊界
        // 緩衝區：前面推 6 個月，後面推 12 個月，或以「今天」為基準
        const today = dayjs();
        const start = (minDate && minDate.isBefore(today)) ? minDate : today;
        const end = (maxDate && maxDate.isAfter(today)) ? maxDate : today;

        let calculatedGridStart = start.subtract(6, 'month').startOf('month');
        let calculatedGridEnd = end.add(12, 'month').endOf('month');

        // 對齊 Quarter 與 Year 邊界，確保表頭不會涵蓋錯誤的年份
        if (mode === 'Quarter') {
            calculatedGridStart = calculatedGridStart.startOf('month').subtract(calculatedGridStart.month() % 3, 'month');
            const endMonthDiff = 2 - (calculatedGridEnd.month() % 3);
            calculatedGridEnd = calculatedGridEnd.add(endMonthDiff, 'month').endOf('month');
        } else if (mode === 'Year') {
            calculatedGridStart = calculatedGridStart.startOf('year');
            calculatedGridEnd = calculatedGridEnd.endOf('year');
        }

        // 計算總格數
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
            totalUnits: units
        };
    }, [activeBoard, ganttFilters, statusFilters, mode, collapsedIds]);

    // Helpers for X coordinates
    const getX = (date, colWidth) => {
        if (!date) return 0;
        const d = dayjs(date);
        if (!d.isValid()) return 0;

        if (mode === 'Day') {
            const dDiff = d.diff(gridStart, 'day', true);
            return dDiff * colWidth;
        }

        const totalMonths = d.diff(gridStart, 'month');
        const startOfMonth = gridStart.add(totalMonths, 'month');
        const daysInMonth = startOfMonth.daysInMonth();
        const daysPassed = d.diff(startOfMonth, 'day');
        
        const mDiff = totalMonths + (daysPassed / daysInMonth);
        
        if (mode === 'Quarter') return (mDiff / 3) * colWidth;
        if (mode === 'Year') return (mDiff / 12) * colWidth;
        return mDiff * colWidth;
    };

    const getDateFromX = (x, colWidth) => {
        if (mode === 'Day') {
            const days = x / colWidth;
            return gridStart.add(days, 'day').format('YYYY-MM-DD');
        }

        let mDiff = x / colWidth;
        if (mode === 'Quarter') mDiff *= 3;
        if (mode === 'Year') mDiff *= 12;

        const totalMonths = Math.floor(mDiff);
        const fraction = mDiff - totalMonths;
        
        const startOfMonth = gridStart.add(totalMonths, 'month');
        const daysInMonth = startOfMonth.daysInMonth();
        // Snapping: inherently snaps to nearest integer day
        const daysPassed = Math.round(fraction * daysInMonth);
        
        return startOfMonth.add(daysPassed, 'day').format('YYYY-MM-DD');
    };

    const getColWidth = () => {
        if (mode === 'Day') return 60;
        if (mode === 'Quarter') return 250;
        if (mode === 'Year') return 600;
        return 160; // Month
    };

    const colWidth = getColWidth();

    // Helper: Generate alphabetical label (A, B... Z, AA, AB...)
    const getDependencyLabel = (index) => {
        let label = '';
        let num = index;
        while (num >= 0) {
            label = String.fromCharCode(97 + (num % 26)) + label;
            num = Math.floor(num / 26) - 1;
        }
        return label;
    };

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

    const scrollToNow = () => {
        if (scrollAreaRef.current) {
            const todayX = getX(dayjs(), colWidth);
            scrollAreaRef.current.scrollTo({
                left: todayX - scrollAreaRef.current.clientWidth / 2,
                behavior: 'smooth'
            });
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
            originalEndX: getX(dayjs(end).add(1, 'day'), colWidth)
        });
        
        setDragDates({
            start,
            end
        });
    };

    useEffect(() => {
        if (!dragState) return;

        // ─── 方案 B 核心：同步更新 ref，非同步更新 state ────────────────
        // 每次 mousemove 事件觸發時，立即將最新的滑鼠位置寫入 ref（零延遲）。
        // 接著透過 requestAnimationFrame 確保 setState（觸發 React re-render）
        // 的頻率上限為瀏覽器的刷新率（約 60fps），不會被每個 mousemove 事件淹沒。
        // ────────────────────────────────────────────────────────────────

        // 將 dragState 同步到 ref 供 rAF callback 讀取（避免 closure stale state）
        dragStateRef.current = dragState;

        /**
         * 計算拖曳後的暫時起訖日期
         * @param {number} clientX - 當前滑鼠 X 座標
         * @returns {{ tempStart: string, tempEnd: string }}
         */
        const calcDragDates = (clientX) => {
            const ds = dragStateRef.current;
            const rawDeltaX = clientX - ds.startX;
            let tempStart = ds.originalStart;
            let tempEnd = ds.originalEnd;

            if (ds.type === 'move') {
                tempStart = getDateFromX(ds.originalStartX + rawDeltaX, colWidth);
                const rawTempEnd = getDateFromX(ds.originalEndX + rawDeltaX, colWidth);
                tempEnd = dayjs(rawTempEnd).subtract(1, 'day').format('YYYY-MM-DD');
            } else if (ds.type === 'left') {
                tempStart = getDateFromX(ds.originalStartX + rawDeltaX, colWidth);
                if (dayjs(tempStart).isAfter(dayjs(tempEnd))) {
                    tempStart = dayjs(tempEnd).format('YYYY-MM-DD');
                }
            } else if (ds.type === 'right') {
                const rawTempEnd = getDateFromX(ds.originalEndX + rawDeltaX, colWidth);
                tempEnd = dayjs(rawTempEnd).subtract(1, 'day').format('YYYY-MM-DD');
                if (dayjs(tempEnd).isBefore(dayjs(tempStart))) {
                    tempEnd = dayjs(tempStart).format('YYYY-MM-DD');
                }
            }
            return { tempStart, tempEnd };
        };

        const handleMouseMove = (e) => {
            // 1. 自動捲動：滑鼠靠近邊緣時捲軸跟著移動
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

            // 2. 記錄最新滑鼠 X 到 ref（同步、不觸發 render）
            const latestClientX = e.clientX;
            const ds = dragStateRef.current;
            if (!ds) return;

            // 標記「確實發生過拖曳」，用於之後判斷是否觸發 onClick
            if (Math.abs(latestClientX - ds.startX) > 5) {
                ds.hasDragged = true;
            }

            // 3. 若尚無 pending 的 rAF，則發起一個新的幀更新
            //    如此確保每個瀏覽器幀（≈16.7ms）最多只做一次昂貴的 setState 呼叫
            if (rafIdRef.current !== null) return; // 已有 pending 幀，直接跳過

            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null; // 清除 ID，允許下一幀排隊

                const currentDs = dragStateRef.current;
                if (!currentDs) return; // mouseup 已先觸發，放棄本幀

                // 以最新的滑鼠位置計算日期（在 rAF 中讀 latestClientX）
                const { tempStart, tempEnd } = calcDragDates(latestClientX);

                // 更新拖曳日期 Tooltip
                setDragDates({ start: tempStart, end: tempEnd });

                // 計算串聯日期預覽（依賴 activeBoard，可能略重但已被 rAF 節流）
                if (activeBoard) {
                    const overriddenDates = {
                        [currentDs.item.id]: { startDate: tempStart, endDate: tempEnd }
                    };
                    const previewDatesMap = calculateCascadedDates(activeBoard, overriddenDates);
                    // 確保被拖曳的項目位置精確跟隨滑鼠
                    previewDatesMap.set(currentDs.item.id, { startDate: tempStart, endDate: tempEnd });

                    const previewObj = {};
                    previewDatesMap.forEach((val, key) => { previewObj[key] = val; });
                    setSimulatedDates(previewObj);
                }

                // 計算視覺上對齊快照（snapped）的位移量
                let snappedDeltaX = 0;
                if (currentDs.type === 'move' || currentDs.type === 'left') {
                    snappedDeltaX = getX(tempStart, colWidth) - currentDs.originalStartX;
                } else {
                    snappedDeltaX = getX(dayjs(tempEnd).add(1, 'day'), colWidth) - currentDs.originalEndX;
                }
                setDragDeltaX(snappedDeltaX);
            });
        };

        const handleMouseUp = (e) => {
            // 取消任何尚未執行的 rAF，避免在 state 清除後還觸發 setState
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }

            const ds = dragStateRef.current;
            if (ds) {
                // 以最終滑鼠位置重新計算，確保 mouseup 不受任何 rAF 延遲影響
                const { tempStart, tempEnd } = calcDragDates(e.clientX);

                // 計算 snapped 的最終 deltaX
                let finalSnappedDeltaX = 0;
                if (ds.type === 'move' || ds.type === 'left') {
                    finalSnappedDeltaX = getX(tempStart, colWidth) - ds.originalStartX;
                } else {
                    finalSnappedDeltaX = getX(dayjs(tempEnd).add(1, 'day'), colWidth) - ds.originalEndX;
                }

                const deltaX = finalSnappedDeltaX;
                const item = ds.item;

                let newStart = ds.originalStart;
                let newEnd = ds.originalEnd;

                if (ds.type === 'move') {
                    newStart = getDateFromX(ds.originalStartX + deltaX, colWidth);
                    const rawNewEnd = getDateFromX(ds.originalEndX + deltaX, colWidth);
                    newEnd = dayjs(rawNewEnd).subtract(1, 'day').format('YYYY-MM-DD');
                } else if (ds.type === 'left') {
                    newStart = getDateFromX(ds.originalStartX + deltaX, colWidth);
                    if (dayjs(newStart).isAfter(dayjs(newEnd))) {
                        newStart = dayjs(newEnd).format('YYYY-MM-DD');
                    }
                } else if (ds.type === 'right') {
                    const rawNewEnd = getDateFromX(ds.originalEndX + deltaX, colWidth);
                    newEnd = dayjs(rawNewEnd).subtract(1, 'day').format('YYYY-MM-DD');
                    if (dayjs(newEnd).isBefore(dayjs(newStart))) {
                        newEnd = dayjs(newStart).format('YYYY-MM-DD');
                    }
                }

                // 儲存最終日期至資料庫
                updateTaskDate(
                    activeWorkspaceId,
                    activeBoardId,
                    item.type,
                    item.id,
                    { startDate: newStart, endDate: newEnd },
                    item.listId,
                    item.cardId,
                    item.checklistId,
                    false,
                    { startDate: ds.originalStart, endDate: ds.originalEnd },
                    ds.type
                );
            }

            // 清除所有拖曳相關 state
            dragStateRef.current = null;
            setDragState(null);
            setDragDeltaX(0);
            setDragDates(null);
            setSimulatedDates(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            // cleanup：移除事件監聽並取消可能殘留的 rAF
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    // 刻意縮小依賴陣列：activeBoard / flattenedItems 透過 ref 在 rAF 內讀取，
    // 避免每次它們更新時重新掛載事件監聽器（這正是舊版頻繁脫鉤的根源之一）
    }, [dragState, colWidth, mode, activeWorkspaceId, activeBoardId, activeBoard]);

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
        const gridElements = [];
        let unitDuration = 'month';
        if (mode === 'Day') unitDuration = 'day';
        else if (mode === 'Year') unitDuration = 'year';
        else if (mode === 'Quarter') unitDuration = 'quarter';

        const endDate = gridStart.add(totalUnits, unitDuration).endOf('day');

        // Render vertical grid lines (Major)
        for (let i = 0; i < totalUnits; i++) {
            let minorLines = null;
            if (mode === 'Month') {
                const startOfMonth = gridStart.add(i, 'month');
                let curr = startOfMonth;
                let monthLines = [];
                // Add minor line on every Monday of the month (excluding the 1st day to avoid overlap with major line)
                while (curr.month() === startOfMonth.month()) {
                    if (curr.day() === 1 && curr.date() > 1) { // 1 is Monday
                        const fraction = (curr.date() - 1) / startOfMonth.daysInMonth();
                        monthLines.push(
                            <div key={`ml-${curr.date()}`} className="absolute top-0 bottom-0 border-r border-slate-50 border-dashed" style={{ left: `${fraction * 100}%` }} />
                        );
                    }
                    curr = curr.add(1, 'day');
                }
                minorLines = <div className="absolute inset-0 pointer-events-none">{monthLines}</div>;
            } else if (mode === 'Quarter') {
                const startOfQ = gridStart.add(i * 3, 'month');
                minorLines = (
                    <div className="absolute inset-0 pointer-events-none">
                        {[1, 2].map(mOffset => {
                            const mDate = startOfQ.add(mOffset, 'month');
                            const qX = getX(startOfQ, colWidth);
                            const mX = getX(mDate, colWidth);
                            const fraction = (mX - qX) / colWidth;
                            return <div key={`mq-${mOffset}`} className="absolute top-0 bottom-0 border-r border-slate-50" style={{ left: `${fraction * 100}%` }} />;
                        })}
                    </div>
                );
            } else if (mode === 'Year') {
                const startOfYear = gridStart.add(i, 'year');
                minorLines = (
                    <div className="absolute inset-0 pointer-events-none">
                        {[3, 6, 9].map(mOffset => {
                            const qDate = startOfYear.add(mOffset, 'month');
                            const yX = getX(startOfYear, colWidth);
                            const qX = getX(qDate, colWidth);
                            const fraction = (qX - yX) / colWidth;
                            return <div key={`my-${mOffset}`} className="absolute top-0 bottom-0 border-r border-slate-100/50" style={{ left: `${fraction * 100}%` }} />;
                        })}
                    </div>
                );
            }

            gridElements.push(
                <div
                    key={`grid-line-${i}`}
                    className="absolute top-0 bottom-0 border-r border-slate-100"
                    style={{ left: i * colWidth, width: colWidth }}
                >
                    {minorLines}
                </div>
            );
        }

        // Render weekend shading (day-level correctly)
        // Only if mode is Month or Day to avoid heavy rendering in deep views
        if (mode === 'Month' || mode === 'Day') {
            let currentDay = gridStart.startOf('day');
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
        }

        return gridElements;
    };
    // Render Header
    const renderHeader = () => {
        const headerItems = [];
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

        for (let i = 0; i < totalUnits; i++) {
            let label = "";
            let subLabel = "";
            if (mode === 'Day') {
                const d = gridStart.add(i, 'day');
                label = d.format('M/D');
                subLabel = weekDays[d.day()];
            } else if (mode === 'Month') {
                const d = gridStart.add(i, 'month');
                label = d.format('YYYY');
                subLabel = d.format('M月');
            } else if (mode === 'Quarter') {
                const d = gridStart.add(i * 3, 'month');
                label = d.format('YYYY');
                subLabel = `Q${Math.floor(d.month() / 3) + 1}`;
            } else {
                const d = gridStart.add(i, 'year');
                label = d.format('YYYY');
            }

            headerItems.push(
                <div key={i} className="flex-shrink-0 border-r border-slate-700 flex flex-col items-center justify-center bg-slate-800" style={{ width: colWidth }}>
                    <span className="text-[10px] font-bold text-slate-200">{label}</span>
                    <span className="text-xs font-bold text-slate-100">{subLabel}</span>
                </div>
            );
        }
        return headerItems;
    };

    const handleItemClick = (item) => {
        // Only open the modal if we have a valid card ID to edit.
        // We always want to open the parent Card's details page to unify the view.
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
            {/* Toolbar - 提升 z-index 以免被下方內容覆蓋，並改用 style 確保生效 */}
            <div 
                className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0"
                style={{ zIndex: 110 }}
            >
                {/* 左側：狀態篩選器 (從 BoardView 移植) */}
                <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-2 mr-4 flex-1">
                    {statuses.map(s => (
                        <button
                            key={s.key}
                            onClick={() => toggleStatusFilter(s.key)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${statusFilters[s.key]
                                ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                                : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${s.color}`}></div>
                            <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* 右側所有控制按鈕：視圖、時間軸、展開收合、篩選器 */}
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

                        <button
                            onClick={scrollToNow}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 hover:bg-primary/5 rounded-lg text-xs font-bold transition-all shadow-sm group"
                            title="跳轉至今天"
                        >
                            <Calendar size={14} className="group-hover:scale-110 transition-transform" />
                            <span>今天</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
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
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Task List Sidebar */}
                <SharedTaskSidebar
                    flattenedItems={flattenedItems}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    onItemClick={handleItemClick}
                    isTaskListOpen={isTaskListOpen}
                    setIsTaskListOpen={setIsTaskListOpen}
                    rowHeight={BAR_HEIGHT}
                />

                {/* Right: Timeline */}
                <div className="flex-1 overflow-hidden relative">
                    <div
                        ref={scrollAreaRef}
                        onScroll={handleScroll}
                        className="h-full overflow-scroll relative select-none bg-white scrollbar-gantt"
                    >
                        {/* Sticky Header - 提升 z-index 使其在滾動時覆蓋進度條與標籤，並使用實色背景 */}
                        <div 
                            className="sticky top-0 flex h-10 bg-slate-800 border-b-2 border-slate-900"
                            style={{ zIndex: 100 }}
                        >
                            {renderHeader()}
                        </div>

                        {/* Grid Content */}
                        <div className="relative" style={{ width: totalUnits * colWidth, minHeight: '100%', height: `calc(${Math.max(flattenedItems.length * BAR_HEIGHT, 100)}px + 65vh)` }}>
                            {/* Hierarchy Enclosures (Backgrounds) */}
                            <div className="absolute inset-0 pointer-events-none z-0">
                                {groups.lists.map(lg => {
                                    const start = lg.startDate || lg.endDate || dayjs().format('YYYY-MM-DD');
                                    const end = lg.endDate || dayjs(start).add(7, 'day').format('YYYY-MM-DD');
                                    const x1 = getX(start, colWidth);
                                    const x2 = getX(dayjs(end).add(1, 'day'), colWidth);
                                    const width = Math.max(x2 - x1, 24) + 20; // Extra padding

                                    return (
                                        <div
                                            key={lg.id}
                                            className="absolute bg-slate-100/40 rounded-lg border border-slate-300/50"
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
                                    const x2 = getX(dayjs(end).add(1, 'day'), colWidth);
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

                                // If we have simulated dates for this item, use them globally during drag
                                if (simulatedDates && simulatedDates[item.id]) {
                                    start = simulatedDates[item.id].startDate;
                                    end = simulatedDates[item.id].endDate;
                                }

                                // Fallback for checklist items without dates to make them discoverable
                                const isUsingFallback = item.type === 'checklist' && !start && !end;
                                if (isUsingFallback) {
                                    start = item.parentCardDates?.startDate || dayjs().format('YYYY-MM-DD');
                                    end = item.parentCardDates?.endDate || dayjs(start).add(1, 'day').format('YYYY-MM-DD');
                                }

                                if (!end) end = dayjs(start || undefined).add(7, 'day').format('YYYY-MM-DD');
                                if (!start) start = isMilestone ? end : dayjs(end).subtract(3, 'day').format('YYYY-MM-DD');

                                // 視覺層次設計（方案 C 優化版）：
                                // - 列表 (List):     深色實心底色（status 色 + brightness-75）+ 全白文字
                                // - 卡片 (Card):     白底 + 深色實線框（border-2 border-status-{status}）+ 深色文字
                                // - 待辦 (Checklist): 白底 + 淺色實線框（border border-status-{status}/50）+ 淺色文字

                                const status = item.status || 'todo';
                                const isCard = item.type === 'card';
                                const isChecklist = item.type === 'checklist';
                                const barHeight = 25; // 統一高度

                                // 使用靜態字典映射以避免 Tailwind CSS 掃描不到動態組成的 class name
                                const colorMap = {
                                    todo: {
                                        list: 'bg-status-todo brightness-75 saturate-150 text-white',
                                        card: 'bg-white border-2 border-status-todo text-status-todo font-extrabold',
                                        checklist: 'bg-white border border-status-todo/30 text-status-todo'
                                    },
                                    delayed: {
                                        list: 'bg-status-delayed brightness-75 saturate-150 text-white',
                                        card: 'bg-white border-2 border-status-delayed text-status-delayed font-extrabold',
                                        checklist: 'bg-white border border-status-delayed/30 text-status-delayed'
                                    },
                                    completed: {
                                        list: 'bg-status-completed brightness-75 saturate-150 text-white',
                                        card: 'bg-white border-2 border-status-completed text-status-completed font-extrabold',
                                        checklist: 'bg-white border border-status-completed/30 text-status-completed'
                                    },
                                    unsure: {
                                        list: 'bg-status-unsure brightness-75 saturate-150 text-white',
                                        card: 'bg-white border-2 border-status-unsure text-status-unsure font-extrabold',
                                        checklist: 'bg-white border border-status-unsure/30 text-status-unsure'
                                    },
                                    onhold: {
                                        list: 'bg-status-onhold brightness-75 saturate-150 text-white',
                                        card: 'bg-white border-2 border-status-onhold text-status-onhold font-extrabold',
                                        checklist: 'bg-white border border-status-onhold/30 text-status-onhold'
                                    }
                                };

                                // 取得該類型與狀態對應的基礎類別
                                const baseStyleClass = colorMap[status]?.[item.type] || colorMap.todo[item.type];

                                const x1 = getX(start, colWidth);
                                const x2 = getX(dayjs(end).add(1, 'day'), colWidth);
                                let width = isMilestone ? 10 : Math.max(x2 - x1, 24);

                                // Highlighting Logic
                                const isRelated = hoveredItemId && hoveredItemId.type === 'task' && item.id === hoveredItemId.id;
                                const isDragging = dragState && dragState.item.id === item.id;

                                // Find related dependencies and assign letters
                                const taskDependencies = (activeBoard?.dependencies || []).map((dep, idx) => ({
                                    ...dep,
                                    label: getDependencyLabel(idx),
                                    originalIndex: idx
                                })).filter(d => d.fromId === item.id || d.toId === item.id);

                                let isLeftLocked = false;
                                let isRightLocked = false;
                                let isMoveLocked = false;

                                taskDependencies.forEach(dep => {
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

                                // Visual offset during drag - Now handled by simulatedDates
                                let dragStyle = {};

                                return (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        data-task-id={item.id}
                                        onMouseDown={(e) => {
                                            if (isMoveLocked) return;
                                            handleDragStart(e, item, 'move');
                                        }}
                                        onMouseEnter={() => setHoveredItemId({ id: item.id, type: 'task' })}
                                        onMouseLeave={() => setHoveredItemId(null)}
                                        onClick={(e) => {
                                            // 1. 如果 dragState 存在，表示正在拖曳中，絕對不觸發點擊
                                            // 2. 如果之前發生過實質拖曳 (hasDragged) 也不觸發點擊
                                            // 我們利用 event 迴圈的小技巧：onClick 發生在 onMouseUp 之後。
                                            // 所以這裡我們改用 onMouseUp 自身來判定，或者在 onClick 裡檢查一個暫存標記。
                                        }}
                                        onMouseUp={(e) => {
                                            if (!dragState || !dragState.hasDragged) {
                                               handleItemClick(item);
                                            }
                                        }}
                                        className={`absolute flex items-center transition-all
                                            ${isDragging ? '' : (isMoveLocked ? '' : 'hover:brightness-110')}
                                            ${isMoveLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
                                            group
                                            ${isMilestone ? 'rotate-45' : 'rounded-[6px] shadow-sm'}
                                            ${baseStyleClass}
                                            ${isUsingFallback ? 'opacity-30 border-2 border-dashed border-slate-400/40' : ''}
                                            z-20
                                            ${isRelated ? 'ring-2 ring-primary ring-offset-1' : ''}
                                        `}
                                        style={{
                                            left: x1,
                                            width: width,
                                            height: barHeight,
                                            top: item.row * BAR_HEIGHT + (BAR_HEIGHT - barHeight) / 2,
                                            ...dragStyle,
                                            transition: isDragging ? 'none' : 'all 0.2s'
                                        }}
                                    >
                                        {/* Drag Date Tooltips */}
                                        {isDragging && dragDates && (
                                            <>
                                                <div className="absolute -top-7 left-0 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-50 transform -translate-x-1/2 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-slate-800">
                                                    {dayjs(dragDates.start).format('M/D')}
                                                </div>
                                                {/* 設計意圖：dragDates.end 在 calcDragDates 內已透過 subtract(1,'day') 轉為
                                                    「真實結束日」而非「下一天邊界」，此處直接格式化即可，不應再減一天。 */}
                                                <div className="absolute -top-7 right-0 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap z-50 transform translate-x-1/2 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-slate-800">
                                                    {dayjs(dragDates.end).format('M/D')}
                                                </div>
                                            </>
                                        )}

                                        {/* Resize Handles */}
                                        {!isMilestone && !isUsingFallback && (
                                            <>
                                                <div
                                                    className={`absolute left-0 top-0 bottom-0 w-2 ${isLeftLocked ? 'cursor-not-allowed bg-slate-400/20' : 'cursor-ew-resize hover:bg-white/30'} rounded-l-[6px]`}
                                                    onMouseDown={(e) => {
                                                        // 無論 locked 與否，均必須阻止事件冒泡到父層 (進度條本體)。
                                                        // 若不阻止，mousedown 會冒泡並觸發父層的 handleDragStart(move)，
                                                        // 覆蓋此處的 'left' 拖曳類型，造成「點 resize 卻整條平移」的 bug。
                                                        e.stopPropagation();
                                                        if (isLeftLocked) return;
                                                        handleDragStart(e, item, 'left');
                                                    }}
                                                />
                                                <div
                                                    className={`absolute right-0 top-0 bottom-0 w-2 ${isRightLocked ? 'cursor-not-allowed bg-slate-400/20' : 'cursor-ew-resize hover:bg-white/30'} rounded-r-[6px]`}
                                                    onMouseDown={(e) => {
                                                        // 同上：阻止冒泡是必要的，否則右側 resize 也會觸發 move。
                                                        e.stopPropagation();
                                                        if (isRightLocked) return;
                                                        handleDragStart(e, item, 'right');
                                                    }}
                                                />
                                            </>
                                        )}

                                        {/* Dependency Badges */}
                                        {taskDependencies.length > 0 && !isMilestone && (() => {
                                            const leftDeps = [];
                                            const rightDeps = [];

                                            taskDependencies.forEach(dep => {
                                                // 判斷此任務在「起始」端點扮演的角色
                                                if (dep.fromId === item.id && (dep.fromSide === 'start' || !dep.fromSide)) {
                                                    leftDeps.push({ ...dep, isMarkerSource: true });
                                                } else if (dep.toId === item.id && (dep.toSide === 'start' || !dep.toSide)) {
                                                    leftDeps.push({ ...dep, isMarkerSource: false });
                                                }
                                                                         
                                                // 判斷此任務在「完成」端點扮演的角色
                                                if (dep.fromId === item.id && dep.fromSide === 'end') {
                                                    rightDeps.push({ ...dep, isMarkerSource: true });
                                                } else if (dep.toId === item.id && dep.toSide === 'end') {
                                                    rightDeps.push({ ...dep, isMarkerSource: false });
                                                } 
                                            });

                                            return (
                                                <>
                                                    {leftDeps.length > 0 && (
                                                        <div className="absolute left-[-6px] -top-2 flex gap-0.5 z-40">
                                                            {leftDeps.map(dep => (
                                                                <div
                                                                    key={`dep-l-${dep.id}`}
                                                                    className={`w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold bg-white transition-all ${dep.isMarkerSource 
                                                                        ? 'border-2 border-slate-600 text-slate-800' 
                                                                        : 'border border-slate-200 text-slate-400'}`}
                                                                    title={dep.isMarkerSource ? `主動前置任務 (編號: ${dep.label})` : `被動後續任務 (編號: ${dep.label})`}
                                                                >
                                                                    {dep.label}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {rightDeps.length > 0 && (
                                                        <div className="absolute right-[-6px] -top-2 flex gap-0.5 z-40">
                                                            {rightDeps.map(dep => (
                                                                <div
                                                                    key={`dep-r-${dep.id}`}
                                                                    className={`w-[14px] h-[14px] flex items-center justify-center rounded-full text-[8px] font-bold bg-white transition-all ${dep.isMarkerSource 
                                                                        ? 'border-2 border-slate-600 text-slate-800' 
                                                                        : 'border border-slate-200 text-slate-400'}`}
                                                                    title={dep.isMarkerSource ? `主動前置任務 (編號: ${dep.label})` : `被動後續任務 (編號: ${dep.label})`}
                                                                >
                                                                    {dep.label}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}

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
                                                        className={`absolute whitespace-nowrap text-[11px] font-bold pointer-events-none select-none px-2 transition-transform duration-75
                                                            ${item.type === 'list'
                                                                ? 'text-white drop-shadow-sm'         // 列表：白底色深，文字白+阴影
                                                                : item.type === 'card'
                                                                    ? `${colorMap[status]?.card.match(/text-status-\w+/)?.[0] || 'text-status-todo'} font-extrabold` // 卡片：外框色系文字，加粗增强辨识
                                                                    : `${colorMap[status]?.checklist.match(/text-status-\w+/)?.[0] || 'text-status-todo'} opacity-80`}   // 待办：淡色文字
                                                        `}
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
                                                        className={`absolute ${isBarOnLeft ? 'left-full ml-3' : 'right-full mr-3'} text-[12px] font-bold whitespace-nowrap pointer-events-none select-none
                                                            ${item.type === 'list'
                                                                ? `${colorMap[status]?.list.match(/bg-status-\w+/)?.[0].replace('bg-', 'text-') || 'text-status-todo'} brightness-75` // 列表借用深底色
                                                                : item.type === 'card'
                                                                    ? `${colorMap[status]?.card.match(/text-status-\w+/)?.[0] || 'text-status-todo'} font-extrabold` // 卡片原色
                                                                    : `${colorMap[status]?.checklist.match(/text-status-\w+/)?.[0] || 'text-status-todo'} opacity-80`}   // 待办淡色
                                                        `}
                                                    >
                                                        {item.title} {isUsingFallback && "(尚未設定日期)"}
                                                    </div>
                                                );
                                            }
                                        })()}

                                        {/* Milestone Label (Always external) */}
                                        {isMilestone && (
                                            <div className="absolute left-full ml-3 text-[12px] font-bold text-slate-500 whitespace-nowrap -rotate-45 pointer-events-none select-none">
                                                {item.title}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Now Line */}
                             <div
                                 className="absolute top-0 bottom-0 w-px bg-red-400/50 z-10 pointer-events-none"
                                 style={{ left: getX(dayjs(), colWidth) }}
                             >
                                 <div className="sticky top-[42px] bg-red-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full transform -translate-x-1/2 shadow-sm border border-white">今</div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GanttView;
