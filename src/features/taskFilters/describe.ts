import { TASK_STATUS_OPTIONS } from './defaults';
import type { TaskFilterState } from './types';

export const countActiveTaskFilters = (filters: TaskFilterState) => {
  const hiddenStatusCount = TASK_STATUS_OPTIONS.filter(status => !filters.statusFilters[status.key]).length;
  const hasDueFilter = filters.dueWithinDays !== null && filters.dueWithinDays !== undefined;
  const hasKeywordFilter = Boolean(filters.keyword.trim());
  return hiddenStatusCount +
    filters.selectedAssigneeIds.length +
    filters.selectedTagIds.length +
    (hasDueFilter ? 1 : 0) +
    (hasKeywordFilter ? 1 : 0);
};

export const describeTaskFilters = (filters: TaskFilterState) => {
  const summaries: string[] = [];
  const hiddenStatuses = TASK_STATUS_OPTIONS.filter(status => !filters.statusFilters[status.key]);
  if (hiddenStatuses.length > 0) summaries.push(`隱藏 ${hiddenStatuses.length} 種狀態`);
  if (filters.dueWithinDays !== null && filters.dueWithinDays !== undefined) summaries.push(`${filters.dueWithinDays} 天內到期`);
  if (filters.selectedAssigneeIds.length > 0) summaries.push(`${filters.selectedAssigneeIds.length} 位負責人`);
  if (filters.selectedTagIds.length > 0) summaries.push(`${filters.selectedTagIds.length} 個標籤`);
  if (filters.keyword.trim()) summaries.push(`關鍵字「${filters.keyword.trim()}」`);
  return summaries.length > 0 ? summaries : ['全部任務條件'];
};
