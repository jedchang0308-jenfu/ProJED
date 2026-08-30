import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createLocalTaskTrackingReferenceService,
  readLocalTaskTrackingReferences,
  resetLocalTaskTrackingReferences,
  writeLocalTaskTrackingReferences,
} from '../src/features/taskTracking/localService';
import {
  buildProjectionNodes,
  buildCollapsedProjectionTasks,
  buildExpandedProjectionTasks,
  buildTaskFilterNodesWithTrackingReferences,
  primaryPlacementId,
} from '../src/features/taskTracking/model';
import { TaskTrackingError } from '../src/features/taskTracking/errors';
import type { TaskNode } from '../src/types';
import { createDefaultTaskFilters, projectTaskFilterResults } from '../src/features/taskFilters';

const now = Date.now();
const qaOutputDirectory = resolve(process.cwd(), 'output/qa/dev-095');
mkdirSync(qaOutputDirectory, { recursive: true });
const tasks: TaskNode[] = [
  { id: 'task-a', workspaceId: 'ws', boardId: 'board-a', parentId: null, title: 'A', status: 'in_progress', nodeType: 'task', order: 0, createdAt: now, updatedAt: now },
  { id: 'task-c', workspaceId: 'ws', boardId: 'board-a', parentId: null, title: 'C', status: 'todo', nodeType: 'task', order: 1, createdAt: now, updatedAt: now },
  { id: 'task-b', workspaceId: 'ws', boardId: 'board-a', parentId: 'task-a', title: 'B', status: 'todo', nodeType: 'task', order: 0, createdAt: now, updatedAt: now },
];

const serviceTasks: TaskNode[] = [
  ...tasks,
  { id: 'task-target', workspaceId: 'ws', boardId: 'board-b', parentId: null, title: 'Target parent', status: 'todo', nodeType: 'group', order: 0, createdAt: now, updatedAt: now },
];

resetLocalTaskTrackingReferences();
const service = createLocalTaskTrackingReferenceService(() => serviceTasks);
const first = await service.create('ws', { sourcePlacementId: primaryPlacementId('task-a'), operationId: 'op-create' });
assert.equal(first.taskId, 'task-a');
assert.equal(first.boardId, 'board-a');
assert.equal(first.parentPlacementId, null);
assert.ok(first.order > 0 && first.order < 1, 'new reference starts directly after the source placement');
assert.equal((await service.create('ws', { sourcePlacementId: primaryPlacementId('task-a'), operationId: 'op-create' })).id, first.id, 'create must be idempotent');
await assert.rejects(() => service.create('ws', { sourcePlacementId: primaryPlacementId('task-b'), operationId: 'op-create' }), (error: unknown) => error instanceof TaskTrackingError && error.code === 'OPERATION_ID_CONFLICT');
await assert.rejects(() => service.create('ws', { sourcePlacementId: primaryPlacementId('task-a') }), (error: unknown) => error instanceof TaskTrackingError && error.code === 'DUPLICATE_REFERENCE');

const moved = await service.move('ws', {
  sourcePlacementId: first.id,
  targetBoardId: 'board-b',
  targetParentPlacementId: null,
  position: 'append',
  expectedRevision: first.revision,
});
assert.equal(moved?.boardId, 'board-b');
await assert.rejects(() => service.move('ws', {
  sourcePlacementId: first.id,
  targetBoardId: 'board-b',
  targetParentPlacementId: first.id,
  expectedRevision: moved?.revision,
}), (error: unknown) => error instanceof TaskTrackingError && error.code === 'CYCLE_DETECTED');

// A primary placement is a valid target parent/anchor even though it is not
// persisted in the local reference array.  This mirrors the Supabase RPC's
// `primary:<taskId>` resolver and protects List/Mind Map before/after drops.
const taskCReference = await service.create('ws', {
  sourcePlacementId: primaryPlacementId('task-c'),
  operationId: 'op-create-c',
});
const anchored = await service.move('ws', {
  sourcePlacementId: taskCReference.id,
  targetBoardId: 'board-b',
  targetParentPlacementId: null,
  anchorPlacementId: primaryPlacementId('task-target'),
  position: 'after',
  expectedRevision: taskCReference.revision,
});
assert.equal(anchored.parentPlacementId, null);
assert.ok(anchored.order > serviceTasks.find(task => task.id === 'task-target')!.order, 'primary anchor must determine after-order');
await assert.rejects(() => service.move('ws', {
  sourcePlacementId: anchored.id,
  targetBoardId: 'board-b',
  targetParentPlacementId: null,
  anchorPlacementId: 'primary:task-a',
  position: 'after',
  expectedRevision: anchored.revision,
}), (error: unknown) => error instanceof TaskTrackingError && error.code === 'INVALID_PARENT');
await assert.rejects(() => service.move('ws', {
  sourcePlacementId: moved.id,
  targetBoardId: 'board-a',
  targetParentPlacementId: primaryPlacementId('task-b'),
  position: 'append',
  expectedRevision: moved.revision,
}), (error: unknown) => error instanceof TaskTrackingError && error.code === 'CYCLE_DETECTED');

