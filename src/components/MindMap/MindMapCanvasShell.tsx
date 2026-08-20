import React from 'react';
import { compactClassNames } from '../ui/compactTokens';

interface MindMapCanvasShellProps {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  zoomLevelText: string;
  mapContentStyle: React.CSSProperties;
  stageStyle: React.CSSProperties;
  sceneStyle: React.CSSProperties;
  relationshipToolActive: boolean;
  relationshipDraftFromId: string;
  hasContent: boolean;
  emptyState: React.ReactNode;
  children: React.ReactNode;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onContentClick: React.MouseEventHandler<HTMLDivElement>;
}

const MindMapCanvasShell: React.FC<MindMapCanvasShellProps> = ({
  surfaceRef,
  stageRef,
  contentRef,
  zoomLevelText,
  mapContentStyle,
  stageStyle,
  sceneStyle,
  relationshipToolActive,
  relationshipDraftFromId,
  hasContent,
  emptyState,
  children,
  onMouseDown,
  onPointerDown,
  onContentClick,
}) => (
  <div
    ref={surfaceRef}
    className={`mobile-pan-surface min-h-0 flex-1 overflow-auto ${compactClassNames.canvas}`}
    onMouseDown={onMouseDown}
    onPointerDown={onPointerDown}
    data-mobile-pan-surface="mindmap"
    data-mindmap-viewport="true"
    data-mindmap-scroll-owner="true"
    data-mindmap-zoom-level={zoomLevelText}
    data-mindmap-zoom-interaction="single-scene-rAF"
    data-mindmap-middle-pan="true"
    data-mindmap-left-pan="true"
    data-mindmap-left-pan-state="idle"
  >
    {hasContent ? (
      <div
        ref={stageRef}
        style={stageStyle}
        data-mindmap-stage-sizer="true"
      >
        <div
          ref={contentRef}
          role="tree"
          aria-label="WBS 心智圖"
          className="mobile-pan-surface relative flex min-h-[220vh] min-w-[260vw] items-center justify-center gap-[var(--mindmap-root-gap)] px-[55vw] py-[45vh]"
          style={{ ...mapContentStyle, ...sceneStyle }}
          onClick={onContentClick}
          data-mindmap-surface
          data-mindmap-scene="true"
          data-mindmap-coordinate-space="world"
          data-mindmap-pan-padding="xmind-edge"
          data-mindmap-zoom-renderer="scene-matrix"
          data-mindmap-zoom-quality="world-path-no-recompute"
          data-mindmap-note-relationship-mode={relationshipToolActive ? 'true' : 'false'}
          data-mindmap-note-relationship-source-id={relationshipDraftFromId}
        >
          {children}
        </div>
      </div>
    ) : (
      emptyState
    )}
  </div>
);

export default MindMapCanvasShell;
