import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Calendar, X } from 'lucide-react';
import dayjs from 'dayjs';

/**
 * 可拖動的待辦清單項目組件
 */
const SortableChecklistItem = ({
    item,
    workspaceId,
    boardId,
    listId,
    cardId,
    checklistId,
    updateChecklistItem,
    removeChecklistItem,
    openModal
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: item.id,
        data: {
            type: 'checklistitem',
            item,
            checklistId
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 group py-0.5 border-b border-transparent hover:border-slate-50 transition-colors ${isDragging ? 'opacity-50 bg-slate-50 rounded' : ''
                }`}
        >
            {/* 拖動手柄 */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
                title="拖動項目"
            >
                <GripVertical size={14} />
            </div>

            {/* Checkbox */}
            <input
                type="checkbox"
                checked={item.status === 'completed'}
                onChange={(e) => {
                    e.stopPropagation();
                    updateChecklistItem(workspaceId, boardId, listId, cardId, checklistId, item.id, {
                        status: e.target.checked ? 'completed' : 'todo'
                    });
                }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0"
            />

            {/* 項目內容 */}
            <div
                className="flex-1 cursor-pointer"
                onClick={() => openModal('checklistitem', item.id, listId, { cardId, checklistId })}
            >
                <span className={`text-xs line-clamp-1 ${item.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-600 font-medium'}`}>
                    {item.title || '待辦事項內容...'}
                </span>
            </div>

            {/* 日期與刪除按鈕 */}
            <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {(item.startDate || item.endDate) && (
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        <Calendar size={10} />
                        <span>{item.startDate ? dayjs(item.startDate).format('MM/DD') : '...'}</span>
                        <span>→</span>
                        <span>{item.endDate ? dayjs(item.endDate).format('MM/DD') : '...'}</span>
                    </div>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeChecklistItem(workspaceId, boardId, listId, cardId, checklistId, item.id);
                    }}
                    className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-400 rounded transition-all"
                >
                    <X size={12} />
                </button>
            </div>
        </div>
    );
};

export default SortableChecklistItem;
