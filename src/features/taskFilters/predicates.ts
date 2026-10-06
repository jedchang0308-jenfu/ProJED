import type { TaskFilterableNode, TaskFilterQuery } from './types';
import { normalizeTaskFilters } from './storage';
import { getTaskAssignmentIds } from '../../utils/taskAssignments';
import { getDeferredTaskStatusForFilters } from './deferredRefresh';
import { normalizeManualTaskStatus, type ManualTaskStatus } from '../../utils/taskStatus';

export const UNASSIGNED_ASSIGNEE_FILTER = '__unassigned__';

const DAY_MS = 86400000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidDateOnly = (value: string) => {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  return new Date(timestamp).getUTCFullYear() === year
    && new Date(timestamp).getUTCMonth() === month - 1
    && new Date(timestamp).getUTCDate() === day;
};

const formatTaipeiDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value ?? '1970';
  const month = parts.find(part => part.type === 'month')?.value ?? '01';
  const day = parts.find(part => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

export const getTaipeiToday = (now: Date | number = new Date()): string => (
  formatTaipeiDate(new Date(now))
);

export const toTaipeiCalendarDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  if (DATE_ONLY_RE.test(dateOnly) && value.length === 10) {
    return isValidDateOnly(dateOnly) ? dateOnly : null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? formatTaipeiDate(new Date(timestamp)) : null;
};

export const diffInTaipeiCalendarDays = (
  from: string,
  to: string,
): number | null => {
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) return null;
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round((
    Date.UTC(toYear, toMonth - 1, toDay)
    - Date.UTC(fromYear, fromMonth - 1, fromDay)
  ) / DAY_MS);
};

const isOverdueOnDate = (
  node: Pick<TaskFilterableNode, 'endDate' | 'isArchived' | 'status'>,
  today: string,
) => {
  if (node.isArchived || normalizeManualTaskStatus(node.status) === 'completed') return false;
  const dueDate = toTaipeiCalendarDate(node.endDate);
  return Boolean(dueDate && dueDate < today);
};

const normalizeKeyword = (value: string) => value.trim().toLocaleLowerCase();

const intersects = (values: readonly string[], selected: ReadonlySet<string>) => (
  values.some(value => selected.has(value))
);

export const matchesDueDateFilter = (
  node: Pick<TaskFilterableNode, 'endDate' | 'isArchived' | 'status'> | null | undefined,
  due: TaskFilterQuery['due'],
  today = getTaipeiToday(),
) => {
  if (!node) return false;
  const dateEnabled = due.includeOverdue || due.upcomingWithinDays !== null;
  if (!dateEnabled) return true;

  const dueDate = toTaipeiCalendarDate(node.endDate);
  if (!dueDate) return false;

  const days = diffInTaipeiCalendarDays(today, dueDate);
  const overdueMatch = due.includeOverdue && isOverdueOnDate(node, today);
  const upcomingMatch = due.upcomingWithinDays !== null
    && days !== null
    && days >= 0
    && days <= due.upcomingWithinDays;

  return overdueMatch || upcomingMatch;
};

export const matchesAssigneeFilter = (
  node: Pick<TaskFilterableNode, 'assigneeId' | 'assigneeIds' | 'collaboratorIds'> | null | undefined,
  people: TaskFilterQuery['people'],
) => {
  if (!node) return false;
  const peopleEnabled = people.includeUnassigned || people.ids.length > 0;
  if (!peopleEnabled) return true;

  const assignmentIds = getTaskAssignmentIds(node);
  return (people.includeUnassigned && assignmentIds.length === 0)
    || intersects(assignmentIds, new Set(people.ids));
};

export const matchesTagFilters = (
  node: Pick<TaskFilterableNode, 'tagIds'> | null | undefined,
  selectedTagIds: readonly string[],
) => {
  if (!node) return false;
  if (selectedTagIds.length === 0) return true;
  return intersects(node.tagIds ?? [], new Set(selectedTagIds));
};

export const matchesKeywordFilter = (
  node: Pick<TaskFilterableNode, 'title'> | null | undefined,
  keyword: string,
) => {
  if (!node) return false;
  const normalizedKeyword = normalizeKeyword(keyword);
  return normalizedKeyword === ''
    || normalizeKeyword(node.title ?? '').includes(normalizedKeyword);
};

export type CompiledTaskFilter = {
  query: TaskFilterQuery;
  matches: (
    node: TaskFilterableNode | null | undefined,
    statusOverride?: TaskFilterableNode['status'],
  ) => boolean;
};

export const compileTaskFilter = (
  filters: TaskFilterQuery,
  today = getTaipeiToday(),
): CompiledTaskFilter => {
  const query = normalizeTaskFilters(filters);
  const statusSet = new Set<ManualTaskStatus>(query.statuses);
  const peopleSet = new Set(query.people.ids);
  const tagSet = new Set(query.tagIds);
  const normalizedKeyword = normalizeKeyword(query.keyword);
  const dateEnabled = query.due.includeOverdue || query.due.upcomingWithinDays !== null;

  const matches = (
    node: TaskFilterableNode | null | undefined,
    statusOverride?: TaskFilterableNode['status'],
  ) => {
    if (!node) return false;
    const status = normalizeManualTaskStatus(statusOverride ?? node.status);
    const statusMatch = statusSet.size === 0 || statusSet.has(status);

    const dueDate = toTaipeiCalendarDate(node.endDate);
    const days = dueDate ? diffInTaipeiCalendarDays(today, dueDate) : null;
    const overdueMatch = query.due.includeOverdue && isOverdueOnDate(
      { ...node, status },
      today,
    );
    const upcomingMatch = query.due.upcomingWithinDays !== null
      && days !== null
      && days >= 0
      && days <= query.due.upcomingWithinDays;
    const dateMatch = !dateEnabled || Boolean(overdueMatch || upcomingMatch);

    const assignmentIds = getTaskAssignmentIds(node);
    const peopleMatch = (!query.people.includeUnassigned && peopleSet.size === 0)
      || (query.people.includeUnassigned && assignmentIds.length === 0)
      || intersects(assignmentIds, peopleSet);
    const tagMatch = tagSet.size === 0 || intersects(node.tagIds ?? [], tagSet);
    const keywordMatch = normalizedKeyword === ''
      || normalizeKeyword(node.title ?? '').includes(normalizedKeyword);

    return statusMatch && dateMatch && peopleMatch && tagMatch && keywordMatch;
  };

  return { query, matches };
};

export const matchesTaskFiltersWithStatus = (
  node: TaskFilterableNode | null | undefined,
  filters: TaskFilterQuery,
  status: TaskFilterableNode['status'],
  today = getTaipeiToday(),
) => compileTaskFilter(filters, today).matches(node, status);

export const matchesTaskFilters = (
  node: TaskFilterableNode | null | undefined,
  filters: TaskFilterQuery,
  today = getTaipeiToday(),
) => {
  if (!node) return false;
  const deferredStatus = getDeferredTaskStatusForFilters(node.id, node.status);
  return compileTaskFilter(filters, today).matches(node, deferredStatus);
};
