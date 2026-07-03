import type { BoardMember, TaskNode } from '../../types';

export type TaskAssigneeFilterOption = {
  id: string;
  label: string;
};

export const createFallbackAssigneeLabel = (userId: string) =>
  userId.length > 8 ? `成員 ${userId.slice(0, 8)}` : userId || '未指派';

const getBoardMemberLabel = (member: BoardMember) =>
  member.profile?.displayName || member.profile?.email || createFallbackAssigneeLabel(member.userId);

export const createBoardAssigneeFilterOptions = (
  boardId: string | null | undefined,
  boardMembers: BoardMember[],
  nodesById: Record<string, TaskNode | null | undefined>,
): TaskAssigneeFilterOption[] => {
  const labels = new Map<string, string>();

  boardMembers.forEach(member => {
    if (boardId && member.boardId !== boardId) return;
    labels.set(member.userId, getBoardMemberLabel(member));
  });

  Object.values(nodesById).forEach(node => {
    if (!node || node.isArchived || node.boardId !== boardId || !node.assigneeId) return;
    if (!labels.has(node.assigneeId)) {
      labels.set(node.assigneeId, createFallbackAssigneeLabel(node.assigneeId));
    }
  });

  return Array.from(labels.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
};