const projection = buildProjectionNodes(tasks, [moved!], 'board-b', { canEditCanonicalTask: false, canManageReferenceHere: true });
const taskAProjection = projection.filter(item => item.taskId === 'task-a');
assert.equal(taskAProjection.length, 1);
assert.equal(taskAProjection[0].taskId, 'task-a');
assert.equal(taskAProjection[0].placementKind, 'tracking_reference');
assert.notEqual(taskAProjection[0].placementId, taskAProjection[0].taskId, 'projection identity must be placement-scoped');
const hydratedCanonicalTasks = await service.listCanonicalTasksByIds?.('ws', ['task-a']);
assert.equal(hydratedCanonicalTasks?.[0]?.id, 'task-a', 'provider hydration must return canonical task payload by taskId');

const filterNodes = buildTaskFilterNodesWithTrackingReferences(tasks, [moved!], 'board-b');
assert.equal(filterNodes['task-a']?.boardId, 'board-b', 'cross-board filter projection must be board-local');
assert.equal(filterNodes['task-a']?.parentId, null, 'root reference filter projection must stay root-local');
assert.equal(tasks.find(task => task.id === 'task-a')?.boardId, 'board-a', 'filter projection must not mutate canonical task');
const collapsed = buildCollapsedProjectionTasks(tasks, [moved!], 'board-b');
const collapsedTaskA = collapsed.find(task => task.id === 'task-a');
assert.equal(collapsedTaskA?.trackingReferenceId, moved?.id, 'timeline projection must carry placement identity');
assert.equal(collapsedTaskA?.isTrackingReference, true, 'timeline projection must mark tracking references');
assert.equal(collapsedTaskA?.trackingReferenceParentPlacementId, null, 'timeline projection must preserve reference parent placement');
assert.equal(tasks.find(task => task.id === 'task-a')?.isTrackingReference, undefined, 'projection marker must not mutate canonical task');

const secondPlacement: typeof moved = {
  ...moved!,
  id: 'tracking-second-placement',
  parentPlacementId: moved!.id,
  order: moved!.order + 1,
  revision: 1,
};
const expanded = buildExpandedProjectionTasks(tasks, [moved!, secondPlacement], 'board-b');
const expandedReferences = expanded.filter(task => task.isTrackingReference);
assert.equal(expandedReferences.length, 2, 'placement surfaces must preserve multiple reference placements');
assert.deepEqual(new Set(expandedReferences.map(task => task.id)), new Set([moved!.id, secondPlacement.id]));
assert.deepEqual(new Set(expandedReferences.map(task => task.canonicalTaskId)), new Set(['task-a']));
const expandedFilter = projectTaskFilterResults(
  Object.fromEntries(expanded.map(task => [task.id, task])),
  createDefaultTaskFilters(),
  { boardId: 'board-b' },
);
assert.equal(expandedFilter.totalTaskCount, 1, 'expanded placements must not inflate canonical task count');
assert.equal(expandedFilter.matchedTaskIds.size, 1, 'expanded placements must not inflate canonical match count');
assert.equal(expandedFilter.visibleTaskIds.size, 2, 'expanded placements must remain independently visible');
const descendantReference = {
  ...moved!,
  id: 'tracking-descendant-placement',
  taskId: 'task-b',
  parentPlacementId: moved!.id,
  order: moved!.order + 2,
  revision: 1,
};
const archivedSourceTasks = tasks.map(task => task.id === 'task-a' ? { ...task, isArchived: true } : task);
const archivedProjection = buildExpandedProjectionTasks(
  archivedSourceTasks,
  [moved!, descendantReference],
  'board-b',
);
assert.equal(archivedProjection.filter(task => task.isTrackingReference).length, 0, 'archived canonical ancestors must hide every external reference descendant');

