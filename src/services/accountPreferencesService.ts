import { isSupabaseBackend } from './dataBackend';
import { isSupabaseConfigured, supabase } from './supabase/client';
import type { Json } from './supabase/database.types';
import {
  WORKSPACE_SIDEBAR_WIDTH_PREFS_KEY,
} from '../features/layout/preferences';
import {
  clampTaskWorkbenchUnplacedRatio,
  TASK_WORKBENCH_PANEL_PREFS_KEY,
} from '../features/taskWorkbench/preferences';
import {
  getAccountScopedStorageKey,
  readStorageJson,
  writeStorageJson,
} from '../utils/accountScopedStorage';

const ACCOUNT_UI_PREFERENCES_KEY = 'projed-ui-preferences:v1';

export type AccountLayoutPreferences = {
  workspaceSidebarWidth?: number;
  taskWorkbenchWidth?: number;
  taskWorkbenchUnplacedRatio?: number;
};

type UiPreferences = {
  [key: string]: unknown;
  layout?: AccountLayoutPreferences;
};

const preferencesCache = new Map<string, UiPreferences>();
const hydratePromises = new Map<string, Promise<AccountLayoutPreferences>>();
const remoteWriteChains = new Map<string, Promise<void>>();

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeLayoutPreferences = (value: unknown): AccountLayoutPreferences => {
  if (!isRecord(value)) return {};

  const layout: AccountLayoutPreferences = {};
  if (typeof value.workspaceSidebarWidth === 'number' && Number.isFinite(value.workspaceSidebarWidth)) {
    layout.workspaceSidebarWidth = value.workspaceSidebarWidth;
  }
  if (typeof value.taskWorkbenchWidth === 'number' && Number.isFinite(value.taskWorkbenchWidth)) {
    layout.taskWorkbenchWidth = value.taskWorkbenchWidth;
  }
  if (typeof value.taskWorkbenchUnplacedRatio === 'number' && Number.isFinite(value.taskWorkbenchUnplacedRatio)) {
    layout.taskWorkbenchUnplacedRatio = clampTaskWorkbenchUnplacedRatio(value.taskWorkbenchUnplacedRatio);
  }
  return layout;
};

const normalizeUiPreferences = (value: unknown): UiPreferences => {
  if (!isRecord(value)) return {};
  return {
    ...value,
    layout: normalizeLayoutPreferences(value.layout),
  };
};

const readLegacyLayoutPreferences = (accountId: string): AccountLayoutPreferences => {
  const layout: AccountLayoutPreferences = {};
  const legacySidebarWidth = readStorageJson<unknown>(
    getAccountScopedStorageKey(WORKSPACE_SIDEBAR_WIDTH_PREFS_KEY, accountId),
  );
  const legacyPanelPrefs = readStorageJson<unknown>(
    getAccountScopedStorageKey(TASK_WORKBENCH_PANEL_PREFS_KEY, accountId),
  );

  if (typeof legacySidebarWidth === 'number' && Number.isFinite(legacySidebarWidth)) {
    layout.workspaceSidebarWidth = legacySidebarWidth;
  }
  if (
    isRecord(legacyPanelPrefs) &&
    typeof legacyPanelPrefs.width === 'number' &&
    Number.isFinite(legacyPanelPrefs.width)
  ) {
    layout.taskWorkbenchWidth = legacyPanelPrefs.width;
  }
  if (
    isRecord(legacyPanelPrefs) &&
    typeof legacyPanelPrefs.unplacedRatio === 'number' &&
    Number.isFinite(legacyPanelPrefs.unplacedRatio)
  ) {
    layout.taskWorkbenchUnplacedRatio = clampTaskWorkbenchUnplacedRatio(legacyPanelPrefs.unplacedRatio);
  }
  return layout;
};

const readLocalPreferences = (accountId: string): UiPreferences => {
  const storedPreferences = normalizeUiPreferences(
    readStorageJson<unknown>(getAccountScopedStorageKey(ACCOUNT_UI_PREFERENCES_KEY, accountId)),
  );
  const legacyLayout = readLegacyLayoutPreferences(accountId);
  return {
    ...storedPreferences,
    layout: {
      ...legacyLayout,
      ...normalizeLayoutPreferences(storedPreferences.layout),
    },
  };
};

