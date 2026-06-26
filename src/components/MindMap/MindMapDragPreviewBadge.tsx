import React from 'react';
import type { MindMapDragPreviewModel } from './MindMapDragPreviewLayer';

interface MindMapDragPreviewBadgeProps {
  dragPreview: (MindMapDragPreviewModel & {
    x: number;
    y: number;
    title: string;
  }) | null;
}

const MindMapDragPreviewBadge: React.FC<MindMapDragPreviewBadgeProps> = ({ dragPreview }) => {
  if (!dragPreview) return null;

  return (
    <div
      className="pointer-events-none fixed z-[80] max-w-[260px] rounded-md border border-blue-300 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_16px_32px_rgba(15,23,42,0.18)] ring-4 ring-blue-100 transition-transform duration-75"
      style={{
        left: `${Math.min(dragPreview.x + 14, Math.max(12, window.innerWidth - 288))}px`,
        top: `${Math.min(dragPreview.y + 14, Math.max(12, window.innerHeight - 72))}px`,
      }}
      data-mindmap-drag-preview
      data-node-id={dragPreview.nodeId}
      data-target-node-id={dragPreview.targetNodeId || ''}
      data-target-parent-id={dragPreview.targetParentId || ''}
      data-sibling-before-id={dragPreview.siblingBeforeId || ''}
      data-sibling-after-id={dragPreview.siblingAfterId || ''}
      data-drop-position={dragPreview.dropPosition}
      data-direction={dragPreview.direction || ''}
    >
      <span className="block truncate">{dragPreview.title}</span>
    </div>
  );
};

export default MindMapDragPreviewBadge;