writeLocalTaskTrackingReferences([
  moved!,
  {
    id: 'tracking-child',
    taskId: 'task-b',
    workspaceId: 'ws',
    boardId: 'board-b',
    sourceBoardId: 'board-a',
    parentPlacementId: moved!.id,
    order: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  },
]);
await service.remove('ws', { sourcePlacementId: first.id, expectedRevision: moved?.revision, operationId: 'op-remove' });
await service.remove('ws', { sourcePlacementId: first.id, expectedRevision: moved?.revision, operationId: 'op-remove' });
assert.equal((await service.listByWorkspace('ws')).length, 0);
const restored = await service.restore('ws', { sourcePlacementId: first.id });
assert.equal(restored?.removedAt, undefined);
assert.equal(readLocalTaskTrackingReferences().filter(reference => !reference.removedAt).length, 2, 'restore must recover the complete tracking subtree');
const second = await service.create('ws', { sourcePlacementId: primaryPlacementId('task-a') });
const allProjectedTaskIds = new Set([restored!.taskId, second.taskId]);
assert.equal(allProjectedTaskIds.size, 1, 'roll-up/count consumers must deduplicate by taskId');

writeFileSync(resolve(qaOutputDirectory, 'model-result.json'), JSON.stringify({
  dev: 'DEV-095', devId: 'DEV-095', sourceRevision: 'working-tree', environment: 'node-model', provider: 'local-test',
  status: 'passed', passed: true,
  checks: ['create', 'idempotency', 'duplicate', 'move', 'cycle', 'primary-anchor-resolution-and-scope', 'remove', 'restore', 'restore-subtree', 'projection', 'expanded-placement-projection', 'canonical-filter-dedupe', 'archived-ancestor-visibility', 'filter-projection-marker'],
  generatedAt: new Date().toISOString(),
}, null, 2));
console.log('DEV-095 task tracking reference model: PASS (create/idempotency/duplicate/move/cycle/remove/restore/projection)');

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260828100000_dev_095_task_tracking_references.sql'), 'utf8');
for (const marker of [
  'create table if not exists public.wbs_item_placements',
  'wbs_item_placements_one_active_primary',
  'wbs_item_placements_one_reference_per_scope',
  'current_user_can_read_task_via_placement',
  'current_user_has_project_capability',
  'task_tracking_request_hash',
  'get_board_task_projection_v1',
  'task_tracking_expected_subtree_matches',
  'sync_primary_placement_from_wbs_item',
  'touch_tracking_reference_revisions',
  'create_task_tracking_reference_v1',
  'move_task_tracking_reference_v1',
  'remove_task_tracking_reference_v1',
  'restore_task_tracking_reference_v1',
  'wbs_items_active_project_task',
  'revoke all on public.wbs_item_placements from authenticated',
  'revoke all on all functions in schema private from public, anon, authenticated, service_role',
  'grant execute on function private.current_user_can_read_task_via_placement(uuid) to authenticated',
  'TRACKING_REFERENCE_BLOCKS_UNPLACED',
]) assert.ok(migration.includes(marker), `migration marker missing: ${marker}`);
console.log('DEV-095 migration contract: PASS (expand/backfill/RLS/RPC markers)');
const backendSource = readFileSync(resolve(process.cwd(), 'src/services/dataBackend.ts'), 'utf8');
const packageSource = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
assert.match(backendSource, /Firebase 不支援追蹤副本/);
assert.match(backendSource, /unsupportedTaskTrackingReferenceService/);
const supabaseServiceSource = readFileSync(resolve(process.cwd(), 'src/services/supabase/taskTrackingReferenceService.ts'), 'utf8');
assert.match(supabaseServiceSource, /p_expected_revision:\s*input\.expectedRevision\s*\?\?\s*null/);
assert.match(supabaseServiceSource, /listCanonicalTasksByIds/);
assert.match(supabaseServiceSource, /\.in\('id', uuidIds\)/);
assert.match(supabaseServiceSource, /\.in\('legacy_node_id', legacyIds\)/);
assert.match(supabaseServiceSource, /boardIdByProjectId/);
assert.match(supabaseServiceSource, /boardIdByProjectId\.get\(item\.project_id\)/);
assert.match(migration, /current_user_can_write_canonical_task[\s\S]*?current_user_has_project_capability\([^;]*'edit_task'/);
const boardSource = readFileSync(resolve(process.cwd(), 'src/components/BoardView.tsx'), 'utf8');
assert.match(boardSource, /task-workbench-placed-board-lane/);
assert.match(boardSource, /isTrackingReference/);
const projectionConsumers = [
  ['src/components/Gantt/GanttTaskBar.tsx', /data-gantt-placement-kind[\s\S]*tracking-reference/, /border-dashed/],
  ['src/components/CalendarView.tsx', /data-calendar-placement-kind[\s\S]*tracking-reference/, /border-dashed/],
  ['src/components/SharedTaskSidebar.tsx', /data-task-placement-kind[\s\S]*tracking-reference/, /border-dashed/],
  ['src/components/MindMap/MindMapNode.tsx', /data-mindmap-placement-kind[\s\S]*tracking-reference/, /border-dashed/],
].map(([relativePath, marker, dashed]) => {
  const source = readFileSync(resolve(process.cwd(), relativePath as string), 'utf8');
  assert.match(source, marker as RegExp, `${relativePath} must expose a tracking-reference marker`);
  assert.match(source, dashed as RegExp, `${relativePath} must retain dashed visual distinction`);
  assert.match(source, /追蹤副本/, `${relativePath} must expose an accessible tracking-reference name`);
  return relativePath;
});
const mindMapSource = readFileSync(resolve(process.cwd(), 'src/components/MindMap/MindMapView.tsx'), 'utf8');
assert.match(mindMapSource, /dragged\.isTrackingReference[\s\S]*moveTrackingReference/);
assert.match(mindMapSource, /buildExpandedProjectionTasks/);
const filterProjectionSource = readFileSync(resolve(process.cwd(), 'src/features/taskFilters/resultProjection.ts'), 'utf8');
assert.match(filterProjectionSource, /canonicalTaskId/);
const trackingModelSource = readFileSync(resolve(process.cwd(), 'src/features/taskTracking/model.ts'), 'utf8');
assert.match(trackingModelSource, /isCanonicalTaskEffectivelyVisible/);
assert.match(trackingModelSource, /buildWorkbenchProjectionTasks/);
const sidebarSource = readFileSync(resolve(process.cwd(), 'src/components/SharedTaskSidebar.tsx'), 'utf8');
assert.match(sidebarSource, /activeItem\.isTrackingReference[\s\S]*moveTrackingReference/);
const contextMenuSource = readFileSync(resolve(process.cwd(), 'src/components/GlobalContextMenu.tsx'), 'utf8');
assert.match(contextMenuSource, /useTaskPlacementPermissions\(currentNode, currentTrackingReference\)/);
assert.match(contextMenuSource, /task\.remove-tracking-reference/);
assert.doesNotMatch(contextMenuSource, /trackingReferenceId[\s\S]{0,160}actionId === 'task\.open-details'/);
const interactionBindingSource = readFileSync(resolve(process.cwd(), 'src/interactions/task/useTaskInteractionBinding.ts'), 'utf8');
assert.match(interactionBindingSource, /trackingReferenceId/);
assert.match(interactionBindingSource, /taskPlacementContext:\s*placementContext/);
assert.match(interactionBindingSource, /selectAndOpenTaskDetails\(targetTaskId, trackingReferenceId\)/);
const detailsModalSource = readFileSync(resolve(process.cwd(), 'src/components/TaskDetailsModal.tsx'), 'utf8');
assert.match(detailsModalSource, /useTaskPlacementPermissions\(node, trackingReference\)/);
assert.doesNotMatch(detailsModalSource, /boardCanEditTask\s*&&\s*!trackingReferenceId/);
const wbsStoreSource = readFileSync(resolve(process.cwd(), 'src/store/useWbsStore.ts'), 'utf8');
assert.match(wbsStoreSource, /label:\s*'移除此處追蹤'[\s\S]*restoreTrackingReference[\s\S]*removeTrackingReference/);
assert.match(wbsStoreSource, /label:\s*'移動追蹤副本'[\s\S]*originalSibling[\s\S]*moveTrackingReference/);
assert.equal(existsSync(resolve(process.cwd(), 'src/components/Wbs/TrackingReferenceItem.tsx')), false, 'reference-only renderer must be removed');
const taskSurfaceFrameSource = readFileSync(resolve(process.cwd(), 'src/components/Wbs/TaskSurfaceFrame.tsx'), 'utf8');
assert.match(taskSurfaceFrameSource, /borderStyle:\s*'dashed'/);
assert.match(taskSurfaceFrameSource, /追蹤副本/);
const placementControllerSource = readFileSync(resolve(process.cwd(), 'src/components/Wbs/useTaskPlacementController.ts'), 'utf8');
assert.match(placementControllerSource, /useTaskInteractionBinding/);
assert.match(placementControllerSource, /useTaskGestureSurface/);
assert.match(placementControllerSource, /useSortable/);
const placementTreeSource = readFileSync(resolve(process.cwd(), 'src/components/Wbs/TaskPlacementTree.tsx'), 'utf8');
assert.match(placementTreeSource, /primaryTasks/);
assert.match(placementTreeSource, /trackingReferences/);
for (const relativePath of [
  'src/components/Wbs/WbsNodeItem.tsx',
  'src/components/Wbs/KanbanCard.tsx',
  'src/components/Wbs/KanbanChecklist.tsx',
  'src/components/Wbs/KanbanColumn.tsx',
]) {
  const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
  assert.match(source, /useTaskPlacementController/, `${relativePath} must use the shared placement interaction controller`);
  assert.match(source, /TaskSurfaceFrame/, `${relativePath} must use the shared primary/reference frame`);
}
for (const relativePath of ['src/components/Wbs/WbsListView.tsx', 'src/components/Wbs/KanbanChecklist.tsx', 'src/components/Wbs/KanbanColumn.tsx']) {
  assert.match(readFileSync(resolve(process.cwd(), relativePath), 'utf8'), /TaskPlacementTree/, `${relativePath} must use the shared recursive placement tree`);
}
const backupPackageSource = readFileSync(resolve(process.cwd(), 'src/features/backup/package.ts'), 'utf8');
assert.match(backupPackageSource, /OUT_OF_PACKAGE_REFERENCE[\s\S]*canonical 來源看板備份/);
assert.match(backupPackageSource, /sourceReferenceIdByTargetId/);
const backupVerifierSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-backup.ts'), 'utf8');
assert.match(backupVerifierSource, /v3 package preserves fractional and nested reference placement metadata/);
assert.match(backupVerifierSource, /v2 import remains primary-only/);
const performanceVerifierSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-db-performance.sql'), 'utf8');
assert.match(performanceVerifierSource, /EXPLAIN|explain/);
assert.match(performanceVerifierSource, /10000/);
assert.match(performanceVerifierSource, /25000|placements/);
const isolatedDbRunnerSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-db-isolated.ps1'), 'utf8');
assert.match(isolatedDbRunnerSource, /DB_STAGE=performance/);
assert.match(isolatedDbRunnerSource, /db-performance\.txt/);
const qcVerifierSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-qc.ts'), 'utf8');
assert.match(qcVerifierSource, /QC03-browser-semantic-cases/);
assert.match(qcVerifierSource, /QC05-database-security-performance-and-cleanup/);
const supabasePreflightSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-supabase-preflight.mjs'), 'utf8');
assert.match(supabasePreflightSource, /mutationsPerformed: false/);
assert.match(supabasePreflightSource, /get_task_tracking_reference_capability_v1/);
assert.match(supabasePreflightSource, /get_board_task_projection_v1/);
assert.match(packageSource, /verify:dev-095-task-tracking-references-supabase-preflight/);
const crossModeVerifierSource = readFileSync(resolve(process.cwd(), 'scripts/verify-dev-095-task-tracking-references-cross-mode.ts'), 'utf8');
for (const marker of ['I01-placement-hierarchy', 'I06-archive-ancestor-visibility', 'I09-filter-parity-and-dedupe', 'I12-recycle-canonical-only']) {
  assert.match(crossModeVerifierSource, new RegExp(marker));
}
console.log(`DEV-095 provider/UI boundary: PASS (Supabase/local-test only; Firebase explicit unsupported; workbench cross-board drop target wired; ${projectionConsumers.length} timeline/list consumers mark projections)`);
writeFileSync(resolve(qaOutputDirectory, 'static-result.json'), JSON.stringify({
  dev: 'DEV-095', devId: 'DEV-095', sourceRevision: 'working-tree', environment: 'source-contract', provider: 'supabase/local-test',
  status: 'passed', passed: true,
  checks: ['migration-contract', 'provider-boundary', 'workbench-cross-board-drop', 'gantt-marker', 'calendar-marker', 'shared-sidebar-marker', 'mindmap-marker', 'mindmap-expanded-placement-projection', 'canonical-filter-dedupe', 'archived-ancestor-visibility', 'remove-undo', 'move-undo', 'shared-placement-surface-controller-tree', 'backup-external-reference-guard', 'backup-readback-verifier', 'performance-explain-runner', 'qc-verifier-contract', 'cross-mode-verifier-contract', 'supabase-readonly-preflight-contract', 'derived-read-board-identity', 'tracking-projection-capability-context'],
  generatedAt: new Date().toISOString(),
}, null, 2));
