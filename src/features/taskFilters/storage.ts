import {
  createDefaultTaskDisplaySettings,
  createDefaultTaskFilters,
  TASK_STATUS_OPTIONS,
} from './defaults';
import type {
  AccountBoardTaskFilterScope,
  BoardTaskFilterPrefs,
  LegacyTaskFilterStateV4,
  TaskDisplaySettings,
  TaskFilterPreferenceCache,
  TaskFilterPreferenceMutation,
  TaskFilterQuery,
} from './types';
import type { ManualTaskStatus } from '../../utils/taskStatus';
import {
  getAccountBoardScopedStorageKey,
  getAccountScopedStorageKey,
  readStorageJson,
  removeStorageKey,
  writeStorageJson,
} from '../../utils/accountScopedStorage';

export const LEGACY_BOARD_FILTER_STORAGE_KEY = 'projed-filters';
export const BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v1';
export const ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v2';
export const LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY = 'projed-task-filters:v4';
export const LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY = 'projed-task-filter-pending:v4';
export const BOARD_TASK_FILTER_CACHE_STORAGE_KEY = 'projed-task-filters:v5';
export const BOARD_TASK_FILTER_PENDING_STORAGE_KEY = 'projed-task-filter-pending:v5';
export const BOARD_TASK_FILTER_DISPLAY_STORAGE_KEY = 'projed-task-display:v4';
export const BOARD_TASK_FILTER_MIGRATION_MARKER_KEY = 'projed-task-filter-migration:v5';
export const BOARD_TASK_FILTER_PREFS_VERSION = 5;
export const TASK_DISPLAY_SETTINGS_VERSION = 4;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.trim())))
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    : []
);

const normalizeDays = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 365) return null;
  return value;
};

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const normalizeStatuses = (value: unknown): ManualTaskStatus[] => {
  const selected = new Set(
    Array.isArray(value)
      ? value.filter((item): item is ManualTaskStatus => TASK_STATUS_OPTIONS.some(option => option.key === item))
      : [],
  );
  return TASK_STATUS_OPTIONS
    .map(option => option.key)
    .filter(status => selected.has(status));
};

const normalizeLegacyStatusSelection = (value: unknown): ManualTaskStatus[] => {
  const statusFilters = isRecord(value) ? value : {};
  const hasStatusInput = TASK_STATUS_OPTIONS.some(option => hasOwn(statusFilters, option.key));
  const selected = TASK_STATUS_OPTIONS.filter(option => statusFilters[option.key] === true).map(option => option.key);
  if (!hasStatusInput || selected.length === TASK_STATUS_OPTIONS.length || selected.length === 0) return [];
  return selected;
};

export const migrateLegacyTaskFilterStateV4 = (
  value?: LegacyTaskFilterStateV4 | null,
): TaskFilterQuery => {
  const source = isRecord(value) ? value : {};
  const overdueOnly = source.overdueOnly === true;
  const dueWithinDays = normalizeDays(source.dueWithinDays);
  const selectedAssigneeIds = normalizeStringArray(source.selectedAssigneeIds);
  const unassigned = selectedAssigneeIds.includes('__unassigned__');

  return {
    statuses: normalizeLegacyStatusSelection(source.statusFilters),
    due: {
      // Legacy due-only semantics included past dates. Preserve that result set
      // by enabling overdue with the upcoming range; when overdue was already
      // selected it is the complete date intent and the old range is redundant.
      includeOverdue: overdueOnly || dueWithinDays !== null,
      upcomingWithinDays: overdueOnly ? null : dueWithinDays,
    },
    people: {
      ids: selectedAssigneeIds.filter(id => id !== '__unassigned__'),
      includeUnassigned: unassigned,
    },
    tagIds: normalizeStringArray(source.selectedTagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

export const normalizeTaskFilters = (
  value?: Partial<TaskFilterQuery> | null,
): TaskFilterQuery => {
  const source = isRecord(value) ? value : {};
  const dueSource: Record<string, unknown> = isRecord(source.due) ? source.due : {};
  const peopleSource: Record<string, unknown> = isRecord(source.people) ? source.people : {};

  return {
    statuses: normalizeStatuses(source.statuses),
    due: {
      includeOverdue: dueSource['includeOverdue'] === true,
      upcomingWithinDays: normalizeDays(dueSource['upcomingWithinDays']),
    },
    people: {
      ids: normalizeStringArray(peopleSource['ids']),
      includeUnassigned: peopleSource['includeUnassigned'] === true,
    },
    tagIds: normalizeStringArray(source.tagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

export const normalizePersistedTaskFilters = (value: unknown): TaskFilterQuery => {
  if (isRecord(value) && (
    'statusFilters' in value
    || 'dueWithinDays' in value
    || 'overdueOnly' in value
    || 'selectedAssigneeIds' in value
    || 'selectedTagIds' in value
  )) {
    return migrateLegacyTaskFilterStateV4(value);
  }
  return normalizeTaskFilters(isRecord(value) ? value : undefined);
};

export const normalizeTaskDisplaySettings = (
  value?: Partial<TaskDisplaySettings> | null,
): TaskDisplaySettings => {
  const defaults = createDefaultTaskDisplaySettings();
  return {
    showDependencies: typeof value?.showDependencies === 'boolean' ? value.showDependencies : defaults.showDependencies,
    showStartDate: typeof value?.showStartDate === 'boolean' ? value.showStartDate : defaults.showStartDate,
    showTags: typeof value?.showTags === 'boolean' ? value.showTags : defaults.showTags,
    showTagNames: typeof value?.showTagNames === 'boolean' ? value.showTagNames : defaults.showTagNames,
  };
};

const displayKey = (accountId: string | null | undefined) => (
  getAccountScopedStorageKey(BOARD_TASK_FILTER_DISPLAY_STORAGE_KEY, accountId)
);

const cacheKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => (
  getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY, accountId, boardId)
);

const legacyCacheKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => (
  getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY, accountId, boardId)
);

const pendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => (
  getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId)
);

const legacyPendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => (
  getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId)
);

const createMigrationMarker = () => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  migratedAt: Date.now(),
});

