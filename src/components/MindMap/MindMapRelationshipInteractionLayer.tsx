import React from 'react';
import {
  getRelationshipCurveHitSegments,
  type MindMapRelationshipPath,
} from './mindMapGeometry';
import type { MindMapRelationshipPointerHandle } from './mindMapRelationshipCommands';
import { isPrimaryPointerActivation } from '../../interactions/pointerActivation';

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

  const selectRelationshipFromEvent = (
    event: React.MouseEvent<Element> | React.PointerEvent<Element>,
    path: MindMapRelationshipPath,
  ) => {
    if (!isPrimaryPointerActivation(event)) return;
    event.preventDefault();
    event.stopPropagation();
    selectRelationship(path.id);
  };

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
            className={`absolute z-[44] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${segment.x}px`,
              top: `${segment.y}px`,
              width: `${segment.length}px`,
              height: hitHeight(28),
              transform: `translate(-50%, -50%) rotate(${segment.angle}rad)`,
            }}
            onClick={(event) => selectOrEditRelationship(event, path)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRelationshipLabelEdit(path.id);
            }}
            onPointerDown={(event) => selectRelationshipFromEvent(event, path)}
            onPointerUp={(event) => selectRelationshipFromEvent(event, path)}
            onMouseDown={(event) => selectRelationshipFromEvent(event, path)}
            onMouseUp={(event) => selectRelationshipFromEvent(event, path)}
            onKeyDown={(event) => handleRelationshipHotkey(event, path.id)}
            onPointerEnter={() => hoverRelationship(path.id)}
            onPointerLeave={() => clearRelationshipHover(path.id)}
            data-mindmap-note-relationship-curve-click-target={path.id}
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
        const dx = path.toX - path.fromX;
        const dy = path.toY - path.fromY;
        const length = Math.max(80, Math.hypot(dx, dy) - 64);
        const angle = Math.atan2(dy, dx);
        return (
          <button
            key={`line-hitbox-${path.id}`}
            type="button"
            aria-label={`選取關聯線 ${path.label}`}
            className={`absolute z-[42] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${(path.fromX + path.toX) / 2}px`,
              top: `${(path.fromY + path.toY) / 2}px`,
              width: `${length}px`,
              height: hitHeight(24),
              transform: `translate(-50%, -50%) rotate(${angle}rad)`,
            }}
            onClick={(event) => selectOrEditRelationship(event, path)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRelationshipLabelEdit(path.id);
            }}
            onPointerDown={(event) => selectRelationshipFromEvent(event, path)}
            onPointerUp={(event) => selectRelationshipFromEvent(event, path)}
            onMouseDown={(event) => selectRelationshipFromEvent(event, path)}
            onMouseUp={(event) => selectRelationshipFromEvent(event, path)}
            onKeyDown={(event) => handleRelationshipHotkey(event, path.id)}
            onPointerEnter={() => hoverRelationship(path.id)}
            onPointerLeave={() => clearRelationshipHover(path.id)}
            data-mindmap-note-relationship-line-click-target={path.id}
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
          onPointerDown={(event) => selectRelationshipFromEvent(event, path)}
          onPointerUp={(event) => selectRelationshipFromEvent(event, path)}
          onMouseDown={(event) => selectRelationshipFromEvent(event, path)}
          onMouseUp={(event) => selectRelationshipFromEvent(event, path)}
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
              className="absolute z-[62] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.toX}px`, top: `${path.toY}px`, width: hitHeight(24), height: hitHeight(24) }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
              data-mindmap-note-relationship-endpoint="to"
              data-mindmap-note-relationship-screen-endpoint="to"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
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
