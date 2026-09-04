import { useState } from 'react';
import { useWbsStore } from '../store/useWbsStore';
import useBoardStore from '../store/useBoardStore';
import { ChevronLeft, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { COMPACT_DIMENSIONS } from './ui/compactTokens';
import type { TaskNode } from '../types';
import { prepareNewTaskNaming } from '../utils/taskInteractions';
import { useTaskInteractionBinding } from '../interactions/task/useTaskInteractionBinding';
import { primaryPlacementId } from '../features/taskTracking/model';

type SharedTaskSidebarSurface = 'gantt' | 'calendar';

interface SortableSidebarRowProps { item: any; onClick: (item: any) => void; rowHeight: number; surface: SharedTaskSidebarSurface; onAddChild?: (item: any) => void; onToggleCollapse?: (id: string) => void; isCollapsed?: boolean; }
const SortableSidebarRow = ({ item, onClick, rowHeight, surface, onAddChild, onToggleCollapse, isCollapsed }: SortableSidebarRowProps) => {
    const { canCreateTask, canMoveTask, canManageTaskReference } = useBoardPermissions();
    const selectedTaskId = useBoardStore(s => s.selectedTaskId);
    const setContextMenuState = useBoardStore(s => s.setContextMenuState);
    const removeTrackingReference = useWbsStore(s => s.removeTrackingReference);
    const level = Number.isFinite(item.level) ? item.level : 0;
    const isTrackingReference = Boolean(item.isTrackingReference && item.trackingReferenceId);
    const placementId = item.trackingReferenceId || primaryPlacementId(item.id);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        // The collapsed task row remains one visual item, but drag identity is
        // always the placement so a reference cannot move the primary task.
        id: placementId,
        disabled: isTrackingReference ? !canManageTaskReference : !canMoveTask,
        data: { item }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        height: rowHeight,
        '--task-hierarchy-depth': level,
        '--task-hierarchy-base': '10px',
        position: 'relative' as any,
        zIndex: isDragging ? 50 : 1,
    };
    const dragSurfaceBindings = { ...attributes, ...listeners };

    const isGroup = item.nodeType === 'group';
    const isTask = item.nodeType === 'task';
    const childIds = useWbsStore(s => s.parentNodesIndex[item.id]);
    // A tracking projection owns only its placement. The canonical task's
    // children belong to the primary hierarchy and must not appear under a
    // cross-board reference row.
    const hasChildren = !isTrackingReference && Boolean(childIds && childIds.length > 0);
    const interactionBinding = useTaskInteractionBinding({
        taskId: item.id,
        title: item.title,
        trackingReferenceId: item.trackingReferenceId,
        surfaceId: 'shared-task-sidebar.row',
        origin: 'shared-task-sidebar',
        nodeRole: item.nodeType || 'task',
    });

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...dragSurfaceBindings}
            onContextMenu={(e) => {
                e.preventDefault();
                if (isTrackingReference) {
                    setContextMenuState({
                        kind: 'task',
                        isOpen: true,
                        x: e.clientX,
                        y: e.clientY,
                        nodeId: item.id,
                        title: item.title,
                        trackingReferenceId: item.trackingReferenceId,
                        interactionLocation: { hostMode: surface, origin: 'shared-task-sidebar' },
                        surfaceId: 'shared-task-sidebar.row',
                        interactionId: `shared-sidebar-reference-${item.trackingReferenceId}`,
                    });
                    return;
                }
                void interactionBinding.openMenu({ x: e.clientX, y: e.clientY });
            }}
            data-task-id={item.id}
            data-task-canonical-id={item.id}
            data-task-placement-id={placementId}
            data-task-placement-hover-surface="true"
            data-task-drag-surface="true"
            data-task-drag-surface-kind="shared-sidebar-row"
            data-task-selected={selectedTaskId === item.id ? 'true' : undefined}
            data-task-hierarchy-row="true"
            data-task-hierarchy-surface={surface}
            data-task-hierarchy-depth={level}
            data-task-placement-kind={isTrackingReference ? 'tracking-reference' : 'primary'}
            aria-label={isTrackingReference ? `追蹤副本：${item.title || '未命名任務'}` : item.title || '未命名任務'}
            className={`flex items-center px-[10px] border-b border-slate-100 hover:bg-primary/5 transition-colors gap-1 cursor-pointer group
                task-hierarchy-indented-row
                task-title-text ${isGroup ? 'font-medium text-slate-700' : isTask && level === 1 ? 'font-medium text-slate-600' : 'font-medium text-slate-500'}
                ${item.isTrackingReference ? 'border-2 border-dashed border-violet-300 bg-violet-50/40' : ''}
                ${selectedTaskId === item.id ? 'bg-primary/[0.05] ring-2 ring-inset ring-primary/30' : ''}
                ${isDragging ? 'opacity-50 bg-slate-100' : ''}`}
            onClick={() => {
                if (isDragging) return;
                if (isTask) void interactionBinding.dispatch('pointer.primary');
                else onClick(item);
            }}
        >
            {hasChildren && onToggleCollapse ? (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse(item.id);
                    }}
                    className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded p-0 text-slate-400 transition-all hover:bg-slate-200 hover:text-slate-600"
                    title={isCollapsed ? '展開' : '收疊'}
                >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
            ) : (
                <div className="flex-shrink-0 w-[18px]" />
            )}
            <span className={`task-title-text relative min-w-0 flex-1 ${level === 0 ? 'text-[13px]' : level === 1 ? 'text-[11px]' : 'text-[10px]'}`}>
                <span className="block truncate">{item.title}</span>
            </span>
            {onAddChild && !isTrackingReference && (
                <button
                    disabled={!canCreateTask}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!canCreateTask) return;
                        onAddChild(item);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 transition-all hover:text-primary z-50"
                    title="新增子任務"
                >
                    <Plus size={12} />
                </button>
            )}
            {isTrackingReference && (
                <button
                    type="button"
                    className="shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="移除此處追蹤"
                    title="移除此處追蹤"
                    onClick={(event) => {
                        event.stopPropagation();
                        void removeTrackingReference(item.trackingReferenceId);
                    }}
                >
                    移除
                </button>
            )}
        </div>
    );
};

