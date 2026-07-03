import type { TaskNode, TaskStatus } from '../../types';

export type TaskFilterableNode = Pick<
  TaskNode,
  'assigneeId' | 'endDate' | 'id' | 'status' | 'tagIds' | 'title'
>;

export type TaskFilterState = {
  statusFilters: Record<TaskStatus, boolean>;
  dueWithinDays: number | null;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
  keyword: string;
};

export type TaskDisplaySettings = {
  showDependencies: boolean;
  showStartDate: boolean;
  showTags: boolean;
};

export type BoardTaskFilterPrefs = {
  version: 1;
  filters: TaskFilterState;
  displaySettings: TaskDisplaySettings;
  updatedAt: number;
};
