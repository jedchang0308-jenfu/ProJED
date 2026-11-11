export type CalendarDateType = 'start_date' | 'due_date';

export type CalendarFilters = Record<string, unknown>;

export type CalendarFeedTask = {
  id: string;
  tenantId: string;
  projectId: string;
  legacyTaskId: string;
  title: string;
  description: string | null;
  status: string;
  assigneeIds: string[];
  collaboratorIds: string[];
  tagIds: string[];
  startDate: string | null;
  endDate: string | null;
  updatedAt: Date;
};

type TaskFilterV5 = {
  statuses: string[];
  due: { includeOverdue: boolean; upcomingWithinDays: number | null };
  people: { ids: string[]; includeUnassigned: boolean };
  tagIds: string[];
  keyword: string;
};

type LegacyTaskFilter = {
  statusFilters: Record<string, boolean>;
  dueWithinDays: number | null;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
  keyword: string;
};

type BoardSnapshot = {
  included: boolean;
  dateTypes: CalendarDateType[];
  filters: TaskFilterV5 | LegacyTaskFilter;
};

export type NormalizedCalendarFilters = {
  version: 1 | 2 | 3 | 4;
  workspaceIds: string[];
  projectIds: string[];
  scopeType: 'board' | 'workspace' | 'custom';
  assignee: { type: string; userId?: string; userIds: string[]; includeUnassigned: boolean };
  dateTypes: CalendarDateType[];
  globalFilter: LegacyTaskFilter;
  boardOverrides: Record<string, LegacyTaskFilter & { enabled: boolean }>;
  boardFilters: Record<string, BoardSnapshot>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_ORDER = ['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold'];
const DATE_TYPES = new Set<CalendarDateType>(['start_date', 'due_date']);
const UNASSIGNED = '__unassigned__';
const DEFAULT_STATUS_FILTERS: Record<string, boolean> = {
  todo: true,
  in_progress: true,
  delayed: true,
  completed: false,
  unsure: true,
  onhold: true,
};

const record = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== ''))]
  : [];

const dateTypes = (value: unknown): CalendarDateType[] => strings(value)
  .filter((item): item is CalendarDateType => DATE_TYPES.has(item as CalendarDateType));

