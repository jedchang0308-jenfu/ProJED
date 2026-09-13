import type { TaskFilterQuery } from './types';

export const countActiveTaskFilters = (filters: TaskFilterQuery) => {
  const hasStatusFilter = filters.statuses.length > 0;
  const hasDueFilter = filters.due.includeOverdue || filters.due.upcomingWithinDays !== null;
  const hasPeopleFilter = filters.people.includeUnassigned || filters.people.ids.length > 0;
  const hasTagFilter = filters.tagIds.length > 0;
  const hasKeywordFilter = Boolean(filters.keyword.trim());
  return Number(hasStatusFilter) + Number(hasDueFilter) + Number(hasPeopleFilter) +
    Number(hasTagFilter) + Number(hasKeywordFilter);
};

export const describeTaskFilters = (filters: TaskFilterQuery) => {
  const summaries: string[] = [];
  if (filters.statuses.length > 0) {
    summaries.push(`包含 ${filters.statuses.length} 種狀態`);
  }
  if (filters.due.includeOverdue) summaries.push('包含逾期');
  if (filters.due.upcomingWithinDays !== null) summaries.push(`${filters.due.upcomingWithinDays} 天內到期`);
  if (filters.people.ids.length > 0 || filters.people.includeUnassigned) {
    const count = filters.people.ids.length + Number(filters.people.includeUnassigned);
    summaries.push(`${count} 個負責人/協作條件`);
  }
  if (filters.tagIds.length > 0) summaries.push(`${filters.tagIds.length} 個標籤`);
  if (filters.keyword.trim()) summaries.push(`關鍵字「${filters.keyword.trim()}」`);
  return summaries.length > 0 ? summaries : ['全部任務條件'];
};
