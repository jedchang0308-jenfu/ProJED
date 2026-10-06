import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const packageJson = JSON.parse(read('package.json'));
const command = read('src/features/taskWorkbench/taskPlacementCommand.ts');
const dropIntent = read('src/components/Wbs/taskDrag/taskDropIntent.ts');
const dragCommit = read('src/components/Wbs/taskDrag/taskDragCommit.ts');
const boardView = read('src/components/BoardView.tsx');
const store = read('src/store/useWbsStore.ts');
const transaction = read('src/features/taskWorkbench/placementTransaction.ts');
const service = read('src/services/supabase/taskWorkbenchUnplacedService.ts');
const databaseTypes = read('src/services/supabase/database.types.ts');
const v1Migration = read('supabase/migrations/20260825093621_dev_089_transactional_task_workbench_placement.sql');
const v2MigrationPath = 'supabase/migrations/20260826083940_dev_089_scope_safe_task_placement_command.sql';
const v2Migration = read(v2MigrationPath);
const property = read('scripts/verify-dev-089-placement-scope-isolation.ts');
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

add('package registers static, randomized isolation, and browser gates',
  packageJson.scripts?.['verify:dev-089-task-placement-transaction'] === 'node scripts/verify-dev-089-task-placement-transaction.mjs'
  && packageJson.scripts?.['verify:dev-089-placement-scope-isolation'] === 'tsx scripts/verify-dev-089-placement-scope-isolation.ts'
  && packageJson.scripts?.['verify:dev-089-task-placement-failure-browser']?.includes('verify-dev-089-task-placement-failure-browser.pw.js'));

add('command models board ownership separately from account-global unplaced ownership', includesAll(command, [
  "kind: 'account_unplaced'", "kind: 'board'", 'workspaceId: string', 'boardId: string',
  'getTaskOwnershipKey', 'getPlacementScopeKey', 'account_unplaced',
]));
add('command derives the exact ownership-bounded root-first subtree', includesAll(command, [
  'getTaskSubtreeIds', 'taskBelongsToOwnership(node, sourceOwnership)', 'children.sort',
  'actualSubtreeIds.some((id, index)', 'expectedSubtreeIds: getTaskSubtreeIds',
]));
add('command validates destination scope and projects canonical dense siblings', includesAll(command, [
  'Task placement target parent is outside the destination ownership.',
  'Task placement anchor is outside the destination scope.', 'getDestinationInsertionIndex',
  'sourceSiblings.forEach((node, order)', 'destinationOrder.forEach((node, order)',
]));
add('undo restore uses sorted canonical position rather than an order-valued array index', includesAll(command, [
  'const originalScopeOrder = sortScopeNodes', 'const originalIndex = originalScopeOrder.findIndex',
]) && !command.includes('Math.min(root.order'));

add('drop indexing is ownership plus parent, never parent-only root', includesAll(dropIntent, [
  'getPlacementScopeKey(getTaskPlacementScope(node))',
  'getPlacementScopeKey(getTaskPlacementScope(draggedNode))', 'taskOwnershipEquals(',
]) && !dropIntent.includes("node.parentId || 'root'"));
add('cross-ownership drop cannot be classified as origin and may append below a board task', includesAll(dropIntent, [
  "getTaskOwnershipRef(draggedNode).kind !== 'account_unplaced'", '!taskOwnershipEquals(',
  "return { kind: 'move', intent }",
]));

add('desktop and mobile share the same command owners for both directions', includesAll(dragCommit, [
  'const commitTaskSubtreeToUnplaced = async', 'const commitTaskSubtreeToBoard = async',
  "commitTaskSubtreeToUnplaced(draggedNode, state.nodes, dependencies, 'desktop')",
  "commitTaskSubtreeToUnplaced(draggedNode, state.nodes, dependencies, 'mobile')",
  "clientPlatform: 'desktop'", "clientPlatform: 'mobile'",
  'await dependencies.commitTaskPlacementCommand(command',
]) && boardView.includes('commitTaskPlacementCommand'));
add('same-board reorder stays local while ownership crossing uses v2 command', includesAll(dragCommit, [
  'normalizeTaskMoveUpdates', 'dependencies.batchUpdateNodes(updates',
  'buildMoveTaskSubtreeCommand', 'placement-persistence-failed',
]));

