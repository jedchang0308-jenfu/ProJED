import { useMemo, useState, type RefObject } from 'react';
import { useWbsStore } from '../store/useWbsStore';
import useBoardStore from '../store/useBoardStore';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragSensors } from '../hooks/useDragSensors';
import { useBoardPermissions } from '../hooks/useBoardPermissions';
import { COMPACT_DIMENSIONS } from './ui/compactTokens';
import { prepareNewTaskNaming } from '../utils/taskInteractions';
import { useTaskInteractionBinding } from '../interactions/task/useTaskInteractionBinding';
import { primaryPlacementId } from '../features/taskTracking/model';
import { TaskDescriptionIndicator } from './TaskDescriptionIndicator';
import { createBlankTaskNode } from '../features/taskCreation/createBlankTaskNode';
import { createOrderedBoardTask, moveOrderedBoardTask } from '../features/taskCreation/boardTaskOrderActions';
import { buildGoalHierarchyDecorations, type GoalHierarchyDecoration } from '../features/goalMode/hierarchyPresentation';
import type { HierarchicalTaskViewItem } from '../utils/taskHierarchy';
import { TaskListNameRow } from './Wbs/TaskListNameRow';

type SharedTaskSidebarSurface = 'gantt' | 'calendar';

const EMPTY_DECORATION: GoalHierarchyDecoration = {
    parentId: null,
    isLastVisibleSibling: true,
    hasVisibleChildren: false,
    ancestorTaskIds: [],
    ancestorContinuations: [],
    eligibleDescendantCount: 0,
};

interface SortableSidebarRowProps {
    item: HierarchicalTaskViewItem;
    onClick: (item: HierarchicalTaskViewItem) => void;
    rowHeight: number;
    surface: SharedTaskSidebarSurface;
    onToggleCollapse: (id: string) => void;
    isCollapsed: boolean;
    decoration: GoalHierarchyDecoration;
}
const SortableSidebarRow = ({ item, onClick, rowHeight, surface, onToggleCollapse, isCollapsed, decoration }: SortableSidebarRowProps) => {
    const { canMoveTask, canManageTaskReference } = useBoardPermissions();
    const selectedTaskId = useBoardStore(s => s.selectedTaskId);
    const setContextMenuState = useBoardStore(s => s.setContextMenuState);
    const removeTrackingReference = useWbsStore(s => s.removeTrackingReference);
    const trackingReferenceId = item.isTrackingReference ? item.trackingReferenceId : undefined;
    const isTrackingReference = Boolean(trackingReferenceId);
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
        position: 'relative' as const,
        zIndex: isDragging ? 50 : 1,
    };
    const dragSurfaceBindings = { ...attributes, ...listeners };

    const isTask = item.nodeType === 'task';
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
            data-task-description-hover-trigger={item.description?.trim() ? 'true' : undefined}
            data-task-canonical-id={item.id}
            data-task-placement-id={placementId}
            data-task-placement-hover-surface="true"
            data-task-drag-surface="true"
            data-task-drag-surface-kind="shared-sidebar-row"
            data-task-selected={selectedTaskId === item.id ? 'true' : undefined}
            data-task-placement-kind={isTrackingReference ? 'tracking-reference' : 'primary'}
            aria-label={isTrackingReference ? `追蹤副本：${item.title || '未命名任務'}` : item.title || '未命名任務'}
            className={`group cursor-pointer px-[10px] transition-colors hover:bg-primary/5
                ${item.isTrackingReference ? 'border-2 border-dashed border-violet-300 bg-violet-50/40' : ''}
                ${selectedTaskId === item.id ? 'bg-primary/[0.05] ring-2 ring-inset ring-primary/30' : ''}
                ${isDragging ? 'opacity-50 bg-slate-100' : ''}`}
            onClick={() => {
                if (isDragging) return;
                if (isTask) void interactionBinding.dispatch('pointer.primary');
                else onClick(item);
            }}
        >
            <TaskListNameRow
                task={item}
                rowId={item.id}
                surface={surface}
                isTrackingReference={isTrackingReference}
                hasChildren={decoration.eligibleDescendantCount > 0}
                collapsed={isCollapsed}
                onToggle={() => onToggleCollapse(item.id)}
                decoration={decoration}
                titleIndicator={<TaskDescriptionIndicator description={item.description} />}
            >
                {trackingReferenceId && (
                    <button
                        type="button"
                        className="shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="移除此處追蹤"
                        title="移除此處追蹤"
                        onClick={(event) => {
                            event.stopPropagation();
                            void removeTrackingReference(trackingReferenceId);
                        }}
                    >
                        移除
                    </button>
                )}
            </TaskListNameRow>
        </div>
    );
};

