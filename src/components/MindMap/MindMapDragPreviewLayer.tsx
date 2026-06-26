import React from 'react';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';

export interface MindMapDragPreviewModel {
  nodeId: string;
  targetNodeId?: string;
  targetParentId?: string;
  siblingBeforeId?: string;
  siblingAfterId?: string;
  dropPosition: MindMapDropMode | 'root';
  direction?: MindMapDirection;
  connectorPath?: string;
  insertionPreview?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface MindMapDragPreviewLayerProps {
  dragPreview: MindMapDragPreviewModel | null;
}

const MindMapDragPreviewLayer: React.FC<MindMapDragPreviewLayerProps> = ({ dragPreview }) => {
  if (!dragPreview) return null;

  return (
    <>
      {dragPreview.connectorPath ? (
        <svg
          className="pointer-events-none absolute inset-0 z-[70] h-full w-full overflow-visible"
          aria-hidden="true"
          data-mindmap-drop-preview-overlay
          data-mindmap-drop-preview-coordinate-space="map-local"
        >
          <path
            d={dragPreview.connectorPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 6"
            strokeLinecap="round"
            data-mindmap-drop-preview
            data-mindmap-drop-preview-coordinate-space="map-local"
            data-target-node-id={dragPreview.targetNodeId || ''}
            data-target-parent-id={dragPreview.targetParentId || ''}
            data-sibling-before-id={dragPreview.siblingBeforeId || ''}
            data-sibling-after-id={dragPreview.siblingAfterId || ''}
            data-drop-position={dragPreview.dropPosition}
            data-direction={dragPreview.direction || ''}
          />
        </svg>
      ) : null}

      {dragPreview.insertionPreview ? (
        <div
          className="pointer-events-none absolute z-[75] rounded-full bg-sky-300/80 shadow-[0_0_0_4px_rgba(125,211,252,0.28)] ring-1 ring-sky-400/60"
          style={{
            left: `${dragPreview.insertionPreview.left}px`,
            top: `${dragPreview.insertionPreview.top}px`,
            width: `${dragPreview.insertionPreview.width}px`,
            height: `${dragPreview.insertionPreview.height}px`,
          }}
          data-mindmap-insertion-preview
          data-mindmap-insertion-preview-coordinate-space="map-local"
          data-node-id={dragPreview.nodeId}
          data-target-node-id={dragPreview.targetNodeId || ''}
          data-target-parent-id={dragPreview.targetParentId || ''}
          data-sibling-before-id={dragPreview.siblingBeforeId || ''}
          data-sibling-after-id={dragPreview.siblingAfterId || ''}
          data-drop-position={dragPreview.dropPosition}
          data-direction={dragPreview.direction || ''}
        />
      ) : null}
    </>
  );
};

export default MindMapDragPreviewLayer;
