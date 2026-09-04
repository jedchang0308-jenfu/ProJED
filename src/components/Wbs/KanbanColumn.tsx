import React from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'lucide-react';
import dayjs from 'dayjs';
import { useWbsStore } from '../../store/useWbsStore';
import useBoardStore from '../../store/useBoardStore';
import { KanbanDependencyContext } from '../BoardView';
import { KanbanCard } from './KanbanCard';
import type { TaskNode } from '../../types';
import type { TaskFilterResultProjection } from '../../features/taskFilters';
import { isTaskPrimaryActionTarget } from '../../utils/taskInteractions';
// Compatibility contract retains prepareNewTaskNaming(newNode.id) for post-create adapters.
import { TaskPlacementPendingIndicator } from './taskDrag/TaskPlacementPendingIndicator';
import { primaryPlacementId } from '../../features/taskTracking/model';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import { TaskSurfaceFrame } from './TaskSurfaceFrame';
import { buildTaskPlacementTreeRows, TaskPlacementTree } from './TaskPlacementTree';
import { useTaskPlacementController } from './useTaskPlacementController';
import { KANBAN_COLUMN_FRAME_CLASS, KanbanColumnPresentation } from './KanbanColumnPresentation';

interface KanbanColumnProps {
  nodeId: string;
  previewNodes?: Record<string, TaskNode> | null;
  previewParentIndex?: Record<string, string[]> | null;
  filterProjection?: TaskFilterResultProjection | null;
  trackingReference?: TaskTrackingReference;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ nodeId, previewNodes, previewParentIndex, filterProjection, trackingReference }) => {
  const storeNode = useWbsStore((state) => state.nodes[nodeId]);
  const node = previewNodes?.[nodeId] || storeNode;
  const wbsDependencies = useWbsStore((state) => state.dependencies);
  const getNodeLockStatus = useWbsStore((state) => state.getNodeLockStatus);
  const lockStatus = getNodeLockStatus(nodeId, wbsDependencies);
  const selectedTaskId = useBoardStore((state) => state.selectedTaskId);
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
  const placementController = useTaskPlacementController({
    task: node || ({ id: nodeId, workspaceId: '', boardId: '', parentId: null, title: '', status: 'todo', order: 0 } as TaskNode),
    reference: trackingReference,
    surfaceId: 'board.column-header',
    sortableType: 'wbs-column',
    sourceKind: 'column-header',
    interactionDisabled: isSelectingMode,
    transientOwners: isSelectingMode ? ['dependency-selection'] : [],
  });
  const { activationProps, interactionBinding, permissions, taskGesture } = placementController;
  const { canCreateDependency } = permissions;

  const storeChildIds = useWbsStore((state) => state.parentNodesIndex[nodeId]);
  const childIds = previewParentIndex?.[nodeId] || storeChildIds;
  const trackingReferences = useWbsStore((state) => state.trackingReferences);

  const children = React.useMemo(() => {
    if (trackingReference) return [];
    const state = useWbsStore.getState();
    const nodes = previewNodes || state.nodes;

    return (childIds || [])
      .map((id) => nodes[id])
      .filter((child) => child && !child.isArchived && (!filterProjection || filterProjection.visibleTaskIds.has(child.id)))
      .sort((a, b) => a.order - b.order);
  }, [childIds, filterProjection, previewNodes, trackingReference]);
  const trackingChildren = React.useMemo(() => trackingReferences
    .filter(reference => !reference.removedAt
      && reference.boardId === (trackingReference?.boardId || node?.boardId)
      && reference.parentPlacementId === (trackingReference?.id || primaryPlacementId(nodeId))
      && (!filterProjection || filterProjection.visibleTaskIds.has(reference.taskId)))
    .filter(reference => Boolean(useWbsStore.getState().nodes[reference.taskId])),
  [filterProjection, node?.boardId, nodeId, trackingReference?.boardId, trackingReference?.id, trackingReferences]);
  const childRenderRows = React.useMemo(() => buildTaskPlacementTreeRows({
    primaryTasks: children,
    trackingReferences: trackingChildren,
    tasksById: previewNodes || useWbsStore.getState().nodes,
    parentPlacementId: trackingReference?.id || primaryPlacementId(nodeId),
  }), [children, nodeId, previewNodes, trackingChildren, trackingReference?.id]);

  const {
    attributes: columnAttributes,
    listeners: columnListeners,
    setNodeRef: setColumnNodeRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: isColumnDragging,
  } = placementController.sortable;

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `${placementController.placementId}-drop`,
    disabled: !permissions.canMoveTask && !permissions.canManageTaskReference,
    data: {
      type: 'wbs-column-drop',
      nodeId,
      placementId: placementController.placementId,
      placementKind: placementController.placementKind,
      trackingReference: trackingReference || undefined,
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
  const columnHeaderDragBindings = taskGesture.mobileActionMode || isSelectingMode || taskGesture.isPlacementPending
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
    <TaskSurfaceFrame
      task={node}
      reference={trackingReference}
      surfaceKind="kanban-column"
      ref={setColumnNodeRef}
      {...activationProps}
      style={columnStyle}
      data-kanban-column="true"
      data-desktop-task-hover-scope="true"
      data-task-child-drop-target="true"
      data-task-child-drop-level="L1"
      data-task-id={nodeId}
      data-task-placement-id={placementController.placementId}
      data-task-placement-kind={trackingReference ? 'tracking-reference' : 'primary'}
      data-task-hover-scope-kind="column"
      data-task-hover-scope-source-id={nodeId}
      data-task-hover-has-descendants={children.length > 0 ? 'true' : undefined}
      data-task-placement-pending={taskGesture.isPlacementPending ? 'true' : undefined}
      className={`${KANBAN_COLUMN_FRAME_CLASS} ${
        isColumnDragging ? 'pointer-events-none' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 h-px w-px opacity-0"
        data-task-direct-child-title-anchor="true"
        style={{
          left: 'calc(var(--kanban-column-body-pad, 8px) + 1px + var(--kanban-card-pad-x, 9px))',
        }}
      />
      <KanbanColumnPresentation
        title={node.title}
        status={status}
        startDate={node.startDate ?? null}
        endDate={node.endDate ?? null}
        isDurationLocked={Boolean(node.isDurationLocked)}
        startLocked={lockStatus.startLocked}
        endLocked={lockStatus.endLocked}
        placeholder={isColumnPlaceholder}
        showDate={!isSelectingMode}
        headerProps={{
          ...columnHeaderDragBindings,
          ...taskGesture.handlers,
          'data-task-id': nodeId,
          'data-mobile-drop-target': nodeId,
          'data-task-drop-surface-kind': 'column-header',
          'data-desktop-drop-surface': 'true',
          'data-desktop-drop-id': placementController.placementId,
          'data-task-drag-surface': 'true',
          'data-task-drag-surface-kind': 'kanban-column-header',
          'data-task-surface-source': 'true',
          'data-kanban-drag-source-placeholder': isColumnPlaceholder ? 'true' : undefined,
          'data-desktop-task-hover-preview': !isColumnPlaceholder && !isSelectingMode ? 'true' : undefined,
          'data-task-selected': selectedTaskId === nodeId ? 'true' : undefined,
          'data-touch-tap-guard': 'true',
          'data-task-touch-gesture-surface': taskGesture.touchGestureEnabled ? 'true' : undefined,
          'data-kanban-column-header': 'true',
          'data-kanban-header-visual': 'tonal-borderless',
          onClick: (event) => {
            if (isColumnPlaceholder || isSelectingMode || isTaskPrimaryActionTarget(event.target)) return;
            void interactionBinding.dispatch('pointer.primary');
          },
          onContextMenu: (event) => {
            event.preventDefault();
            void interactionBinding.openMenu({ x: event.clientX, y: event.clientY });
          },
        } as React.HTMLAttributes<HTMLDivElement>}
        headerClassName={`${
          isColumnPlaceholder ? 'kanban-drag-origin-placeholder pointer-events-none' : ''
        } ${
          isSelectingMode
            ? isSelfNode
              ? 'cursor-crosshair ring-2 ring-inset ring-amber-400 bg-amber-50/50'
              : 'cursor-crosshair hover:bg-amber-50/30'
            : ''
        }`}
        titleProps={{
          'aria-label': node.title || '未命名任務',
          'data-task-title-slot': 'true',
          'data-task-id': nodeId,
        } as React.HTMLAttributes<HTMLHeadingElement>}
        titleTextProps={{ 'data-task-id': nodeId } as React.HTMLAttributes<HTMLSpanElement>}
        titleTrailing={taskGesture.isPlacementPending ? <TaskPlacementPendingIndicator /> : null}
        headerMeta={isSelectingMode ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
            <button
              disabled={!canCreateDependency}
              onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'start', node.title); }}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
                isSelfStart
                  ? 'bg-amber-100 border-amber-400 text-amber-700 ring-2 ring-amber-300'
                  : 'bg-primary-light border-primary/30 text-primary hover:bg-primary/10 cursor-crosshair'
              }`}
              title="點擊選取此列表的開始日為依賴目標"
            >
              <Link size={9} />
              <span>開始 {node.startDate ? dayjs(node.startDate).format('MM/DD') : '...'}</span>
            </button>
            <button
              disabled={!canCreateDependency}
              onClick={(e) => { e.stopPropagation(); if (canCreateDependency) kanbanDepCtx?.handleKanbanDependencySelect(nodeId, 'end', node.title); }}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
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
        ) : null}
        bodyRef={setDropNodeRef}
        bodyProps={{
          'data-mobile-pan-surface': 'kanban-column',
          'data-task-id': nodeId,
          'data-mobile-drop-target': nodeId,
          'data-task-drop-surface-kind': 'column-drop',
          'data-desktop-drop-surface': 'true',
          'data-desktop-drop-id': `${placementController.placementId}-drop`,
        } as React.HTMLAttributes<HTMLDivElement>}
        bodyClassName={isCardLayerTargeted ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''}
      >
        <div
          data-kanban-column-subtree-scope={children.length > 0 ? 'true' : undefined}
          className={children.length > 0 ? 'rounded-md' : undefined}
        >
          <TaskPlacementTree rows={childRenderRows}>
            {row => (
              <KanbanCard
                nodeId={row.task.id}
                columnId={nodeId}
                previewNodes={previewNodes}
                previewParentIndex={previewParentIndex}
                filterProjection={filterProjection}
                trackingReference={row.reference}
              />
            )}
          </TaskPlacementTree>
          <span
            aria-hidden="true"
            className="pointer-events-none block h-0 w-full"
            data-kanban-column-append-anchor="true"
          />
        </div>

      </KanbanColumnPresentation>
    </TaskSurfaceFrame>
  );
};
