import {
  ALL_ASSIGNEES_FILTER,
  createDefaultBoardTaskFilters,
  createDefaultTaskDisplaySettings,
  createDefaultTaskFiltersV5,
  TASK_FILTER_DATE_BUCKETS,
  TASK_STATUS_OPTIONS,
} from './defaults';
import type {
  AccountBoardTaskFilterScope,
  BoardTaskFilterPrefs,
  LegacyTaskFilterQueryV5,
  LegacyTaskFilterStateV4,
  PersistedTaskFilterDecodeResult,
  TaskDisplaySettings,
  TaskFilterDateBucket,
  TaskFilterPreferenceCache,
  TaskFilterPreferenceMutation,
  TaskFilterQuery,
  TaskFilterSelectionMode,
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
export const LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY = 'projed-task-filters:v5';
export const LEGACY_BOARD_TASK_FILTER_PENDING_V5_STORAGE_KEY = 'projed-task-filter-pending:v5';
export const BOARD_TASK_FILTER_CACHE_STORAGE_KEY = 'projed-task-filters:v6';
export const BOARD_TASK_FILTER_PENDING_STORAGE_KEY = 'projed-task-filter-pending:v6';
export const BOARD_TASK_FILTER_DISPLAY_STORAGE_KEY = 'projed-task-display:v4';
export const BOARD_TASK_FILTER_MIGRATION_MARKER_KEY = 'projed-task-filter-migration:v6';
export const BOARD_TASK_FILTER_PREFS_VERSION = 6;
export const TASK_DISPLAY_SETTINGS_VERSION = 4;

const ALL_MODES: TaskFilterSelectionMode[] = ['all', 'none', 'selected'];
const STATUS_ORDER = TASK_STATUS_OPTIONS.map(option => option.key);
const DATE_BUCKET_ORDER = [...TASK_FILTER_DATE_BUCKETS];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key)) && keys.every(key => hasOwn(value, key));
const hasOnlyOptionalKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const sameCanonical = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const normalizeStringArray = (value: unknown): string[] => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()))).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  : [];
const isDays = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 365;
const normalizeDays = (value: unknown, fallback: number | null = null): number | null => value === null || value === undefined || value === '' ? fallback : isDays(value) ? value : fallback;
const normalizeStatuses = (value: unknown): ManualTaskStatus[] => {
  const selected = new Set(Array.isArray(value) ? value.filter((item): item is ManualTaskStatus => STATUS_ORDER.includes(item as ManualTaskStatus)) : []);
  return STATUS_ORDER.filter(status => selected.has(status));
};
const normalizeBuckets = (value: unknown): TaskFilterDateBucket[] => {
  const selected = new Set(Array.isArray(value) ? value.filter((item): item is TaskFilterDateBucket => DATE_BUCKET_ORDER.includes(item as TaskFilterDateBucket)) : []);
  return DATE_BUCKET_ORDER.filter(bucket => selected.has(bucket));
};
const normalizeMode = (value: unknown): TaskFilterSelectionMode => ALL_MODES.includes(value as TaskFilterSelectionMode) ? value as TaskFilterSelectionMode : 'all';
const canonicalSelection = <T extends string>(modeValue: unknown, values: T[]): { mode: TaskFilterSelectionMode; values: T[] } => {
  const mode = normalizeMode(modeValue);
  // Empty selections and the former "none" state now mean no restriction.
  if (mode !== 'selected' || values.length === 0) return { mode: 'all', values: [] };
  return { mode, values };
};

export const createLegacyTaskFiltersV5 = createDefaultTaskFiltersV5;

