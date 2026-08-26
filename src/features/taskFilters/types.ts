import type { TaskNode, TaskStatus } from '../../types';

export type TaskFilterableNode = Pick<
  TaskNode,
  'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'endDate' | 'id' | 'status' | 'tagIds' | 'title'
>;

export type TaskFilterState = {
  statusFilters: Record<TaskStatus, boolean>;
  dueWithinDays: number | null;
  overdueOnly: boolean;
  selectedAssigneeIds: string[];
  selectedTagIds: string[];
  keyword: string;
};

export type TaskDisplaySettings = {
  showDependencies: boolean;
  showStartDate: boolean;
  showTags: boolean;
  showTagNames: boolean;
};

export type BoardTaskFilterPrefs = {
  version: number;
  filters: TaskFilterState;
  displaySettings: TaskDisplaySettings;
  updatedAt: number;
};

export type AccountBoardTaskFilterScope = {
  accountId: string;
  boardId: string;
};

export type TaskFilterPreferenceCache = {
  version: number;
  filters: TaskFilterState;
  updatedAt: number;
};

export type TaskFilterPreferenceMutation = {
  id: string;
  version: number;
  kind: 'upsert' | 'delete';
  filters?: TaskFilterState;
  updatedAt: number;
};
