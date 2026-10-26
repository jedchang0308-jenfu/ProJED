import type { LegacyTaskFilterQueryV5, TaskFilterQuery } from './types';
import { normalizeTaskFilters } from './storage';

export const countActiveTaskFiltersV5 = (filters: LegacyTaskFilterQueryV5) => Number(filters.statuses.length > 0)
  + Number(filters.due.includeOverdue || filters.due.upcomingWithinDays !== null)
  + Number(filters.people.includeUnassigned || filters.people.ids.length > 0)
  + Number(filters.tagIds.length > 0)
  + Number(Boolean(filters.keyword.trim()));

export const countActiveTaskFilters = (value: TaskFilterQuery) => {
  const filters = normalizeTaskFilters(value);
  return Number(filters.statuses.mode !== 'all')
    + Number(filters.due.mode !== 'all')
    + Number(filters.people.mode !== 'all')
    + Number(filters.tags.mode !== 'all')
    + Number(Boolean(filters.keyword.trim()));
};

export const describeTaskFilters = (value: TaskFilterQuery) => {
  const filters = normalizeTaskFilters(value);
  const summaries: string[] = [];
  if (filters.statuses.mode === 'selected') summaries.push(`包含 ${filters.statuses.values.length} 種狀態`);
  if (filters.due.mode === 'selected') summaries.push(`包含 ${filters.due.buckets.length} 種日期`);
  if (filters.due.mode === 'legacy-v5') summaries.push('沿用舊日期條件');
  if (filters.people.mode === 'selected') {
    const count = filters.people.ids.length + Number(filters.people.includeUnassigned);
    summaries.push(`${count} 個負責人/協作條件`);
  }
  if (filters.tags.mode === 'selected') summaries.push(`${filters.tags.ids.length + Number(filters.tags.includeUntagged)} 個標籤`);
  if (filters.keyword.trim()) summaries.push(`關鍵字「${filters.keyword.trim()}」`);
  return summaries.length > 0 ? summaries : ['全部任務條件'];
};
