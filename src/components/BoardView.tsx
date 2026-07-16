// @ts-nocheck
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
import { DndContext, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useMobilePanBroker } from '../hooks/useMobilePanBroker';
import { useKanbanMousePan } from '../hooks/useKanbanMousePan';
import { GlobalContextMenu } from './GlobalContextMenu';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useRecordStore from '../store/useRecordStore';
import useDialogStore from '../store/useDialogStore';
import { useTagStore } from '../store/useTagStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import TaskWorkbenchPanel from './TaskWorkbenchPanel';
import { compactClassNames } from './ui/compactTokens';
import type { TaskNode, TaskStatus } from '../types';
import { prepareNewTaskNaming, selectAndOpenTaskDetails } from '../utils/taskInteractions';
import { projectTaskFilterResults } from '../features/taskFilters';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../features/taskWorkbench/placement';
import {
    isMobileTaskActionMode,
    MobileTaskActionContext,
    type MobileTaskAction,
    type MobileTaskActionState,
    type MobileTaskDropPosition,
} from './Wbs/mobileTaskActionContext';
import {
    KANBAN_MOBILE_LOCK_TOLERANCE_PX,
    KANBAN_PARENT_LOCK_DELAY_MS,
    KANBAN_PARENT_UNLOCK_GRACE_MS,
    armKanbanTarget,
    beginKanbanDropIntent,
    buildKanbanMoveUpdates,
    createIdleKanbanDropState,
    getKanbanAppendOrder,
    invalidateKanbanTarget,
    isKanbanDropCommittable,
    kanbanParentKey,
    lockKanbanTarget,
    markKanbanLockedOutside,
    resolveKanbanDropTarget,
    selectSameParentKanbanTarget,
    updateArmingKanbanTarget,
    type KanbanResolvedDropTarget,
} from './Wbs/kanbanDropIntent';
import { KanbanDropIntentContext } from './Wbs/kanbanDropIntentContext';

/**
 * 依賴關係選取 Context—讓 KanbanCard 能存取当前選取狀態與處理函式
 * 設計意圖：複用 WbsListView 的依賴模块，但適用於看板的 UI 互動模式。
 */
