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
import useUndoStore from '../store/useUndoStore';
import useRecordStore from '../store/useRecordStore';
import useDialogStore from '../store/useDialogStore';
import { useMemberStore } from '../store/useMemberStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import { KanbanInsertionMarker } from './Wbs/KanbanInsertionMarker';
import { KanbanRootDropZone } from './Wbs/KanbanRootDropZone';
import TaskWorkbenchPanel from './TaskWorkbenchPanel';
import { compactClassNames } from './ui/compactTokens';
import { projectTaskFilterResults } from '../features/taskFilters';
import { useTaskFilterStore } from '../store/useTaskFilterStore';
import { TaskFilterResultState } from './ui/TaskFilterResultState';
import { MobileTaskActionContext } from './Wbs/mobileTaskActionContext';
import { TaskDragPresenter } from './Wbs/taskDrag/TaskDragPresenter';
import { TaskOriginTitleField } from './Wbs/taskDrag/TaskOriginTitleField';
import { TaskChildDropPreview } from './Wbs/taskDrag/TaskChildDropPreview';
import { commitDesktopTaskDrag } from './Wbs/taskDrag/taskDragCommit';
import type { TaskNode } from '../types';
import type { TaskTrackingReference } from '../features/taskTracking/types';
import { buildTaskFilterNodesWithTrackingReferences, primaryPlacementId } from '../features/taskTracking/model';
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
import {
    DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX,
    isDesktopPointerInColumnTailExterior,
    resolveDesktopColumnDropPointerRegion,
    resolveDesktopColumnTaskCacheYRange,
    resolveDesktopTaskEdgePosition,
    selectNearestDesktopTaskGapCandidate,
} from './Wbs/taskDrag/desktopColumnDropPolicy';
import {
    resolveDesktopL1OrderingTarget,
    type DesktopL1ColumnGeometry,
    type DesktopL1OrderingTarget,
} from './Wbs/taskDrag/desktopL1DropPolicy';
import { useTaskDragSession } from './Wbs/taskDrag/useTaskDragSession';
import { useMeetingRecordAvailability } from '../utils/meetingRecordAvailability';
import { useKanbanViewSize } from '../features/kanbanViewSize/KanbanViewSizeProvider';
import { createKanbanViewportAdapter } from '../features/kanbanViewSize/kanbanViewSizeAnchor';
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
    DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX,
    DESKTOP_TASK_DRAG_OVERLAY_SCALE,
    resolvePointerUpperRightOverlayPosition,
} from './Wbs/taskDrag/taskDragOverlayPosition';

const DESKTOP_TASK_DRAG_OVERLAY_CARD_WIDTH_PX = 240;
const DESKTOP_TASK_DRAG_OVERLAY_COLUMN_WIDTH_PX = 270;
const DESKTOP_TASK_DRAG_OVERLAY_HEIGHT_PX = 40;

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
    && Math.abs((current.height ?? 0) - (next.height ?? 0)) <= DESKTOP_INDICATOR_RECT_RETAIN_PX
);

interface DesktopTaskChildDropState {
    sessionId: number;
    sourceNodeId: string;
    sourceTitle: string;
    phase: 'candidate' | 'armed';
    candidateSince: number;
    target: TaskChildDropTarget;
}

interface DesktopColumnGapTarget {
    ownership: 'ordering-gap' | 'direct-ordering';
    validRect: { left: number; right: number; top: number; bottom: number };
    preview: DesktopTaskDropPreview;
    over: { id: string; data: { current: Record<string, any> } };
}

interface DesktopL1DropTarget {
    validRect: { left: number; right: number; top: number; bottom: number };
    preview: DesktopTaskDropPreview;
    over: { id: string; data: { current: Record<string, any> } };
}

const desktopColumnGapTargetAtPointer = (
    target: DesktopColumnGapTarget | null,
    pointer: { x: number; y: number } | null,
) => pointer && target
    && pointer.x >= target.validRect.left
    && pointer.x <= target.validRect.right
    && pointer.y >= target.validRect.top
    && pointer.y <= target.validRect.bottom
    ? target
    : null;

const desktopL1DropTargetAtPointer = (
    target: DesktopL1DropTarget | null,
    pointer: { x: number; y: number } | null,
) => pointer && target
    && pointer.x >= target.validRect.left
    && pointer.x <= target.validRect.right
    && pointer.y >= target.validRect.top
    && pointer.y <= target.validRect.bottom
    ? target
    : null;