export const normalizeTaskFiltersV5 = (value?: Partial<LegacyTaskFilterQueryV5> | null): LegacyTaskFilterQueryV5 => {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  const dueSource: Record<string, unknown> = isRecord(source.due) ? source.due : {};
  const peopleSource: Record<string, unknown> = isRecord(source.people) ? source.people : {};
  return {
    statuses: normalizeStatuses(source.statuses),
    due: { includeOverdue: dueSource.includeOverdue === true, upcomingWithinDays: normalizeDays(dueSource.upcomingWithinDays) },
    people: { ids: normalizeStringArray(peopleSource.ids), includeUnassigned: peopleSource.includeUnassigned === true },
    tagIds: normalizeStringArray(source.tagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

const normalizeLegacyStatusSelection = (value: unknown): ManualTaskStatus[] => {
  const statusFilters = isRecord(value) ? value : {};
  const hasStatusInput = STATUS_ORDER.some(status => hasOwn(statusFilters, status));
  const selected = STATUS_ORDER.filter(status => statusFilters[status] === true);
  return !hasStatusInput || selected.length === STATUS_ORDER.length || selected.length === 0 ? [] : selected;
};

/** V4 first enters the already-approved V5 semantic boundary. */
export const migrateLegacyTaskFilterStateV4 = (value?: LegacyTaskFilterStateV4 | null): LegacyTaskFilterQueryV5 => {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  const overdueOnly = source.overdueOnly === true;
  const dueWithinDays = normalizeDays(source.dueWithinDays);
  const selectedAssigneeIds = normalizeStringArray(source.selectedAssigneeIds);
  return {
    statuses: normalizeLegacyStatusSelection(source.statusFilters),
    due: { includeOverdue: overdueOnly || dueWithinDays !== null, upcomingWithinDays: overdueOnly ? null : dueWithinDays },
    people: { ids: selectedAssigneeIds.filter(id => id !== '__unassigned__'), includeUnassigned: selectedAssigneeIds.includes('__unassigned__') },
    tagIds: normalizeStringArray(source.selectedTagIds),
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

export const migrateTaskFiltersV5ToV6 = (value?: Partial<LegacyTaskFilterQueryV5> | null): TaskFilterQuery => {
  const source = normalizeTaskFiltersV5(value);
  const allPeople = source.people.ids.includes(ALL_ASSIGNEES_FILTER);
  const peopleIds = source.people.ids.filter(id => id !== ALL_ASSIGNEES_FILTER);
  const dueEnabled = source.due.includeOverdue || source.due.upcomingWithinDays !== null;
  return normalizeTaskFilters({
    version: 6,
    statuses: source.statuses.length === 0 ? { mode: 'all', values: [] } : { mode: 'selected', values: source.statuses },
    due: dueEnabled ? { mode: 'legacy-v5', ...source.due } : { mode: 'all', buckets: [], withinDays: 8 },
    people: allPeople || (peopleIds.length === 0 && !source.people.includeUnassigned)
      ? { mode: 'all', ids: [], includeUnassigned: false }
      : { mode: 'selected', ids: peopleIds, includeUnassigned: source.people.includeUnassigned },
    tags: source.tagIds.length === 0 ? { mode: 'all', ids: [], includeUntagged: false } : { mode: 'selected', ids: source.tagIds, includeUntagged: false },
    keyword: source.keyword,
  });
};

export const normalizeTaskFilters = (value?: Partial<TaskFilterQuery> | null): TaskFilterQuery => {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  const statusSource: Record<string, unknown> = isRecord(source.statuses) ? source.statuses : {};
  const dueSource: Record<string, unknown> = isRecord(source.due) ? source.due : {};
  const peopleSource: Record<string, unknown> = isRecord(source.people) ? source.people : {};
  const tagsSource: Record<string, unknown> = isRecord(source.tags) ? source.tags : {};
  const statuses = canonicalSelection(statusSource.mode, normalizeStatuses(statusSource.values));
  const people = canonicalSelection(peopleSource.mode, normalizeStringArray(peopleSource.ids));
  const tags = canonicalSelection(tagsSource.mode, normalizeStringArray(tagsSource.ids));
  const peopleMode: TaskFilterSelectionMode = peopleSource.mode === 'selected' && peopleSource.includeUnassigned === true
    ? 'selected'
    : people.mode;
  const tagsMode: TaskFilterSelectionMode = tagsSource.mode === 'selected' && tagsSource.includeUntagged === true
    ? 'selected'
    : tags.mode;
  const due: TaskFilterQuery['due'] = dueSource.mode === 'legacy-v5'
    ? { mode: 'legacy-v5', includeOverdue: dueSource.includeOverdue === true, upcomingWithinDays: normalizeDays(dueSource.upcomingWithinDays) }
    : (() => {
      const selection = canonicalSelection(dueSource.mode, normalizeBuckets(dueSource.buckets));
      return { mode: selection.mode, buckets: selection.values, withinDays: normalizeDays(dueSource.withinDays, 8) ?? 8 };
    })();
  return {
    version: 6,
    statuses,
    due,
    people: { mode: peopleMode, ids: peopleMode === 'selected' ? normalizeStringArray(peopleSource.ids) : [], includeUnassigned: peopleMode === 'selected' && peopleSource.includeUnassigned === true },
    tags: { mode: tagsMode, ids: tagsMode === 'selected' ? normalizeStringArray(tagsSource.ids) : [], includeUntagged: tagsMode === 'selected' && tagsSource.includeUntagged === true },
    keyword: typeof source.keyword === 'string' ? source.keyword.trim() : '',
  };
};

const validateV5 = (value: unknown): value is LegacyTaskFilterQueryV5 => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['statuses', 'due', 'people', 'tagIds', 'keyword'])) return false;
  if (!Array.isArray(value.statuses) || value.statuses.some(status => !STATUS_ORDER.includes(status as ManualTaskStatus))) return false;
  if (!isRecord(value.due) || !hasOnlyKeys(value.due, ['includeOverdue', 'upcomingWithinDays']) || typeof value.due.includeOverdue !== 'boolean' || !(value.due.upcomingWithinDays === null || isDays(value.due.upcomingWithinDays))) return false;
  if (!isRecord(value.people) || !hasOnlyKeys(value.people, ['ids', 'includeUnassigned']) || !Array.isArray(value.people.ids) || value.people.ids.some(id => typeof id !== 'string') || typeof value.people.includeUnassigned !== 'boolean') return false;
  return Array.isArray(value.tagIds) && value.tagIds.every(id => typeof id === 'string') && typeof value.keyword === 'string';
};

const validateV4 = (value: unknown): value is LegacyTaskFilterStateV4 => {
  if (!isRecord(value) || !hasOnlyOptionalKeys(value, ['statusFilters', 'dueWithinDays', 'overdueOnly', 'selectedAssigneeIds', 'selectedTagIds', 'keyword'])) return false;
  if (value.statusFilters !== undefined && (!isRecord(value.statusFilters) || Object.values(value.statusFilters).some(item => typeof item !== 'boolean'))) return false;
  if (value.dueWithinDays !== undefined && value.dueWithinDays !== null && !isDays(value.dueWithinDays)) return false;
  if (value.overdueOnly !== undefined && typeof value.overdueOnly !== 'boolean') return false;
  for (const field of ['selectedAssigneeIds', 'selectedTagIds'] as const) if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field]?.some(item => typeof item !== 'string'))) return false;
  return value.keyword === undefined || typeof value.keyword === 'string';
};

