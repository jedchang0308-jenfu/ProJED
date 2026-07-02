import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const checks = [];

const addCheck = (name, condition, detail = '') => {
  checks.push({ name, pass: Boolean(condition), detail });
};

const containsAll = (content, values) => values.every(value => content.includes(value));
const notContainsAny = (content, values) => values.every(value => !content.includes(value));

const taskZoneView = read('src/components/TaskZoneView.tsx');
const taskZoneStore = read('src/store/useTaskZoneStore.ts');
const app = read('src/App.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const home = read('src/components/HomeView.tsx');
const boardView = read('src/components/BoardView.tsx');
const dataBackend = read('src/services/dataBackend.ts');
const projedService = read('src/services/supabase/projedService.ts');
const databaseTypes = read('src/services/supabase/database.types.ts');
const migration = read('supabase/migrations/20260630070000_dev_040_personal_task_zone.sql');
const devTask = read('ai-doc/dev_task.md');

addCheck(
  'TaskZoneView provides primary task-zone UI and draggable personal tasks',
  containsAll(taskZoneView, [
    'data-task-zone-view',
    'TaskZoneBoardPanel',
    'TaskZoneDetailsPanel',
    'personal-task-zone-item',
    'TaskDragHandle',
    '快速建立任務',
    '待歸位',
    'data-task-zone-open-details',
    'data-task-zone-details',
    'data-task-zone-details-title',
  ])
);

addCheck(
  'TaskZone details supports core TaskNode fields before board placement',
  containsAll(taskZoneView, [
    'detailNotes',
    'description: notes[0]?.content',
    "updateDate('startDate'",
    "updateDate('endDate'",
    'updateStatus',
    '歸位到看板後可使用指派、標籤、紀錄與依賴等看板功能。',
  ])
);

addCheck(
  'TaskZone details flushes dirty notes before close',
  containsAll(taskZoneView, [
    'const closeDetails = () =>',
    'if (notesDirty.current)',
    'detailNotes: notes',
    'description: notes[0]?.content ||',
    'onClose();',
  ])
);

addCheck(
  'Task zone store displays root personal tasks only',
  containsAll(taskZoneStore, [
    'getRootTasks',
    '!task.parentId || !ids.has(task.parentId)',
    'sortTasks(getRootTasks(tasks))',
  ])
);

addCheck(
  'App routes task_zone and no longer mounts QuickCaptureShell as primary flow',
  containsAll(app, ['TaskZoneView', "case 'task_zone'"]) &&
    notContainsAny(app, ['QuickCaptureShell'])
);

addCheck(
  'Sidebar exposes first-level task-zone entry with badge source',
  containsAll(sidebar, [
    'data-sidebar-task-zone',
    '任務專區',
    'getUnplacedCount',
  ])
);

addCheck(
  'Home exposes primary quick task entry',
  containsAll(home, [
    'data-home-task-zone-entry',
    'data-home-task-zone-input',
    'createTask',
    '已建立任務，留在待歸位。',
  ])
);

addCheck(
  'BoardView uses task-zone panel and canonical placement service',
  containsAll(boardView, [
    'TaskZoneSourcePanel',
    'personal-task-zone-item',
    'placeTaskOnBoard',
    'order: intent.order',
    'TaskDragOverlayPreview',
  ]) &&
    notContainsAny(boardView, ['QuickCaptureShell', 'promoteMemoItem'])
);

addCheck(
  'Data backend exposes taskZoneService contract',
  containsAll(dataBackend, [
    'taskZoneService',
    'ensureZone',
    'loadZoneTasks',
    'createQuickTask',
    'placeTaskOnBoard',
    'PersonalTaskZoneInfo',
  ])
);

addCheck(
  'Supabase service hides personal zone from normal workspace list and exposes RPC client',
  containsAll(projedService, [
    'isPersonalTaskZoneMetadata',
    'supabaseTaskZoneService',
    'ensure_personal_task_zone',
    'create_personal_quick_task',
    'place_personal_task_on_board',
  ])
);

addCheck(
  'Supabase task-zone updates persist TaskNode detail fields',
  containsAll(projedService, [
    'detailNotes: Array.isArray(item.detail_notes)',
    'detail_notes: (node.detailNotes ?? [])',
    "if ('detailNotes' in updates) updatePayload.detail_notes",
    "if ('description' in updates) updatePayload.description",
    "if ('status' in updates) updatePayload.status",
    "if ('startDate' in updates) updatePayload.start_date",
    "if ('endDate' in updates) updatePayload.end_date",
  ])
);

addCheck(
  'Database types include DEV-040 RPC contracts',
  containsAll(databaseTypes, [
    'ensure_personal_task_zone',
    'create_personal_quick_task',
    'place_personal_task_on_board',
  ])
);

addCheck(
  'Migration creates hidden personal project functions without nullable project_id',
  containsAll(migration, [
    'ensure_personal_task_zone',
    'create_personal_quick_task',
    'place_personal_task_on_board',
    'create unique index if not exists wbs_items_personal_task_zone_client_mutation_idx',
    'exception when unique_violation',
    'with recursive task_tree',
    'update public.wbs_dependencies',
    'delete from public.wbs_item_tags',
    'update public.wbs_item_tags',
    'Personal tasks must be placed on a normal board.',
    "'system_scope', 'personal_task_zone'",
    'grant execute on function public.ensure_personal_task_zone() to authenticated',
  ]) &&
    !migration.includes('alter table public.wbs_items') &&
    !migration.includes('drop not null')
);

addCheck(
  'dev_task records release gate evidence and deploy-pending state',
  containsAll(devTask, [
    'RD implementation update - 2026-06-30',
    '20260630070000_dev_040_personal_task_zone.sql',
    'Production Released / Production Smoke Passed',
    'Release gate evidence - 2026-07-01',
    'Production DB QC passed',
  ])
);

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (failed.length > 0) {
  console.error(`\nDEV-040 static verifier failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`\nDEV-040 static verifier passed: ${checks.length}/${checks.length} checks.`);
