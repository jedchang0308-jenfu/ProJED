import {
  createDefaultTaskDisplaySettings,
  createDefaultTaskFilters,
  TASK_STATUS_OPTIONS,
} from './defaults';
import type {
  BoardTaskFilterPrefs,
  TaskDisplaySettings,
  TaskFilterState,
} from './types';
import type { TaskStatus } from '../../types';
import useAuthStore from '../../store/useAuthStore';
import {
  getAccountScopedStorageKey,
  readStorageJson,
  removeStorageKey,
  writeStorageJson,
} from '../../utils/accountScopedStorage';

export const LEGACY_BOARD_FILTER_STORAGE_KEY = 'projed-filters';
export const BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v1';
export const ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v2';
export const BOARD_TASK_FILTER_PREFS_VERSION = 3;

const getCurrentAccountId = () => useAuthStore.getState().user?.uid ?? null;

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const isLegacyAllStatusesVisible = (statusFilters: Partial<Record<TaskStatus, boolean>> | undefined) =>
  Boolean(statusFilters) && TASK_STATUS_OPTIONS.every(status => statusFilters?.[status.key] === true);

export const migrateLegacyDefaultTaskFilters = (
  filters?: Partial<TaskFilterState> | null,
  version = 1,
): Partial<TaskFilterState> | null | undefined => {
  if (version >= BOARD_TASK_FILTER_PREFS_VERSION || !isLegacyAllStatusesVisible(filters?.statusFilters)) return filters;
  return {
    ...filters,
    statusFilters: {
      ...createDefaultTaskFilters().statusFilters,
      ...filters?.statusFilters,
      completed: false,
    } satisfies Record<TaskStatus, boolean>,
  };
};

export const normalizeTaskFilters = (value?: Partial<TaskFilterState> | null): TaskFilterState => {
  const defaults = createDefaultTaskFilters();
  return {
    statusFilters: {
      ...defaults.statusFilters,
      ...(value?.statusFilters || {}),
    },
    dueWithinDays: value?.dueWithinDays === undefined ? defaults.dueWithinDays : value.dueWithinDays,
    overdueOnly: typeof value?.overdueOnly === 'boolean' ? value.overdueOnly : defaults.overdueOnly,
    selectedAssigneeIds: normalizeStringArray(value?.selectedAssigneeIds),
    selectedTagIds: normalizeStringArray(value?.selectedTagIds),
    keyword: typeof value?.keyword === 'string' ? value.keyword : '',
  };
};

export const normalizeTaskDisplaySettings = (
  value?: Partial<TaskDisplaySettings> | null,
): TaskDisplaySettings => ({
  ...createDefaultTaskDisplaySettings(),
  ...(value || {}),
});

const createPrefs = (
  filters?: Partial<TaskFilterState> | null,
  displaySettings?: Partial<TaskDisplaySettings> | null,
): BoardTaskFilterPrefs => ({
  version: BOARD_TASK_FILTER_PREFS_VERSION,
  filters: normalizeTaskFilters(filters),
  displaySettings: normalizeTaskDisplaySettings(displaySettings),
  updatedAt: Date.now(),
});

export const readBoardTaskFilterPrefs = (
  accountId = getCurrentAccountId(),
): BoardTaskFilterPrefs => {
  const scopedKey = getAccountScopedStorageKey(ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY, accountId);
  if (!scopedKey) return createPrefs();

  const scoped = readStorageJson<Partial<BoardTaskFilterPrefs>>(scopedKey);
  if (scoped) {
    return createPrefs(
      migrateLegacyDefaultTaskFilters(scoped.filters, typeof scoped.version === 'number' ? scoped.version : 1),
      scoped.displaySettings,
    );
  }

  // 一次性承接舊版未分帳號設定到目前登入帳號，之後移除共用 key，避免下一個帳號再讀到。
  const versioned = readStorageJson<Partial<BoardTaskFilterPrefs>>(BOARD_TASK_FILTER_STORAGE_KEY);
  if (versioned) {
    const migrated = createPrefs(
      migrateLegacyDefaultTaskFilters(versioned.filters, typeof versioned.version === 'number' ? versioned.version : 1),
      versioned.displaySettings,
    );
    writeStorageJson(scopedKey, migrated);
    removeStorageKey(BOARD_TASK_FILTER_STORAGE_KEY);
    removeStorageKey(LEGACY_BOARD_FILTER_STORAGE_KEY);
    return migrated;
  }

  const legacy = readStorageJson<Record<string, unknown>>(LEGACY_BOARD_FILTER_STORAGE_KEY);
  if (legacy) {
    const migrated = createPrefs(
      migrateLegacyDefaultTaskFilters({
        statusFilters: legacy.statusFilters as TaskFilterState['statusFilters'] | undefined,
        dueWithinDays: legacy.dueWithinDays as number | null | undefined,
        overdueOnly: legacy.overdueOnly as boolean | undefined,
        selectedAssigneeIds: legacy.selectedAssigneeIds as string[] | undefined,
        selectedTagIds: legacy.selectedTagIds as string[] | undefined,
        keyword: legacy.keyword as string | undefined,
      }),
      {
        showDependencies: legacy.showDependencies as boolean | undefined,
        showStartDate: legacy.showStartDate as boolean | undefined,
        showTags: legacy.showTags as boolean | undefined,
        showTagNames: legacy.showTagNames as boolean | undefined,
      },
    );
    writeStorageJson(scopedKey, migrated);
    removeStorageKey(BOARD_TASK_FILTER_STORAGE_KEY);
    removeStorageKey(LEGACY_BOARD_FILTER_STORAGE_KEY);
    return migrated;
  }

  return createPrefs();
};

export const writeBoardTaskFilterPrefs = (
  updates: {
    filters?: Partial<TaskFilterState>;
    displaySettings?: Partial<TaskDisplaySettings>;
  },
  accountId = getCurrentAccountId(),
) => {
  const current = readBoardTaskFilterPrefs(accountId);
  const next = createPrefs(
    {
      ...current.filters,
      ...(updates.filters || {}),
    },
    {
      ...current.displaySettings,
      ...(updates.displaySettings || {}),
    },
  );

  writeStorageJson(getAccountScopedStorageKey(ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY, accountId), next);

  return next;
};
