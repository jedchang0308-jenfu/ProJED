import React from 'react';
import type { TaskActionId } from '../../interactions/task/types';
import { TaskActionMenu } from '../../interactions/task/TaskActionMenu';

export type MindMapContextMenuState = Readonly<{
  x: number;
  y: number;
  anchorPlacementId: string;
}>;

interface MindMapContextMenuProps {
  state: MindMapContextMenuState;
  selectionCount: number;
  actionIds: readonly TaskActionId[];
  enabled: Readonly<Partial<Record<TaskActionId, boolean>>>;
  disabledReasons: Readonly<Partial<Record<TaskActionId, string>>>;
  onAction: (actionId: TaskActionId) => void | Promise<void>;
  onClose: () => void;
  hideDisabled?: boolean;
  assignmentOpen?: boolean;
  assignmentSummary?: React.ReactNode;
  assignmentContent?: React.ReactNode;
  onToggleAssignment?: () => void;
}

const MENU_WIDTH = 252;
const MENU_ESTIMATED_HEIGHT = 420;
const VIEWPORT_GAP = 8;

export const MindMapContextMenu: React.FC<MindMapContextMenuProps> = ({
  state,
  selectionCount,
  actionIds,
  enabled,
  disabledReasons,
  onAction,
  onClose,
  hideDisabled = false,
  assignmentOpen,
  assignmentSummary,
  assignmentContent,
  onToggleAssignment,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState(() => ({
    left: Math.max(VIEWPORT_GAP, Math.min(state.x, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP)),
    top: Math.max(VIEWPORT_GAP, Math.min(state.y, window.innerHeight - MENU_ESTIMATED_HEIGHT - VIEWPORT_GAP)),
  }));

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const placeWithinViewport = () => {
      const rect = root.getBoundingClientRect();
      const renderedWidth = rect.width || MENU_WIDTH;
      const renderedHeight = Math.min(root.scrollHeight || rect.height || MENU_ESTIMATED_HEIGHT, window.innerHeight - (VIEWPORT_GAP * 2));
      const next = {
        left: Math.max(VIEWPORT_GAP, Math.min(state.x, window.innerWidth - renderedWidth - VIEWPORT_GAP)),
        top: Math.max(VIEWPORT_GAP, Math.min(state.y, window.innerHeight - renderedHeight - VIEWPORT_GAP)),
      };
      setPosition(current => current.left === next.left && current.top === next.top ? current : next);
    };
    placeWithinViewport();
    const observer = new ResizeObserver(placeWithinViewport);
    observer.observe(root);
    window.addEventListener('resize', placeWithinViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', placeWithinViewport);
    };
  }, [actionIds, assignmentOpen, selectionCount, state.x, state.y]);

  React.useLayoutEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [state.anchorPlacementId]);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      aria-label={selectionCount > 1 ? `已選取 ${selectionCount} 個任務的操作清單` : '任務操作清單'}
      className="fixed z-[100] max-h-[calc(100vh-16px)] w-[252px] overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 text-[13px] text-slate-800 shadow-xl ring-1 ring-slate-900/5"
      style={{ left: position.left, top: position.top }}
      data-mindmap-context-menu="true"
      data-mindmap-context-menu-density="compact"
      data-global-context-menu="true"
      data-global-context-menu-kind="task"
      data-mindmap-context-anchor-placement-id={state.anchorPlacementId}
    >
      <div className="border-b border-slate-200 px-2.5 py-1.5">
        <div className="font-semibold leading-5 text-slate-800">
          {selectionCount > 1 ? `已選取 ${selectionCount} 個任務` : '已選取 1 個任務'}
        </div>
      </div>
      <TaskActionMenu
        actionIds={actionIds}
        enabled={enabled}
        disabledReasons={disabledReasons}
        onAction={onAction}
        hideDisabled={hideDisabled}
        compact
        assignmentOpen={assignmentOpen}
        assignmentSummary={assignmentSummary}
        assignmentContent={assignmentContent}
        onToggleAssignment={onToggleAssignment}
      />
    </div>
  );
};

export default MindMapContextMenu;
