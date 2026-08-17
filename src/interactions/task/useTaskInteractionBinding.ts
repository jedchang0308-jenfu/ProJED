import { useCallback, useMemo } from 'react';
import useBoardStore from '../../store/useBoardStore';
import {
  clearTaskSelection,
  isCoarsePointer,
  prepareNewTaskNaming,
  selectAndOpenTaskDetails,
} from '../../utils/taskInteractions';
import { resolveTaskInteraction } from './resolveTaskInteraction';
import { createTaskCommandExecutor, type TaskCommandDependencies } from './taskCommandExecutor';
import { useTaskInteractionScope } from './TaskInteractionScope';
import type {
  InteractionContext,
  InteractionTrigger,
  TaskInteractionBlocker,
  TaskInteractionDispatchOutcome,
  TaskInteractionModality,
  TaskInteractionOrigin,
  TaskInteractionSurfaceId,
  TaskTransientOwner,
} from './types';

let interactionSequence = 0;

const nextInteractionId = () => {
  interactionSequence += 1;
  return `task-interaction-${Date.now().toString(36)}-${interactionSequence.toString(36)}`;
};

export type UseTaskInteractionBindingOptions = {
  taskId: string;
  title?: string;
  surfaceId: TaskInteractionSurfaceId;
  origin?: TaskInteractionOrigin;
  nodeRole?: InteractionContext['nodeRole'];
  modality?: TaskInteractionModality;
  transientOwners?: readonly TaskTransientOwner[];
  blockers?: readonly TaskInteractionBlocker[];
  commandDependencies?: TaskCommandDependencies;
};

export type TaskInteractionBinding = {
  dispatch: (trigger: InteractionTrigger) => Promise<TaskInteractionDispatchOutcome>;
  openMenu: (position?: { x: number; y: number }) => Promise<TaskInteractionDispatchOutcome>;
};

export const useTaskInteractionBinding = ({
  taskId,
  title = '',
  surfaceId,
  origin,
  nodeRole = 'task',
  modality,
  transientOwners = [],
  blockers = [],
  commandDependencies = {},
}: UseTaskInteractionBindingOptions): TaskInteractionBinding => {
  const scope = useTaskInteractionScope();
  const setContextMenuState = useBoardStore(state => state.setContextMenuState);
  const setView = useBoardStore(state => state.setView);
  const executor = useMemo(() => createTaskCommandExecutor({
    'task.open-details': ({ taskId: targetTaskId }) => selectAndOpenTaskDetails(targetTaskId),
    'task.open-details-for-naming': ({ taskId: targetTaskId }) => prepareNewTaskNaming(targetTaskId),
    'task.switch-to-list': () => setView('list'),
    'task.clear-selection': () => clearTaskSelection(),
    ...commandDependencies,
  }), [commandDependencies, setView]);

  const createContext = useCallback((): InteractionContext => ({
    interactionId: nextInteractionId(),
    location: { hostMode: scope.hostMode, origin: origin || scope.origin },
    surfaceId,
    taskId,
    nodeRole,
    modality: modality || (isCoarsePointer() ? 'coarse-pointer' : 'fine-pointer'),
    transientOwners,
    blockers,
  }), [blockers, modality, nodeRole, origin, scope.hostMode, scope.origin, surfaceId, taskId, transientOwners]);

  const dispatch = useCallback(async (trigger: InteractionTrigger): Promise<TaskInteractionDispatchOutcome> => {
    const context = createContext();
    const resolved = resolveTaskInteraction(context, trigger);
    if (!resolved.actionId || resolved.actionId === 'task.open-menu') {
      return { resolved, commandOutcome: null };
    }
    const commandOutcome = await executor.execute(context, resolved.actionId, { nodeExists: true });
    return { resolved, commandOutcome };
  }, [createContext, executor]);

  const openMenu = useCallback(async (position = { x: 12, y: 12 }): Promise<TaskInteractionDispatchOutcome> => {
    const context = createContext();
    const resolved = resolveTaskInteraction(context, 'pointer.secondary');
    if (resolved.actionId === 'task.open-menu') {
      setContextMenuState({
        kind: 'task',
        isOpen: true,
        x: position.x,
        y: position.y,
        nodeId: taskId,
        title,
        interactionLocation: context.location,
        surfaceId,
        interactionId: context.interactionId,
      });
    }
    return { resolved, commandOutcome: null };
  }, [createContext, setContextMenuState, surfaceId, taskId, title]);

  return { dispatch, openMenu };
};
