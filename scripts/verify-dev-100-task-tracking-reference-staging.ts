import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLocalTaskTrackingReferenceService, resetLocalTaskTrackingReferences } from '../src/features/taskTracking/localService';
import { primaryPlacementId } from '../src/features/taskTracking/model';
import type { TaskNode } from '../src/types';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const tasks: TaskNode[] = [
  {
    id: 'task-primary',
    workspaceId: 'workspace-1',
    boardId: 'board-a',
    parentId: null,
    title: 'Canonical task',
    status: 'todo',
    nodeType: 'task',
    order: 0,
  },
];

resetLocalTaskTrackingReferences();
const service = createLocalTaskTrackingReferenceService(() => tasks);
const created = await service.create('workspace-1', {
  operationId: 'dev100-create',
  sourcePlacementId: primaryPlacementId('task-primary'),
});

const staged = await service.stage('workspace-1', {
  operationId: 'dev100-stage',
  sourcePlacementId: created.id,
  expectedRevision: created.revision,
});

assert.equal(staged.referenceId, created.id, 'staging must preserve placement identity');
assert.equal(staged.taskId, 'task-primary');
assert.equal(staged.originalBoardId, 'board-a');
assert.equal((await service.listByWorkspace('workspace-1')).length, 0, 'staged reference must leave every Board projection');
assert.equal((await service.listStagedByWorkspace('workspace-1')).length, 1, 'staged reference must appear in account unplaced');
assert.equal(tasks[0].boardId, 'board-a', 'canonical task ownership must remain unchanged');

const placed = await service.placeStaged('workspace-1', {
  operationId: 'dev100-place',
  sourcePlacementId: created.id,
  expectedRevision: staged.revision,
  targetBoardId: 'board-b',
  targetParentPlacementId: null,
  position: 'append',
});

assert.equal(placed.id, created.id, 'placing must reactivate the same placement');
assert.equal(placed.boardId, 'board-b');
assert.equal((await service.listStagedByWorkspace('workspace-1')).length, 0);
assert.deepEqual((await service.listByWorkspace('workspace-1')).map(reference => reference.id), [created.id]);
assert.equal(tasks[0].boardId, 'board-a', 'cross-Board placement must not move the canonical task');

const dragCommit = read('src/components/Wbs/taskDrag/taskDragCommit.ts');
assert.match(dragCommit, /stageTrackingReference/);
assert.match(dragCommit, /placeStagedTrackingReference/);
assert.doesNotMatch(dragCommit, /reference-cannot-be-unplaced/);

const workbench = read('src/components/TaskWorkbenchPanel.tsx');
assert.match(workbench, /stagedTrackingReferences/);
assert.match(workbench, /trackingReference:\s*task\.trackingReferenceId/);

const migration = read('supabase/migrations/20260902052843_stage_task_tracking_references_in_workbench.sql');
assert.match(migration, /create table public\.task_tracking_reference_staging/);
assert.match(migration, /create or replace function public\.stage_task_tracking_reference_v1/);
assert.match(migration, /create or replace function public\.place_staged_task_tracking_reference_v1/);
assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
assert.match(migration, /alter table public\.task_tracking_reference_staging enable row level security/);

console.log('DEV-100 tracking reference staging: PASS (stage/same-id/place/canonical-invariant/UI+DB contracts)');
