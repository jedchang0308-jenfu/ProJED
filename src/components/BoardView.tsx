/**
 * BoardView — Kanban 看板視圖（WBS 版本）
 * 設計意圖：將資料來源從 useBoardStore (List/Card) 切換至 useWbsStore (TaskNode)。
 * 
 * 階層映射規則：
 * - Level 1 (根節點, parentId === null) → 列表欄 (KanbanColumn)
 * - Level 2 (根節點的子節點)            → 卡片 (KanbanCard)
 * - Level 3+ (更深子節點)               → 待辦清單 (KanbanChecklist)
 */
import React, { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
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

    // 訂閱 root index 與 boardId index 以取得此看板的 Level 1 根節點
    const rootIds = useWbsStore(s => s.parentNodesIndex['root']);
    const boardRootIds = useWbsStore(s => s.parentNodesIndex[activeBoardId || '']);

    // 合併並排序根節點 (Level 1 = 列表欄)
    const rootNodes = useMemo(() => {
        const state = useWbsStore.getState();
        const ids1 = (rootIds || []).filter(id => {
            const n = state.nodes[id];
            return n && n.boardId === activeBoardId && !n.isArchived;
        });
        const ids2 = (boardRootIds || []).filter(id => {
            const n = state.nodes[id];
            return n && !n.isArchived;
        });
        // 合併去重
        const allIds = Array.from(new Set([...ids1, ...ids2]));
        return allIds
            .map(id => state.nodes[id])
            .filter(Boolean)
            .sort((a, b) => a.order - b.order);
    }, [rootIds, boardRootIds, activeBoardId]);

    const statuses = [
        { key: 'todo', label: '進行中', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    /**
     * 拖曳結束處理
     * 設計意圖：
     * - 卡片 (wbs-card) 跨列拖曳 → 改變 parentId（移到另一個 Level 1 群組下）
     * - 列表 (wbs-column) 拖曳 → 重新排序（交換 order 值）
     */
    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        // 卡片跨列拖曳
        if (activeData?.type === 'wbs-card') {
            const draggedNodeId = activeData.nodeId;
            const sourceColumnId = activeData.columnId;

            // 判斷目標是列表還是卡片
            let targetColumnId: string | null = null;
            if (overData?.type === 'wbs-column') {
                targetColumnId = overData.nodeId;
            } else if (overData?.type === 'wbs-card') {
                targetColumnId = overData.columnId;
            }

            if (targetColumnId && sourceColumnId !== targetColumnId) {
                // 跨列移動：改變此卡片的 parentId
                updateNode(draggedNodeId, { parentId: targetColumnId, updatedAt: Date.now() });
                // 觸發新舊父節點的 Roll-up 重新計算
                recalculateAncestorStatus(draggedNodeId);
            } else if (targetColumnId && sourceColumnId === targetColumnId && overData?.type === 'wbs-card') {
                // 同列內重新排序：交換 order
                const state = useWbsStore.getState();
                const draggedNode = state.nodes[draggedNodeId];
                const targetNode = state.nodes[overData.nodeId];
                if (draggedNode && targetNode && draggedNode.id !== targetNode.id) {
                    const tempOrder = draggedNode.order;
                    updateNode(draggedNodeId, { order: targetNode.order });
                    updateNode(overData.nodeId, { order: tempOrder });
                }
            }
        }

        // 列表排序
        if (activeData?.type === 'wbs-column' && overData?.type === 'wbs-column') {
            if (active.id !== over.id) {
                const state = useWbsStore.getState();
                const draggedNode = state.nodes[activeData.nodeId];
                const targetNode = state.nodes[overData.nodeId];
                if (draggedNode && targetNode) {
                    const tempOrder = draggedNode.order;
                    updateNode(activeData.nodeId, { order: targetNode.order });
                    updateNode(overData.nodeId, { order: tempOrder });
                }
            }
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
            collisionDetection={pointerWithin}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                {/* 工具列 (Toolbar) — 狀態篩選器 */}
                <div className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-2">
                        {statuses.map(s => (
                            <button
                                key={s.key}
                                onClick={() => toggleStatusFilter(s.key)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all whitespace-nowrap ${
                                    statusFilters[s.key]
                                        ? 'bg-white border-slate-200 text-slate-700 shadow-sm'
                                        : 'bg-slate-50 border-transparent text-slate-300 scale-95 opacity-50'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full ${s.color}`}></div>
                                <span className="text-[10px] sm:text-xs font-bold">{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 列表畫布 (Lists Canvas) */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <SortableContext items={rootNodes.map(n => n.id)} strategy={horizontalListSortingStrategy}>
                        {rootNodes.map(node => (
                            <KanbanColumn key={node.id} nodeId={node.id} />
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
        </DndContext>
    );
};

export default BoardView;
