export const isCalendarAssigneeVisible = (
  option: { boardIds?: string[]; workspaceIds?: string[] },
  boardIds: string[],
  workspaceIds: string[],
) => option.boardIds !== undefined
  ? option.boardIds.some(id => boardIds.includes(id))
  : !option.workspaceIds?.length || option.workspaceIds.some(id => workspaceIds.includes(id));
