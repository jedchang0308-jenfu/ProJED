import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const packageJson = JSON.parse(read('package.json'));
const store = read('src/store/useWbsStore.ts');
const transaction = read('src/features/taskWorkbench/placementTransaction.ts');
const service = read('src/services/supabase/taskWorkbenchUnplacedService.ts');
const dragCommit = read('src/components/Wbs/taskDrag/taskDragCommit.ts');
const taskTypes = read('src/components/Wbs/taskDrag/taskDragTypes.ts');
const panel = read('src/components/TaskWorkbenchPanel.tsx');
const card = read('src/components/Wbs/KanbanCard.tsx');
const checklist = read('src/components/Wbs/KanbanChecklist.tsx');
const column = read('src/components/Wbs/KanbanColumn.tsx');
const pendingIndicator = read('src/components/Wbs/taskDrag/TaskPlacementPendingIndicator.tsx');
const migration = read('supabase/migrations/20260825093621_dev_089_transactional_task_workbench_placement.sql');
const browser = read('scripts/verify-dev-089-task-placement-failure-browser.pw.js');
const spec = read('ai-doc/specs/SPEC-089-authoritative-task-placement-transaction.md');
const qa = read('ai-doc/qa/QA-DEV-089-authoritative-task-placement-transaction.md');
const qc = read('ai-doc/qc/QC-DEV-089-authoritative-task-placement-transaction.md');
const capa = read('ai-doc/reports/CAPA-20260825-task-placement-disappears-on-mobile.md');
const devTask = read('ai-doc/dev_task.md');
const documentationMap = read('ai-doc/documentation_map.md');

const checks = [];
const add = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
const includesAll = (source, values) => values.every(value => source.includes(value));

add('package registers DEV-089 static and browser gates',
  packageJson.scripts?.['verify:dev-089-task-placement-transaction'] === 'node scripts/verify-dev-089-task-placement-transaction.mjs'
  && packageJson.scripts?.['verify:dev-089-task-placement-failure-browser']?.includes('verify-dev-089-task-placement-failure-browser.pw.js'));

const persistIndex = store.indexOf('await persistTaskWorkbenchPlacementTransaction({');
const localCommitIndex = store.indexOf('get().updateNode(id, updates, { skipPersistence: true, skipActivity: true });');
add('cross-ownership store commits local state only after awaited persistence',
  persistIndex >= 0 && localCommitIndex > persistIndex,
  { persistIndex, localCommitIndex });
add('store protects pending source nodes from realtime refresh replacement',
  includesAll(store, [
    'pendingPlacementNodeIds: Record<string, string>',
    'if (pendingPlacementNodeIds[task.id])',
    'pendingOperationId !== operationId',
  ]));
