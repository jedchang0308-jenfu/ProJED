import type { TaskNode } from '../../types';
import type { ManualTaskStatus } from '../../utils/taskStatus';

export type TaskFilterableNode = Pick<
  TaskNode,
  'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'endDate' | 'id' | 'isArchived' | 'status' | 'tagIds' | 'title'
>;

/** "none" is accepted from older preferences and normalized to unrestricted "all". */
export type TaskFilterSelectionMode = 'all' | 'none' | 'selected';

export type TaskFilterDateBucket = 'unset' | 'before_today' | 'within_days' | 'after_days';

/** Calendar and persisted preference v5 shape. Keep this wire contract stable. */
export type LegacyTaskFilterQueryV5 = {
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

export type TaskFilterQueryV6 = {
  version: 6;
  statuses: {
    mode: TaskFilterSelectionMode;
    values: ManualTaskStatus[];
  };
  due:
    | {
      mode: TaskFilterSelectionMode;
      buckets: TaskFilterDateBucket[];
      withinDays: number;
    }
    | {
      mode: 'legacy-v5';
      includeOverdue: boolean;
      upcomingWithinDays: number | null;
    };
  people: {
    mode: TaskFilterSelectionMode;
    ids: string[];
    includeUnassigned: boolean;
  };
  tags: {
    mode: TaskFilterSelectionMode;
    ids: string[];
    includeUntagged: boolean;
  };
  keyword: string;
};

export type TaskFilterQuery = TaskFilterQueryV6;
export type AnyTaskFilterQuery = TaskFilterQueryV6 | LegacyTaskFilterQueryV5;

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

type TaskFilterPreferenceMutationBase = {
  id: string;
  version: number;
  updatedAt: number;
};

export type TaskFilterPreferenceMutation = TaskFilterPreferenceMutationBase & (
  | { kind: 'upsert'; filters: TaskFilterQuery }
  | { kind: 'delete'; filters?: never }
);

export type PersistedTaskFilterDecodeResult =
  | { kind: 'missing' }
  | {
    kind: 'valid';
    version: 4 | 5 | 6;
    filters: TaskFilterQueryV6;
    sourceFilters?: LegacyTaskFilterQueryV5;
  }
  | { kind: 'invalid'; version: number | null; reason: string; raw: unknown }
  | { kind: 'unsupported'; version: number | null; reason: string; raw: unknown };
