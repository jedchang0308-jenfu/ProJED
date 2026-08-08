import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(file), 'utf8');
const source = {
  storage: read('src/features/taskFilters/storage.ts'),
  accountStorage: read('src/utils/accountScopedStorage.ts'),
  boardStore: read('src/store/useBoardStore.ts'),
  tagStore: read('src/store/useTagStore.ts'),
  app: read('src/App.tsx'),
  workbenchPrefs: read('src/features/taskWorkbench/preferences.ts'),
  workbenchPanel: read('src/components/TaskWorkbenchPanel.tsx'),
  workbenchCommands: read('src/components/taskWorkbenchPanelCommands.ts'),
  calendarService: read('src/services/supabase/calendarSubscriptionService.ts'),
  calendarRls: read('supabase/migrations/20260527064347_calendar_subscriptions.sql'),
};

const checks = [
  [
    'account-scoped localStorage keys encode the authenticated account',
    source.accountStorage.includes('getAccountScopedStorageKey') &&
      source.accountStorage.includes('encodeURIComponent(accountId)'),
  ],
  [
    'board filter storage reads the auth uid and persists only v2 account keys',
    source.storage.includes("useAuthStore.getState().user?.uid") &&
      source.storage.includes("ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY = 'projed-task-filters:v2'") &&
      source.storage.includes('getAccountScopedStorageKey(ACCOUNT_BOARD_TASK_FILTER_STORAGE_KEY, accountId)') &&
      !source.storage.includes('writeStorageJson(BOARD_TASK_FILTER_STORAGE_KEY') &&
      !source.storage.includes('writeStorageJson(LEGACY_BOARD_FILTER_STORAGE_KEY'),
  ],
  [
    'legacy board filter settings migrate once and are removed from shared keys',
    source.storage.includes('removeStorageKey(BOARD_TASK_FILTER_STORAGE_KEY)') &&
      source.storage.includes('removeStorageKey(LEGACY_BOARD_FILTER_STORAGE_KEY)'),
  ],
  [
    'board and tag stores hydrate after the account is known',
    source.boardStore.includes('hydrateTaskFilterPrefs: () => set(getStoredFilters())') &&
      source.tagStore.includes('hydrateSelectedTagFilter: () => set({ selectedTagIds: getStoredSelectedTagIds() })') &&
      source.app.includes('useBoardStore.getState().hydrateTaskFilterPrefs()') &&
      source.app.includes('useTagStore.getState().hydrateSelectedTagFilter()'),
  ],
  [
    'workbench panel and all per-board filters use account-scoped v2 keys',
    source.workbenchPrefs.includes("TASK_WORKBENCH_PANEL_PREFS_KEY = 'projed-task-workbench-panel:v2'") &&
      source.workbenchPrefs.includes("TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v2'") &&
      source.workbenchPrefs.includes('getAccountScopedStorageKey') &&
      source.workbenchPanel.includes('useAuthStore(state => state.user?.uid ?? null)') &&
      source.workbenchPanel.includes('writeTaskWorkbenchFilterPrefs') &&
      source.workbenchCommands.includes('useAuthStore.getState().user?.uid'),
  ],
  [
    'workbench v1 preferences migrate once to the current account',
    source.workbenchPrefs.includes('readScopedOrLegacy') &&
      source.workbenchPrefs.includes('removeStorageKey(legacyKey)'),
  ],
  [
    'calendar subscription filters are server-side and owner-scoped',
    source.calendarService.includes(".from('calendar_subscriptions')") &&
      source.calendarService.includes('owner_user_id: ownerUserId') &&
      source.calendarRls.includes('owner_user_id = (select auth.uid())'),
  ],
];

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: checks.length - failed.length, fail: failed.length },
  results: checks.map(([name, ok]) => ({ name, ok })),
}, null, 2));

if (failed.length > 0) process.exit(1);
