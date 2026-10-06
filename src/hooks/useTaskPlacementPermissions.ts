import React from 'react';
import type { PermissionCapability, TaskNode } from '../types';
import type { TaskTrackingReference } from '../features/taskTracking/types';
import { memberService } from '../services/dataBackend';
import useAuthStore from '../store/useAuthStore';
import { useMemberStore } from '../store/useMemberStore';
import { useBoardPermissions } from './useBoardPermissions';

type CanonicalTaskCapabilities = {
  loading: boolean;
  canCreateTask: boolean;
  canEditTask: boolean;
  canMoveTask: boolean;
  canDeleteTask: boolean;
  canAssignTask: boolean;
  canCreateDependency: boolean;
};

const EMPTY_CANONICAL_CAPABILITIES: CanonicalTaskCapabilities = {
  loading: false,
  canCreateTask: false,
  canEditTask: false,
  canMoveTask: false,
  canDeleteTask: false,
  canAssignTask: false,
  canCreateDependency: false,
};

const toCanonicalCapabilities = (
  capabilities: readonly PermissionCapability[] | undefined,
  loading = false,
): CanonicalTaskCapabilities => {
  const allowed = new Set(capabilities ?? []);
  return {
    loading,
    canCreateTask: allowed.has('create_task'),
    canEditTask: allowed.has('edit_task'),
    canMoveTask: allowed.has('move_task'),
    canDeleteTask: allowed.has('delete_task'),
    canAssignTask: allowed.has('assign_task'),
    canCreateDependency: allowed.has('create_dependency'),
  };
};

/**
 * Resolve canonical mutation capabilities independently from the Board where a
 * placement is currently rendered. A tracking placement grants target-board
 * read/manage-reference access only; canonical mutations continue to use the
 * source Board's effective capability matrix.
 */
export const useTaskPlacementPermissions = (
  task: TaskNode | null | undefined,
  reference?: TaskTrackingReference | null,
) => {
  const boardPermissions = useBoardPermissions();
  const currentBoardAccess = useMemberStore(state => state.currentBoardAccess);
  const currentUserId = useAuthStore(state => state.user?.uid);
  const sourceBoardId = reference?.sourceBoardId || task?.boardId || null;
  const sourceIsLoadedBoard = Boolean(
    !reference
    || (sourceBoardId && currentBoardAccess?.boardId === sourceBoardId),
  );
  const [remoteCanonical, setRemoteCanonical] = React.useState<CanonicalTaskCapabilities>(
    sourceIsLoadedBoard
      ? toCanonicalCapabilities(currentBoardAccess?.capabilities, boardPermissions.loading)
      : { ...EMPTY_CANONICAL_CAPABILITIES, loading: Boolean(sourceBoardId && currentUserId) },
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!reference || !task || !sourceBoardId) {
      setRemoteCanonical(toCanonicalCapabilities(currentBoardAccess?.capabilities, boardPermissions.loading));
      return () => { cancelled = true; };
    }
    if (currentBoardAccess?.boardId === sourceBoardId) {
      setRemoteCanonical(toCanonicalCapabilities(currentBoardAccess.capabilities, boardPermissions.loading));
      return () => { cancelled = true; };
    }
    if (!currentUserId) {
      setRemoteCanonical(EMPTY_CANONICAL_CAPABILITIES);
      return () => { cancelled = true; };
    }

    setRemoteCanonical(current => ({ ...current, loading: true }));
    void memberService.getCurrentBoardAccess(task.workspaceId, sourceBoardId, currentUserId)
      .then(access => {
        if (!cancelled) setRemoteCanonical(toCanonicalCapabilities(access?.capabilities));
      })
      .catch(() => {
        if (!cancelled) setRemoteCanonical(EMPTY_CANONICAL_CAPABILITIES);
      });
    return () => { cancelled = true; };
  }, [
    boardPermissions.loading,
    currentBoardAccess?.boardId,
    currentBoardAccess?.capabilities,
    currentUserId,
    reference,
    sourceBoardId,
    task,
  ]);

  const canonical = reference
    ? remoteCanonical
    : toCanonicalCapabilities(currentBoardAccess?.capabilities, boardPermissions.loading);

  return {
    ...canonical,
    canManageTaskReference: boardPermissions.canManageTaskReference,
    canDragPlacement: reference
      ? boardPermissions.canManageTaskReference
      : canonical.canMoveTask,
    canReadPlacement: boardPermissions.canReadBoard,
  };
};
