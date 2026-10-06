import React from 'react';
import {
  getRelationshipCurveHitSegments,
  type MindMapRelationshipPath,
} from './mindMapGeometry';
import type { MindMapRelationshipPointerHandle } from './mindMapRelationshipCommands';

interface MindMapRelationshipInteractionLayerProps {
  relationshipPaths: MindMapRelationshipPath[];
  selectedRelationshipId: string | null;
  hoveredRelationshipId: string | null;
  editingRelationshipId: string | null;
  zoomLevel: number;
  editingRelationshipLabel: string;
  relationshipToolActive: boolean;
  relationshipLabelInputRef: React.RefObject<HTMLInputElement | null>;
  startRelationshipLabelEdit: (relationshipId: string) => void;
  startRelationshipPointerDrag: (
    event: React.PointerEvent<Element>,
    relationshipId: string,
    handle: MindMapRelationshipPointerHandle,
  ) => void;
  handleRelationshipHotkey: (event: React.KeyboardEvent<HTMLElement>, relationshipId: string) => void;
  selectRelationship: (relationshipId: string) => void;
  hoverRelationship: (relationshipId: string) => void;
  clearRelationshipHover: (relationshipId?: string) => void;
  updateRelationshipLabelDraft: (label: string) => void;
  commitRelationshipLabelEdit: () => void;
  cancelRelationshipLabelEdit: () => void;
}

const RELATIONSHIP_LINE_HIT_WINDOW_PX = 44;

