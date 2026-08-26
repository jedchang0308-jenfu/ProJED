import {
  createDefaultTaskDisplaySettings,
  createDefaultTaskFilters,
} from './defaults';
import type {
  AccountBoardTaskFilterScope,
  BoardTaskFilterPrefs,
  TaskDisplaySettings,
  TaskFilterPreferenceCache,
  TaskFilterPreferenceMutation,
  TaskFilterState,
} from './types';
import type { TaskStatus } from '../../types';
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
export const BOARD_TASK_FILTER_DISPLAY_STORAGE_KEY = 'projed-task-display:v4';
export const BOARD_TASK_FILTER_CACHE_STORAGE_KEY = 'projed-task-filters:v4';
export const BOARD_TASK_FILTER_PENDING_STORAGE_KEY = 'projed-task-filter-pending:v4';
export const BOARD_TASK_FILTER_MIGRATION_MARKER_KEY = 'projed-task-filter-migration:v4';
export const BOARD_TASK_FILTER_PREFS_VERSION = 4;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0)))
    : []
);

const normalizeDueWithinDays = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(365, Math.floor(value)));
};

export const migrateLegacyDefaultTaskFilters = (
  _filters?: Partial<TaskFilterState> | null,
  _version = 1,
): TaskFilterState => createDefaultTaskFilters();

export const normalizeTaskFilters = (value?: Partial<TaskFilterState> | null): TaskFilterState => {
  const defaults = createDefaultTaskFilters();
  const rawStatusFilters: Record<string, unknown> = isRecord(value?.statusFilters) ? value.statusFilters : {};
  const statusFilters = Object.fromEntries(
    Object.entries(defaults.statusFilters).map(([status, defaultValue]) => [
      status,
      typeof rawStatusFilters?.[status] === 'boolean' ? rawStatusFilters[status] : defaultValue,
    ]),
  ) as Record<TaskStatus, boolean>;

  return {
    statusFilters,
    dueWithinDays: normalizeDueWithinDays(value?.dueWithinDays),
    overdueOnly: typeof value?.overdueOnly === 'boolean' ? value.overdueOnly : defaults.overdueOnly,
    selectedAssigneeIds: normalizeStringArray(value?.selectedAssigneeIds),
    selectedTagIds: normalizeStringArray(value?.selectedTagIds),
    keyword: typeof value?.keyword === 'string' ? value.keyword.trim() : '',
  };
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

const pendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => (
  getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId)
);

const createMigrationMarker = () => ({ version: BOARD_TASK_FILTER_PREFS_VERSION, migratedAt: Date.now() });

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
    const payload = { version: BOARD_TASK_FILTER_PREFS_VERSION, displaySettings, updatedAt: Date.now() };
    if (!writeStorageJson(targetDisplayKey, payload)) return false;
    const readback = readStorageJson<{ version?: number }>(targetDisplayKey);
    if (readback?.version !== BOARD_TASK_FILTER_PREFS_VERSION) return false;
  }

  if (!writeStorageJson(markerKey, createMigrationMarker())) return false;
  const markerReadback = readStorageJson<{ version?: number }>(markerKey);
  if (markerReadback?.version !== BOARD_TASK_FILTER_PREFS_VERSION) return false;

  legacyCandidates.forEach(candidate => {
    if (candidate.value !== null) removeStorageKey(candidate.key);
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
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    displaySettings: next,
    updatedAt: Date.now(),
  });
  return next;
};

// Compatibility adapter for display-only callers. Filter conditions deliberately
// resolve to default-all and are never persisted through this API.
export const readBoardTaskFilterPrefs = (accountId: string | null | undefined = null): BoardTaskFilterPrefs => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: createDefaultTaskFilters(),
  displaySettings: readBoardTaskDisplaySettings(accountId),
  updatedAt: Date.now(),
});

export const writeBoardTaskFilterPrefs = (
  updates: { displaySettings?: Partial<TaskDisplaySettings>; filters?: Partial<TaskFilterState> },
  accountId: string | null | undefined = null,
): BoardTaskFilterPrefs => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: createDefaultTaskFilters(),
  displaySettings: updates.displaySettings
    ? writeBoardTaskDisplaySettings(updates.displaySettings, accountId)
    : readBoardTaskDisplaySettings(accountId),
  updatedAt: Date.now(),
});

export const readTaskFilterPreferenceCache = (
  scope: AccountBoardTaskFilterScope,
): TaskFilterPreferenceCache | null => {
  const cached = readStorageJson<Partial<TaskFilterPreferenceCache>>(cacheKey(scope));
  if (cached?.version !== BOARD_TASK_FILTER_PREFS_VERSION || !isRecord(cached.filters)) return null;
  return {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    filters: normalizeTaskFilters(cached.filters),
    updatedAt: typeof cached.updatedAt === 'number' ? cached.updatedAt : 0,
  };
};

export const writeTaskFilterPreferenceCache = (
  scope: AccountBoardTaskFilterScope,
  filters: TaskFilterState,
): boolean => writeStorageJson(cacheKey(scope), {
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: normalizeTaskFilters(filters),
  updatedAt: Date.now(),
});

export const removeTaskFilterPreferenceCache = (scope: AccountBoardTaskFilterScope): boolean => (
  removeStorageKey(cacheKey(scope))
);

export const readTaskFilterPreferencePending = (
  scope: AccountBoardTaskFilterScope,
): TaskFilterPreferenceMutation | null => {
  const pending = readStorageJson<Partial<TaskFilterPreferenceMutation>>(pendingKey(scope));
  if (
    pending?.version !== BOARD_TASK_FILTER_PREFS_VERSION
    || (pending.kind !== 'upsert' && pending.kind !== 'delete')
    || typeof pending.id !== 'string'
  ) return null;
  return {
    id: pending.id,
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    kind: pending.kind,
    filters: pending.kind === 'upsert' ? normalizeTaskFilters(pending.filters) : undefined,
    updatedAt: typeof pending.updatedAt === 'number' ? pending.updatedAt : 0,
  };
};

export const writeTaskFilterPreferencePending = (
  scope: AccountBoardTaskFilterScope,
  mutation: TaskFilterPreferenceMutation,
): boolean => writeStorageJson(pendingKey(scope), mutation);

export const removeTaskFilterPreferencePending = (scope: AccountBoardTaskFilterScope): boolean => (
  removeStorageKey(pendingKey(scope))
);
