import { useMemo } from 'react';
import { useMemberStore } from '../store/useMemberStore';
import type { PermissionCapability } from '../types';

export const useBoardPermissions = () => {
  const currentBoardAccess = useMemberStore(state => state.currentBoardAccess);
  const loading = useMemberStore(state => state.loading);

  return useMemo(() => {
    const capabilities = new Set<PermissionCapability>(currentBoardAccess?.capabilities ?? []);
    const can = (capability: PermissionCapability) => capabilities.has(capability);

    const canCreateTask = can('create_task');
    const canEditTask = can('edit_task');
    const canMoveTask = can('move_task');
    const canDeleteTask = can('delete_task');
    const canAssignTask = can('assign_task');
    const canCreateDependency = can('create_dependency');
    const canDeleteDependency = can('delete_dependency');

    return {
      loading,
      currentBoardAccess,
      canReadBoard: can('read_board'),
      canCreateTask,
      canEditTask,
      canMoveTask,
      canDeleteTask,
      canAssignTask,
      canCreateDependency,
      canDeleteDependency,
      canCreateBoard: can('create_board'),
      canEditWorkspaceSettings: can('manage_workspace_settings'),
      canDeleteWorkspace: can('delete_workspace'),
      canEditBoardSettings: can('edit_board_settings'),
      canMoveBoardBetweenWorkspaces: can('move_board_between_workspaces'),
      canManageBoardMembers: can('manage_board_members'),
      isReadOnly:
        !canCreateTask &&
        !canEditTask &&
        !canMoveTask &&
        !canDeleteTask &&
        !canAssignTask &&
        !canCreateDependency &&
        !canDeleteDependency,
    };
  }, [currentBoardAccess, loading]);
};
