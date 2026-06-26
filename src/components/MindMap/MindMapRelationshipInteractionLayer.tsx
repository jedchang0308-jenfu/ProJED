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
  editingRelationshipLabel: string;
  relationshipToolActive: boolean;
  relationshipLabelInputRef: React.RefObject<HTMLInputElement | null>;
  getLocalLineSegmentStyle: (fromX: number, fromY: number, toX: number, toY: number) => React.CSSProperties;
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
  editingRelationshipLabel,
  relationshipToolActive,
  relationshipLabelInputRef,
  getLocalLineSegmentStyle,
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
  const selectRelationshipFromEvent = (event: React.SyntheticEvent, path: MindMapRelationshipPath) => {
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
            className={`absolute z-[44] h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${segment.x}px`,
              top: `${segment.y}px`,
              width: `${segment.length}px`,
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
            className={`absolute z-[42] h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
            style={{
              left: `${(path.fromX + path.toX) / 2}px`,
              top: `${(path.fromY + path.toY) / 2}px`,
              width: `${length}px`,
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
          className={`absolute z-[43] h-8 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none focus:ring-2 focus:ring-sky-300 ${relationshipToolActive ? 'pointer-events-none' : ''}`}
          style={{ left: `${path.labelX}px`, top: `${path.labelY}px` }}
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
            <div
              className="pointer-events-none absolute z-[41] h-0.5 origin-left rounded-full bg-sky-300"
              style={getLocalLineSegmentStyle(path.fromX, path.fromY, path.c1X, path.c1Y)}
              data-mindmap-note-relationship-control-arm-overlay={path.id}
              data-mindmap-note-relationship-screen-control-arm="from"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <div
              className="pointer-events-none absolute z-[41] h-0.5 origin-left rounded-full bg-sky-300"
              style={getLocalLineSegmentStyle(path.toX, path.toY, path.c2X, path.c2Y)}
              data-mindmap-note-relationship-control-arm-overlay={path.id}
              data-mindmap-note-relationship-screen-control-arm="to"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="absolute z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.fromX}px`, top: `${path.fromY}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'from')}
              data-mindmap-note-relationship-endpoint="from"
              data-mindmap-note-relationship-screen-endpoint="from"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="absolute z-[62] h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.toX}px`, top: `${path.toY}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'to')}
              data-mindmap-note-relationship-endpoint="to"
              data-mindmap-note-relationship-screen-endpoint="to"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="absolute z-[63] h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.c1X}px`, top: `${path.c1Y}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-1')}
              data-mindmap-note-relationship-control-point="1"
              data-mindmap-note-relationship-screen-control-point="1"
              data-mindmap-note-relationship-coordinate-space="map-local"
              data-relationship-id={path.id}
            />
            <button
              type="button"
              className="absolute z-[63] h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm border-2 border-sky-500 bg-white shadow-sm active:cursor-grabbing"
              style={{ left: `${path.c2X}px`, top: `${path.c2Y}px` }}
              onPointerDown={(event) => startRelationshipPointerDrag(event, path.id, 'control-2')}
              data-mindmap-note-relationship-control-point="2"
              data-mindmap-note-relationship-screen-control-point="2"
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
            className="absolute z-[80] w-28 -translate-x-1/2 -translate-y-1/2 rounded border border-sky-300 bg-white px-2 py-1 text-center text-xs font-semibold text-slate-700 shadow-lg outline-none ring-4 ring-sky-100"
            style={{ left: `${path.labelX}px`, top: `${path.labelY}px` }}
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