const extractLegacyDisplaySettings = (value: unknown): TaskDisplaySettings | null => {
  if (!isRecord(value)) return null;
  const source = isRecord(value.displaySettings) ? value.displaySettings : value;
  const hasDisplayField = ['showDependencies', 'showStartDate', 'showTags', 'showTagNames']
    .some(field => typeof source[field] === 'boolean');
  return hasDisplayField ? normalizeTaskDisplaySettings(source as Partial<TaskDisplaySettings>) : null;
};

export const migrateLegacyBoardTaskFilterPrefs = (
  accountId: string | null | undefined = null,
): boolean => {
  const markerKey = getAccountScopedStorageKey(BOARD_TASK_FILTER_MIGRATION_MARKER_KEY, accountId);
  if (!accountId || !markerKey) return false;
  const existingMarker = readStorageJson<{ version?: number }>(markerKey);
  if (existingMarker?.version === BOARD_TASK_FILTER_PREFS_VERSION) return true;

  const scopedLegacyKey = getAccountScopedStorageKey(ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY, accountId);
  const legacyCandidates = [
    { key: scopedLegacyKey, value: readStorageJson<unknown>(scopedLegacyKey) },
    { key: BOARD_TASK_FILTER_STORAGE_KEY, value: readStorageJson<unknown>(BOARD_TASK_FILTER_STORAGE_KEY) },
    { key: LEGACY_BOARD_FILTER_STORAGE_KEY, value: readStorageJson<unknown>(LEGACY_BOARD_FILTER_STORAGE_KEY) },
  ];
  const displaySettings = legacyCandidates
    .map(candidate => extractLegacyDisplaySettings(candidate.value))
    .find((value): value is TaskDisplaySettings => Boolean(value));

  const targetDisplayKey = displayKey(accountId);
  if (displaySettings) {
    const payload = {
      version: TASK_DISPLAY_SETTINGS_VERSION,
      displaySettings,
      updatedAt: Date.now(),
    };
    if (!writeStorageJson(targetDisplayKey, payload)) return false;
    const readback = readStorageJson<{ version?: number }>(targetDisplayKey);
    if (readback?.version !== TASK_DISPLAY_SETTINGS_VERSION) return false;
  }

  if (!writeStorageJson(markerKey, createMigrationMarker())) return false;
  const markerReadback = readStorageJson<{ version?: number }>(markerKey);
  if (markerReadback?.version !== BOARD_TASK_FILTER_PREFS_VERSION) return false;

  // Legacy account/global keys may contain filters scoped by an old UI. Keep
  // them if a filter payload exists; board-scoped v4 values migrate below with
  // an explicit readback-before-delete transaction.
  legacyCandidates.forEach(candidate => {
    const hasFilterPayload = isRecord(candidate.value) && 'filters' in candidate.value;
    if (candidate.value && !hasFilterPayload) removeStorageKey(candidate.key);
  });
  return true;
};

export const readBoardTaskDisplaySettings = (
  accountId: string | null | undefined = null,
): TaskDisplaySettings => {
  migrateLegacyBoardTaskFilterPrefs(accountId);
  const stored = readStorageJson<{ displaySettings?: Partial<TaskDisplaySettings> }>(displayKey(accountId));
  return normalizeTaskDisplaySettings(stored?.displaySettings);
};

export const writeBoardTaskDisplaySettings = (
  settings: Partial<TaskDisplaySettings>,
  accountId: string | null | undefined = null,
): TaskDisplaySettings => {
  migrateLegacyBoardTaskFilterPrefs(accountId);
  const next = normalizeTaskDisplaySettings({ ...readBoardTaskDisplaySettings(accountId), ...settings });
  writeStorageJson(displayKey(accountId), {
    version: TASK_DISPLAY_SETTINGS_VERSION,
    displaySettings: next,
    updatedAt: Date.now(),
  });
  return next;
};

