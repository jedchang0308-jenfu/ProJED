import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface KanbanRootDropZoneProps {
  workspaceId: string;
  boardId: string;
  anchorNodeId?: string;
  isBoardEmpty: boolean;
  canMoveTask: boolean;
  mobileDropActive?: boolean;
  children: React.ReactNode;
}

export const KanbanRootDropZone: React.FC<KanbanRootDropZoneProps> = ({
  workspaceId,
  boardId,
  anchorNodeId,
  isBoardEmpty,
  canMoveTask,
  mobileDropActive = false,
  children,
}) => {
  const dropId = `wbs-root-drop:${boardId}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    disabled: !canMoveTask,
    data: {
      type: 'wbs-root-drop',
      nodeId: anchorNodeId || null,
      workspaceId,
      boardId,
    },
  });
  const dropActive = canMoveTask && (isOver || mobileDropActive);

  return (
    <div
      ref={setNodeRef}
      className={`relative min-w-[270px] flex-shrink-0 transition-colors ${
        isBoardEmpty ? 'flex-1 self-stretch' : 'w-[270px]'
      } ${dropActive && isBoardEmpty ? 'bg-primary/5 ring-2 ring-inset ring-primary/25' : ''}`}
      data-kanban-root-drop-zone="true"
      data-kanban-empty-board-drop={isBoardEmpty ? 'true' : undefined}
      data-workspace-id={workspaceId}
      data-board-id={boardId}
      data-task-drop-node-id={anchorNodeId}
      data-mobile-drop-target={anchorNodeId}
      data-task-drop-surface-kind="root-drop"
      data-desktop-drop-surface="true"
      data-desktop-drop-id={dropId}
      data-empty-board-drop-active={dropActive && isBoardEmpty ? 'true' : undefined}
    >
      {children}
      {dropActive && isBoardEmpty ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary"
          aria-live="polite"
          data-empty-board-drop-feedback="true"
        >
          放開以歸位
        </div>
      ) : null}
    </div>
  );
};
