import React from 'react';
import { KanbanInsertionMarker } from '../KanbanInsertionMarker';
import type { MobileTaskAction, TaskDragSessionState } from './taskDragTypes';
import { MOBILE_PREVIEW_FINGER_CLEARANCE_PX } from './taskDragTargetAdapter';
import { taskDragSourceKindToSurfaceKind } from './taskDropIntent';
import { TaskOriginTitleField } from './TaskOriginTitleField';
import { TaskChildDropPreview } from './TaskChildDropPreview';
import {
  resolvePointerUpperRightOverlayPosition,
  TASK_DRAG_OVERLAY_POINTER_GAP_PX,
} from './taskDragOverlayPosition';

const MOBILE_PREVIEW_HEIGHT_PX = 40;
const MOBILE_PREVIEW_SAFE_TOP_PX = 48;
const MOBILE_PREVIEW_SAFE_BOTTOM_PX = 8;
const MOBILE_CHILD_PREVIEW_FINGER_CLEARANCE_PX = 16;

const mobileActionItems: Array<{
  key: MobileTaskAction;
  label: string;
  permission: 'edit' | 'create' | 'delete';
  activeClassName: string;
  idleClassName: string;
}> = [
  {
    key: 'toggle-complete',
    label: '標示完成',
    permission: 'edit',
    activeClassName: 'bg-emerald-500 text-white',
    idleClassName: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  {
    key: 'add-sibling',
    label: '新增並列任務',
    permission: 'create',
    activeClassName: 'bg-sky-500 text-white',
    idleClassName: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  },
  {
    key: 'add-child',
    label: '新增子任務',
    permission: 'create',
    activeClassName: 'bg-indigo-500 text-white',
    idleClassName: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  },
  {
    key: 'delete',
    label: '刪除任務',
    permission: 'delete',
    activeClassName: 'bg-red-500 text-white',
    idleClassName: 'bg-red-50 text-red-600 hover:bg-red-100',
  },
];

interface TaskDragPresenterProps {
  state: TaskDragSessionState | null;
  canEditTask: boolean;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  onAction: (action: MobileTaskAction) => void;
}

export const TaskDragPresenter: React.FC<TaskDragPresenterProps> = ({
  state,
  canEditTask,
  canCreateTask,
  canDeleteTask,
  onAction,
}) => {
  if (!state) return null;

  const viewportWidth = typeof window === 'undefined' ? 390 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 844 : window.innerHeight;
  const previewWidth = Math.min(240, Math.max(0, viewportWidth - 16));
  const previewHorizontalPosition = resolvePointerUpperRightOverlayPosition({
    pointer: { x: state.pointerX, y: state.pointerY },
    overlay: { width: previewWidth, height: MOBILE_PREVIEW_HEIGHT_PX },
    viewport: { left: 0, top: 0, width: viewportWidth, height: viewportHeight },
  });
  const previewMaxTop = Math.max(
    MOBILE_PREVIEW_SAFE_TOP_PX,
    viewportHeight - MOBILE_PREVIEW_HEIGHT_PX - MOBILE_PREVIEW_SAFE_BOTTOM_PX,
  );
  const previewFingerClearance = state.childIntentPhase === 'none'
    ? MOBILE_PREVIEW_FINGER_CLEARANCE_PX
    : MOBILE_CHILD_PREVIEW_FINGER_CLEARANCE_PX;
  const fingerPreviewTop = state.pointerY
    - previewFingerClearance
    - MOBILE_PREVIEW_HEIGHT_PX;
  const previewTop = Math.min(
    previewMaxTop,
    Math.max(MOBILE_PREVIEW_SAFE_TOP_PX, fingerPreviewTop),
  );
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(state.source.kind);

  const canUseAction = (permission: 'edit' | 'create' | 'delete') => {
    if (permission === 'edit') return canEditTask;
    if (permission === 'create') return canCreateTask;
    return canDeleteTask;
  };

  return (
    <>
      {state.phase === 'dragging' ? (
        <div
          className="pointer-events-none fixed z-[80] flex h-10 w-[240px] max-w-[calc(100vw-1rem)] items-center rounded-md border border-primary/25 bg-white px-3 text-sm font-semibold text-slate-800 shadow-xl ring-2 ring-primary/15"
          style={{ left: previewHorizontalPosition.left, top: previewTop }}
          data-mobile-drag-preview="true"
          data-task-id={state.nodeId}
          data-task-drag-session-id={state.sessionId}
          data-mobile-preview-anchor="finger"
          data-mobile-preview-placement="upper-right"
          data-mobile-preview-edge-placement={previewHorizontalPosition.placement}
          data-mobile-preview-pointer-gap={TASK_DRAG_OVERLAY_POINTER_GAP_PX}
          data-mobile-preview-finger-clearance={previewFingerClearance}
        >
          <div className="truncate">{state.title || '未命名任務'}</div>
        </div>
      ) : null}

      {state.phase === 'dragging'
      && state.childIntentPhase !== 'none'
      && state.childTargetId
      && state.childTargetTitle
      && state.childPreviewRect ? (
        <TaskChildDropPreview
          phase={state.childIntentPhase}
          sourceTitle={state.title || '未命名任務'}
          targetNodeId={state.childTargetId}
          targetTitle={state.childTargetTitle}
          previewRect={state.childPreviewRect}
          inputMode="touch"
        />
      ) : null}

      {state.phase === 'dragging'
      && state.childIntentPhase !== 'armed'
      && state.originFieldRect
      && sourceSurfaceKind ? (
        <div
          className="pointer-events-none fixed z-[90]"
          style={{
            left: state.originFieldRect.left,
            top: state.originFieldRect.top,
            width: state.originFieldRect.width,
            height: state.originFieldRect.height,
          }}
          data-mobile-drop-origin="true"
          data-mobile-drop-noop="true"
          data-mobile-drop-target={state.nodeId}
          data-mobile-drop-surface-kind={sourceSurfaceKind}
          data-mobile-drop-feedback-layer="fixed-overlay"
        >
          <TaskOriginTitleField
            title={state.title || '未命名任務'}
            surfaceKind={sourceSurfaceKind}
            data-mobile-origin-field="true"
          />
        </div>
      ) : state.phase === 'dragging'
        && state.childIntentPhase !== 'armed'
        && state.dropIndicatorRect ? (
        <div
          className="pointer-events-none fixed z-[90] -translate-y-1/2"
          style={{
            left: state.dropIndicatorRect.left,
            top: state.dropIndicatorRect.top,
            width: state.dropIndicatorRect.width,
          }}
          data-mobile-drop-indicator="true"
          data-mobile-drop-target={state.hoverTargetId || undefined}
          data-mobile-drop-position={state.dropPosition || undefined}
          data-mobile-drop-surface-kind={state.targetSurfaceKind || undefined}
        >
          <KanbanInsertionMarker compact className="py-0" />
        </div>
      ) : null}

      <div
        className="fixed left-1/2 z-[95] flex w-[calc(100vw-0.5rem)] max-w-[430px] -translate-x-1/2 gap-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
        data-mobile-task-action-rail="true"
        data-mobile-task-action-rail-placement="top"
        data-mobile-task-action-rail-mode={state.phase}
      >
        {mobileActionItems.map((item) => {
          const active = state.hoverAction === item.key;
          const label = item.key === 'toggle-complete' && state.status === 'completed'
            ? '取消完成'
            : item.label;
          return (
            <button
              key={item.key}
              type="button"
              disabled={!canUseAction(item.permission)}
              title={label}
              aria-label={label}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAction(item.key);
              }}
              className={`flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-center border-r border-slate-200 px-1 text-center text-[12px] font-semibold leading-tight backdrop-blur transition last:border-r-0 ${
                active ? item.activeClassName : item.idleClassName
              } disabled:cursor-not-allowed disabled:opacity-35`}
              data-mobile-task-action={item.key}
              data-mobile-task-action-label={label}
            >
              <span className="block w-full min-w-0 truncate" data-mobile-task-action-text="true">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
};