export const KanbanDependencyContext = React.createContext<{
    dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
    handleKanbanDependencySelect: (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => void;
    dependencies: import('../types').Dependency[];
} | null>(null);

const mobileActionItems: Array<{
    key: MobileTaskAction;
    label: string;
    permission: 'edit' | 'create' | 'delete';
    activeClassName: string;
    idleClassName: string;
}> = [
    {
        key: 'toggle-complete',
        label: '標示完成',
        permission: 'edit',
        activeClassName: 'bg-emerald-500 text-white',
        idleClassName: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    },
    {
        key: 'add-sibling',
        label: '新增同階任務',
        permission: 'create',
        activeClassName: 'bg-sky-500 text-white',
        idleClassName: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
    },
    {
        key: 'add-child',
        label: '新增下階任務',
        permission: 'create',
        activeClassName: 'bg-indigo-500 text-white',
        idleClassName: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    },
    {
        key: 'delete',
        label: '刪除任務',
        permission: 'delete',
        activeClassName: 'bg-red-500 text-white',
        idleClassName: 'bg-red-50 text-red-600 hover:bg-red-100',
    },
];

const MobileTaskActionLayer: React.FC<{
    state: MobileTaskActionState | null;
    canEditTask: boolean;
    canCreateTask: boolean;
    canDeleteTask: boolean;
    hasValidInsertionPreview: boolean;
}> = ({ state, canEditTask, canCreateTask, canDeleteTask, hasValidInsertionPreview }) => {
    if (!state) return null;

    const canUseAction = (permission: 'edit' | 'create' | 'delete') => {
        if (permission === 'edit') return canEditTask;
        if (permission === 'create') return canCreateTask;
        return canDeleteTask;
    };
    const showPointerPreview = !hasValidInsertionPreview;

    return (
        <>
            {showPointerPreview ? (
                <div
                    className="pointer-events-none fixed z-[90] max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary/25 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-xl ring-2 ring-primary/15"
                    style={{ left: state.pointerX, top: state.pointerY }}
                    data-mobile-drag-preview="true"
                    data-mobile-pointer-preview-mode="finger"
                    data-mobile-pointer-x={Math.round(state.pointerX)}
                    data-mobile-pointer-y={Math.round(state.pointerY)}
                    data-task-id={state.nodeId}
                >
                    <div className="truncate">{state.title || '未命名任務'}</div>
                </div>
            ) : null}

            {state.dropIndicatorRect ? (
                <div
                    className="pointer-events-none fixed z-[85] h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                    style={{
                        left: state.dropIndicatorRect.left,
                        top: state.dropIndicatorRect.top,
                        width: state.dropIndicatorRect.width,
                    }}
                    data-mobile-drop-indicator="true"
                    data-mobile-drop-target={state.hoverTargetId || undefined}
                    data-mobile-drop-position={state.dropPosition || undefined}
                    data-kanban-drop-indicator="true"
                    data-kanban-drop-parent-id={kanbanParentKey(state.hoverParentId)}
                    data-kanban-drop-position={state.dropPosition || undefined}
                />
            ) : null}

            <div
                className="fixed left-1/2 z-[95] flex w-[calc(100vw-0.5rem)] max-w-[430px] -translate-x-1/2 gap-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
                style={{ top: 'env(safe-area-inset-top, 0px)' }}
                data-mobile-task-action-rail="true"
                data-mobile-task-action-rail-placement="top"
            >
                {mobileActionItems.map((item) => {
                    const active = state.hoverAction === item.key;
                    const enabled = canUseAction(item.permission);
                    const label = item.key === 'toggle-complete' && state.status === 'completed'
                        ? '取消完成'
                        : item.label;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            disabled={!enabled}
                            title={label}
                            aria-label={label}
                            className={`flex h-10 min-w-0 flex-1 items-center justify-center border-r border-slate-200 px-1 text-center text-[12px] font-semibold leading-tight backdrop-blur transition last:border-r-0 ${
                                active ? item.activeClassName : item.idleClassName
                            } disabled:cursor-not-allowed disabled:opacity-35`}
                            data-mobile-task-action={item.key}
                            data-mobile-task-action-label={label}
                        >
                            <span className="block w-full min-w-0 truncate" data-mobile-task-action-text="true">
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </>
    );
};

const recordMobileTaskActionDebug = (entry: Record<string, unknown>) => {
    if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
    const debugWindow = window as any;
    debugWindow.__projedMobileTaskActionDebug = [
        ...(debugWindow.__projedMobileTaskActionDebug || []),
        { ...entry, at: Date.now() },
    ].slice(-30);
};

const recordKanbanDropDebug = (entry: Record<string, unknown>) => {
    if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
    const debugWindow = window as any;
    debugWindow.__projedKanbanDropDebug = [
        ...(debugWindow.__projedKanbanDropDebug || []),
        { ...entry, at: Date.now() },
    ].slice(-40);
};

type KanbanPlacementPreview = {
    left: number;
    top: number;
    width: number;
    title: string;
};

type KanbanPointerPreview = KanbanPlacementPreview;

const isSameKanbanPlacementPreview = (
    left: KanbanPlacementPreview | null,
    right: KanbanPlacementPreview | null,
) => {
    if (!left || !right) return left === right;
    return (
        Math.abs(left.left - right.left) < 0.5 &&
        Math.abs(left.top - right.top) < 0.5 &&
        Math.abs(left.width - right.width) < 0.5 &&
        left.title === right.title
    );
};

const escapeKanbanSelectorValue = (value: string) => (
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
);

const getVisibleLineRect = (element: Element | null) => {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return null;
    return rect;
};

const DRAG_PREVIEW_HIT_TEST_SELECTOR = [
    '[data-kanban-pointer-drag-preview]',
    '[data-kanban-placement-preview]',
    '[data-mobile-drag-preview]',
].join(',');

const withDragPreviewsHidden = <T,>(read: () => T) => {
    const hiddenPreviews = Array.from(document.querySelectorAll(DRAG_PREVIEW_HIT_TEST_SELECTOR)) as HTMLElement[];
    const previousDisplay = hiddenPreviews.map((element) => element.style.display);
    hiddenPreviews.forEach((element) => {
        element.style.display = 'none';
    });
    try {
        return read();
    } finally {
        hiddenPreviews.forEach((element, index) => {
            element.style.display = previousDisplay[index] || '';
        });
    }
};

const getDndPointerPoint = (event: any) => {
    const activator = event?.activatorEvent;
    const activatorTouch = activator?.touches?.[0] || activator?.changedTouches?.[0];
    const startX = typeof activator?.clientX === 'number'
        ? activator.clientX
        : typeof activatorTouch?.clientX === 'number'
            ? activatorTouch.clientX
            : null;
    const startY = typeof activator?.clientY === 'number'
        ? activator.clientY
        : typeof activatorTouch?.clientY === 'number'
            ? activatorTouch.clientY
            : null;
    const deltaX = typeof event?.delta?.x === 'number' ? event.delta.x : 0;
    const deltaY = typeof event?.delta?.y === 'number' ? event.delta.y : 0;
    if (typeof startX === 'number' && typeof startY === 'number') {
        return { x: startX + deltaX, y: startY + deltaY };
    }

    const rect = event?.active?.rect?.current?.translated || event?.active?.rect?.current?.initial;
    if (rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
};

const MOBILE_TASK_ACTION_FAILSAFE_MS = 12000;
const MOBILE_TASK_EDGE_SCROLL_THRESHOLD_PX = 56;
const MOBILE_TASK_EDGE_SCROLL_MAX_STEP_PX = 18;

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
    const [mobileTaskAction, setMobileTaskAction] = useState<MobileTaskActionState | null>(null);
    const [desktopPlacementPreview, setDesktopPlacementPreview] = useState<KanbanPlacementPreview | null>(null);
    const [desktopPointerPreview, setDesktopPointerPreview] = useState<KanbanPointerPreview | null>(null);
    const [kanbanDropState, setKanbanDropState] = useState(createIdleKanbanDropState);
    const mobileTaskActionRef = React.useRef<MobileTaskActionState | null>(null);
    const mobileTaskActionFailSafeRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mobileTaskAutoScrollFrameRef = React.useRef<number | null>(null);
    const mobileTaskAutoScrollPointRef = React.useRef<{ x: number; y: number } | null>(null);
    const lastValidOverRef = React.useRef<any>(null);
    const lastDesktopPointerPointRef = React.useRef<{ x: number; y: number } | null>(null);
    const kanbanDropStateRef = React.useRef(createIdleKanbanDropState());
    const pendingKanbanTargetRef = React.useRef<KanbanResolvedDropTarget | null>(null);
    const kanbanLockTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const kanbanProgressTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    React.useEffect(() => {
        const capturePointerPoint = (event: MouseEvent | PointerEvent) => {
            if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return;
            lastDesktopPointerPointRef.current = { x: event.clientX, y: event.clientY };
        };
        window.addEventListener('pointermove', capturePointerPoint, true);
        window.addEventListener('mousemove', capturePointerPoint, true);
        return () => {
            window.removeEventListener('pointermove', capturePointerPoint, true);
            window.removeEventListener('mousemove', capturePointerPoint, true);
        };
    }, []);

    const readDesktopPointerPoint = React.useCallback((event: any) => (
        lastDesktopPointerPointRef.current || getDndPointerPoint(event)
    ), []);

    const getVisibleTaskAnchorRect = React.useCallback((nodeId: string | null | undefined) => {
        if (!nodeId || typeof document === 'undefined') return null;
        const escapedNodeId = escapeKanbanSelectorValue(nodeId);
        const anchors = Array.from(document.querySelectorAll(
            `[data-mobile-drop-target][data-task-id="${escapedNodeId}"]`,
        )) as HTMLElement[];
        for (const anchor of anchors) {
            const rect = anchor.getBoundingClientRect();
            const style = window.getComputedStyle(anchor);
            if (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
            ) return rect;
        }
        return null;
    }, []);

    const updateDesktopPointerPreview = React.useCallback((event: any, drag: any) => {
        const eventData = event?.active?.data?.current;
        const eventNodeId = eventData?.nodeId;
        const node = drag?.node || (eventNodeId ? useWbsStore.getState().nodes[eventNodeId] : null);
        if (!node) {
            setDesktopPointerPreview(null);
            return;
        }
        const point = readDesktopPointerPoint(event);
        if (!point) {
            setDesktopPointerPreview(null);
            return;
        }
        const nextPreview: KanbanPointerPreview = {
            left: Math.round(point.x),
            top: Math.round(point.y),
            width: (drag?.type || eventData?.type) === 'wbs-column' ? 270 : 240,
            title: drag?.title || node.title || '未命名任務',
        };
        setDesktopPointerPreview(prev => (
            isSameKanbanPlacementPreview(prev, nextPreview) ? prev : nextPreview
        ));
    }, [readDesktopPointerPoint]);
    const kanbanUnlockTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const commitKanbanDropState = React.useCallback((next: ReturnType<typeof createIdleKanbanDropState>) => {
        kanbanDropStateRef.current = next;
        setKanbanDropState(next);
    }, []);

    const clearKanbanLockTimers = React.useCallback(() => {
        if (kanbanLockTimerRef.current) clearTimeout(kanbanLockTimerRef.current);
        if (kanbanProgressTimerRef.current) clearInterval(kanbanProgressTimerRef.current);
        kanbanLockTimerRef.current = null;
        kanbanProgressTimerRef.current = null;
    }, []);

    const clearKanbanUnlockTimer = React.useCallback(() => {
        if (kanbanUnlockTimerRef.current) clearTimeout(kanbanUnlockTimerRef.current);
        kanbanUnlockTimerRef.current = null;
    }, []);

    const resetKanbanDropIntent = React.useCallback((preserveSource = false) => {
        clearKanbanLockTimers();
        clearKanbanUnlockTimer();
        pendingKanbanTargetRef.current = null;
        const current = kanbanDropStateRef.current;
        const source = preserveSource && current.sourceNodeId
            ? useWbsStore.getState().nodes[current.sourceNodeId]
            : null;
        commitKanbanDropState(source ? beginKanbanDropIntent(source) : createIdleKanbanDropState());
    }, [clearKanbanLockTimers, clearKanbanUnlockTimer, commitKanbanDropState]);

    const startKanbanArming = React.useCallback((
        baseState: ReturnType<typeof createIdleKanbanDropState>,
        target: KanbanResolvedDropTarget,
    ) => {
        clearKanbanLockTimers();
        clearKanbanUnlockTimer();
        const startedAt = Date.now();
        pendingKanbanTargetRef.current = target;
        commitKanbanDropState(armKanbanTarget(baseState, target, startedAt));

        kanbanProgressTimerRef.current = window.setInterval(() => {
            const current = kanbanDropStateRef.current;
            const latestTarget = pendingKanbanTargetRef.current;
            if (
                current.phase !== 'arming' ||
                !latestTarget ||
                latestTarget.parentKey !== kanbanParentKey(current.candidateParentId)
            ) return;
            commitKanbanDropState(updateArmingKanbanTarget(current, latestTarget, Date.now()));
        }, 50);

        kanbanLockTimerRef.current = window.setTimeout(() => {
            const current = kanbanDropStateRef.current;
            const latestTarget = pendingKanbanTargetRef.current;
            if (
                current.phase !== 'arming' ||
                !latestTarget?.valid ||
                latestTarget.parentKey !== kanbanParentKey(current.candidateParentId)
            ) return;
            clearKanbanLockTimers();
            commitKanbanDropState(lockKanbanTarget(current, latestTarget));
        }, KANBAN_PARENT_LOCK_DELAY_MS);
    }, [clearKanbanLockTimers, clearKanbanUnlockTimer, commitKanbanDropState]);

    const updateKanbanDropTarget = React.useCallback((target: KanbanResolvedDropTarget | null) => {
        const current = kanbanDropStateRef.current;
        if (!current.sourceNodeId) return;
        pendingKanbanTargetRef.current = target;

        if (!target) {
            clearKanbanLockTimers();
            if (current.phase === 'locked') {
                commitKanbanDropState(markKanbanLockedOutside(current, Date.now()));
                if (!kanbanUnlockTimerRef.current) {
                    kanbanUnlockTimerRef.current = window.setTimeout(() => {
                        kanbanUnlockTimerRef.current = null;
                        const latest = kanbanDropStateRef.current;
                        const source = latest.sourceNodeId ? useWbsStore.getState().nodes[latest.sourceNodeId] : null;
                        if (latest.phase !== 'locked' || !latest.outsideSince || Date.now() - latest.outsideSince < KANBAN_PARENT_UNLOCK_GRACE_MS) return;
                        const base = source ? beginKanbanDropIntent(source) : createIdleKanbanDropState();
                        commitKanbanDropState(base);
                        const pending = pendingKanbanTargetRef.current;
                        if (!pending?.valid || !source) return;
                        if (pending.sameParent) commitKanbanDropState(selectSameParentKanbanTarget(base, pending));
                        else startKanbanArming(base, pending);
                    }, KANBAN_PARENT_UNLOCK_GRACE_MS);
                }
                return;
            }
            clearKanbanUnlockTimer();
            const source = useWbsStore.getState().nodes[current.sourceNodeId];
            commitKanbanDropState(source ? beginKanbanDropIntent(source) : createIdleKanbanDropState());
            return;
        }

        if (!target.valid) {
            clearKanbanLockTimers();
            clearKanbanUnlockTimer();
            commitKanbanDropState(invalidateKanbanTarget(current, target));
            return;
        }

        if (current.phase === 'locked') {
            if (target.parentKey === kanbanParentKey(current.lockedParentId)) {
                clearKanbanUnlockTimer();
                commitKanbanDropState(lockKanbanTarget(current, target));
                return;
            }
            clearKanbanLockTimers();
            commitKanbanDropState(markKanbanLockedOutside(current, Date.now()));
            if (!kanbanUnlockTimerRef.current) {
                kanbanUnlockTimerRef.current = window.setTimeout(() => {
                    kanbanUnlockTimerRef.current = null;
                    const latest = kanbanDropStateRef.current;
                    const source = latest.sourceNodeId ? useWbsStore.getState().nodes[latest.sourceNodeId] : null;
                    if (latest.phase !== 'locked' || !latest.outsideSince || Date.now() - latest.outsideSince < KANBAN_PARENT_UNLOCK_GRACE_MS) return;
                    const base = source ? beginKanbanDropIntent(source) : createIdleKanbanDropState();
                    commitKanbanDropState(base);
                    const pending = pendingKanbanTargetRef.current;
                    if (!pending?.valid || !source) return;
                    if (pending.sameParent) commitKanbanDropState(selectSameParentKanbanTarget(base, pending));
                    else startKanbanArming(base, pending);
                }, KANBAN_PARENT_UNLOCK_GRACE_MS);
            }
            return;
        }

        clearKanbanUnlockTimer();
        if (target.sameParent) {
            clearKanbanLockTimers();
            commitKanbanDropState(selectSameParentKanbanTarget(current, target));
            return;
        }

        if (
            current.phase === 'arming' &&
            target.parentKey === kanbanParentKey(current.candidateParentId)
        ) {
            const next = updateArmingKanbanTarget(current, target, Date.now());
            if (next.progress >= 1) {
                clearKanbanLockTimers();
                commitKanbanDropState(lockKanbanTarget(next, target));
            } else {
                commitKanbanDropState(next);
            }
            return;
        }

        startKanbanArming(current, target);
    }, [
        clearKanbanLockTimers,
        clearKanbanUnlockTimer,
        commitKanbanDropState,
        startKanbanArming,
    ]);

    const stopMobileTaskAutoScroll = React.useCallback(() => {
        mobileTaskAutoScrollPointRef.current = null;
        if (mobileTaskAutoScrollFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(mobileTaskAutoScrollFrameRef.current);
        }
        mobileTaskAutoScrollFrameRef.current = null;
    }, []);

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
                    addDependency({ fromId: targetId, fromSide: targetSide, toId: dependencySelection.id, toSide: dependencySelection.side, offset });
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

        if (['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType || '') || activeSource === 'task-workbench') {
            const priority: Record<string, number> = {
                'wbs-child-empty-lane': 0,
                'wbs-card': 1,
                'wbs-checklist': 1,
                'wbs-parent-group': 2,
                'wbs-column': 3,
            };
            return [...collisions].sort((left, right) => {
                const leftType = getCollisionContainer(left)?.data.current?.type || '';
                const rightType = getCollisionContainer(right)?.data.current?.type || '';
                return (priority[leftType] ?? 10) - (priority[rightType] ?? 10);
            });
        }

        return collisions;
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

    const statuses = [
        { key: 'todo', label: '待辦', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '未定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    /** 看板拖曳先解析父層與精確位置；跨父層只有 locked 狀態可提交。 */
    const handleDragStart = (event: any) => {
        if (!canMoveTask) return;
        if (isMobileTaskActionMode()) {
            lastValidOverRef.current = null;
            commitMobileTaskActionState(null);
            setActiveDrag(null);
            setDesktopPointerPreview(null);
            return;
        }
        const { active } = event;
        const nodeId = active.data.current?.nodeId;
        lastValidOverRef.current = null;
        const sourceNode = nodeId ? useWbsStore.getState().nodes[nodeId] : null;
        lastDesktopPointerPointRef.current = getDndPointerPoint(event);
        if (sourceNode) commitKanbanDropState(beginKanbanDropIntent(sourceNode));
        recordKanbanDropDebug({ type: 'start', nodeId, sourceParentId: sourceNode?.parentId || null });
        const nextDrag = {
            id: active.id,
            type: active.data.current?.type,
            source: active.data.current?.source,
            title: active.data.current?.title,
            node: sourceNode,
        };
        setActiveDrag(nextDrag);
        updateDesktopPointerPreview(event, nextDrag);
    };

    const handleDragCancel = () => {
        recordKanbanDropDebug({ type: 'cancel', state: kanbanDropStateRef.current });
        lastValidOverRef.current = null;
        setActiveDrag(null);
        setDesktopPointerPreview(null);
        resetKanbanDropIntent();
    };

    const getBoardRootAppendOrder = (
        boardId: string,
        excludeId?: string,
        nodesOverride?: Record<string, TaskNode>,
    ) => {
        const nodes = nodesOverride || useWbsStore.getState().nodes;
        return Object.values(nodes).reduce((max, node) => {
            if (!node || node.isArchived || node.id === excludeId) return max;
            if (node.boardId !== boardId || node.parentId !== null) return max;
            return Math.max(max, node.order ?? 0);
        }, -1) + 1;
    };

    const resolveDesktopKanbanTarget = React.useCallback((active: any, over: any, event?: any) => {
        const activeData = active?.data.current;
        const overData = over?.data.current;
        const draggedNodeId = activeData?.nodeId;
        if (!draggedNodeId || !overData) return null;

        const targetType = overData.type;
        let targetKind: 'task-anchor' | 'parent-group' | 'child-empty-lane' | null = null;
        let position: 'before' | 'after' | 'append' = 'append';
        let targetNodeId: string | null = null;
        let targetParentId: string | null | undefined;

        if (['wbs-column', 'wbs-card', 'wbs-checklist'].includes(targetType || '')) {
            targetKind = 'task-anchor';
            targetNodeId = overData.nodeId || null;
            const activeRect = active.rect.current?.translated || active.rect.current?.initial;
            const overRect = getVisibleTaskAnchorRect(targetNodeId) || over.rect;
            const pointerY = readDesktopPointerPoint(event)?.y ?? null;
            const comparisonY = pointerY ?? (activeRect ? activeRect.top + activeRect.height / 2 : null);
            position = comparisonY !== null && overRect && comparisonY > overRect.top + overRect.height / 2
                ? 'after'
                : 'before';
        } else if (targetType === 'wbs-parent-group') {
            targetKind = 'parent-group';
            targetParentId = overData.parentId ?? null;
            position = 'append';
        } else if (targetType === 'wbs-child-empty-lane') {
            targetKind = 'child-empty-lane';
            targetParentId = overData.parentId ?? overData.nodeId ?? null;
            position = 'append';
        }

        if (!targetKind) return null;
        return resolveKanbanDropTarget({
            draggedNodeId,
            targetKind,
            targetNodeId,
            targetParentId,
            position,
            nodes: useWbsStore.getState().nodes,
            canMove: canMoveTask,
        });
    }, [canMoveTask, getVisibleTaskAnchorRect, readDesktopPointerPoint]);

    const isDesktopPointerInsideTaskAnchor = React.useCallback((nodeId: string | null | undefined, point: { x: number; y: number } | null) => {
        if (!nodeId || !point || typeof document === 'undefined') return false;
        const rect = getVisibleTaskAnchorRect(nodeId);
        return Boolean(rect &&
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom);
    }, [getVisibleTaskAnchorRect]);

    const resolveDesktopKanbanTargetAtPoint = React.useCallback((active: any, event: any) => {
        const draggedNodeId = active?.data.current?.nodeId;
        const point = readDesktopPointerPoint(event);
        if (!draggedNodeId || !point) return null;
        const selector = '[data-kanban-child-empty-lane], [data-mobile-drop-target][data-task-id], [data-kanban-parent-group]';
        const candidates = withDragPreviewsHidden(() => Array.from(document.elementsFromPoint(point.x, point.y)))
            .map((element) => element.closest(selector))
            .filter((element, index, all): element is Element => Boolean(element) && all.indexOf(element) === index)
            .sort((left, right) => {
                const priority = (element: Element) => element.hasAttribute('data-kanban-child-empty-lane')
                    ? 0
                    : element.hasAttribute('data-mobile-drop-target')
                      ? 1
                      : 2;
                return priority(left) - priority(right);
            });
        const nodes = useWbsStore.getState().nodes;
        let firstInvalidTarget: KanbanResolvedDropTarget | null = null;
        const resolvedCandidates: KanbanResolvedDropTarget[] = [];

        for (const targetElement of candidates) {
            const rect = (targetElement as HTMLElement).getBoundingClientRect();
            const isChildLane = targetElement.hasAttribute('data-kanban-child-empty-lane');
            const targetNodeId = targetElement.getAttribute('data-task-id');
            const isTaskAnchor = !isChildLane && Boolean(targetNodeId && targetElement.hasAttribute('data-mobile-drop-target'));
            const targetKind = isChildLane ? 'child-empty-lane' : isTaskAnchor ? 'task-anchor' : 'parent-group';
            const targetParentId = targetKind === 'task-anchor'
                ? undefined
                : targetElement.getAttribute('data-kanban-target-parent-id');
            const position = targetKind === 'task-anchor'
                ? (point.y > rect.top + rect.height / 2 ? 'after' : 'before')
                : 'append';
            const target = resolveKanbanDropTarget({
                draggedNodeId,
                targetKind,
                targetNodeId,
                targetParentId,
                position,
                nodes,
                canMove: canMoveTask,
            });
            if (target.valid) resolvedCandidates.push(target);
            if (!firstInvalidTarget) firstInvalidTarget = target;
        }
        if (resolvedCandidates.length > 0) {
            const priority = (target: KanbanResolvedDropTarget) => {
                if (target.kind === 'task-anchor' && target.sameParent) return 0;
                if (target.kind === 'child-empty-lane') return 1;
                if (target.kind === 'task-anchor') return 2;
                return 3;
            };
            return [...resolvedCandidates].sort((left, right) => priority(left) - priority(right))[0];
        }
        return firstInvalidTarget;
    }, [canMoveTask, readDesktopPointerPoint]);

    const commitMobileTaskActionState = React.useCallback((next: MobileTaskActionState | null) => {
        if (mobileTaskActionFailSafeRef.current) {
            clearTimeout(mobileTaskActionFailSafeRef.current);
            mobileTaskActionFailSafeRef.current = null;
        }
        if (!next) stopMobileTaskAutoScroll();
        mobileTaskActionRef.current = next;
        setMobileTaskAction(next);
        if (next && typeof window !== 'undefined') {
            mobileTaskActionFailSafeRef.current = window.setTimeout(() => {
                if (!mobileTaskActionRef.current) return;
                recordMobileTaskActionDebug({ type: 'failsafe:timeout', nodeId: mobileTaskActionRef.current.nodeId });
                mobileTaskActionRef.current = null;
                setMobileTaskAction(null);
                setActiveDrag(null);
                lastValidOverRef.current = null;
                mobileTaskActionFailSafeRef.current = null;
            }, MOBILE_TASK_ACTION_FAILSAFE_MS);
        }
    }, [stopMobileTaskAutoScroll]);

    const readTouchPoint = (event: any) => {
        const touch = event.touches?.[0] || event.changedTouches?.[0];
        if (!touch) return null;
        return { x: touch.clientX, y: touch.clientY };
    };

    const getMobileTaskEdgeScrollDelta = (
        position: number,
        min: number,
        max: number,
    ) => {
        const threshold = MOBILE_TASK_EDGE_SCROLL_THRESHOLD_PX;
        const maxStep = MOBILE_TASK_EDGE_SCROLL_MAX_STEP_PX;
        if (position < min + threshold) {
            return -Math.min(maxStep, Math.ceil(((min + threshold - position) / threshold) * maxStep));
        }
        if (position > max - threshold) {
            return Math.min(maxStep, Math.ceil(((position - (max - threshold)) / threshold) * maxStep));
        }
        return 0;
    };

    const scrollElementBy = (element: HTMLElement, deltaX: number, deltaY: number) => {
        const beforeLeft = element.scrollLeft;
        const beforeTop = element.scrollTop;
        if (deltaX) element.scrollLeft += deltaX;
        if (deltaY) element.scrollTop += deltaY;
        return beforeLeft !== element.scrollLeft || beforeTop !== element.scrollTop;
    };

    const findMobileTaskAutoScrollColumn = (point: { x: number; y: number }) => {
        const element = document.elementFromPoint(point.x, point.y);
        const directColumn = element instanceof Element
            ? element.closest('[data-mobile-pan-surface="kanban-column"]') as HTMLElement | null
            : null;
        if (directColumn) return directColumn;

        const columns = Array.from(document.querySelectorAll('[data-mobile-pan-surface="kanban-column"]')) as HTMLElement[];
        return columns.find((column) => {
            const rect = column.getBoundingClientRect();
            return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top - 80 && point.y <= rect.bottom + 80;
        }) || null;
    };

    const autoScrollMobileTaskSurfaces = React.useCallback((point: { x: number; y: number }) => {
        if (typeof document === 'undefined') return false;
        let didScroll = false;

        const boardSurface = mobilePanSurfaceRef.current || document.querySelector('[data-mobile-pan-surface="board"]') as HTMLElement | null;
        if (boardSurface) {
            const boardRect = boardSurface.getBoundingClientRect();
            const deltaX = getMobileTaskEdgeScrollDelta(point.x, boardRect.left, boardRect.right);
            if (deltaX) {
                didScroll = scrollElementBy(boardSurface, deltaX, 0) || didScroll;
            }
        }

        const columnSurface = findMobileTaskAutoScrollColumn(point);
        if (columnSurface) {
            const columnRect = columnSurface.getBoundingClientRect();
            const top = Math.max(columnRect.top, 0);
            const bottom = Math.min(columnRect.bottom, window.innerHeight || columnRect.bottom);
            const deltaY = getMobileTaskEdgeScrollDelta(point.y, top, bottom);
            if (deltaY) {
                didScroll = scrollElementBy(columnSurface, 0, deltaY) || didScroll;
            }
        }

        if (didScroll) {
            recordMobileTaskActionDebug({
                type: 'edge-scroll',
                point,
                boardScrollLeft: boardSurface?.scrollLeft ?? null,
                columnScrollTop: columnSurface?.scrollTop ?? null,
            });
        }
        return didScroll;
    }, [mobilePanSurfaceRef]);

    const createMobileTaskNodeId = () =>
        `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const getSiblingInsertOrderAfter = (sourceNode: TaskNode, nodesRecord: Record<string, TaskNode>) => {
        const siblings = Object.values(nodesRecord)
            .filter(node =>
                node &&
                !node.isArchived &&
                (node.parentId || null) === (sourceNode.parentId || null) &&
                node.boardId === sourceNode.boardId
            )
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
        const index = siblings.findIndex(node => node.id === sourceNode.id);
        const nextSibling = index >= 0 ? siblings[index + 1] : null;
        return nextSibling
            ? ((sourceNode.order ?? 0) + (nextSibling.order ?? 0)) / 2
            : (sourceNode.order ?? 0) + 1;
    };

    const addMobileSiblingTask = React.useCallback((nodeId: string) => {
        if (!canCreateTask) return;
        const state = useWbsStore.getState();
        const sourceNode = state.nodes[nodeId];
        if (!sourceNode || sourceNode.isArchived) return;
        const parentNode = sourceNode.parentId ? state.nodes[sourceNode.parentId] : null;
        if (parentNode?.status === 'completed') {
            void useDialogStore.getState().showConfirm('已完成任務底下不能新增同階任務。');
            return;
        }

        const newNode: TaskNode = {
            id: createMobileTaskNodeId(),
            workspaceId: sourceNode.workspaceId || activeWorkspaceId || '',
            boardId: sourceNode.boardId || activeBoardId || '',
            parentId: sourceNode.parentId || null,
            title: '新任務',
            status: 'todo',
            nodeType: sourceNode.parentId ? 'task' : (sourceNode.nodeType || 'task'),
            order: getSiblingInsertOrderAfter(sourceNode, state.nodes),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addNode(newNode);
        selectAndOpenTaskDetails(newNode.id);
    }, [activeBoardId, activeWorkspaceId, addNode, canCreateTask]);

    const addMobileChildTask = React.useCallback((nodeId: string) => {
        if (!canCreateTask) return;
        const state = useWbsStore.getState();
        const sourceNode = state.nodes[nodeId];
        if (!sourceNode || sourceNode.isArchived) return;
        if (sourceNode.status === 'completed') {
            void useDialogStore.getState().showConfirm('已完成任務底下不能新增下層任務。');
            return;
        }

        const newNode: TaskNode = {
            id: createMobileTaskNodeId(),
            workspaceId: sourceNode.workspaceId || activeWorkspaceId || '',
            boardId: sourceNode.boardId || activeBoardId || '',
            parentId: sourceNode.id,
            title: '新任務',
            status: 'todo',
            nodeType: 'task',
            order: getKanbanAppendOrder(sourceNode.id, sourceNode.boardId, state.nodes),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addNode(newNode);
        selectAndOpenTaskDetails(newNode.id);
    }, [activeBoardId, activeWorkspaceId, addNode, canCreateTask]);

    const executeMobileTaskAction = React.useCallback(async (action: MobileTaskAction, nodeId: string) => {
        const state = useWbsStore.getState();
        const node = state.nodes[nodeId];
        recordMobileTaskActionDebug({ type: 'action:start', action, nodeId, canEditTask, canCreateTask, canDeleteTask });
        if (!node || node.isArchived) {
            recordMobileTaskActionDebug({ type: 'action:blocked-missing', action, nodeId });
            return;
        }

        if (action === 'toggle-complete') {
            if (!canEditTask) {
                recordMobileTaskActionDebug({ type: 'action:blocked-permission', action, nodeId });
                return;
            }
            updateNode(nodeId, {
                status: node.status === 'completed' ? 'todo' : 'completed',
                updatedAt: Date.now(),
            });
            recalculateAncestorStatus(nodeId);
            recordMobileTaskActionDebug({ type: 'action:complete', action, nodeId, from: node.status, to: node.status === 'completed' ? 'todo' : 'completed' });
            return;
        }

        if (action === 'add-sibling') {
            addMobileSiblingTask(nodeId);
            return;
        }

        if (action === 'add-child') {
            addMobileChildTask(nodeId);
            return;
        }

        if (action === 'delete') {
            if (!canDeleteTask) return;
            const confirmed = await useDialogStore.getState().showConfirm(`確定要刪除任務「${node.title || '未命名任務'}」嗎？您可以隨時使用 Ctrl+Z 復原。`);
            if (!confirmed) return;
            removeNode(nodeId);
        }
    }, [addMobileChildTask, addMobileSiblingTask, canCreateTask, canDeleteTask, canEditTask, recalculateAncestorStatus, removeNode, updateNode]);

    const executeMobileTaskDrop = React.useCallback((
        draggedNodeId: string,
        target: KanbanResolvedDropTarget | null,
        dropState = kanbanDropStateRef.current,
    ) => {
        recordMobileTaskActionDebug({ type: 'drop:start', draggedNodeId, target, phase: dropState.phase, canMoveTask });
        if (!canMoveTask || !target?.valid || !isKanbanDropCommittable({ ...dropState, target })) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-lock', draggedNodeId, target, phase: dropState.phase, canMoveTask });
            return;
        }
        const state = useWbsStore.getState();
        const draggedNode = state.nodes[draggedNodeId];
        if (!draggedNode || draggedNode.isArchived) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-missing', draggedNodeId, target });
            return;
        }

        const refreshedTarget = resolveKanbanDropTarget({
            draggedNodeId,
            targetKind: target.kind,
            targetNodeId: target.anchorNodeId,
            targetParentId: target.parentId,
            position: target.position,
            nodes: state.nodes,
            canMove: canMoveTask,
        });
        const phaseAllowsTarget = dropState.phase === 'same-parent'
            ? refreshedTarget.sameParent
            : dropState.phase === 'locked' && refreshedTarget.parentKey === kanbanParentKey(dropState.lockedParentId);
        if (!refreshedTarget.valid || !phaseAllowsTarget) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-invalid-intent', draggedNodeId, refreshedTarget, phase: dropState.phase });
            return;
        }

        const updates = buildKanbanMoveUpdates(draggedNode.id, refreshedTarget, state.nodes);
        batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
        recordMobileTaskActionDebug({ type: 'drop:complete', draggedNodeId, refreshedTarget, updates });
    }, [batchUpdateNodes, canMoveTask]);

    const resolveMobileTaskHover = React.useCallback((
        point: { x: number; y: number },
        activeState: MobileTaskActionState,
    ) => {
        const emptyHover = {
            hoverAction: null,
            hoverTargetId: null,
            hoverParentId: null,
            hoverTargetKind: null,
            dropPosition: null,
            dropIndicatorRect: null,
            kanbanTarget: null as KanbanResolvedDropTarget | null,
        };
        const element = withDragPreviewsHidden(() => document.elementFromPoint(point.x, point.y));
        const actionElement = element instanceof Element
            ? element.closest('[data-mobile-task-action]')
            : null;
        if (actionElement) {
            const action = actionElement.getAttribute('data-mobile-task-action') as MobileTaskAction | null;
            return {
                ...emptyHover,
                hoverAction: action,
            };
        }

        let targetElement = element instanceof Element
            ? element.closest('[data-kanban-child-empty-lane], [data-mobile-drop-target][data-task-id], [data-kanban-parent-group]')
            : null;

        if (!targetElement) {
            const current = kanbanDropStateRef.current;
            const currentParentId = current.phase === 'locked' ? current.lockedParentId : current.candidateParentId;
            const parentKey = kanbanParentKey(currentParentId);
            const escapedKey = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(parentKey) : parentKey;
            const toleranceElement = document.querySelector(
                `[data-kanban-parent-group="${escapedKey}"]:not([data-kanban-child-empty-lane])`,
            );
            if (toleranceElement) {
                const rect = (toleranceElement as HTMLElement).getBoundingClientRect();
                if (
                    point.x >= rect.left - KANBAN_MOBILE_LOCK_TOLERANCE_PX &&
                    point.x <= rect.right + KANBAN_MOBILE_LOCK_TOLERANCE_PX &&
                    point.y >= rect.top - KANBAN_MOBILE_LOCK_TOLERANCE_PX &&
                    point.y <= rect.bottom + KANBAN_MOBILE_LOCK_TOLERANCE_PX
                ) targetElement = toleranceElement;
            }
        }

        const nodes = useWbsStore.getState().nodes;
        const draggedNode = nodes[activeState.nodeId];
        if (!draggedNode || draggedNode.isArchived || !targetElement) return emptyHover;

        const rect = (targetElement as HTMLElement).getBoundingClientRect();
        const isChildLane = targetElement.hasAttribute('data-kanban-child-empty-lane');
        const targetNodeId = targetElement.getAttribute('data-task-id');
        const isTaskAnchor = !isChildLane && Boolean(targetNodeId && targetElement.hasAttribute('data-mobile-drop-target'));
        const targetKind = isChildLane ? 'child-empty-lane' : isTaskAnchor ? 'task-anchor' : 'parent-group';
        const targetParentId = targetKind === 'task-anchor'
            ? undefined
            : targetElement.getAttribute('data-kanban-target-parent-id');
        const dropPosition: MobileTaskDropPosition = targetKind === 'task-anchor'
            ? (point.y > rect.top + rect.height / 2 ? 'after' : 'before')
            : 'append';
        const resolvedTarget = resolveKanbanDropTarget({
            draggedNodeId: draggedNode.id,
            targetKind,
            targetNodeId,
            targetParentId,
            position: dropPosition,
            nodes,
            canMove: canMoveTask,
        });

        return {
            hoverAction: null,
            hoverTargetId: targetNodeId || (resolvedTarget.parentId || null),
            hoverParentId: resolvedTarget.parentId,
            hoverTargetKind: targetKind,
            dropPosition,
            dropIndicatorRect: {
                left: rect.left,
                top: dropPosition === 'after' ? rect.bottom : rect.top,
                width: rect.width,
            },
            kanbanTarget: resolvedTarget,
        };
    }, [canMoveTask]);

    const startMobileTaskAutoScroll = React.useCallback((point: { x: number; y: number }) => {
        if (typeof window === 'undefined') return;
        mobileTaskAutoScrollPointRef.current = point;
        if (mobileTaskAutoScrollFrameRef.current !== null) return;

        const tick = () => {
            mobileTaskAutoScrollFrameRef.current = null;
            const currentPoint = mobileTaskAutoScrollPointRef.current;
            const activeState = mobileTaskActionRef.current;
            if (!currentPoint || !activeState) return;

            const didScroll = autoScrollMobileTaskSurfaces(currentPoint);
            if (!didScroll) return;

            const latestState = mobileTaskActionRef.current;
            if (latestState) {
                const resolved = resolveMobileTaskHover(currentPoint, latestState);
                const { kanbanTarget, ...hoverState } = resolved;
                if (resolved.hoverAction) resetKanbanDropIntent(true);
                else updateKanbanDropTarget(kanbanTarget);
                commitMobileTaskActionState({
                    ...latestState,
                    pointerX: currentPoint.x,
                    pointerY: currentPoint.y,
                    ...hoverState,
                });
            }
            mobileTaskAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
        };

        mobileTaskAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    }, [
        autoScrollMobileTaskSurfaces,
        commitMobileTaskActionState,
        resetKanbanDropIntent,
        resolveMobileTaskHover,
        updateKanbanDropTarget,
    ]);

    const beginMobileTaskAction = React.useCallback((
        task: { id: string; title?: string; status?: TaskStatus },
        event: React.TouchEvent,
    ) => {
        if (!isMobileTaskActionMode()) return false;
        if (!canMoveTask && !canEditTask && !canCreateTask && !canDeleteTask) return false;
        const point = readTouchPoint(event);
        if (!point) return false;

        const state = useWbsStore.getState();
        const node = state.nodes[task.id];
        if (!node || node.isArchived) return false;

        event.preventDefault();
        event.stopPropagation();
        useBoardStore.getState().setContextMenuState(null);
        setActiveDrag(null);
        commitKanbanDropState(beginKanbanDropIntent(node));

        commitMobileTaskActionState({
            nodeId: node.id,
            title: node.title || task.title || '未命名任務',
            status: node.status || task.status || 'todo',
            pointerX: point.x,
            pointerY: point.y,
            hoverAction: null,
            hoverTargetId: null,
            hoverParentId: null,
            hoverTargetKind: null,
            dropPosition: null,
            dropIndicatorRect: null,
        });
        return true;
    }, [canCreateTask, canDeleteTask, canEditTask, canMoveTask, commitKanbanDropState, commitMobileTaskActionState]);

    const moveMobileTaskAction = React.useCallback((event: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (!activeState) return;
        const point = readTouchPoint(event);
        if (!point) return;
        event.preventDefault();
        event.stopPropagation();
        const resolved = resolveMobileTaskHover(point, activeState);
        const { kanbanTarget, ...hoverState } = resolved;
        if (resolved.hoverAction) resetKanbanDropIntent(true);
        else updateKanbanDropTarget(kanbanTarget);
        commitMobileTaskActionState({
            ...activeState,
            pointerX: point.x,
            pointerY: point.y,
            ...hoverState,
        });
        startMobileTaskAutoScroll(point);
    }, [
        commitMobileTaskActionState,
        resetKanbanDropIntent,
        resolveMobileTaskHover,
        startMobileTaskAutoScroll,
        updateKanbanDropTarget,
    ]);

    const getFinalMobileTaskHover = React.useCallback((event: React.TouchEvent | undefined, activeState: MobileTaskActionState) => {
        const previousHover = {
            hoverAction: activeState.hoverAction,
            hoverTargetId: activeState.hoverTargetId,
            hoverParentId: activeState.hoverParentId,
            hoverTargetKind: activeState.hoverTargetKind,
            dropPosition: activeState.dropPosition,
            dropIndicatorRect: activeState.dropIndicatorRect,
            kanbanTarget: kanbanDropStateRef.current.target,
        };
        const point = event ? readTouchPoint(event) : null;
        if (!point) return previousHover;
        const resolvedHover = resolveMobileTaskHover(point, activeState);
        if (resolvedHover.hoverAction) return resolvedHover;
        if (resolvedHover.kanbanTarget?.valid) return resolvedHover;
        return previousHover;
    }, [resolveMobileTaskHover]);

    const endMobileTaskAction = React.useCallback((event: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (!activeState) return;
        const finalHover = getFinalMobileTaskHover(event, activeState);
        event.preventDefault();
        event.stopPropagation();

        if (finalHover.hoverAction) {
            resetKanbanDropIntent();
            commitMobileTaskActionState(null);
            recordMobileTaskActionDebug({ type: 'end:action', nodeId: activeState.nodeId, finalHover });
            void executeMobileTaskAction(finalHover.hoverAction, activeState.nodeId);
            return;
        }
        if (finalHover.kanbanTarget) updateKanbanDropTarget(finalHover.kanbanTarget);
        const dropState = kanbanDropStateRef.current;
        commitMobileTaskActionState(null);
        recordMobileTaskActionDebug({ type: 'end:drop', nodeId: activeState.nodeId, finalHover });
        executeMobileTaskDrop(activeState.nodeId, finalHover.kanbanTarget, dropState);
        resetKanbanDropIntent();
    }, [
        commitMobileTaskActionState,
        executeMobileTaskAction,
        executeMobileTaskDrop,
        getFinalMobileTaskHover,
        resetKanbanDropIntent,
        updateKanbanDropTarget,
    ]);

    const cancelMobileTaskAction = React.useCallback((event?: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        recordMobileTaskActionDebug({ type: 'cancel:reset', nodeId: activeState?.nodeId || null });
        commitMobileTaskActionState(null);
        resetKanbanDropIntent();
    }, [commitMobileTaskActionState, resetKanbanDropIntent]);

    const mobileTaskActionApi = React.useMemo(() => ({
        state: mobileTaskAction,
        begin: beginMobileTaskAction,
        move: moveMobileTaskAction,
        end: endMobileTaskAction,
        cancel: cancelMobileTaskAction,
        isActive: (nodeId?: string) => {
            const activeState = mobileTaskActionRef.current;
            if (!activeState) return false;
            return nodeId ? activeState.nodeId === nodeId : true;
        },
    }), [beginMobileTaskAction, cancelMobileTaskAction, endMobileTaskAction, mobileTaskAction, moveMobileTaskAction]);
    const kanbanDropContextValue = React.useMemo(() => ({
        state: kanbanDropState,
        isTaskDragActive: Boolean(activeDrag?.node || mobileTaskAction),
    }), [activeDrag?.node, kanbanDropState, mobileTaskAction]);

    React.useLayoutEffect(() => {
        if (!activeDrag?.node || mobileTaskAction || !kanbanDropState.target?.valid) {
            setDesktopPlacementPreview(prev => isSameKanbanPlacementPreview(prev, null) ? prev : null);
            return;
        }

        const target = kanbanDropState.target;
        const phaseCanShowLine = (
            kanbanDropState.phase === 'same-parent' ||
            kanbanDropState.phase === 'arming' ||
            kanbanDropState.phase === 'locked'
        );
        if (!phaseCanShowLine) {
            setDesktopPlacementPreview(prev => isSameKanbanPlacementPreview(prev, null) ? prev : null);
            return;
        }

        const readPlacementPreview = () => {
            let lineElement: Element | null = null;
            if (target.kind === 'child-empty-lane') {
                const parentId = escapeKanbanSelectorValue(target.parentId || '');
                lineElement = document.querySelector(
                    `[data-kanban-child-empty-lane="true"][data-kanban-target-parent-id="${parentId}"] [data-kanban-empty-lane-line="true"]`,
                );
            }

            if (!lineElement) {
                const parentKey = escapeKanbanSelectorValue(target.parentKey);
                const position = escapeKanbanSelectorValue(target.position);
                lineElement = document.querySelector(
                    `[data-kanban-drop-indicator="true"][data-kanban-drop-position="${position}"][data-kanban-drop-parent-id="${parentKey}"]:not([data-mobile-drop-indicator])`,
                );
            }

            const lineRect = getVisibleLineRect(lineElement);
            if (!lineRect) return null;

            const title = activeDrag.title || activeDrag.node.title || '未命名任務';
            return {
                left: Math.round(lineRect.left),
                top: Math.round(Math.min(lineRect.bottom + 4, Math.max(0, window.innerHeight - 44))),
                width: Math.round(lineRect.width),
                title,
            };
        };

        let frameId: number | null = null;
        const applyPreview = () => {
            const nextPreview = readPlacementPreview();
            setDesktopPlacementPreview(prev => (
                isSameKanbanPlacementPreview(prev, nextPreview) ? prev : nextPreview
            ));
        };

        applyPreview();
        frameId = window.requestAnimationFrame(applyPreview);
        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
        };
    }, [
        activeDrag?.id,
        activeDrag?.node,
        activeDrag?.title,
        mobileTaskAction,
        kanbanDropState.phase,
        kanbanDropState.target,
    ]);

    React.useEffect(() => {
        const handleMove = (event: TouchEvent) => moveMobileTaskAction(event as any);
        const handleEnd = (event: TouchEvent) => endMobileTaskAction(event as any);
        const handleCancel = (event: TouchEvent) => cancelMobileTaskAction(event as any);
        const options = { capture: true, passive: false } as AddEventListenerOptions;
        window.addEventListener('touchmove', handleMove, options);
        window.addEventListener('touchend', handleEnd, options);
        window.addEventListener('touchcancel', handleCancel, options);
        return () => {
            window.removeEventListener('touchmove', handleMove, options);
            window.removeEventListener('touchend', handleEnd, options);
            window.removeEventListener('touchcancel', handleCancel, options);
        };
    }, [cancelMobileTaskAction, endMobileTaskAction, moveMobileTaskAction]);

    React.useEffect(() => {
        const hardCancel = (reason: string) => {
            const activeState = mobileTaskActionRef.current;
            if (!activeState && !activeDrag) return;
            recordMobileTaskActionDebug({ type: 'hard-cancel', reason, nodeId: activeState?.nodeId || null });
            commitMobileTaskActionState(null);
            setActiveDrag(null);
            setDesktopPointerPreview(null);
            lastValidOverRef.current = null;
            resetKanbanDropIntent();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') hardCancel('visibilitychange');
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') hardCancel('escape');
        };
        const handlePointerCancel = () => hardCancel('pointercancel');
        const handleBlur = () => hardCancel('blur');
        const handlePageHide = () => hardCancel('pagehide');

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('pointercancel', handlePointerCancel, true);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('pointercancel', handlePointerCancel, true);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [activeDrag, commitMobileTaskActionState, resetKanbanDropIntent]);

    React.useEffect(() => () => {
        if (mobileTaskActionFailSafeRef.current) {
            clearTimeout(mobileTaskActionFailSafeRef.current);
            mobileTaskActionFailSafeRef.current = null;
        }
        clearKanbanLockTimers();
        clearKanbanUnlockTimer();
        stopMobileTaskAutoScroll();
    }, [clearKanbanLockTimers, clearKanbanUnlockTimer, stopMobileTaskAutoScroll]);

    const updateDesktopKanbanHover = (event: any) => {
        if (!canMoveTask) return;
        const { active, over } = event;
        updateDesktopPointerPreview(event, activeDrag);
        if (over) lastValidOverRef.current = over;
        const hasPointerPoint = Boolean(readDesktopPointerPoint(event));
        const pointerPoint = readDesktopPointerPoint(event);
        const pointerTarget = hasPointerPoint ? resolveDesktopKanbanTargetAtPoint(active, event) : null;
        const collisionTarget = resolveDesktopKanbanTarget(active, over, event);
        const collisionTaskAnchorUnderPointer = (
            hasPointerPoint &&
            collisionTarget?.kind === 'task-anchor' &&
            isDesktopPointerInsideTaskAnchor(collisionTarget.anchorNodeId, pointerPoint)
        );
        const sameParentCollisionAnchorCanCorrectParentGroup = (
            hasPointerPoint &&
            collisionTarget?.kind === 'task-anchor' &&
            collisionTarget.sameParent &&
            pointerTarget?.kind === 'parent-group' &&
            pointerTarget.sameParent &&
            pointerTarget.parentKey === collisionTarget.parentKey
        );
        const resolvedTarget = collisionTaskAnchorUnderPointer
            ? collisionTarget
            : sameParentCollisionAnchorCanCorrectParentGroup
                ? collisionTarget
            : pointerTarget || (!hasPointerPoint ? collisionTarget : null);
        updateKanbanDropTarget(resolvedTarget);
        recordKanbanDropDebug({
            type: 'hover',
            overType: over?.data.current?.type || null,
            overNodeId: over?.data.current?.nodeId || null,
            targetSource: collisionTaskAnchorUnderPointer
                ? 'collision-anchor-under-pointer'
                : sameParentCollisionAnchorCanCorrectParentGroup
                    ? 'collision-same-parent-anchor'
                    : pointerTarget ? 'pointer' : resolvedTarget ? 'collision' : 'none',
            phase: kanbanDropStateRef.current.phase,
            target: kanbanDropStateRef.current.target,
        });
    };

    const handleDragOver = (event: any) => updateDesktopKanbanHover(event);
    const handleDragMove = (event: any) => updateDesktopKanbanHover(event);

    const handleDragEnd = (event: any) => {
        const dropState = kanbanDropStateRef.current;
        recordKanbanDropDebug({ type: 'end:start', dropState, over: event.over?.data.current || null });
        setActiveDrag(null);
        setDesktopPointerPreview(null);
        if (isMobileTaskActionMode()) {
            lastValidOverRef.current = null;
            resetKanbanDropIntent();
            return;
        }
        if (!canMoveTask) {
            resetKanbanDropIntent();
            return;
        }
        const { active, over } = event;
        lastValidOverRef.current = null;

        const activeData = active.data.current;
        const overData = over?.data.current;
        const state = useWbsStore.getState();
        const draggedNode = state.nodes[activeData?.nodeId];
        const isTaskWorkbenchUnplacedDrop =
            overData?.type === 'task-workbench-unplaced-lane' ||
            (overData?.source === 'task-workbench' && overData?.placement === 'unplaced');

        if (draggedNode && isTaskWorkbenchUnplacedDrop) {
            batchUpdateNodes({ [draggedNode.id]: {
                boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
                parentId: null,
                order: getBoardRootAppendOrder(TASK_WORKBENCH_UNPLACED_BOARD_ID, draggedNode.id, state.nodes),
                updatedAt: Date.now(),
            } }, { label: '移到未歸位', mergeKey: `placement:${draggedNode.id}` });
            recalculateAncestorStatus(draggedNode.id);
            resetKanbanDropIntent();
            return;
        }

        if (draggedNode && overData?.type === 'task-workbench-placed-board-lane' && overData.boardId && overData.workspaceId) {
            batchUpdateNodes({ [draggedNode.id]: {
                workspaceId: overData.workspaceId,
                boardId: overData.boardId,
                parentId: null,
                order: getBoardRootAppendOrder(overData.boardId, draggedNode.id, state.nodes),
                nodeType: draggedNode.nodeType || 'task',
                updatedAt: Date.now(),
            } }, { label: '歸位任務', mergeKey: `placement:${draggedNode.id}` });
            recalculateAncestorStatus(draggedNode.id);
            resetKanbanDropIntent();
            return;
        }

        const eventTarget = over ? resolveDesktopKanbanTarget(active, over, event) : null;
        const pointTarget = resolveDesktopKanbanTargetAtPoint(active, event);
        const target = dropState.target?.valid ? dropState.target : eventTarget?.valid ? eventTarget : pointTarget;
        const phaseAllowsTarget = Boolean(target?.valid && (
            target.sameParent ||
            (dropState.phase === 'locked' && target.parentKey === kanbanParentKey(dropState.lockedParentId))
        ));

        if (draggedNode && target && phaseAllowsTarget) {
            const updates = buildKanbanMoveUpdates(draggedNode.id, target, state.nodes);
            recordKanbanDropDebug({ type: 'end:commit', draggedNodeId: draggedNode.id, target, updates });
            batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
        } else {
            recordKanbanDropDebug({ type: 'end:blocked', draggedNodeId: draggedNode?.id || null, target, phaseAllowsTarget });
        }
        resetKanbanDropIntent();
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

    const rootGroupPhase = kanbanDropState.phase === 'arming' && !kanbanDropState.candidateParentId
        ? 'arming'
        : kanbanDropState.phase === 'locked' && !kanbanDropState.lockedParentId
          ? 'locked'
          : kanbanDropState.phase === 'invalid' && kanbanDropState.target?.parentId === null
            ? 'invalid'
            : null;
    const rootGroupClassName = rootGroupPhase === 'locked'
        ? 'ring-2 ring-primary/70 ring-inset'
        : rootGroupPhase === 'arming'
          ? 'ring-2 ring-amber-400/80 ring-inset'
          : rootGroupPhase === 'invalid'
            ? 'ring-2 ring-rose-400/80 ring-inset'
            : '';

    return (
        <KanbanDependencyContext.Provider value={{ dependencySelection, handleKanbanDependencySelect, dependencies }}>
        <MobileTaskActionContext.Provider value={mobileTaskActionApi}>
        <KanbanDropIntentContext.Provider value={kanbanDropContextValue}>
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
                        className={`scroll-container mobile-pan-surface relative flex-1 overflow-x-auto overflow-y-hidden bg-slate-100/90 ${compactClassNames.canvas} flex gap-[12px] items-start scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent ${rootGroupClassName}`}
                        data-mobile-pan-surface="board"
                        data-kanban-mouse-pan-surface="true"
                        data-layout-region="board-canvas"
                        data-kanban-parent-group="root"
                        data-kanban-target-parent-id=""
                        data-kanban-parent-lock-state={rootGroupPhase || undefined}
                        data-kanban-parent-lock-progress={rootGroupPhase ? kanbanDropState.progress.toFixed(3) : undefined}
                        data-kanban-drop-parent-id={rootGroupPhase ? 'root' : undefined}
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
                            >
                                <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                                <span>新增任務</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {desktopPlacementPreview ? (
                <div
                    className="pointer-events-none fixed z-[88] rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-primary/10"
                    style={{
                        left: desktopPlacementPreview.left,
                        top: desktopPlacementPreview.top,
                        width: desktopPlacementPreview.width,
                    }}
                    data-kanban-placement-preview="true"
                    data-kanban-placement-preview-title={desktopPlacementPreview.title}
                >
                    <div className="truncate">{desktopPlacementPreview.title}</div>
                </div>
            ) : null}
            {activeDrag?.node && !desktopPlacementPreview && desktopPointerPreview ? (
                <div
                    className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-primary/10 will-change-transform"
                    style={{
                        left: desktopPointerPreview.left,
                        top: desktopPointerPreview.top,
                        width: desktopPointerPreview.width,
                    }}
                    data-kanban-pointer-drag-preview="true"
                    data-kanban-pointer-preview-mode="cursor"
                    data-kanban-pointer-x={desktopPointerPreview.left}
                    data-kanban-pointer-y={desktopPointerPreview.top}
                >
                    <div className="truncate">{desktopPointerPreview.title}</div>
                </div>
            ) : null}
            <MobileTaskActionLayer
                state={mobileTaskAction}
                canEditTask={canEditTask}
                canCreateTask={canCreateTask}
                canDeleteTask={canDeleteTask}
                hasValidInsertionPreview={Boolean(
                    mobileTaskAction?.dropIndicatorRect &&
                    kanbanDropState.target?.valid &&
                    (
                        kanbanDropState.phase === 'same-parent' ||
                        kanbanDropState.phase === 'arming' ||
                        kanbanDropState.phase === 'locked'
                    )
                )}
            />
        </DndContext>
        </KanbanDropIntentContext.Provider>
        </MobileTaskActionContext.Provider>
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
