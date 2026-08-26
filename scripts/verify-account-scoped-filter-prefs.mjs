import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(file), 'utf8');
const source = {
  storage: read('src/features/taskFilters/storage.ts'),
  accountStorage: read('src/utils/accountScopedStorage.ts'),
  boardStore: read('src/store/useBoardStore.ts'),
  tagStore: read('src/store/useTagStore.ts'),
  taskFilterStore: read('src/store/useTaskFilterStore.ts'),
  preferenceRepository: read('src/features/taskFilters/preferenceRepository.ts'),
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
    'board filter cache and journal use exact v4 account-board keys',
    source.accountStorage.includes('getAccountBoardScopedStorageKey') &&
      source.storage.includes("BOARD_TASK_FILTER_CACHE_STORAGE_KEY = 'projed-task-filters:v4'") &&
      source.storage.includes("BOARD_TASK_FILTER_PENDING_STORAGE_KEY = 'projed-task-filter-pending:v4'") &&
      source.storage.includes('getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_CACHE_STORAGE_KEY, accountId, boardId)') &&
      source.storage.includes('getAccountBoardScopedStorageKey(BOARD_TASK_FILTER_PENDING_STORAGE_KEY, accountId, boardId)') &&
      !source.storage.includes('writeStorageJson(BOARD_TASK_FILTER_STORAGE_KEY') &&
      !source.storage.includes('writeStorageJson(LEGACY_BOARD_FILTER_STORAGE_KEY'),
  ],
  [
    'legacy board filters are discarded only after display readback and migration marker',
    source.storage.includes('extractLegacyDisplaySettings') &&
      source.storage.includes('if (!writeStorageJson(targetDisplayKey, payload)) return false') &&
      source.storage.includes('readback?.version !== BOARD_TASK_FILTER_PREFS_VERSION') &&
      source.storage.includes('BOARD_TASK_FILTER_MIGRATION_MARKER_KEY') &&
      source.storage.includes('legacyCandidates.forEach'),
  ],
  [
    'display and task filter stores hydrate only after account-board scope is known',
    source.boardStore.includes('hydrateTaskDisplayPrefs') &&
      !source.boardStore.includes('statusFilters:') &&
      !source.tagStore.includes('selectedTagIds:') &&
      source.taskFilterStore.includes('activateScope: async (accountId, boardId)') &&
      source.app.includes('useBoardStore.getState().hydrateTaskDisplayPrefs()') &&
      source.app.includes('useTaskFilterStore.getState().activateScope(userId, activeBoardId)'),
  ],
  [
    'workbench panel stays account-scoped and filters use v4 without cloud coupling',
    source.workbenchPrefs.includes("TASK_WORKBENCH_PANEL_PREFS_KEY = 'projed-task-workbench-panel:v2'") &&
      source.workbenchPrefs.includes("TASK_WORKBENCH_FILTER_PREFS_KEY = 'projed-task-workbench-filters:v4'") &&
      source.workbenchPrefs.includes('getAccountScopedStorageKey') &&
      source.workbenchPanel.includes('useAuthStore(state => state.user?.uid ?? null)') &&
      source.workbenchPanel.includes('writeTaskWorkbenchFilterPrefs') &&
      source.workbenchCommands.includes('useAuthStore.getState().user?.uid') &&
      !source.workbenchPrefs.includes('taskFilterPreferenceService'),
  ],
  [
    'workbench v1-v3 filters reset while selected board survives verified migration',
    source.workbenchPrefs.includes('LEGACY_TASK_WORKBENCH_FILTER_PREFS_V2_KEY') &&
      source.workbenchPrefs.includes('selectedBoardId: typeof legacy.selectedBoardId') &&
      source.workbenchPrefs.includes('filtersByBoardId: {}') &&
      source.workbenchPrefs.includes('readback?.version === BOARD_TASK_FILTER_PREFS_VERSION') &&
      source.workbenchPrefs.includes('legacyCandidates.forEach'),
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
