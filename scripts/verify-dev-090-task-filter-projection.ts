import assert from 'node:assert/strict';
import {
  createDefaultTaskFilters,
  projectTaskFilterResults,
  snapshotTaskFilterProjectionIdentities,
} from '../src/features/taskFilters/index';
import { resolveTaskFilterResultState } from '../src/components/ui/TaskFilterResultState';
import type { TaskNode } from '../src/types';

const results: Array<{ name: string; ok: boolean; details?: string }> = [];
const check = (name: string, run: () => void) => {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) });
  }
};

const node = (
  id: string,
  parentId: string | null,
  order: number,
  overrides: Partial<TaskNode> = {},
): TaskNode => ({
  id,
  workspaceId: 'workspace-1',
  boardId: 'board-1',
  parentId,
  title: id,
  status: 'todo',
  nodeType: parentId ? 'task' : 'group',
  order,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const fixtureEntries: Array<[string, TaskNode]> = [
  ['root', node('root', null, 0)],
  ['parent', node('parent', 'root', 0)],
  ['grandchild-match', node('grandchild-match', 'parent', 0, { assigneeId: 'target', status: 'in_progress' })],
  ['sibling', node('sibling', 'root', 1, { status: 'completed' })],
  ['archived-root', node('archived-root', null, 2, { isArchived: true })],
  ['archived-child', node('archived-child', 'archived-root', 0, { assigneeId: 'target' })],
  ['missing-parent', node('missing-parent', 'absent', 3, { assigneeId: 'target' })],
  ['cycle-a', node('cycle-a', 'cycle-b', 4, { assigneeId: 'target' })],
  ['cycle-b', node('cycle-b', 'cycle-a', 5)],
  ['other-board', node('other-board', null, 0, { boardId: 'board-2', assigneeId: 'target' })],
];
const nodes = Object.fromEntries(fixtureEntries);

check('S04 default projection matches every effectively visible board identity', () => {
  const projection = projectTaskFilterResults(nodes, createDefaultTaskFilters(), { boardId: 'board-1' });
  const snapshot = snapshotTaskFilterProjectionIdentities(projection, nodes);
  assert.deepEqual(snapshot.boardTaskIds, ['grandchild-match', 'parent', 'root', 'sibling']);
  assert.deepEqual(snapshot.matchedTaskIds, snapshot.boardTaskIds);
  assert.deepEqual(snapshot.contextOnlyContainerIds, []);
  assert.equal(projection.totalTaskCount, 4);
});

check('S04 matched descendant retains legal context ancestors without inflating match count', () => {
  const filters = { ...createDefaultTaskFilters(), selectedAssigneeIds: ['target'] };
  const projection = projectTaskFilterResults(nodes, filters, { boardId: 'board-1' });
  const snapshot = snapshotTaskFilterProjectionIdentities(projection, nodes);
  assert.deepEqual(snapshot.matchedTaskIds, ['grandchild-match']);
  assert.deepEqual(snapshot.visibleTaskIds, ['grandchild-match', 'parent', 'root']);
  assert.deepEqual(snapshot.contextOnlyContainerIds, ['parent', 'root']);
  assert.equal(projection.matchedTasks.length, 1);
  assert.equal(projection.totalTaskCount, 4);
});

check('S04 archived, orphan, cyclic and cross-board identities never leak into truth sets', () => {
  const projection = projectTaskFilterResults(nodes, createDefaultTaskFilters(), { boardId: 'board-1' });
  for (const invalidId of ['archived-root', 'archived-child', 'missing-parent', 'cycle-a', 'cycle-b', 'other-board']) {
    assert.equal(projection.boardTaskIds.has(invalidId), false, invalidId);
    assert.equal(projection.visibleTaskIds.has(invalidId), false, invalidId);
  }
});

check('S04 ordered identity snapshots are stable across object insertion order', () => {
  const reversed = Object.fromEntries([...fixtureEntries].reverse());
  const filters = { ...createDefaultTaskFilters(), selectedAssigneeIds: ['target'] };
  const first = projectTaskFilterResults(nodes, filters, { boardId: 'board-1' });
  const second = projectTaskFilterResults(reversed, filters, { boardId: 'board-1' });
  assert.deepEqual(
    snapshotTaskFilterProjectionIdentities(first, nodes),
    snapshotTaskFilterProjectionIdentities(second, reversed),
  );
});

check('S05 observable result state has one strict priority order', () => {
  assert.equal(resolveTaskFilterResultState({ loading: true, error: 'x', totalTaskCount: 0, matchedTaskCount: 0 }), 'loading');
  assert.equal(resolveTaskFilterResultState({ loading: false, error: 'x', totalTaskCount: 0, matchedTaskCount: 0 }), 'error');
  assert.equal(resolveTaskFilterResultState({ loading: false, error: null, totalTaskCount: 0, matchedTaskCount: 0 }), 'true-empty');
  assert.equal(resolveTaskFilterResultState({ loading: false, error: null, totalTaskCount: 4, matchedTaskCount: 0 }), 'filtered-zero');
  assert.equal(resolveTaskFilterResultState({ loading: false, error: null, totalTaskCount: 4, matchedTaskCount: 1 }), 'results');
});

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));
if (failed.length > 0) process.exit(1);
