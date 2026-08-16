import React from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'lucide-react';
import dayjs from 'dayjs';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import { KanbanCard } from './KanbanCard';
import type { TaskNode } from '../../types';
import { useBoardPermissions } from '../../hooks/useBoardPermissions';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { isTaskPrimaryActionTarget, selectAndOpenTaskDetails } from '../../utils/taskInteractions';
import { useTaskGestureSurface } from './taskDrag/useTaskGestureSurface';
import { TaskDateBadge } from './TaskDateBadge';

interface KanbanColumnProps {
  nodeId: string;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  filterProjection?: TaskFilterResultProjection | null;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId, previewNodes, previewParentIndex, filterProjection }) => {
  const storeNode = useWbsStore((state) => state.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const wbsDependencies = useWbsStore((state) => state.dependencies);
  const getNodeLockStatus = useWbsStore((state) => state.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const setContextMenuState = useBoardStore((state) => state.setContextMenuState);
  const selectedTaskId = useBoardStore((state) => state.selectedTaskId);
  const { canMoveTask, canCreateDependency } = useBoardPermissions();
  // 看板依賴選取 Context
  const kanbanDepCtx = React.useContext(KanbanDependencyContext);
  const dependencySelection = kanbanDepCtx?.dependencySelection || null;
  const isSelectingMode = !!dependencySelection;
  const isSelfStart = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'start';
  const isSelfEnd = isSelectingMode && dependencySelection?.id === nodeId && dependencySelection?.side === 'end';
  const isSelfNode = isSelfStart || isSelfEnd;
  const { active, over } = useDndContext();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId;
  const taskGesture = useTaskGestureSurface({
    task: { id: nodeId, title: node?.title, status: node?.status },
    sourceKind: 'column-header',
    disabled: isSelectingMode,
    onNonMobileLongPress: (event) => {
      if (!node) return;
      event.preventDefault();
      const touch = event.touches[0];
      setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: touch.clientX,
        y: touch.clientY,
        nodeId,
        title: node.title || '未命名任務',
      });
    },
  });

  const storeChildIds = useWbsStore((state) => state.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;

  const children = React.useMemo(() => {
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;

    return (childIds || [])
      .map((id) => nodes[id])
      .filter((child) => child && !child.isArchived && (!filterProjection || filterProjection.visibleTaskIds.has(child.id)))
      .sort((a, b) => a.order - b.order);
  }, [childIds, filterProjection, previewNodes]);

  const {
    attributes: columnAttributes,
    listeners: columnListeners,
    setNodeRef: setColumnNodeRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: isColumnDragging,
  } = useSortable({
    id: nodeId,
    disabled: !canMoveTask || isSelectingMode || taskGesture.mobileActionMode,
    data: {
      type: 'wbs-column',
      nodeId,
    },
  });

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `${nodeId}-drop`,
    disabled: !canMoveTask,
    data: {
      type: 'wbs-column-drop',
      nodeId,
    },
  });

  // Keep title-center geometry stationary while an L1 source is dragged.
  // dnd-kit can still resolve and commit horizontal reordering on release, but
  // sibling transforms must not move a prospective child target during dwell.
  const freezeDesktopColumnLayout = activeType === 'wbs-column';
  const columnStyle = {
    transform: freezeDesktopColumnLayout ? undefined : CSS.Transform.toString(columnTransform),
    transition: freezeDesktopColumnLayout ? undefined : columnTransition,
    minHeight: taskGesture.activeSurfaceHeight ?? undefined,
  };
  const isColumnPlaceholder = isColumnDragging || taskGesture.isActive;
  const columnHeaderDragBindings = taskGesture.mobileActionMode || isSelectingMode
    ? {}
    : { ...columnAttributes, ...columnListeners };

  const status = node?.status || 'todo';
  const overData = over?.data.current;
  const overNodeId = overData?.nodeId;
  const nodes = previewNodes || useWbsStore.getState().nodes;
  const isOverColumnDescendant = (() => {
    if (!overNodeId) return false;
    if (overNodeId === nodeId) return true;

    let current = nodes[overNodeId]?.parentId;
    const visited = new Set<string>();
    while (current) {
      if (current === nodeId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      current = nodes[current]?.parentId || null;
    }

    return false;
  })();
  const isChecklistLayerTargeted = Boolean(
    overData?.type === 'wbs-checklist-drop' ||
    (activeType === 'wbs-checklist' && overData?.type === 'wbs-checklist')
  );
  const isCardLayerTargeted = Boolean(
    active &&
    activeNodeId !== nodeId &&
    ['wbs-card', 'wbs-checklist'].includes(activeType || '') &&
    !isChecklistLayerTargeted &&
    (isOver || overData?.nodeId === nodeId || isOverColumnDescendant)
  );

  // Keep all hooks above this guard so missing data never changes hook order.
  if (!node) {
    return null;
  }

  return (
    <div
      ref={setColumnNodeRef}
      style={columnStyle}
      data-kanban-column="true"
      data-desktop-task-hover-scope="true"
      data-task-child-drop-target="true"
      data-task-child-drop-level="L1"
      data-task-id={nodeId}
      data-task-hover-scope-kind="column"
      data-task-hover-scope-source-id={nodeId}
      data-task-hover-has-descendants={children.length > 0 ? 'true' : undefined}
      className={`flex max-h-full w-[270px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-panel shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all ${
        isColumnDragging ? 'pointer-events-none' : ''
      }`}
    >
      <div
        {...columnHeaderDragBindings}
        {...taskGesture.handlers}
        data-task-id={nodeId}
        data-mobile-drop-target={nodeId}
        data-task-drop-surface-kind="column-header"
        data-desktop-drop-surface="true"
        data-desktop-drop-id={nodeId}
        data-task-drag-surface="true"
        data-task-drag-surface-kind="kanban-column-header"
        data-task-surface-source="true"
        data-kanban-drag-source-placeholder={isColumnPlaceholder ? 'true' : undefined}
        data-desktop-task-hover-preview={!isColumnPlaceholder && !isSelectingMode ? 'true' : undefined}
        data-task-selected={selectedTaskId === nodeId ? 'true' : undefined}
        data-touch-tap-guard="true"
        data-task-touch-gesture-surface={taskGesture.touchGestureEnabled ? 'true' : undefined}
        data-kanban-column-header="true"
        data-kanban-header-visual="tonal-borderless"
        className={`group mobile-pan-item flex flex-col gap-1 bg-slate-50 px-[10px] py-[8px] transition-colors hover:bg-white ${
            isColumnPlaceholder ? 'kanban-drag-origin-placeholder pointer-events-none' : ''
        } ${
            isSelectingMode
                ? isSelfNode
                    ? 'cursor-crosshair ring-2 ring-inset ring-amber-400 bg-amber-50/50'
                    : 'cursor-crosshair hover:bg-amber-50/30'
                : ''
        }`}
        onClick={(event) => {
          if (isColumnPlaceholder || isSelectingMode || isTaskPrimaryActionTarget(event.target)) return;
          selectAndOpenTaskDetails(nodeId);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenuState({
            kind: 'task',
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
            nodeId,
            title: node.title || '未命名任務',
          });
        }}
      >
        {isColumnPlaceholder ? (
          <div
            className="h-[20px] w-full"
            data-kanban-drag-source-placeholder-neutral="true"
            aria-hidden="true"
          />
        ) : (
        <>
        <div className="flex min-w-0 items-center gap-1.5">
          <h3
            className="task-title-text relative min-w-0 flex-1 text-sm font-semibold text-slate-800"
            aria-label={node.title || '未命名任務'}
            data-task-title-slot="true"
            data-task-id={nodeId}
          >
            <span
              className="inline-block max-w-full truncate align-top"
              data-task-id={nodeId}
            >
              {node.title || '未命名任務'}
            </span>
          </h3>
          {!isSelectingMode && (
            <TaskDateBadge
              startDate={node.startDate}
              endDate={node.endDate}
              status={status}
              showStartDate={false}
              startLocked={lockStatus.startLocked}
              endLocked={lockStatus.endLocked}
              durationLocked={Boolean(node.isDurationLocked)}
              surface="checklist"
              className="ml-0.5"
            />
          )}
        </div>

        {/* 日期依賴選取模式維持原有互動；一般模式由標題列的共用日期徽章呈現。 */}
        {isSelectingMode && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
              {/* 開始日按鈕 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfStart
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-primary-light border-primary/30 text-primary hover:bg-primary/10 cursor-crosshair'
                }`}
                title="點擊選取此列表的開始日為依賴目標"
              >
                <Link size={9} />
                <span>開始 {node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
              </button>
              {/* 結束日按鈕 */}
              <button
                disabled={!canCreateDependency}
                onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-all ${
                  isSelfEnd
                    ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                    : 'bg-primary-light border-primary/30 text-primary hover:bg-primary/10 cursor-crosshair'
                }`}
                title="點擊選取此列表的結束日為依賴目標"
              >
                <Link size={9} />
                <span>結束 {node.endDate ? dayjs(node.endDate).format('MM/DD') : '...'}</span>
              </button>
          </div>
        )}
        </>
        )}
      </div>

      <div
        ref={setDropNodeRef}
        className={`scroll-container mobile-pan-surface flex-1 overflow-y-auto rounded-md px-[8px] py-[8px] scrollbar-thin scrollbar-thumb-slate-300 transition-[background-color,box-shadow] duration-100 mx-0 mb-0 bg-surface-panel ${
          isCardLayerTargeted ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''
        }`}
        data-mobile-pan-surface="kanban-column"
        data-task-id={nodeId}
        data-task-drop-surface-kind="column-drop"
        data-desktop-drop-surface="true"
        data-desktop-drop-id={`${nodeId}-drop`}
      >
        <div
          data-kanban-column-subtree-scope={children.length > 0 ? 'true' : undefined}
          className={children.length > 0 ? 'rounded-md' : undefined}
        >
          <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <KanbanCard
                key={child.id}
                nodeId={child.id}
                columnId={nodeId}
                previewNodes={previewNodes}
                previewParentIndex={previewParentIndex}
                filterProjection={filterProjection}
              />
            ))}
          </SortableContext>
        </div>

        <div className="mobile-pan-rail" data-mobile-pan-rail="kanban-column" aria-hidden="true" />
      </div>
    </div>
  );
};
