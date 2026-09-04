import React from 'react';
import { DndContext, pointerWithin, type DragEndEvent, type DragOverEvent, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { TaskNode } from '../types';
import type { TaskTrackingReference } from '../features/taskTracking/types';
import { primaryPlacementId } from '../features/taskTracking/model';
import useBoardStore from '../store/useBoardStore';
import { useWbsStore } from '../store/useWbsStore';
import { useTaskPlacementPermissions } from '../hooks/useTaskPlacementPermissions';
import { useDragSensors } from '../hooks/useDragSensors';
import { TaskChecklistTree, type TaskChecklistHostAdapter } from './Wbs/TaskChecklistTree';
import { useTaskDragSession } from './Wbs/taskDrag/useTaskDragSession';
import { commitDesktopTaskDrag } from './Wbs/taskDrag/taskDragCommit';
import { resolveTaskTitleChildDropTarget, TASK_CHILD_DROP_DWELL_MS, type TaskChildDropTarget } from './Wbs/taskDrag/taskChildDropTarget';
import { taskDragSourceKindToSurfaceKind } from './Wbs/taskDrag/taskDropIntent';
import { TaskDragPresenter } from './Wbs/taskDrag/TaskDragPresenter';
import { MobileTaskActionContext } from './Wbs/mobileTaskActionContext';
import { KanbanInsertionMarker } from './Wbs/KanbanInsertionMarker';

const EMPTY_IDS: string[] = [];
const TASK_CHILD_DROP_RETAIN_MARGIN_PX = 32;

type TaskDetailsSubtaskDragHostProps = {
  rootTask: TaskNode;
  trackingReference?: TaskTrackingReference | null;
  bodyRef: React.RefObject<HTMLElement | null>;
  onOpenDetails?: (taskId: string, trackingReferenceId?: string, placementId?: string) => void;
};

const TaskDetailsSubtaskDragHost: React.FC<TaskDetailsSubtaskDragHostProps> = ({
  rootTask,
  trackingReference,
  bodyRef,
  onOpenDetails,
}) => {
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
  const showTags = useBoardStore(state => state.showTags);
  const selectedTaskId = useBoardStore(state => state.selectedTaskId);
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const addNode = useWbsStore(state => state.addNode);
  const updateNode = useWbsStore(state => state.updateNode);
  const batchUpdateNodes = useWbsStore(state => state.batchUpdateNodes);
  const commitTaskPlacementCommand = useWbsStore(state => state.commitTaskPlacementCommand);
  const archiveNode = useWbsStore(state => state.archiveNode);
  const moveTrackingReference = useWbsStore(state => state.moveTrackingReference);
  const stageTrackingReference = useWbsStore(state => state.stageTrackingReference);
  const placeStagedTrackingReference = useWbsStore(state => state.placeStagedTrackingReference);
  const recalculateAncestorStatus = useWbsStore(state => state.recalculateAncestorStatus);
  const permissions = useTaskPlacementPermissions(rootTask, trackingReference);
  const sensors = useDragSensors();
  const rootPlacementId = trackingReference?.id || primaryPlacementId(rootTask.id);
  const dragScopeRef = React.useRef<HTMLDivElement | null>(null);
  const [desktopDropRect, setDesktopDropRect] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const desktopChildDropRef = React.useRef<{ sourceNodeId: string; target: TaskChildDropTarget; phase: 'candidate' | 'armed'; candidateSince: number } | null>(null);
  const [desktopChildDrop, setDesktopChildDrop] = React.useState<typeof desktopChildDropRef.current>(null);

  const dependencies = React.useMemo(() => ({
    activeBoardId,
    activeWorkspaceId,
    canMoveTask: trackingReference ? permissions.canManageTaskReference : permissions.canMoveTask,
    canEditTask: permissions.canEditTask,
    canCreateTask: permissions.canCreateTask,
    canDeleteTask: permissions.canDeleteTask,
    canManageTaskReference: permissions.canManageTaskReference,
    addNode,
    updateNode,
    batchUpdateNodes,
    commitTaskPlacementCommand,
    archiveNode,
    recalculateAncestorStatus,
    moveTrackingReference,
    stageTrackingReference,
    placeStagedTrackingReference,
  }), [
    activeBoardId,
    activeWorkspaceId,
    addNode,
    archiveNode,
    batchUpdateNodes,
    commitTaskPlacementCommand,
    moveTrackingReference,
    stageTrackingReference,
    placeStagedTrackingReference,
    permissions.canCreateTask,
    permissions.canDeleteTask,
    permissions.canEditTask,
    permissions.canManageTaskReference,
    permissions.canMoveTask,
    recalculateAncestorStatus,
    trackingReference,
    updateNode,
  ]);

  const dragSession = useTaskDragSession({
    boardSurfaceRef: bodyRef,
    dragSurfaceRef: bodyRef,
    scrollSurfaceRef: bodyRef,
    targetScopeRef: dragScopeRef,
    ...dependencies,
  });

  const hostAdapter = React.useMemo<TaskChecklistHostAdapter>(() => ({
    surfaceId: 'task-details.subtask-row',
    onOpenDetails,
    showTags,
    selectedTaskId,
  }), [onOpenDetails, selectedTaskId, showTags]);

  const rootDrop = useDroppable({
    id: `task-details-root-drop:${rootPlacementId}`,
    data: {
      type: 'wbs-checklist-drop',
      nodeId: rootTask.id,
      placementId: rootPlacementId,
      placementKind: trackingReference ? 'tracking_reference' : 'primary',
      trackingReference: trackingReference || undefined,
      boardId: trackingReference?.boardId || rootTask.boardId,
      workspaceId: trackingReference?.workspaceId || rootTask.workspaceId,
      source: 'task-details',
    },
  });
  const { setNodeRef: setRootDropNodeRef, isOver: isRootDropOver } = rootDrop;

  const handleDragEnd = React.useCallback(async (event: DragEndEvent) => {
    setDesktopDropRect(null);
    const childDrop = desktopChildDropRef.current;
    desktopChildDropRef.current = null;
    setDesktopChildDrop(null);
    const over = childDrop?.phase === 'armed'
      && event.active?.data.current?.nodeId === childDrop.sourceNodeId
      ? {
        id: `task-title-child:${childDrop.target.targetNodeId}`,
        data: {
          current: {
            type: 'wbs-task-title-child',
            nodeId: childDrop.target.targetNodeId,
            placementId: childDrop.target.targetPlacementId,
            orderingPosition: 'append',
          },
        },
      }
      : event.over;
    if (!over) return;
    const result = await commitDesktopTaskDrag({
      activeData: (event.active.data.current || {}) as Record<string, any>,
      overData: (over.data.current || {}) as Record<string, any>,
      dependencies,
    });
    if (result.status === 'failed') setContextMenuState(null);
  }, [dependencies, setContextMenuState]);

  const handleDragMove = React.useCallback((event: { active: { data: { current?: Record<string, any> | undefined } }; delta: { x: number; y: number }; activatorEvent: Event | null }) => {
    const activeData = event.active?.data.current || {};
    const sourceKind = taskDragSourceKindToSurfaceKind(activeData.type);
    const activator = event.activatorEvent as MouseEvent | null;
    if (!sourceKind || !activeData.nodeId || !activator || typeof activator.clientX !== 'number' || typeof activator.clientY !== 'number') {
      desktopChildDropRef.current = null;
      setDesktopChildDrop(null);
      return;
    }
    const target = resolveTaskTitleChildDropTarget({
      point: { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y },
      inputMode: 'mouse',
      sourceNodeId: activeData.nodeId,
      sourceSurfaceKind: sourceKind,
      nodesRecord: useWbsStore.getState().nodes,
      scopeElement: dragScopeRef.current,
    });
    const current = desktopChildDropRef.current;
    if (!target) {
      // dnd-kit may emit a transient frame while the source placeholder changes
      // the nested tree geometry. Keep a candidate only while the pointer is
      // still inside that candidate's safe hover scope; this prevents a valid
      // child intent from being lost during the final few pointer steps without
      // allowing a pointer that left the target scope to arm stale state.
      const safeRect = current?.target.previewRect.safe;
      const point = { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y };
      const staysInCandidate = Boolean(
        safeRect
        && point.x >= safeRect.left
        && point.x <= safeRect.right
        && point.y >= safeRect.top - TASK_CHILD_DROP_RETAIN_MARGIN_PX
        && point.y <= safeRect.bottom + TASK_CHILD_DROP_RETAIN_MARGIN_PX,
      );
      if (current && staysInCandidate) return;
      desktopChildDropRef.current = null;
      setDesktopChildDrop(null);
      return;
    }
    if (current?.sourceNodeId === activeData.nodeId && current?.target.targetNodeId === target.targetNodeId) return;
    const next = {
      sourceNodeId: activeData.nodeId,
      target,
      phase: 'candidate' as const,
      candidateSince: Date.now(),
    };
    desktopChildDropRef.current = next;
    setDesktopChildDrop(next);
  }, []);

  React.useEffect(() => {
    const current = desktopChildDrop;
    if (!current || current.phase !== 'candidate') return undefined;
    const candidate = current;
    const timer = window.setTimeout(() => {
      const latest = desktopChildDropRef.current;
      if (!latest || latest !== candidate) return;
      const armed = { ...latest, phase: 'armed' as const };
      desktopChildDropRef.current = armed;
      setDesktopChildDrop(armed);
    }, Math.max(0, TASK_CHILD_DROP_DWELL_MS - (Date.now() - candidate.candidateSince)));
    return () => window.clearTimeout(timer);
  }, [desktopChildDrop]);

  const handleDragOver = React.useCallback((event: DragOverEvent) => {
    if (desktopChildDropRef.current?.phase === 'armed') {
      setDesktopDropRect(null);
      return;
    }
    const rect = event.over?.rect;
    if (!rect) {
      setDesktopDropRect(null);
      return;
    }
    setDesktopDropRect({ left: rect.left, top: rect.bottom, width: rect.width, height: 2 });
  }, []);

  return (
    <MobileTaskActionContext.Provider value={dragSession.contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={() => {
          setContextMenuState(null);
        }}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragCancel={() => {
          desktopChildDropRef.current = null;
          setDesktopChildDrop(null);
          setDesktopDropRect(null);
        }}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={dragScopeRef}
          className="rounded-md"
          data-task-details-subtask-drag-scope="true"
        >
          <TaskChecklistTree
            parentId={rootTask.id}
            parentPlacementId={trackingReference?.id}
            hostAdapter={hostAdapter}
          />
          <div
            ref={setRootDropNodeRef}
            className={`mt-1 flex min-h-6 items-center justify-center rounded border border-dashed px-2 text-[10px] text-slate-400 transition-colors ${isRootDropOver ? 'border-blue-300 bg-blue-50/70 text-blue-700' : 'border-slate-200 bg-white/70'}`}
            data-task-details-root-drop-zone="true"
            data-task-drop-surface-kind="checklist-drop"
            data-task-drop-node-id={rootTask.id}
            data-task-placement-id={rootPlacementId}
          >
            拖曳到此處新增為直屬子任務
          </div>
          <TaskDragPresenter
            state={dragSession.state}
            canEditTask={dragSession.state?.source.canEditCanonicalTask ?? permissions.canEditTask}
            canCreateTask={dragSession.state?.source.canCreateCanonicalTask ?? permissions.canCreateTask}
            canDeleteTask={dragSession.state?.source.canDeleteCanonicalTask ?? permissions.canDeleteTask}
            onAction={dragSession.activateAction}
            overlayBaseZIndex={10020}
          />
          {desktopDropRect ? (
            <div
              className="pointer-events-none fixed z-[10025] -translate-y-1/2"
              style={desktopDropRect}
              data-task-details-desktop-drop-indicator="true"
            >
              <KanbanInsertionMarker compact className="py-0" />
            </div>
          ) : null}
          {desktopChildDrop?.phase === 'armed' ? (
            <div
              className="pointer-events-none fixed z-[10025] -translate-y-1/2"
              style={{
                left: desktopChildDrop.target.previewRect.insertion.left,
                top: desktopChildDrop.target.previewRect.insertion.top,
                width: desktopChildDrop.target.previewRect.insertion.width,
                height: 2,
              }}
              data-task-details-child-drop-indicator="true"
            >
              <KanbanInsertionMarker compact className="py-0" />
            </div>
          ) : null}
        </div>
      </DndContext>
    </MobileTaskActionContext.Provider>
  );
};

export type TaskDetailsSubtaskSectionProps = {
  node: TaskNode;
  trackingReference?: TaskTrackingReference | null;
  bodyRef: React.RefObject<HTMLElement | null>;
  canCreateTask?: boolean;
  onCreateChild?: (taskId: string) => void;
  onOpenDetails?: (taskId: string, trackingReferenceId?: string, placementId?: string) => void;
};

export const TaskDetailsSubtaskSection: React.FC<TaskDetailsSubtaskSectionProps> = ({
  node,
  trackingReference,
  bodyRef,
  canCreateTask = false,
  onCreateChild,
  onOpenDetails,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const childIds = useWbsStore(state => state.parentNodesIndex[node.id] || EMPTY_IDS);
  const trackingReferences = useWbsStore(state => state.trackingReferences);
  const nodes = useWbsStore(state => state.nodes);
  const rootPlacementId = trackingReference?.id || primaryPlacementId(node.id);
  const childCount = React.useMemo(() => {
    const primaryCount = trackingReference
      ? 0
      : childIds.filter(id => Boolean(nodes[id] && !nodes[id].isArchived)).length;
    const trackingCount = trackingReferences.filter(reference => (
      !reference.removedAt
      && reference.parentPlacementId === rootPlacementId
      && reference.boardId === (trackingReference?.boardId || node.boardId)
      && Boolean(nodes[reference.taskId] && !nodes[reference.taskId].isArchived)
    )).length;
    return primaryCount + trackingCount;
  }, [childIds, node.boardId, nodes, rootPlacementId, trackingReference, trackingReferences]);

  return (
    <section className="mt-4 border-t border-slate-100 pt-3" data-task-details-subtasks="true">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
          onClick={() => setIsExpanded(current => !current)}
          aria-expanded={isExpanded}
          aria-controls="task-details-subtask-panel"
          data-task-details-subtask-toggle="true"
        >
          {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          <span>子任務</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500" data-task-details-subtask-count="true">
            {childCount}
          </span>
        </button>
        {canCreateTask && onCreateChild ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            onClick={() => onCreateChild(node.id)}
            data-task-details-subtask-create="true"
          >
            <Plus size={14} aria-hidden="true" />
            新增子任務
          </button>
        ) : null}
      </div>
      {isExpanded ? (
        <div id="task-details-subtask-panel" className="mt-1 rounded-md bg-slate-50/45 px-1 py-1" data-task-details-subtask-panel="true">
          {childCount > 0 ? (
            <TaskDetailsSubtaskDragHost
              rootTask={node}
              trackingReference={trackingReference}
              bodyRef={bodyRef}
              onOpenDetails={onOpenDetails}
            />
          ) : (
            <div className="flex min-h-12 items-center justify-center rounded-md border border-dashed border-slate-200 bg-white px-3 text-xs text-slate-400" data-task-details-subtask-empty="true">
              尚無子任務
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};
