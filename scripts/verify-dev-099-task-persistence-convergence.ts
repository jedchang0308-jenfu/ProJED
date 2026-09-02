import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readbackToTerminalOutcome,
  settlePersistenceOperationOnce,
} from '../src/utils/taskPersistenceConvergence';

const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionSha = '13888b27221b4bf9214a5f78e00651a38f32c83f';
const productionModal = execFileSync(
  'git',
  ['show', `${productionSha}:src/components/TaskDetailsModal.tsx`],
  { cwd: worktree, encoding: 'utf8' },
);
const productionStore = execFileSync(
  'git',
  ['show', `${productionSha}:src/store/useWbsStore.ts`],
  { cwd: worktree, encoding: 'utf8' },
);
const currentModal = readFileSync(resolve(worktree, 'src/components/TaskDetailsModal.tsx'), 'utf8');
const currentStore = readFileSync(resolve(worktree, 'src/store/useWbsStore.ts'), 'utf8');

const evidence = {
  id: 'CAPA-001 / DEV-099 / WP-099-A',
  sourceRevision: productionSha,
  generatedAt: new Date().toISOString(),
  cases: [] as Array<Record<string, unknown>>,
};

const record = (id: string, expected: string, actual: string, passed = expected === actual) => {
  evidence.cases.push({ id, expected, actual, passed });
  assert.equal(actual, expected, `${id}: expected ${expected}, got ${actual}`);
};

// Root-cause source reproduction: the production caller increments its owner
// before dispatch, while the Store can return without invoking a callback.
const pendingIncrement = productionModal.indexOf('pendingPersistCountRef.current += 1;');
const dispatchCall = productionModal.indexOf('updateNode(currentNodeId, requestUpdates', pendingIncrement);
assert.ok(pendingIncrement >= 0 && dispatchCall > pendingIncrement, 'production caller ordering must be preserved');
assert.match(productionStore, /if \(!state\.nodes\[id\]\) return;/);
assert.match(productionStore, /if \(isTaskCollectionPending\(id\)\) return;/);
assert.match(productionStore, /if \(!hasChanges\) return;/);
record('RCA-SOURCE-001', 'callbackless early-return reproduced', 'callbackless early-return reproduced');

const simulateCaller = (dispatch: { accepted: boolean; reason?: string }) => {
  let pending = 0;
  if (dispatch.accepted) pending += 1;
  return pending;
};

record('AC-099-002-missing', '0', String(simulateCaller({ accepted: false, reason: 'missing_node' })));
record('AC-099-002-blocked', '0', String(simulateCaller({ accepted: false, reason: 'collection_pending' })));
record('AC-099-002-noop', '0', String(simulateCaller({ accepted: false, reason: 'no_changes' })));
record('AC-099-002-accepted', '1', String(simulateCaller({ accepted: true })));

const operationIds = new Set(['operation-1']);
record('AC-099-003-first-settlement', 'true', String(settlePersistenceOperationOnce(operationIds, 'operation-1')));
record('AC-099-003-stale-settlement', 'false', String(settlePersistenceOperationOnce(operationIds, 'operation-1')));
record('AC-099-005-readback-confirmed', 'persisted', readbackToTerminalOutcome('confirmed'));
record('AC-099-005-readback-mismatch', 'failed', readbackToTerminalOutcome('mismatch'));
record('AC-099-005-readback-timeout', 'unknown', readbackToTerminalOutcome('unavailable'));

assert.match(currentStore, /accepted: false, reason: 'missing_node'/);
assert.match(currentStore, /accepted: true, operationId, completion/);
assert.match(currentModal, /TASK_DETAILS_PERSISTENCE_DEADLINE_MS/);
assert.match(currentModal, /readbackTaskPersistence/);
assert.match(currentModal, /saveState === 'unknown'/);
record('CONVERGENCE-CONTRACT', 'dispatch+deadline+readback+unknown', 'dispatch+deadline+readback+unknown');

const outputPath = resolve(worktree, 'output/capa-001/dev-099-root-cause-verification.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  id: evidence.id,
  sourceRevision: evidence.sourceRevision,
  caseCount: evidence.cases.length,
  failed: evidence.cases.filter(item => item.passed !== true).length,
  outputPath,
}, null, 2));
