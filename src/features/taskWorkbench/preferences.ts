import {
  BOARD_TASK_FILTER_PREFS_VERSION,
  migrateLegacyDefaultTaskFilters,
  normalizeTaskFilters,
  type TaskFilterState,
} from '../taskFilters';
import {
  getAccountScopedStorageKey,
  readStorageJson,
  removeStorageKey,
  writeStorageJson,
} from '../../utils/accountScopedStorage';

export const LEGACY_TASK_WORKBENCH_PANEL_PREFS_KEY = 'projed-task-workbench-panel:v1';
export const TASK_WORKBENCH_PANEL_PREFS_KEY = 'projed-task-workbench-panel:v2';
export const LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v1';
export const TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v2';
const TASK_WORKBENCH_OPEN_PREFS_VERSION = 1;
export const DEFAULT_TASK_WORKBENCH_WIDTH = 340;
export const MIN_TASK_WORKBENCH_WIDTH = 182;
export const MAX_TASK_WORKBENCH_WIDTH = 560;

export const clampTaskWorkbenchPanelWidth = (value: number) => {
  const viewportWidth = typeof window === 'undefined' ? 1365 : window.innerWidth;
  const viewportMaxWidth = Math.max(
    MIN_TASK_WORKBENCH_WIDTH,
    Math.min(MAX_TASK_WORKBENCH_WIDTH, viewportWidth - 48),
  );
  return Math.round(Math.min(Math.max(value, MIN_TASK_WORKBENCH_WIDTH), viewportMaxWidth));
};

export type TaskWorkbenchPanelPrefs = {
  open: boolean;
  filtersOpen: boolean;
  showContainersInAllTasks: boolean;
  width: number;
  openPreferenceVersion: number;
};

export type TaskWorkbenchFilterPrefs = {
  selectedBoardId: string | null;
  filtersByBoardId: Record<string, TaskFilterState>;
};

const DEFAULT_PANEL_PREFS: TaskWorkbenchPanelPrefs = {
  open: true,
  filtersOpen: false,
  showContainersInAllTasks: false,
  width: DEFAULT_TASK_WORKBENCH_WIDTH,
  openPreferenceVersion: TASK_WORKBENCH_OPEN_PREFS_VERSION,
};

const DEFAULT_FILTER_PREFS: TaskWorkbenchFilterPrefs = {
  selectedBoardId: null,
  filtersByBoardId: {},
};

const readScopedOrLegacy = <T>(
  baseKey: string,
  legacyKey: string,
  accountId: string | null | undefined,
): T | null => {
  const scopedKey = getAccountScopedStorageKey(baseKey, accountId);
  if (!scopedKey) return null;

  const scoped = readStorageJson<T>(scopedKey);
  if (scoped) return scoped;

  const legacy = readStorageJson<T>(legacyKey);
  if (!legacy) return null;

  writeStorageJson(scopedKey, legacy);
  removeStorageKey(legacyKey);
  return legacy;
};

export const readTaskWorkbenchPanelPrefs = (
  accountId: string | null | undefined,
): TaskWorkbenchPanelPrefs => {
  const scopedKey = getAccountScopedStorageKey(TASK_WORKBENCH_PANEL_PREFS_KEY, accountId);
  const scoped = readStorageJson<Partial<TaskWorkbenchPanelPrefs>>(scopedKey);
  if (scoped) {
    return {
      open: scoped.openPreferenceVersion === TASK_WORKBENCH_OPEN_PREFS_VERSION
        ? Boolean(scoped.open)
        : DEFAULT_PANEL_PREFS.open,
      filtersOpen: Boolean(scoped.filtersOpen),
      showContainersInAllTasks: Boolean(scoped.showContainersInAllTasks),
      width: clampTaskWorkbenchPanelWidth(
        typeof scoped.width === 'number' ? scoped.width : DEFAULT_TASK_WORKBENCH_WIDTH,
      ),
      openPreferenceVersion: TASK_WORKBENCH_OPEN_PREFS_VERSION,
    };
  }

  const legacy = readStorageJson<Partial<TaskWorkbenchPanelPrefs>>(LEGACY_TASK_WORKBENCH_PANEL_PREFS_KEY);
  if (legacy) {
    const migrated = {
      ...DEFAULT_PANEL_PREFS,
      open: typeof legacy.open === 'boolean' ? legacy.open : DEFAULT_PANEL_PREFS.open,
      filtersOpen: Boolean(legacy.filtersOpen),
      showContainersInAllTasks: Boolean(legacy.showContainersInAllTasks),
      width: clampTaskWorkbenchPanelWidth(
        typeof legacy.width === 'number' ? legacy.width : DEFAULT_TASK_WORKBENCH_WIDTH,
      ),
    };
    writeStorageJson(scopedKey, migrated);
    removeStorageKey(LEGACY_TASK_WORKBENCH_PANEL_PREFS_KEY);
    return migrated;
  }

  return {
    ...DEFAULT_PANEL_PREFS,
  };
};

export const writeTaskWorkbenchPanelPrefs = (
  prefs: TaskWorkbenchPanelPrefs,
  accountId: string | null | undefined,
): void => {
  writeStorageJson(getAccountScopedStorageKey(TASK_WORKBENCH_PANEL_PREFS_KEY, accountId), {
    ...prefs,
    openPreferenceVersion: TASK_WORKBENCH_OPEN_PREFS_VERSION,
  });
};

export const readTaskWorkbenchFilterPrefs = (
  accountId: string | null | undefined,
): TaskWorkbenchFilterPrefs => {
  const parsed = readScopedOrLegacy<Partial<TaskWorkbenchFilterPrefs & { version: number }>>(
    TASK_WORKBENCH_FILTER_PREFS_KEY,
    LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY,
    accountId,
  );
  if (!parsed) {
    return {
      selectedBoardId: DEFAULT_FILTER_PREFS.selectedBoardId,
      filtersByBoardId: {},
    };
  }

  const prefsVersion = typeof parsed.version === 'number' ? parsed.version : 1;
  const filtersByBoardId = Object.entries(parsed.filtersByBoardId || {}).reduce<Record<string, TaskFilterState>>(
    (acc, [boardId, filters]) => {
      if (typeof boardId === 'string' && filters && typeof filters === 'object') {
        acc[boardId] = normalizeTaskFilters(
          migrateLegacyDefaultTaskFilters(filters as Partial<TaskFilterState>, prefsVersion),
        );
      }
      return acc;
    },
    {},
  );

  return {
    selectedBoardId: typeof parsed.selectedBoardId === 'string' ? parsed.selectedBoardId : null,
    filtersByBoardId,
  };
};

export const writeTaskWorkbenchFilterPrefs = (
  prefs: TaskWorkbenchFilterPrefs,
  accountId: string | null | undefined,
): void => {
  writeStorageJson(getAccountScopedStorageKey(TASK_WORKBENCH_FILTER_PREFS_KEY, accountId), {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    selectedBoardId: prefs.selectedBoardId,
    filtersByBoardId: prefs.filtersByBoardId,
    updatedAt: Date.now(),
  });
};

export const createDefaultTaskWorkbenchPanelPrefs = (): TaskWorkbenchPanelPrefs => ({
  ...DEFAULT_PANEL_PREFS,
});

export const createDefaultTaskWorkbenchFilterPrefs = (): TaskWorkbenchFilterPrefs => ({
  selectedBoardId: null,
  filtersByBoardId: {},
});
