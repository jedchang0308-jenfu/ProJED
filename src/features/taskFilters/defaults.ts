import type { TaskDisplaySettings, TaskFilterState } from './types';
import type { TaskStatus } from '../../types';

export const TASK_STATUS_OPTIONS: Array<{ key: TaskStatus; label: string; color: string }> = [
  { key: 'todo', label: '待辦', color: 'bg-status-todo' },
  { key: 'in_progress', label: '進行中', color: 'bg-blue-500' },
  { key: 'delayed', label: '延遲', color: 'bg-status-delayed' },
  { key: 'completed', label: '完成', color: 'bg-status-completed' },
  { key: 'unsure', label: '未定', color: 'bg-status-unsure' },
  { key: 'onhold', label: '暫緩', color: 'bg-status-onhold' },
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
  selectedAssigneeIds: [],
  selectedTagIds: [],
  keyword: '',
});

export const createDefaultTaskDisplaySettings = (): TaskDisplaySettings => ({
  showDependencies: true,
  showStartDate: true,
  showTags: true,
});