export const readBoardTaskFilterPrefs = (
  accountId: string | null | undefined = null,
): BoardTaskFilterPrefs => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: createDefaultTaskFilters(),
  displaySettings: readBoardTaskDisplaySettings(accountId),
  updatedAt: Date.now(),
});

export const writeBoardTaskFilterPrefs = (
  updates: { displaySettings?: Partial<TaskDisplaySettings> },
  accountId: string | null | undefined = null,
): BoardTaskFilterPrefs => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: createDefaultTaskFilters(),
  displaySettings: updates.displaySettings
    ? writeBoardTaskDisplaySettings(updates.displaySettings, accountId)
    : readBoardTaskDisplaySettings(accountId),
  updatedAt: Date.now(),
});

const toVersionedQueryCache = (
  raw: unknown,
): TaskFilterPreferenceCache | null => {
  if (!isRecord(raw) || typeof raw.version !== 'number' || !isRecord(raw.filters)) return null;
  if (raw.version !== 4 && raw.version !== BOARD_TASK_FILTER_PREFS_VERSION) return null;
  return {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    filters: raw.version === BOARD_TASK_FILTER_PREFS_VERSION
      ? normalizeTaskFilters(raw.filters as Partial<TaskFilterQuery>)
      : normalizePersistedTaskFilters(raw.filters),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
};

export const readTaskFilterPreferenceCache = (
  scope: AccountBoardTaskFilterScope,
): TaskFilterPreferenceCache | null => {
  const current = toVersionedQueryCache(readStorageJson<unknown>(cacheKey(scope)));
  if (current) return current;

  const legacyRaw = readStorageJson<unknown>(legacyCacheKey(scope));
  const legacy = toVersionedQueryCache(legacyRaw);
  if (!legacy) return null;

  const target = {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    filters: legacy.filters,
    updatedAt: Date.now(),
  };
  if (writeStorageJson(cacheKey(scope), target)) {
    const readback = toVersionedQueryCache(readStorageJson<unknown>(cacheKey(scope)));
    if (readback?.version === BOARD_TASK_FILTER_PREFS_VERSION) {
      removeStorageKey(legacyCacheKey(scope));
      return readback;
    }
  }
  return target;
};

export const writeTaskFilterPreferenceCache = (
  scope: AccountBoardTaskFilterScope,
  filters: TaskFilterQuery,
): boolean => writeStorageJson(cacheKey(scope), {
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: normalizeTaskFilters(filters),
  updatedAt: Date.now(),
});

export const removeTaskFilterPreferenceCache = (scope: AccountBoardTaskFilterScope): boolean => (
  (() => {
    const targetRemoved = removeStorageKey(cacheKey(scope));
    const legacyRemoved = removeStorageKey(legacyCacheKey(scope));
    return targetRemoved && legacyRemoved;
  })()
);

const toVersionedQueryMutation = (raw: unknown): TaskFilterPreferenceMutation | null => {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.version !== 'number') return null;
  if (raw.version !== 4 && raw.version !== BOARD_TASK_FILTER_PREFS_VERSION) return null;
  if (raw.kind !== 'upsert' && raw.kind !== 'delete') return null;
  return {
    id: raw.id,
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    kind: raw.kind,
    filters: raw.kind === 'upsert'
      ? (raw.version === BOARD_TASK_FILTER_PREFS_VERSION
        ? normalizeTaskFilters(isRecord(raw.filters) ? raw.filters as Partial<TaskFilterQuery> : undefined)
        : normalizePersistedTaskFilters(raw.filters))
      : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
};

export const readTaskFilterPreferencePending = (
  scope: AccountBoardTaskFilterScope,
): TaskFilterPreferenceMutation | null => {
  const current = toVersionedQueryMutation(readStorageJson<unknown>(pendingKey(scope)));
  if (current) return current;

  const legacy = toVersionedQueryMutation(readStorageJson<unknown>(legacyPendingKey(scope)));
  if (!legacy) return null;

  const target = { ...legacy, version: BOARD_TASK_FILTER_PREFS_VERSION };
  if (writeStorageJson(pendingKey(scope), target)) {
    const readback = toVersionedQueryMutation(readStorageJson<unknown>(pendingKey(scope)));
    if (readback?.id === target.id) {
      removeStorageKey(legacyPendingKey(scope));
      return readback;
    }
  }
  return target;
};

export const writeTaskFilterPreferencePending = (
  scope: AccountBoardTaskFilterScope,
  mutation: TaskFilterPreferenceMutation,
): boolean => writeStorageJson(pendingKey(scope), {
  ...mutation,
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: mutation.kind === 'upsert' ? normalizeTaskFilters(mutation.filters) : undefined,
});

export const removeTaskFilterPreferencePending = (scope: AccountBoardTaskFilterScope): boolean => (
  (() => {
    const targetRemoved = removeStorageKey(pendingKey(scope));
    const legacyRemoved = removeStorageKey(legacyPendingKey(scope));
    return targetRemoved && legacyRemoved;
  })()
);
