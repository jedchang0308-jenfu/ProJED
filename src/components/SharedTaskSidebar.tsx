import { useState } from 'react';
import useDialogStore from '../store/useDialogStore';
import { useWbsStore } from '../store/useWbsStore';
import useBoardStore from '../store/useBoardStore';
import { ChevronLeft, ChevronRight, ChevronDown, Folder, FileText, GripVertical, Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';

interface SortableSidebarRowProps { item: any; onClick: (item: any) => void; rowHeight: number; onAddChild?: (item: any) => void; onToggleCollapse?: (id: string) => void; isCollapsed?: boolean; }
const SortableSidebarRow = ({ item, onClick, rowHeight, onAddChild, onToggleCollapse, isCollapsed }: SortableSidebarRowProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        data: { item }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        height: rowHeight,
        paddingLeft: Math.max(12, 12 + (item.level * 16)),
        position: 'relative' as any,
        zIndex: isDragging ? 50 : 1,
    };

    const isGroup = item.nodeType === 'group';
    const isTask = item.nodeType === 'task';
    const isMilestone = item.nodeType === 'milestone';
    
    const childIds = useWbsStore(s => s.parentNodesIndex[item.id]);
    const hasChildren = childIds && childIds.length > 0;

    // 全域 Context Menu
    const setContextMenuState = useBoardStore(s => s.setContextMenuState);

    return (
        <div
            ref={setNodeRef}
            style={style}
            onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuState({ isOpen: true, x: e.clientX, y: e.clientY, nodeId: item.id, title: item.title });
            }}
            className={`flex items-center px-4 border-b border-slate-50 hover:bg-slate-50 transition-colors gap-1 cursor-pointer group
                ${isGroup ? 'font-black text-slate-800' : isTask && item.level === 1 ? 'font-bold text-slate-700' : 'text-slate-500'}
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
                {isGroup && <Folder size={14} className="text-primary/70" />}
                {(isTask || isMilestone) && item.level <= 1 && <FileText size={12} className="text-slate-400" />}
                {(isTask || isMilestone) && item.level > 1 && <div className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1" />}
            </div>
            <span className={`truncate ${item.level === 0 ? 'text-[13px]' : item.level === 1 ? 'text-[11px]' : 'text-[10px]'}`}>
                {item.title}
            </span>
            {onAddChild && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddChild(item);
                    }}
                    className="ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 transition-all hover:text-primary z-50"
                    title="新增子項目"
                >
                    <Plus size={12} />
                </button>
            )}
        </div>
    );
};

interface SharedTaskSidebarProps { flattenedItems: any[]; collapsedIds: any; toggleCollapse: (id: string) => void; onItemClick: (item: any) => void; isTaskListOpen: boolean; setIsTaskListOpen: (isOpen: boolean) => void; rowHeight?: number; }
const SharedTaskSidebar = ({
    flattenedItems,
    collapsedIds,
    toggleCollapse,
    onItemClick,
    isTaskListOpen,
    setIsTaskListOpen,
    rowHeight = 28
}: SharedTaskSidebarProps) => {
    const { activeWorkspaceId, activeBoardId } = useBoardStore();
    const addNode = useWbsStore(s => s.addNode);
    const updateNode = useWbsStore(s => s.updateNode);

    const sensors = useDragSensors();
    const [activeSortableItem, setActiveSortableItem] = useState(null);

    const handleSortableDragEnd = (event: any) => {
        const { active, over } = event;
        setActiveSortableItem(null);
        if (!over || active.id === over.id || !activeBoardId) return;

        const activeItem = active.data.current?.item;
        const overItem = over.data.current?.item;
        if (!activeItem || !overItem) return;

        if (activeItem.parentId === overItem.parentId) {
            // 同層級交換順序
            const tempOrder = activeItem.order;
            updateNode(activeItem.id, { order: overItem.order });
            updateNode(overItem.id, { order: tempOrder });
        } else {
            // 跨層級移動
            updateNode(activeItem.id, { parentId: overItem.parentId, order: overItem.order + 0.5 });
        }
    };

    const handleAddList = async () => {
        const title = await useDialogStore.getState().showPrompt("請輸入群組名稱：", "新群組");
        if (title && title.trim() && activeWorkspaceId && activeBoardId) {
            addNode({
                id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
                workspaceId: activeWorkspaceId,
                boardId: activeBoardId,
                parentId: null,
                title: title.trim(),
                status: 'todo',
                nodeType: 'group',
                order: flattenedItems.length,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    };

    const handleAddChild = async (item: any) => {
        const { showPrompt } = useDialogStore.getState();
        const title = await showPrompt("請輸入子項目名稱：", "新子項目");
        if (title && title.trim() && activeWorkspaceId && activeBoardId) {
            addNode({
                id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
                workspaceId: activeWorkspaceId,
                boardId: activeBoardId,
                parentId: item.id,
                title: title.trim(),
                status: 'todo',
                nodeType: item.level === 0 ? 'task' : 'task', // 預設新增子任務
                order: 999, // default to end
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    };

    return (
        <div className={`flex-shrink-0 flex flex-col border-r border-slate-200 bg-white z-20 transition-all duration-300 ease-in-out relative ${isTaskListOpen ? 'w-64' : 'w-10'}`}>
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
                                items={flattenedItems.map((i: any) => i.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div>
                                    {flattenedItems.map((item: any) => (
                                        <SortableSidebarRow
                                            key={`${item.nodeType}-${item.id}`}
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
                                            onAddChild={handleAddChild}
                                            onToggleCollapse={toggleCollapse}
                                            isCollapsed={collapsedIds.has((activeSortableItem as any).id)}
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
                                <span>新增頂層群組</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SharedTaskSidebar;
