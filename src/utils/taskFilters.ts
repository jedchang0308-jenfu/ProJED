import dayjs from 'dayjs';
import type { TaskNode } from '../types';

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
