import type { BoardMember, CollaborationMemberProfile, TaskNode, WorkspaceMember } from '../../types';
import { getTaskAssigneeIds } from '../../utils/taskAssignments';

export type TaskAssigneeFilterOption = {
  id: string;
  label: string;
};

export const createFallbackAssigneeLabel = (userId: string) =>
  userId.length > 8 ? `成員 ${userId.slice(0, 8)}` : userId || '未指派';

const getProfileLabel = (profile?: CollaborationMemberProfile | null) =>
  profile?.displayName?.trim() || profile?.email?.trim() || '';

const createWorkspaceMemberLabels = (workspaceMembers: WorkspaceMember[]) => {
  const labels = new Map<string, string>();

  workspaceMembers.forEach(member => {
    const label = getProfileLabel(member.profile);
    if (label) labels.set(member.userId, label);
  });

  return labels;
};

const getBoardMemberLabel = (member: BoardMember, workspaceMemberLabels: Map<string, string>) =>
  getProfileLabel(member.profile) || workspaceMemberLabels.get(member.userId) || createFallbackAssigneeLabel(member.userId);

export const createBoardAssigneeFilterOptions = (
  boardId: string | null | undefined,
  boardMembers: BoardMember[],
  nodesById: Record<string, TaskNode | null | undefined>,
  workspaceMembers: WorkspaceMember[] = [],
): TaskAssigneeFilterOption[] => {
  const labels = new Map<string, string>();
  const workspaceMemberLabels = createWorkspaceMemberLabels(workspaceMembers);

  boardMembers.forEach(member => {
    if (boardId && member.boardId !== boardId) return;
    labels.set(member.userId, getBoardMemberLabel(member, workspaceMemberLabels));
  });

  Object.values(nodesById).forEach(node => {
    if (!node || node.isArchived || node.boardId !== boardId) return;
    getTaskAssigneeIds(node).forEach(assigneeId => {
      if (!labels.has(assigneeId)) {
        labels.set(
          assigneeId,
          workspaceMemberLabels.get(assigneeId) || createFallbackAssigneeLabel(assigneeId),
        );
      }
    });
  });

  return Array.from(labels.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
};
