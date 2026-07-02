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
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { GlobalContextMenu } from './GlobalContextMenu';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useRecordStore from '../store/useRecordStore';
import useDialogStore from '../store/useDialogStore';
import { nodeService } from '../services/dataBackend';
import { KanbanColumn } from './Wbs/KanbanColumn';
import { TaskDragOverlayPreview } from './Wbs/TaskDragOverlayPreview';
import { TaskZoneSourcePanel } from './TaskZoneView';
import { compactClassNames } from './ui/compactTokens';
import type { TaskNode, TaskStatus } from '../types';
import { prepareNewTaskNaming } from '../utils/taskInteractions';
import useTaskZoneStore from '../store/useTaskZoneStore';
import { toast } from '../store/useToastStore';

/**
 * 依賴關係選取 Context—讓 KanbanCard 能存取当前選取狀態與處理函式
 * 設計意圖：複用 WbsListView 的依賴模块，但適用於看板的 UI 互動模式。
 */
export const KanbanDependencyContext = React.createContext<{
    dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
    handleKanbanDependencySelect: (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => void;
    dependencies: import('../types').Dependency[];
} | null>(null);

const getTaskZoneMoveErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('move_task_to_board') || message.includes('schema cache') || message.includes('資料庫尚未載入')) {
        return '跨看板歸位尚未完成資料庫更新。請先套用 DEV-041 migration 並重新載入 Supabase schema cache。';
    }
    if (message.includes('controlled move') || message.includes('受控') || message.includes('linked records') || message.includes('標籤') || message.includes('依賴') || message.includes('紀錄')) {
        return '這個任務含有標籤、依賴、紀錄或歷史關聯，不能直接跨工作區搬移；請使用受控搬移流程。';
    }
    if (message.includes('permission') || message.includes('權限')) {
        return '你沒有足夠權限把這個任務移入目前看板。';
    }
    return message || '任務移入目前看板失敗。';
};