const validateV6 = (value: unknown): value is TaskFilterQuery => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'statuses', 'due', 'people', 'tags', 'keyword']) || value.version !== 6) return false;
  if (!isRecord(value.statuses) || !hasOnlyKeys(value.statuses, ['mode', 'values']) || !ALL_MODES.includes(value.statuses.mode as TaskFilterSelectionMode) || !Array.isArray(value.statuses.values) || value.statuses.values.some(status => !STATUS_ORDER.includes(status as ManualTaskStatus))) return false;
  if (!isRecord(value.due)) return false;
  if (value.due.mode === 'legacy-v5') {
    if (!hasOnlyKeys(value.due, ['mode', 'includeOverdue', 'upcomingWithinDays']) || typeof value.due.includeOverdue !== 'boolean' || !(value.due.upcomingWithinDays === null || isDays(value.due.upcomingWithinDays))) return false;
  } else if (!hasOnlyKeys(value.due, ['mode', 'buckets', 'withinDays']) || !ALL_MODES.includes(value.due.mode as TaskFilterSelectionMode) || !Array.isArray(value.due.buckets) || value.due.buckets.some(bucket => !DATE_BUCKET_ORDER.includes(bucket as TaskFilterDateBucket)) || !isDays(value.due.withinDays)) return false;
  if (!isRecord(value.people) || !hasOnlyKeys(value.people, ['mode', 'ids', 'includeUnassigned']) || !ALL_MODES.includes(value.people.mode as TaskFilterSelectionMode) || !Array.isArray(value.people.ids) || value.people.ids.some(id => typeof id !== 'string') || typeof value.people.includeUnassigned !== 'boolean') return false;
  if (!isRecord(value.tags) || !hasOnlyKeys(value.tags, ['mode', 'ids', 'includeUntagged']) || !ALL_MODES.includes(value.tags.mode as TaskFilterSelectionMode)) return false;
  return Array.isArray(value.tags.ids) && value.tags.ids.every(id => typeof id === 'string') && typeof value.tags.includeUntagged === 'boolean' && typeof value.keyword === 'string';
};

