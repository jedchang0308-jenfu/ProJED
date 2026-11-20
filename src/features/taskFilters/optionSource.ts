import type { BoardMember, TaskTag, WorkspaceMember } from '../../types';

export const filterReadIdentity = (user: { uid: string } | null) => {
  const context = user && 'authContextId' in user && typeof user.authContextId === 'string' ? user.authContextId : '';
  return user ? `${user.uid}:${context}` : null;
};

export const loadBoardFilterOptions = async (
  workspaceId: string,
  boardId: string,
  reads: {
    listBoardMembers(workspaceId: string, boardId: string): Promise<BoardMember[]>;
    listTags(workspaceId: string): Promise<TaskTag[]>;
    listWorkspaceMembers?: (workspaceId: string) => Promise<WorkspaceMember[]>;
  },
) => {
  const [workspaceMembers, boardMembers, tags] = await Promise.all([
    reads.listWorkspaceMembers?.(workspaceId) ?? Promise.resolve([]),
    reads.listBoardMembers(workspaceId, boardId),
    reads.listTags(workspaceId),
  ]);
  return { workspaceMembers, boardMembers, tags };
};
