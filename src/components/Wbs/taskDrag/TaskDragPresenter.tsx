import React from 'react';
import { KanbanInsertionMarker } from '../KanbanInsertionMarker';
import type { MobileTaskAction, TaskDragSessionState } from './taskDragTypes';
import { MOBILE_PREVIEW_FINGER_CLEARANCE_PX } from './taskDragTargetAdapter';

const MOBILE_PREVIEW_HEIGHT_PX = 40;
const MOBILE_PREVIEW_SAFE_TOP_PX = 48;
const MOBILE_PREVIEW_SAFE_BOTTOM_PX = 8;

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
    label: '新增同階任務',
    permission: 'create',
    activeClassName: 'bg-sky-500 text-white',
    idleClassName: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  },
  {
    key: 'add-child',
    label: '新增下階任務',
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
  const previewLeft = Math.min(Math.max(state.pointerX, 124), Math.max(124, viewportWidth - 124));
  const previewMaxTop = Math.max(
    MOBILE_PREVIEW_SAFE_TOP_PX,
    viewportHeight - MOBILE_PREVIEW_HEIGHT_PX - MOBILE_PREVIEW_SAFE_BOTTOM_PX,
  );
  const fingerPreviewTop = state.pointerY
    - MOBILE_PREVIEW_FINGER_CLEARANCE_PX
    - MOBILE_PREVIEW_HEIGHT_PX;
  const previewTop = Math.min(
    previewMaxTop,
    Math.max(MOBILE_PREVIEW_SAFE_TOP_PX, fingerPreviewTop),
  );

  const canUseAction = (permission: 'edit' | 'create' | 'delete') => {
    if (permission === 'edit') return canEditTask;
    if (permission === 'create') return canCreateTask;
    return canDeleteTask;
  };

  return (
    <>
      {state.phase === 'dragging' ? (
        <div
          className="pointer-events-none fixed z-[80] flex h-10 max-w-[240px] -translate-x-1/2 items-center rounded-md border border-primary/25 bg-white px-3 text-sm font-semibold text-slate-800 shadow-xl ring-2 ring-primary/15"
          style={{ left: previewLeft, top: previewTop }}
          data-mobile-drag-preview="true"
          data-task-id={state.nodeId}
          data-task-drag-session-id={state.sessionId}
          data-mobile-preview-anchor="finger"
          data-mobile-preview-finger-clearance={MOBILE_PREVIEW_FINGER_CLEARANCE_PX}
        >
          <div className="truncate">{state.title || '未命名任務'}</div>
        </div>
      ) : null}

      {state.phase === 'dragging' && state.dropIndicatorRect ? (
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