export const decodePersistedTaskFilters = (value: unknown, version: number | null | undefined): PersistedTaskFilterDecodeResult => {
  if (value === null || value === undefined) return { kind: 'missing' };
  const persistedVersion = typeof version === 'number' ? version : null;
  if (persistedVersion !== 4 && persistedVersion !== 5 && persistedVersion !== 6) return { kind: 'unsupported', version: persistedVersion, reason: 'unsupported preference version', raw: value };
  if (persistedVersion === 6) return validateV6(value) ? { kind: 'valid', version: 6, filters: normalizeTaskFilters(value) } : { kind: 'invalid', version: 6, reason: 'invalid v6 preference payload', raw: value };
  if (persistedVersion === 5) {
    if (!validateV5(value)) return { kind: 'invalid', version: 5, reason: 'invalid v5 preference payload', raw: value };
    const sourceFilters = normalizeTaskFiltersV5(value);
    return { kind: 'valid', version: 5, filters: migrateTaskFiltersV5ToV6(sourceFilters), sourceFilters };
  }
  if (!validateV4(value)) return { kind: 'invalid', version: 4, reason: 'invalid v4 preference payload', raw: value };
  const sourceFilters = migrateLegacyTaskFilterStateV4(value);
  return { kind: 'valid', version: 4, filters: migrateTaskFiltersV5ToV6(sourceFilters), sourceFilters };
};

/** Calendar-only compatibility boundary. */
export const normalizePersistedTaskFiltersV5 = (value: unknown): LegacyTaskFilterQueryV5 => validateV5(value)
  ? normalizeTaskFiltersV5(value)
  : validateV4(value) ? migrateLegacyTaskFilterStateV4(value) : (() => { throw new Error('INVALID_LEGACY_TASK_FILTER_V5'); })();
/** @deprecated Calendar callers should use normalizePersistedTaskFiltersV5. */
export const normalizePersistedTaskFilters = normalizePersistedTaskFiltersV5;

export const normalizeTaskDisplaySettings = (value?: Partial<TaskDisplaySettings> | null): TaskDisplaySettings => {
  const defaults = createDefaultTaskDisplaySettings();
  return {
    showDependencies: typeof value?.showDependencies === 'boolean' ? value.showDependencies : defaults.showDependencies,
    showStartDate: typeof value?.showStartDate === 'boolean' ? value.showStartDate : defaults.showStartDate,
    showTags: typeof value?.showTags === 'boolean' ? value.showTags : defaults.showTags,
    showTagNames: typeof value?.showTagNames === 'boolean' ? value.showTagNames : defaults.showTagNames,
  };
};

