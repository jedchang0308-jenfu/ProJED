export type TaskFilterQueryV5 = {
  statuses: string[];
  due: { includeOverdue: boolean; upcomingWithinDays: number | null };
  people: { ids: string[]; includeUnassigned: boolean };
  tagIds: string[];
  keyword: string;
};

const STATUS_ORDER = ['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold'];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const strings = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim()).map(item => item.trim())))
  : [];

const days = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 365 ? value : null;

export const normalizeTaskFilterQueryV5 = (value: unknown): TaskFilterQueryV5 => {
  const source = asRecord(value);
  const due = asRecord(source.due);
  const people = asRecord(source.people);
  return {
    statuses: STATUS_ORDER.filter(status => strings(source.statuses).includes(status)),
    due: {
      includeOverdue: due.includeOverdue === true,
      upcomingWithinDays: days(due.upcomingWithinDays),
    },
    people: {
      ids: strings(people.ids),
      includeUnassigned: people.includeUnassigned === true,
    },
    tagIds: strings(source.tagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

const taipeiToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return [
    parts.find(part => part.type === 'year')?.value ?? '1970',
    parts.find(part => part.type === 'month')?.value ?? '01',
    parts.find(part => part.type === 'day')?.value ?? '01',
  ].join('-');
};

const dateOnly = (value: string | null | undefined) => {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
};

const dateDelta = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

export type TaskFilterV5Task = {
  status: string | null;
  end_date: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  collaborator_ids: string[] | null;
  tagIds: string[];
  title: string;
};

export const matchesTaskFilterQueryV5 = (
  task: TaskFilterV5Task,
  rawQuery: unknown,
  today = taipeiToday(),
) => {
  const query = normalizeTaskFilterQueryV5(rawQuery);
  if (query.statuses.length > 0 && !query.statuses.includes(task.status ?? 'todo')) return false;
  const taskDate = dateOnly(task.end_date);
  if (query.due.includeOverdue || query.due.upcomingWithinDays !== null) {
    if (!taskDate) return false;
    const delta = dateDelta(today, taskDate);
    const matchesOverdue = query.due.includeOverdue && delta < 0;
    const matchesUpcoming = query.due.upcomingWithinDays !== null && delta >= 0 && delta <= query.due.upcomingWithinDays;
    if (!matchesOverdue && !matchesUpcoming) return false;
  }
  const primaryIds = Array.from(new Set([
    ...(task.assignee_ids ?? []),
    ...(task.assignee_id ? [task.assignee_id] : []),
  ]));
  const assignmentIds = Array.from(new Set([...primaryIds, ...(task.collaborator_ids ?? [])]));
  if (query.people.ids.length > 0 || query.people.includeUnassigned) {
    const matchesPeople = query.people.ids.some(id => assignmentIds.includes(id))
      || (query.people.includeUnassigned && primaryIds.length === 0);
    if (!matchesPeople) return false;
  }
  if (query.tagIds.length > 0 && !query.tagIds.some(id => task.tagIds.includes(id))) return false;
  if (query.keyword && !task.title.toLocaleLowerCase().includes(query.keyword.toLocaleLowerCase())) return false;
  return true;
};