const BoardView = () => {
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
    const upsertNodeLocal = useWbsStore(s => s.upsertNodeLocal);
    const updateNode = useWbsStore(s => s.updateNode);
    const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
    const placeTaskOnBoard = useTaskZoneStore(s => s.placeTaskOnBoard);
    const { canCreateTask, canMoveTask, canCreateDependency } = useBoardPermissions();
    const sensors = useDragSensors();
    const [activeDrag, setActiveDrag] = useState<any>(null);

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

        if (['wbs-column', 'wbs-card', 'wbs-checklist', 'quick-capture-item', 'personal-task-zone-item'].includes(activeType || '')) {
            const checklistDropCollision = collisions.find((collision: any) => {
                const container = typeof args.droppableContainers?.get === 'function'
                    ? args.droppableContainers.get(collision.id)
                    : args.droppableContainers?.find((item: any) => item.id === collision.id);
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

    // 合併並排序根節點 (Level 1 = 列表欄)
    const rootNodes = useMemo(() => {
        const ids1 = (rootIds || []).filter(id => {
            const n = storeNodes[id];
            return n && n.boardId === activeBoardId && !n.isArchived;
        });
        const ids2 = (boardRootIds || []).filter(id => {
            const n = storeNodes[id];
            return n && !n.isArchived;
        });
        // 合併去重
        const allIds = Array.from(new Set([...ids1, ...ids2]));
        return allIds
            .map(id => storeNodes[id])
            .filter(node => node)
            .sort((a, b) => a.order - b.order);
    }, [rootIds, boardRootIds, activeBoardId, storeNodes]);

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
        const { active } = event;
        const activeType = active.data.current?.type;
        if (activeType === 'quick-capture-item' || activeType === 'personal-task-zone-item') {
            if (!canCreateTask) return;
            lastValidOverRef.current = null;
            setActiveDrag({
                id: active.id,
                type: activeType,
                title: active.data.current?.title || '未命名任務',
            });
            return;
        }

        if (!canMoveTask) return;
        const nodeId = active.data.current?.nodeId;
        const existingNode = nodeId ? useWbsStore.getState().nodes[nodeId] : null;
        lastValidOverRef.current = null;
        setActiveDrag({
            id: active.id,
            type: active.data.current?.type,
            source: active.data.current?.source,
            node: existingNode,
            title: active.data.current?.title || existingNode?.title || '未命名任務',
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

    const getTaskZoneDropIntent = (overData: any, nodesRecord: Record<string, TaskNode>) => {
        if (!overData) return null;
        const targetType = overData.type;
        const targetNode = nodesRecord[overData.nodeId];
        const parentIndex = buildPreviewParentIndex(nodesRecord);

        if (targetType === 'wbs-column') {
            return {
                parentId: overData.nodeId,
                order: getAppendOrder(overData.nodeId, undefined, nodesRecord, parentIndex),
                insertBeforeId: null,
                insertAfterId: null,
            };
        }

        if (targetType === 'wbs-card' || targetType === 'wbs-checklist') {
            if (!targetNode) return null;
            return {
                parentId: targetNode.parentId,
                order: targetNode.order,
                insertBeforeId: targetNode.id,
                insertAfterId: null,
            };
        }

        if (targetType === 'wbs-card-drop' || targetType === 'wbs-checklist-drop') {
            return {
                parentId: overData.nodeId,
                order: getAppendOrder(overData.nodeId, undefined, nodesRecord, parentIndex),
                insertBeforeId: null,
                insertAfterId: null,
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

    const lastValidOverRef = React.useRef<any>(null);

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        if (active?.data.current?.type === 'quick-capture-item' || active?.data.current?.type === 'personal-task-zone-item') {
            if (!canCreateTask) return;
        } else if (!canMoveTask) {
            return;
        }
        if (over && active?.id !== over.id) {
            lastValidOverRef.current = over;
        }
    };

    const handleDragEnd = async (event: any) => {
        setActiveDrag(null);
        const { active, over } = event;
        const effectiveOver = over && active.id !== over.id ? over : lastValidOverRef.current;
        lastValidOverRef.current = null;
        if (!effectiveOver || active.id === effectiveOver.id) return;

        const activeData = active.data.current;
        const overData = effectiveOver.data.current;
        const state = useWbsStore.getState();
        if (activeData?.source === 'task-zone-my-task' && activeData?.nodeId === overData?.nodeId) return;
        if (activeData?.source === 'task-zone-my-task' && (!state.nodes[activeData.nodeId] || activeData.sourceWorkspaceId !== activeWorkspaceId || activeData.sourceBoardId !== activeBoardId)) {
            if (!canMoveTask || !activeWorkspaceId || !activeBoardId) return;
            if (!activeData.nodeId || !activeData.sourceWorkspaceId || !activeData.sourceBoardId) {
                toast.error('任務來源資訊不足，無法移入目前看板。');
                return;
            }
            const intent = getTaskZoneDropIntent(overData, state.nodes);
            if (!intent) return;

            try {
                const moveResult = await nodeService.moveToBoard({
                    taskId: activeData.nodeId,
                    sourceWorkspaceId: activeData.sourceWorkspaceId,
                    sourceBoardId: activeData.sourceBoardId,
                    targetWorkspaceId: activeWorkspaceId,
                    targetBoardId: activeBoardId,
                    parentId: intent.parentId,
                    order: intent.order,
                    insertBeforeId: intent.insertBeforeId,
                    insertAfterId: intent.insertAfterId,
                });
                moveResult.movedNodes.forEach((node: TaskNode) => upsertNodeLocal(node));
                toast.success('已移入目前看板。');
            } catch (error) {
                toast.error(getTaskZoneMoveErrorMessage(error));
            }
            return;
        }
        if (activeData?.type === 'quick-capture-item' || activeData?.type === 'personal-task-zone-item') {
            if (!canCreateTask || !activeWorkspaceId || !activeBoardId) return;
            const intent = getTaskZoneDropIntent(overData, state.nodes);
            if (!intent) return;

            try {
                const placedTask = await placeTaskOnBoard({
                    taskId: activeData.taskId || activeData.itemId,
                    workspaceId: activeWorkspaceId,
                    boardId: activeBoardId,
                    parentId: intent.parentId,
                    order: intent.order,
                    insertBeforeId: intent.insertBeforeId,
                    insertAfterId: intent.insertAfterId,
                });
                upsertNodeLocal(placedTask);
                toast.success('已歸位到看板。');
            } catch (error) {
                const message = error instanceof Error ? error.message : '任務歸位失敗。';
                toast.error(message);
            }
            return;
        }

        if (!canMoveTask) return;
        const draggedNode = state.nodes[activeData?.nodeId];
        const intent = getDropIntent(activeData, overData, state.nodes);

        if (draggedNode && isValidDropIntent(draggedNode.id, intent, state.nodes)) {
            const updates = normalizeMovedSiblingOrders(draggedNode.id, intent, state.nodes);
            Object.entries(updates).forEach(([nodeId, nodeUpdates]) => updateNode(nodeId, nodeUpdates));
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
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div className="relative flex-1 flex min-w-0 bg-slate-50 overflow-hidden">
                <TaskZoneSourcePanel canCreateTask={canCreateTask} canMoveTask={canMoveTask} />
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
                        className={`scroll-container mobile-pan-surface flex-1 overflow-x-auto overflow-y-hidden ${compactClassNames.canvas} flex gap-[12px] items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent`}
                        data-mobile-pan-surface="board"
                    >
                        <SortableContext items={rootNodes.map(n => n.id)} strategy={horizontalListSortingStrategy}>
                            {rootNodes.map(node => (
                                <KanbanColumn
                                    key={node.id}
                                    nodeId={node.id}
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
                {activeDrag?.type === 'quick-capture-item' || activeDrag?.type === 'personal-task-zone-item' || activeDrag?.source === 'task-zone-my-task' ? (
                    <TaskDragOverlayPreview title={activeDrag.title || '未命名任務'} />
                ) : activeDrag?.node ? (
                    <TaskDragOverlayPreview
                        title={activeDrag.node.title || '未命名任務'}
                        widthClass={activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
