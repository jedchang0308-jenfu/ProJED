import React from 'react';
import type { TaskStatus } from '../../../types';
import { useWbsStore } from '../../../store/useWbsStore';
import useBoardStore from '../../../store/useBoardStore';
import type { MobileTaskActionContextValue } from '../mobileTaskActionContext';
import { isMobileTaskActionMode } from './taskGesturePolicy';
import { commitTaskDragObservation, type TaskDragCommitDependencies } from './taskDragCommit';
import {
  autoScrollTaskDragSurfaces,
  getTaskIntentPoint,
  MOBILE_RELEASE_FRESHNESS_MS,
  MOBILE_TARGET_RETAIN_PX,
  observationToSessionState,
  readTaskTouchPoint,
  resolveTaskDragObservation,
} from './taskDragTargetAdapter';
import type {
  TaskDragObservation,
  TaskDragSessionState,
  TaskDragSourceKind,
} from './taskDragTypes';

const TASK_DRAG_FAILSAFE_MS = 12000;

const recordTaskDragDebug = (entry: Record<string, unknown>) => {
  if (typeof window === 'undefined' || import.meta.env.MODE !== 'test') return;
  const debugWindow = window as typeof window & { __projedMobileTaskActionDebug?: Record<string, unknown>[] };
  debugWindow.__projedMobileTaskActionDebug = [
    ...(debugWindow.__projedMobileTaskActionDebug || []),
    { ...entry, at: Date.now() },
  ].slice(-60);
};