const displayKey = (accountId: string | null | undefined) => getAccountScopedStorageKey(BOARD_TASK_FILTER_DISPLAY_STORAGE_KEY, accountId);
const cacheKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY, accountId, boardId);
const legacyV5CacheKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_CACHE_V5_STORAGE_KEY, accountId, boardId);
const legacyCacheKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_CACHE_STORAGE_KEY, accountId, boardId);
const pendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId);
const legacyV5PendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_PENDING_V5_STORAGE_KEY, accountId, boardId);
const legacyPendingKey = ({ accountId, boardId }: AccountBoardTaskFilterScope) => getAccountBoardScopedStorageKey(LEGACY_BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId);

const rawStorage = (key: string | null): { exists: boolean; value: unknown; parseError: boolean } => {
  if (typeof window === 'undefined' || !key) return { exists: false, value: null, parseError: false };
  const raw = window.localStorage.getItem(key);
  if (raw === null) return { exists: false, value: null, parseError: false };
  try { return { exists: true, value: JSON.parse(raw), parseError: false }; } catch { return { exists: true, value: raw, parseError: true }; }
};

export type TaskFilterLocalReadState<T> = { kind: 'missing' } | { kind: 'valid'; value: T; warning: string | null } | { kind: 'locked'; warning: string; raw: unknown };

const cacheFromEnvelope = (raw: unknown): TaskFilterLocalReadState<TaskFilterPreferenceCache> => {
  if (!isRecord(raw) || typeof raw.version !== 'number' || !hasOwn(raw, 'filters')) return { kind: 'locked', warning: '篩選偏好格式無法讀取', raw };
  const decoded = decodePersistedTaskFilters(raw.filters, raw.version);
  if (decoded.kind !== 'valid') return { kind: 'locked', warning: decoded.kind === 'unsupported' ? '篩選偏好版本無法支援' : '篩選偏好格式無法讀取', raw };
  return { kind: 'valid', value: { version: 6, filters: decoded.filters, updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0 }, warning: null };
};

const mutationFromEnvelope = (raw: unknown): TaskFilterLocalReadState<TaskFilterPreferenceMutation> => {
  if (!isRecord(raw) || typeof raw.version !== 'number' || typeof raw.id !== 'string' || (raw.kind !== 'upsert' && raw.kind !== 'delete')) return { kind: 'locked', warning: '待同步篩選偏好格式無法讀取', raw };
  if (![4, 5, 6].includes(raw.version)) return { kind: 'locked', warning: '待同步篩選偏好版本無法支援', raw };
  if (raw.kind === 'delete') {
    if (!hasOnlyKeys(raw, ['id', 'version', 'kind', 'updatedAt']) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) {
      return { kind: 'locked', warning: '待同步篩選偏好格式無法讀取', raw };
    }
    return { kind: 'valid', value: { id: raw.id, version: 6, kind: 'delete', updatedAt: raw.updatedAt }, warning: null };
  }
  if (!hasOnlyKeys(raw, ['id', 'version', 'kind', 'filters', 'updatedAt']) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) {
    return { kind: 'locked', warning: '待同步篩選偏好格式無法讀取', raw };
  }
  const decoded = decodePersistedTaskFilters(raw.filters, raw.version);
  if (decoded.kind !== 'valid') return { kind: 'locked', warning: decoded.kind === 'unsupported' ? '待同步篩選偏好版本無法支援' : '待同步篩選偏好格式無法讀取', raw };
  return { kind: 'valid', value: { id: raw.id, version: 6, kind: 'upsert', filters: decoded.filters, updatedAt: raw.updatedAt }, warning: null };
};