const MindMapRelationshipInteractionLayer: React.FC<MindMapRelationshipInteractionLayerProps> = ({
  relationshipPaths,
  selectedRelationshipId,
  hoveredRelationshipId,
  editingRelationshipId,
  zoomLevel,
  editingRelationshipLabel,
  relationshipToolActive,
  relationshipLabelInputRef,
  startRelationshipLabelEdit,
  startRelationshipPointerDrag,
  handleRelationshipHotkey,
  selectRelationship,
  hoverRelationship,
  clearRelationshipHover,
  updateRelationshipLabelDraft,
  commitRelationshipLabelEdit,
  cancelRelationshipLabelEdit,
}) => {
  const inverseScale = 1 / Math.max(zoomLevel, 0.01);
  const hitHeight = (screenPixels: number) => `${screenPixels * inverseScale}px`;

  const selectOrEditRelationship = (event: React.MouseEvent, path: MindMapRelationshipPath) => {
    event.stopPropagation();
    if (selectedRelationshipId === path.id && event.detail === 0) {
      startRelationshipLabelEdit(path.id);
      return;
    }
    selectRelationship(path.id);
  };

  return (
    <>
      {relationshipPaths.flatMap(path => (
        getRelationshipCurveHitSegments(path).map(segment => (
          <button
            key={`curve-hitbox-${path.id}-${segment.index}`}
            type="button"
            aria-label={`選取關聯線 ${path.label}`}
            className={`absolute z-[44] rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${segment.x}px`,
              top: `${segment.y}px`,
              width: `${segment.length}px`,
              height: hitHeight(RELATIONSHIP_LINE_HIT_WINDOW_PX),
              transform: `translate(-50%, -50%) rotate(${segment.angle}rad)`,
            }}
            onClick={(event) => selectOrEditRelationship(event, path)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRelationshipLabelEdit(path.id);
            }}
            onKeyDown={(event) => handleRelationshipHotkey(event, path.id)}
            onPointerEnter={() => hoverRelationship(path.id)}
            onPointerLeave={() => clearRelationshipHover(path.id)}
            data-mindmap-note-relationship-curve-click-target={path.id}
            data-mindmap-note-relationship-hit-window-screen-px={RELATIONSHIP_LINE_HIT_WINDOW_PX}
            data-mindmap-note-relationship-hit-window-alignment="centerline"
            data-mindmap-note-relationship-coordinate-space="map-local"
            data-segment-index={segment.index}
            data-label={path.label}
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
            data-hovered={hoveredRelationshipId === path.id ? 'true' : 'false'}
          />
        ))
      ))}

      {relationshipPaths.map(path => {
        const curveSegments = getRelationshipCurveHitSegments(path);
        const centerSegment = curveSegments[Math.floor(curveSegments.length / 2)];
        if (!centerSegment) return null;
        return (
          <button
            key={`line-hitbox-${path.id}`}
            type="button"
            aria-label={`選取關聯線 ${path.label}`}
            className={`absolute z-[42] rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${centerSegment.x}px`,
              top: `${centerSegment.y}px`,
              width: `${centerSegment.length}px`,
              height: hitHeight(RELATIONSHIP_LINE_HIT_WINDOW_PX),
              transform: `translate(-50%, -50%) rotate(${centerSegment.angle}rad)`,
            }}
            onClick={(event) => selectOrEditRelationship(event, path)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRelationshipLabelEdit(path.id);
            }}
            onKeyDown={(event) => handleRelationshipHotkey(event, path.id)}
            onPointerEnter={() => hoverRelationship(path.id)}
            onPointerLeave={() => clearRelationshipHover(path.id)}
            data-mindmap-note-relationship-line-click-target={path.id}
            data-mindmap-note-relationship-hit-window-screen-px={RELATIONSHIP_LINE_HIT_WINDOW_PX}
            data-mindmap-note-relationship-hit-window-alignment="centerline"
            data-mindmap-note-relationship-coordinate-space="map-local"
            data-label={path.label}
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
            data-hovered={hoveredRelationshipId === path.id ? 'true' : 'false'}
          />
        );
      })}

      {relationshipPaths.map(path => (
        <button
          key={`relationship-label-target-${path.id}`}
          type="button"
          aria-label={`選取關聯線 ${path.label}`}
          className={`absolute z-[43] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
          style={{
            left: `${path.labelX}px`,
            top: `${path.labelY}px`,
            width: '96px',
            height: '32px',
            transform: `translate(-50%, -50%) scale(${inverseScale})`,
          }}
          onClick={(event) => selectOrEditRelationship(event, path)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRelationshipLabelEdit(path.id);
          }}
          onKeyDown={(event) => handleRelationshipHotkey(event, path.id)}
          onPointerEnter={() => hoverRelationship(path.id)}
          onPointerLeave={() => clearRelationshipHover(path.id)}
          data-mindmap-note-relationship-click-target={path.id}
          data-mindmap-note-relationship-coordinate-space="map-local"
          data-label={path.label}
          data-from-node-id={path.fromNodeId}
          data-to-node-id={path.toNodeId}
          data-hovered={hoveredRelationshipId === path.id ? 'true' : 'false'}
        />
      ))}

      {relationshipPaths.map(path => (
        selectedRelationshipId === path.id ? (
          <React.Fragment key={`relationship-html-handles-${path.id}`}>
            <button
              type="button"
              aria-label="調整關聯線起點位置"
              className="absolute z-[62] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.fromX}px`, top: `${path.fromY}px`, width: hitHeight(24), height: hitHeight(24) }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'from')}
              data-mindmap-note-relationship-endpoint="from"
              data-mindmap-note-relationship-screen-endpoint="from"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              aria-label="調整關聯線終點位置"
              className="absolute z-[62] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.toX}px`, top: `${path.toY}px`, width: hitHeight(24), height: hitHeight(24) }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
              data-mindmap-note-relationship-endpoint="to"
              data-mindmap-note-relationship-screen-endpoint="to"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              aria-label="調整關聯線起點方向"
              className="absolute z-[63] flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-md bg-transparent outline-none cursor-grab focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 active:cursor-grabbing"
              style={{ left: `${path.c1X}px`, top: `${path.c1Y}px`, width: hitHeight(28), height: hitHeight(28) }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-1')}
              data-mindmap-note-relationship-direction-joystick="from"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none rotate-45 bg-white shadow-sm"
                style={{
                  width: hitHeight(10),
                  height: hitHeight(10),
                  border: `${2 * inverseScale}px solid #0ea5e9`,
                  borderRadius: `${2 * inverseScale}px`,
                }}
              />
            </button>
            <button
              type="button"
              aria-label="調整關聯線終點方向"
              className="absolute z-[63] flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-md bg-transparent outline-none cursor-grab focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 active:cursor-grabbing"
              style={{ left: `${path.c2X}px`, top: `${path.c2Y}px`, width: hitHeight(28), height: hitHeight(28) }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-2')}
              data-mindmap-note-relationship-direction-joystick="to"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none rotate-45 bg-white shadow-sm"
                style={{
                  width: hitHeight(10),
                  height: hitHeight(10),
                  border: `${2 * inverseScale}px solid #0ea5e9`,
                  borderRadius: `${2 * inverseScale}px`,
                }}
              />
            </button>
          </React.Fragment>
        ) : null
      ))}

      {relationshipPaths.map(path => (
        editingRelationshipId === path.id ? (
          <input
            key={`relationship-editor-${path.id}`}
            ref={relationshipLabelInputRef}
            value={editingRelationshipLabel}
            onChange={(event) => updateRelationshipLabelDraft(event.target.value)}
            onBlur={commitRelationshipLabelEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRelationshipLabelEdit();
              if (event.key === 'Escape') cancelRelationshipLabelEdit();
            }}
            onClick={(event) => event.stopPropagation()}
            className="absolute z-[80] -translate-x-1/2 -translate-y-1/2 rounded border border-sky-300 bg-white px-2 py-1 text-center text-xs font-semibold text-slate-700 shadow-lg outline-none ring-4 ring-sky-100"
            style={{
              left: `${path.labelX}px`,
              top: `${path.labelY}px`,
              width: `${112 * inverseScale}px`,
              transform: `translate(-50%, -50%) scale(${inverseScale})`,
            }}
            data-mindmap-note-relationship-label-input={path.id}
            data-mindmap-note-relationship-coordinate-space="map-local"
            data-from-node-id={path.fromNodeId}
            data-to-node-id={path.toNodeId}
          />
        ) : null
      ))}
    </>
  );
};

export default MindMapRelationshipInteractionLayer;
