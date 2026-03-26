import React, { useState } from 'react';
import useBoardStore from '../store/useBoardStore';
import useDialogStore from '../store/useDialogStore';
import { ChevronLeft, ChevronRight, ChevronDown, Folder, FileText, GripVertical, Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';

const SortableSidebarRow = ({ item, onClick, rowHeight, onAddChild, onToggleCollapse, isCollapsed }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        data: { type: item.type, item }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        height: rowHeight,
        paddingLeft: item.type === 'list' ? 12 : (item.type === 'card' ? 24 : 40),
        position: 'relative',
        zIndex: isDragging ? 50 : 1,
    };

    const hasChildren = item.type === 'list' || item.type === 'card';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center px-4 border-b border-slate-50 hover:bg-slate-50 transition-colors gap-1 cursor-pointer group
                ${item.type === 'list' ? 'font-black text-slate-800' : item.type === 'card' ? 'font-bold text-slate-700' : 'text-slate-500 italic'}
                ${isDragging ? 'opacity-50 bg-slate-100' : ''}`}
            onClick={() => onClick(item)}
            {...attributes}
            {...listeners}
        >
            <div className="flex-shrink-0 absolute left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical size={12} className="text-slate-400" />
            </div>
            {hasChildren && onToggleCollapse ? (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse(item.id);
                    }}
                    className="flex-shrink-0 p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-all"
                    title={isCollapsed ? '展開' : '收疊'}
                >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
            ) : (
                <div className="flex-shrink-0 w-[18px]" />
            )}
            <div className="flex-shrink-0">
                {item.type === 'list' && <Folder size={14} className="text-primary/70" />}
                {item.type === 'card' && <FileText size={12} className="text-slate-400" />}
                {item.type === 'checklist' && <div className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />}
            </div>
            <span className={`truncate ${item.type === 'list' ? 'text-[13px]' : item.type === 'card' ? 'text-[11px]' : 'text-[10px]'}`}>
                {item.title}
            </span>
            {(item.type === 'list' || item.type === 'card') && onAddChild && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddChild(item);
                    }}
                    className="ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 transition-all hover:text-primary z-50"
                    title={item.type === 'list' ? "新增卡片" : "新增待辦項目"}
                >
                    <Plus size={12} />
                </button>
            )}
        </div>
    );
};

const SharedTaskSidebar = ({
    flattenedItems,
    collapsedIds,
    toggleCollapse,
    onItemClick,
    isTaskListOpen,
    setIsTaskListOpen,
    rowHeight = 28
}) => {
    const {
        activeWorkspaceId,
        activeBoardId,
        workspaces,
        reorderLists,
        moveCardToList,
        reorderCardsInList,
        moveChecklistItemToCard,
        reorderChecklistItems,
        addList,
        addCard,
        addChecklist,
        addChecklistItem,
        updateChecklistItem
    } = useBoardStore();

    const sensors = useDragSensors();
    const [activeSortableItem, setActiveSortableItem] = useState(null);

    const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
    const activeBoard = activeWs?.boards.find(b => b.id === activeBoardId);

    const handleSortableDragEnd = (event) => {
        const { active, over } = event;
        setActiveSortableItem(null);
        if (!over || active.id === over.id || !activeBoard) return;

        const activeItem = active.data.current?.item;
        const overItem = over.data.current?.item;
        if (!activeItem || !overItem) return;

        if (activeItem.type === 'list') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            reorderLists(activeWorkspaceId, activeBoardId, activeItem.id, targetListId);
        } else if (activeItem.type === 'card') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            if (activeItem.listId === targetListId) {
                const targetCardId = overItem.type === 'card' ? overItem.id : (overItem.type === 'checklist' ? overItem.cardId : null);
                if (targetCardId) {
                    reorderCardsInList(activeWorkspaceId, activeBoardId, activeItem.listId, activeItem.id, targetCardId);
                } else {
                    moveCardToList(activeWorkspaceId, activeBoardId, activeItem.id, activeItem.listId, targetListId, 0);
                }
            } else {
                let targetIndex = null;
                // Bugfix: 使用 activeBoard.lists 原始陣列取得 card index，而非 flattenedItems 視圖陣列
                const targetList = activeBoard.lists.find(l => l.id === targetListId);
                const targetListCards = targetList?.cards || [];
                
                if (overItem.type === 'card') {
                    targetIndex = targetListCards.findIndex(c => c.id === overItem.id);
                } else if (overItem.type === 'checklist') {
                    targetIndex = targetListCards.findIndex(c => c.id === overItem.cardId) + 1;
                }
                
                moveCardToList(activeWorkspaceId, activeBoardId, activeItem.id, activeItem.listId, targetListId, targetIndex !== -1 ? targetIndex : 0);
            }
        } else if (activeItem.type === 'checklist') {
            const targetListId = overItem.type === 'list' ? overItem.id : overItem.listId;
            const targetCardId = overItem.type === 'list' ? null : (overItem.type === 'card' ? overItem.id : overItem.cardId);
            
            if (!targetCardId) return;

            if (activeItem.cardId === targetCardId) {
                const targetChecklistItemId = overItem.type === 'checklist' ? overItem.id : null;
                if (targetChecklistItemId) {
                    reorderChecklistItems(activeWorkspaceId, activeBoardId, activeItem.listId, activeItem.cardId, activeItem.checklistId, activeItem.id, targetChecklistItemId);
                }
            } else {
                let targetIndex = null;
                // Bugfix: 從原始資料取得 checklists
                const targetList = activeBoard.lists.find(l => l.id === targetListId);
                const targetCard = targetList?.cards?.find(c => c.id === targetCardId);
                // 為了簡化，因為原本邏輯是找同卡片下的 checklist 項目位置
                const targetChecklist = targetCard?.checklists?.[0]; // 預設移到第一個檢查表
                const targetItems = targetChecklist?.items || [];

                if (overItem.type === 'checklist') {
                    targetIndex = targetItems.findIndex(i => i.id === overItem.id);
                }
                moveChecklistItemToCard(activeWorkspaceId, activeBoardId, activeItem.id, activeItem.listId, activeItem.cardId, activeItem.checklistId, targetListId, targetCardId, targetIndex !== -1 ? targetIndex : null);
            }
        }
    };

    const handleAddList = async () => {
        const title = await useDialogStore.getState().showPrompt("請輸入列表名稱：", "新列表");
        if (title && title.trim()) {
            addList(activeWorkspaceId, activeBoardId, title.trim());
        }
    };

    const handleAddChild = async (item) => {
        const { showPrompt } = useDialogStore.getState();
        
        if (item.type === 'list') {
            const title = await showPrompt("請輸入卡片名稱：", "新卡片");
            if (title && title.trim()) {
                addCard(activeWorkspaceId, activeBoardId, item.id, title.trim());
            }
        } else if (item.type === 'card') {
            const title = await showPrompt("請輸入待辦項目名稱：", "新項目");
            if (title !== null) {
                let clId = item.checklists?.[0]?.id;
                if (!clId) {
                    addChecklist(activeWorkspaceId, activeBoardId, item.listId, item.id);
                    const latestBoard = useBoardStore.getState().getActiveBoard();
                    const latestCard = latestBoard?.lists.find(l => l.id === item.listId)?.cards.find(c => c.id === item.id);
                    clId = latestCard?.checklists?.[0]?.id;
                }
                
                if (clId) {
                    addChecklistItem(activeWorkspaceId, activeBoardId, item.listId, item.id, clId);
                    if (title.trim()) {
                        const updatedBoard = useBoardStore.getState().getActiveBoard();
                        const updatedCard = updatedBoard?.lists.find(l => l.id === item.listId)?.cards.find(c => c.id === item.id);
                        const newestItem = updatedCard?.checklists?.[0]?.items?.slice(-1)[0];
                        if (newestItem) {
                            updateChecklistItem(activeWorkspaceId, activeBoardId, item.listId, item.id, clId, newestItem.id, { title: title.trim() });
                        }
                    }
                }
            }
        }
    };

    return (
        <div
            className={`flex-shrink-0 flex flex-col border-r border-slate-200 bg-white z-20 transition-all duration-300 ease-in-out relative ${isTaskListOpen ? 'w-64' : 'w-10'}`}
        >
            {!isTaskListOpen ? (
                <div className="flex-1 flex flex-col items-center pt-4 gap-4 overflow-hidden">
                    <button
                        onClick={() => setIsTaskListOpen(true)}
                        className="p-1.5 hover:bg-slate-100 rounded-full text-primary transition-colors"
                        title="展開任務清單"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <div className="h-full w-px bg-slate-100" />
                </div>
            ) : (
                <>
                    <div className="h-10 flex items-center justify-between px-4 border-b-2 border-slate-200 bg-slate-50 font-bold text-xs text-slate-500 uppercase tracking-wider shrink-0">
                        <span>任務名稱</span>
                        <button
                            onClick={() => setIsTaskListOpen(false)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                            title="收疊任務清單"
                        >
                            <ChevronLeft size={14} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCorners}
                            onDragStart={(e) => setActiveSortableItem(e.active.data.current?.item)}
                            onDragEnd={handleSortableDragEnd}
                        >
                            <SortableContext
                                items={flattenedItems.map(i => i.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div>
                                    {flattenedItems.map((item) => (
                                        <SortableSidebarRow
                                            key={`${item.type}-${item.id}`}
                                            item={item}
                                            onClick={onItemClick}
                                            onToggleCollapse={toggleCollapse}
                                            isCollapsed={collapsedIds.has(item.id)}
                                            onAddChild={handleAddChild}
                                            rowHeight={rowHeight}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                                {activeSortableItem ? (
                                    <div className="opacity-90 shadow-xl border border-primary/20 bg-white rounded-md overflow-hidden ring-2 ring-primary/20 cursor-grabbing">
                                        <SortableSidebarRow
                                            item={activeSortableItem}
                                            onClick={() => {}}
                                            isCollapsed={collapsedIds.has(activeSortableItem.id)}
                                            rowHeight={rowHeight}
                                        />
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                        
                        <div className="px-4 py-3">
                            <button
                                onClick={handleAddList}
                                className="w-full py-2 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-400 hover:text-primary hover:bg-primary/5 border border-dashed border-slate-200 hover:border-primary/30 rounded-lg transition-all"
                            >
                                <Plus size={14} />
                                <span>新增列表</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SharedTaskSidebar;