export const readTaskFilterPreferenceCacheState = (scope: AccountBoardTaskFilterScope): TaskFilterLocalReadState<TaskFilterPreferenceCache> => {
  const currentRaw = rawStorage(cacheKey(scope));
  if (currentRaw.exists) return currentRaw.parseError ? { kind: 'locked', warning: '篩選偏好格式無法讀取', raw: currentRaw.value } : cacheFromEnvelope(currentRaw.value);
  for (const key of [legacyV5CacheKey(scope), legacyCacheKey(scope)]) {
    const raw = rawStorage(key);
    if (!raw.exists) continue;
    const legacy = raw.parseError ? { kind: 'locked' as const, warning: '篩選偏好格式無法讀取', raw: raw.value } : cacheFromEnvelope(raw.value);
    if (legacy.kind !== 'valid') return legacy;
    const target = { version: 6, filters: legacy.value.filters, updatedAt: Date.now() };
    if (!writeStorageJson(cacheKey(scope), target)) return { kind: 'valid', value: legacy.value, warning: '篩選偏好尚未儲存到新版格式' };
    const readback = cacheFromEnvelope(rawStorage(cacheKey(scope)).value);
    if (readback.kind !== 'valid' || !sameCanonical(readback.value.filters, target.filters)) return { kind: 'valid', value: legacy.value, warning: '篩選偏好尚未儲存到新版格式' };
    removeStorageKey(key);
    return readback;
  }
  return { kind: 'missing' };
};

export const readTaskFilterPreferenceCache = (scope: AccountBoardTaskFilterScope): TaskFilterPreferenceCache | null => {
  const state = readTaskFilterPreferenceCacheState(scope);
  return state.kind === 'valid' ? state.value : null;
};
export const writeTaskFilterPreferenceCache = (scope: AccountBoardTaskFilterScope, filters: TaskFilterQuery): boolean => writeStorageJson(cacheKey(scope), { version: 6, filters: normalizeTaskFilters(filters), updatedAt: Date.now() });
export const removeTaskFilterPreferenceCache = (scope: AccountBoardTaskFilterScope): boolean => removeStorageKey(cacheKey(scope));

export const readTaskFilterPreferencePendingState = (scope: AccountBoardTaskFilterScope): TaskFilterLocalReadState<TaskFilterPreferenceMutation> => {
  const currentRaw = rawStorage(pendingKey(scope));
  if (currentRaw.exists) return currentRaw.parseError ? { kind: 'locked', warning: '待同步篩選偏好格式無法讀取', raw: currentRaw.value } : mutationFromEnvelope(currentRaw.value);
  for (const key of [legacyV5PendingKey(scope), legacyPendingKey(scope)]) {
    const raw = rawStorage(key);
    if (!raw.exists) continue;
    const legacy = raw.parseError ? { kind: 'locked' as const, warning: '待同步篩選偏好格式無法讀取', raw: raw.value } : mutationFromEnvelope(raw.value);
    if (legacy.kind !== 'valid') return legacy;
    const target = { ...legacy.value, version: 6 };
    if (!writeStorageJson(pendingKey(scope), target)) return { kind: 'valid', value: legacy.value, warning: '待同步篩選偏好尚未儲存到新版格式' };
    const readback = mutationFromEnvelope(rawStorage(pendingKey(scope)).value);
    if (readback.kind !== 'valid' || readback.value.id !== target.id || readback.value.kind !== target.kind || !sameCanonical(readback.value.filters, target.filters)) return { kind: 'valid', value: legacy.value, warning: '待同步篩選偏好尚未儲存到新版格式' };
    removeStorageKey(key);
    return readback;
  }
  return { kind: 'missing' };
};

export const readTaskFilterPreferencePending = (scope: AccountBoardTaskFilterScope): TaskFilterPreferenceMutation | null => {
  const state = readTaskFilterPreferencePendingState(scope);
  return state.kind === 'valid' ? state.value : null;
};
export const writeTaskFilterPreferencePending = (scope: AccountBoardTaskFilterScope, mutation: TaskFilterPreferenceMutation): boolean => writeStorageJson(pendingKey(scope), { ...mutation, version: 6, filters: mutation.kind === 'upsert' ? normalizeTaskFilters(mutation.filters) : undefined });
export const removeTaskFilterPreferencePending = (scope: AccountBoardTaskFilterScope): boolean => removeStorageKey(pendingKey(scope));

