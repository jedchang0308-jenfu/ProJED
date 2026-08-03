/**
 * BoardView — Kanban 看板視圖（WBS 版本）
 * 設計意圖：將資料來源從 useBoardStore (List/Card) 切換至 useWbsStore (TaskNode)。
 * 
 * 階層映射規則：
 * - Level 1 (根節點, parentId === null) → 列表欄 (KanbanColumn)
 * - Level 2 (根節點的子節點)            → 卡片 (KanbanCard)
 * - Level 3+ (更深子節點)               → 下層任務 (KanbanChecklist)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useMobilePanBroker } from '../hooks/useMobilePanBroker';
import { useKanbanMousePan } from '../hooks/useKanbanMousePan';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useRecordStore from '../store/useRecordStore';
import useDialogStore from '../store/useDialogStore';
import { useTagStore } from '../store/useTagStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import { KanbanInsertionMarker } from './Wbs/KanbanInsertionMarker';
import TaskWorkbenchPanel from './TaskWorkbenchPanel';
import { compactClassNames } from './ui/compactTokens';
import type { TaskNode } from '../types';
import { prepareNewTaskNaming } from '../utils/taskInteractions';
import { projectTaskFilterResults } from '../features/taskFilters';
import { MobileTaskActionContext } from './Wbs/mobileTaskActionContext';
import { TaskDragPresenter } from './Wbs/taskDrag/TaskDragPresenter';
import { commitDesktopTaskDrag } from './Wbs/taskDrag/taskDragCommit';
import {
    desktopTaskDropPreviewMatches,
    findDesktopTaskDropElement,
    resolveDesktopTaskDropIntent,
    resolveDesktopTaskDropPreview,
    type DesktopTaskDropPreview,
} from './Wbs/taskDrag/desktopTaskDropPreview';
import { useTaskDragSession } from './Wbs/taskDrag/useTaskDragSession';

/**
 * 依賴關係選取 Context—讓 KanbanCard 能存取当前選取狀態與處理函式
 * 設計意圖：複用 WbsListView 的依賴模块，但適用於看板的 UI 互動模式。
 */
