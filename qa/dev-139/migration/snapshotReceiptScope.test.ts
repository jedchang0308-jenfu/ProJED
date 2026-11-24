import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createDatabaseSnapshotReceipt } from '../../../scripts/dev139-data-migration.js';

test('successful plan, apply and reconciliation only attest their DB data', () => {
  for (const mode of ['plan', 'apply', 'reconcile']) {
    const data = { status: 'PASS', mode, matches: mode !== 'plan', snapshotId: 'a'.repeat(64), tables: { profiles: { count: 2 } } };
    const receipt = JSON.parse(JSON.stringify(createDatabaseSnapshotReceipt(data)));
    assert.deepEqual(receipt.tables, data.tables);
    assert.equal(receipt.snapshotId, data.snapshotId);
    assert.equal(receipt.matches, data.matches);
    assert.equal(receipt.evidenceScope, 'DATABASE_ONLY');
    assert.deepEqual(receipt.legacyStorage, { status: 'NOT_INVENTORIED' });
    assert.equal(receipt.newWriterAllowed, false);
    assert.deepEqual(receipt.sourceNormalization,
      { retiredBoardCapabilities: ['collect_task'], authority: 'ProJED DEV-104',
        ownerCapabilities: 'CURRENT_FIXED_OWNER_CONTRACT', missingBoardRoles: 'CURRENT_DEFAULTS_ONLY_WHEN_ABSENT', sourceRowsModified: false });
  }
});

test('a DB result cannot upgrade unexamined Storage to empty or authorize a writer', () => {
  const receipt = createDatabaseSnapshotReceipt({ status: 'PASS', matches: true,
    evidenceScope: 'FULL_CUTOVER', legacyStorage: { status: 'EMPTY', count: 0 }, newWriterAllowed: true });
  assert.equal(receipt.evidenceScope, 'DATABASE_ONLY');
  assert.deepEqual(receipt.legacyStorage, { status: 'NOT_INVENTORIED' });
  assert.equal(receipt.newWriterAllowed, false);
  assert.deepEqual(createDatabaseSnapshotReceipt({ status: 'BLOCKED', blockers: [{ domain: 'target:not_empty', count: 1 }] }).blockers,
    [{ domain: 'target:not_empty', count: 1 }]);
});

test('the real CLI failure receipt retains the same boundary before any connection', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/dev139-data-migration.ts', 'invalid-mode'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const receipt = JSON.parse(result.stderr.trim());
  assert.equal(receipt.status, 'FAIL');
  assert.equal(receipt.code, 'MODE_INVALID');
  assert.equal(receipt.evidenceScope, 'DATABASE_ONLY');
  assert.deepEqual(receipt.legacyStorage, { status: 'NOT_INVENTORIED' });
  assert.equal(receipt.newWriterAllowed, false);
});
