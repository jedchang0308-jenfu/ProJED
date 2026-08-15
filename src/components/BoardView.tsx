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
import { useMemberStore } from '../store/useMemberStore';
import { useTagStore } from '../store/useTagStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import { KanbanInsertionMarker } from './Wbs/KanbanInsertionMarker';
import { KanbanRootDropZone } from './Wbs/KanbanRootDropZone';
import TaskWorkbenchPanel from './TaskWorkbenchPanel';
import { compactClassNames } from './ui/compactTokens';
import { projectTaskFilterResults } from '../features/taskFilters';
import { MobileTaskActionContext } from './Wbs/mobileTaskActionContext';
import { TaskDragPresenter } from './Wbs/taskDrag/TaskDragPresenter';
import { TaskOriginTitleField } from './Wbs/taskDrag/TaskOriginTitleField';
import { TaskChildDropPreview } from './Wbs/taskDrag/TaskChildDropPreview';
import { commitDesktopTaskDrag } from './Wbs/taskDrag/taskDragCommit';
import type { TaskNode } from '../types';
import { prepareNewTaskNaming } from '../utils/taskInteractions';
import {
    desktopTaskDropPreviewMatches,
    findDesktopTaskDropElement,
    resolveDesktopTaskOriginIndicator,
    resolveDesktopTaskDropIntent,
    resolveDesktopTaskDropPreview,
    type DesktopTaskOriginIndicator,
    type DesktopTaskDropPreview,
} from './Wbs/taskDrag/desktopTaskDropPreview';
import { useTaskDragSession } from './Wbs/taskDrag/useTaskDragSession';
import { collectTaskDragDescendantIds } from './Wbs/taskDrag/taskDragScope';
import {
    advanceTaskChildIntent,
    getTaskChildIntentRemainingMs,
    resolveTaskTitleChildDropTarget,
    resolveTaskTitleChildDropZone,
    type TaskChildDropTarget,
} from './Wbs/taskDrag/taskChildDropTarget';
import { taskDragSourceKindToSurfaceKind } from './Wbs/taskDrag/taskDropIntent';
import {
    emitTaskChildDropSuccess,
    type TaskChildDropSuccessDetail,
} from './Wbs/taskDrag/taskChildDropFeedback';
import {
    resolvePointerUpperRightOverlayPosition,
    TASK_DRAG_OVERLAY_POINTER_GAP_PX,
} from './Wbs/taskDrag/taskDragOverlayPosition';

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

