import React from 'react';
import type { TaskNode } from '../../types';
import type { MindMapDirection } from './MindMapNode';

type RootSideDropTarget = MindMapDirection | null;

interface MindMapRootLayoutProps {
  rootsBySide: Record<MindMapDirection, TaskNode[]>;
  rootSideDropTarget: RootSideDropTarget;
  boardTitle: string;
  renderNode: (node: TaskNode, direction: MindMapDirection, level: number) => React.ReactNode;
  onDragOverSide: (event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => void;
  onDropOnSide: (event: React.DragEvent<HTMLDivElement>, direction: MindMapDirection) => void;
  onDragOverCenter: (event: React.DragEvent<HTMLDivElement>) => void;
  onDropOnCenter: (event: React.DragEvent<HTMLDivElement>) => void;
}

const MindMapRootLayout: React.FC<MindMapRootLayoutProps> = ({
  rootsBySide,
  rootSideDropTarget,
  boardTitle,
  renderNode,
  onDragOverSide,
  onDropOnSide,
  onDragOverCenter,
  onDropOnCenter,
}) => (
  <>
    <div
      className={`relative z-10 flex min-w-[var(--mindmap-root-side-min-width)] flex-col items-end gap-[var(--mindmap-root-side-gap)] rounded-lg border border-dashed p-[var(--mindmap-root-side-pad)] transition-colors ${rootSideDropTarget === 'left' ? 'border-blue-300 bg-blue-50/70' : 'border-transparent'}`}
      data-mindmap-side-drop-zone="left"
      data-mindmap-side-drop-active={rootSideDropTarget === 'left' ? 'true' : 'false'}
      onDragOver={(event) => onDragOverSide(event, 'left')}
      onDrop={(event) => onDropOnSide(event, 'left')}
    >
      {rootsBySide.left.map(node => renderNode(node, 'left', 1))}
    </div>

    <div
      className="relative z-20 flex min-h-[64px] max-w-[300px] items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-center text-base font-bold text-blue-800 shadow-[0_14px_28px_rgba(37,99,235,0.12)] ring-4 ring-blue-100/70"
      data-mindmap-center
      onDragOver={onDragOverCenter}
      onDrop={onDropOnCenter}
      title={'\u62d6\u66f3\u4efb\u52d9\u5230\u4e2d\u5fc3\u4e3b\u984c\u53ef\u79fb\u56de\u4e3b\u8981\u5206\u652f'}
    >
      <span className="line-clamp-2">{boardTitle || '\u672a\u547d\u540d\u770b\u677f'}</span>
    </div>

    <div
      className={`relative z-10 flex min-w-[var(--mindmap-root-side-min-width)] flex-col items-start gap-[var(--mindmap-root-side-gap)] rounded-lg border border-dashed p-[var(--mindmap-root-side-pad)] transition-colors ${rootSideDropTarget === 'right' ? 'border-blue-300 bg-blue-50/70' : 'border-transparent'}`}
      data-mindmap-side-drop-zone="right"
      data-mindmap-side-drop-active={rootSideDropTarget === 'right' ? 'true' : 'false'}
      onDragOver={(event) => onDragOverSide(event, 'right')}
      onDrop={(event) => onDropOnSide(event, 'right')}
    >
      {rootsBySide.right.map(node => renderNode(node, 'right', 1))}
    </div>
  </>
);

export default MindMapRootLayout;
