import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_PERMISSION_ROWS } from '../../../src/components/boardPermissionRows';
import { BOARD_PERMISSION_CAPABILITIES, COLLABORATION_ROLES, createDefaultBoardRolePermissionMatrix,
  normalizeBoardRolePermissionMatrix } from '../../../src/types';

test('normal permissions settings expose each existing board capability exactly once', () => {
  const exposed = BOARD_PERMISSION_ROWS.map(row => row.capability);
  assert.deepEqual([...exposed].sort(), [...BOARD_PERMISSION_CAPABILITIES].sort());
  assert.equal(new Set(BOARD_PERMISSION_ROWS.map(row => row.label)).size, exposed.length);
});

test('all editable role defaults can be cleared through the exposed controls without restoring defaults', () => {
  for (const role of COLLABORATION_ROLES.filter(role => role !== 'owner')) {
    let matrix = createDefaultBoardRolePermissionMatrix();
    const owner = [...matrix.owner];
    for (const row of BOARD_PERMISSION_ROWS) {
      if (matrix[role].includes(row.capability)) matrix = normalizeBoardRolePermissionMatrix({
        ...matrix, [role]: matrix[role].filter(capability => capability !== row.capability),
      });
    }
    assert.deepEqual(matrix[role], [], role);
    assert.deepEqual(matrix.owner, owner);
    assert.deepEqual(normalizeBoardRolePermissionMatrix(JSON.parse(JSON.stringify(matrix)))[role], []);
  }
});
