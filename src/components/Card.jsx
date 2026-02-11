import React from 'react';
import { GripVertical, Eye, EyeOff, Calendar, CheckSquare } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useBoardStore from '../store/useBoardStore';
import dayjs from 'dayjs';

const Card = ({ card, listId }) => {
    const { openModal, updateCard, activeWorkspaceId, activeBoardId } = useBoardStore();
    const isHidden = card.ganttVisible === false;
    const status = card.status || 'todo';

    // dnd-kit 拖動邏輯
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: card.id,
        data: {
            type: 'card',
            card,
            listId
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Logic for display status (from legacy)
    const displayStatus = (card.title && card.title.includes('答辯') && status === 'todo') ? 'unsure' : status;

    const getStatusColorClass = (s) => {
        switch (s) {
            case 'todo': return 'text-slate-600';
            case 'delayed': return 'text-orange-500';
            case 'completed': return 'text-emerald-500';
            case 'unsure': return 'text-purple-500';
            case 'onhold': return 'text-slate-300';
            default: return 'text-slate-600';
        }
    };

    // 計算待辦清單進度
    const getChecklistProgress = () => {
        if (!card.checklists || card.checklists.length === 0) return null;
        const totalItems = card.checklists.reduce((sum, cl) => sum + (cl.items?.length || 0), 0);
        const completedItems = card.checklists.reduce((sum, cl) =>
            sum + (cl.items?.filter(i => i.status === 'completed').length || 0), 0);
        return { total: totalItems, completed: completedItems };
    };

    const checklistProgress = getChecklistProgress();

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary hover:shadow-md transition-all group mb-2 ${isDragging ? 'opacity-50 shadow-2xl scale-105 rotate-2' : ''
                }`}
        >
            <div className="flex items-start gap-2 p-2.5">
                {/* 拖動手柄 */}
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors p-1 -ml-1 -mt-1 touch-none"
                    onClick={(e) => e.stopPropagation()}
                    title="拖動卡片"
                >
                    <GripVertical size={16} />
                </div>

                {/* 卡片內容 */}
                <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openModal('card', card.id, listId)}
                >
                    <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-sm font-semibold leading-tight flex-1 ${getStatusColorClass(displayStatus)}`}>
                            {card.title || '無標題卡片'}
                        </h4>
                        <button
                            className={`opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 rounded transition-all ${isHidden ? 'text-slate-300 opacity-100' : 'text-slate-400'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateCard(activeWorkspaceId, activeBoardId, listId, card.id, { ganttVisible: !card.ganttVisible });
                            }}
                        >
                            {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>

                    {/* 日期與待辦清單資訊 */}
                    {(card.startDate || card.endDate || checklistProgress) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-slate-400">
                            {(card.startDate || card.endDate) && (
                                <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                    <Calendar size={10} />
                                    <span>{card.startDate ? dayjs(card.startDate).format('MM/DD') : '...'}</span>
                                    <span className="opacity-50">→</span>
                                    <span>{card.endDate ? dayjs(card.endDate).format('MM/DD') : '...'}</span>
                                </div>
                            )}
                            {checklistProgress && checklistProgress.total > 0 && (
                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${checklistProgress.completed === checklistProgress.total
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                        : 'bg-slate-50 border-slate-100'
                                    }`}>
                                    <CheckSquare size={10} />
                                    <span className="font-bold">{checklistProgress.completed}/{checklistProgress.total}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Card;