interface SharedTaskSidebarProps { flattenedItems: any[]; collapsedIds: any; toggleCollapse: (id: string) => void; onItemClick: (item: any) => void; isTaskListOpen: boolean; setIsTaskListOpen: (isOpen: boolean) => void; surface: SharedTaskSidebarSurface; rowHeight?: number; }
const SharedTaskSidebar = ({
    flattenedItems,
    collapsedIds,
    toggleCollapse,
    onItemClick,
    isTaskListOpen,
    setIsTaskListOpen,
    surface,
    rowHeight = COMPACT_DIMENSIONS.taskRowHeight
}: SharedTaskSidebarProps) => {
    const { activeWorkspaceId, activeBoardId } = useBoardStore();
    const addNode = useWbsStore(s => s.addNode);
    const batchUpdateNodes = useWbsStore(s => s.batchUpdateNodes);
    const { canCreateTask, canMoveTask, canManageTaskReference } = useBoardPermissions();
    const moveTrackingReference = useWbsStore(s => s.moveTrackingReference);

    const sensors = useDragSensors();
    const [activeSortableItem, setActiveSortableItem] = useState(null);

    const wouldCreateCycle = (draggedId: string, nextParentId: string | null) => {
        if (!nextParentId) return false;
        if (draggedId === nextParentId) return true;

        const nodes = useWbsStore.getState().nodes;
        const visited = new Set<string>([draggedId]);
        let current: string | null = nextParentId;

        while (current) {
            if (current === draggedId) return true;
            if (visited.has(current)) return true;
            visited.add(current);
            current = nodes[current]?.parentId || null;
        }

        return false;
    };

    const handleSortableDragEnd = (event: any) => {
        const { active, over } = event;
        setActiveSortableItem(null);
        if (!canMoveTask && !canManageTaskReference) return;
        if (!over || active.id === over.id || !activeBoardId) return;

        const activeItem = active.data.current?.item;
        const overItem = over.data.current?.item;
        if (!activeItem || !overItem) return;

        if (activeItem.isTrackingReference && activeItem.trackingReferenceId) {
            if (!canManageTaskReference) return;
            const targetParentPlacementId = overItem.trackingReferenceParentPlacementId
                ?? (overItem.parentId ? primaryPlacementId(overItem.parentId) : null);
            void moveTrackingReference({
                referenceId: activeItem.trackingReferenceId,
                targetBoardId: activeBoardId,
                targetParentPlacementId,
                anchorPlacementId: overItem.trackingReferenceId || primaryPlacementId(overItem.id),
                position: 'after',
            });
            return;
        }
        if (!canMoveTask) return;

        if (activeItem.parentId === overItem.parentId) {
            // 同層級交換順序
            const tempOrder = activeItem.order;
            batchUpdateNodes({
                [activeItem.id]: { order: overItem.order },
                [overItem.id]: { order: tempOrder },
            }, { label: '重排任務', mergeKey: `sidebar-reorder:${activeItem.id}` });
        } else {
            // 跨層級移動
            const nextParentId = overItem.parentId || null;
            if (wouldCreateCycle(activeItem.id, nextParentId)) return;
            batchUpdateNodes({
                [activeItem.id]: { parentId: nextParentId, order: overItem.order + 0.5 },
            }, { label: '移動任務位置', mergeKey: `sidebar-move:${activeItem.id}` });
        }
    };

    const handleAddList = () => {
        if (!canCreateTask) return;
        if (activeWorkspaceId && activeBoardId) {
            const newNode: TaskNode = {
                id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
                workspaceId: activeWorkspaceId,
                boardId: activeBoardId,
                parentId: null,
                title: '新任務',
                status: 'todo',
                nodeType: 'group',
                order: flattenedItems.length,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            addNode(newNode);
            prepareNewTaskNaming(newNode.id);
        }
    };

    const handleAddChild = (item: any) => {
        if (!canCreateTask) return;
        if (activeWorkspaceId && activeBoardId) {
            const newNode: TaskNode = {
                id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
                workspaceId: activeWorkspaceId,
                boardId: activeBoardId,
                parentId: item.id,
                title: '新任務',
                status: 'todo',
                nodeType: 'task',
                order: 999, // default to end
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            if (collapsedIds.has(item.id)) toggleCollapse(item.id);
            addNode(newNode);
            prepareNewTaskNaming(newNode.id);
        }
    };

    return (
        <div data-task-hierarchy-surface={surface} className={`flex-shrink-0 flex flex-col border-r border-slate-200 bg-white/95 z-20 transition-all duration-300 ease-in-out relative ${isTaskListOpen ? 'w-64' : 'w-10'}`}>
            {!isTaskListOpen ? (
                <div className="flex-1 flex flex-col items-center pt-[6px] gap-[8px] overflow-hidden">
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
                    <div className="h-9 flex items-center justify-between px-[10px] border-b border-slate-200 bg-slate-50/90 font-semibold text-xs text-slate-500 shrink-0">
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
                            onDragStart={(e) => {
                                const item = e.active.data.current?.item;
                                if (item?.isTrackingReference ? canManageTaskReference : canMoveTask) setActiveSortableItem(item);
                            }}
                            onDragCancel={() => setActiveSortableItem(null)}
                            onDragEnd={handleSortableDragEnd}
                        >
                            <SortableContext
                                items={flattenedItems.map((i: any) => i.trackingReferenceId || primaryPlacementId(i.id))}
                                strategy={verticalListSortingStrategy}
                            >
                                <div>
                                    {flattenedItems.map((item: any) => (
                                        <SortableSidebarRow
                                            key={`${item.nodeType}-${item.id}`}
                                            item={item}
                                            surface={surface}
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
                                    <div className="task-title-text max-w-[220px] truncate rounded-md border border-primary/20 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xl ring-2 ring-primary/20 cursor-grabbing">
                                        {(activeSortableItem as any).title || '未命名任務'}
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                        
                        <div className="px-[10px] py-[6px]">
                            <button
                                onClick={handleAddList}
                                disabled={!canCreateTask}
                                className="w-full py-[5px] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-primary hover:bg-primary/5 border border-dashed border-slate-200 hover:border-primary/30 rounded-lg transition-all"
                            >
                                <Plus size={14} />
                                <span>新增頂層任務</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SharedTaskSidebar;