add('undo and redo reuse the same durable placement transaction',
  (store.match(/get\(\)\.commitNodePlacementBatch\(/g) || []).length >= 2
  && store.includes("const reverseOrder = options.persistenceOrder === 'root-first' ? 'leaves-first' : 'root-first';"));

add('transaction validates one complete root identity and account boundary',
  includesAll(transaction, [
    'getPlacementRootTaskId',
    'roots.length !== 1',
    'must preserve task identity and order',
    'Authenticated account is required',
  ]));
add('fault injection is test-mode-only and failure occurs before persistence',
  transaction.includes("if (import.meta.env.MODE !== 'test'")
  && transaction.indexOf('await applyPlacementTestFault();') < transaction.indexOf('if (!isSupabaseBackend)'));
add('ambiguous transport failure retries the same idempotency key once',
  includesAll(transaction, [
    'isRetryablePlacementError',
    'await supabaseTaskWorkbenchPlacementService.commit(operation, afterNodes);',
  ])
  && (transaction.match(/supabaseTaskWorkbenchPlacementService\.commit\(operation, afterNodes\)/g) || []).length === 2);
add('second ambiguous response is resolved through the authoritative operation ledger',
  includesAll(transaction, [
    'TaskPlacementOutcomeUnknownError',
    'supabaseTaskWorkbenchPlacementService.fail(',
    'supabaseTaskWorkbenchPlacementService.read(accountId, operationId)',
    "readback?.status === 'committed'",
  ])
  && includesAll(service, [
    'read: async (',
    ".eq('owner_id', ownerId)",
    ".eq('operation_id', operationId)",
    '.maybeSingle()',
  ])
  && dragCommit.includes('搬移結果尚未確認，請重新整理後再操作。'));

add('operation begin never resets a committed idempotency record',
  includesAll(service, ['ignoreDuplicates: true', "onConflict: 'owner_id,operation_id'", 'root_task_id: input.rootTaskId']));
add('RPC receives the root, exact task IDs, both ownership scopes, and full nodes',
  includesAll(service, [
    'p_root_task_id: input.rootTaskId',
    'p_source_workspace_id',
    'p_source_board_id',
    'p_target_workspace_id',
    'p_target_board_id',
    'p_nodes: nodes as unknown as Json',
  ]));

add('mobile and desktop boundary commits await the durable store action',
  (dragCommit.match(/await dependencies\.commitNodePlacementBatch\(/g) || []).length >= 5
  && includesAll(dragCommit, [
    "placementFailureToast(error, '搬移失敗，任務已保留在原位置。')",
    "placementFailureToast(error, '歸位失敗，任務已保留在未歸位。')",
    "return failed('placement-persistence-failed')",
  ]));
add('failed is a first-class task drag terminal result',
  taskTypes.includes("'committed' | 'no-op' | 'failed'")
  && taskTypes.includes("'committed' | 'cancelled' | 'no-op' | 'failed'"));

add('one compact pending indicator is shared by board and workbench surfaces',
  pendingIndicator.includes('data-task-placement-pending-indicator="true"')
  && [panel, card, checklist, column].every(source => source.includes('TaskPlacementPendingIndicator'))
  && [panel, card, checklist, column].every(source => source.includes('data-task-placement-pending')));

add('migration creates an owner-scoped operation ledger with RLS and explicit grants',
  includesAll(migration, [
    'create table if not exists public.task_workbench_placement_operations',
    'root_task_id text not null',
    'enable row level security',
    '(select auth.uid()) = owner_id',
    "and status = 'pending'",
    "and status = 'failed'",
    'grant select, insert on public.task_workbench_placement_operations to authenticated',
    'grant update (status, error_code, elapsed_ms)',
  ]));
add('RPC is hardened with auth, empty search path, revokes, and immutable operation payload checks',
  includesAll(migration, [
    'security definer',
    "set search_path = ''",
    'v_user_id uuid := (select auth.uid())',
    'v_operation.status = \'committed\'',
    'source_workspace_id is distinct from p_source_workspace_id',
    'target_board_id is distinct from p_target_board_id',
    'revoke all on function public.move_task_workbench_subtree',
  ]));
add('server move authorization matches the configurable client capability matrix',
  includesAll(migration, [
    'create or replace function private.current_user_can_move_project_task',
    "'move_task' = any(permission.capabilities)",
    "effective.role in ('admin', 'project_manager', 'member')",
    'private.current_user_can_move_project_task(v_source_tenant_id, v_source_project_id)',
    'private.current_user_can_move_project_task(v_target_tenant_id, v_target_project_id)',
    'revoke all on function private.current_user_can_move_project_task',
  ])
  && !migration.includes('private.current_user_can_write_project(v_source_tenant_id, v_source_project_id)')
  && !migration.includes('private.current_user_can_write_project(v_target_tenant_id, v_target_project_id)'));
add('server proves the exact full subtree in both ownership directions',
  migration.includes('The requested tasks are not the complete source subtree.')
  && migration.includes('The requested tasks are not the complete unplaced subtree.')
  && (migration.match(/with recursive/g) || []).length >= 2);
add('board-to-unplaced payload is rebuilt from canonical WBS data instead of client content',
  includesAll(migration, [
    "'title', item.title",
    "'detailNotes', coalesce(item.detail_notes, '[]'::jsonb)",
    "'assigneeIds', to_jsonb(coalesce(item.assignee_ids, '{}'::uuid[]))",
    "from public.wbs_item_tags item_tag",
    "v_source_task := v_source_task || jsonb_build_object('parentId', null)",
    "'taskTitle', coalesce(v_source_task ->> 'title', '未命名任務')",
  ])
  && !migration.includes("v_node || jsonb_build_object(\n          'workspaceId'"));
add('server locks source rows and rejects lossy linked-record/dependency moves',
  (migration.match(/for update;/g) || []).length >= 3
  && includesAll(migration, [
    'Tasks linked to records cannot be moved to the global workbench yet.',
    'Tasks linked to quick memo inbox items cannot be moved to the global workbench yet.',
    'Tasks with dependencies cannot be moved to the global workbench yet.',
    'Target workspace is missing one or more assigned task members.',
  ]));
add('both direction branches require exact source deletion counts',
  (migration.match(/get diagnostics v_affected_count = row_count;/g) || []).length === 2
  && migration.includes('v_affected_count <> cardinality(v_item_ids)')
  && migration.includes('v_affected_count <> cardinality(v_node_ids)'));
add('operation mutation and activity evidence are in the same database function transaction',
  includesAll(migration, [
    'delete from public.wbs_items',
    'delete from public.task_workbench_unplaced_items',
    'perform public.log_activity_event(',
    "set status = 'committed'",
    "'operationId', p_operation_id",
  ]));

add('browser gate injects a mobile persistence failure and proves no move/no duplicate',
  includesAll(browser, [
    '__projedTaskPlacementTestFault = { delayMs: 700, failNext: true }',
    'data-mobile-drop-target-kind="workbench-unplaced-lane"',
    '任務已保留在原位置',
    'fault injection must retain every persisted subtree node on the source board',
    'failure must not create a local unplaced copy',
    'ancestorRecalculationCalls === 0',
  ]));

add('authoritative SPEC/QA/QC/CAPA package is registered and traceable',
  [spec, qa, qc, capa, devTask, documentationMap].every(source => source.includes('DEV-089'))
  && [spec, qa, qc, capa].every(source => source.includes('CAPA-20260825-01')));
add('documents preserve release and evidence boundaries',
  includesAll(spec, ['production migration', 'Level 3', 'Level 4'])
  && includesAll(qa, ['fault injection', 'exactly-one-source'])
  && includesAll(qc, ['未執行 production migration', '未 Release'])
  && includesAll(capa, ['Correction', 'Corrective Action', 'Preventive Action', 'Effectiveness Check']));

const failures = checks.filter(check => !check.pass);
console.log(JSON.stringify({
  ok: failures.length === 0,
  passed: checks.length - failures.length,
  total: checks.length,
  checks,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
