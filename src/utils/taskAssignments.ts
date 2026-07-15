import type { TaskNode } from '../types';

const uniqueNonEmptyIds = (ids: readonly (string | null | undefined)[]) => Array.from(
  new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
);

export type TaskAssignmentSelection = {
  primaryIds: string[];
  collaboratorIds: string[];
};

export const getTaskAssigneeIds = (node: Pick<TaskNode, 'assigneeId' | 'assigneeIds'> | null | undefined) =>
  uniqueNonEmptyIds(node?.assigneeIds?.length ? node.assigneeIds : node?.assigneeId ? [node.assigneeId] : []);

export const normalizeTaskAssignmentSelection = (
  primaryIds: readonly (string | null | undefined)[] = [],
  collaboratorIds: readonly (string | null | undefined)[] = [],
): TaskAssignmentSelection => {
  const normalizedPrimaryIds = uniqueNonEmptyIds(primaryIds);
  const primarySet = new Set(normalizedPrimaryIds);

  return {
    primaryIds: normalizedPrimaryIds,
    // Primary membership wins when legacy data contains the same person in both roles.
    collaboratorIds: uniqueNonEmptyIds(collaboratorIds).filter(id => !primarySet.has(id)),
  };
};

export const normalizeTaskAssignmentNode = <T extends TaskNode>(node: T): T => {
  const selection = normalizeTaskAssignmentSelection(
    getTaskAssigneeIds(node),
    node.collaboratorIds ?? [],
  );

  return {
    ...node,
    assigneeIds: selection.primaryIds.length ? selection.primaryIds : undefined,
    assigneeId: selection.primaryIds[0] || undefined,
    collaboratorIds: selection.collaboratorIds,
  };
};

export const normalizeTaskAssignmentUpdates = (
  oldNode: TaskNode,
  updates: Partial<TaskNode>,
): Partial<TaskNode> => {
  const touchesPrimary = 'assigneeIds' in updates || 'assigneeId' in updates;
  const touchesCollaborators = 'collaboratorIds' in updates;
  if (!touchesPrimary && !touchesCollaborators) return updates;

  const nextPrimaryIds = touchesPrimary
    ? (Array.isArray(updates.assigneeIds)
      ? updates.assigneeIds
      : ('assigneeId' in updates && updates.assigneeId ? [updates.assigneeId] : []))
    : getTaskAssigneeIds(oldNode);
  const nextCollaboratorIds = touchesCollaborators
    ? (updates.collaboratorIds ?? [])
    : (oldNode.collaboratorIds ?? []);
  const selection = normalizeTaskAssignmentSelection(nextPrimaryIds, nextCollaboratorIds);

  return {
    ...updates,
    ...(touchesPrimary
      ? {
          assigneeIds: selection.primaryIds.length ? selection.primaryIds : undefined,
          assigneeId: selection.primaryIds[0] || undefined,
        }
      : {}),
    ...(touchesPrimary || touchesCollaborators
      ? { collaboratorIds: selection.collaboratorIds }
      : {}),
  };
};

/**
 * 待辦與完成狀態可暫時沒有主責；進入實際執行、延遲、暫停或未定狀態後，至少要有一位主責。
 * 既有資料不會被強制回填，只有新異動會套用此 guard。
 */
export const requiresPrimaryAssignee = (node: Pick<TaskNode, 'nodeType' | 'isArchived' | 'status'>) =>
  node.nodeType !== 'group' &&
  !node.isArchived &&
  node.status !== 'todo' &&
  node.status !== 'completed';
