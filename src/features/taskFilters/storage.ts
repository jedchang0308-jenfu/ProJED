import {
  createDefaultTaskDisplaySettings,
  createDefaultTaskFilters,
} from './defaults';
import type {
  BoardTaskFilterPrefs,
  TaskDisplaySettings,
  TaskFilterState,
} from './types';

export const LEGACY_BOARD_FILTER_STORAGE_KEY = 'projed-filters';
export const BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const readJson = <T>(key: string): T | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best-effort only.
  }
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export const normalizeTaskFilters = (value?: Partial<TaskFilterState> | null): TaskFilterState => {
  const defaults = createDefaultTaskFilters();
  return {
    statusFilters: {
      ...defaults.statusFilters,
      ...(value?.statusFilters || {}),
    },
    dueWithinDays: value?.dueWithinDays === undefined ? defaults.dueWithinDays : value.dueWithinDays,
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
  version: 1,
  filters: normalizeTaskFilters(filters),
  displaySettings: normalizeTaskDisplaySettings(displaySettings),
  updatedAt: Date.now(),
});

export const readBoardTaskFilterPrefs = (): BoardTaskFilterPrefs => {
  const versioned = readJson<Partial<BoardTaskFilterPrefs>>(BOARD_TASK_FILTER_STORAGE_KEY);
  if (versioned) {
    return createPrefs(versioned.filters, versioned.displaySettings);
  }

  const legacy = readJson<Record<string, unknown>>(LEGACY_BOARD_FILTER_STORAGE_KEY);
  if (legacy) {
    return createPrefs(
      {
        statusFilters: legacy.statusFilters as TaskFilterState['statusFilters'] | undefined,
        dueWithinDays: legacy.dueWithinDays as number | null | undefined,
        selectedAssigneeIds: legacy.selectedAssigneeIds as string[] | undefined,
        selectedTagIds: legacy.selectedTagIds as string[] | undefined,
        keyword: legacy.keyword as string | undefined,
      },
      {
        showDependencies: legacy.showDependencies as boolean | undefined,
        showStartDate: legacy.showStartDate as boolean | undefined,
        showTags: legacy.showTags as boolean | undefined,
      },
    );
  }

  return createPrefs();
};

export const writeBoardTaskFilterPrefs = (
  updates: {
    filters?: Partial<TaskFilterState>;
    displaySettings?: Partial<TaskDisplaySettings>;
  },
) => {
  const current = readBoardTaskFilterPrefs();
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

  writeJson(BOARD_TASK_FILTER_STORAGE_KEY, next);
  writeJson(LEGACY_BOARD_FILTER_STORAGE_KEY, {
    statusFilters: next.filters.statusFilters,
    showDependencies: next.displaySettings.showDependencies,
    showStartDate: next.displaySettings.showStartDate,
    showTags: next.displaySettings.showTags,
    dueWithinDays: next.filters.dueWithinDays,
    selectedAssigneeIds: next.filters.selectedAssigneeIds,
    selectedTagIds: next.filters.selectedTagIds,
    keyword: next.filters.keyword,
  });

  return next;
};
