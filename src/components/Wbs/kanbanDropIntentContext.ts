import React from 'react';
import {
  createIdleKanbanDropState,
  type KanbanDropIntentState,
} from './kanbanDropIntent';

export type KanbanDropIntentContextValue = {
  state: KanbanDropIntentState;
  isTaskDragActive: boolean;
};

export const KanbanDropIntentContext = React.createContext<KanbanDropIntentContextValue>({
  state: createIdleKanbanDropState(),
  isTaskDragActive: false,
});

export const useKanbanDropIntent = () => React.useContext(KanbanDropIntentContext);
