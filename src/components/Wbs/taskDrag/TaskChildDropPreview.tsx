import React from 'react';
import { KanbanInsertionMarker } from '../KanbanInsertionMarker';
import { TaskOriginTitleField } from './TaskOriginTitleField';
import type {
  TaskChildDropPreviewRect,
  TaskChildIntentPhase,
  TaskDragOriginFieldRect,
  TaskDropSurfaceKind,
} from './taskDragTypes';

interface TaskChildDropPreviewProps {
  phase: Exclude<TaskChildIntentPhase, 'none'>;
  sourceTitle: string;
  targetNodeId: string;
  targetTitle: string;
  previewRect: TaskChildDropPreviewRect;
  inputMode: 'mouse' | 'touch';
  isOrigin: boolean;
  originFieldRect: TaskDragOriginFieldRect | null;
  sourceSurfaceKind: TaskDropSurfaceKind;
}

export const TaskChildDropPreview: React.FC<TaskChildDropPreviewProps> = ({
  phase,
  sourceTitle,
  targetNodeId,
  targetTitle,
  previewRect,
  inputMode,
  isOrigin,
  originFieldRect,
  sourceSurfaceKind,
}) => {
  const armed = phase === 'armed';
  const fallbackOriginHeight = sourceSurfaceKind === 'checklist-row' ? 20 : 24;
  const resolvedOriginRect = isOrigin
    ? originFieldRect || {
      left: previewRect.insertion.left,
      top: previewRect.insertion.top - fallbackOriginHeight / 2,
      width: previewRect.insertion.width,
      height: fallbackOriginHeight,
    }
    : null;
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[94]"
        data-task-child-drop-preview="true"
        data-task-child-drop-phase={phase}
        data-task-child-drop-target={targetNodeId}
        data-task-child-drop-input={inputMode}
        aria-hidden="true"
      >
        <div
          className="fixed"
          style={{
            left: previewRect.safe.left,
            top: previewRect.safe.top,
            width: previewRect.safe.width,
            height: previewRect.safe.height,
          }}
          data-task-child-drop-hit-scope="true"
          data-task-child-drop-safe-width={Math.round(previewRect.safe.width)}
          data-task-child-drop-safe-height={Math.round(previewRect.safe.height)}
        />

        {armed ? (
          <>
            <div
              className={`fixed ${resolvedOriginRect ? '' : '-translate-y-1/2'}`}
              style={{
                left: resolvedOriginRect?.left ?? previewRect.insertion.left,
                top: resolvedOriginRect?.top ?? previewRect.insertion.top,
                width: resolvedOriginRect?.width ?? previewRect.insertion.width,
                height: resolvedOriginRect?.height,
              }}
              data-task-child-drop-insertion-preview="true"
              data-task-child-drop-insertion-left={Math.round(previewRect.insertion.left)}
              data-task-child-drop-origin={resolvedOriginRect ? 'true' : undefined}
              data-task-child-drop-noop={resolvedOriginRect ? 'true' : undefined}
            >
              {resolvedOriginRect ? (
                <TaskOriginTitleField
                  title={sourceTitle || '未命名任務'}
                  surfaceKind={sourceSurfaceKind}
                  data-task-child-drop-origin-field="true"
                />
              ) : (
                <KanbanInsertionMarker compact className="py-0" />
              )}
            </div>
          </>
        ) : null}
      </div>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-task-child-drop-live-status="true"
        data-task-child-drop-live-phase={phase}
      >
        {armed
          ? resolvedOriginRect
            ? `「${sourceTitle || '未命名任務'}」將保留在原位置。`
            : `已鎖定「${targetTitle}」為父任務，放開後「${sourceTitle || '未命名任務'}」會移入其子任務。`
          : `已進入「${targetTitle}」的子任務候選區，持續停留一秒即可鎖定。`}
      </div>
    </>
  );
};