const createMigrationMarker = () => ({ version: 6, migratedAt: Date.now() });
const extractLegacyDisplaySettings = (value: unknown): TaskDisplaySettings | null => {
  if (!isRecord(value)) return null;
  const source = isRecord(value.displaySettings) ? value.displaySettings : value;
  return ['showDependencies', 'showStartDate', 'showTags', 'showTagNames'].some(field => typeof source[field] === 'boolean') ? normalizeTaskDisplaySettings(source as Partial<TaskDisplaySettings>) : null;
};

export const migrateLegacyBoardTaskFilterPrefs = (accountId: string | null | undefined = null): boolean => {
  const markerKey = getAccountScopedStorageKey(BOARD_TASK_FILTER_MIGRATION_MARKER_KEY, accountId);
  if (!accountId || !markerKey) return false;
  if (readStorageJson<{ version?: number }>(markerKey)?.version === 6) return true;
  const scopedLegacyKey = getAccountScopedStorageKey(ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY, accountId);
  const legacyCandidates = [
    { key: scopedLegacyKey, value: readStorageJson<unknown>(scopedLegacyKey) },
    { key: BOARD_TASK_FILTER_STORAGE_KEY, value: readStorageJson<unknown>(BOARD_TASK_FILTER_STORAGE_KEY) },
    { key: LEGACY_BOARD_FILTER_STORAGE_KEY, value: readStorageJson<unknown>(LEGACY_BOARD_FILTER_STORAGE_KEY) },
  ];
  const displaySettings = legacyCandidates.map(candidate => extractLegacyDisplaySettings(candidate.value)).find((value): value is TaskDisplaySettings => Boolean(value));
  if (displaySettings) {
    const payload = { version: 4, displaySettings, updatedAt: Date.now() };
    if (!writeStorageJson(displayKey(accountId), payload)) return false;
    const readback = readStorageJson<{ version?: number; displaySettings?: TaskDisplaySettings }>(displayKey(accountId));
    if (readback?.version !== 4 || !sameCanonical(normalizeTaskDisplaySettings(readback.displaySettings), displaySettings)) return false;
  }
  if (!writeStorageJson(markerKey, createMigrationMarker()) || readStorageJson<{ version?: number }>(markerKey)?.version !== 6) return false;
  legacyCandidates.forEach(candidate => { if (candidate.value && !(isRecord(candidate.value) && 'filters' in candidate.value)) removeStorageKey(candidate.key); });
  return true;
};

export const readBoardTaskDisplaySettings = (accountId: string | null | undefined = null): TaskDisplaySettings => {
  migrateLegacyBoardTaskFilterPrefs(accountId);
  return normalizeTaskDisplaySettings(readStorageJson<{ displaySettings?: Partial<TaskDisplaySettings> }>(displayKey(accountId))?.displaySettings);
};
export const writeBoardTaskDisplaySettings = (settings: Partial<TaskDisplaySettings>, accountId: string | null | undefined = null): TaskDisplaySettings => {
  migrateLegacyBoardTaskFilterPrefs(accountId);
  const next = normalizeTaskDisplaySettings({ ...readBoardTaskDisplaySettings(accountId), ...settings });
  writeStorageJson(displayKey(accountId), { version: 4, displaySettings: next, updatedAt: Date.now() });
  return next;
};
export const readBoardTaskFilterPrefs = (accountId: string | null | undefined = null): BoardTaskFilterPrefs => ({ version: 6, filters: createDefaultBoardTaskFilters(), displaySettings: readBoardTaskDisplaySettings(accountId), updatedAt: Date.now() });
export const writeBoardTaskFilterPrefs = (updates: { displaySettings?: Partial<TaskDisplaySettings> }, accountId: string | null | undefined = null): BoardTaskFilterPrefs => ({ version: 6, filters: createDefaultBoardTaskFilters(), displaySettings: updates.displaySettings ? writeBoardTaskDisplaySettings(updates.displaySettings, accountId) : readBoardTaskDisplaySettings(accountId), updatedAt: Date.now() });