const writeLocalPreferences = (accountId: string, preferences: UiPreferences) => {
  writeStorageJson(
    getAccountScopedStorageKey(ACCOUNT_UI_PREFERENCES_KEY, accountId),
    preferences,
  );
};

const mergeLayoutIntoPreferences = (
  preferences: UiPreferences,
  updates: AccountLayoutPreferences,
): UiPreferences => ({
  ...preferences,
  layout: {
    ...normalizeLayoutPreferences(preferences.layout),
    ...updates,
  },
});

const readRemotePreferences = async (accountId: string): Promise<UiPreferences> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('ui_preferences')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeUiPreferences(data?.ui_preferences);
};

const writeRemotePreferences = async (accountId: string, updates: AccountLayoutPreferences) => {
  const remotePreferences = await readRemotePreferences(accountId);
  const nextPreferences = mergeLayoutIntoPreferences(remotePreferences, updates);
  const { error } = await supabase
    .from('profiles')
    .update({ ui_preferences: nextPreferences as Json })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  preferencesCache.set(accountId, nextPreferences);
  writeLocalPreferences(accountId, nextPreferences);
};

const shouldUseRemotePreferences = () => isSupabaseBackend && isSupabaseConfigured;

export const hydrateAccountLayoutPreferences = (
  accountId: string | null | undefined,
): Promise<AccountLayoutPreferences> => {
  if (!accountId) return Promise.resolve({});

  const cached = preferencesCache.get(accountId);
  if (cached) return Promise.resolve(normalizeLayoutPreferences(cached.layout));

  const localPreferences = readLocalPreferences(accountId);
  if (!shouldUseRemotePreferences()) {
    preferencesCache.set(accountId, localPreferences);
    return Promise.resolve(normalizeLayoutPreferences(localPreferences.layout));
  }

  const existingPromise = hydratePromises.get(accountId);
  if (existingPromise) return existingPromise;

  const promise = readRemotePreferences(accountId)
    .then(async remotePreferences => {
      const localLayout = normalizeLayoutPreferences(localPreferences.layout);
      const remoteLayout = normalizeLayoutPreferences(remotePreferences.layout);
      const mergedLayout = { ...localLayout, ...remoteLayout };
      const mergedPreferences = {
        ...remotePreferences,
        layout: mergedLayout,
      };

      preferencesCache.set(accountId, mergedPreferences);
      writeLocalPreferences(accountId, mergedPreferences);

      const legacyLayoutUpdates = Object.fromEntries(
        Object.entries(localLayout).filter(([key]) => !(key in remoteLayout)),
      ) as AccountLayoutPreferences;
      if (Object.keys(legacyLayoutUpdates).length > 0) {
        await writeRemotePreferences(accountId, legacyLayoutUpdates);
      }

      return mergedLayout;
    })
    .catch(error => {
      console.warn('[accountPreferences] 個人介面偏好讀取失敗，使用本機快取:', error);
      preferencesCache.set(accountId, localPreferences);
      return normalizeLayoutPreferences(localPreferences.layout);
    })
    .finally(() => {
      hydratePromises.delete(accountId);
    });

  hydratePromises.set(accountId, promise);
  return promise;
};

export const persistAccountLayoutPreferences = (
  accountId: string | null | undefined,
  updates: AccountLayoutPreferences,
): void => {
  if (!accountId) return;

  const currentPreferences = preferencesCache.get(accountId) || readLocalPreferences(accountId);
  const nextPreferences = mergeLayoutIntoPreferences(currentPreferences, updates);
  preferencesCache.set(accountId, nextPreferences);
  writeLocalPreferences(accountId, nextPreferences);

  if (!shouldUseRemotePreferences()) return;

  const previousWrite = remoteWriteChains.get(accountId) || Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(() => writeRemotePreferences(accountId, updates))
    .catch(error => {
      console.warn('[accountPreferences] 個人介面偏好寫入失敗，已保留本機快取:', error);
    });

  remoteWriteChains.set(accountId, nextWrite);
};
