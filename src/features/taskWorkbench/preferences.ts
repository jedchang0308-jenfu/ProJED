import {
  BOARD_TASK_FILTER_PREFS_VERSION,
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
export const LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY = 'projed-task-workbench-filters:v2';
export const TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v4';
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
  const scopedKey = getAccountScopedStorageKey(TASK_WORKBENCH_FILTER_PREFS_KEY, accountId);
  const parsed = readStorageJson<Partial<TaskWorkbenchFilterPrefs & { version: number }>>(scopedKey);
  if (parsed?.version === BOARD_TASK_FILTER_PREFS_VERSION) {
    const filtersByBoardId = Object.entries(parsed.filtersByBoardId || {}).reduce<Record<string, TaskFilterState>>(
      (acc, [boardId, filters]) => {
        if (typeof boardId === 'string' && filters && typeof filters === 'object') {
          acc[boardId] = normalizeTaskFilters(filters as Partial<TaskFilterState>);
        }
        return acc;
      },
      {},
    );
    return {
      selectedBoardId: typeof parsed.selectedBoardId === 'string' ? parsed.selectedBoardId : null,
      filtersByBoardId,
    };
  }

  const legacyScopedV2Key = getAccountScopedStorageKey(LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY, accountId);
  const legacyCandidates = [
    { key: legacyScopedV2Key, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(legacyScopedV2Key) },
    { key: LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY) },
    { key: LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY) },
  ];
  const legacy = legacyCandidates.find(candidate => candidate.value)?.value;
  if (!legacy) {
    return {
      selectedBoardId: DEFAULT_FILTER_PREFS.selectedBoardId,
      filtersByBoardId: {},
    };
  }

  const migrated = {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    selectedBoardId: typeof legacy.selectedBoardId === 'string' ? legacy.selectedBoardId : null,
    filtersByBoardId: {},
    updatedAt: Date.now(),
  };
  if (writeStorageJson(scopedKey, migrated)) {
    const readback = readStorageJson<{ version?: number }>(scopedKey);
    if (readback?.version === BOARD_TASK_FILTER_PREFS_VERSION) {
      legacyCandidates.forEach(candidate => {
        if (candidate.value) removeStorageKey(candidate.key);
      });
    }
  }
  return {
    selectedBoardId: migrated.selectedBoardId,
    filtersByBoardId: {},
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
