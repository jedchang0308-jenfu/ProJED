import type { TaskDisplaySettings, TaskFilterState } from './types';
import type { TaskStatus } from '../../types';
import type { ManualTaskStatus } from '../../utils/taskStatus';

export const TASK_STATUS_OPTIONS: Array<{ key: ManualTaskStatus; label: string }> = [
  { key: 'todo', label: '待辦' },
  { key: 'in_progress', label: '進行中' },
  { key: 'onhold', label: '暫緩' },
  { key: 'completed', label: '完成' },
];

export const createDefaultStatusFilters = (): Record<TaskStatus, boolean> => ({
  todo: true,
  in_progress: true,
  delayed: true,
  completed: false,
  unsure: true,
  onhold: true,
});

export const createDefaultTaskFilters = (): TaskFilterState => ({
  statusFilters: createDefaultStatusFilters(),
  dueWithinDays: null,
  overdueOnly: false,
  selectedAssigneeIds: [],
  selectedTagIds: [],
  keyword: '',
});

export const createDefaultTaskDisplaySettings = (): TaskDisplaySettings => ({
  showDependencies: true,
  showStartDate: true,
  showTags: true,
  showTagNames: true,
});
