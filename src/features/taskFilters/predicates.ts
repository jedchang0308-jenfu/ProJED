import type {
  AnyTaskFilterQuery,
  LegacyTaskFilterQueryV5,
  TaskFilterableNode,
  TaskFilterQuery,
  TaskFilterQueryV6,
} from './types';
import { normalizeTaskFilters, normalizeTaskFiltersV5 } from './storage';
import { getTaskAssignmentIds } from '../../utils/taskAssignments';
import { getDeferredTaskStatusForFilters } from './deferredRefresh';
import { normalizeManualTaskStatus, type ManualTaskStatus } from '../../utils/taskStatus';

export const UNASSIGNED_ASSIGNEE_FILTER = '__unassigned__';
const DAY_MS = 86400000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidDateOnly = (value: string) => {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const formatTaipeiDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes, fallback: string) => parts.find(part => part.type === type)?.value ?? fallback;
  return `${get('year', '1970')}-${get('month', '01')}-${get('day', '01')}`;
};

export const getTaipeiToday = (now: Date | number = new Date()): string => formatTaipeiDate(new Date(now));

export const toTaipeiCalendarDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  if (value.length === 10 && DATE_ONLY_RE.test(dateOnly)) return isValidDateOnly(dateOnly) ? dateOnly : null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? formatTaipeiDate(new Date(timestamp)) : null;
};

export const diffInTaipeiCalendarDays = (from: string, to: string): number | null => {
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) return null;
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS);
};

const isOverdueOnDate = (node: Pick<TaskFilterableNode, 'endDate' | 'isArchived' | 'status'>, today: string) => {
  if (node.isArchived || normalizeManualTaskStatus(node.status) === 'completed') return false;
  const dueDate = toTaipeiCalendarDate(node.endDate);
  return Boolean(dueDate && dueDate < today);
};
const normalizeKeyword = (value: string) => value.trim().toLocaleLowerCase();
const intersects = (values: readonly string[], selected: ReadonlySet<string>) => values.some(value => selected.has(value));
const isV6 = (filters: AnyTaskFilterQuery): filters is TaskFilterQueryV6 => 'version' in filters && filters.version === 6;

export const matchesLegacyDueDateFilterV5 = (
  node: Pick<TaskFilterableNode, 'endDate' | 'isArchived' | 'status'> | null | undefined,
  due: LegacyTaskFilterQueryV5['due'],
  today = getTaipeiToday(),
) => {
  if (!node) return false;
  const dateEnabled = due.includeOverdue || due.upcomingWithinDays !== null;
  if (!dateEnabled) return true;
  const dueDate = toTaipeiCalendarDate(node.endDate);
  if (!dueDate) return false;
  const days = diffInTaipeiCalendarDays(today, dueDate);
  return (due.includeOverdue && isOverdueOnDate(node, today)) || (due.upcomingWithinDays !== null && days !== null && days >= 0 && days <= due.upcomingWithinDays);
};

export const matchesDueDateFilter = (
  node: Pick<TaskFilterableNode, 'endDate' | 'isArchived' | 'status'> | null | undefined,
  due: TaskFilterQuery['due'] | LegacyTaskFilterQueryV5['due'],
  today = getTaipeiToday(),
) => {
  if ('includeOverdue' in due && !('mode' in due)) return matchesLegacyDueDateFilterV5(node, due, today);
  if (!node) return false;
  if (due.mode === 'all' || due.mode === 'none') return true;
  if (due.mode === 'legacy-v5') return matchesLegacyDueDateFilterV5(node, due, today);
  if (due.buckets.length === 0) return true;
  const dueDate = toTaipeiCalendarDate(node.endDate);
  const days = dueDate ? diffInTaipeiCalendarDays(today, dueDate) : null;
  const bucket = days === null ? 'unset' : days < 0 ? 'before_today' : days <= due.withinDays ? 'within_days' : 'after_days';
  return due.buckets.includes(bucket);
};

export const matchesAssigneeFilter = (
  node: Pick<TaskFilterableNode, 'assigneeId' | 'assigneeIds' | 'collaboratorIds'> | null | undefined,
  people: TaskFilterQuery['people'] | LegacyTaskFilterQueryV5['people'],
) => {
  if (!node) return false;
  const assignmentIds = getTaskAssignmentIds(node);
  if (!('mode' in people)) {
    return (!people.includeUnassigned && people.ids.length === 0) || (people.includeUnassigned && assignmentIds.length === 0) || intersects(assignmentIds, new Set(people.ids));
  }
  if (people.mode === 'all' || people.mode === 'none' || (people.ids.length === 0 && !people.includeUnassigned)) return true;
  return (people.includeUnassigned && assignmentIds.length === 0) || intersects(assignmentIds, new Set(people.ids));
};

