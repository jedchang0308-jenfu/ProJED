import dayjs from 'dayjs';
import type { TaskNode } from '../types';

export const UNASSIGNED_ASSIGNEE_FILTER = '__unassigned__';

export const matchesDueDateFilter = (
  node: Pick<TaskNode, 'endDate'> | null | undefined,
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
  node: Pick<TaskNode, 'assigneeId'> | null | undefined,
  selectedAssigneeIds: string[] | null | undefined,
) => {
  if (!selectedAssigneeIds || selectedAssigneeIds.length === 0) return true;
  const assigneeId = node?.assigneeId;
  if (!assigneeId) return selectedAssigneeIds.includes(UNASSIGNED_ASSIGNEE_FILTER);
  return selectedAssigneeIds.includes(assigneeId);
};