interface SharedTaskSidebarProps {
    flattenedItems: readonly HierarchicalTaskViewItem[];
    fullyExpandedItems: readonly HierarchicalTaskViewItem[];
    collapsedIds: ReadonlySet<string>;
    toggleCollapse: (id: string) => void;
    onItemClick: (item: HierarchicalTaskViewItem) => void;
    isTaskListOpen: boolean;
    setIsTaskListOpen: (isOpen: boolean) => void;
    surface: SharedTaskSidebarSurface;
    rowHeight?: number;
    listRef?: RefObject<HTMLDivElement | null>;
}
const SharedTaskSidebar = ({
    flattenedItems,
    fullyExpandedItems,
    collapsedIds,
    toggleCollapse,
    onItemClick,
    isTaskListOpen,
    setIsTaskListOpen,
    surface,
    listRef,
    rowHeight = COMPACT_DIMENSIONS.taskRowHeight
}: SharedTaskSidebarProps) => {
    const { activeWorkspaceId, activeBoardId } = useBoardStore();
    const { canCreateTask, canMoveTask, canManageTaskReference } = useBoardPermissions();
    const moveTrackingReference = useWbsStore(s => s.moveTrackingReference);

    const sensors = useDragSensors();
    const [activeSortableItem, setActiveSortableItem] = useState<HierarchicalTaskViewItem | null>(null);
    const isGantt = surface === 'gantt';
    const decorations = useMemo(() => buildGoalHierarchyDecorations({
        renderedItems: flattenedItems,
        fullyExpandedItems,
    }), [flattenedItems, fullyExpandedItems]);

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
        if (!canMoveTask || overItem.isTrackingReference) return;
        void moveOrderedBoardTask(activeItem.id, {
            parentId: overItem.parentId ?? null, anchorId: overItem.id,
            position: activeItem.parentId === overItem.parentId ? 'swap' : 'after',
        });
    };

    const handleAddList = async () => {
        if (!canCreateTask) return;
        if (activeWorkspaceId && activeBoardId) {
            const newNode = createBlankTaskNode({
                id: 'node_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
                workspaceId: activeWorkspaceId,
                boardId: activeBoardId,
                parentId: null,
                nodeType: 'group',
                order: 0,
            });
            if (await createOrderedBoardTask(newNode)) prepareNewTaskNaming(newNode.id);
        }
    };

    return (
        <div
            ref={listRef}
            data-gantt-task-list={isGantt ? 'true' : undefined}
            data-shared-task-sidebar="true"
            data-task-hierarchy-surface={surface}
            className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out ${isGantt ? 'sticky left-0 z-[110]' : 'relative z-20'} ${isTaskListOpen ? isGantt ? 'w-[min(16rem,60cqw)]' : 'w-64 max-w-[60%]' : 'w-10'}`}
        >
            {!isTaskListOpen ? (
                <div className={`flex flex-1 flex-col items-center gap-[8px] pt-[6px] ${isGantt ? '' : 'overflow-hidden'}`}>
                    <button
                        onClick={() => setIsTaskListOpen(true)}
                        className={`p-1.5 hover:bg-slate-100 rounded-full text-primary transition-colors ${isGantt ? 'sticky top-[6px]' : ''}`}
                        title="展開任務清單"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <div className="h-full w-px bg-slate-100" />
                </div>
            ) : (
                <>
                    <div className={`shared-task-sidebar-header flex h-8 shrink-0 items-center justify-between border-b pl-[30px] pr-[10px] text-xs font-semibold ${isGantt ? 'sticky top-0 z-[60]' : ''}`}>
                        <span>任務名稱</span>
                        <button
                            onClick={() => setIsTaskListOpen(false)}
                            className="rounded p-1 transition-colors hover:bg-white/15"
                            title="收疊任務清單"
                        >
                            <ChevronLeft size={14} />
                        </button>
                    </div>
                    <div className={isGantt ? 'flex-1' : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'}>
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
                                items={flattenedItems.map(i => i.trackingReferenceId || primaryPlacementId(i.id))}
                                strategy={verticalListSortingStrategy}
                            >
                                <div>
                                    {flattenedItems.map(item => (
                                        <SortableSidebarRow
                                            key={`${item.nodeType}-${item.id}`}
                                            item={item}
                                            surface={surface}
                                            onClick={onItemClick}
                                            onToggleCollapse={toggleCollapse}
                                            isCollapsed={collapsedIds.has(item.id)}
                                            rowHeight={rowHeight}
                                            decoration={decorations.get(item.id) ?? EMPTY_DECORATION}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                                {activeSortableItem ? (
                                    <div className="task-title-text max-w-[220px] truncate rounded-md border border-primary/20 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xl ring-2 ring-primary/20 cursor-grabbing">
                                        {activeSortableItem.title || '未命名任務'}
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