const BoardView = () => {
    const boardSurfaceRef = React.useRef<HTMLDivElement | null>(null);
    const mousePanSurfaceRef = useKanbanMousePan<HTMLDivElement>();
    const { activeBoardId, activeWorkspaceId } = useBoardStore();
    const dependencySelection = useBoardStore(s => s.dependencySelection);
    const setDependencySelection = useBoardStore(s => s.setDependencySelection);
    const toggleStartDate = useBoardStore(s => s.toggleStartDate);
    const showStartDate = useBoardStore(s => s.showStartDate);
    const {
        addDependency,
        dependencies,
        trackingReferences,
        moveTrackingReference,
        stageTrackingReference,
        placeStagedTrackingReference,
    } = useWbsStore();
    const isRecordTaskSelectionMode = useRecordStore(s => s.isTaskSelectionMode);
    const { isMeetingRecordUnavailable } = useMeetingRecordAvailability();
    const { viewSize, requestViewSize, registerViewportAdapter } = useKanbanViewSize();
    const effectiveViewSize = isMeetingRecordUnavailable ? viewSize : 'compact';
    const recordDraft = useRecordStore(s => s.draft);
    const exitRecordTaskSelectionMode = useRecordStore(s => s.exitTaskSelectionMode);
    const addNode = useWbsStore(s => s.addNode);
    const updateNode = useWbsStore(s => s.updateNode);
    const batchUpdateNodes = useWbsStore(s => s.batchUpdateNodes);
    const commitTaskPlacementCommand = useWbsStore(s => s.commitTaskPlacementCommand);
    const archiveNode = useWbsStore(s => s.archiveNode);
    const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
    const { canCreateTask, canEditTask, canMoveTask, canDeleteTask, canManageTaskReference, canCreateDependency } = useBoardPermissions();
    const sensors = useDragSensors();
    const [activeDrag, setActiveDrag] = useState<any>(null);
    const [desktopDragOverlayPointer, setDesktopDragOverlayPointer] = useState<{ x: number; y: number } | null>(null);
    const [desktopDropPreview, setDesktopDropPreview] = useState<DesktopTaskDropPreview | null>(null);
    const [desktopOriginIndicator, setDesktopOriginIndicator] = useState<DesktopTaskOriginIndicator | null>(null);
    const [desktopChildDrop, setDesktopChildDrop] = useState<DesktopTaskChildDropState | null>(null);
    const [taskChildDropAnnouncement, setTaskChildDropAnnouncement] = useState('');
    const desktopDropPreviewRef = React.useRef<DesktopTaskDropPreview | null>(null);
    const desktopLastVisibleDropPreviewRef = React.useRef<DesktopTaskDropPreview | null>(null);
    const desktopColumnGapTargetRef = React.useRef<DesktopColumnGapTarget | null>(null);
    const desktopL1DropTargetRef = React.useRef<DesktopL1DropTarget | null>(null);
    const desktopL1OrderingTargetRef = React.useRef<DesktopL1OrderingTarget | null>(null);
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
    const desktopTaskDragCommitSpyRef = React.useRef({
        batchUpdateNodesCalls: 0,
        ancestorRecalculationCalls: 0,
    });
    const batchUpdateNodesForDesktopTaskDrag: typeof batchUpdateNodes = React.useCallback((updates, options) => {
        if (import.meta.env.MODE === 'test') desktopTaskDragCommitSpyRef.current.batchUpdateNodesCalls += 1;
        batchUpdateNodes(updates, options);
    }, [batchUpdateNodes]);
    const commitTaskPlacementCommandForDesktopTaskDrag: typeof commitTaskPlacementCommand = React.useCallback(async (command, options) => {
        if (import.meta.env.MODE === 'test') desktopTaskDragCommitSpyRef.current.batchUpdateNodesCalls += 1;
        await commitTaskPlacementCommand(command, options);
    }, [commitTaskPlacementCommand]);
    const recalculateAncestorStatusForDesktopTaskDrag: typeof recalculateAncestorStatus = React.useCallback((nodeId) => {
        if (import.meta.env.MODE === 'test') desktopTaskDragCommitSpyRef.current.ancestorRecalculationCalls += 1;
        recalculateAncestorStatus(nodeId);
    }, [recalculateAncestorStatus]);
    const mobileTaskDragCommitSpyRef = React.useRef({
        batchUpdateNodesCalls: 0,
        ancestorRecalculationCalls: 0,
    });
    const batchUpdateNodesForMobileTaskDrag: typeof batchUpdateNodes = React.useCallback((updates, options) => {
        if (import.meta.env.MODE === 'test') mobileTaskDragCommitSpyRef.current.batchUpdateNodesCalls += 1;
        batchUpdateNodes(updates, options);
    }, [batchUpdateNodes]);
    const commitTaskPlacementCommandForMobileTaskDrag: typeof commitTaskPlacementCommand = React.useCallback(async (command, options) => {
        if (import.meta.env.MODE === 'test') mobileTaskDragCommitSpyRef.current.batchUpdateNodesCalls += 1;
        await commitTaskPlacementCommand(command, options);
    }, [commitTaskPlacementCommand]);
    const recalculateAncestorStatusForMobileTaskDrag: typeof recalculateAncestorStatus = React.useCallback((nodeId) => {
        if (import.meta.env.MODE === 'test') mobileTaskDragCommitSpyRef.current.ancestorRecalculationCalls += 1;
        recalculateAncestorStatus(nodeId);
    }, [recalculateAncestorStatus]);

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
            resetDesktopCommitSpy: () => {
                desktopTaskDragCommitSpyRef.current = {
                    batchUpdateNodesCalls: 0,
                    ancestorRecalculationCalls: 0,
                };
            },
            snapshotDesktopCommitSpy: () => ({
                ...desktopTaskDragCommitSpyRef.current,
                undoDepth: useUndoStore.getState().undoStack.length,
            }),
            resetMobileCommitSpy: () => {
                mobileTaskDragCommitSpyRef.current = {
                    batchUpdateNodesCalls: 0,
                    ancestorRecalculationCalls: 0,
                };
            },
            snapshotMobileCommitSpy: () => ({
                ...mobileTaskDragCommitSpyRef.current,
                undoDepth: useUndoStore.getState().undoStack.length,
            }),
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
        const overlayWidth = activeDrag.type === 'wbs-column'
            ? DESKTOP_TASK_DRAG_OVERLAY_COLUMN_WIDTH_PX
            : DESKTOP_TASK_DRAG_OVERLAY_CARD_WIDTH_PX;
        return resolvePointerUpperRightOverlayPosition({
            pointer: desktopDragOverlayPointer,
            overlay: {
                width: overlayWidth * DESKTOP_TASK_DRAG_OVERLAY_SCALE,
                height: DESKTOP_TASK_DRAG_OVERLAY_HEIGHT_PX * DESKTOP_TASK_DRAG_OVERLAY_SCALE,
            },
            viewport: {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
            },
            pointerGap: DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX,
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
        if (nextPreview) desktopLastVisibleDropPreviewRef.current = nextPreview;
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
        const columnBodyAtPoint = typeof document !== 'undefined'
            ? Array.from(document.querySelectorAll<HTMLElement>(
                '[data-task-drop-surface-kind="column-drop"]',
            )).find((column) => {
                const rect = column.getBoundingClientRect();
                return point.x >= rect.left && point.x <= rect.right
                    && point.y >= rect.top && point.y <= rect.bottom;
            })
            : null;
        const directCardAtPoint = columnBodyAtPoint
            ? Array.from(columnBodyAtPoint.querySelectorAll<HTMLElement>(
                ':scope > [data-kanban-column-subtree-scope] > [data-task-placement-tree="true"] > [data-task-surface-scope="true"]',
            )).some((scope) => {
                const rect = scope.getBoundingClientRect();
                return point.x >= rect.left && point.x <= rect.right
                    && point.y >= rect.top && point.y <= rect.bottom;
            })
            : false;
        if (columnBodyAtPoint && !directCardAtPoint) {
            recordDesktopTaskDragDebug({
                type: 'child-intent:no-direct-card',
                sourceNodeId: activeData?.nodeId || null,
                point,
            });
            applyDesktopChildDrop(null);
            return false;
        }
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
            recordDesktopTaskDragDebug({
                type: 'child-intent:no-target',
                sourceNodeId: activeData?.nodeId || null,
                sourceType: activeData?.type || null,
                zoneTargetNodeId: resolveDesktopChildDropZoneAtPoint(point)?.targetNodeId || null,
                point,
            });
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
    }, [applyDesktopChildDrop, resolveDesktopChildDropAtPoint, resolveDesktopChildDropZoneAtPoint, updateDesktopDropPreview]);

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
        boardSurfaceRef,
        activeBoardId,
        activeWorkspaceId,
        canMoveTask,
        canEditTask,
        canCreateTask,
        canDeleteTask,
        canManageTaskReference,
        addNode,
        updateNode,
        batchUpdateNodes: batchUpdateNodesForMobileTaskDrag,
        commitTaskPlacementCommand: commitTaskPlacementCommandForMobileTaskDrag,
        archiveNode,
        moveTrackingReference,
        stageTrackingReference,
        placeStagedTrackingReference,
        recalculateAncestorStatus: recalculateAncestorStatusForMobileTaskDrag,
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

    useMobilePanBroker({
        surfaceRef: boardSurfaceRef,
        enabled: isMeetingRecordUnavailable && !dependencySelection && !isRecordTaskSelectionMode,
        viewSize: effectiveViewSize,
        requestViewSize,
        cancelActiveTaskDrag: taskDragSession.cancelForGestureConflict,
    });

    const viewportAdapter = React.useMemo(
        () => createKanbanViewportAdapter(() => boardSurfaceRef.current, () => activeBoardId),
        [activeBoardId],
    );

    React.useLayoutEffect(() => {
        registerViewportAdapter(viewportAdapter);
        return () => registerViewportAdapter(null);
    }, [registerViewportAdapter, viewportAdapter]);

    const setBoardCanvasRef = React.useCallback((element: HTMLDivElement | null) => {
        boardSurfaceRef.current = element;
        mousePanSurfaceRef.current = element;
    }, [mousePanSurfaceRef]);

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
        const isTrackingReference = Boolean(args.active?.data.current?.trackingReference);
        const exactPointer = desktopRawPointerRef.current || args.pointerCoordinates;
        if (
            ['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType)
            && exactPointer
            && typeof document !== 'undefined'
        ) {
            const boardCanvas = document.querySelector<HTMLElement>('[data-layout-region="board-canvas"]');
            const boardRect = boardCanvas?.getBoundingClientRect();
            const pointerOutsideBoard = Boolean(boardRect
                && (exactPointer.x < boardRect.left
                    || exactPointer.x > boardRect.right
                    || exactPointer.y < boardRect.top
                    || exactPointer.y > boardRect.bottom));
            const isOverUnplacedLane = pointerCollisions.some((collision: any) => (
                String(collision.id) === 'task-workbench-unplaced-lane'
            ));
            const isOverPlacedLane = pointerCollisions.some((collision: any) => (
                String(collision.id).startsWith('task-workbench-placed-board-lane-')
            ));
            const isOverPlacedTask = pointerCollisions.some((collision: any) => (
                String(collision.id).startsWith('task-workbench-placed-task-')
            ));
            const isAllowedWorkbenchLane = isOverUnplacedLane
                || ((activeSource === 'task-workbench' || isTrackingReference) && (isOverPlacedLane || isOverPlacedTask));
            if (pointerOutsideBoard && !isAllowedWorkbenchLane) {
                recordDesktopTaskDragDebug({
                    type: 'collision:outside-board',
                    activeId: String(args.active?.id),
                    pointer: exactPointer,
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
        if (args.active?.data.current?.trackingReference) {
            return collisions.filter((collision: any) => {
                const targetData = getCollisionContainer(collision)?.data.current;
                return (
                    (Boolean(targetData?.nodeId)
                        && ['wbs-column', 'wbs-column-drop', 'wbs-card', 'wbs-card-drop', 'wbs-checklist', 'wbs-checklist-drop', 'task-workbench-placed-task'].includes(targetData.type))
                    || targetData?.type === 'task-workbench-placed-board-lane'
                    || targetData?.type === 'task-workbench-unplaced-lane'
                );
            });
        }
        const buildDesktopL1Target = ({
            targetDndId,
            targetElement,
            targetData,
            validRect,
        }: {
            targetDndId: string;
            targetElement: HTMLElement;
            targetData: Record<string, any>;
            validRect: DesktopL1DropTarget['validRect'];
        }) => {
            const droppableContainer = getCollisionContainer({ id: targetDndId });
            if (!droppableContainer) return null;
            const preview = resolveDesktopTaskDropPreview({
                activeData: args.active?.data.current,
                targetData,
                targetDndId,
                targetElement,
                nodesRecord: useWbsStore.getState().nodes,
            });
            if (!preview) return null;
            const existingCollision = collisions.find(
                (collision: any) => String(collision.id) === targetDndId,
            );
            return {
                target: {
                    validRect,
                    preview,
                    over: {
                        id: targetDndId,
                        data: { current: targetData },
                    },
                } satisfies DesktopL1DropTarget,
                collision: existingCollision || {
                    id: targetDndId,
                    data: { droppableContainer, value: 0 },
                },
            };
        };

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
            const unplacedLaneCollision = collisions.find((collision: any) => (
                getCollisionContainer(collision)?.data.current?.type === 'task-workbench-unplaced-lane'
            ));
            if (unplacedLaneCollision) return [unplacedLaneCollision];

            if (exactPointer && typeof document !== 'undefined') {
                const boardCanvas = document.querySelector<HTMLElement>('[data-layout-region="board-canvas"]');
                const boardRect = boardCanvas?.getBoundingClientRect();
                const columnElements = Array.from(
                    boardCanvas?.querySelectorAll<HTMLElement>('[data-kanban-column="true"][data-task-id]') || [],
                );
                const columns: DesktopL1ColumnGeometry[] = columnElements.map((column) => {
                    const rect = column.getBoundingClientRect();
                    return {
                        id: column.getAttribute('data-task-placement-id') || '',
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                    };
                }).filter(column => Boolean(column.id));
                const orderingTarget = resolveDesktopL1OrderingTarget({
                    pointerX: exactPointer.x,
                    columns,
                    previousTarget: desktopL1OrderingTargetRef.current,
                });
                const targetElement = orderingTarget
                    ? columnElements.find(column => column.getAttribute('data-task-placement-id') === orderingTarget.targetId)
                        ?.querySelector<HTMLElement>('[data-kanban-column-header="true"]')
                    : null;
                const droppableContainer = orderingTarget
                    ? getCollisionContainer({ id: orderingTarget.targetId })
                    : null;
                const targetData = droppableContainer?.data.current && orderingTarget
                    ? {
                        ...droppableContainer.data.current,
                        orderingPosition: orderingTarget.orderingPosition,
                    }
                    : null;
                const resolvedTarget = orderingTarget && targetElement && targetData && boardRect
                    ? buildDesktopL1Target({
                        targetDndId: orderingTarget.targetId,
                        targetElement,
                        targetData,
                        validRect: {
                            left: boardRect.left,
                            right: boardRect.right,
                            top: boardRect.top,
                            bottom: boardRect.bottom,
                        },
                    })
                    : null;
                desktopL1OrderingTargetRef.current = orderingTarget;
                desktopL1DropTargetRef.current = resolvedTarget?.target || null;
                recordDesktopTaskDragDebug({
                    type: resolvedTarget ? 'collision:l1-horizontal-target' : 'collision:l1-horizontal-noop',
                    pointer: exactPointer,
                    targetNodeId: orderingTarget?.targetId || null,
                    targetPosition: orderingTarget?.orderingPosition || null,
                    boundaryIndex: orderingTarget?.boundaryIndex ?? null,
                    indicatorLeft: resolvedTarget?.target.preview.indicatorRect.left ?? null,
                });
                if (resolvedTarget) return [resolvedTarget.collision];
            }

            desktopL1DropTargetRef.current = null;
            return collisions.filter((collision: any) => (
                getCollisionContainer(collision)?.data.current?.type === 'wbs-column'
            ));
        }

        if (exactPointer && typeof document !== 'undefined') {
            const pointerElement = document.elementFromPoint(exactPointer.x, exactPointer.y);
            const directL1Surface = pointerElement instanceof Element
                ? pointerElement.closest<HTMLElement>(
                    '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="column-header"], '
                    + '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="root-drop"]',
                )
                : null;
            if (directL1Surface) {
                const targetSurfaceKind = directL1Surface.getAttribute('data-task-drop-surface-kind');
                const targetDndId = (directL1Surface.getAttribute('data-desktop-drop-id') || '')
                    .split(/\s+/)
                    .find(Boolean);
                const droppableContainer = targetDndId
                    ? getCollisionContainer({ id: targetDndId })
                    : null;
                let orderingTarget: DesktopL1OrderingTarget | null = null;
                if (targetSurfaceKind === 'column-header') {
                    const boardCanvas = directL1Surface.closest<HTMLElement>('[data-layout-region="board-canvas"]');
                    const columnElements = Array.from(
                        boardCanvas?.querySelectorAll<HTMLElement>('[data-kanban-column="true"][data-task-id]') || [],
                    );
                    const columns: DesktopL1ColumnGeometry[] = columnElements.map((column) => {
                        const rect = column.getBoundingClientRect();
                        return {
                            id: column.getAttribute('data-task-placement-id') || '',
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom,
                        };
                    }).filter(column => Boolean(column.id));
                    orderingTarget = resolveDesktopL1OrderingTarget({
                        pointerX: exactPointer.x,
                        columns,
                        previousTarget: desktopL1OrderingTargetRef.current,
                    });
                }
                const targetData = droppableContainer?.data.current
                    ? {
                        ...droppableContainer.data.current,
                        ...(orderingTarget ? { orderingPosition: orderingTarget.orderingPosition } : {}),
                    }
                    : null;
                const surfaceRect = directL1Surface.getBoundingClientRect();
                const resolvedTarget = targetDndId && targetData
                    ? buildDesktopL1Target({
                        targetDndId,
                        targetElement: directL1Surface,
                        targetData,
                        validRect: {
                            left: surfaceRect.left,
                            right: surfaceRect.right,
                            top: surfaceRect.top,
                            bottom: surfaceRect.bottom,
                        },
                    })
                    : null;
                desktopL1OrderingTargetRef.current = orderingTarget;
                desktopL1DropTargetRef.current = resolvedTarget?.target || null;
                if (resolvedTarget) {
                    recordDesktopTaskDragDebug({
                        type: 'collision:l1-axis-target',
                        pointer: exactPointer,
                        targetNodeId: resolvedTarget.target.preview.targetNodeId,
                        targetPosition: resolvedTarget.target.preview.displayPosition,
                        targetSurfaceKind,
                        indicatorLeft: resolvedTarget.target.preview.indicatorRect.left,
                    });
                    return [resolvedTarget.collision];
                }
            }
        }

        // Exact task-surface ownership is only for task sources. A list/column
        // drag must keep dnd-kit's sortable collision path; routing wbs-column
        // through the task intent resolver makes every header target invalid.
        if (activeType !== 'wbs-column'
            && exactPointer
            && typeof document !== 'undefined') {
            const sourceRect = desktopDragSourceRectRef.current;
            if (sourceRect) {
                const pointerInsideSource = exactPointer.x >= sourceRect.left
                    && exactPointer.x <= sourceRect.right
                    && exactPointer.y >= sourceRect.top
                    && exactPointer.y <= sourceRect.bottom;
                if (pointerInsideSource) {
                    recordDesktopTaskDragDebug({
                        type: 'collision:source-block',
                        activeId: String(args.active?.id),
                        sourceRect,
                        pointer: exactPointer,
                    });
                    return [];
                }
            }

            const rawElement = document.elementFromPoint(
                exactPointer.x,
                exactPointer.y,
            );
            const rawDirectSurface = rawElement instanceof Element
                ? rawElement.closest<HTMLElement>('[data-desktop-drop-surface="true"]')
                : null;
            // The fixed drag overlay and the nested scroll rail can make
            // elementFromPoint return a non-surface node for the last few
            // pixels of a column body.  Recover the owning column by its
            // actual viewport rectangle before falling back to dnd-kit's
            // translated active-rect collision (which may select the next
            // horizontally adjacent column).
            const pointColumnSurface = rawDirectSurface ? null : Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="column-drop"]',
                ),
            ).find((column) => {
                const rect = column.getBoundingClientRect();
                return exactPointer.x >= rect.left
                    && exactPointer.x <= rect.right
                    && exactPointer.y >= rect.top
                    && exactPointer.y <= rect.bottom;
            }) || null;
            const checklistSurfaceAtPointer = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="checklist-row"]',
                ),
            ).find((row) => {
                const rect = row.getBoundingClientRect();
                return exactPointer.x >= rect.left
                    && exactPointer.x <= rect.right
                    && exactPointer.y >= rect.top
                    && exactPointer.y <= rect.bottom;
            }) || null;
            const cardSurfaceAtPointer = Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="kanban-card"]',
                ),
            ).find((card) => {
                const rect = card.getBoundingClientRect();
                return exactPointer.x >= rect.left
                    && exactPointer.x <= rect.right
                    && exactPointer.y >= rect.top
                    && exactPointer.y <= rect.bottom;
            }) || null;
            const exteriorColumnSurface = rawDirectSurface ? null : Array.from(
                document.querySelectorAll<HTMLElement>(
                    '[data-desktop-drop-surface="true"][data-task-drop-surface-kind="column-drop"]',
                ),
            ).find((column) => {
                const rect = column.getBoundingClientRect();
                return isDesktopPointerInColumnTailExterior({
                    pointerX: exactPointer.x,
                    pointerY: exactPointer.y,
                    columnLeft: rect.left,
                    columnRight: rect.right,
                    columnBottom: rect.bottom,
                    });
                }) || null;
            // A nested checklist row has priority even when elementFromPoint
            // reports its enclosing column (e.g. the row's pointer-events
            // state changes during a sortable placeholder render).
            const directSurface = checklistSurfaceAtPointer
                || cardSurfaceAtPointer
                || rawDirectSurface
                || pointColumnSurface
                || exteriorColumnSurface;

            if (directSurface) {
                if (directSurface.getAttribute('data-task-drop-surface-kind') === 'column-drop') {
                    const columnRect = directSurface.getBoundingClientRect();
                    const subtree = directSurface.querySelector<HTMLElement>(
                        ':scope > [data-kanban-column-subtree-scope]',
                    );
                    const cardScopes = Array.from(subtree?.querySelectorAll<HTMLElement>([
                        // The root TaskPlacementTree is a structural wrapper
                        // between the column subtree and its same-level card
                        // surfaces. Keep the legacy direct-child shape as a
                        // compatibility fallback, but do not descend into a
                        // card's nested checklist tree.
                        ':scope > [data-task-placement-tree="true"] > [data-task-surface-scope="true"][data-task-id]',
                        ':scope > [data-task-surface-scope="true"][data-task-id]',
                    ].join(', ')) || []);
                    const taskRects = cardScopes.map((scope) => {
                        const rect = scope.getBoundingClientRect();
                        return {
                            id: scope.getAttribute('data-task-id') || '',
                            top: rect.top,
                            bottom: rect.bottom,
                        };
                    }).filter(rect => Boolean(rect.id));
                    const region = exteriorColumnSurface === directSurface
                        ? { kind: 'column-append' as const }
                        : resolveDesktopColumnDropPointerRegion({
                            pointerY: exactPointer.y,
                            columnTop: columnRect.top,
                            columnBottom: columnRect.bottom,
                            taskRects,
                        });

                    if (exteriorColumnSurface === directSurface) {
                        recordDesktopTaskDragDebug({
                            type: 'collision:column-tail-exterior',
                            pointer: exactPointer,
                            columnId: directSurface.getAttribute('data-task-id'),
                            columnBottom: columnRect.bottom,
                        });
                    }

                    if (region.kind === 'none') {
                        desktopColumnGapTargetRef.current = null;
                        recordDesktopTaskDragDebug({
                            type: 'collision:column-append-outside-tail',
                            pointer: exactPointer,
                            columnRect: {
                                top: columnRect.top,
                                bottom: columnRect.bottom,
                            },
                        });
                        return [];
                    }

                    if (region.kind === 'task-nearest') {
                        const scopesById = new Map(cardScopes.map(scope => [
                            scope.getAttribute('data-task-id') || '',
                            scope,
                        ]));
                        const gapCandidates = region.candidateIds.flatMap((candidateId) => {
                            const scope = scopesById.get(candidateId);
                            const targetElement = scope?.querySelector<HTMLElement>(
                                ':scope > [data-task-surface-source="true"][data-desktop-drop-id]',
                            );
                            const targetDndId = targetElement
                                ?.getAttribute('data-desktop-drop-id')
                                ?.split(/\s+/)
                                .find(Boolean);
                            if (!scope || !targetElement || !targetDndId) return [];
                            const droppableContainer = getCollisionContainer({ id: targetDndId });
                            const scopeRect = scope.getBoundingClientRect();
                            const targetData = {
                                ...droppableContainer?.data.current,
                                orderingPosition: resolveDesktopTaskEdgePosition({
                                    pointerY: exactPointer.y,
                                    taskTop: scopeRect.top,
                                    taskBottom: scopeRect.bottom,
                                }),
                            };
                            const preview = resolveDesktopTaskDropPreview({
                                activeData: args.active?.data.current,
                                targetData,
                                targetDndId,
                                targetElement,
                                nodesRecord: useWbsStore.getState().nodes,
                            });
                            if (!droppableContainer || !preview) return [];
                            const existingCollision = collisions.find(
                                (collision: any) => String(collision.id) === targetDndId,
                            );
                            return [{
                                id: candidateId,
                                indicatorTop: preview.indicatorRect.top,
                                collision: existingCollision || {
                                    id: targetDndId,
                                    data: { droppableContainer, value: 0 },
                                },
                                preview,
                                targetData,
                                targetDndId,
                            }];
                        });
                        const nearest = selectNearestDesktopTaskGapCandidate({
                            pointerY: exactPointer.y,
                            candidates: gapCandidates,
                        });
                        const cacheYRange = resolveDesktopColumnTaskCacheYRange({
                            pointerY: exactPointer.y,
                            columnTop: columnRect.top,
                            taskRects,
                            candidateIds: region.candidateIds,
                        });
                        recordDesktopTaskDragDebug({
                            type: nearest ? 'collision:column-gap-nearest' : 'collision:column-gap-blocked',
                            pointer: exactPointer,
                            dndPointer: args.pointerCoordinates,
                            candidateIds: region.candidateIds,
                            targetNodeId: nearest?.preview.targetNodeId || null,
                            targetPosition: nearest?.preview.displayPosition || null,
                            indicatorTop: nearest?.indicatorTop || null,
                            cacheYRange,
                        });
                        desktopColumnGapTargetRef.current = nearest && cacheYRange ? {
                            ownership: 'ordering-gap',
                            validRect: {
                                left: columnRect.left,
                                right: columnRect.right,
                                top: cacheYRange.top,
                                bottom: cacheYRange.bottom,
                            },
                            preview: nearest.preview,
                            over: {
                                id: nearest.targetDndId,
                                data: { current: nearest.targetData },
                            },
                        } : null;
                        return nearest ? [nearest.collision] : [];
                    }
                    const targetDndId = (directSurface.getAttribute('data-desktop-drop-id') || '')
                        .split(/\s+/)
                        .find(Boolean);
                    const droppableContainer = targetDndId
                        ? getCollisionContainer({ id: targetDndId })
                        : null;
                    const targetData = droppableContainer?.data.current;
                    const preview = targetDndId ? resolveDesktopTaskDropPreview({
                        activeData: args.active?.data.current,
                        targetData,
                        targetDndId,
                        targetElement: directSurface,
                        nodesRecord: useWbsStore.getState().nodes,
                    }) : null;
                    if (!targetDndId || !droppableContainer || !preview) {
                        desktopColumnGapTargetRef.current = null;
                        return [];
                    }
                    const existingCollision = collisions.find(
                        (collision: any) => String(collision.id) === targetDndId,
                    );
                    const collision = existingCollision || {
                        id: targetDndId,
                        data: { droppableContainer, value: 0 },
                    };
                    const lastTaskBottom = taskRects[taskRects.length - 1]?.bottom ?? columnRect.top;
                    desktopColumnGapTargetRef.current = {
                        ownership: 'ordering-gap',
                        validRect: {
                            left: columnRect.left,
                            right: columnRect.right,
                            top: lastTaskBottom,
                            bottom: columnRect.bottom + DESKTOP_COLUMN_TAIL_EXTERIOR_SLOP_PX,
                        },
                        preview,
                        over: {
                            id: targetDndId,
                            data: { current: targetData },
                        },
                    };
                    recordDesktopTaskDragDebug({
                        type: 'collision:column-tail-canonical',
                        pointer: exactPointer,
                        targetNodeId: preview.targetNodeId,
                        indicatorTop: preview.indicatorRect.top,
                        validRect: desktopColumnGapTargetRef.current.validRect,
                    });
                    return [collision];
                } else {
                    desktopColumnGapTargetRef.current = null;
                }

                const directIds = (directSurface.getAttribute('data-desktop-drop-id') || '')
                    .split(/\s+/)
                    .filter(Boolean);
                const directCollisions = directIds
                    .map((id) => {
                        const existingCollision = pointerCollisions.find(
                            (collision: any) => String(collision.id) === id,
                        ) || collisions.find((collision: any) => String(collision.id) === id);
                        if (existingCollision) return existingCollision;
                        const droppableContainer = getCollisionContainer({ id });
                        return droppableContainer
                            ? { id, data: { droppableContainer, value: 0 } }
                            : null;
                    })
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
                const orderingScope = directSurface.closest<HTMLElement>('[data-task-surface-scope="true"]');
                const orderingRect = orderingScope?.getBoundingClientRect();
                const directRect = directSurface.getBoundingClientRect();
                // A collapsed card/row already has an edge close to the pointer.
                // Only an expanded L2 title can otherwise inherit source-order
                // direction and send its marker to a distant subtree tail.
                const isDirectOrderingSurface = Boolean(
                    orderingRect
                    && targetData?.type === 'wbs-card'
                    && orderingRect.height > directRect.height + 8
                );
                const pointerTargetData = targetData && isDirectOrderingSurface && orderingRect
                    ? {
                        ...targetData,
                        orderingPosition: resolveDesktopTaskEdgePosition({
                            // An expanded card has a large descendant scope,
                            // but the pointer is still attached to its direct
                            // title surface.  Resolve the edge from that
                            // primary surface (with a slightly generous
                            // leading half) so a title-center pointer selects
                            // the nearby outer boundary rather than the
                            // distant subtree tail.
                            pointerY: exactPointer.y,
                            taskTop: directRect.top,
                            taskBottom: directRect.top + directRect.height * 1.5,
                        }),
                      }
                    : targetData;
                const resolved = resolveDesktopTaskDropIntent({
                    activeData: args.active?.data.current,
                    targetData: pointerTargetData,
                    nodesRecord: useWbsStore.getState().nodes,
                });
                const directPreview = resolved && pointerTargetData
                    ? resolveDesktopTaskDropPreview({
                        activeData: args.active?.data.current,
                        targetData: pointerTargetData,
                        targetDndId: String(directCollision.id),
                        targetElement: directSurface,
                        nodesRecord: useWbsStore.getState().nodes,
                    })
                    : null;
                desktopColumnGapTargetRef.current = directPreview && isDirectOrderingSurface ? {
                    ownership: 'direct-ordering',
                    validRect: {
                        left: directRect.left,
                        right: directRect.right,
                        top: directRect.top,
                        bottom: directRect.bottom,
                    },
                    preview: directPreview,
                    over: {
                        id: String(directCollision.id),
                        data: { current: pointerTargetData },
                    },
                } : null;

                // Exact innermost ownership: an invalid child/source surface blocks
                // its ancestors instead of silently redirecting the task elsewhere.
                recordDesktopTaskDragDebug({
                    type: resolved ? 'collision:direct-hit' : 'collision:invalid-direct',
                    directId: String(directCollision.id),
                    targetType: targetData?.type,
                    targetNodeId: targetData?.nodeId,
                    targetPosition: directPreview?.displayPosition || null,
                    pointerDistanceToIndicator: directPreview
                        ? Math.abs(directPreview.indicatorRect.top - exactPointer.y)
                        : null,
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
    const taskLoading = useWbsStore(s => s.loading);
    const taskLoadError = useWbsStore(s => s.error);
    const taskFilters = useTaskFilterStore(s => s.filters);
    const resetTaskFilters = useTaskFilterStore(s => s.resetFilters);
    const filterProjection = useMemo(
        () => projectTaskFilterResults(
            buildTaskFilterNodesWithTrackingReferences(Object.values(storeNodes), trackingReferences, activeBoardId || ''),
            taskFilters,
            { boardId: activeBoardId },
        ),
        [activeBoardId, storeNodes, taskFilters, trackingReferences],
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
    const rootTrackingReferences = useMemo(() => trackingReferences
        .filter(reference => reference.boardId === activeBoardId
            && reference.parentPlacementId === null
            && !reference.removedAt
            && filterProjection.visibleTaskIds.has(reference.taskId))
        .map(reference => ({ reference, task: storeNodes[reference.taskId] }))
        .filter((row): row is { reference: TaskTrackingReference; task: TaskNode } => Boolean(row.task)),
    [activeBoardId, filterProjection, storeNodes, trackingReferences]);
    const boardRootRows = useMemo(() => [
        ...rootNodes.map(node => ({ kind: 'primary' as const, order: node.order, node })),
        ...rootTrackingReferences.map(row => ({ kind: 'tracking' as const, order: row.reference.order, ...row })),
    ].sort((left, right) => left.order - right.order), [rootNodes, rootTrackingReferences]);

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
        const activeIsTrackingReference = Boolean(event.active?.data.current?.trackingReference);
        if (activeIsTrackingReference ? !canManageTaskReference : !canMoveTask) return;
        desktopDragCancelledRef.current = false;
        const { active } = event;
        const activeData = active.data.current;
        desktopColumnGapTargetRef.current = null;
        desktopL1DropTargetRef.current = null;
        desktopL1OrderingTargetRef.current = null;
        desktopChildDropSessionRef.current += 1;
        applyDesktopChildDrop(null);
        desktopActiveDataRef.current = activeData;
        const nodeId = activeData?.nodeId;
        const sourcePlacementId = activeData?.placementId;
        const sourcePlacementScope = sourcePlacementId
            ? Array.from(document.querySelectorAll<HTMLElement>('[data-task-placement-id]'))
                .find(element => element.getAttribute('data-task-placement-id') === sourcePlacementId) || null
            : null;
        const sourceCandidates = sourcePlacementScope
            ? Array.from(sourcePlacementScope.querySelectorAll<HTMLElement>('[data-task-id]'))
            : Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]'))
                .filter((element) => element.getAttribute('data-task-id') === nodeId);
        const sourceElement = activeData?.source === 'task-workbench'
            ? sourceCandidates.find((element) => element.hasAttribute('data-task-workbench-drag-surface'))
            : (sourcePlacementScope?.hasAttribute('data-task-surface-source') ? sourcePlacementScope : null)
                || sourceCandidates.find((element) => element.hasAttribute('data-task-surface-source'))
                || sourceCandidates.find((element) => element.hasAttribute('data-task-drag-surface'));
        // The draggable surface, rather than its enclosing frame, owns the
        // source exclusion rectangle.  A checklist frame can contain an
        // expanded descendant tree; using the frame's bounds would make
        // every sibling row look like the source and block valid reorders.
        const sourceRect = sourceElement?.getBoundingClientRect();
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
        recordDesktopTaskDragDebug({
            type: 'drag-start:geometry',
            placementId: sourcePlacementId || null,
            sourceElementKind: sourceElement?.getAttribute('data-task-drag-surface-kind') || null,
            hasSourceRect: Boolean(desktopDragSourceRectRef.current),
            hasOriginIndicator: Boolean(originIndicator),
            hasActivatorPoint: Boolean(desktopDragActivatorPointRef.current),
        });
        desktopRawPointerRef.current = desktopDragActivatorPointRef.current;
        desktopDragOverlayActiveRef.current = true;
        setDesktopDragOverlayPointer(desktopRawPointerRef.current);
        desktopLastVisibleDropPreviewRef.current = null;
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
        desktopColumnGapTargetRef.current = null;
        desktopL1DropTargetRef.current = null;
        desktopL1OrderingTargetRef.current = null;
        desktopLastVisibleDropPreviewRef.current = null;
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
        window.addEventListener('orientationchange', cancel);
        window.addEventListener('resize', cancel);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('pointercancel', cancel, true);
            window.removeEventListener('blur', cancel);
            window.removeEventListener('pagehide', cancel);
            window.removeEventListener('orientationchange', cancel);
            window.removeEventListener('resize', cancel);
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
        const pointer = desktopRawPointerRef.current;
        const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(active.data.current?.type);
        const canUseChildIntent = active.data.current?.source !== 'task-workbench'
            && (sourceSurfaceKind === 'kanban-card' || sourceSurfaceKind === 'checklist-row');
        let hasChildCandidate = false;
        // dnd-kit may emit collision changes without a corresponding onDragMove
        // callback (notably when the pointer settles after crossing nested
        // droppables). Feed both event streams into the one child-intent state
        // machine so the 1s dwell is reliable without a second implementation.
        if (pointer && canUseChildIntent) {
            hasChildCandidate = updateDesktopChildDropAtPoint(active.data.current, pointer);
            if ((desktopChildDropRef.current as DesktopTaskChildDropState | null)?.phase === 'armed') {
                updateDesktopDropPreview(null);
                return;
            }
        }
        // Drag-over events can arrive after drag-move and otherwise resurrect
        // a cached card-gap preview while the pointer is back over the source
        // row.  Keep the source's explicit no-op/origin state authoritative
        // across both event streams.
        const sourceRect = desktopDragSourceRectRef.current;
        const pointerInsideSource = Boolean(pointer && sourceRect
            && pointer.x >= sourceRect.left
            && pointer.x <= sourceRect.right
            && pointer.y >= sourceRect.top
            && pointer.y <= sourceRect.bottom);
        if (pointerInsideSource) {
            applyDesktopChildDrop(null);
            desktopColumnGapTargetRef.current = null;
            desktopL1DropTargetRef.current = null;
            desktopL1OrderingTargetRef.current = null;
            updateDesktopDropPreview(null);
            setDesktopOriginIndicator(desktopDragOriginIndicatorRef.current);
            recordDesktopTaskDragDebug({
                type: 'drag-over:source-block',
                pointer,
                sourceRect,
            });
            return;
        }
        const forcedL1Target = desktopL1DropTargetAtPointer(
            desktopL1DropTargetRef.current,
            pointer,
        );
        // A direct checklist row owns the pointer while its child-intent
        // candidate is pending.  Do not let a previously cached outer-card
        // gap steal that pending row reorder.
        const cachedGapTarget = desktopColumnGapTargetAtPointer(
            desktopColumnGapTargetRef.current,
            pointer,
        );
        // A direct expanded-card title owns a short-lived ordering preview
        // while DEV-068's child intent is still pending.  Keep that preview
        // visible until the child dwell arms; checklist-row ordering gaps do
        // not use this direct-ordering ownership and remain suppressed while
        // their child candidate is pending.
        const forcedGapTarget = cachedGapTarget?.ownership === 'direct-ordering'
            ? cachedGapTarget
            : hasChildCandidate ? null : cachedGapTarget;
        const preview = forcedL1Target?.preview
            || forcedGapTarget?.preview
            || (over ? buildDesktopDropPreview(active, over) : null);
        recordDesktopTaskDragDebug({
            type: forcedL1Target
                ? 'drag-over:l1-axis-forced'
                : forcedGapTarget ? 'drag-over:column-gap-forced' : 'drag-over',
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
            recordDesktopTaskDragDebug({
                type: 'drag-move:missing-origin-geometry',
                hasSourceRect: Boolean(sourceRect),
                hasActivatorPoint: Boolean(activatorPoint),
                hasOriginIndicator: Boolean(originIndicator),
            });
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
        const forcedL1Target = desktopL1DropTargetAtPointer(
            desktopL1DropTargetRef.current,
            pointer,
        );
        const hasChildCandidate = updateDesktopChildDropAtPoint(event.active.data.current, pointer);
        const cachedGapTarget = desktopColumnGapTargetAtPointer(
            desktopColumnGapTargetRef.current,
            pointer,
        );
        const forcedGapTarget = cachedGapTarget?.ownership === 'direct-ordering'
            ? cachedGapTarget
            : hasChildCandidate ? null : cachedGapTarget;
        if (forcedGapTarget?.ownership === 'ordering-gap') {
            // A card-to-card gap owns same-level ordering before the enclosing
            // column's child zone. Keeping that ownership for the full gap also
            // prevents 1–2px pointer moves from falling back to a stale dnd over.
            applyDesktopChildDrop(null);
            setDesktopOriginIndicator(null);
            updateDesktopDropPreview(forcedGapTarget.preview);
            recordDesktopTaskDragDebug({
                type: 'drag-move:column-gap-forced',
                pointer,
                cachedValidRect: forcedGapTarget.validRect,
                previewTargetId: forcedGapTarget.preview.targetNodeId,
                previewPosition: forcedGapTarget.preview.displayPosition,
            });
            return;
        }
        if (hasChildCandidate && desktopChildDropRef.current?.phase === 'armed') return;
        const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(event.active.data.current?.type);
        const canUseChildDrop = Boolean(
            event.active.data.current?.source !== 'task-workbench'
            && (sourceSurfaceKind === 'kanban-card' || sourceSurfaceKind === 'checklist-row')
        );
        const blockedChildZone = canUseChildDrop && !hasChildCandidate
            ? resolveDesktopChildDropZoneAtPoint(pointer)
            : null;
        if (blockedChildZone) {
            setDesktopOriginIndicator(null);
            updateDesktopDropPreview(null);
            return;
        }
        setDesktopOriginIndicator(null);
        const preview = forcedL1Target?.preview
            || forcedGapTarget?.preview
            || (event.over ? buildDesktopDropPreview(event.active, event.over) : null);
        updateDesktopDropPreview(preview);
    };

    const handleDragEnd = async (event: any) => {
        const wasCancelled = desktopDragCancelledRef.current;
        desktopDragCancelledRef.current = false;
        const { active, over } = event;
        const displayedPreview = desktopDropPreviewRef.current;
        const lastVisiblePreview = desktopLastVisibleDropPreviewRef.current;
        const releasePointerCandidate = desktopRawPointerRef.current;
        const displayedL1Element = displayedPreview?.indicatorAxis === 'vertical'
            ? findDesktopTaskDropElement(displayedPreview.targetDndId)
            : null;
        const displayedL1Rect = displayedL1Element?.getBoundingClientRect();
        const boardRectForL1Release = displayedL1Element
            ?.closest<HTMLElement>('[data-layout-region="board-canvas"]')
            ?.getBoundingClientRect();
        const displayedL1ReleaseIsValid = Boolean(
            displayedPreview?.indicatorAxis === 'vertical'
            && releasePointerCandidate
            && (over?.data.current?.nodeId || null) === displayedPreview.targetNodeId
            && (active.data.current?.type === 'wbs-column'
                ? boardRectForL1Release
                    && releasePointerCandidate.x >= boardRectForL1Release.left
                    && releasePointerCandidate.x <= boardRectForL1Release.right
                    && releasePointerCandidate.y >= boardRectForL1Release.top
                    && releasePointerCandidate.y <= boardRectForL1Release.bottom
                : displayedL1Rect
                    && releasePointerCandidate.x >= displayedL1Rect.left
                    && releasePointerCandidate.x <= displayedL1Rect.right
                    && releasePointerCandidate.y >= displayedL1Rect.top
                    && releasePointerCandidate.y <= displayedL1Rect.bottom)
        );
        const displayedL1ReleaseOver = displayedL1ReleaseIsValid && over
            ? {
                id: over.id,
                data: {
                    current: {
                        ...over.data.current,
                        ...(displayedPreview?.displayPosition === 'before'
                            || displayedPreview?.displayPosition === 'after'
                            ? { orderingPosition: displayedPreview.displayPosition }
                            : {}),
                    },
                },
            }
            : null;
        const releaseL1Target = desktopL1DropTargetAtPointer(
            desktopL1DropTargetRef.current,
            desktopRawPointerRef.current,
        );
        const releaseGapTarget = desktopColumnGapTargetAtPointer(
            desktopColumnGapTargetRef.current,
            desktopRawPointerRef.current,
        );
        const effectiveOver = releaseL1Target?.over
            || displayedL1ReleaseOver
            || releaseGapTarget?.over
            || over;
        const currentPreview = releaseL1Target?.preview
            || (displayedL1ReleaseOver ? displayedPreview : null)
            || releaseGapTarget?.preview
            || (effectiveOver ? buildDesktopDropPreview(active, effectiveOver) : null);
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
            && (releaseSourceSurfaceKind === 'kanban-card' || releaseSourceSurfaceKind === 'checklist-row')
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
        recordDesktopTaskDragDebug({
            type: 'drag-end:release-state',
            activeType: active.data.current?.type,
            releasePointer,
            releaseInsideSource,
            effectiveOverId: effectiveOver ? String(effectiveOver.id) : null,
            effectiveOverType: effectiveOver?.data.current?.type || null,
            displayedTargetId: displayedPreview?.targetNodeId || null,
            displayedPosition: displayedPreview?.displayPosition || null,
            lastVisibleTargetId: lastVisiblePreview?.targetNodeId || null,
            lastVisiblePosition: lastVisiblePreview?.displayPosition || null,
            currentTargetId: currentPreview?.targetNodeId || null,
            currentPosition: currentPreview?.displayPosition || null,
            releaseL1TargetRetained: Boolean(releaseL1Target),
            displayedL1ReleaseIsValid,
            releaseChildTargetId: releaseChildTarget?.targetNodeId || null,
            releaseChildZoneId: releaseChildZone?.targetNodeId || null,
        });
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
        desktopColumnGapTargetRef.current = null;
        desktopL1DropTargetRef.current = null;
        desktopL1OrderingTargetRef.current = null;
        desktopLastVisibleDropPreviewRef.current = null;
        setDesktopDragOverlayPointer(null);
        updateDesktopDropPreview(null);
        setDesktopOriginIndicator(null);
        clearDesktopChildDrop();
        setActiveDrag(null);
        if (wasCancelled) return;
        if (!canMoveTask) return;
        if (releaseInsideSource) {
            recordDesktopTaskDragDebug({ type: 'drag-end:blocked-source' });
            return;
        }

        if (canCommitDisplayedChild && displayedChildDrop && releaseChildTarget) {
            const childPreview: DesktopTaskDropPreview = {
                sourceNodeId: displayedChildDrop.sourceNodeId,
                targetNodeId: releaseChildTarget.targetNodeId,
                targetDndId: `task-title-child:${releaseChildTarget.targetNodeId}`,
                targetSurfaceKind: releaseChildTarget.targetSurfaceKind,
                outcomeKind: releaseChildTarget.isOrigin ? 'origin' : 'move',
                displayPosition: 'append',
                intent: releaseChildTarget.intent,
                indicatorAxis: 'horizontal',
                indicatorRect: {
                    left: releaseChildTarget.previewRect.insertion.left,
                    top: releaseChildTarget.previewRect.insertion.top,
                    width: releaseChildTarget.previewRect.insertion.width,
                },
            };
            const result = await commitDesktopTaskDrag({
                activeData: active.data.current,
                overData: {
                    type: 'wbs-task-title-child',
                    nodeId: releaseChildTarget.targetNodeId,
                    placementId: releaseChildTarget.targetPlacementId,
                    trackingReference: useWbsStore.getState().trackingReferences.find(reference => reference.id === releaseChildTarget.targetPlacementId),
                },
                desktopPreview: childPreview,
                dependencies: {
                    activeBoardId,
                    activeWorkspaceId,
                    canMoveTask,
                    canManageTaskReference,
                    canEditTask,
                    canCreateTask,
                    canDeleteTask,
                    addNode,
                    updateNode,
                    batchUpdateNodes: batchUpdateNodesForDesktopTaskDrag,
                    commitTaskPlacementCommand: commitTaskPlacementCommandForDesktopTaskDrag,
                    archiveNode,
                    recalculateAncestorStatus: recalculateAncestorStatusForDesktopTaskDrag,
                    moveTrackingReference,
                    stageTrackingReference,
                    placeStagedTrackingReference,
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
        const pendingChildCandidateMatchesRelease = Boolean(
            displayedChildDrop?.phase === 'candidate'
            && displayedChildDrop.target.targetNodeId === releaseChildZone?.targetNodeId
        );
        if (releaseChildZone && !releaseChildTarget && !pendingChildCandidateMatchesRelease) {
            recordDesktopTaskDragDebug({ type: 'drag-end:blocked-invalid-child-zone' });
            return;
        }

        if (!effectiveOver) {
            recordDesktopTaskDragDebug({ type: 'drag-end:blocked-no-over' });
            return;
        }

        const activeType = active.data.current?.type;
        const targetType = effectiveOver.data.current?.type;
        const isWorkbenchLane = targetType === 'task-workbench-unplaced-lane'
            || targetType === 'task-workbench-placed-board-lane';
        const releasePreviewWasVisible = desktopTaskDropPreviewMatches(displayedPreview, currentPreview)
            || desktopTaskDropPreviewMatches(lastVisiblePreview, currentPreview);
        if (!isWorkbenchLane && !releasePreviewWasVisible) {
            recordDesktopTaskDragDebug({ type: 'drag-end:blocked-preview-mismatch' });
            return;
        }
        if (activeType === 'wbs-column' && targetType === 'wbs-column' && !active.data.current?.trackingReference) {
            const sourceId = active.data.current?.nodeId;
            const targetId = effectiveOver.data.current?.nodeId;
            const roots = useWbsStore.getState()
                .getRootNodesForBoard(activeBoardId || '')
                .filter(node => !node.isArchived)
                .sort((left, right) => left.order - right.order);
            const moved = roots.find(node => node.id === sourceId);
            const remaining = roots.filter(node => node.id !== sourceId);
            const targetIndex = remaining.findIndex(node => node.id === targetId);
            if (!moved || targetIndex < 0 || !currentPreview) return;
            const insertionIndex = targetIndex + (currentPreview.displayPosition === 'after' ? 1 : 0);
            const reordered = [...remaining];
            reordered.splice(insertionIndex, 0, moved);
            if (reordered.every((node, index) => node.id === roots[index]?.id)) return;
            const updatedAt = Date.now();
            batchUpdateNodesForDesktopTaskDrag(Object.fromEntries(reordered.map((node, order) => [
                node.id,
                { order, updatedAt },
            ])), { label: '移動列表位置', mergeKey: `move:${sourceId}` });
            return;
        }

        await commitDesktopTaskDrag({
            activeData: active.data.current,
            overData: effectiveOver.data.current,
            desktopPreview: isWorkbenchLane ? null : currentPreview,
            dependencies: {
                activeBoardId,
                activeWorkspaceId,
                canMoveTask,
                canManageTaskReference,
                canEditTask,
                canCreateTask,
                canDeleteTask,
                addNode,
                updateNode,
                batchUpdateNodes: batchUpdateNodesForDesktopTaskDrag,
                commitTaskPlacementCommand: commitTaskPlacementCommandForDesktopTaskDrag,
                archiveNode,
                recalculateAncestorStatus: recalculateAncestorStatusForDesktopTaskDrag,
                moveTrackingReference,
                stageTrackingReference,
                placeStagedTrackingReference,
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

    const resolvedDesktopOriginIndicator = desktopDropPreview?.outcomeKind === 'origin'
        ? desktopDragOriginIndicatorRef.current
        : desktopOriginIndicator;
    const desktopIndicator = desktopDropPreview?.outcomeKind === 'move'
        ? {
            kind: 'target' as const,
            targetNodeId: desktopDropPreview.targetNodeId,
            position: desktopDropPreview.displayPosition,
            surfaceKind: desktopDropPreview.targetSurfaceKind,
            axis: desktopDropPreview.indicatorAxis,
            indicatorRect: desktopDropPreview.indicatorRect,
            fieldHeight: undefined,
            sourceTitle: undefined,
        }
        : resolvedDesktopOriginIndicator
            ? {
                kind: 'origin' as const,
                targetNodeId: resolvedDesktopOriginIndicator.sourceNodeId,
                position: 'origin' as const,
                surfaceKind: resolvedDesktopOriginIndicator.sourceSurfaceKind,
                axis: 'origin' as const,
                indicatorRect: resolvedDesktopOriginIndicator.fieldRect,
                fieldHeight: resolvedDesktopOriginIndicator.fieldRect.height,
                sourceTitle: resolvedDesktopOriginIndicator.sourceTitle,
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
                <TaskWorkbenchPanel
                    canMoveTask={canMoveTask}
                    canManageTaskReference={canManageTaskReference}
                />
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
                        data-kanban-mobile-surface={isMeetingRecordUnavailable ? 'true' : undefined}
                        data-kanban-view-size={effectiveViewSize}
                        data-kanban-pinch-state="idle"
                        data-kanban-mouse-pan-surface="true"
                        data-layout-region="board-canvas"
                    >
                        <TaskFilterResultState
                            projection={filterProjection}
                            loading={taskLoading}
                            error={taskLoadError}
                            onReset={resetTaskFilters}
                            className="w-full min-w-[18rem] self-stretch"
                        />
                        {!taskLoading && !taskLoadError && (filterProjection.matchedTaskIds.size > 0 || rootTrackingReferences.length > 0) ? <SortableContext items={boardRootRows.map(row => row.kind === 'primary' ? primaryPlacementId(row.node.id) : row.reference.id)} strategy={horizontalListSortingStrategy}>
                            {boardRootRows.map(row => row.kind === 'primary' ? (
                                <KanbanColumn key={row.node.id} nodeId={row.node.id} filterProjection={filterProjection} />
                            ) : (
                                <KanbanColumn key={row.reference.id} nodeId={row.task.id} trackingReference={row.reference} filterProjection={filterProjection} />
                            ))}
                        </SortableContext> : null}

                        {/* 新增列表按鈕 */}
                        {!taskLoading && !taskLoadError && (filterProjection.matchedTaskIds.size > 0 || filterProjection.totalTaskCount === 0) ? <KanbanRootDropZone
                            workspaceId={activeWorkspaceId || ''}
                            boardId={activeBoardId}
                            anchorNodeId={rootNodes[rootNodes.length - 1]?.id}
                            isBoardEmpty={boardRootRows.length === 0}
                            canMoveTask={canMoveTask || canManageTaskReference}
                            mobileDropActive={taskDragSession.state?.targetKind === 'board-root'
                                && taskDragSession.state.targetBoardId === activeBoardId
                                && taskDragSession.state.targetWorkspaceId === activeWorkspaceId}
                        >
                            <button
                                type="button"
                                onClick={handleAddColumn}
                                disabled={!canCreateTask}
                                title={canCreateTask ? '新增列表' : '目前沒有新增任務權限'}
                                className={`group flex w-full flex-col items-center justify-center gap-0.5 rounded-lg py-[8px] font-semibold text-slate-400 transition-all hover:bg-white/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400 ${
                                    boardRootRows.length === 0 ? 'max-w-[270px]' : ''
                                }`}
                                data-mobile-pan-pass-through="true"
                                data-kanban-add-column-button="true"
                                data-kanban-add-column-visual="borderless"
                            >
                                <Plus size={24} className="transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
                                <span>新增列表</span>
                            </button>
                        </KanbanRootDropZone> : null}
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
                    isOrigin={desktopChildDrop.target.isOrigin}
                    originFieldRect={desktopDragOriginIndicatorRef.current?.fieldRect || null}
                    sourceSurfaceKind={desktopDragOriginIndicatorRef.current?.sourceSurfaceKind || 'checklist-row'}
                />
            ) : null}
            {desktopIndicator && desktopChildDrop?.phase !== 'armed' ? (
                <div
                    className={`pointer-events-none fixed z-[86] ${
                        desktopIndicator.kind === 'origin' || desktopIndicator.axis === 'vertical'
                            ? ''
                            : '-translate-y-1/2'
                    }`}
                    style={{
                        left: desktopIndicator.indicatorRect.left,
                        top: desktopIndicator.indicatorRect.top,
                        width: desktopIndicator.indicatorRect.width,
                        height: desktopIndicator.indicatorRect.height ?? desktopIndicator.fieldHeight,
                    }}
                    data-desktop-drop-indicator="true"
                    data-desktop-drop-target={desktopIndicator.targetNodeId}
                    data-desktop-drop-position={desktopIndicator.position}
                    data-desktop-drop-surface-kind={desktopIndicator.surfaceKind}
                    data-desktop-drop-axis={desktopIndicator.axis}
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
                        desktopIndicator.axis === 'vertical' ? (
                            <KanbanInsertionMarker axis="vertical" compact />
                        ) : (
                            <KanbanInsertionMarker compact className="py-0" />
                        )
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
                    data-task-drag-overlay-pointer-gap={DESKTOP_TASK_DRAG_OVERLAY_POINTER_GAP_PX}
                    data-task-drag-overlay-scale={DESKTOP_TASK_DRAG_OVERLAY_SCALE}
                    data-task-drag-overlay-edge-placement={desktopDragOverlayPosition.placement}
                    className={`task-title-text pointer-events-none fixed z-[93] flex h-10 origin-top-left items-center gap-2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg ${
                        activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'
                    }`}
                    style={{
                        left: desktopDragOverlayPosition.left,
                        top: desktopDragOverlayPosition.top,
                        transform: `scale(${DESKTOP_TASK_DRAG_OVERLAY_SCALE})`,
                    }}
                >
                    <span className="min-w-0 flex-1 truncate">
                        {activeDrag.title || activeDrag.node.title || '未命名任務'}
                    </span>
                </div>
            ) : null}
            <TaskDragPresenter
                state={taskDragSession.state}
                canEditTask={taskDragSession.state?.source.canEditCanonicalTask ?? canEditTask}
                canCreateTask={taskDragSession.state?.source.canCreateCanonicalTask ?? canCreateTask}
                canDeleteTask={taskDragSession.state?.source.canDeleteCanonicalTask ?? canDeleteTask}
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
