import React from 'react';
import type { TaskStatus } from '../../types';
import { isMobileTaskActionMode } from './taskDrag/taskGesturePolicy';
import type {
  MobileTaskAction,
  TaskDragSessionState,
  TaskDragSourceKind,
} from './taskDrag/taskDragTypes';

export type { MobileTaskAction, MobileTaskDropPosition } from './taskDrag/taskDragTypes';
export type MobileTaskActionState = TaskDragSessionState;

export type MobileTaskActionContextValue = {
  state: MobileTaskActionState | null;
  begin: (
    task: { id: string; title?: string; status?: TaskStatus },
    event: React.TouchEvent,
    sourceKind?: TaskDragSourceKind,
  ) => boolean;
  move: (event: React.TouchEvent) => void;
  end: (event: React.TouchEvent) => void;
  cancel: (event?: React.TouchEvent) => void;
  activateAction: (action: MobileTaskAction) => void;
  isActive: (nodeId?: string) => boolean;
};

export const MobileTaskActionContext = React.createContext<MobileTaskActionContextValue | null>(null);

export { isMobileTaskActionMode };