export const matchesTagFilters = (
  node: Pick<TaskFilterableNode, 'tagIds'> | null | undefined,
  selected: readonly string[] | TaskFilterQuery['tags'],
) => {
  if (!node) return false;
  if (!('mode' in selected)) return selected.length === 0 || intersects(node.tagIds ?? [], new Set(selected));
  if (selected.mode === 'all' || selected.mode === 'none' || (selected.ids.length === 0 && !selected.includeUntagged)) return true;
  const tagIds = node.tagIds ?? [];
  return (selected.includeUntagged && tagIds.length === 0) || intersects(tagIds, new Set(selected.ids));
};

export const matchesKeywordFilter = (node: Pick<TaskFilterableNode, 'title'> | null | undefined, keyword: string) => {
  if (!node) return false;
  const normalizedKeyword = normalizeKeyword(keyword);
  return normalizedKeyword === '' || normalizeKeyword(node.title ?? '').includes(normalizedKeyword);
};

export type CompiledTaskFilter = {
  query: AnyTaskFilterQuery;
  matches: (node: TaskFilterableNode | null | undefined, statusOverride?: TaskFilterableNode['status']) => boolean;
};

export const compileLegacyTaskFilterV5 = (filters: LegacyTaskFilterQueryV5, today = getTaipeiToday()): CompiledTaskFilter => {
  const query = normalizeTaskFiltersV5(filters);
  const statusSet = new Set<ManualTaskStatus>(query.statuses);
  const peopleSet = new Set(query.people.ids);
  const tagSet = new Set(query.tagIds);
  const normalizedKeyword = normalizeKeyword(query.keyword);
  return {
    query,
    matches: (node, statusOverride) => {
      if (!node) return false;
      const status = normalizeManualTaskStatus(statusOverride ?? node.status);
      const assignmentIds = getTaskAssignmentIds(node);
      return (statusSet.size === 0 || statusSet.has(status))
        && matchesLegacyDueDateFilterV5({ ...node, status }, query.due, today)
        && ((!query.people.includeUnassigned && peopleSet.size === 0) || (query.people.includeUnassigned && assignmentIds.length === 0) || intersects(assignmentIds, peopleSet))
        && (tagSet.size === 0 || intersects(node.tagIds ?? [], tagSet))
        && (normalizedKeyword === '' || normalizeKeyword(node.title ?? '').includes(normalizedKeyword));
    },
  };
};

export const compileTaskFilter = (filters: AnyTaskFilterQuery, today = getTaipeiToday()): CompiledTaskFilter => {
  if (!isV6(filters)) return compileLegacyTaskFilterV5(filters, today);
  const query = normalizeTaskFilters(filters);
  const statusSet = new Set<ManualTaskStatus>(query.statuses.values);
  const peopleSet = new Set(query.people.ids);
  const tagSet = new Set(query.tags.ids);
  const normalizedKeyword = normalizeKeyword(query.keyword);
  return {
    query,
    matches: (node, statusOverride) => {
      if (!node) return false;
      const status = normalizeManualTaskStatus(statusOverride ?? node.status);
      const statusMatch = query.statuses.mode === 'all' || (query.statuses.mode === 'selected' && statusSet.has(status));
      const assignmentIds = getTaskAssignmentIds(node);
      const peopleMatch = query.people.mode === 'all' || (query.people.mode === 'selected' && ((query.people.includeUnassigned && assignmentIds.length === 0) || intersects(assignmentIds, peopleSet)));
      const tagIds = node.tagIds ?? [];
      const tagMatch = query.tags.mode === 'all' || (query.tags.mode === 'selected' && ((query.tags.includeUntagged && tagIds.length === 0) || intersects(tagIds, tagSet)));
      const dateMatch = matchesDueDateFilter({ ...node, status }, query.due, today);
      const keywordMatch = normalizedKeyword === '' || normalizeKeyword(node.title ?? '').includes(normalizedKeyword);
      return statusMatch && dateMatch && peopleMatch && tagMatch && keywordMatch;
    },
  };
};

export const matchesTaskFiltersWithStatus = (node: TaskFilterableNode | null | undefined, filters: AnyTaskFilterQuery, status: TaskFilterableNode['status'], today = getTaipeiToday()) => compileTaskFilter(filters, today).matches(node, status);
export const matchesTaskFilters = (node: TaskFilterableNode | null | undefined, filters: AnyTaskFilterQuery, today = getTaipeiToday()) => node ? compileTaskFilter(filters, today).matches(node, getDeferredTaskStatusForFilters(node.id, node.status)) : false;
