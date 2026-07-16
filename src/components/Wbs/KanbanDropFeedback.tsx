import React from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import {
  kanbanParentKey,
  type KanbanDropPhase,
} from './kanbanDropIntent';
import { useKanbanDropIntent } from './kanbanDropIntentContext';

const TASK_DRAG_TYPES = ['wbs-column', 'wbs-card', 'wbs-checklist'];

export const useKanbanParentGroupFeedback = (parentId: string | null) => {
  const { state } = useKanbanDropIntent();
  const parentKey = kanbanParentKey(parentId);
  let phase: KanbanDropPhase | null = null;

  if (state.phase === 'arming' && kanbanParentKey(state.candidateParentId) === parentKey) phase = 'arming';
  if (state.phase === 'locked' && kanbanParentKey(state.lockedParentId) === parentKey) phase = 'locked';
  if (state.phase === 'invalid' && state.target?.parentKey === parentKey) phase = 'invalid';

  return {
    state,
    phase,
    parentKey,
    className: phase === 'locked'
      ? 'ring-2 ring-primary/70 ring-offset-1'
      : phase === 'arming'
        ? 'ring-2 ring-amber-400/80 ring-offset-1'
        : phase === 'invalid'
          ? 'ring-2 ring-rose-400/80 ring-offset-1'
          : '',
  };
};

export const KanbanAnchorIndicator: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const { state } = useKanbanDropIntent();
  const visible = (
    (state.phase === 'same-parent' || state.phase === 'locked') &&
    state.anchorNodeId === nodeId &&
    (state.position === 'before' || state.position === 'after')
  );
  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none absolute left-1 right-1 z-30 h-0.5 rounded-full bg-primary shadow-[0_0_0_1px_rgba(99,102,241,0.2)] ${
        state.position === 'after' ? '-bottom-1' : '-top-1'
      }`}
      data-kanban-drop-indicator="true"
      data-kanban-drop-position={state.position}
      data-kanban-drop-parent-id={state.target?.parentKey}
    />
  );
};

export const KanbanAppendIndicator: React.FC<{ parentId: string | null }> = ({ parentId }) => {
  const { state } = useKanbanDropIntent();
  const visible = (
    (state.phase === 'same-parent' || state.phase === 'locked') &&
    state.position === 'append' &&
    state.target?.parentKey === kanbanParentKey(parentId) &&
    state.targetKind === 'parent-group'
  );
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none mt-1 h-0.5 w-full rounded-full bg-primary"
      data-kanban-drop-indicator="true"
      data-kanban-drop-position="append"
      data-kanban-drop-parent-id={kanbanParentKey(parentId)}
      data-kanban-target-parent-id={parentId}
    />
  );
};

export const KanbanChildEmptyLane: React.FC<{
  parentId: string;
}> = ({ parentId }) => {
  const { active } = useDndContext();
  const { state, isTaskDragActive } = useKanbanDropIntent();
  const activeType = active?.data.current?.type;
  const activeNodeId = active?.data.current?.nodeId || state.sourceNodeId;
  const enabled = isTaskDragActive && (
    TASK_DRAG_TYPES.includes(activeType || '') || active?.data.current?.source === 'task-workbench' || Boolean(state.sourceNodeId)
  ) && activeNodeId !== parentId;
  const { setNodeRef, isOver } = useDroppable({
    id: `${parentId}-child-empty-lane`,
    disabled: !enabled,
    data: {
      type: 'wbs-child-empty-lane',
      targetKind: 'child-empty-lane',
      parentId,
      nodeId: parentId,
      position: 'append',
    },
  });
  const isCurrent = state.target?.kind === 'child-empty-lane' && state.target.parentId === parentId;
  const isAppendTarget = isCurrent && state.position === 'append';
  const showInsertionLine = Boolean(
    isAppendTarget &&
    state.target?.valid &&
    (state.phase === 'same-parent' || state.phase === 'arming' || state.phase === 'locked')
  );
  const invalid = isCurrent && state.phase === 'invalid';

  if (!enabled) return null;

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-1 -bottom-1.5 z-30 flex h-3 items-center"
      data-kanban-child-empty-lane="true"
      data-kanban-parent-group={kanbanParentKey(parentId)}
      data-kanban-parent-lock-state={isCurrent ? state.phase : undefined}
      data-kanban-parent-lock-progress={isCurrent ? state.progress.toFixed(3) : undefined}
      data-kanban-drop-parent-id={kanbanParentKey(parentId)}
      data-kanban-drop-indicator={showInsertionLine ? 'true' : undefined}
      data-kanban-drop-position="append"
      data-kanban-drop-invalid-reason={invalid ? state.invalidReason || undefined : undefined}
      data-mobile-child-empty-lane="true"
      data-kanban-target-parent-id={parentId}
    >
      {showInsertionLine ? (
        <div
          className="pointer-events-none h-0.5 w-full rounded-full bg-primary shadow-[0_0_0_1px_rgba(99,102,241,0.2)]"
          data-kanban-empty-lane-line="true"
          data-kanban-empty-lane-current={isOver ? 'true' : undefined}
        />
      ) : null}
    </div>
  );
};
