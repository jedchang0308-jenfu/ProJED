import type { TaskNode } from '../../types';
import type { ManualTaskStatus } from '../../utils/taskStatus';

export type TaskFilterableNode = Pick<
  TaskNode,
  'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'endDate' | 'id' | 'isArchived' | 'status' | 'tagIds' | 'title'
>;

export type TaskFilterQuery = {
  statuses: ManualTaskStatus[];
  due: {
    includeOverdue: boolean;
    upcomingWithinDays: number | null;
  };
  people: {
    ids: string[];
    includeUnassigned: boolean;
  };
  tagIds: string[];
  keyword: string;
};

/** Persisted v4 shape accepted only at migration boundaries. */
export type LegacyTaskFilterStateV4 = {
  statusFilters?: Record<string, boolean>;
  dueWithinDays?: number | null;
  overdueOnly?: boolean;
  selectedAssigneeIds?: string[];
  selectedTagIds?: string[];
  keyword?: string;
};

export type TaskDisplaySettings = {
  showDependencies: boolean;
  showStartDate: boolean;
  showTags: boolean;
  showTagNames: boolean;
};

export type BoardTaskFilterPrefs = {
  version: number;
  filters: TaskFilterQuery;
  displaySettings: TaskDisplaySettings;
  updatedAt: number;
};

export type AccountBoardTaskFilterScope = {
  accountId: string;
  boardId: string;
};

export type TaskFilterPreferenceCache = {
  version: number;
  filters: TaskFilterQuery;
  updatedAt: number;
};

export type TaskFilterPreferenceMutation = {
  id: string;
  version: number;
  kind: 'upsert' | 'delete';
  filters?: TaskFilterQuery;
  updatedAt: number;
};
