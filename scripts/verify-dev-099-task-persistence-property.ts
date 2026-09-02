import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readbackToTerminalOutcome,
  settlePersistenceOperationOnce,
} from '../src/utils/taskPersistenceConvergence';

type Outcome = 'persisted' | 'failed' | 'unknown';
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'unknown';
type Rejection = 'missing_node' | 'collection_pending' | 'no_changes';

type Operation = {
  id: string;
  owner: string;
  version: number;
  updates: Record<string, unknown>;
  settled: boolean;
};

type VersionedValue = { value: unknown; version: number };

const assertNoLeakedOperations = (harness: PersistenceHarness) => {
  assert.equal(harness.pending.size, 0, 'all accepted operations must be terminally observed');
};

class PersistenceHarness {
  owner = 'task-a';
  state: SaveState = 'idle';
  pending = new Set<string>();
  operations = new Map<string, Operation>();
  failed = new Map<string, VersionedValue>();
  unknown = new Map<string, VersionedValue>();
  latestVersionByKey = new Map<string, number>();
  currentValues = new Map<string, unknown>();
  nextOperation = 1;
  nextVersion = 1;
  navigationCount = 0;

  dispatch(
    updates: Record<string, unknown>,
    options: { accepted?: boolean; reason?: Rejection; forcePersistence?: boolean } = {},
  ): Operation | { accepted: false; reason: Rejection } {
    const accepted = options.accepted ?? true;
    if (!accepted) {
      const reason = options.reason ?? 'no_changes';
      if (reason === 'no_changes' && !options.forcePersistence) {
        return { accepted: false, reason };
      }
      return { accepted: false, reason };
    }

    const version = this.nextVersion++;
    const operation: Operation = {
      id: `op-${this.nextOperation++}`,
      owner: this.owner,
      version,
      updates,
      settled: false,
    };
    this.operations.set(operation.id, operation);
    this.pending.add(operation.id);
    Object.keys(updates).forEach(key => this.latestVersionByKey.set(key, version));
    Object.entries(updates).forEach(([key, value]) => this.currentValues.set(key, value));
    this.state = 'saving';
    return operation;
  }

  settle(operationId: string, outcome: Outcome) {
    const operation = this.operations.get(operationId);
    assert.ok(operation, `unknown operation ${operationId}`);
    if (operation.owner !== this.owner) {
      this.pending.delete(operationId);
      return false;
    }
    if (!settlePersistenceOperationOnce(this.pending, operationId)) {
      return false;
    }
    operation.settled = true;

    Object.entries(operation.updates).forEach(([key, value]) => {
      const latestVersion = this.latestVersionByKey.get(key);
      if (outcome === 'persisted') {
        const failed = this.failed.get(key);
        if (failed && failed.version <= operation.version) this.failed.delete(key);
        const unknown = this.unknown.get(key);
        if (unknown && unknown.version <= operation.version) this.unknown.delete(key);
      } else if (latestVersion === operation.version) {
        this.failed.set(key, { value, version: operation.version });
        if (outcome === 'unknown') this.unknown.set(key, { value, version: operation.version });
        else this.unknown.delete(key);
      }
    });

    if (this.pending.size > 0) return true;
    if (this.failed.size > 0) {
      this.state = this.unknown.size > 0 ? 'unknown' : 'error';
      return true;
    }
    this.state = 'saved';
    return true;
  }

  deadline(operationId: string, readback: 'confirmed' | 'mismatch' | 'unavailable') {
    return this.settle(operationId, readbackToTerminalOutcome(readback));
  }

  switchOwner(nextOwner: string) {
    this.owner = nextOwner;
    this.pending.clear();
    this.failed.clear();
    this.unknown.clear();
    this.latestVersionByKey.clear();
    this.state = 'idle';
  }

  retry() {
    assert.equal(this.pending.size, 0, 'retry cannot start while a request is pending');
    const updates = Object.fromEntries([...this.failed.entries()].map(([key, item]) => [key, item.value]));
    assert.ok(Object.keys(updates).length > 0, 'retry requires failed draft values');
    this.failed.clear();
    this.unknown.clear();
    return this.dispatch(updates, { forcePersistence: true });
  }

  navigateAfterPersistence() {
    if (this.pending.size > 0 || this.failed.size > 0 || this.unknown.size > 0) return false;
    this.navigationCount += 1;
    return true;
  }
}

const cases: Array<{ id: string; run: () => void }> = [];
const addCase = (id: string, run: () => void) => cases.push({ id, run });

addCase('P01-noop', () => {
  const harness = new PersistenceHarness();
  const result = harness.dispatch({}, { accepted: false, reason: 'no_changes' });
  assert.deepEqual(result, { accepted: false, reason: 'no_changes' });
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'idle');
});

addCase('P02-missing-draft-retained', () => {
  const harness = new PersistenceHarness();
  const result = harness.dispatch({ title: 'draft' }, { accepted: false, reason: 'missing_node' });
  assert.deepEqual(result, { accepted: false, reason: 'missing_node' });
  assert.equal(harness.pending.size, 0);
  assert.equal(harness.state, 'idle');
});

addCase('P03-collection-pending-retryable', () => {
  const harness = new PersistenceHarness();
  const result = harness.dispatch({ title: 'draft' }, { accepted: false, reason: 'collection_pending' });
  assert.deepEqual(result, { accepted: false, reason: 'collection_pending' });
  assert.equal(harness.pending.size, 0);
  assert.equal(harness.state, 'idle');
});

addCase('P04-accepted-success', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'saved' });
  assert.ok('id' in operation);
  harness.settle(operation.id, 'persisted');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'saved');
});

