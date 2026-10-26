import {
  BOARD_TASK_FILTER_PREFS_VERSION,
  decodePersistedTaskFilters,
  normalizeTaskFilters,
  type TaskFilterQuery,
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
export const LEGACY_TASK_WORKBENCH_FILTER_PREFS_V5_KEY = 'projed-task-workbench-filters:v5';
export const TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v6';
const TASK_WORKBENCH_OPEN_PREFS_VERSION = 1;
export const DEFAULT_TASK_WORKBENCH_WIDTH = 340;
export const MIN_TASK_WORKBENCH_WIDTH = 182;
export const MAX_TASK_WORKBENCH_WIDTH = 560;
export const DEFAULT_TASK_WORKBENCH_UNPLACED_RATIO = 0.5;
export const MIN_TASK_WORKBENCH_UNPLACED_RATIO = 0.18;
export const MAX_TASK_WORKBENCH_UNPLACED_RATIO = 0.82;

export const clampTaskWorkbenchPanelWidth = (value: number) => {
  const viewportWidth = typeof window === 'undefined' ? 1365 : window.innerWidth;
  const viewportMaxWidth = Math.max(
    MIN_TASK_WORKBENCH_WIDTH,
    Math.min(MAX_TASK_WORKBENCH_WIDTH, viewportWidth - 48),
  );
  return Math.round(Math.min(Math.max(value, MIN_TASK_WORKBENCH_WIDTH), viewportMaxWidth));
};

export const clampTaskWorkbenchUnplacedRatio = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_TASK_WORKBENCH_UNPLACED_RATIO;
  return Math.round(Math.min(
    Math.max(value, MIN_TASK_WORKBENCH_UNPLACED_RATIO),
    MAX_TASK_WORKBENCH_UNPLACED_RATIO,
  ) * 1000) / 1000;
};

export type TaskWorkbenchPanelPrefs = {
  open: boolean;
  filtersOpen: boolean;
  showContainersInAllTasks: boolean;
  width: number;
  unplacedRatio: number;
  openPreferenceVersion: number;
};

export type TaskWorkbenchFilterPrefs = {
  selectedBoardId: string | null;
  filtersByBoardId: Record<string, TaskFilterQuery>;
  locked?: boolean;
  warning?: string | null;
};

const DEFAULT_PANEL_PREFS: TaskWorkbenchPanelPrefs = {
  open: true,
  filtersOpen: false,
  showContainersInAllTasks: false,
  width: DEFAULT_TASK_WORKBENCH_WIDTH,
  unplacedRatio: DEFAULT_TASK_WORKBENCH_UNPLACED_RATIO,
  openPreferenceVersion: TASK_WORKBENCH_OPEN_PREFS_VERSION,
};

