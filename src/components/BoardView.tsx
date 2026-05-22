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
import { Plus, GitBranch } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import { GlobalContextMenu } from './GlobalContextMenu';
import { StatusFilterBar } from './ui/StatusFilterBar';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import useDialogStore from '../store/useDialogStore';
import { KanbanColumn } from './Wbs/KanbanColumn';
import type { TaskNode, TaskStatus } from '../types';

/**
 * 依賴關係選取 Context—讓 KanbanCard 能存取当前選取狀態與處理函式
 * 設計意圖：複用 WbsListView 的依賴模块，但適用於看板的 UI 互動模式。
 */
export const KanbanDependencyContext = React.createContext<{
    dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
    handleKanbanDependencySelect: (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => void;
    dependencies: import('../types').Dependency[];
} | null>(null);

const BoardView = () => {
    const { activeBoardId, activeWorkspaceId, toggleStatusFilter, statusFilters } = useBoardStore();
    const dependencySelection = useBoardStore(s => s.dependencySelection);
    const setDependencySelection = useBoardStore(s => s.setDependencySelection);
    const toggleStartDate = useBoardStore(s => s.toggleStartDate);
    const showStartDate = useBoardStore(s => s.showStartDate);
    const { addDependency, dependencies } = useWbsStore();
    const addNode = useWbsStore(s => s.addNode);
    const updateNode = useWbsStore(s => s.updateNode);
    const recalculateAncestorStatus = useWbsStore(s => s.recalculateAncestorStatus);
    const sensors = useDragSensors();
    const [activeDrag, setActiveDrag] = useState<any>(null);
    const [previewNodes, setPreviewNodes] = useState<Record<string, TaskNode> | null>(null);
    const [previewParentIndex, setPreviewParentIndex] = useState<Record<string, string[]> | null>(null);
    const previewIntentRef = useRef<string | null>(null);

    // ===== 依賴關係選取邏輯 =====
    const handleKanbanDependencySelect = React.useCallback(async (targetId: string, targetSide: 'start' | 'end', targetTitle: string) => {
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
    }, [dependencySelection, dependencies, addDependency, setDependencySelection, showStartDate, toggleStartDate]);

    // ESC 取消選取模式
    React.useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDependencySelection(null); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [setDependencySelection]);

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
        <KanbanDependencyContext.Provider value={{ dependencySelection, handleKanbanDependencySelect, dependencies }}>
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                {/* 工具列 (Toolbar) — 狀態篩選器 */}
                <div className="border-b border-slate-200 bg-white/50 px-3 py-2 backdrop-blur-sm shrink-0 sm:h-12 sm:px-4 sm:py-0 sm:flex sm:items-center sm:justify-between">
                    <div className="overflow-x-auto pb-1 sm:pb-0">
                        <StatusFilterBar />
                    </div>
                </div>

                {/* 依賴關係選取模式橫幅 */}
                {dependencySelection && (
                    <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
                            <span>
                                選取模式：已選取 <strong className="text-amber-800">[{dependencySelection.title}]</strong> 的
                                <span className={`mx-1 px-1.5 py-0.5 rounded text-[11px] font-black ${dependencySelection.side === 'start' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {dependencySelection.side === 'start' ? '開始日' : '結束日'}
                                </span>
                                — 請點擊另一張卡片的日期標籤作為依賴目標
                            </span>
                        </div>
                        <button
                            onClick={() => setDependencySelection(null)}
                            className="text-amber-500 hover:text-amber-700 text-xs font-bold px-2 py-1 rounded hover:bg-amber-100 transition-colors flex-shrink-0"
                        >
                            取消 (ESC)
                        </button>
                    </div>
                )}

                {/* 列表畫布 (Lists Canvas) */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto p-3 flex flex-col gap-3 items-stretch scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent sm:overflow-x-auto sm:overflow-y-hidden sm:p-4 sm:flex-row sm:gap-4 sm:items-start">
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
                    <div className="w-full flex-shrink-0 sm:w-[260px]">
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
        </KanbanDependencyContext.Provider>
    );
};

export default BoardView;
