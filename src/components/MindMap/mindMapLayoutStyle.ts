import type { CSSProperties } from 'react';
import type { MindMapSceneLayout } from './mindMapCoordinateSystem';

export const getMindMapContentStyle = (): CSSProperties => ({
  '--mindmap-root-gap': '48px',
  '--mindmap-node-gap': '20px',
  '--mindmap-children-gap': '12px',
  '--mindmap-node-min-height': '38px',
  '--mindmap-node-max-width': '260px',
  '--mindmap-node-pad-x': '10px',
  '--mindmap-node-pad-y': '6px',
  '--mindmap-node-font-size': '14px',
  '--mindmap-node-radius': '6px',
  '--mindmap-toggle-size': '20px',
  '--mindmap-toggle-icon-size': '14px',
  '--mindmap-input-min-width': '120px',
  '--mindmap-date-font-size': '10px',
  '--mindmap-date-icon-size': '10px',
  '--mindmap-date-pad-x': '6px',
  '--mindmap-date-pad-y': '2px',
  '--mindmap-root-side-min-width': '260px',
  '--mindmap-root-side-gap': '16px',
  '--mindmap-root-side-pad': '8px',
  '--mindmap-center-min-height': '64px',
  '--mindmap-center-max-width': '300px',
  '--mindmap-center-pad-x': '24px',
  '--mindmap-center-pad-y': '16px',
  '--mindmap-center-font-size': '16px',
  '--mindmap-center-radius': '12px',
} as CSSProperties);

export const getMindMapStageStyle = (layout: MindMapSceneLayout): CSSProperties => ({
  position: 'relative',
  width: `${layout.stageWidth}px`,
  height: `${layout.stageHeight}px`,
  overflow: 'visible',
});

export const getMindMapSceneTransformStyle = (layout: MindMapSceneLayout): CSSProperties => ({
  width: `${layout.sceneWidth}px`,
  height: `${layout.sceneHeight}px`,
  minWidth: 0,
  minHeight: 0,
  transformOrigin: '0 0',
  transform: `matrix(${layout.scale}, 0, 0, ${layout.scale}, ${layout.translateX}, ${layout.translateY})`,
});
