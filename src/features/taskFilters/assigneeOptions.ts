import type { BoardMember, CollaborationMemberProfile, TaskNode, TaskTag, WorkspaceMember } from '../../types';
import { getTaskAssignmentIds } from '../../utils/taskAssignments';

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
  selectedIds: readonly string[] = [],
): TaskAssigneeFilterOption[] => {
  const labels = new Map<string, string>();
  const workspaceMemberLabels = createWorkspaceMemberLabels(workspaceMembers);

  boardMembers.forEach(member => {
    if (boardId && member.boardId !== boardId) return;
    labels.set(member.userId, getBoardMemberLabel(member, workspaceMemberLabels));
  });

  Object.values(nodesById).forEach(node => {
    if (!node || node.isArchived || node.boardId !== boardId) return;
    getTaskAssignmentIds(node).forEach(assignmentId => {
      if (!labels.has(assignmentId)) {
        labels.set(
          assignmentId,
          workspaceMemberLabels.get(assignmentId) || createFallbackAssigneeLabel(assignmentId),
        );
      }
    });
  });

  selectedIds.forEach(id => {
    if (!labels.has(id)) labels.set(id, workspaceMemberLabels.get(id) || createFallbackAssigneeLabel(id));
  });

  return Array.from(labels.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
};

export const createTaskTagFilterOptions = (
  boardId: string | null | undefined,
  tags: Array<Pick<TaskTag, 'id' | 'name'>>,
  nodesById: Record<string, TaskNode | null | undefined>,
  selectedIds: readonly string[] = [],
) => {
  const labels = new Map(tags.map(tag => [tag.id, tag.name || tag.id]));
  Object.values(nodesById).forEach(node => {
    if (!node || node.isArchived || node.boardId !== boardId) return;
    (node.tagIds ?? []).forEach(id => { if (!labels.has(id)) labels.set(id, `標籤 ${id.slice(0, 8)}`); });
  });
  selectedIds.forEach(id => { if (!labels.has(id)) labels.set(id, `標籤 ${id.slice(0, 8)}`); });
  return Array.from(labels, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'));
};
