import React from 'react';
import { KanbanInsertionMarker } from '../KanbanInsertionMarker';
import type { TaskChildDropPreviewRect, TaskChildIntentPhase } from './taskDragTypes';

interface TaskChildDropPreviewProps {
  phase: Exclude<TaskChildIntentPhase, 'none'>;
  sourceTitle: string;
  targetNodeId: string;
  targetTitle: string;
  previewRect: TaskChildDropPreviewRect;
  inputMode: 'mouse' | 'touch';
}

export const TaskChildDropPreview: React.FC<TaskChildDropPreviewProps> = ({
  phase,
  sourceTitle,
  targetNodeId,
  targetTitle,
  previewRect,
  inputMode,
}) => {
  const armed = phase === 'armed';
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

        {previewRect.scope ? (
          <div
            className="fixed rounded-lg ring-1 ring-inset ring-primary-400"
            style={{
              left: previewRect.scope.left,
              top: previewRect.scope.top,
              width: previewRect.scope.width,
              height: previewRect.scope.height,
            }}
            data-task-child-drop-scope-frame="true"
          />
        ) : null}

        <div
          className="fixed rounded-md bg-primary-50/60 ring-2 ring-inset ring-primary-500"
          style={{
            left: previewRect.parent.left,
            top: previewRect.parent.top,
            width: previewRect.parent.width,
            height: previewRect.parent.height,
          }}
          data-task-child-drop-parent-frame="true"
          data-task-child-drop-source-frame="true"
        />

        {previewRect.subtree ? (
          <div
            className="fixed rounded-md ring-1 ring-inset ring-primary-400"
            style={{
              left: previewRect.subtree.left,
              top: previewRect.subtree.top,
              width: previewRect.subtree.width,
              height: previewRect.subtree.height,
            }}
            data-task-child-drop-subtree-frame="true"
          />
        ) : null}

        {armed ? (
          <div
            className="fixed -translate-y-1/2"
            style={{
              left: previewRect.insertion.left,
              top: previewRect.insertion.top,
              width: previewRect.insertion.width,
            }}
            data-task-child-drop-insertion-preview="true"
            data-task-child-drop-insertion-left={Math.round(previewRect.insertion.left)}
          >
            <KanbanInsertionMarker compact className="py-0" />
          </div>
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
          ? `已鎖定「${targetTitle}」為父任務，放開後「${sourceTitle || '未命名任務'}」會移入其子任務。`
          : `已進入「${targetTitle}」的子任務候選區，持續停留一秒即可鎖定。`}
      </div>
    </>
  );
};
