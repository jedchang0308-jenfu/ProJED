import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import useBoardStore from '../../store/useBoardStore';
import type { TaskHostMode, TaskInteractionLocation, TaskInteractionOrigin } from './types';

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
  return <TaskInteractionScopeContext.Provider value={value}>{children}</TaskInteractionScopeContext.Provider>;
};

export const useTaskInteractionScope = (): TaskInteractionLocation => useContext(TaskInteractionScopeContext);

export const getHostModeFromView = viewToHostMode;
