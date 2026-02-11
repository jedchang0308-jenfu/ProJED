import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, pointerWithin } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDragSensors } from '../hooks/useDragSensors';
import useBoardStore from '../store/useBoardStore';
import List from './List';
import Card from './Card';


const BoardView = () => {
    const { getActiveBoard, setView, toggleStatusFilter, statusFilters, workspaces, activeWorkspaceId, activeBoardId, setWorkspaces } = useBoardStore();
    const board = getActiveBoard();
    const sensors = useDragSensors();
    const [activeCard, setActiveCard] = useState(null);
    const [activeList, setActiveList] = useState(null);

    if (!board) return (
        <div className="flex-1 flex items-center justify-center text-slate-400">
            請選擇一個看板
        </div>
    );

    const statuses = [
        { key: 'todo', label: '進行中', color: 'bg-status-todo' },
        { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
        { key: 'completed', label: '完成', color: 'bg-status-completed' },
        { key: 'unsure', label: '不確定', color: 'bg-status-unsure' },
        { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
    ];

    // 拖動開始
    const handleDragStart = (event) => {
        const { active } = event;
        if (active.data.current?.type === 'card') {
            setActiveCard(active.data.current.card);
        } else if (active.data.current?.type === 'list') {
            setActiveList(active.data.current.list);
        }
    };

    // 拖動結束
    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (!over) {
            setActiveCard(null);
            setActiveList(null);
            return;
        }

        const activeData = active.data.current;
        const overData = over.data.current;

        // 列表拖動邏輯
        if (activeData?.type === 'list' && overData?.type === 'list') {
            if (active.id !== over.id) {
                reorderLists(active.id, over.id);
            }
        }
        // 卡片拖動邏輯
        else if (activeData?.type === 'card') {
            const sourceListId = activeData.listId;
            let targetListId;

            // 判斷目標是列表還是卡片
            if (overData?.type === 'list') {
                targetListId = overData.list.id;
            } else if (overData?.type === 'card') {
                targetListId = overData.listId;
            } else {
                setActiveCard(null);
                setActiveList(null);
                return;
            }

            if (sourceListId !== targetListId) {
                // 跨列表移動
                moveCardToList(activeData.card.id, sourceListId, targetListId);
            } else {
                // 同列表內重新排序
                if (overData?.type === 'card') {
                    reorderCardsInList(sourceListId, active.id, over.id);
                }
            }
        }

        setActiveCard(null);
        setActiveList(null);
    };

    // 跨列表移動卡片
    const moveCardToList = (cardId, sourceListId, targetListId) => {
        const newWorkspaces = workspaces.map(ws => {
            if (ws.id !== activeWorkspaceId) return ws;

            return {
                ...ws,
                boards: ws.boards.map(b => {
                    if (b.id !== activeBoardId) return b;

                    const sourceList = b.lists.find(l => l.id === sourceListId);
                    const card = sourceList?.cards.find(c => c.id === cardId);

                    if (!card) return b;

                    return {
                        ...b,
                        lists: b.lists.map(l => {
                            if (l.id === sourceListId) {
                                return { ...l, cards: l.cards.filter(c => c.id !== cardId) };
                            }
                            if (l.id === targetListId) {
                                return { ...l, cards: [...l.cards, card] };
                            }
                            return l;
                        })
                    };
                })
            };
        });

        setWorkspaces(newWorkspaces);
    };

    // 同列表內重新排序
    const reorderCardsInList = (listId, activeId, overId) => {
        const newWorkspaces = workspaces.map(ws => {
            if (ws.id !== activeWorkspaceId) return ws;

            return {
                ...ws,
                boards: ws.boards.map(b => {
                    if (b.id !== activeBoardId) return b;

                    return {
                        ...b,
                        lists: b.lists.map(l => {
                            if (l.id !== listId) return l;

                            const oldIndex = l.cards.findIndex(c => c.id === activeId);
                            const newIndex = l.cards.findIndex(c => c.id === overId);

                            return {
                                ...l,
                                cards: arrayMove(l.cards, oldIndex, newIndex)
                            };
                        })
                    };
                })
            };
        });

        setWorkspaces(newWorkspaces);
    };

    // 列表重新排序
    const reorderLists = (activeId, overId) => {
        const newWorkspaces = workspaces.map(ws => {
            if (ws.id !== activeWorkspaceId) return ws;

            return {
                ...ws,
                boards: ws.boards.map(b => {
                    if (b.id !== activeBoardId) return b;

                    const oldIndex = b.lists.findIndex(l => l.id === activeId);
                    const newIndex = b.lists.findIndex(l => l.id === overId);

                    return {
                        ...b,
                        lists: arrayMove(b.lists, oldIndex, newIndex)
                    };
                })
            };
        });

        setWorkspaces(newWorkspaces);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
                {/* Subheader / Toolbar */}
                <div className="h-12 border-b border-slate-200 bg-white/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar py-2">
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
                </div>

                {/* Lists Canvas */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 items-start scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <SortableContext items={(board.lists || []).map(l => l.id)} strategy={horizontalListSortingStrategy}>
                        {(board.lists || []).map(list => (
                            <List key={list.id} list={list} />
                        ))}
                    </SortableContext>

                    {/* Add List Button Container */}
                    <div className="flex-shrink-0 w-[260px]">
                        <button
                            onClick={() => {
                                const title = prompt("請輸入列表名稱：", "新列表");
                                if (title) {
                                    useBoardStore.getState().addList(board.workspaceId || activeWorkspaceId, board.id, title);
                                }
                            }}
                            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 font-bold hover:border-primary hover:text-primary hover:bg-slate-50 transition-all group"
                        >
                            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                            <span>新增列表</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 拖動預覽層 */}
            <DragOverlay>
                {activeCard ? (
                    <div className="opacity-90 rotate-3 scale-105">
                        <Card card={activeCard} listId="" />
                    </div>
                ) : activeList ? (
                    <div className="opacity-90 rotate-2 scale-105">
                        <List list={activeList} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default BoardView;
