import dayjs from 'dayjs';
import type { TaskFilterState, TaskFilterableNode } from './types';
import { getTaskAssigneeIds } from '../../utils/taskAssignments';

export const UNASSIGNED_ASSIGNEE_FILTER = '__unassigned__';

export const matchesDueDateFilter = (
  node: Pick<TaskFilterableNode, 'endDate'> | null | undefined,
  dueWithinDays: number | null | undefined,
) => {
  if (dueWithinDays === null || dueWithinDays === undefined) return true;
  if (!node?.endDate) return false;

  const dueDate = dayjs(node.endDate).startOf('day');
  if (!dueDate.isValid()) return false;

  const today = dayjs().startOf('day');
  return dueDate.diff(today, 'day') <= dueWithinDays;
};

export const matchesAssigneeFilter = (
  node: Pick<TaskFilterableNode, 'assigneeId' | 'assigneeIds'> | null | undefined,
  selectedAssigneeIds: string[] | null | undefined,
) => {
  if (!selectedAssigneeIds || selectedAssigneeIds.length === 0) return true;
  const assigneeIds = getTaskAssigneeIds(node);
  if (assigneeIds.length === 0) return selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER);
  return assigneeIds.some(assigneeId => selectedAssigneeIds.includes(assigneeId));
};

export const matchesTagFilters = (
  node: Pick<TaskFilterableNode, 'tagIds'> | null | undefined,
  selectedTagIds: string[] | null | undefined,
) => {
  if (!selectedTagIds || selectedTagIds.length === 0) return true;
  const tagIds = node?.tagIds ?? [];
  return selectedTagIds.some(tagId => tagIds.includes(tagId));
};

export const matchesKeywordFilter = (
  node: Pick<TaskFilterableNode, 'title'> | null | undefined,
  keyword: string | null | undefined,
) => {
  const trimmed = keyword?.trim();
  if (!trimmed) return true;
  return (node?.title || '').toLocaleLowerCase().includes(trimmed.toLocaleLowerCase());
};

export const matchesTaskFilters = (
  node: TaskFilterableNode | null | undefined,
  filters: TaskFilterState,
) => {
  if (!node) return false;
  return Boolean(filters.statusFilters[node.status || 'todo']) &&
    matchesDueDateFilter(node, filters.dueWithinDays) &&
    matchesAssigneeFilter(node, filters.selectedAssigneeIds) &&
    matchesTagFilters(node, filters.selectedTagIds) &&
    matchesKeywordFilter(node, filters.keyword);
};