const normalizeV5 = (value: unknown): TaskFilterV5 => {
  const source = record(value);
  const due = record(source.due);
  const people = record(source.people);
  const rawDays = due.upcomingWithinDays;
  return {
    statuses: STATUS_ORDER.filter(status => strings(source.statuses).includes(status)),
    due: {
      includeOverdue: due.includeOverdue === true,
      upcomingWithinDays: typeof rawDays === 'number' && Number.isInteger(rawDays)
        && rawDays >= 0 && rawDays <= 365 ? rawDays : null,
    },
    people: { ids: strings(people.ids), includeUnassigned: people.includeUnassigned === true },
    tagIds: strings(source.tagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

const normalizeLegacy = (value: unknown): LegacyTaskFilter => {
  const source = record(value);
  const statusFilters = record(source.statusFilters);
  const rawDays = source.dueWithinDays;
  return {
    statusFilters: Object.fromEntries(STATUS_ORDER.map(status => [
      status,
      typeof statusFilters[status] === 'boolean' ? statusFilters[status] : (DEFAULT_STATUS_FILTERS[status] ?? false),
    ])),
    dueWithinDays: typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : null,
    selectedAssigneeIds: strings(source.selectedAssigneeIds),
    selectedTagIds: strings(source.selectedTagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword : '',
  };
};

export function normalizeCalendarFilters(value: unknown): NormalizedCalendarFilters {
  const source = record(value);
  const version = source.version === 4 || source.v4_scope_type === 'per_board_filter_snapshot' ? 4
    : source.version === 3 || source.v3_scope_type === 'per_board_filter_snapshot' ? 3
      : source.version === 2 || source.v2_scope_type === 'all_accessible_boards_snapshot' ? 2 : 1;
  const rawAssignee = record(source.assignee);
  const rawScope = source.scope_type;
  const scopeType = rawScope === 'board' || rawScope === 'custom' || rawScope === 'workspace'
    ? rawScope : version >= 2 ? 'custom' : 'workspace';
  const boardFilters: Record<string, BoardSnapshot> = {};
  for (const [projectId, rawSnapshot] of Object.entries(record(source.board_filters))) {
    if (!UUID_RE.test(projectId)) continue;
    const snapshot = record(rawSnapshot);
    if (typeof snapshot.included !== 'boolean') continue;
    const rawFilter = record(snapshot.filters);
    boardFilters[projectId] = {
      included: snapshot.included,
      dateTypes: dateTypes(snapshot.date_types),
      filters: version === 4 || 'statuses' in rawFilter ? normalizeV5(rawFilter) : normalizeLegacy(rawFilter),
    };
  }
  const boardOverrides: NormalizedCalendarFilters['boardOverrides'] = {};
  for (const [projectId, rawOverride] of Object.entries(record(source.board_overrides))) {
    if (!UUID_RE.test(projectId)) continue;
    const override = record(rawOverride);
    boardOverrides[projectId] = { ...normalizeLegacy(override), enabled: override.enabled !== false };
  }
  return {
    version,
    workspaceIds: strings(source.workspace_ids).filter(id => UUID_RE.test(id)),
    projectIds: strings(source.project_ids).filter(id => UUID_RE.test(id)),
    scopeType,
    assignee: {
      type: typeof rawAssignee.type === 'string' ? rawAssignee.type : 'me',
      ...(typeof rawAssignee.user_id === 'string' ? { userId: rawAssignee.user_id } : {}),
      userIds: strings(rawAssignee.user_ids).filter(id => UUID_RE.test(id)),
      includeUnassigned: rawAssignee.include_unassigned === true,
    },
    dateTypes: dateTypes(source.date_types),
    globalFilter: normalizeLegacy(source.global_filter),
    boardOverrides,
    boardFilters,
  };
}

function taipeiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes, fallback: string) => (
    parts.find(item => item.type === type)?.value ?? fallback
  );
  return `${part('year', '1970')}-${part('month', '01')}-${part('day', '01')}`;
}

function daysBetween(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function assignmentIds(task: CalendarFeedTask): string[] {
  return [...new Set([...task.assigneeIds, ...task.collaboratorIds])];
}

function matchesV5(task: CalendarFeedTask, filter: TaskFilterV5): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) return false;
  if (filter.due.includeOverdue || filter.due.upcomingWithinDays !== null) {
    if (!task.endDate) return false;
    const delta = daysBetween(taipeiToday(), task.endDate);
    if (!(filter.due.includeOverdue && delta < 0)
        && !(filter.due.upcomingWithinDays !== null && delta >= 0 && delta <= filter.due.upcomingWithinDays)) return false;
  }
  const assignments = assignmentIds(task);
  if (filter.people.ids.length > 0 || filter.people.includeUnassigned) {
    if (!filter.people.ids.some(id => assignments.includes(id))
        && !(filter.people.includeUnassigned && task.assigneeIds.length === 0)) return false;
  }
  if (filter.tagIds.length > 0 && !filter.tagIds.some(id => task.tagIds.includes(id))) return false;
  return !filter.keyword || task.title.toLocaleLowerCase().includes(filter.keyword.toLocaleLowerCase());
}

function matchesLegacy(task: CalendarFeedTask, filter: LegacyTaskFilter): boolean {
  if (filter.statusFilters[task.status] !== true) return false;
  if (filter.dueWithinDays !== null) {
    if (!task.endDate || daysBetween(taipeiToday(), task.endDate) > filter.dueWithinDays) return false;
  }
  const assignments = assignmentIds(task);
  if (filter.selectedAssigneeIds.length > 0
      && !filter.selectedAssigneeIds.some(id => id === UNASSIGNED
        ? task.assigneeIds.length === 0 : assignments.includes(id))) return false;
  if (filter.selectedTagIds.length > 0 && !filter.selectedTagIds.some(id => task.tagIds.includes(id))) return false;
  return !filter.keyword.trim()
    || task.title.toLocaleLowerCase().includes(filter.keyword.trim().toLocaleLowerCase());
}

function legacyAssignees(filters: NormalizedCalendarFilters, ownerUserId: string): { ids: string[]; includeUnassigned: boolean } {
  if (filters.assignee.type === 'user' && filters.assignee.userId && UUID_RE.test(filters.assignee.userId)) {
    return { ids: [filters.assignee.userId], includeUnassigned: false };
  }
  if (filters.assignee.type === 'selected') {
    return { ids: filters.assignee.userIds, includeUnassigned: filters.assignee.includeUnassigned };
  }
  return { ids: [ownerUserId], includeUnassigned: false };
}

export function calendarProjectIncluded(filters: NormalizedCalendarFilters, projectId: string): boolean {
  if (filters.version === 3 || filters.version === 4) {
    return filters.projectIds.includes(projectId) && filters.boardFilters[projectId]?.included === true;
  }
  if (filters.scopeType === 'board') return filters.projectIds.length === 1 && filters.projectIds[0] === projectId;
  if (filters.scopeType === 'custom' && filters.projectIds.length > 0) return filters.projectIds.includes(projectId);
  return true;
}

export function calendarDateTypes(filters: NormalizedCalendarFilters, projectId: string): CalendarDateType[] {
  if (filters.version === 3 || filters.version === 4) {
    return filters.boardFilters[projectId]?.included ? filters.boardFilters[projectId]!.dateTypes : [];
  }
  return filters.dateTypes;
}

export function calendarProjectSelectedUsers(
  filters: NormalizedCalendarFilters,
  projectId: string,
  ownerUserId: string,
): string[] {
  if (filters.version === 4) {
    const candidate = filters.boardFilters[projectId]?.filters;
    return candidate && 'people' in candidate ? candidate.people.ids.filter(id => UUID_RE.test(id)) : [];
  }
  if (filters.version === 3) {
    const candidate = filters.boardFilters[projectId]?.filters;
    return candidate && 'selectedAssigneeIds' in candidate
      ? candidate.selectedAssigneeIds.filter(id => id !== UNASSIGNED && UUID_RE.test(id)) : [];
  }
  return legacyAssignees(filters, ownerUserId).ids;
}

export function calendarProjectRequiresManage(
  filters: NormalizedCalendarFilters,
  projectId: string,
  ownerUserId: string,
): boolean {
  if (filters.version === 4) {
    const candidate = filters.boardFilters[projectId]?.filters;
    return Boolean(candidate && 'people' in candidate
      && (candidate.people.ids.length === 0 || candidate.people.includeUnassigned
        || candidate.people.ids.some(id => id !== ownerUserId)));
  }
  if (filters.version === 3) {
    const candidate = filters.boardFilters[projectId]?.filters;
    return Boolean(candidate && 'selectedAssigneeIds' in candidate
      && (candidate.selectedAssigneeIds.length === 0 || candidate.selectedAssigneeIds.includes(UNASSIGNED)
        || candidate.selectedAssigneeIds.some(id => id !== ownerUserId)));
  }
  const selection = legacyAssignees(filters, ownerUserId);
  return selection.includeUnassigned || selection.ids.some(id => id !== ownerUserId);
}

export function matchesCalendarTask(
  task: CalendarFeedTask,
  filters: NormalizedCalendarFilters,
  ownerUserId: string,
): boolean {
  if (filters.version === 4) {
    const candidate = filters.boardFilters[task.projectId]?.filters;
    return Boolean(candidate && 'statuses' in candidate && matchesV5(task, candidate));
  }
  if (filters.version === 3) {
    const candidate = filters.boardFilters[task.projectId]?.filters;
    return Boolean(candidate && 'selectedAssigneeIds' in candidate && matchesLegacy(task, candidate));
  }
  if (filters.version === 2) {
    const override = filters.boardOverrides[task.projectId];
    return override?.enabled === false ? false : matchesLegacy(task, override ?? filters.globalFilter);
  }
  const selection = legacyAssignees(filters, ownerUserId);
  const assignments = assignmentIds(task);
  return selection.ids.some(id => assignments.includes(id))
    || (selection.includeUnassigned && task.assigneeIds.length === 0);
}