const DEFAULT_FILTER_PREFS: TaskWorkbenchFilterPrefs = {
  selectedBoardId: null,
  filtersByBoardId: {},
  locked: false,
  warning: null,
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
      unplacedRatio: clampTaskWorkbenchUnplacedRatio(
        typeof scoped.unplacedRatio === 'number'
          ? scoped.unplacedRatio
          : DEFAULT_TASK_WORKBENCH_UNPLACED_RATIO,
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
      unplacedRatio: clampTaskWorkbenchUnplacedRatio(
        typeof legacy.unplacedRatio === 'number'
          ? legacy.unplacedRatio
          : DEFAULT_TASK_WORKBENCH_UNPLACED_RATIO,
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
  const readRaw = (key: string | null) => {
    if (typeof window === 'undefined' || !key) return { exists: false, value: null as unknown, invalidJson: false };
    const raw = window.localStorage.getItem(key);
    if (raw === null) return { exists: false, value: null as unknown, invalidJson: false };
    try { return { exists: true, value: JSON.parse(raw) as unknown, invalidJson: false }; } catch { return { exists: true, value: raw as unknown, invalidJson: true }; }
  };
  const decodeEnvelope = (value: unknown, expectedVersion: number): TaskWorkbenchFilterPrefs | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const parsed = value as Record<string, unknown>;
    if (parsed.version !== expectedVersion || !parsed.filtersByBoardId || typeof parsed.filtersByBoardId !== 'object' || Array.isArray(parsed.filtersByBoardId)) return null;
    const filtersByBoardId: Record<string, TaskFilterQuery> = {};
    for (const [boardId, filters] of Object.entries(parsed.filtersByBoardId as Record<string, unknown>)) {
      const decoded = decodePersistedTaskFilters(filters, expectedVersion);
      if (!boardId || decoded.kind !== 'valid') return null;
      filtersByBoardId[boardId] = decoded.filters;
    }
    if (!(parsed.selectedBoardId === null || typeof parsed.selectedBoardId === 'string')) return null;
    return { selectedBoardId: parsed.selectedBoardId as string | null, filtersByBoardId, locked: false, warning: null };
  };
  const currentRaw = readRaw(scopedKey);
  if (currentRaw.exists) {
    const decoded = currentRaw.invalidJson ? null : decodeEnvelope(currentRaw.value, 6);
    return decoded ?? { ...DEFAULT_FILTER_PREFS, filtersByBoardId: {}, locked: true, warning: '所有任務篩選偏好版本或格式無法讀取' };
  }

  const legacyScopedV2Key = getAccountScopedStorageKey(LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY, accountId);
  const legacyScopedV5Key = getAccountScopedStorageKey(LEGACY_TASK_WORKBENCH_FILTER_PREFS_V5_KEY, accountId);
  const legacyCandidates = [
    { key: legacyScopedV5Key, value: readStorageJson<unknown>(legacyScopedV5Key), version: 5 },
    { key: legacyScopedV2Key, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(legacyScopedV2Key) },
    { key: LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY) },
    { key: LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY, value: readStorageJson<Partial<TaskWorkbenchFilterPrefs>>(LEGACY_TASK_WORKBENCH_FILTER_PREFS_KEY) },
  ];
  const candidate = legacyCandidates.find(entry => entry.value);
  const legacy = candidate?.value;
  if (!legacy || !candidate) return { ...DEFAULT_FILTER_PREFS, filtersByBoardId: {} };
  const legacyRecord = legacy as Partial<TaskWorkbenchFilterPrefs>;
  if (candidate.version === 5 && (legacy as { version?: unknown }).version !== 5) {
    return { ...DEFAULT_FILTER_PREFS, filtersByBoardId: {}, locked: true, warning: '所有任務舊版篩選偏好格式無法讀取' };
  }
  const migratedFilters: Record<string, TaskFilterQuery> = {};
  for (const [boardId, filters] of Object.entries(legacyRecord.filtersByBoardId || {})) {
    const decoded = decodePersistedTaskFilters(filters, candidate.version ?? 4);
    if (!boardId || decoded.kind !== 'valid') {
      return { ...DEFAULT_FILTER_PREFS, filtersByBoardId: {}, locked: true, warning: '所有任務舊版篩選偏好格式無法讀取' };
    }
    migratedFilters[boardId] = decoded.filters;
  }

  const migrated = {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    selectedBoardId: typeof legacyRecord.selectedBoardId === 'string' ? legacyRecord.selectedBoardId : null,
    filtersByBoardId: migratedFilters,
    updatedAt: Date.now(),
  };
  let migratedAndVerified = false;
  if (writeStorageJson(scopedKey, migrated)) {
    const readback = decodeEnvelope(readStorageJson<unknown>(scopedKey), 6);
    if (readback && JSON.stringify(readback.filtersByBoardId) === JSON.stringify(migrated.filtersByBoardId) && readback.selectedBoardId === migrated.selectedBoardId) {
      migratedAndVerified = true;
      legacyCandidates.forEach(candidate => {
        if (candidate.value) removeStorageKey(candidate.key);
      });
    }
  }
  return {
    selectedBoardId: migrated.selectedBoardId,
    filtersByBoardId: migrated.filtersByBoardId,
    locked: false,
    warning: migratedAndVerified ? null : '所有任務篩選偏好尚未儲存到新版格式',
  };
};

export const writeTaskWorkbenchFilterPrefs = (
  prefs: TaskWorkbenchFilterPrefs,
  accountId: string | null | undefined,
): boolean => {
  if (prefs.locked) return false;
  const key = getAccountScopedStorageKey(TASK_WORKBENCH_FILTER_PREFS_KEY, accountId);
  const payload = {
    version: BOARD_TASK_FILTER_PREFS_VERSION,
    selectedBoardId: prefs.selectedBoardId,
    filtersByBoardId: Object.fromEntries(Object.entries(prefs.filtersByBoardId).map(([boardId, filters]) => [boardId, normalizeTaskFilters(filters)])),
    updatedAt: Date.now(),
  };
  if (!writeStorageJson(key, payload)) return false;
  const readback = readStorageJson<typeof payload>(key);
  return readback?.version === 6 && readback.selectedBoardId === payload.selectedBoardId && JSON.stringify(readback.filtersByBoardId) === JSON.stringify(payload.filtersByBoardId);
};

export const createDefaultTaskWorkbenchPanelPrefs = (): TaskWorkbenchPanelPrefs => ({
  ...DEFAULT_PANEL_PREFS,
});

export const createDefaultTaskWorkbenchFilterPrefs = (): TaskWorkbenchFilterPrefs => ({
  selectedBoardId: null,
  filtersByBoardId: {},
});