interface DesktopTaskChildDropState {
    sessionId: number;
    sourceNodeId: string;
    sourceTitle: string;
    phase: 'candidate' | 'armed';
    candidateSince: number;
    target: TaskChildDropTarget;
}

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
    const [desktopDragOverlayPointer, setDesktopDragOverlayPointer] = useState<{ x: number; y: number } | null>(null);
    const [desktopDropPreview, setDesktopDropPreview] = useState<DesktopTaskDropPreview | null>(null);
    const [desktopOriginIndicator, setDesktopOriginIndicator] = useState<DesktopTaskOriginIndicator | null>(null);
    const [desktopChildDrop, setDesktopChildDrop] = useState<DesktopTaskChildDropState | null>(null);
    const [taskChildDropAnnouncement, setTaskChildDropAnnouncement] = useState('');
    const desktopDropPreviewRef = React.useRef<DesktopTaskDropPreview | null>(null);
    const desktopDragOriginIndicatorRef = React.useRef<DesktopTaskOriginIndicator | null>(null);
    const desktopChildDropRef = React.useRef<DesktopTaskChildDropState | null>(null);
    const desktopChildDropSessionRef = React.useRef(0);
    const desktopActiveDataRef = React.useRef<Record<string, any> | null>(null);
    const desktopPointerRef = React.useRef<{ x: number; y: number } | null>(null);
    const desktopRawPointerRef = React.useRef<{ x: number; y: number } | null>(null);
    const desktopDragActivatorPointRef = React.useRef<{ x: number; y: number } | null>(null);
    const desktopDragSourceRectRef = React.useRef<{
        left: number;
        right: number;
        top: number;
        bottom: number;
    } | null>(null);
    const desktopDragCancelledRef = React.useRef(false);
    const desktopDragOverlayActiveRef = React.useRef(false);

    React.useEffect(() => {
        if (import.meta.env.MODE !== 'test') return undefined;
        const debugWindow = window as any;
        debugWindow.__projedTaskDragTestApi = {
            patchNode: (nodeId: string, patch: Partial<TaskNode>) => {
                useWbsStore.setState(state => ({
                    nodes: {
                        ...state.nodes,
                        [nodeId]: state.nodes[nodeId] ? { ...state.nodes[nodeId], ...patch } : state.nodes[nodeId],
                    },
                }));
            },
            removeNodeFromRuntime: (nodeId: string) => {
                useWbsStore.setState(state => {
                    const nodes = { ...state.nodes };
                    delete nodes[nodeId];
                    return { nodes };
                });
            },
            setMovePermission: (allowed: boolean) => {
                const access = useMemberStore.getState().currentBoardAccess;
                if (!access) return;
                const capabilities = new Set(access.capabilities || []);
                if (allowed) capabilities.add('move_task');
                else capabilities.delete('move_task');
                useMemberStore.setState({
                    currentBoardAccess: { ...access, capabilities: Array.from(capabilities) },
                });
            },
            snapshotNodes: () => useWbsStore.getState().nodes,
        };
        return () => {
            delete debugWindow.__projedTaskDragTestApi;
        };
    }, []);
    React.useEffect(() => {
        const captureDesktopPointer = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return;
            const point = { x: event.clientX, y: event.clientY };
            desktopRawPointerRef.current = point;
            if (desktopDragOverlayActiveRef.current) setDesktopDragOverlayPointer(point);
        };
        window.addEventListener('pointermove', captureDesktopPointer, true);
        return () => window.removeEventListener('pointermove', captureDesktopPointer, true);
    }, []);
    const activeDragDescendantCount = React.useMemo(() => {
        const sourceNodeId = activeDrag?.node?.id;
        if (!sourceNodeId) return 0;
        const state = useWbsStore.getState();
        return collectTaskDragDescendantIds(sourceNodeId, state.parentNodesIndex, state.nodes).length;
    }, [activeDrag]);
    const desktopDragOverlayPosition = React.useMemo(() => {
        if (!activeDrag?.node || !desktopDragOverlayPointer || typeof window === 'undefined') return null;
        return resolvePointerUpperRightOverlayPosition({
            pointer: desktopDragOverlayPointer,
            overlay: {
                width: activeDrag.type === 'wbs-column' ? 270 : 240,
                height: 40,
            },
            viewport: {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
            },
        });
    }, [activeDrag, desktopDragOverlayPointer]);
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

    const applyDesktopChildDrop = React.useCallback((next: DesktopTaskChildDropState | null) => {
        desktopChildDropRef.current = next;
        setDesktopChildDrop(next);
    }, []);

    const clearDesktopChildDrop = React.useCallback(() => {
        desktopPointerRef.current = null;
        desktopRawPointerRef.current = null;
        desktopActiveDataRef.current = null;
        applyDesktopChildDrop(null);
    }, [applyDesktopChildDrop]);

    const reportTaskChildDropSuccess = React.useCallback((detail: TaskChildDropSuccessDetail) => {
        setTaskChildDropAnnouncement('');
        window.requestAnimationFrame(() => {
            setTaskChildDropAnnouncement(`${detail.sourceTitle} 已移入 ${detail.targetTitle} 的子任務`);
        });
        emitTaskChildDropSuccess(detail);
    }, []);

    const resolveDesktopChildDropAtPoint = React.useCallback((
        activeData: Record<string, any>,
        point: { x: number; y: number },
    ) => {
        const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(activeData?.type);
        if (activeData?.source === 'task-workbench'
            || !sourceSurfaceKind
            || sourceSurfaceKind === 'workbench-unplaced-row'
            || !activeData?.nodeId) return null;
        return resolveTaskTitleChildDropTarget({
            point,
            inputMode: 'mouse',
            sourceNodeId: activeData.nodeId,
            sourceSurfaceKind,
            nodesRecord: useWbsStore.getState().nodes,
        });
    }, []);

    const resolveDesktopChildDropZoneAtPoint = React.useCallback((
        point: { x: number; y: number },
    ) => resolveTaskTitleChildDropZone({
        point,
        inputMode: 'mouse',
        nodesRecord: useWbsStore.getState().nodes,
    }), []);

    const updateDesktopChildDropAtPoint = React.useCallback((
        activeData: Record<string, any>,
        point: { x: number; y: number },
    ) => {
        desktopActiveDataRef.current = activeData;
        desktopPointerRef.current = point;
        const target = resolveDesktopChildDropAtPoint(activeData, point);
        const current = desktopChildDropRef.current;
        const transition = advanceTaskChildIntent({
            current: {
                phase: current?.phase || 'none',
                targetId: current?.target.targetNodeId || null,
                candidateSince: current?.candidateSince || null,
            },
            targetId: target?.targetNodeId || null,
            now: Date.now(),
        });
        if (!target || transition.phase === 'none' || transition.candidateSince === null) {
            applyDesktopChildDrop(null);
            return false;
        }

        const sourceNode = useWbsStore.getState().nodes[activeData.nodeId];
        const next: DesktopTaskChildDropState = {
            sessionId: desktopChildDropSessionRef.current,
            sourceNodeId: activeData.nodeId,
            sourceTitle: sourceNode?.title || activeData.title || '未命名任務',
            phase: transition.phase,
            candidateSince: transition.candidateSince,
            target,
        };
        applyDesktopChildDrop(next);
        if (transition.phase === 'armed') {
            updateDesktopDropPreview(null);
            setDesktopOriginIndicator(null);
        }
        recordDesktopTaskDragDebug({
            type: transition.phase === 'armed' ? 'child-intent:armed' : 'child-intent:candidate',
            sourceNodeId: next.sourceNodeId,
            targetNodeId: target.targetNodeId,
            candidateSince: transition.candidateSince,
            point,
            safeRect: target.previewRect.safe,
        });
        return true;
    }, [applyDesktopChildDrop, resolveDesktopChildDropAtPoint, updateDesktopDropPreview]);

    React.useEffect(() => {
        const current = desktopChildDrop;
        if (!current || current.phase !== 'candidate') return undefined;
        const remaining = getTaskChildIntentRemainingMs({
            phase: current.phase,
            targetId: current.target.targetNodeId,
            candidateSince: current.candidateSince,
        });
        if (remaining === null) return undefined;
        const sessionId = current.sessionId;
        const targetNodeId = current.target.targetNodeId;
        const timer = window.setTimeout(() => {
            const activeData = desktopActiveDataRef.current;
            const point = desktopPointerRef.current;
            const latest = desktopChildDropRef.current;
            if (
                !activeData
                || !point
                || !latest
                || latest.sessionId !== sessionId
                || latest.target.targetNodeId !== targetNodeId
            ) {
                return;
            }
            updateDesktopChildDropAtPoint(activeData, point);
        }, remaining);
        return () => window.clearTimeout(timer);
    }, [desktopChildDrop, updateDesktopChildDropAtPoint]);

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
            clearDesktopChildDrop();
        },
        onCommit: (result, observation) => {
            if (
                result.status !== 'committed'
                || observation.targetSurfaceKind !== 'task-title-child'
                || !observation.targetNodeId
            ) {
                return;
            }
            const nodes = useWbsStore.getState().nodes;
            reportTaskChildDropSuccess({
                sourceNodeId: observation.source.nodeId,
                sourceTitle: nodes[observation.source.nodeId]?.title || '未命名任務',
                targetNodeId: observation.targetNodeId,
                targetTitle: nodes[observation.targetNodeId]?.title || observation.childTargetTitle || '未命名任務',
            });
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
        const activeType = args.active?.data.current?.type;
        const activeSource = args.active?.data.current?.source;
        if (
            ['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType)
            && args.pointerCoordinates
            && typeof document !== 'undefined'
        ) {
            const boardCanvas = document.querySelector<HTMLElement>('[data-layout-region="board-canvas"]');
            const boardRect = boardCanvas?.getBoundingClientRect();
            const pointerOutsideBoard = Boolean(boardRect
                && (args.pointerCoordinates.x < boardRect.left
                    || args.pointerCoordinates.x > boardRect.right
                    || args.pointerCoordinates.y < boardRect.top
                    || args.pointerCoordinates.y > boardRect.bottom));
            if (pointerOutsideBoard) {
                recordDesktopTaskDragDebug({
                    type: 'collision:outside-board',
                    activeId: String(args.active?.id),
                    pointer: args.pointerCoordinates,
                });
                return [];
            }
        }
        const collisions = pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
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

        if (activeType === 'wbs-column') {
            return collisions.filter((collision: any) => (
                getCollisionContainer(collision)?.data.current?.type === 'wbs-column'
            ));
        }

        // Exact task-surface ownership is only for task sources. A list/column
        // drag must keep dnd-kit's sortable collision path; routing wbs-column
        // through the task intent resolver makes every header target invalid.
        if (activeType !== 'wbs-column'
            && pointerCollisions.length > 0
            && args.pointerCoordinates
            && typeof document !== 'undefined') {
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
                    ? ['wbs-checklist', 'wbs-checklist-drop', 'wbs-card-drop', 'wbs-card', 'wbs-column-drop', 'wbs-column', 'wbs-root-drop']
                    : ['wbs-checklist', 'wbs-checklist-drop', 'wbs-card', 'wbs-card-drop', 'wbs-column-drop', 'wbs-column', 'wbs-root-drop'];
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
    const overdueOnly = useBoardStore(s => s.overdueOnly);
    const selectedAssigneeIds = useBoardStore(s => s.selectedAssigneeIds);
    const selectedTagIds = useTagStore(s => s.selectedTagIds);
    const taskFilters = useMemo(() => ({
        statusFilters,
        dueWithinDays,
        overdueOnly,
        selectedAssigneeIds,
        selectedTagIds,
        keyword: '',
    }), [dueWithinDays, overdueOnly, selectedAssigneeIds, selectedTagIds, statusFilters]);
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
     * 2. wbs-card/checklist → wbs-column : 任務升級為 L1 列表同階
     * 3. 任務 → wbs-root-drop            : 任務追加為最後一個 L1 列表
     * 4. wbs-card   → wbs-column (drop)  : 卡片跨列移動
     * 5. wbs-card   → wbs-card (sortable): 同列排序
     * 6. wbs-card   → wbs-card-drop      : 卡片降級為目標卡片的子節點
     * 7. wbs-checklist → wbs-column (drop): 任務升級為列表直接子節點（卡片級別）
     * 8. wbs-checklist → wbs-card-drop    : 任務跨卡片移動
     * 9. wbs-checklist → wbs-checklist    : 同卡片內任務排序
     */
    const handleDragStart = (event: any) => {
        if (!canMoveTask) return;
        desktopDragCancelledRef.current = false;
        const { active } = event;
        const activeData = active.data.current;
        desktopChildDropSessionRef.current += 1;
        applyDesktopChildDrop(null);
        desktopActiveDataRef.current = activeData;
        const nodeId = activeData?.nodeId;
        const sourceCandidates = Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]'))
            .filter((element) => element.getAttribute('data-task-id') === nodeId);
        const sourceElement = activeData?.source === 'task-workbench'
            ? sourceCandidates.find((element) => element.hasAttribute('data-task-workbench-drag-surface'))
            : sourceCandidates.find((element) => element.hasAttribute('data-task-surface-source'))
                || sourceCandidates.find((element) => element.hasAttribute('data-task-drag-surface'));
        const sourceScopeElement = sourceElement?.closest<HTMLElement>(
            '[data-task-surface-scope="true"], [data-desktop-task-hover-scope="true"]',
        ) || sourceElement;
        const sourceRect = sourceScopeElement?.getBoundingClientRect();
        desktopDragSourceRectRef.current = sourceRect
            ? { left: sourceRect.left, right: sourceRect.right, top: sourceRect.top, bottom: sourceRect.bottom }
            : null;
        const originIndicator = resolveDesktopTaskOriginIndicator({
            activeData,
            sourceElement: sourceElement || null,
            sourceTitle: nodeId ? useWbsStore.getState().nodes[nodeId]?.title : undefined,
        });
        desktopDragOriginIndicatorRef.current = originIndicator;
        const activatorEvent = event.activatorEvent;
        desktopDragActivatorPointRef.current = typeof activatorEvent?.clientX === 'number'
            && typeof activatorEvent?.clientY === 'number'
            ? { x: activatorEvent.clientX, y: activatorEvent.clientY }
            : null;
        desktopRawPointerRef.current = desktopDragActivatorPointRef.current;
        desktopDragOverlayActiveRef.current = true;
        setDesktopDragOverlayPointer(desktopRawPointerRef.current);
        updateDesktopDropPreview(null);
        setDesktopOriginIndicator(desktopDragActivatorPointRef.current ? originIndicator : null);
        setActiveDrag({
            id: active.id,
            type: active.data.current?.type,
            source: active.data.current?.source,
            title: active.data.current?.title,
            node: nodeId ? useWbsStore.getState().nodes[nodeId] : null,
        });
    };

    const handleDragCancel = React.useCallback(() => {
        desktopDragCancelledRef.current = true;
        desktopDragSourceRectRef.current = null;
        desktopDragOriginIndicatorRef.current = null;
        desktopDragActivatorPointRef.current = null;
        desktopDragOverlayActiveRef.current = false;
        setDesktopDragOverlayPointer(null);
        updateDesktopDropPreview(null);
        setDesktopOriginIndicator(null);
        clearDesktopChildDrop();
        setActiveDrag(null);
    }, [clearDesktopChildDrop, updateDesktopDropPreview]);

    React.useEffect(() => {
        if (!activeDrag) return undefined;
        const cancel = () => handleDragCancel();
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') cancel();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') cancel();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('pointercancel', cancel, true);
        window.addEventListener('blur', cancel);
        window.addEventListener('pagehide', cancel);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('pointercancel', cancel, true);
            window.removeEventListener('blur', cancel);
            window.removeEventListener('pagehide', cancel);
        };
    }, [activeDrag, handleDragCancel]);

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
        if (desktopChildDropRef.current?.phase === 'armed') {
            updateDesktopDropPreview(null);
            return;
        }
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

    const handleDragMove = (event: any) => {
        const sourceRect = desktopDragSourceRectRef.current;
        const activatorPoint = desktopDragActivatorPointRef.current;
        const originIndicator = desktopDragOriginIndicatorRef.current;
        if (!sourceRect || !activatorPoint || !originIndicator) {
            setDesktopOriginIndicator(null);
            return;
        }

        const pointer = desktopRawPointerRef.current || {
            x: activatorPoint.x + event.delta.x,
            y: activatorPoint.y + event.delta.y,
        };
        desktopPointerRef.current = pointer;
        const pointerInsideSource = pointer.x >= sourceRect.left
            && pointer.x <= sourceRect.right
            && pointer.y >= sourceRect.top
            && pointer.y <= sourceRect.bottom;
        if (pointerInsideSource) {
            applyDesktopChildDrop(null);
            updateDesktopDropPreview(null);
            setDesktopOriginIndicator(originIndicator);
            return;
        }
        const hasChildCandidate = updateDesktopChildDropAtPoint(event.active.data.current, pointer);
        if (hasChildCandidate && desktopChildDropRef.current?.phase === 'armed') return;
        const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(event.active.data.current?.type);
        const canUseChildDrop = Boolean(
            event.active.data.current?.source !== 'task-workbench'
            && sourceSurfaceKind
            && sourceSurfaceKind !== 'workbench-unplaced-row'
        );
        if (canUseChildDrop && !hasChildCandidate && resolveDesktopChildDropZoneAtPoint(pointer)) {
            setDesktopOriginIndicator(null);
            updateDesktopDropPreview(null);
            return;
        }
        setDesktopOriginIndicator(null);
        const preview = event.over ? buildDesktopDropPreview(event.active, event.over) : null;
        updateDesktopDropPreview(preview);
    };

    const handleDragEnd = (event: any) => {
        const wasCancelled = desktopDragCancelledRef.current;
        desktopDragCancelledRef.current = false;
        const { active, over } = event;
        const displayedPreview = desktopDropPreviewRef.current;
        const currentPreview = over ? buildDesktopDropPreview(active, over) : null;
        const displayedChildDrop = desktopChildDropRef.current;
        const activatorPoint = desktopDragActivatorPointRef.current;
        const releasePointer = desktopRawPointerRef.current
            || (activatorPoint && event.delta
                ? { x: activatorPoint.x + event.delta.x, y: activatorPoint.y + event.delta.y }
                : desktopPointerRef.current);
        const releaseChildTarget = releasePointer
            ? resolveDesktopChildDropAtPoint(active.data.current, releasePointer)
            : null;
        const releaseSourceSurfaceKind = taskDragSourceKindToSurfaceKind(active.data.current?.type);
        const canUseReleaseChildDrop = Boolean(
            active.data.current?.source !== 'task-workbench'
            && releaseSourceSurfaceKind
            && releaseSourceSurfaceKind !== 'workbench-unplaced-row'
        );
        const releaseChildZone = releasePointer && canUseReleaseChildDrop
            ? resolveDesktopChildDropZoneAtPoint(releasePointer)
            : null;
        const sourceRect = desktopDragSourceRectRef.current;
        const releaseInsideSource = Boolean(releasePointer && sourceRect
            && releasePointer.x >= sourceRect.left
            && releasePointer.x <= sourceRect.right
            && releasePointer.y >= sourceRect.top
            && releasePointer.y <= sourceRect.bottom);
        const canCommitDisplayedChild = Boolean(
            displayedChildDrop
            && displayedChildDrop.phase === 'armed'
            && displayedChildDrop.sessionId === desktopChildDropSessionRef.current
            && displayedChildDrop.sourceNodeId === active.data.current?.nodeId
            && releaseChildTarget
            && releaseChildTarget.targetNodeId === displayedChildDrop.target.targetNodeId
        );
        desktopDragSourceRectRef.current = null;
        desktopDragOriginIndicatorRef.current = null;
        desktopDragActivatorPointRef.current = null;
        desktopRawPointerRef.current = null;
        desktopDragOverlayActiveRef.current = false;
        setDesktopDragOverlayPointer(null);
        updateDesktopDropPreview(null);
        setDesktopOriginIndicator(null);
        clearDesktopChildDrop();
        setActiveDrag(null);
        if (wasCancelled) return;
        if (!canMoveTask) return;
        if (releaseInsideSource) return;

        if (canCommitDisplayedChild && displayedChildDrop && releaseChildTarget) {
            const childPreview: DesktopTaskDropPreview = {
                sourceNodeId: displayedChildDrop.sourceNodeId,
                targetNodeId: releaseChildTarget.targetNodeId,
                targetDndId: `task-title-child:${releaseChildTarget.targetNodeId}`,
                targetSurfaceKind: releaseChildTarget.targetSurfaceKind,
                displayPosition: 'append',
                intent: releaseChildTarget.intent,
                indicatorRect: {
                    left: releaseChildTarget.previewRect.insertion.left,
                    top: releaseChildTarget.previewRect.insertion.top,
                    width: releaseChildTarget.previewRect.insertion.width,
                },
            };
            const result = commitDesktopTaskDrag({
                activeData: active.data.current,
                overData: {
                    type: 'wbs-task-title-child',
                    nodeId: releaseChildTarget.targetNodeId,
                },
                desktopPreview: childPreview,
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
            if (result.status === 'committed') {
                reportTaskChildDropSuccess({
                    sourceNodeId: displayedChildDrop.sourceNodeId,
                    sourceTitle: displayedChildDrop.sourceTitle,
                    targetNodeId: releaseChildTarget.targetNodeId,
                    targetTitle: releaseChildTarget.targetTitle,
                });
            }
            return;
        }

        // A valid candidate does not own release until it has visibly armed;
        // preserve the existing same-level/lane action before the 1s dwell.
        // Invalid self/descendant/stale child zones remain blocked for safety.
        if (releaseChildZone && !releaseChildTarget) return;

        if (!over) return;

        const activeType = active.data.current?.type;
        const targetType = over.data.current?.type;
        if (activeType === 'wbs-column' && targetType === 'wbs-column') {
            const sourceId = active.data.current?.nodeId;
            const targetId = over.data.current?.nodeId;
            const roots = useWbsStore.getState()
                .getRootNodesForBoard(activeBoardId || '')
                .filter(node => !node.isArchived)
                .sort((left, right) => left.order - right.order);
            const sourceIndex = roots.findIndex(node => node.id === sourceId);
            const targetIndex = roots.findIndex(node => node.id === targetId);
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
            const reordered = [...roots];
            const [moved] = reordered.splice(sourceIndex, 1);
            reordered.splice(targetIndex, 0, moved);
            const updatedAt = Date.now();
            batchUpdateNodes(Object.fromEntries(reordered.map((node, order) => [
                node.id,
                { order, updatedAt },
            ])), { label: '移動列表位置', mergeKey: `move:${sourceId}` });
            return;
        }
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

    /** 新增頂層任務（Level 1 → 新列表） */
    const handleAddColumn = () => {
        if (!canCreateTask || !activeBoardId) return;

        const nextOrder = useWbsStore.getState()
            .getRootNodesForBoard(activeBoardId)
            .filter(node => !node.isArchived)
            .reduce((maxOrder, node) => Math.max(maxOrder, node.order), -1) + 1;
        const newNode: TaskNode = {
            id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
            workspaceId: activeWorkspaceId || '',
            boardId: activeBoardId,
            parentId: null,
            title: '新任務',
            status: 'todo',
            nodeType: 'group',
            order: nextOrder,
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

    const desktopIndicator = desktopDropPreview
        ? {
            kind: 'target' as const,
            targetNodeId: desktopDropPreview.targetNodeId,
            position: desktopDropPreview.displayPosition,
            surfaceKind: desktopDropPreview.targetSurfaceKind,
            indicatorRect: desktopDropPreview.indicatorRect,
            fieldHeight: undefined,
            sourceTitle: undefined,
        }
        : desktopOriginIndicator
            ? {
                kind: 'origin' as const,
                targetNodeId: desktopOriginIndicator.sourceNodeId,
                position: 'origin' as const,
                surfaceKind: desktopOriginIndicator.sourceSurfaceKind,
                indicatorRect: desktopOriginIndicator.fieldRect,
                fieldHeight: desktopOriginIndicator.fieldRect.height,
                sourceTitle: desktopOriginIndicator.sourceTitle,
            }
            : null;

    return (
        <KanbanDependencyContext.Provider value={{ dependencySelection, handleKanbanDependencySelect, dependencies }}>
        <MobileTaskActionContext.Provider value={taskDragSession.contextValue}>
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
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
                        <KanbanRootDropZone
                            boardId={activeBoardId}
                            anchorNodeId={rootNodes[rootNodes.length - 1]?.id}
                            canMoveTask={canMoveTask}
                        >
                            <button
                                type="button"
                                onClick={handleAddColumn}
                                disabled={!canCreateTask}
                                title={canCreateTask ? '新增列表' : '目前沒有新增任務權限'}
                                className="group flex w-full flex-col items-center justify-center gap-0.5 rounded-lg py-[8px] font-semibold text-slate-400 transition-all hover:bg-white/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                data-mobile-pan-pass-through="true"
                                data-kanban-add-column-button="true"
                                data-kanban-add-column-visual="borderless"
                            >
                                <Plus size={24} className="transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
                                <span>新增列表</span>
                            </button>
                        </KanbanRootDropZone>
                    </div>
                </div>
            </div>
            {desktopChildDrop ? (
                <TaskChildDropPreview
                    phase={desktopChildDrop.phase}
                    sourceTitle={desktopChildDrop.sourceTitle}
                    targetNodeId={desktopChildDrop.target.targetNodeId}
                    targetTitle={desktopChildDrop.target.targetTitle}
                    previewRect={desktopChildDrop.target.previewRect}
                    inputMode="mouse"
                />
            ) : null}
            {desktopIndicator && desktopChildDrop?.phase !== 'armed' ? (
                <div
                    className={`pointer-events-none fixed z-[86] ${
                        desktopIndicator.kind === 'origin' ? '' : '-translate-y-1/2'
                    }`}
                    style={{
                        left: desktopIndicator.indicatorRect.left,
                        top: desktopIndicator.indicatorRect.top,
                        width: desktopIndicator.indicatorRect.width,
                        height: desktopIndicator.fieldHeight,
                    }}
                    data-desktop-drop-indicator="true"
                    data-desktop-drop-target={desktopIndicator.targetNodeId}
                    data-desktop-drop-position={desktopIndicator.position}
                    data-desktop-drop-surface-kind={desktopIndicator.surfaceKind}
                    data-desktop-drop-origin={desktopIndicator.kind === 'origin' ? 'true' : undefined}
                    data-desktop-drop-noop={desktopIndicator.kind === 'origin' ? 'true' : undefined}
                    data-desktop-drop-indicator-layer="fixed-overlay"
                >
                    {desktopIndicator.kind === 'origin' ? (
                        <TaskOriginTitleField
                            title={desktopIndicator.sourceTitle}
                            surfaceKind={desktopIndicator.surfaceKind}
                            data-desktop-origin-field="true"
                        />
                    ) : (
                        <KanbanInsertionMarker compact className="py-0" />
                    )}
                </div>
            ) : null}
            <DragOverlay dropAnimation={null}>{null}</DragOverlay>
            {activeDrag?.node && desktopDragOverlayPosition ? (
                <div
                    data-kanban-drag-overlay="true"
                    data-task-drag-source-id={activeDrag.node.id}
                    data-task-drag-descendant-count={activeDragDescendantCount}
                    data-task-drag-overlay-anchor="pointer-upper-right"
                    data-task-drag-overlay-pointer-gap={TASK_DRAG_OVERLAY_POINTER_GAP_PX}
                    data-task-drag-overlay-edge-placement={desktopDragOverlayPosition.placement}
                    className={`task-title-text pointer-events-none fixed z-[93] flex items-center gap-2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg ${
                        activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'
                    }`}
                    style={{
                        left: desktopDragOverlayPosition.left,
                        top: desktopDragOverlayPosition.top,
                    }}
                >
                    <span className="min-w-0 flex-1 truncate">
                        {activeDrag.title || activeDrag.node.title || '未命名任務'}
                    </span>
                    {activeDragDescendantCount > 0 ? (
                        <span
                            data-task-drag-scope-summary="true"
                            className="shrink-0 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700"
                        >
                            含 {activeDragDescendantCount} 個子任務
                        </span>
                    ) : null}
                </div>
            ) : null}
            <TaskDragPresenter
                state={taskDragSession.state}
                canEditTask={canEditTask}
                canCreateTask={canCreateTask}
                canDeleteTask={canDeleteTask}
                onAction={taskDragSession.activateAction}
            />
            <div
                className="sr-only"
                aria-live="polite"
                aria-atomic="true"
                data-task-child-drop-announcement="true"
            >
                {taskChildDropAnnouncement}
            </div>
        </DndContext>
        </MobileTaskActionContext.Provider>
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
