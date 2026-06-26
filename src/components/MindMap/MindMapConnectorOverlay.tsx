import React from 'react';
import type { MindMapConnectorPath } from './mindMapGeometry';

interface MindMapConnectorOverlayProps {
  connectorPaths: MindMapConnectorPath[];
}

const MindMapConnectorOverlay: React.FC<MindMapConnectorOverlayProps> = ({ connectorPaths }) => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible text-slate-300"
    data-mindmap-connector-overlay
  >
    {connectorPaths.map(path => (
      <path
        key={path.id}
        d={path.d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-mindmap-connector-path={path.id}
        data-from-node-id={path.fromNodeId}
        data-to-node-id={path.toNodeId}
        data-depth={path.depth}
        data-direction={path.direction}
        data-from-x={path.fromX.toFixed(2)}
        data-from-y={path.fromY.toFixed(2)}
        data-to-x={path.toX.toFixed(2)}
        data-to-y={path.toY.toFixed(2)}
      />
    ))}
  </svg>
);

export default MindMapConnectorOverlay;
