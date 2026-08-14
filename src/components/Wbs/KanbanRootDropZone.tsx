import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface KanbanRootDropZoneProps {
  boardId: string;
  anchorNodeId?: string;
  canMoveTask: boolean;
  children: React.ReactNode;
}

export const KanbanRootDropZone: React.FC<KanbanRootDropZoneProps> = ({
  boardId,
  anchorNodeId,
  canMoveTask,
  children,
}) => {
  const dropId = `wbs-root-drop:${boardId}`;
  const { setNodeRef } = useDroppable({
    id: dropId,
    disabled: !canMoveTask || !anchorNodeId,
    data: {
      type: 'wbs-root-drop',
      nodeId: anchorNodeId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className="w-[270px] flex-shrink-0"
      data-kanban-root-drop-zone="true"
      data-task-drop-node-id={anchorNodeId}
      data-mobile-drop-target={anchorNodeId}
      data-task-drop-surface-kind={anchorNodeId ? 'root-drop' : undefined}
      data-desktop-drop-surface={anchorNodeId ? 'true' : undefined}
      data-desktop-drop-id={anchorNodeId ? dropId : undefined}
    >
      {children}
    </div>
  );
};