const createSessionId = () =>
  `task-drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const stateToObservation = (state: TaskDragSessionState): TaskDragObservation => ({
  sessionId: state.sessionId,
  sequence: state.sequence,
  inputMode: state.source.inputMode,
  source: state.source,
  targetKind: state.targetKind,
  targetNodeId: state.hoverTargetId,
  targetBoardId: state.targetBoardId,
  targetWorkspaceId: state.targetWorkspaceId,
  targetSurfaceKind: state.targetSurfaceKind,
  action: state.hoverAction,
  dropPosition: state.dropPosition,
  indicatorRect: state.dropIndicatorRect,
  lockedTargetRect: state.lockedTargetRect,
  pendingTargetId: state.pendingTargetId,
  pendingSince: state.pendingSince,
  lastStableAt: state.lastStableAt,
  pointer: { x: state.pointerX, y: state.pointerY },
  intentPointer: getTaskIntentPoint({ x: state.pointerX, y: state.pointerY }),
  observedAt: Date.now(),
});

const withoutTarget = (observation: TaskDragObservation): TaskDragObservation => ({
  ...observation,
  targetKind: 'none',
  targetNodeId: null,
  targetBoardId: null,
  targetWorkspaceId: null,
  targetSurfaceKind: null,
  action: null,
  dropPosition: null,
  indicatorRect: null,
  lockedTargetRect: null,
  pendingTargetId: null,
  pendingSince: null,
  lastStableAt: null,
});

interface UseTaskDragSessionOptions extends TaskDragCommitDependencies {
  boardSurfaceRef: React.RefObject<HTMLElement | null>;
  onSessionBegin?: () => void;
}

export const useTaskDragSession = (options: UseTaskDragSessionOptions) => {
  const [state, setState] = React.useState<TaskDragSessionState | null>(null);
  const stateRef = React.useRef<TaskDragSessionState | null>(null);
  const dependenciesRef = React.useRef<TaskDragCommitDependencies>(options);
  const onSessionBeginRef = React.useRef(options.onSessionBegin);
  const terminalSessionIdsRef = React.useRef<string[]>([]);
  const failsafeRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollFrameRef = React.useRef<number | null>(null);
  const autoScrollPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const lastMoveSampleRef = React.useRef<{ x: number; y: number } | null>(null);
  const suppressCancelledTouchClickRef = React.useRef(false);

  React.useLayoutEffect(() => {
    dependenciesRef.current = options;
    onSessionBeginRef.current = options.onSessionBegin;
  }, [options]);

  const stopAutoScroll = React.useCallback(() => {
    autoScrollPointRef.current = null;
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }, []);

  const clearFailsafe = React.useCallback(() => {
    if (!failsafeRef.current) return;
    clearTimeout(failsafeRef.current);
    failsafeRef.current = null;
  }, []);

  const applyState = React.useCallback((next: TaskDragSessionState | null) => {
    clearFailsafe();
    if (!next) {
      stopAutoScroll();
      lastMoveSampleRef.current = null;
      document.body.removeAttribute('data-task-drag-touch-active');
    } else {
      document.body.setAttribute('data-task-drag-touch-active', 'true');
    }
    stateRef.current = next;
    setState(next);
    if (next) {
      failsafeRef.current = window.setTimeout(() => {
        const active = stateRef.current;
        if (!active) return;
        recordTaskDragDebug({ type: 'failsafe:timeout', sessionId: active.sessionId, nodeId: active.nodeId });
        stateRef.current = null;
        setState(null);
        stopAutoScroll();
        document.body.removeAttribute('data-task-drag-touch-active');
        failsafeRef.current = null;
      }, TASK_DRAG_FAILSAFE_MS);
    }
  }, [clearFailsafe, stopAutoScroll]);

  const hasTerminated = React.useCallback((sessionId: string) =>
    terminalSessionIdsRef.current.includes(sessionId), []);

  const markTerminated = React.useCallback((sessionId: string) => {
    if (hasTerminated(sessionId)) return false;
    terminalSessionIdsRef.current = [...terminalSessionIdsRef.current, sessionId].slice(-50);
    return true;
  }, [hasTerminated]);

  const resolveObservation = React.useCallback((
    activeState: TaskDragSessionState,
    point: { x: number; y: number },
  ) => resolveTaskDragObservation({
    point,
    state: activeState,
    canMoveTask: dependenciesRef.current.canMoveTask,
  }), []);

  const startAutoScroll = React.useCallback((point: { x: number; y: number }) => {
    autoScrollPointRef.current = point;
    if (autoScrollFrameRef.current !== null) return;

    const tick = () => {
      autoScrollFrameRef.current = null;
      const currentPoint = autoScrollPointRef.current;
      const activeState = stateRef.current;
      if (!currentPoint || !activeState || hasTerminated(activeState.sessionId)) return;

      const boardSurface = options.boardSurfaceRef.current
        || document.querySelector<HTMLElement>('[data-mobile-pan-surface="board"]');
      const scrollResult = autoScrollTaskDragSurfaces({
        point: currentPoint,
        boardSurface,
      });
      recordTaskDragDebug({
        type: 'edge-scroll:attempt',
        sessionId: activeState.sessionId,
        point: currentPoint,
        hasBoardSurface: Boolean(boardSurface),
        ...scrollResult,
      });
      if (!scrollResult.didScroll) return;
      recordTaskDragDebug({ type: 'edge-scroll', sessionId: activeState.sessionId, point: currentPoint, ...scrollResult });

      const latestState = stateRef.current;
      if (latestState && !hasTerminated(latestState.sessionId)) {
        applyState(observationToSessionState(latestState, resolveObservation(latestState, currentPoint)));
        autoScrollFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }, [applyState, hasTerminated, options.boardSurfaceRef, resolveObservation]);

  const begin = React.useCallback<MobileTaskActionContextValue['begin']>((
    task: { id: string; title?: string; status?: TaskStatus },
    event: React.TouchEvent,
    sourceKind: TaskDragSourceKind = 'kanban-card',
  ) => {
    if (!isMobileTaskActionMode()) return false;
    const permissions = dependenciesRef.current;
    if (!permissions.canMoveTask && !permissions.canEditTask && !permissions.canCreateTask && !permissions.canDeleteTask) {
      return false;
    }
    const point = readTaskTouchPoint(event);
    if (!point) return false;
    const node = useWbsStore.getState().nodes[task.id];
    if (!node || node.isArchived) return false;

    const previousState = stateRef.current;
    if (previousState) {
      markTerminated(previousState.sessionId);
      applyState(null);
    }

    event.preventDefault();
    event.stopPropagation();
    useBoardStore.getState().setContextMenuState(null);
    onSessionBeginRef.current?.();

    const sessionId = createSessionId();
    lastMoveSampleRef.current = null;
    const next: TaskDragSessionState = {
      sessionId,
      sequence: 0,
      phase: 'dragging',
      source: {
        nodeId: node.id,
        kind: sourceKind,
        inputMode: 'touch',
        originBoardId: node.boardId || null,
        originWorkspaceId: node.workspaceId || null,
      },
      nodeId: node.id,
      title: node.title || task.title || '未命名任務',
      status: node.status || task.status || 'todo',
      pointerX: point.x,
      pointerY: point.y,
      originX: point.x,
      originY: point.y,
      hasMoved: false,
      hoverAction: null,
      hoverTargetId: null,
      targetBoardId: null,
      targetWorkspaceId: null,
      targetSurfaceKind: null,
      targetKind: 'none',
      dropPosition: null,
      dropIndicatorRect: null,
      lockedTargetRect: null,
      pendingTargetId: null,
      pendingSince: null,
      lastStableAt: null,
      terminal: null,
    };
    recordTaskDragDebug({ type: 'begin', sessionId, nodeId: node.id, sourceKind });
    applyState(next);
    return true;
  }, [applyState, markTerminated]);

  const moveAtPoint = React.useCallback((point: { x: number; y: number }) => {
    const activeState = stateRef.current;
    if (!activeState || activeState.phase !== 'dragging' || hasTerminated(activeState.sessionId)) return;
    const lastSample = lastMoveSampleRef.current;
    if (lastSample
      && lastSample.x === point.x
      && lastSample.y === point.y) return;
    lastMoveSampleRef.current = point;
    recordTaskDragDebug({ type: 'move', sessionId: activeState.sessionId, nodeId: activeState.nodeId, point });
    const moved = activeState.hasMoved
      || Math.hypot(point.x - activeState.originX, point.y - activeState.originY) > 8;
    const observation = resolveObservation(activeState, point);
    recordTaskDragDebug({
      type: 'observation',
      sessionId: activeState.sessionId,
      nodeId: activeState.nodeId,
      point,
      intentPoint: observation.intentPointer,
      targetKind: observation.targetKind,
      targetNodeId: observation.targetNodeId,
      pendingTargetId: observation.pendingTargetId,
    });
    const nextState = observationToSessionState({ ...activeState, hasMoved: moved }, observation);
    applyState(nextState);
    if (nextState.targetKind === 'mobile-action') stopAutoScroll();
    else startAutoScroll(point);
  }, [applyState, hasTerminated, resolveObservation, startAutoScroll, stopAutoScroll]);

  const move = React.useCallback<MobileTaskActionContextValue['move']>((event) => {
    if (stateRef.current?.phase !== 'dragging') return;
    const point = readTaskTouchPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    moveAtPoint(point);
  }, [moveAtPoint]);

  const finish = React.useCallback(async (
    activeState: TaskDragSessionState,
    observation: TaskDragObservation,
  ) => {
    if (!markTerminated(activeState.sessionId)) {
      recordTaskDragDebug({ type: 'terminal:ignored', sessionId: activeState.sessionId });
      return;
    }
    applyState(null);
    recordTaskDragDebug({
      type: observation.targetKind === 'mobile-action' ? 'end:action' : 'end:drop',
      sessionId: activeState.sessionId,
      nodeId: activeState.nodeId,
      targetKind: observation.targetKind,
      action: observation.action,
      targetNodeId: observation.targetNodeId,
    });
    const result = await commitTaskDragObservation({
      observation,
      dependencies: dependenciesRef.current,
    });
    recordTaskDragDebug({
      type: 'terminal:complete',
      sessionId: activeState.sessionId,
      nodeId: activeState.nodeId,
      ...result,
    });
  }, [applyState, markTerminated]);

  const endAtPoint = React.useCallback((point: { x: number; y: number } | null) => {
    const activeState = stateRef.current;
    if (!activeState || hasTerminated(activeState.sessionId)) return;
    if (activeState.phase === 'armed') return;

    if (!activeState.hasMoved) {
      stopAutoScroll();
      const armedState: TaskDragSessionState = {
        ...activeState,
        phase: 'armed',
        hoverAction: null,
        hoverTargetId: null,
        targetBoardId: null,
        targetWorkspaceId: null,
        targetSurfaceKind: null,
        targetKind: 'none',
        dropPosition: null,
        dropIndicatorRect: null,
        lockedTargetRect: null,
        pendingTargetId: null,
        pendingSince: null,
        lastStableAt: null,
      };
      recordTaskDragDebug({ type: 'end:armed', sessionId: activeState.sessionId, nodeId: activeState.nodeId });
      applyState(armedState);
      return;
    }

    if (!point) {
      void finish(activeState, withoutTarget(stateToObservation(activeState)));
      return;
    }

    const latestObservation = resolveObservation(activeState, point);
    let releaseObservation = latestObservation;
    if (latestObservation.targetKind === 'task-position') {
      const intentPoint = getTaskIntentPoint(point);
      const rect = latestObservation.lockedTargetRect;
      const fresh = latestObservation.lastStableAt !== null
        && Date.now() - latestObservation.lastStableAt <= MOBILE_RELEASE_FRESHNESS_MS;
      const retained = Boolean(rect
        && intentPoint.x >= rect.left - MOBILE_TARGET_RETAIN_PX
        && intentPoint.x <= rect.right + MOBILE_TARGET_RETAIN_PX
        && intentPoint.y >= rect.top - MOBILE_TARGET_RETAIN_PX
        && intentPoint.y <= rect.bottom + MOBILE_TARGET_RETAIN_PX);
      if (!fresh || !retained) releaseObservation = withoutTarget(latestObservation);
    }
    void finish(activeState, releaseObservation);
  }, [applyState, finish, hasTerminated, resolveObservation, stopAutoScroll]);

  const end = React.useCallback<MobileTaskActionContextValue['end']>((event) => {
    if (stateRef.current?.phase !== 'dragging') return;
    const point = readTaskTouchPoint(event);
    event.preventDefault();
    event.stopPropagation();
    endAtPoint(point);
  }, [endAtPoint]);

  const cancelWithReason = React.useCallback((reason: string, event?: React.TouchEvent) => {
    const activeState = stateRef.current;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!activeState) return;
    if (!markTerminated(activeState.sessionId)) return;
    suppressCancelledTouchClickRef.current = true;
    recordTaskDragDebug({ type: 'cancel:reset', reason, sessionId: activeState.sessionId, nodeId: activeState.nodeId });
    applyState(null);
  }, [applyState, markTerminated]);

  const cancel = React.useCallback<MobileTaskActionContextValue['cancel']>((event) => {
    cancelWithReason('manual', event);
  }, [cancelWithReason]);

  const activateAction = React.useCallback<MobileTaskActionContextValue['activateAction']>((action) => {
    const activeState = stateRef.current;
    if (!activeState || hasTerminated(activeState.sessionId)) return;
    const observation: TaskDragObservation = {
      ...withoutTarget(stateToObservation(activeState)),
      targetKind: 'mobile-action',
      action,
    };
    recordTaskDragDebug({ type: 'click:action', sessionId: activeState.sessionId, nodeId: activeState.nodeId, action });
    void finish(activeState, observation);
  }, [finish, hasTerminated]);

  React.useEffect(() => {
    const handleMove = (event: TouchEvent) => move(event as unknown as React.TouchEvent);
    const handleEnd = (event: TouchEvent) => end(event as unknown as React.TouchEvent);
    const handleCancel = (event: TouchEvent) => cancelWithReason('touchcancel', event as unknown as React.TouchEvent);
    const options = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener('touchmove', handleMove, options);
    window.addEventListener('touchend', handleEnd, options);
    window.addEventListener('touchcancel', handleCancel, options);
    return () => {
      window.removeEventListener('touchmove', handleMove, options);
      window.removeEventListener('touchend', handleEnd, options);
      window.removeEventListener('touchcancel', handleCancel, options);
    };
  }, [cancelWithReason, end, move]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || stateRef.current?.phase !== 'dragging') return;
      if (event.cancelable) event.preventDefault();
      moveAtPoint({ x: event.clientX, y: event.clientY });
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || stateRef.current?.phase !== 'dragging') return;
      endAtPoint({ x: event.clientX, y: event.clientY });
    };
    const pointerOptions = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener('pointermove', handlePointerMove, pointerOptions);
    window.addEventListener('pointerup', handlePointerUp, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, pointerOptions);
      window.removeEventListener('pointerup', handlePointerUp, true);
    };
  }, [endAtPoint, moveAtPoint]);

  React.useEffect(() => {
    if (state?.phase !== 'armed') return undefined;
    const dismissIfOutsideRail = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-mobile-task-action-rail="true"]')) return;
      cancelWithReason('armed-outside-tap');
    };
    document.addEventListener('pointerdown', dismissIfOutsideRail, true);
    document.addEventListener('touchstart', dismissIfOutsideRail, true);
    return () => {
      document.removeEventListener('pointerdown', dismissIfOutsideRail, true);
      document.removeEventListener('touchstart', dismissIfOutsideRail, true);
    };
  }, [cancelWithReason, state?.phase]);

  React.useEffect(() => {
    const handleTouchStart = () => {
      suppressCancelledTouchClickRef.current = false;
    };
    const handleClick = (event: MouseEvent) => {
      if (!suppressCancelledTouchClickRef.current) return;
      suppressCancelledTouchClickRef.current = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      recordTaskDragDebug({ type: 'cancel:compatibility-click-suppressed' });
    };
    document.addEventListener('touchstart', handleTouchStart, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') cancelWithReason('visibilitychange');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelWithReason('escape');
    };
    const handlePointerCancel = () => cancelWithReason('pointercancel');
    const handleBlur = () => cancelWithReason('blur');
    const handlePageHide = () => cancelWithReason('pagehide');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [cancelWithReason]);

  React.useEffect(() => () => {
    clearFailsafe();
    stopAutoScroll();
    document.body.removeAttribute('data-task-drag-touch-active');
    stateRef.current = null;
  }, [clearFailsafe, stopAutoScroll]);

  const contextValue = React.useMemo<MobileTaskActionContextValue>(() => ({
    state,
    begin,
    move,
    end,
    cancel,
    activateAction,
    isActive: (nodeId?: string) => {
      const activeState = stateRef.current;
      if (!activeState || activeState.phase !== 'dragging') return false;
      return nodeId ? activeState.nodeId === nodeId : true;
    },
  }), [activateAction, begin, cancel, end, move, state]);

  return {
    state,
    contextValue,
    cancel,
    activateAction,
  };
};