const persistIndex = store.indexOf('await persistTaskWorkbenchPlacementCommand({');
const localCommitIndex = store.indexOf('get().updateNode(canonical.id, canonical, { skipPersistence: true, skipActivity: true });');
add('store applies local state only after awaited authoritative persistence',
  persistIndex >= 0 && localCommitIndex > persistIndex, { persistIndex, localCommitIndex });
add('store validates canonical subtree identity and protects pending nodes from realtime replacement', includesAll(store, [
  'pendingPlacementNodeIds: Record<string, string>',
  'result.movedTaskIds.length !== command.expectedSubtreeIds.length',
  'Canonical task placement result is missing moved task',
  'pendingOperationId !== command.operationId',
]));
add('undo and redo create new operation ids through the durable command path',
  (store.match(/get\(\)\.commitTaskPlacementCommand\(/g) || []).length >= 2
  && includesAll(store, ['buildRestoreDestination', 'withNewTaskPlacementOperation(reverseTemplate)', 'withNewTaskPlacementOperation(command)']));

add('transaction fallback projects the same command and compensates partial persistence', includesAll(transaction, [
  'projectMoveTaskSubtreeCommand(command, nodesRecord)', 'persistFallbackSiblingPatches',
  'restoreFallbackSiblingPatches', "if (direction === 'to_board')", '.catch(() => undefined)',
]));
add('fault injection is test-only and occurs before backend mutation',
  transaction.includes("if (import.meta.env.MODE !== 'test'")
  && transaction.indexOf('await applyPlacementTestFault();') < transaction.indexOf('if (!isSupabaseBackend)'));
add('remote ambiguity retries the same command then resolves through the owner-scoped ledger',
  (transaction.match(/supabaseTaskWorkbenchPlacementService\.commit\(command\)/g) || []).length === 2
  && includesAll(transaction, ['isRetryablePlacementError', 'TaskPlacementOutcomeUnknownError',
    'supabaseTaskWorkbenchPlacementService.read(accountId, command.operationId)', "readback?.status === 'committed'"]));

const serviceCommit = service.slice(service.indexOf('commit: async'), service.indexOf('parseResult:'));
add('Supabase service sends intent/exact IDs to v2 RPC, never client sibling patches', includesAll(serviceCommit, [
  "rpc('move_task_workbench_subtree_v2'", 'p_expected_subtree_ids: command.expectedSubtreeIds',
  'p_source_kind: command.source.kind', 'p_target_kind: command.destination.ownership.kind',
  'p_target_parent_task_id: command.destination.parentId',
  'p_anchor_task_id: command.destination.anchorTaskId', 'p_position: command.destination.position',
]) && !serviceCommit.includes('p_nodes'));
add('operation begin is immutable/idempotent and readback owner-scoped', includesAll(service, [
  'command_version: command.commandVersion', 'ignoreDuplicates: true',
  "onConflict: 'owner_id,operation_id'", ".eq('owner_id', ownerId)", ".eq('operation_id', operationId)",
]));
add('database types expose v2 ledger and RPC contract', includesAll(databaseTypes, [
  'command_version: number', "source_kind: 'board' | 'account_unplaced' | null",
  "target_kind: 'board' | 'account_unplaced' | null",
  'move_task_workbench_subtree_v2', 'p_expected_subtree_ids: Json',
]));

add('v2 is forward-only and preserves the content-safe v1 mover', includesAll(v2Migration, [
  'alter table public.task_workbench_placement_operations',
  'add column if not exists command_version', 'private.move_task_workbench_subtree_impl(',
]) && includesAll(v1Migration, [
  "'detailNotes', coalesce(item.detail_notes, '[]'::jsonb)",
  'perform public.log_activity_event(', "set status = 'committed'",
]));
add('v2 derives source scope server-side and proves the exact complete subtree', includesAll(v2Migration, [
  "select nullif(item.task ->> 'parentId', '')",
  'The requested tasks are not the complete unplaced subtree.',
  'The requested tasks are not the complete board subtree.',
  'Expected subtree ids must list each parent before its children.',
]) && (v2Migration.match(/with recursive/g) || []).length >= 2);
add('v2 locks source and destination scopes in deterministic order', includesAll(v2Migration, [
  'v_first_scope_key := least(v_source_scope_key, v_target_scope_key)',
  'v_second_scope_key := greatest(v_source_scope_key, v_target_scope_key)',
  'pg_catalog.pg_advisory_xact_lock', 'for update;',
]) && (v2Migration.match(/for update;/g) || []).length >= 5);
add('v2 validates anchor scope and server-computes dense canonical order', includesAll(v2Migration, [
  'Task placement anchor is outside the destination scope.',
  'row_number() over (order by item.sort_order, item.updated_at, item.id) - 1 as new_order',
  "when 'before' then", "when 'after' then", "'canonicalNodes', v_canonical_nodes",
  "'affectedScopes', v_affected_scopes",
]));
add('v2 enforces exactly-one-source and complete canonical moved-task postconditions', includesAll(v2Migration, [
  'Committed placement left one or more moved tasks in the unplaced source.',
  'Committed placement left one or more moved tasks on the source board.',
  'Canonical task placement result is missing one or more moved tasks.',
  'Canonical task placement result does not match the target board scope.',
  'Canonical task placement result does not match the account-unplaced scope.',
]));
add('v2 functions use auth, empty search path, and explicit grants', includesAll(v2Migration, [
  'v_user_id uuid := (select auth.uid())', "set search_path = ''", 'security definer', 'security invoker',
  'revoke all on function private.move_task_workbench_subtree_v2_impl',
  'revoke all on function public.move_task_workbench_subtree_v2', 'to authenticated, service_role',
]));

add('randomized property covers both directions, scope collision, exact subtree, and sparse undo order', includesAll(property, [
  'for (let iteration = 0; iteration < 1_000', 'assertUnaffectedNodesUnchanged', 'assertDenseScope',
  'account-global unplaced scope must not split by provenance workspace',
  'cross-ownership drop must never be misclassified as origin', 'sparse order value as an array index',
]));
add('failure browser gate proves mobile source retention and no duplicate on rejection', includesAll(browser, [
  '__projedTaskPlacementTestFault = { delayMs: 700, failNext: true }',
  'data-mobile-drop-target-kind="workbench-unplaced-lane"', '任務已保留在原位置',
  'failure must not create a local unplaced copy',
]));

add('authoritative DEV/SPEC/QA/QC/CAPA package remains traceable',
  [spec, qa, qc, capa, devTask, documentationMap].every(source => source.includes('DEV-089'))
  && [spec, qa, qc, capa].every(source => source.includes('CAPA-20260825-01')));
add('documents name the actual v2 migration and preserve evidence boundaries',
  [spec, devTask, documentationMap].every(source => source.includes(v2MigrationPath.split('/').at(-1)))
  && includesAll(spec, ['production migration', 'Level 3', 'Level 4'])
  && includesAll(qa, ['exactly-one-source', 'randomized isolation property'])
  && includesAll(qc, ['production現況仍為已知 FAIL', '禁止 release'])
  && includesAll(capa, ['Correction／CA／PA', 'Preventive gate 與 effectiveness plan', 'CAPA 仍保持 open／stop-ship']));

const failures = checks.filter(check => !check.pass);
console.log(JSON.stringify({ ok: failures.length === 0, passed: checks.length - failures.length, total: checks.length, checks }, null, 2));
if (failures.length > 0) process.exitCode = 1;
