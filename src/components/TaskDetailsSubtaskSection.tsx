import React from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Ellipsis, Plus } from 'lucide-react';
import { DndContext, pointerWithin, type DragEndEvent, type DragOverEvent, useDroppable } from '@dnd-kit/core';
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
import { TaskDetailSectionAction, TaskDetailSectionActions, TaskDetailSectionHeader } from './TaskDetailSectionHeader';

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
          className="min-w-0"
          data-task-details-subtask-drag-scope="true"
        >
          <TaskChecklistTree
            parentId={rootTask.id}
            parentPlacementId={trackingReference?.id}
            hostAdapter={hostAdapter}
          />
          <div
            ref={setRootDropNodeRef}
            className={`mt-1 h-1 transition-colors ${isRootDropOver ? 'bg-blue-200/70' : 'bg-transparent'}`}
            data-task-details-root-drop-zone="true"
            data-task-drop-surface-kind="checklist-drop"
            data-task-drop-node-id={rootTask.id}
            data-task-placement-id={rootPlacementId}
          />
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

export type TaskMapAncestor = {
  task: TaskNode;
  placementId: string;
  trackingReferenceId?: string;
};

export type TaskDetailsSubtaskSectionProps = {
  node: TaskNode;
  trackingReference?: TaskTrackingReference | null;
  bodyRef: React.RefObject<HTMLElement | null>;
  ancestorPath: readonly TaskMapAncestor[];
  dateDependencies: readonly { id: string; from: string; to: string }[];
  navigationPending: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onNavigateToAncestor?: (ancestor: TaskMapAncestor) => void;
  canCreateTask?: boolean;
  onCreateChild?: (taskId: string) => void;
  onOpenDetails?: (taskId: string, trackingReferenceId?: string, placementId?: string) => void;
};

export const TaskDetailsSubtaskSection: React.FC<TaskDetailsSubtaskSectionProps> = ({
  node,
  trackingReference,
  bodyRef,
  ancestorPath,
  dateDependencies,
  navigationPending,
  onBack,
  onForward,
  onNavigateToAncestor,
  canCreateTask = false,
  onCreateChild,
  onOpenDetails,
}) => {
  const headingId = React.useId();
  const pathId = React.useId();
  const [isPathExpanded, setIsPathExpanded] = React.useState(false);
  const parent = ancestorPath[ancestorPath.length - 1];
  const navigationActions = [
    { icon: ArrowLeft, label: '返回上一個任務', marker: 'data-task-details-history-back', action: onBack },
    { icon: ArrowRight, label: '前往下一個任務', marker: 'data-task-details-history-forward', action: onForward },
    {
      icon: ArrowUp,
      label: '回到上一階任務',
      marker: 'data-task-details-parent',
      action: parent && onNavigateToAncestor ? () => onNavigateToAncestor(parent) : undefined,
    },
  ];
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
    <section className="task-details-task-map mt-4 min-w-0" aria-labelledby={headingId} data-task-details-subtasks="true" data-task-details-task-map="true">
      <TaskDetailSectionHeader titleContent={<h3 id={headingId}>任務地圖</h3>} />
      <div
        id="task-details-subtask-panel"
        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 pb-1"
        data-task-details-subtask-panel="true"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 border-b border-slate-200 py-1" data-task-details-navigation-row="true">
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="任務導覽" data-task-details-navigation="true">
            {navigationActions.map(({ icon: Icon, label, marker, action }) => (
              <button
                key={marker}
                type="button"
                onClick={action}
                disabled={!action || navigationPending}
                aria-label={label}
                title={label}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-slate-500 transition-colors enabled:hover:bg-slate-100 focus-visible:outline focus-visible:outline-primary disabled:opacity-40"
                {...{ [marker]: 'true' }}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
          {ancestorPath.length > 1 ? (
            <button
              type="button"
              className="task-details-task-map-path-toggle h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-primary"
              aria-label={isPathExpanded ? '收合父任務路徑' : '展開完整父任務路徑'}
              aria-controls={pathId}
              aria-expanded={isPathExpanded}
              onClick={() => setIsPathExpanded(expanded => !expanded)}
            >
              {isPathExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <Ellipsis size={14} aria-hidden="true" />}
            </button>
          ) : null}
          {parent ? (
            <nav
              id={pathId}
              aria-label="任務完整位置"
              className="task-details-task-map-path flex min-w-0 flex-1 items-center gap-x-1 text-xs font-medium text-slate-500"
              data-task-details-parent-path="true"
              data-expanded={isPathExpanded}
            >
              {ancestorPath.map((ancestor, index) => {
                const taskTitle = ancestor.task.title || '未命名任務';
                return (
                  <React.Fragment key={ancestor.placementId}>
                    {index > 0 ? (
                      <span className="task-details-task-map-earlier shrink-0 text-slate-400" aria-hidden="true">/</span>
                    ) : null}
                    <button
                      type="button"
                      disabled={navigationPending || !onNavigateToAncestor}
                      onClick={() => onNavigateToAncestor?.(ancestor)}
                      aria-label={`開啟上層任務：${taskTitle}`}
                      title={taskTitle}
                      className={`task-details-task-map-crumb min-w-0 truncate rounded px-0.5 text-left enabled:hover:underline focus-visible:outline focus-visible:outline-primary ${ancestor === parent ? '' : 'task-details-task-map-earlier'}`}
                      data-task-details-parent-name="true"
                      data-task-details-parent-link="true"
                      data-task-details-parent-id={ancestor.task.id}
                      data-task-id={ancestor.task.id}
                      data-task-description-hover-trigger={ancestor.task.description?.trim() ? 'true' : undefined}
                    >
                      {taskTitle}
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>
          ) : null}
        </div>
        <div className="task-details-task-map-tree min-w-0 pt-1">
          <div className="task-details-task-map-current relative flex min-w-0 items-center gap-1.5" data-has-children={childCount > 0} aria-current="location">
            <span className="task-tree-dot task-details-task-map-origin" aria-hidden="true" />
            <strong className="min-w-0 break-words text-sm font-bold text-black">現在任務位置</strong>
            <TaskDetailSectionActions data-task-details-task-map-actions="true">
              <TaskDetailSectionAction
                onClick={() => onCreateChild?.(node.id)}
                disabled={navigationPending || !canCreateTask || !onCreateChild}
                className="rounded-[5px]"
                title="新增子任務"
                aria-label="新增子任務"
                data-task-details-add-subtask="true"
              >
                <Plus size={14} aria-hidden="true" />
              </TaskDetailSectionAction>
            </TaskDetailSectionActions>
          </div>
          {childCount > 0 ? (
            <TaskDetailsSubtaskDragHost
              rootTask={node}
              trackingReference={trackingReference}
              bodyRef={bodyRef}
              onOpenDetails={onOpenDetails}
            />
          ) : (
            <p className="py-1 pl-6 text-xs text-slate-500" data-task-details-subtask-empty="true">尚無子任務</p>
          )}
        </div>
        {dateDependencies.length > 0 ? (
          <details className="group/task-dates ml-4 text-xs text-slate-500" data-task-details-task-map-date-dependencies="true">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded px-1 py-1.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true">⇢</span>
              日期依賴
              <ChevronDown size={12} aria-hidden="true" className="group-open/task-dates:rotate-180" />
            </summary>
            <ul className="ml-2 space-y-1 border-l border-dashed border-slate-300 pl-2">
              {dateDependencies.map(({ id, from, to }) => (
                <li key={id} className="break-words">{from} → {to}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
};
