import React from 'react';
import {
  type MindMapRelationshipDraftPreview,
  type MindMapRelationshipPath,
} from './mindMapGeometry';
import type { MindMapRelationshipPointerHandle } from './mindMapRelationshipCommands';

interface MindMapRelationshipOverlayProps {
  relationshipPaths: MindMapRelationshipPath[];
  relationshipDraftPreview: MindMapRelationshipDraftPreview | null;
  selectedRelationshipId: string | null;
  hoveredRelationshipId: string | null;
  editingRelationshipId: string | null;
  selectRelationship: (relationshipId: string) => void;
  hoverRelationship: (relationshipId: string) => void;
  clearRelationshipHover: (relationshipId?: string) => void;
  startRelationshipLabelEdit: (relationshipId: string) => void;
  startRelationshipPointerDrag: (
    event: React.PointerEvent<Element>,
    relationshipId: string,
    handle: MindMapRelationshipPointerHandle,
  ) => void;
}

const MindMapRelationshipOverlay: React.FC<MindMapRelationshipOverlayProps> = ({
  relationshipPaths,
  relationshipDraftPreview,
  selectedRelationshipId,
  hoveredRelationshipId,
  editingRelationshipId,
  selectRelationship,
  hoverRelationship,
  clearRelationshipHover,
  startRelationshipLabelEdit,
  startRelationshipPointerDrag,
}) => (
  <>
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[15] h-full w-full overflow-visible"
      data-mindmap-note-relationship-overlay
    >
      <defs>
        <marker
          id="mindmap-note-relationship-arrow"
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 1 1 L 8 4.5 L 1 8 z" fill="#0284c7" />
        </marker>
      </defs>
      {relationshipPaths.map(path => {
        const selected = selectedRelationshipId === path.id;
        const hovered = hoveredRelationshipId === path.id;
        const active = selected || hovered;
        return (
          <g
            key={path.id}
            data-mindmap-note-relationship={path.id}
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
            data-label={path.label}
            data-selected={selected ? 'true' : 'false'}
            data-hovered={hovered ? 'true' : 'false'}
          >
            <path
              d={path.d}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              style={{ pointerEvents: 'none' }}
              onClick={(event) => {
                event.stopPropagation();
                selectRelationship(path.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startRelationshipLabelEdit(path.id);
              }}
              onPointerEnter={() => hoverRelationship(path.id)}
              onPointerLeave={() => clearRelationshipHover(path.id)}
              data-mindmap-note-relationship-hitbox={path.id}
              data-label={path.label}
              data-from-node-id={path.fromNodeId}
              data-to-node-id={path.toNodeId}
            />
            <path
              d={path.d}
              fill="none"
              stroke={active ? '#0ea5e9' : path.style.strokeColor}
              strokeWidth={selected ? Math.max(path.style.strokeWidth + 1, 3.5) : hovered ? Math.max(path.style.strokeWidth + 0.75, 3) : path.style.strokeWidth}
              strokeDasharray={path.style.strokeDasharray}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerStart={path.style.arrowStart ? 'url(#mindmap-note-relationship-arrow)' : undefined}
              markerEnd={path.style.arrowEnd ? 'url(#mindmap-note-relationship-arrow)' : undefined}
              style={{ pointerEvents: 'none' }}
              data-mindmap-note-relationship-path={path.id}
              data-from-node-id={path.fromNodeId}
              data-to-node-id={path.toNodeId}
              data-label={path.label}
              data-from-x={path.fromX.toFixed(2)}
              data-from-y={path.fromY.toFixed(2)}
              data-to-x={path.toX.toFixed(2)}
              data-to-y={path.toY.toFixed(2)}
              data-control-1-x={path.c1X.toFixed(2)}
              data-control-1-y={path.c1Y.toFixed(2)}
              data-control-2-x={path.c2X.toFixed(2)}
              data-control-2-y={path.c2Y.toFixed(2)}
              data-label-x={path.labelX.toFixed(2)}
              data-label-y={path.labelY.toFixed(2)}
              data-stroke-color={path.style.strokeColor}
              data-stroke-width={path.style.strokeWidth}
              data-stroke-dasharray={path.style.strokeDasharray}
            />
            {selected ? (
              <>
                <line
                  x1={path.c1X}
                  y1={path.c1Y}
                  x2={path.c2X}
                  y2={path.c2Y}
                  stroke="#bae6fd"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }}
                  data-mindmap-note-relationship-control-guide={path.id}
                />
                <line
                  x1={path.fromX}
                  y1={path.fromY}
                  x2={path.c1X}
                  y2={path.c1Y}
                  stroke="#38bdf8"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                  data-mindmap-note-relationship-control-arm="from"
                  data-relationship-id={path.id}
                />
                <line
                  x1={path.toX}
                  y1={path.toY}
                  x2={path.c2X}
                  y2={path.c2Y}
                  stroke="#38bdf8"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                  data-mindmap-note-relationship-control-arm="to"
                  data-relationship-id={path.id}
                />
                <circle
                  cx={path.fromX}
                  cy={path.fromY}
                  r={6.5}
                  fill="#ffffff"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'from')}
                  data-mindmap-note-relationship-svg-endpoint="from"
                  data-relationship-id={path.id}
                />
                <circle
                  cx={path.toX}
                  cy={path.toY}
                  r={6.5}
                  fill="#ffffff"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
                  data-mindmap-note-relationship-svg-endpoint="to"
                  data-relationship-id={path.id}
                />
                <rect
                  x={path.c1X - 6}
                  y={path.c1Y - 6}
                  width={12}
                  height={12}
                  rx={2}
                  fill="#ffffff"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-1')}
                  data-mindmap-note-relationship-svg-control-point="1"
                  data-relationship-id={path.id}
                />
                <rect
                  x={path.c2X - 6}
                  y={path.c2Y - 6}
                  width={12}
                  height={12}
                  rx={2}
                  fill="#ffffff"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  className="cursor-grab active:cursor-grabbing"
                  style={{ pointerEvents: 'all' }}
                  onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-2')}
                  data-mindmap-note-relationship-svg-control-point="2"
                  data-relationship-id={path.id}
                />
              </>
            ) : null}
            {editingRelationshipId !== path.id ? (
              <text
                x={path.labelX}
                y={path.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="select-none font-semibold"
                fill={path.style.labelColor}
                stroke="#ffffff"
                strokeWidth={4}
                paintOrder="stroke"
                style={{ pointerEvents: 'none', fontSize: path.style.labelFontSize }}
                data-mindmap-note-relationship-label={path.id}
              >
                {path.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>

    {relationshipDraftPreview ? (
      <svg
        className="pointer-events-none absolute inset-0 z-[58] h-full w-full overflow-visible"
        aria-hidden="true"
        data-mindmap-note-relationship-draft-preview
        data-mindmap-note-relationship-draft-coordinate-space="map-local"
        data-source-node-id={relationshipDraftPreview.fromNodeId}
        data-draft-from-x={relationshipDraftPreview.fromX.toFixed(2)}
        data-draft-from-y={relationshipDraftPreview.fromY.toFixed(2)}
        data-draft-to-x={relationshipDraftPreview.toX.toFixed(2)}
        data-draft-to-y={relationshipDraftPreview.toY.toFixed(2)}
      >
        <defs>
          <marker
            id="mindmap-note-relationship-draft-arrow"
            markerWidth="9"
            markerHeight="9"
            refX="8"
            refY="4.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 1 1 L 8 4.5 L 1 8 z" fill="#0ea5e9" />
          </marker>
        </defs>
        <path
          d={relationshipDraftPreview.d}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={2}
          strokeDasharray="6 5"
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#mindmap-note-relationship-draft-arrow)"
          data-mindmap-note-relationship-draft-preview-path
          data-mindmap-note-relationship-draft-coordinate-space="map-local"
        />
      </svg>
    ) : null}
  </>
);

export default MindMapRelationshipOverlay;
