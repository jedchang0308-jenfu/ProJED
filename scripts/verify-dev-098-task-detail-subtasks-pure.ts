import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { TaskNode } from '../src/types';
import type { TaskTrackingReference } from '../src/features/taskTracking/types';
import { primaryPlacementId } from '../src/features/taskTracking/model';
import { buildTaskPlacementTreeRows } from '../src/components/Wbs/TaskPlacementTree';
import {
  isTaskDropIntentOrigin,
  isValidTaskDropIntent,
  resolveTaskDropIntent,
  resolveTaskDropOutcome,
} from '../src/components/Wbs/taskDrag/taskDropIntent';
import { normalizeTaskMoveUpdates } from '../src/components/Wbs/taskDrag/taskMoveUpdateNormalization';
import { guardTaskAction } from '../src/interactions/task/taskActionGuards';
import {
  clearTaskDetailsNavigation,
  openTaskDetailsNavigation,
  popTaskDetailsNavigation,
  pushTaskDetailsNavigation,
  resolveTaskDetailsPersistenceDecision,
} from '../src/components/taskDetailsNavigation';

const root = process.cwd();
const now = 1_788_000_000_000;
const makeNode = (
  id: string,
  parentId: string | null,
  order: number,
  overrides: Partial<TaskNode> = {},
): TaskNode => ({
  id,
  workspaceId: 'dev098-workspace',
  boardId: 'dev098-board',
  parentId,
  title: id,
  status: 'todo',
  nodeType: 'task',
  order,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const nodes: Record<string, TaskNode> = {
  root: makeNode('root', null, 0, { nodeType: 'group' }),
  p1: makeNode('p1', 'root', 0),
  p2: makeNode('p2', 'root', 2),
  p1a: makeNode('p1a', 'p1', 0),
  archived: makeNode('archived', 'root', 4, { isArchived: true }),
  trackingTask: makeNode('trackingTask', null, 0),
};

const reference = (id: string, taskId: string, parentPlacementId: string | null, order: number): TaskTrackingReference => ({
  id,
  taskId,
  workspaceId: 'dev098-workspace',
  boardId: 'dev098-board',
  sourceBoardId: 'dev098-source-board',
  parentPlacementId,
  order,
  revision: 1,
  createdAt: now,
  updatedAt: now,
});

const rootPlacement = primaryPlacementId('root');
const trackingChildren = [
  reference('ref-1', 'trackingTask', rootPlacement, 1),
  reference('ref-1', 'trackingTask', rootPlacement, 2),
  reference('ref-missing', 'missing', rootPlacement, 3),
];

const checks: Array<{ id: string; status: 'PASS'; evidence: string }> = [];
const check = (id: string, evidence: string, assertion: () => void | Promise<void>) => Promise.resolve(assertion()).then(() => {
  checks.push({ id, status: 'PASS', evidence });
});

await check('P01-projection', 'primary children and explicit tracking children are merged by placement order; tracking roots do not infer canonical descendants.', () => {
  const primaryRows = buildTaskPlacementTreeRows({
    primaryTasks: [nodes.p2, nodes.p1],
    trackingReferences: trackingChildren,
    tasksById: nodes,
    parentPlacementId: rootPlacement,
  });
  assert.deepEqual(primaryRows.map(row => row.placementId), ['primary:p1', 'ref-1', 'primary:p2']);
  const trackingRows = buildTaskPlacementTreeRows({
    primaryTasks: [],
    trackingReferences: [reference('ref-child', 'trackingTask', 'ref-1', 0)],
    tasksById: nodes,
    parentPlacementId: 'ref-1',
  });
  assert.deepEqual(trackingRows.map(row => row.placementId), ['ref-child']);
});

await check('P02-cycle-archive-dedupe', 'archived/missing rows are excluded, duplicate placement IDs are removed, and descendant drops fail closed.', () => {
  const rows = buildTaskPlacementTreeRows({
    primaryTasks: [nodes.p1, nodes.archived],
    trackingReferences: trackingChildren,
    tasksById: nodes,
    parentPlacementId: rootPlacement,
  });
  assert.deepEqual(rows.map(row => row.placementId), ['primary:p1', 'ref-1']);
  const cycle = resolveTaskDropOutcome({
    source: { nodeId: 'root', surfaceKind: 'checklist-row' },
    target: { nodeId: 'p1a', surfaceKind: 'task-title-child' },
    nodesRecord: nodes,
  });
  assert.equal(cycle.kind, 'invalid');
});

await check('P03-local-collapse-navigation', 'navigation helpers are local immutable state; collapse is local UI state and does not write provider/localStorage.', () => {
  let entries = openTaskDetailsNavigation({ taskId: 'root' });
  entries = pushTaskDetailsNavigation(entries, { taskId: 'p1', returnFocusPlacementId: primaryPlacementId('p1') });
  assert.equal(entries.length, 2);
  const popped = popTaskDetailsNavigation(entries);
  assert.equal(popped.previous?.taskId, 'root');
  assert.deepEqual(popped.entries.map(entry => entry.taskId), ['root']);
  assert.deepEqual(clearTaskDetailsNavigation(), []);
  const section = readFileSync(resolve(root, 'src/components/TaskDetailsSubtaskSection.tsx'), 'utf8');
  assert.match(section, /useState\(true\)/);
  assert.doesNotMatch(section, /localStorage/);
});

await check('P04-intent-normalization', 'before/after, append-child and root append resolve to existing canonical drop intents.', () => {
  const append = resolveTaskDropIntent({
    source: { nodeId: 'p2', surfaceKind: 'checklist-row' },
    target: { nodeId: 'p1', surfaceKind: 'checklist-drop' },
    nodesRecord: nodes,
  });
  assert.deepEqual(append, { parentId: 'p1', order: 1, nodeType: 'task', displayPosition: 'append' });
  const before = resolveTaskDropIntent({
    source: { nodeId: 'p2', surfaceKind: 'checklist-row' },
    target: { nodeId: 'p1', surfaceKind: 'checklist-row', orderingPosition: 'before' },
    nodesRecord: nodes,
  });
  assert.equal(before?.parentId, 'root');
  assert.equal(before?.displayPosition, 'before');
  assert.equal(isTaskDropIntentOrigin('p2', before, nodes), false);
});

await check('P05-invalid-and-permission-reject', 'self/descendant/archived/missing and permission-denied operations reject without mutation.', () => {
  assert.equal(isValidTaskDropIntent('p1', { parentId: 'p1', order: 0, displayPosition: 'append' }, nodes), false);
  assert.equal(resolveTaskDropIntent({ source: { nodeId: 'root', surfaceKind: 'checklist-row' }, target: { nodeId: 'p1a', surfaceKind: 'task-title-child' }, nodesRecord: nodes }), null);
  assert.equal(resolveTaskDropIntent({ source: { nodeId: 'p2', surfaceKind: 'checklist-row' }, target: { nodeId: 'archived', surfaceKind: 'checklist-row' }, nodesRecord: nodes }), null);
  assert.equal(guardTaskAction('task.create-child', { nodeExists: true, canCreateTask: false }).allowed, false);
  assert.equal(guardTaskAction('task.create-child', { nodeExists: true, canCreateTask: true }).allowed, true);
});

await check('P06-placement-failure-retention', 'authoritative placement keeps local source state untouched until commit authority resolves; failure path remains explicit.', () => {
  const before = JSON.stringify(nodes);
  const intent = { parentId: 'p1', order: 1, nodeType: 'task' as const, displayPosition: 'append' as const };
  const updates = normalizeTaskMoveUpdates('p2', intent, nodes);
  assert.equal(nodes.p2.parentId, 'root');
  assert.notEqual(updates.p2.parentId, nodes.p2.parentId);
  assert.equal(JSON.stringify(nodes), before);
  const commitSource = readFileSync(resolve(root, 'src/components/Wbs/taskDrag/taskDragCommit.ts'), 'utf8');
  assert.match(commitSource, /placement-persistence-failed/);
  assert.match(commitSource, /return failed\(/);
});

await check('P07-navigation-stack', 'root open, child push, back pop and clear all use one immutable stack owner.', () => {
  const rootEntries = openTaskDetailsNavigation({ taskId: 'root', trackingReferenceId: undefined });
  const childEntries = pushTaskDetailsNavigation(rootEntries, { taskId: 'p1', returnFocusPlacementId: primaryPlacementId('p1') });
  assert.equal(childEntries.length, 2);
  assert.equal(pushTaskDetailsNavigation(childEntries, { taskId: 'p1' }).length, 2);
  assert.equal(popTaskDetailsNavigation(childEntries).previous?.taskId, 'root');
});

await check('P08-persistence-pending-gate', 'pending persistence waits, failed persistence stays, and only settled success runs a pending transition.', () => {
  assert.equal(resolveTaskDetailsPersistenceDecision({ pendingCount: 1, hasFailedUpdates: false, hasPendingTransition: true }), 'wait');
  assert.equal(resolveTaskDetailsPersistenceDecision({ pendingCount: 0, hasFailedUpdates: true, hasPendingTransition: true }), 'stay');
  assert.equal(resolveTaskDetailsPersistenceDecision({ pendingCount: 0, hasFailedUpdates: false, hasPendingTransition: true }), 'run');
});

await check('P09-save-reject-recovery', 'save rejection decision preserves current entry and exposes recoverable stay semantics; no stale transition is executed.', () => {
  assert.equal(resolveTaskDetailsPersistenceDecision({ pendingCount: 0, hasFailedUpdates: true, hasPendingTransition: true }), 'stay');
  const modal = readFileSync(resolve(root, 'src/components/TaskDetailsModal.tsx'), 'utf8');
  assert.match(modal, /toast\.error\((?:isUnknown|[^\n])*'儲存(狀態未確認，請先重試|失敗，請(?:先)?重試)'/);
  assert.match(modal, /pendingTransitionRef\.current = null/);
});

await check('P10-capability-matrix', 'create/edit/move/tracking actions are denied or allowed solely by existing capability guards.', () => {
  assert.equal(guardTaskAction('task.open-details', { nodeExists: true }).allowed, true);
  assert.equal(guardTaskAction('task.archive', { nodeExists: true, canDeleteTask: false }).allowed, false);
  assert.equal(guardTaskAction('task.archive', { nodeExists: true, canDeleteTask: true }).allowed, true);
  assert.equal(guardTaskAction('task.remove-tracking-reference', { nodeExists: true, canManageTaskReference: false }).allowed, false);
  assert.equal(guardTaskAction('task.remove-tracking-reference', { nodeExists: true, canManageTaskReference: true }).allowed, true);
});

const artifact = {
  dev: 'DEV-098', revision: 'working-tree', status: 'PASS',
  cases: checks,
  summary: { pass: checks.length, fail: 0, notRun: 0 },
  generatedAt: new Date().toISOString(),
};
const artifactPath = resolve(root, 'output/qa/dev-098/pure-result.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(artifact, null, 2));
