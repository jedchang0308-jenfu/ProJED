import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSnapshotTaskRows } from '../../../scripts/dev139-data-migration.js';

test('parent IDs order a reversed tree across import batches without rewriting rows', () => {
  const canonical = Array.from({ length: 230 }, (_, index) => Object.freeze({ id: String(index),
    tenant_id: 'workspace', project_id: 'board', parent_id: index === 0 ? null : String(index - 1) }));
  const source = Object.freeze([...canonical].reverse());
  assert.deepEqual(orderSnapshotTaskRows(source), canonical);
  assert.equal(source[0], canonical[229]);
});

test('missing, cross-board and cyclic parent references fail instead of being detached or ignored', () => {
  const row = { id: 'child', tenant_id: 'workspace', project_id: 'board', parent_id: 'parent' };
  assert.throws(() => orderSnapshotTaskRows([row]), { code: 'SOURCE_TASK_PARENT_SCOPE_INVALID' });
  assert.throws(() => orderSnapshotTaskRows([row, { ...row, id: 'parent', parent_id: null, project_id: 'other-board' }]),
    { code: 'SOURCE_TASK_PARENT_SCOPE_INVALID' });
  assert.throws(() => orderSnapshotTaskRows([row, { ...row, id: 'parent', parent_id: 'child' }]), { code: 'SOURCE_TASK_TREE_INVALID' });
  assert.throws(() => orderSnapshotTaskRows([row, row]), { code: 'SOURCE_TASK_TREE_INVALID' });
});
