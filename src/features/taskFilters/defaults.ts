import type {
  LegacyTaskFilterQueryV5,
  TaskDisplaySettings,
  TaskFilterDateBucket,
  TaskFilterQuery,
} from './types';
import type { TaskStatus } from '../../types';
import type { ManualTaskStatus } from '../../utils/taskStatus';

export const TASK_STATUS_OPTIONS: Array<{ key: ManualTaskStatus; label: string }> = [
  { key: 'todo', label: '待辦' },
  { key: 'in_progress', label: '進行中' },
  { key: 'onhold', label: '暫緩' },
  { key: 'completed', label: '完成' },
];

/** Historical dirty-candidate marker, accepted only by the v5 migration mapper. */
export const ALL_ASSIGNEES_FILTER = '__all_assignees__';

export const TASK_FILTER_DATE_BUCKETS: TaskFilterDateBucket[] = [
  'unset',
  'before_today',
  'within_days',
  'after_days',
];

/** Legacy v4 status map used only by migration fixtures and the old WBS helper. */
export const createDefaultStatusFilters = (): Record<TaskStatus, boolean> => ({
  todo: true,
  in_progress: true,
  delayed: true,
  completed: true,
  unsure: true,
  onhold: true,
});

export const createDefaultTaskFilters = (): TaskFilterQuery => ({
  version: 6,
  statuses: { mode: 'all', values: [] },
  due: {
    mode: 'all',
    buckets: [],
    withinDays: 8,
  },
  people: {
    mode: 'all',
    ids: [],
    includeUnassigned: false,
  },
  tags: {
    mode: 'all',
    ids: [],
    includeUntagged: false,
  },
  keyword: '',
});

export const createDefaultBoardTaskFilters = createDefaultTaskFilters;

export const createDefaultTaskFiltersV5 = (): LegacyTaskFilterQueryV5 => ({
  statuses: [],
  due: {
    includeOverdue: false,
    upcomingWithinDays: null,
  },
  people: {
    ids: [],
    includeUnassigned: false,
  },
  tagIds: [],
  keyword: '',
});

export const createDefaultTaskDisplaySettings = (): TaskDisplaySettings => ({
  showDependencies: true,
  showStartDate: true,
  showTags: true,
  showTagNames: true,
});
