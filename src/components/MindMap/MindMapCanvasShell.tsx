import React from 'react';
import { compactClassNames } from '../ui/compactTokens';

interface MindMapCanvasShellProps {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  zoomLevelText: string;
  mapContentStyle: React.CSSProperties;
  relationshipToolActive: boolean;
  relationshipDraftFromId: string;
  hasContent: boolean;
  emptyState: React.ReactNode;
  children: React.ReactNode;
  onWheel: React.WheelEventHandler<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onContentClick: React.MouseEventHandler<HTMLDivElement>;
}

const MindMapCanvasShell: React.FC<MindMapCanvasShellProps> = ({
  surfaceRef,
  contentRef,
  zoomLevelText,
  mapContentStyle,
  relationshipToolActive,
  relationshipDraftFromId,
  hasContent,
  emptyState,
  children,
  onWheel,
  onMouseDown,
  onContentClick,
}) => (
  <div
    ref={surfaceRef}
    className={`min-h-0 flex-1 overflow-auto ${compactClassNames.canvas}`}
    onWheel={onWheel}
    onMouseDown={onMouseDown}
    data-mindmap-zoom-level={zoomLevelText}
    data-mindmap-zoom-interaction="preview-then-vector-commit"
    data-mindmap-middle-pan="true"
  >
    {hasContent ? (
      <div
        ref={contentRef}
        role="tree"
        aria-label="WBS 心智圖"
        className="relative flex min-h-[220vh] min-w-[260vw] items-center justify-center gap-[var(--mindmap-root-gap)] px-[55vw] py-[45vh]"
        style={mapContentStyle}
        onClick={onContentClick}
        data-mindmap-surface
        data-mindmap-pan-padding="xmind-edge"
        data-mindmap-zoom-renderer="css-zoom-layer"
        data-mindmap-zoom-quality="zoom-only-no-path-recompute"
        data-mindmap-note-relationship-mode={relationshipToolActive ? 'true' : 'false'}
        data-mindmap-note-relationship-source-id={relationshipDraftFromId}
      >
        {children}
      </div>
    ) : (
      emptyState
    )}
  </div>
);

export default MindMapCanvasShell;
