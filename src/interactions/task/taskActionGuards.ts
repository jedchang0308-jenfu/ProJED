import { getTaskActionDefinition } from './taskActionCatalog';
import type { TaskActionId } from './types';

export type TaskActionGuardInput = {
  nodeExists?: boolean;
  canCreateTask?: boolean;
  canEditTask?: boolean;
  canMoveTask?: boolean;
  canDeleteTask?: boolean;
  canAssignTask?: boolean;
  canCreateDependency?: boolean;
  dangerousActionConfirmed?: boolean;
};

export type TaskActionGuardResult = {
  allowed: boolean;
  reason?: string;
};

export const guardTaskAction = (actionId: TaskActionId, input: TaskActionGuardInput = {}): TaskActionGuardResult => {
  if (input.nodeExists === false) return { allowed: false, reason: 'task-not-found' };
  const action = getTaskActionDefinition(actionId);
  if (!action) return { allowed: false, reason: 'unknown-action' };
  if (actionId === 'task.delete-request' && input.dangerousActionConfirmed) {
    return { allowed: Boolean(input.canDeleteTask), reason: input.canDeleteTask ? undefined : 'permission-delete' };
  }
  switch (action.capability) {
    case 'create': return { allowed: Boolean(input.canCreateTask), reason: input.canCreateTask ? undefined : 'permission-create' };
    case 'edit': return { allowed: Boolean(input.canEditTask), reason: input.canEditTask ? undefined : 'permission-edit' };
    case 'move': return { allowed: Boolean(input.canMoveTask), reason: input.canMoveTask ? undefined : 'permission-move' };
    case 'delete': return { allowed: Boolean(input.canDeleteTask), reason: input.canDeleteTask ? undefined : 'permission-delete' };
    case 'assign': return { allowed: Boolean(input.canAssignTask), reason: input.canAssignTask ? undefined : 'permission-assign' };
    case 'dependency': return { allowed: Boolean(input.canCreateDependency), reason: input.canCreateDependency ? undefined : 'permission-dependency' };
    default: return { allowed: true };
  }
};

export const getTaskActionEnabledMap = (
  actionIds: readonly TaskActionId[],
  input: TaskActionGuardInput,
): Readonly<Record<string, boolean>> => Object.fromEntries(
  actionIds.map(actionId => [actionId, guardTaskAction(actionId, input).allowed]),
);
