import { createContext, useContext, useEffect, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import useBoardStore from '../../store/useBoardStore';
import type { TaskHostMode, TaskInteractionLocation, TaskInteractionOrigin } from './types';
import {
  clearTaskPlacementLinkedHover,
  getTaskPlacementHoverSurface,
  syncTaskPlacementLinkedHover,
} from './taskPlacementHover';

export type TaskInteractionScopeProps = PropsWithChildren<{
  hostMode?: TaskHostMode;
  origin?: TaskInteractionOrigin;
}>;

const viewToHostMode = (view: string): TaskHostMode => {
  if (view === 'mindmap' || view === 'board' || view === 'gantt' || view === 'calendar') return view;
  return 'list';
};

const TaskInteractionScopeContext = createContext<TaskInteractionLocation>({
  hostMode: 'list',
  origin: 'mode-primary',
});

export const TaskInteractionScope = ({ children, hostMode, origin = 'mode-primary' }: TaskInteractionScopeProps) => {
  const currentView = useBoardStore(state => state.currentView);
  const value = useMemo<TaskInteractionLocation>(() => ({
    hostMode: hostMode || viewToHostMode(currentView),
    origin,
  }), [currentView, hostMode, origin]);

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const surface = getTaskPlacementHoverSurface(event.target);
      if (!surface) return;
      const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (relatedTarget && surface.contains(relatedTarget)) return;
      syncTaskPlacementLinkedHover(surface);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const surface = getTaskPlacementHoverSurface(event.target);
      if (!surface) return;
      const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (relatedTarget && surface.contains(relatedTarget)) return;
      clearTaskPlacementLinkedHover();
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      clearTaskPlacementLinkedHover();
    };
  }, []);

  return <TaskInteractionScopeContext.Provider value={value}>{children}</TaskInteractionScopeContext.Provider>;
};

export const useTaskInteractionScope = (): TaskInteractionLocation => useContext(TaskInteractionScopeContext);

export const getHostModeFromView = viewToHostMode;
