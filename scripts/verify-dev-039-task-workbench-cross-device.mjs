import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  migration: 'supabase/migrations/20260810093403_task_workbench_unplaced_items.sql',
  databaseTypes: 'src/services/supabase/database.types.ts',
  service: 'src/services/supabase/taskWorkbenchUnplacedService.ts',
  placement: 'src/features/taskWorkbench/placement.ts',
  wbsStore: 'src/store/useWbsStore.ts',
  panel: 'src/components/TaskWorkbenchPanel.tsx',
  spec: 'ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md',
  devTask: 'ai-doc/dev_task.md',
  packageJson: 'package.json',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'migration defines account-owned unplaced task storage',
  source.migration.includes('create table if not exists public.task_workbench_unplaced_items') &&
    source.migration.includes('owner_id uuid not null references public.profiles(id)') &&
    source.migration.includes('primary key (owner_id, id)') &&
    source.migration.includes('jsonb_typeof(task) = \'object\'') &&
    source.migration.includes('sort_order integer not null') &&
    source.migration.includes('updated_at timestamptz not null'),
);

assert(
  'migration enables RLS with authenticated owner policies and grants',
  source.migration.includes('enable row level security') &&
    source.migration.includes('owners read unplaced task items') &&
    source.migration.includes('owners insert unplaced task items') &&
    source.migration.includes('owners update unplaced task items') &&
    source.migration.includes('owners delete unplaced task items') &&
    (source.migration.match(/\(select auth\.uid\(\)\) = owner_id/g) || []).length >= 5 &&
    source.migration.includes('to authenticated') &&
    source.migration.includes('grant select, insert, update, delete on public.task_workbench_unplaced_items to authenticated'),
);

assert(
  'migration keeps updated_at maintained by the shared trigger',
  source.migration.includes('task_workbench_unplaced_items_touch_updated_at') &&
    source.migration.includes('execute function public.touch_updated_at()'),
);

assert(
  'generated database contract includes the new table',
  source.databaseTypes.includes('export type TaskWorkbenchUnplacedItemRow') &&
    source.databaseTypes.includes('task_workbench_unplaced_items: Table<TaskWorkbenchUnplacedItemRow>'),
);

assert(
  'Supabase service implements owner-scoped list, upsert, and delete',
  source.service.includes(".from(TABLE_NAME)") &&
    source.service.includes(".select('owner_id,id,workspace_id,task,sort_order,created_at,updated_at')") &&
    source.service.includes(".upsert(payload, { onConflict: 'owner_id,id' })") &&
    source.service.includes(".delete()") &&
    source.service.includes(".eq('id', taskId)"),
);

assert(
  'remote table rollout failure preserves the local fallback',
  source.service.includes('Remote unplaced-task table is not available yet') &&
    source.placement.includes('Failed to load remote unplaced tasks; using local fallback') &&
    source.placement.includes('Failed to migrate a local unplaced task') &&
    source.placement.includes('merged.set(localTask.id, localTask)') &&
    source.placement.includes('local fallback retained') &&
    source.placement.includes('clearTaskWorkbenchUnplacedLocalCaches(accountId)') &&
    source.placement.includes('if (!migrationFailed) clearTaskWorkbenchUnplacedLocalCaches(accountId)'),
);

assert(
  'placement layer provides account-scoped cache and one-time local merge',
  source.placement.includes('TASK_WORKBENCH_UNPLACED_ACCOUNT_STORAGE_KEY') &&
    source.placement.includes('getAccountStorageKey') &&
    source.placement.includes('loadTaskWorkbenchUnplacedTasks') &&
    source.placement.includes('persistTaskWorkbenchUnplacedTask') &&
    source.placement.includes('persistRemoveTaskWorkbenchUnplacedTask') &&
    source.placement.includes('updatedAt'),
);

assert(
  'WBS store avoids global localStorage leakage for Supabase accounts',
  source.wbsStore.includes('isSupabaseBackend ? [] : readTaskWorkbenchUnplacedTasks()') &&
    source.wbsStore.includes('hydrateUnplacedTasks') &&
    source.wbsStore.includes('useAuthStore.getState().user?.uid') &&
    source.wbsStore.includes('persistTaskWorkbenchUnplacedTask') &&
    source.wbsStore.includes('persistRemoveTaskWorkbenchUnplacedTask'),
);

assert(
  'workbench hydrates account-owned remote tasks before legacy inbox promotion',
  source.panel.includes('loadTaskWorkbenchUnplacedTasks(accountId)') &&
    source.panel.includes('hydrateUnplacedTasks(storedTasks)') &&
    source.panel.includes('legacyItems') &&
    source.panel.includes('addNode(task)'),
);

assert(
  'spec and dev task record the Phase 2B cross-device contract',
  source.spec.includes('## Phase 2B：未歸位任務帳號同步') &&
    source.spec.includes('task_workbench_unplaced_items') &&
    source.spec.includes('同帳號跨裝置一致') &&
    source.devTask.includes('本機實作完成 / Supabase migration與正式環境待驗證') &&
    source.devTask.includes('migration readback'),
);

assert(
  'package script is registered',
  source.packageJson.includes('"verify:dev-039-task-workbench-cross-device"'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
