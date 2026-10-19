export type TaskFilterOptionSourceStatus = 'ready' | 'loading' | 'error';

export const resolveScopedTaskFilterOptionStatus = ({
  selectedWorkspaceId,
  selectedBoardId,
  taskSourceStatus,
  loadedTaskBoardIds,
  optionSourceStatus,
  optionSourceWorkspaceId,
  optionSourceBoardId,
}: {
  selectedWorkspaceId: string | null;
  selectedBoardId: string | null;
  taskSourceStatus: TaskFilterOptionSourceStatus;
  loadedTaskBoardIds: readonly string[];
  optionSourceStatus: TaskFilterOptionSourceStatus;
  optionSourceWorkspaceId: string | null;
  optionSourceBoardId: string | null;
}): TaskFilterOptionSourceStatus => {
  if (!selectedWorkspaceId || !selectedBoardId) return 'loading';
  if (taskSourceStatus === 'error') return 'error';
  const optionScopeMatches = optionSourceWorkspaceId === selectedWorkspaceId
    && optionSourceBoardId === selectedBoardId;
  if (optionScopeMatches && optionSourceStatus === 'error') return 'error';
  if (
    taskSourceStatus !== 'ready'
    || !loadedTaskBoardIds.includes(selectedBoardId)
    || !optionScopeMatches
    || optionSourceStatus !== 'ready'
  ) return 'loading';
  return 'ready';
};
