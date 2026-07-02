import type { CalendarSubscriptionFilters } from '../services/supabase/database.types';
import type { TaskNode } from '../types';

export type TaskSubscriptionSourceType =
  | 'assigned_to_me'
  | 'created_by_me'
  | 'watching'
  | 'unplaced'
  | 'external';

export type TaskSubscriptionScope = 'all' | 'workspace' | 'board' | 'custom';

export interface TaskSubscriptionSource {
  sourceType: TaskSubscriptionSourceType;
  scope: TaskSubscriptionScope;
  workspaceIds: string[];
  boardIds: string[];
  includeCompleted: boolean;
  includeArchived: boolean;
}

export const createDefaultCalendarSubscriptionFilters = (): CalendarSubscriptionFilters => ({
  scope_type: 'workspace',
  workspace_ids: [],
  board_ids: [],
  assignee: { type: 'me' },
  date_types: ['due_date'],
});

export const createAssignedToMeTaskSource = (options?: {
  scope?: TaskSubscriptionScope;
  workspaceId?: string | null;
  boardId?: string | null;
  workspaceIds?: string[];
  boardIds?: string[];
  includeCompleted?: boolean;
  includeArchived?: boolean;
}): TaskSubscriptionSource => {
  const scope = options?.scope || 'all';
  const workspaceIds = scope === 'custom'
    ? (options?.workspaceIds || []).filter(Boolean)
    : scope === 'workspace' || scope === 'board'
      ? [options?.workspaceId].filter((value): value is string => Boolean(value))
      : [];
  const boardIds = scope === 'custom'
    ? (options?.boardIds || []).filter(Boolean)
    : scope === 'board'
      ? [options?.boardId].filter((value): value is string => Boolean(value))
      : [];

  return {
    sourceType: 'assigned_to_me',
    scope,
    workspaceIds,
    boardIds,
    includeCompleted: Boolean(options?.includeCompleted),
    includeArchived: Boolean(options?.includeArchived),
  };
};

export const taskMatchesSubscriptionSource = (
  task: TaskNode,
  source: TaskSubscriptionSource,
  currentUserId?: string | null,
) => {
  if (!source.includeArchived && task.isArchived) return false;
  if (!source.includeCompleted && task.status === 'completed') return false;

  if (source.sourceType === 'assigned_to_me' && (!currentUserId || task.assigneeId !== currentUserId)) return false;

  if (source.scope === 'custom') {
    if (source.workspaceIds.length === 0 && source.boardIds.length === 0) return false;
    return source.workspaceIds.includes(task.workspaceId) || source.boardIds.includes(task.boardId);
  }

  if (source.workspaceIds.length > 0 && !source.workspaceIds.includes(task.workspaceId)) return false;
  if (source.boardIds.length > 0 && !source.boardIds.includes(task.boardId)) return false;

  if (source.sourceType === 'assigned_to_me') return true;

  return false;
};

export const describeTaskSubscriptionScope = (
  scope: TaskSubscriptionScope,
  workspaceTitle?: string,
  boardTitle?: string,
) => {
  if (scope === 'custom') return '自訂';
  if (scope === 'board') return boardTitle || '目前看板';
  if (scope === 'workspace') return workspaceTitle || '目前工作區';
  return '全部';
};