export const KanbanDependencyContext = React.createContext<{
    dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
    handleKanbanDependencySelect: (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => void;
    dependencies: import('../types').Dependency[];
} | null>(null);

const recordDesktopTaskDragDebug = (entry: Record<string, unknown>) => {
    if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
    const debugWindow = window as any;
    debugWindow.__projedDesktopTaskDragDebug = [
        ...(debugWindow.__projedDesktopTaskDragDebug || []),
        { ...entry, at: Date.now() },
    ].slice(-80);
};

const DESKTOP_INDICATOR_RECT_RETAIN_PX = 2;

const shouldRetainDesktopIndicatorRect = (
    current: DesktopTaskDropPreview['indicatorRect'],
    next: DesktopTaskDropPreview['indicatorRect'],
) => (
    Math.abs(current.left - next.left) <= DESKTOP_INDICATOR_RECT_RETAIN_PX
    && Math.abs(current.top - next.top) <= DESKTOP_INDICATOR_RECT_RETAIN_PX
    && Math.abs(current.width - next.width) <= DESKTOP_INDICATOR_RECT_RETAIN_PX
);

const BoardView = () => {
    const mobilePanSurfaceRef = useMobilePanBroker<HTMLDivElement>();
    const mousePanSurfaceRef = useKanbanMousePan<HTMLDivElement>();
    const { activeBoardId, activeWorkspaceId } = useBoardStore();
    const dependencySelection = useBoardStore(s => s.dependencySelection);
    const setDependencySelection = useBoardStore(s => s.setDependencySelection);
    const toggleStartDate = useBoardStore(s => s.toggleStartDate);
    const showStartDate = useBoardStore(s => s.showStartDate);
    const { addDependency, dependencies } = useWbsStore();
    const isRecordTaskSelectionMode = useRecordStore(s => s.isTaskSelectionMode);
    const recordDraft = useRecordStore(s => s.draft);
    const exitRecordTaskSelectionMode = useRecordStore(s => s.exitTaskSelectionMode);
    const addNode = useWbsStore(s => s.addNode);
    const updateNode = useWbsStore(s => s.updateNode);
    const batchUpdateNodes = useWbsStore(s => s.batchUpdateNodes);
    const removeNode = useWbsStore(s => s.removeNode);
    const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
    const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, canCreateDependency } = useBoardPermissions();
    const sensors = useDragSensors();
    const [activeDrag, setActiveDrag] = useState<any>(null);
    const [desktopDropPreview, setDesktopDropPreview] = useState<DesktopTaskDropPreview | null>(null);
    const desktopDropPreviewRef = React.useRef<DesktopTaskDropPreview | null>(null);
    const desktopDragSourceRectRef = React.useRef<{
        left: number;
        right: number;
        top: number;
        bottom: number;
    } | null>(null);
    const updateDesktopDropPreview = React.useCallback((preview: DesktopTaskDropPreview | null) => {
        const currentPreview = desktopDropPreviewRef.current;
        const nextPreview = currentPreview
            && preview
            && desktopTaskDropPreviewMatches(currentPreview, preview)
            && shouldRetainDesktopIndicatorRect(currentPreview.indicatorRect, preview.indicatorRect)
            ? { ...preview, indicatorRect: currentPreview.indicatorRect }
            : preview;
        desktopDropPreviewRef.current = nextPreview;
        setDesktopDropPreview(nextPreview);
    }, []);
    const taskDragSession = useTaskDragSession({
        boardSurfaceRef: mobilePanSurfaceRef,
        activeBoardId,
        activeWorkspaceId,
        canMoveTask,
        canEditTask,
        canCreateTask,
        canDeleteTask,
        addNode,
        updateNode,
        batchUpdateNodes,
        removeNode,
        recalculateAncestorStatus,
        onSessionBegin: () => {
            setActiveDrag(null);
            updateDesktopDropPreview(null);
        },
    });

    const setBoardCanvasRef = React.useCallback((element: HTMLDivElement | null) => {
        mobilePanSurfaceRef.current = element;
        mousePanSurfaceRef.current = element;
    }, [mobilePanSurfaceRef, mousePanSurfaceRef]);

    // ===== 依賴關係選取邏輯 =====
    const handleKanbanDependencySelect = React.useCallback(async (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => {
        if (!canCreateDependency) {
            setDependencySelection(null);
            return;
        }
        if (!dependencySelection) {
            // 進入選取模式，並自動開啟開始日期顯示
            if (!showStartDate) toggleStartDate();
            setDependencySelection({ id: targetId, side: targetSide, title: targetTitle });
        } else {
            // 已在選取模式，配對目標
            if (dependencySelection.id === targetId && dependencySelection.side === targetSide) {
                setDependencySelection(null);
                return;
            }
            const isSelf = dependencySelection.id === targetId;
            if (isSelf && targetSide === 'end' && dependencySelection.side === 'start') {
                useDialogStore.getState().showConfirm('請由「結束日」的方向來設定工期，不要從開始日連到結束日。');
                setDependencySelection(null);
                return;
            }
            const promptMsg = isSelf
                ? `請設定任務 [${dependencySelection.title}] 的工作天數：`
                : `[${dependencySelection.title}] 依賴於 [${targetTitle}] 的間隔工作天數：\n(零天銜接，負數重疊，正數延遲)`;
            const offsetStr = await useDialogStore.getState().showPrompt(promptMsg, '0');
            if (offsetStr !== null && offsetStr.trim() !== '') {
                const offset = parseInt(offsetStr, 10);
                if (!isNaN(offset)) {
                    addDependency({
                        id: `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                        fromId: targetId,
                        fromSide: targetSide,
                        toId: dependencySelection.id,
                        toSide: dependencySelection.side,
                        offset,
                    });
                }
            }
            setDependencySelection(null);
        }
    }, [canCreateDependency, dependencySelection, dependencies, addDependency, setDependencySelection, showStartDate, toggleStartDate]);

    // ESC 取消選取模式
    React.useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (isRecordTaskSelectionMode) {
                exitRecordTaskSelectionMode(true);
                return;
            }
            setDependencySelection(null);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [exitRecordTaskSelectionMode, isRecordTaskSelectionMode, setDependencySelection]);

    const collisionDetection = useCallback((args: any) => {
        const pointerCollisions = pointerWithin(args);
        const collisions = pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
        const activeType = args.active?.data.current?.type;
        const activeSource = args.active?.data.current?.source;
        const getCollisionContainer = (collision: any) => (
            typeof args.droppableContainers?.get === 'function'
                ? args.droppableContainers.get(collision.id)
                : args.droppableContainers?.find((item: any) => item.id === collision.id)
        );

        if (activeSource === 'task-workbench') {
            const taskWorkbenchCollision = collisions.find((collision: any) => {
                const data = getCollisionContainer(collision)?.data.current;
                return (
                    data?.type === 'task-workbench-unplaced-lane' ||
                    data?.type === 'task-workbench-placed-board-lane' ||
                    data?.source === 'task-workbench'
                );
            });

            if (taskWorkbenchCollision) {
                return [
                    taskWorkbenchCollision,
                    ...collisions.filter((collision: any) => collision.id !== taskWorkbenchCollision.id),
                ];
            }
        }

        if (pointerCollisions.length > 0 && args.pointerCoordinates && typeof document !== 'undefined') {
            const sourceRect = desktopDragSourceRectRef.current;
            if (sourceRect) {
                const pointerInsideSource = args.pointerCoordinates.x >= sourceRect.left
                    && args.pointerCoordinates.x <= sourceRect.right
                    && args.pointerCoordinates.y >= sourceRect.top
                    && args.pointerCoordinates.y <= sourceRect.bottom;
                if (pointerInsideSource) {
                    recordDesktopTaskDragDebug({
                        type: 'collision:source-block',
                        activeId: String(args.active?.id),
                        sourceRect,
                        pointer: args.pointerCoordinates,
                    });
                    return [];
                }
            }

            const rawElement = document.elementFromPoint(
                args.pointerCoordinates.x,
                args.pointerCoordinates.y,
            );
            const directSurface = rawElement instanceof Element
                ? rawElement.closest<HTMLElement>('[data-desktop-drop-surface="true"]')
                : null;

            if (directSurface) {
                const directIds = (directSurface.getAttribute('data-desktop-drop-id') || '')
                    .split(/\s+/)
                    .filter(Boolean);
                const directCollisions = directIds
                    .map((id) => pointerCollisions.find((collision: any) => String(collision.id) === id))
                    .filter(Boolean);
                const typePreference = activeType === 'wbs-checklist'
                    ? ['wbs-checklist', 'wbs-checklist-drop', 'wbs-card-drop', 'wbs-card', 'wbs-column-drop', 'wbs-column']
                    : ['wbs-checklist', 'wbs-checklist-drop', 'wbs-card', 'wbs-card-drop', 'wbs-column-drop', 'wbs-column'];
                directCollisions.sort((left: any, right: any) => {
                    const leftType = getCollisionContainer(left)?.data.current?.type;
                    const rightType = getCollisionContainer(right)?.data.current?.type;
                    return typePreference.indexOf(leftType) - typePreference.indexOf(rightType);
                });

                const directCollision = directCollisions[0];
                if (!directCollision) {
                    recordDesktopTaskDragDebug({
                        type: 'collision:direct-miss',
                        directIds,
                        pointerCollisionIds: pointerCollisions.map((collision: any) => String(collision.id)),
                        activeType,
                    });
                    return [];
                }
                const targetData = getCollisionContainer(directCollision)?.data.current;
                const resolved = resolveDesktopTaskDropIntent({
                    activeData: args.active?.data.current,
                    targetData,
                    nodesRecord: useWbsStore.getState().nodes,
                });

                // Exact innermost ownership: an invalid child/source surface blocks
                // its ancestors instead of silently redirecting the task elsewhere.
                recordDesktopTaskDragDebug({
                    type: resolved ? 'collision:direct-hit' : 'collision:invalid-direct',
                    directId: String(directCollision.id),
                    targetType: targetData?.type,
                    targetNodeId: targetData?.nodeId,
                    activeType,
                });
                return resolved ? [directCollision] : [];
            }
        }

        return collisions.filter((collision: any) => {
            const targetData = getCollisionContainer(collision)?.data.current;
            if (targetData?.type === 'task-workbench-unplaced-lane'
                || targetData?.type === 'task-workbench-placed-board-lane') {
                return true;
            }
            return Boolean(resolveDesktopTaskDropIntent({
                activeData: args.active?.data.current,
                targetData,
                nodesRecord: useWbsStore.getState().nodes,
            }));
        });
    }, []);

    // 訂閱 root index 與 boardId index 以取得此看板的 Level 1 根節點
    const rootIds = useWbsStore(s => s.parentNodesIndex['root']);
    const boardRootIds = useWbsStore(s => s.parentNodesIndex[activeBoardId || '']);
    const storeNodes = useWbsStore(s => s.nodes);
    const statusFilters = useBoardStore(s => s.statusFilters);
    const dueWithinDays = useBoardStore(s => s.dueWithinDays);
    const selectedAssigneeIds = useBoardStore(s => s.selectedAssigneeIds);
    const selectedTagIds = useTagStore(s => s.selectedTagIds);
    const taskFilters = useMemo(() => ({
        statusFilters,
        dueWithinDays,
        selectedAssigneeIds,
        selectedTagIds,
        keyword: '',
    }), [dueWithinDays, selectedAssigneeIds, selectedTagIds, statusFilters]);
    const filterProjection = useMemo(
        () => projectTaskFilterResults(storeNodes, taskFilters, { boardId: activeBoardId }),
        [activeBoardId, storeNodes, taskFilters],
    );

    // 合併並排序根節點 (Level 1 = 列表欄)
    const rootNodes = useMemo(() => {
        const ids1 = (rootIds || []).filter(id => {
            const n = storeNodes[id];
            return n && n.boardId === activeBoardId && !n.isArchived && filterProjection.visibleTaskIds.has(n.id);
        });
        const ids2 = (boardRootIds || []).filter(id => {
            const n = storeNodes[id];
            return n && !n.isArchived && filterProjection.visibleTaskIds.has(n.id);
        });
        // 合併去重
        const allIds = Array.from(new Set([...ids1, ...ids2]));
        return allIds
            .map(id => storeNodes[id])
            .filter(node => node)
            .sort((a, b) => a.order - b.order);
    }, [rootIds, boardRootIds, activeBoardId, storeNodes, filterProjection]);

    /**
     * 拖曳結束處理 — 全階層移動引擎
     * 設計意圖：統一處理所有 DnD 場景，每種場景透過 data.type 識別。
     *
     * 支援場景：
     * 1. wbs-column → wbs-column         : 列表水平排序
     * 2. wbs-card   → wbs-column (drop)  : 卡片跨列移動
     * 3. wbs-card   → wbs-card (sortable): 同列排序
     * 4. wbs-card   → wbs-card-drop      : 卡片降級為目標卡片的子節點 ✨新增
     * 5. wbs-checklist → wbs-column (drop): 任務升級為列表直接子節點（卡片級別）✨新增
     * 6. wbs-checklist → wbs-card-drop    : 任務跨卡片移動 ✨新增
     * 7. wbs-checklist → wbs-checklist    : 同卡片內任務排序 ✨新增
     */
    const handleDragStart = (event: any) => {
        if (!canMoveTask) return;
        const { active } = event;
        const activeData = active.data.current;
        const nodeId = activeData?.nodeId;
        const sourceCandidates = Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]'))
            .filter((element) => element.getAttribute('data-task-id') === nodeId);
        const sourceElement = activeData?.source === 'task-workbench'
            ? sourceCandidates.find((element) => element.hasAttribute('data-task-workbench-drag-surface'))
            : activeData?.type === 'wbs-checklist'
                ? sourceCandidates.find((element) => element.classList.contains('kanban-checklist-item'))
                : activeData?.type === 'wbs-column'
                    ? sourceCandidates.find((element) => element.hasAttribute('data-kanban-column-header'))
                    : sourceCandidates.find((element) => element.hasAttribute('data-task-card-primary'));
        const sourceRect = sourceElement?.getBoundingClientRect();
        desktopDragSourceRectRef.current = sourceRect
            ? { left: sourceRect.left, right: sourceRect.right, top: sourceRect.top, bottom: sourceRect.bottom }
            : null;
        updateDesktopDropPreview(null);
        setActiveDrag({
            id: active.id,
            type: active.data.current?.type,
            source: active.data.current?.source,
            title: active.data.current?.title,
            node: nodeId ? useWbsStore.getState().nodes[nodeId] : null,
        });
    };

    const handleDragCancel = () => {
        desktopDragSourceRectRef.current = null;
        updateDesktopDropPreview(null);
        setActiveDrag(null);
    };

    const buildDesktopDropPreview = React.useCallback((active: any, over: any) => {
        if (!active?.data.current || !over?.data.current) return null;
        const targetDndId = String(over.id);
        return resolveDesktopTaskDropPreview({
            activeData: active.data.current,
            targetData: over.data.current,
            targetDndId,
            targetElement: findDesktopTaskDropElement(targetDndId),
            nodesRecord: useWbsStore.getState().nodes,
        });
    }, []);

    const handleDragOver = (event: any) => {
        if (!canMoveTask) return;
        const { active, over } = event;
        const preview = over ? buildDesktopDropPreview(active, over) : null;
        recordDesktopTaskDragDebug({
            type: 'drag-over',
            overId: over ? String(over.id) : null,
            overType: over?.data.current?.type || null,
            previewTargetId: preview?.targetNodeId || null,
            previewPosition: preview?.displayPosition || null,
        });
        updateDesktopDropPreview(preview);
    };

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        const displayedPreview = desktopDropPreviewRef.current;
        const currentPreview = over ? buildDesktopDropPreview(active, over) : null;
        desktopDragSourceRectRef.current = null;
        updateDesktopDropPreview(null);
        setActiveDrag(null);
        if (!canMoveTask || !over) return;

        const targetType = over.data.current?.type;
        const isWorkbenchLane = targetType === 'task-workbench-unplaced-lane'
            || targetType === 'task-workbench-placed-board-lane';
        if (!isWorkbenchLane && !desktopTaskDropPreviewMatches(displayedPreview, currentPreview)) return;

        commitDesktopTaskDrag({
            activeData: active.data.current,
            overData: over.data.current,
            desktopPreview: isWorkbenchLane ? null : currentPreview,
            dependencies: {
                activeBoardId,
                activeWorkspaceId,
                canMoveTask,
                canEditTask,
                canCreateTask,
                canDeleteTask,
                addNode,
                updateNode,
                batchUpdateNodes,
                removeNode,
                recalculateAncestorStatus,
            },
        });
    };


    /** 新增頂層任務 (Level 1 → 新列表) */
    const handleAddColumn = () => {
        if (!canCreateTask) return;
        const newNode: TaskNode = {
            id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
            workspaceId: activeWorkspaceId || '',
            boardId: activeBoardId || '',
            parentId: null,
            title: '新任務',
            status: 'todo',
            nodeType: 'group',
            order: rootNodes.length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addNode(newNode);
        prepareNewTaskNaming(newNode.id);
    };

    if (!activeBoardId) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                請選擇一個看板
            </div>
        );
    }

    return (
        <KanbanDependencyContext.Provider value={{ dependencySelection, handleKanbanDependencySelect, dependencies }}>
        <MobileTaskActionContext.Provider value={taskDragSession.contextValue}>
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div
                className="flex-1 flex min-w-0 overflow-hidden bg-slate-100"
                data-layout-region="board-shell"
            >
                <TaskWorkbenchPanel canMoveTask={canMoveTask} />
                <div
                    className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100"
                    data-layout-region="board-workspace"
                >
                    {isRecordTaskSelectionMode && (
                        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-[10px] py-[6px]">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 text-sm">
                                    <span className="font-semibold text-blue-800">選取紀錄關聯任務</span>
                                    <span className="ml-2 text-blue-600">直接點選看板上的任務，已選 {recordDraft?.taskLinks.length ?? 0} 筆</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => exitRecordTaskSelectionMode(true)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                        <Check size={14} />
                                        完成
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exitRecordTaskSelectionMode(true)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-600 hover:bg-blue-100"
                                        title="離開選取模式"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 依賴關係選取模式橫幅 */}
                    {dependencySelection && (
                        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-[10px] py-[5px] flex items-center justify-between gap-[10px]">
                            <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
                                <span>
                                    選取模式：已選取 <strong className="text-amber-800">[{dependencySelection.title}]</strong> 的
                                    <span className={`mx-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${dependencySelection.side === 'start' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                        {dependencySelection.side === 'start' ? '開始日' : '結束日'}
                                    </span>
                                    — 請點擊另一張卡片的日期標籤作為依賴目標
                                </span>
                            </div>
                            <button
                                onClick={() => setDependencySelection(null)}
                                className="text-amber-500 hover:text-amber-700 text-xs font-semibold px-2 py-0.5 rounded hover:bg-amber-100 transition-colors flex-shrink-0"
                            >
                                取消（退出鍵）
                            </button>
                        </div>
                    )}

                    {/* 列表畫布 (Lists Canvas) */}
                    <div
                        ref={setBoardCanvasRef}
                        className={`scroll-container mobile-pan-surface flex-1 overflow-x-auto overflow-y-hidden bg-slate-100/90 ${compactClassNames.canvas} flex gap-[12px] items-start scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent`}
                        data-mobile-pan-surface="board"
                        data-kanban-mouse-pan-surface="true"
                        data-layout-region="board-canvas"
                    >
                        <SortableContext items={rootNodes.map(n => n.id)} strategy={horizontalListSortingStrategy}>
                            {rootNodes.map(node => (
                                <KanbanColumn
                                    key={node.id}
                                    nodeId={node.id}
                                    filterProjection={filterProjection}
                                />
                            ))}
                        </SortableContext>

                        {/* 新增列表按鈕 */}
                        <div className="flex-shrink-0 w-[260px]">
                            <button
                                onClick={handleAddColumn}
                                disabled={!canCreateTask}
                                className="w-full py-[8px] border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-0.5 text-slate-400 font-semibold hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all group disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                data-mobile-pan-pass-through="true"
                                data-kanban-add-column-button="true"
                            >
                                <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                                <span>新增任務</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {desktopDropPreview ? (
                <div
                    className="pointer-events-none fixed z-[86] -translate-y-1/2"
                    style={{
                        left: desktopDropPreview.indicatorRect.left,
                        top: desktopDropPreview.indicatorRect.top,
                        width: desktopDropPreview.indicatorRect.width,
                    }}
                    data-desktop-drop-indicator="true"
                    data-desktop-drop-target={desktopDropPreview.targetNodeId}
                    data-desktop-drop-position={desktopDropPreview.displayPosition}
                    data-desktop-drop-surface-kind={desktopDropPreview.targetSurfaceKind}
                    data-desktop-drop-indicator-layer="fixed-overlay"
                >
                    <KanbanInsertionMarker compact className="py-0" />
                </div>
            ) : null}
            <DragOverlay dropAnimation={null}>
                {activeDrag?.node ? (
                    <div data-kanban-drag-overlay="true" className={`task-title-text pointer-events-none translate-x-4 translate-y-4 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg will-change-transform ${
                        activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'
                    }`}>
                        {activeDrag.title || activeDrag.node.title || '未命名任務'}
                    </div>
                ) : null}
            </DragOverlay>
            <TaskDragPresenter
                state={taskDragSession.state}
                canEditTask={canEditTask}
                canCreateTask={canCreateTask}
                canDeleteTask={canDeleteTask}
                onAction={taskDragSession.activateAction}
            />
        </DndContext>
        </MobileTaskActionContext.Provider>
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
