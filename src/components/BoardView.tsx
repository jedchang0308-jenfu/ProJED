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
import { Check, CheckCircle2, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { useMobilePanBroker } from '../hooks/useMobilePanBroker';
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
    icon: React.ComponentType<{ size?: number; className?: string }>;
    permission: 'edit' | 'create' | 'delete';
    activeClassName: string;
    idleClassName: string;
}> = [
    {
        key: 'toggle-complete',
        label: '標示完成',
        icon: CheckCircle2,
        permission: 'edit',
        activeClassName: 'border-emerald-500 bg-emerald-500 text-white',
        idleClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    },
    {
        key: 'add-sibling',
        label: '新增同階',
        icon: Plus,
        permission: 'create',
        activeClassName: 'border-sky-500 bg-sky-500 text-white',
        idleClassName: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    },
    {
        key: 'add-child',
        label: '新增下層',
        icon: ListPlus,
        permission: 'create',
        activeClassName: 'border-indigo-500 bg-indigo-500 text-white',
        idleClassName: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    },
    {
        key: 'delete',
        label: '刪除任務',
        icon: Trash2,
        permission: 'delete',
        activeClassName: 'border-red-500 bg-red-500 text-white',
        idleClassName: 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
    },
];

const MobileTaskActionLayer: React.FC<{
    state: MobileTaskActionState | null;
    canEditTask: boolean;
    canCreateTask: boolean;
    canDeleteTask: boolean;
}> = ({ state, canEditTask, canCreateTask, canDeleteTask }) => {
    if (!state) return null;

    const canUseAction = (permission: 'edit' | 'create' | 'delete') => {
        if (permission === 'edit') return canEditTask;
        if (permission === 'create') return canCreateTask;
        return canDeleteTask;
    };

    return (
        <>
            <div
                className="pointer-events-none fixed z-[90] max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary/25 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-xl ring-2 ring-primary/15"
                style={{ left: state.pointerX, top: state.pointerY }}
                data-mobile-drag-preview="true"
                data-task-id={state.nodeId}
            >
                <div className="truncate">{state.title || '未命名任務'}</div>
            </div>

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
                />
            ) : null}

            <div
                className="fixed left-1/2 z-[95] grid w-[calc(100vw-1rem)] max-w-[420px] -translate-x-1/2 grid-cols-2 gap-2"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
                data-mobile-task-action-rail="true"
                data-mobile-task-action-rail-placement="top"
            >
                {mobileActionItems.map((item) => {
                    const Icon = item.icon;
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
                            className={`flex h-12 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-md backdrop-blur transition ${
                                active ? item.activeClassName : item.idleClassName
                            } disabled:cursor-not-allowed disabled:opacity-35`}
                            data-mobile-task-action={item.key}
                            data-mobile-task-action-label={label}
                        >
                            <Icon size={18} className="shrink-0" />
                            <span className="min-w-0 truncate" data-mobile-task-action-text="true">
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

const MOBILE_TASK_ACTION_FAILSAFE_MS = 12000;
const MOBILE_TASK_EDGE_SCROLL_THRESHOLD_PX = 56;
const MOBILE_TASK_EDGE_SCROLL_MAX_STEP_PX = 18;

const BoardView = () => {
    const mobilePanSurfaceRef = useMobilePanBroker<HTMLDivElement>();
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
    const mobileTaskActionRef = React.useRef<MobileTaskActionState | null>(null);
    const mobileTaskActionFailSafeRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const mobileTaskAutoScrollFrameRef = React.useRef<number | null>(null);
    const mobileTaskAutoScrollPointRef = React.useRef<{ x: number; y: number } | null>(null);
    const lastValidOverRef = React.useRef<any>(null);

    const stopMobileTaskAutoScroll = React.useCallback(() => {
        mobileTaskAutoScrollPointRef.current = null;
        if (mobileTaskAutoScrollFrameRef.current !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(mobileTaskAutoScrollFrameRef.current);
        }
        mobileTaskAutoScrollFrameRef.current = null;
    }, []);

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

        if (['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType || '')) {
            const checklistDropCollision = collisions.find((collision: any) => {
                const container = getCollisionContainer(collision);
                return container?.data.current?.type === 'wbs-checklist-drop';
            });

            if (checklistDropCollision) {
                return [
                    checklistDropCollision,
                    ...collisions.filter((collision: any) => collision.id !== checklistDropCollision.id),
                ];
            }
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
        if (isMobileTaskActionMode()) {
            lastValidOverRef.current = null;
            commitMobileTaskActionState(null);
            setActiveDrag(null);
            return;
        }
        const { active } = event;
        const nodeId = active.data.current?.nodeId;
        lastValidOverRef.current = null;
        setActiveDrag({
            id: active.id,
            type: active.data.current?.type,
            source: active.data.current?.source,
            title: active.data.current?.title,
            node: nodeId ? useWbsStore.getState().nodes[nodeId] : null,
        });
    };

    const handleDragCancel = () => {
        lastValidOverRef.current = null;
        setActiveDrag(null);
    };

    const buildPreviewParentIndex = (nodesRecord: Record<string, TaskNode>) => {
        const parentIndex: Record<string, string[]> = {};

        Object.values(nodesRecord).forEach(node => {
            if (node.isArchived) return;
            const key = node.parentId || 'root';
            if (!parentIndex[key]) parentIndex[key] = [];
            parentIndex[key].push(node.id);
        });

        Object.keys(parentIndex).forEach(parentId => {
            parentIndex[parentId].sort((a, b) => {
                const nodeA = nodesRecord[a];
                const nodeB = nodesRecord[b];
                return (nodeA?.order || 0) - (nodeB?.order || 0);
            });
        });

        return parentIndex;
    };

    const getAppendOrder = (
        parentId: string,
        excludeId?: string,
        nodesOverride?: Record<string, TaskNode>,
        parentIndexOverride?: Record<string, string[]>,
    ) => {
        const nodes = nodesOverride || useWbsStore.getState().nodes;
        const parentIndex = parentIndexOverride || useWbsStore.getState().parentNodesIndex;
        const siblings = parentIndex[parentId] || [];

        return siblings.reduce((max, id) => {
            if (id === excludeId) return max;
            const node = nodes[id];
            return node ? Math.max(max, node.order) : max;
        }, -1) + 1;
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

    const isDescendantOf = (nodeId: string, possibleAncestorId: string, nodesRecord?: Record<string, TaskNode>) => {
        const nodes = nodesRecord || useWbsStore.getState().nodes;
        let current = nodes[nodeId]?.parentId;
        const visited = new Set<string>();

        while (current) {
            if (current === possibleAncestorId) return true;
            if (visited.has(current)) return false;
            visited.add(current);
            current = nodes[current]?.parentId || null;
        }

        return false;
    };

    const getSiblingIds = (
        parentId: string | null,
        nodesRecord: Record<string, TaskNode>,
        parentIndex: Record<string, string[]>,
        excludeId?: string,
    ) => {
        const key = parentId || 'root';
        return (parentIndex[key] || [])
            .filter(id => id !== excludeId)
            .map(id => nodesRecord[id])
            .filter(node => node && !node.isArchived)
            .sort((a, b) => a.order - b.order)
            .map(node => node.id);
    };

    const buildNodesWithMove = (
        nodesRecord: Record<string, TaskNode>,
        draggedNodeId: string,
        parentId: string | null,
        order: number,
        nodeType?: TaskNode['nodeType'],
    ) => ({
        ...nodesRecord,
        [draggedNodeId]: {
            ...nodesRecord[draggedNodeId],
            parentId,
            nodeType,
            order,
        },
    });

    const getReorderOrder = (draggedNode: TaskNode, targetNode: TaskNode) => {
        const sameParent = (draggedNode.parentId || null) === (targetNode.parentId || null);
        const isMovingDown = sameParent && draggedNode.order < targetNode.order;
        return targetNode.order + (isMovingDown ? 0.5 : -0.5);
    };

    const normalizeMovedSiblingOrders = (
        draggedNodeId: string,
        intent: { parentId: string | null; order: number; nodeType?: TaskNode['nodeType'] },
        nodesRecord: Record<string, TaskNode>,
    ) => {
        const parentIndex = buildPreviewParentIndex(nodesRecord);
        const movedNodes = buildNodesWithMove(
            nodesRecord,
            draggedNodeId,
            intent.parentId,
            intent.order,
            intent.nodeType,
        );
        const movedParentIndex = buildPreviewParentIndex(movedNodes);
        const affectedParentIds = Array.from(new Set([
            nodesRecord[draggedNodeId]?.parentId || 'root',
            intent.parentId || 'root',
        ]));
        const updates: Record<string, Partial<TaskNode>> = {};

        affectedParentIds.forEach(parentKey => {
            const ids = parentKey === (intent.parentId || 'root')
                ? getSiblingIds(intent.parentId, movedNodes, movedParentIndex)
                : (parentIndex[parentKey] || [])
                    .filter(id => id !== draggedNodeId)
                    .map(id => nodesRecord[id])
                    .filter(node => node && !node.isArchived)
                    .sort((a, b) => a.order - b.order)
                    .map(node => node.id);

            ids.forEach((id, index) => {
                updates[id] = {
                    ...(updates[id] || {}),
                    order: index,
                };
            });
        });

        updates[draggedNodeId] = {
            ...(updates[draggedNodeId] || {}),
            parentId: intent.parentId,
            nodeType: intent.nodeType,
            updatedAt: Date.now(),
        };

        return updates;
    };

    const getDropIntent = (activeData: any, overData: any, nodesRecord: Record<string, TaskNode>) => {
        const draggedNode = nodesRecord[activeData?.nodeId];
        if (!draggedNode || !overData) return null;

        const targetNode = nodesRecord[overData.nodeId];
        const parentIndex = buildPreviewParentIndex(nodesRecord);
        const sourceType = activeData.type;
        const targetType = overData.type;
        const shouldBecomeTask = sourceType === 'wbs-column' && targetType !== 'wbs-column';

        if (targetType === 'wbs-column') {
            const targetParentId = sourceType === 'wbs-column' ? (targetNode?.parentId || null) : overData.nodeId;
            return {
                parentId: targetParentId,
                order: sourceType === 'wbs-column' && targetNode
                    ? getReorderOrder(draggedNode, targetNode)
                    : getAppendOrder(overData.nodeId, draggedNode.id, nodesRecord, parentIndex),
                nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
            };
        }

        if (targetType === 'wbs-card') {
            if (!targetNode) return null;
            return {
                parentId: targetNode.parentId,
                order: getReorderOrder(draggedNode, targetNode),
                nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
            };
        }

        if (targetType === 'wbs-card-drop' || targetType === 'wbs-checklist-drop') {
            return {
                parentId: overData.nodeId,
                order: getAppendOrder(overData.nodeId, draggedNode.id, nodesRecord, parentIndex),
                nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
            };
        }

        if (targetType === 'wbs-checklist') {
            if (!targetNode?.parentId) return null;
            return {
                parentId: targetNode.parentId,
                order: getReorderOrder(draggedNode, targetNode),
                nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
            };
        }

        return null;
    };

    const isValidDropIntent = (draggedNodeId: string, intent: any, nodesRecord: Record<string, TaskNode>) => {
        if (!intent) return false;
        if (intent.parentId === draggedNodeId) return false;
        if (intent.parentId && isDescendantOf(intent.parentId, draggedNodeId, nodesRecord)) return false;
        return true;
    };

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
            order: getAppendOrder(sourceNode.id, undefined, state.nodes),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addNode(newNode);
        selectAndOpenTaskDetails(newNode.id);
    }, [activeBoardId, activeWorkspaceId, addNode, canCreateTask, getAppendOrder]);

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
        targetNodeId: string | null,
        dropPosition: MobileTaskDropPosition | null,
    ) => {
        recordMobileTaskActionDebug({ type: 'drop:start', draggedNodeId, targetNodeId, dropPosition, canMoveTask });
        if (!canMoveTask || !targetNodeId || !dropPosition || draggedNodeId === targetNodeId) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-basic', draggedNodeId, targetNodeId, dropPosition, canMoveTask });
            return;
        }
        const state = useWbsStore.getState();
        const draggedNode = state.nodes[draggedNodeId];
        const targetNode = state.nodes[targetNodeId];
        if (!draggedNode || !targetNode || draggedNode.isArchived || targetNode.isArchived) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-missing', draggedNodeId, targetNodeId });
            return;
        }

        const intent = {
            parentId: targetNode.parentId || null,
            order: (targetNode.order ?? 0) + (dropPosition === 'after' ? 0.5 : -0.5),
            nodeType: targetNode.parentId ? 'task' : (draggedNode.nodeType || 'task'),
        };
        if (!isValidDropIntent(draggedNode.id, intent, state.nodes)) {
            recordMobileTaskActionDebug({ type: 'drop:blocked-invalid-intent', draggedNodeId, targetNodeId, intent });
            return;
        }

        const updates = normalizeMovedSiblingOrders(draggedNode.id, intent, state.nodes);
        updates[draggedNode.id] = {
            ...(updates[draggedNode.id] || {}),
            workspaceId: targetNode.workspaceId || draggedNode.workspaceId,
            boardId: targetNode.boardId || draggedNode.boardId,
            nodeType: intent.nodeType,
            updatedAt: Date.now(),
        };

        batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
        recalculateAncestorStatus(draggedNode.id);
        recordMobileTaskActionDebug({ type: 'drop:complete', draggedNodeId, targetNodeId, dropPosition, updates });
    }, [batchUpdateNodes, canMoveTask, isValidDropIntent, normalizeMovedSiblingOrders, recalculateAncestorStatus]);

    const resolveMobileTaskHover = React.useCallback((
        point: { x: number; y: number },
        activeState: MobileTaskActionState,
    ): Pick<MobileTaskActionState, 'hoverAction' | 'hoverTargetId' | 'dropPosition' | 'dropIndicatorRect'> => {
        const element = document.elementFromPoint(point.x, point.y);
        const actionElement = element instanceof Element
            ? element.closest('[data-mobile-task-action]')
            : null;
        if (actionElement) {
            const action = actionElement.getAttribute('data-mobile-task-action') as MobileTaskAction | null;
            return {
                hoverAction: action,
                hoverTargetId: null,
                dropPosition: null,
                dropIndicatorRect: null,
            };
        }

        const targetElement = element instanceof Element
            ? element.closest('[data-mobile-drop-target][data-task-id]')
            : null;
        const targetNodeId = targetElement?.getAttribute('data-task-id') || null;
        if (!targetNodeId || targetNodeId === activeState.nodeId || !canMoveTask) {
            return {
                hoverAction: null,
                hoverTargetId: null,
                dropPosition: null,
                dropIndicatorRect: null,
            };
        }

        const nodes = useWbsStore.getState().nodes;
        const draggedNode = nodes[activeState.nodeId];
        const targetNode = nodes[targetNodeId];
        if (!draggedNode || !targetNode || draggedNode.isArchived || targetNode.isArchived) {
            return {
                hoverAction: null,
                hoverTargetId: null,
                dropPosition: null,
                dropIndicatorRect: null,
            };
        }

        const rect = (targetElement as HTMLElement).getBoundingClientRect();
        const dropPosition: MobileTaskDropPosition = point.y > rect.top + rect.height / 2 ? 'after' : 'before';
        const intent = {
            parentId: targetNode.parentId || null,
            order: (targetNode.order ?? 0) + (dropPosition === 'after' ? 0.5 : -0.5),
            nodeType: targetNode.parentId ? 'task' : (draggedNode.nodeType || 'task'),
        };
        if (!isValidDropIntent(draggedNode.id, intent, nodes)) {
            return {
                hoverAction: null,
                hoverTargetId: null,
                dropPosition: null,
                dropIndicatorRect: null,
            };
        }

        return {
            hoverAction: null,
            hoverTargetId: targetNodeId,
            dropPosition,
            dropIndicatorRect: {
                left: rect.left,
                top: dropPosition === 'after' ? rect.bottom : rect.top,
                width: rect.width,
            },
        };
    }, [canMoveTask, isValidDropIntent]);

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
                commitMobileTaskActionState({
                    ...latestState,
                    pointerX: currentPoint.x,
                    pointerY: currentPoint.y,
                    ...resolveMobileTaskHover(currentPoint, latestState),
                });
            }
            mobileTaskAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
        };

        mobileTaskAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    }, [autoScrollMobileTaskSurfaces, commitMobileTaskActionState, resolveMobileTaskHover]);

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

        commitMobileTaskActionState({
            nodeId: node.id,
            title: node.title || task.title || '未命名任務',
            status: node.status || task.status || 'todo',
            pointerX: point.x,
            pointerY: point.y,
            hoverAction: null,
            hoverTargetId: null,
            dropPosition: null,
            dropIndicatorRect: null,
        });
        return true;
    }, [canCreateTask, canDeleteTask, canEditTask, canMoveTask, commitMobileTaskActionState]);

    const moveMobileTaskAction = React.useCallback((event: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (!activeState) return;
        const point = readTouchPoint(event);
        if (!point) return;
        event.preventDefault();
        event.stopPropagation();
        commitMobileTaskActionState({
            ...activeState,
            pointerX: point.x,
            pointerY: point.y,
            ...resolveMobileTaskHover(point, activeState),
        });
        startMobileTaskAutoScroll(point);
    }, [commitMobileTaskActionState, resolveMobileTaskHover, startMobileTaskAutoScroll]);

    const getFinalMobileTaskHover = React.useCallback((event: React.TouchEvent | undefined, activeState: MobileTaskActionState) => {
        const previousHover = {
            hoverAction: activeState.hoverAction,
            hoverTargetId: activeState.hoverTargetId,
            dropPosition: activeState.dropPosition,
            dropIndicatorRect: activeState.dropIndicatorRect,
        };
        const point = event ? readTouchPoint(event) : null;
        if (!point) return previousHover;
        const resolvedHover = resolveMobileTaskHover(point, activeState);
        return resolvedHover.hoverAction || resolvedHover.hoverTargetId ? resolvedHover : previousHover;
    }, [resolveMobileTaskHover]);

    const endMobileTaskAction = React.useCallback((event: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (!activeState) return;
        const finalHover = getFinalMobileTaskHover(event, activeState);
        event.preventDefault();
        event.stopPropagation();
        commitMobileTaskActionState(null);

        if (finalHover.hoverAction) {
            recordMobileTaskActionDebug({ type: 'end:action', nodeId: activeState.nodeId, finalHover });
            void executeMobileTaskAction(finalHover.hoverAction, activeState.nodeId);
            return;
        }
        recordMobileTaskActionDebug({ type: 'end:drop', nodeId: activeState.nodeId, finalHover });
        executeMobileTaskDrop(activeState.nodeId, finalHover.hoverTargetId, finalHover.dropPosition);
    }, [commitMobileTaskActionState, executeMobileTaskAction, executeMobileTaskDrop, getFinalMobileTaskHover]);

    const cancelMobileTaskAction = React.useCallback((event?: React.TouchEvent) => {
        const activeState = mobileTaskActionRef.current;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        recordMobileTaskActionDebug({ type: 'cancel:reset', nodeId: activeState?.nodeId || null });
        commitMobileTaskActionState(null);
    }, [commitMobileTaskActionState]);

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
            lastValidOverRef.current = null;
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
    }, [activeDrag, commitMobileTaskActionState]);

    React.useEffect(() => () => {
        if (mobileTaskActionFailSafeRef.current) {
            clearTimeout(mobileTaskActionFailSafeRef.current);
            mobileTaskActionFailSafeRef.current = null;
        }
        stopMobileTaskAutoScroll();
    }, [stopMobileTaskAutoScroll]);

    const handleDragOver = (event: any) => {
        if (!canMoveTask) return;
        const { active, over } = event;
        if (over && active?.id !== over.id) {
            lastValidOverRef.current = over;
        }
    };

    const handleDragEnd = (event: any) => {
        setActiveDrag(null);
        if (isMobileTaskActionMode()) {
            lastValidOverRef.current = null;
            return;
        }
        if (!canMoveTask) return;
        const { active, over } = event;
        const effectiveOver = over && active.id !== over.id ? over : lastValidOverRef.current;
        lastValidOverRef.current = null;
        if (!effectiveOver || active.id === effectiveOver.id) return;

        const activeData = active.data.current;
        const overData = effectiveOver.data.current;
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
            return;
        }

        const intent = getDropIntent(activeData, overData, state.nodes);

        if (draggedNode && isValidDropIntent(draggedNode.id, intent, state.nodes)) {
            const updates = normalizeMovedSiblingOrders(draggedNode.id, intent, state.nodes);
            if (activeData?.source === 'task-workbench' && activeWorkspaceId && activeBoardId) {
                updates[draggedNode.id] = {
                    ...(updates[draggedNode.id] || {}),
                    workspaceId: activeWorkspaceId,
                    boardId: activeBoardId,
                    nodeType: intent?.parentId ? 'task' : (updates[draggedNode.id]?.nodeType || draggedNode.nodeType),
                };
            }
            batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
            recalculateAncestorStatus(draggedNode.id);
        }
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
        <MobileTaskActionContext.Provider value={mobileTaskActionApi}>
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex min-w-0 bg-slate-50 overflow-hidden">
                <TaskWorkbenchPanel canMoveTask={canMoveTask} />
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
                        ref={mobilePanSurfaceRef}
                        className={`scroll-container mobile-pan-surface flex-1 overflow-x-auto overflow-y-hidden ${compactClassNames.canvas} flex gap-[12px] items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent`}
                        data-mobile-pan-surface="board"
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
            <DragOverlay dropAnimation={null}>
                {activeDrag?.node ? (
                    <div className={`task-title-text rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg will-change-transform ${
                        activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'
                    }`}>
                        {activeDrag.title || activeDrag.node.title || '未命名任務'}
                    </div>
                ) : null}
            </DragOverlay>
            <MobileTaskActionLayer
                state={mobileTaskAction}
                canEditTask={canEditTask}
                canCreateTask={canCreateTask}
                canDeleteTask={canDeleteTask}
            />
        </DndContext>
        </MobileTaskActionContext.Provider>
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
