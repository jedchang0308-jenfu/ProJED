import React from 'react';
import { MoreHorizontal, Plus, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Card from './Card';
import useBoardStore from '../store/useBoardStore';
import dayjs from 'dayjs';

const List = ({ list }) => {
    const { statusFilters, activeWorkspaceId, activeBoardId, updateList, openModal } = useBoardStore();
    const isHidden = list.ganttVisible === false;
    const status = list.status || 'todo';

    // dnd-kit 列表拖動邏輯
    const {
        attributes: listAttributes,
        listeners: listListeners,
        setNodeRef: setListNodeRef,
        transform: listTransform,
        transition: listTransition,
        isDragging: isListDragging,
    } = useSortable({
        id: list.id,
        data: {
            type: 'list',
            list
        }
    });

    // dnd-kit 卡片拖放區域
    const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
        id: `${list.id}-drop`,
        data: {
            type: 'list',
            list
        }
    });

    const listStyle = {
        transform: CSS.Transform.toString(listTransform),
        transition: listTransition,
    };

    const filteredCards = (list.cards || []).filter(card => {
        const cStatus = card.status || 'todo';
        return statusFilters[cStatus];
    });


    return (
        <div
            ref={setListNodeRef}
            style={listStyle}
            className={`flex-shrink-0 w-[270px] flex flex-col max-h-full bg-slate-100/50 rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isListDragging ? 'opacity-50 shadow-2xl scale-105 rotate-1' : ''
                }`}
        >
            {/* List Header */}
            <div className="p-3 flex flex-col gap-2 group bg-white/40 hover:bg-white transition-colors">
                <div className="flex items-center gap-2">
                    {/* 列表拖動手柄 */}
                    <div
                        {...listAttributes}
                        {...listListeners}
                        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors p-1 -ml-1 touch-none"
                        onClick={(e) => e.stopPropagation()}
                        title="拖動列表"
                    >
                        <GripVertical size={16} />
                    </div>

                    {/* 列表標題區域 */}
                    <div
                        className="flex items-center justify-between flex-1 cursor-pointer"
                        onClick={() => openModal('list', list.id)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const nextStatus = { todo: 'delayed', delayed: 'completed', completed: 'onhold', onhold: 'unsure', unsure: 'todo' }[status];
                                    updateList(activeWorkspaceId, activeBoardId, list.id, { status: nextStatus });
                                }}
                                className={`w-2.5 h-2.5 rounded-full bg-status-${status} shrink-0 hover:scale-125 transition-transform shadow-sm`}
                                title="點擊切換狀態"
                            ></div>
                            <h3 className={`font-bold text-sm truncate ${status === 'todo' ? 'text-slate-700' : `text-status-${status}`}`}>
                                {list.title || '新列表'}
                            </h3>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateList(activeWorkspaceId, activeBoardId, list.id, { ganttVisible: !list.ganttVisible });
                                }}
                                className={`p-1.5 hover:bg-white rounded-lg text-slate-400 transition-colors ${isHidden ? 'text-slate-300 opacity-100' : ''}`}
                            >
                                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Summary Info */}
                <div className="flex items-center gap-3 text-[10px] text-slate-400 ml-7">
                    <div className="flex items-center gap-1">
                        <span className="font-bold">{filteredCards.length}</span>
                        <span>張卡片</span>
                    </div>
                    {list.startDate && list.endDate && (
                        <div className="flex items-center gap-1">
                            <span>{dayjs(list.startDate).format('MM/DD')}</span>
                            <span className="opacity-50">→</span>
                            <span>{dayjs(list.endDate).format('MM/DD')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Cards Drop Zone */}
            <div
                ref={setDropNodeRef}
                className={`flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin scrollbar-thumb-slate-200 transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''
                    }`}
            >
                <SortableContext items={filteredCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {filteredCards.map(card => (
                        <Card key={card.id} card={card} listId={list.id} />
                    ))}
                </SortableContext>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        const title = prompt("請輸入卡片名稱：", "新卡片");
                        if (title) {
                            const { addCard } = useBoardStore.getState();
                            addCard(activeWorkspaceId, activeBoardId, list.id, title);
                        }
                    }}
                    className="w-full py-2 px-3 border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white hover:border-primary hover:text-primary transition-all group mt-2"
                >
                    <Plus size={14} className="group-hover:scale-110 transition-transform" />
                    新增卡片
                </button>
            </div>
        </div>
    );
};

export default List;