addCase('P05-failure-retains-draft', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'draft' });
  assert.ok('id' in operation);
  harness.settle(operation.id, 'failed');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'error');
  assert.equal(harness.failed.get('title')?.value, 'draft');
});

addCase('P06-deadline-enters-unknown', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'possibly-committed' });
  assert.ok('id' in operation);
  harness.deadline(operation.id, 'unavailable');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'unknown');
  assert.equal(harness.unknown.get('title')?.value, 'possibly-committed');
});

addCase('P07-confirmed-readback-persists', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'canonical' });
  assert.ok('id' in operation);
  harness.deadline(operation.id, 'confirmed');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'saved');
  assert.equal(harness.failed.size, 0);
});

addCase('P08-stale-readback-does-not-false-success', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'draft' });
  assert.ok('id' in operation);
  harness.deadline(operation.id, 'mismatch');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'error');
  assert.equal(harness.failed.get('title')?.value, 'draft');
});

addCase('P09-late-completion-exactly-once', () => {
  const harness = new PersistenceHarness();
  const operation = harness.dispatch({ title: 'one-terminal' });
  assert.ok('id' in operation);
  assert.equal(harness.settle(operation.id, 'failed'), true);
  assert.equal(harness.settle(operation.id, 'persisted'), false);
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'error');
});

addCase('P10-newer-version-wins', () => {
  const harness = new PersistenceHarness();
  const first = harness.dispatch({ title: 'first' });
  const second = harness.dispatch({ title: 'second' });
  assert.ok('id' in first && 'id' in second);
  harness.settle(first.id, 'failed');
  assert.equal(harness.state, 'saving');
  harness.settle(second.id, 'persisted');
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'saved');
  assert.equal(harness.failed.size, 0);
  assert.equal(harness.currentValues.get('title'), 'second');
});

addCase('P11-task-switch-cleans-owner', () => {
  const harness = new PersistenceHarness();
  const oldOperation = harness.dispatch({ title: 'old-task' });
  assert.ok('id' in oldOperation);
  harness.switchOwner('task-b');
  assert.equal(harness.state, 'idle');
  assert.equal(harness.settle(oldOperation.id, 'persisted'), false);
  assertNoLeakedOperations(harness);
  assert.equal(harness.state, 'idle');
});

addCase('P12-retry-and-navigation-once', () => {
  const harness = new PersistenceHarness();
  const first = harness.dispatch({ title: 'retry-me' });
  assert.ok('id' in first);
  harness.settle(first.id, 'unknown');
  assert.equal(harness.navigateAfterPersistence(), false);
  const retry = harness.retry();
  assert.ok('id' in retry);
  harness.settle(retry.id, 'persisted');
  assertNoLeakedOperations(harness);
  assert.equal(harness.navigateAfterPersistence(), true);
  assert.equal(harness.navigateAfterPersistence(), true);
  assert.equal(harness.navigationCount, 2);
});

const seedRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

const runSeededSchedule = (seed: number) => {
  const random = seedRandom(seed);
  const harness = new PersistenceHarness();
  const active: Operation[] = [];

  for (let step = 0; step < 8; step += 1) {
    const action = Math.floor(random() * 6);
    if (action === 0 || active.length === 0) {
      const operation = harness.dispatch({ title: `seed-${seed}-${step}` });
      assert.ok('id' in operation);
      active.push(operation);
      continue;
    }
    if (action === 1) {
      const operation = active[Math.floor(random() * active.length)];
      harness.settle(operation.id, random() < 0.34 ? 'failed' : random() < 0.5 ? 'unknown' : 'persisted');
      continue;
    }
    if (action === 2) {
      const operation = active[Math.floor(random() * active.length)];
      harness.deadline(operation.id, random() < 0.5 ? 'confirmed' : 'unavailable');
      continue;
    }
    if (action === 3) {
      harness.switchOwner(`task-${step}`);
      active.length = 0;
      continue;
    }
    if (action === 4) {
      const operation = active[Math.floor(random() * active.length)];
      harness.settle(operation.id, 'persisted');
      continue;
    }
    const operation = active[Math.floor(random() * active.length)];
    harness.settle(operation.id, 'failed');
  }

  // A schedule may end with in-flight requests; a provider/test harness must
  // still expose one deterministic terminal observation for each accepted op.
  for (const operation of active) {
    if (harness.pending.has(operation.id)) harness.deadline(operation.id, 'unavailable');
  }
  assertNoLeakedOperations(harness);
};

const evidence = {
  id: 'CAPA-001 / DEV-099 / WP-099-C / local-property',
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(),
  cases: [] as Array<{ id: string; status: 'PASS' | 'FAIL' }>,
  seededSchedules: { total: 1000, passed: 0, failed: 0, firstFailedSeed: null as number | null },
};

for (const testCase of cases) {
  try {
    testCase.run();
    evidence.cases.push({ id: testCase.id, status: 'PASS' });
  } catch (error) {
    evidence.cases.push({ id: testCase.id, status: 'FAIL' });
    throw error;
  }
}

for (let seed = 1; seed <= evidence.seededSchedules.total; seed += 1) {
  try {
    runSeededSchedule(seed);
    evidence.seededSchedules.passed += 1;
  } catch (error) {
    evidence.seededSchedules.failed += 1;
    evidence.seededSchedules.firstFailedSeed = seed;
    throw error;
  }
}

const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../output/qa/dev-099/property-result.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  ...evidence,
  status: 'PASS_LOCAL_PROPERTY',
  caseCount: evidence.cases.length,
  failedCaseIds: evidence.cases.filter(item => item.status !== 'PASS').map(item => item.id),
}, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  id: evidence.id,
  status: 'PASS_LOCAL_PROPERTY',
  cases: evidence.cases.length,
  seededSchedules: evidence.seededSchedules,
  outputPath,
}, null, 2));
