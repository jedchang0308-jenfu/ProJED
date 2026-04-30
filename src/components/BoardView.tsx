// @ts-nocheck
/**
 * BoardView — Kanban 看板視圖（WBS 版本）
 * 設計意圖：將資料來源從 useBoardStore (List/Card) 切換至 useWbsStore (TaskNode)。
 * 
 * 階層映射規則：
 * - Level 1 (根節點, parentId === null) → 列表欄 (KanbanColumn)
 * - Level 2 (根節點的子節點)            → 卡片 (KanbanCard)
 * - Level 3+ (更深子節點)               → 待辦清單 (KanbanChecklist)
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { GlobalContextMenu } from './GlobalContextMenu';
import { StatusFilterBar } from './ui/StatusFilterBar';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import type { TaskNode, TaskStatus } from '../types';

const BoardView = () => {
    const { activeBoardId, activeWorkspaceId, toggleStatusFilter, statusFilters } = useBoardStore();
    const addNode = useWbsStore(s => s.addNode);
    const updateNode = useWbsStore(s => s.updateNode);
    const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
    const sensors = useDragSensors();
    const [activeDrag, setActiveDrag] = useState<any>(null);
    const [previewNodes, setPreviewNodes] = useState<Record<string, TaskNode> | null>(null);
    const [previewParentIndex, setPreviewParentIndex] = useState<Record<string, string[]> | null>(null);
    const previewIntentRef = useRef<string | null>(null);

    const collisionDetection = useCallback((args: any) => {
        const pointerCollisions = pointerWithin(args);
        const collisions = pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
        const activeType = args.active?.data.current?.type;

        if (['wbs-column', 'wbs-card', 'wbs-checklist'].includes(activeType || '')) {
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
    const storeParentIndex = useWbsStore(s => s.parentNodesIndex);
    const effectiveNodes = previewNodes || storeNodes;
    const effectiveParentIndex = previewParentIndex || storeParentIndex;

    // 合併並排序根節點 (Level 1 = 列表欄)
    const rootNodes = useMemo(() => {
        const ids1 = ((previewParentIndex ? effectiveParentIndex['root'] : rootIds) || []).filter(id => {
            const n = effectiveNodes[id];
            return n && n.boardId === activeBoardId && !n.isArchived;
        });
        const ids2 = ((previewParentIndex ? effectiveParentIndex[activeBoardId || ''] : boardRootIds) || []).filter(id => {
            const n = effectiveNodes[id];
            return n && !n.isArchived;
        });
        // 合併去重
        const allIds = Array.from(new Set([...ids1, ...ids2]));
        return allIds
            .map(id => effectiveNodes[id])
            .filter(node => node && statusFilters[node.status || 'todo'])
            .sort((a, b) => a.order - b.order);
    }, [rootIds, boardRootIds, activeBoardId, statusFilters, effectiveNodes, effectiveParentIndex, previewParentIndex]);

    const statuses = [
        { key: 'todo', label: '待辦', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
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
     * 5. wbs-checklist → wbs-column (drop): 待辦升級為列表直接子節點（卡片級別）✨新增
     * 6. wbs-checklist → wbs-card-drop    : 待辦跨卡片移動 ✨新增
     * 7. wbs-checklist → wbs-checklist    : 同卡片內待辦排序 ✨新增
     */
    const handleDragStart = (event: any) => {
        const { active } = event;
        const nodeId = active.data.current?.nodeId;
        previewIntentRef.current = null;
        setPreviewNodes(null);
        setPreviewParentIndex(null);
        setActiveDrag({
            id: active.id,
            type: active.data.current?.type,
            node: nodeId ? useWbsStore.getState().nodes[nodeId] : null,
        });
    };

    const handleDragCancel = () => {
        previewIntentRef.current = null;
        setActiveDrag(null);
        setPreviewNodes(null);
        setPreviewParentIndex(null);
    };

    const clearDragPreview = () => {
        if (previewIntentRef.current === null) return;
        previewIntentRef.current = null;
        setPreviewNodes(null);
        setPreviewParentIndex(null);
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
        const nodes = nodesOverride || previewNodes || useWbsStore.getState().nodes;
        const parentIndex = parentIndexOverride || previewParentIndex || useWbsStore.getState().parentNodesIndex;
        const siblings = parentIndex[parentId] || [];

        return siblings.reduce((max, id) => {
            if (id === excludeId) return max;
            const node = nodes[id];
            return node ? Math.max(max, node.order) : max;
        }, -1) + 1;
    };

    const isDescendantOf = (nodeId: string, possibleAncestorId: string, nodesRecord?: Record<string, TaskNode>) => {
        const nodes = nodesRecord || previewNodes || useWbsStore.getState().nodes;
        let current = nodes[nodeId]?.parentId;

        while (current) {
            if (current === possibleAncestorId) return true;
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
                    ? targetNode.order - 0.5
                    : getAppendOrder(overData.nodeId, draggedNode.id, nodesRecord, parentIndex),
                nodeType: shouldBecomeTask ? 'task' : draggedNode.nodeType,
            };
        }

        if (targetType === 'wbs-card') {
            if (!targetNode) return null;
            return {
                parentId: targetNode.parentId,
                order: targetNode.order - 0.5,
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
                order: targetNode.order - 0.5,
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

    const applyDragPreview = (activeData: any, overData: any) => {
        const baseNodes = useWbsStore.getState().nodes;
        const draggedNode = baseNodes[activeData?.nodeId];
        if (!draggedNode || !overData || activeData.nodeId === overData.nodeId) {
            clearDragPreview();
            return;
        }

        const intent = getDropIntent(activeData, overData, baseNodes);
        if (!isValidDropIntent(draggedNode.id, intent, baseNodes)) {
            clearDragPreview();
            return;
        }

        const intentKey = [
            draggedNode.id,
            overData.type,
            overData.nodeId || '',
            intent.parentId || 'root',
            intent.order,
            intent.nodeType || '',
        ].join('|');

        if (previewIntentRef.current === intentKey) return;
        previewIntentRef.current = intentKey;

        const nextNodes = buildNodesWithMove(
            baseNodes,
            draggedNode.id,
            intent.parentId,
            intent.order,
            intent.nodeType,
        );

        setPreviewNodes(nextNodes);
        setPreviewParentIndex(buildPreviewParentIndex(nextNodes));
    };

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        if (!over || active.id === over.id) {
            clearDragPreview();
            return;
        }
        applyDragPreview(active.data.current, over.data.current);
    };

    const handleDragEnd = (event: any) => {
        previewIntentRef.current = null;
        setActiveDrag(null);
        setPreviewNodes(null);
        setPreviewParentIndex(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeData = active.data.current;
        const overData = over.data.current;
        const state = useWbsStore.getState();
        const draggedNode = state.nodes[activeData?.nodeId];
        const intent = getDropIntent(activeData, overData, state.nodes);

        if (draggedNode && isValidDropIntent(draggedNode.id, intent, state.nodes)) {
            const updates = normalizeMovedSiblingOrders(draggedNode.id, intent, state.nodes);
            Object.entries(updates).forEach(([nodeId, nodeUpdates]) => updateNode(nodeId, nodeUpdates));
            recalculateAncestorStatus(draggedNode.id);
        }
    };


    /** 新增頂層群組 (Level 1 → 新列表) */
    const handleAddColumn = () => {
        const newNode: TaskNode = {
            id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
            workspaceId: activeWorkspaceId || '',
            boardId: activeBoardId || '',
            parentId: null,
            title: '新群組',
            status: 'todo',
            nodeType: 'group',
            order: rootNodes.length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        addNode(newNode);
    };

    if (!activeBoardId) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                請選擇一個看板
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                {/* 工具列 (Toolbar) — 狀態篩選器 */}
                <div className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
                    <StatusFilterBar />
                </div>

                {/* 列表畫布 (Lists Canvas) */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <SortableContext items={rootNodes.map(n => n.id)} strategy={horizontalListSortingStrategy}>
                        {rootNodes.map(node => (
                            <KanbanColumn
                                key={node.id}
                                nodeId={node.id}
                                previewNodes={previewNodes}
                                previewParentIndex={previewParentIndex}
                            />
                        ))}
                    </SortableContext>

                    {/* 新增列表按鈕 */}
                    <div className="flex-shrink-0 w-[260px]">
                        <button
                            onClick={handleAddColumn}
                            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 font-bold hover:border-primary hover:text-primary hover:bg-slate-50 transition-all group"
                        >
                            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                            <span>新增群組</span>
                        </button>
                    </div>
                </div>
            </div>
            <DragOverlay dropAnimation={null}>
                {activeDrag?.node ? (
                    <div className={`rounded-lg border border-primary/30 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-lg will-change-transform ${
                        activeDrag.type === 'wbs-column' ? 'w-[270px]' : 'w-[240px]'
                    }`}>
                        {activeDrag.node.title || 'Untitled'}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default BoardView;
