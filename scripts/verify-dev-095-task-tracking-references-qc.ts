import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type JsonRecord = Record<string, any>;

const root = resolve(process.cwd());
const artifactPaths = {
  model: resolve(root, 'output/qa/dev-095/model-result.json'),
  source: resolve(root, 'output/qa/dev-095/static-result.json'),
  database: resolve(root, 'output/qa/dev-095/db-isolated-result.json'),
  backup: resolve(root, 'output/qa/dev-095/backup-result.json'),
  crossMode: resolve(root, 'output/qa/dev-095/cross-mode-result.json'),
  browser: resolve(root, 'output/playwright/dev-095/result.json'),
  dbLint: resolve(root, 'output/qa/dev-095/supabase-db-lint.json'),
  supabasePreflight: resolve(root, 'output/qa/dev-095/supabase-test-preflight.json'),
};

const readJson = (path: string): JsonRecord => {
  assert.ok(existsSync(path), `missing artifact: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as JsonRecord;
};

const model = readJson(artifactPaths.model);
const source = readJson(artifactPaths.source);
const database = readJson(artifactPaths.database);
const backup = readJson(artifactPaths.backup);
const crossMode = readJson(artifactPaths.crossMode);
const browser = readJson(artifactPaths.browser);
const dbLint = readJson(artifactPaths.dbLint);
const supabasePreflight = readJson(artifactPaths.supabasePreflight);
const checks: JsonRecord[] = [];

const check = (id: string, evidence: string, assertion: () => void) => {
  assertion();
  checks.push({ id, status: 'PASS', evidence });
};

check('QC01-artifacts-and-envelope', 'current DEV-095 implementation artifacts exist and identify DEV-095', () => {
  for (const artifact of [model, source, database, backup, crossMode, browser, dbLint]) {
    assert.equal(artifact.dev ?? artifact.devId, 'DEV-095');
    assert.equal(artifact.passed ?? artifact.status === 'passed', true);
  }
  assert.equal(browser.environment, 'local-test-browser');
  assert.equal(database.provider, 'postgresql-loopback');
  assert.equal(backup.provider, 'local-test');
});

check('QC02-model-source-contract', 'model and source verifier summaries plus required source checks', () => {
  assert.equal(model.status, 'passed');
  assert.equal(source.status, 'passed');
  assert.ok(Array.isArray(source.checks));
  for (const required of ['migration-contract', 'provider-boundary', 'remove-undo', 'move-undo', 'backup-readback-verifier', 'performance-explain-runner']) {
    assert.ok(source.checks.includes(required), `source check missing: ${required}`);
  }
});

check('QC03-browser-semantic-cases', 'browser cases B01-B16 and their semantic postconditions', () => {
  const cases = new Map<string, JsonRecord>((browser.cases ?? []).map((item: JsonRecord) => [item.id, item]));
  assert.equal(cases.size, 16);
  assert.ok([...cases.values()].every(item => item.status === 'PASS'));

  const b01 = cases.get('B01-create-and-dashed-projection')!;
  assert.equal(b01.actual.presentation.borderStyle, 'dashed');
  assert.equal(b01.actual.presentation.taskId, 'dev095-ui-task-a');
  assert.notEqual(b01.actual.presentation.placementId, b01.actual.presentation.taskId);
  assert.ok(b01.actual.placement.order > 0);

  const b02 = cases.get('B02-remove-reference')!;
  assert.equal(b02.actual.canonicalUnchanged, true);
  assert.ok(b02.actual.removedAt);
  const b07 = cases.get('B07-remove-undo-redo')!;
  assert.equal(b07.actual.activeAfterUndo, 1);
  assert.equal(b07.actual.activeAfterRedo, 0);
  assert.equal(b07.actual.canonicalUnchanged, true);

  const b03 = cases.get('B03-same-board-drag')!;
  const b04 = cases.get('B04-cross-board-workbench-root-drop')!;
  assert.equal(b03.actual.canonical.boardId, 'dev095-ui-board-a');
  assert.equal(b04.actual.canonicalBoardId, 'dev095-ui-board-a');
  assert.equal(b04.actual.targetBoardId, 'dev095-ui-board-b');

  const b08 = cases.get('B08-provider-failure-keeps-source')!;
  assert.equal(b08.actual.createGhost, false);
  assert.equal(b08.actual.moveSourceRetained, true);
  assert.equal(b08.actual.removeStillVisible, true);
  assert.ok(!/sql|internal id|tracking_/i.test(b08.actual.recoverableMessage));

  const b09 = cases.get('B09-mobile-long-press-reference')!;
  const b11 = cases.get('B11-mobile-320-reference-layout')!;
  assert.equal(b09.actual.style.borderStyle, 'dashed');
  assert.equal(b09.actual.canonicalUnchanged, true);
  assert.ok(b11.actual.layout.scrollWidth <= b11.actual.layout.viewportWidth);
  assert.ok(b11.actual.layout.bodyScrollWidth <= b11.actual.layout.viewportWidth);

  const b10 = cases.get('B10-cross-mode-projection-marker')!;
  assert.equal(b10.actual.modes.list.placementCount, 2);
  assert.equal(b10.actual.modes.mindmap.placementCount, 2);
  assert.equal(b10.actual.modes.gantt.placementCount, 1);
  assert.ok(b10.actual.modes.calendar.placementCount >= 1);
  for (const mode of ['list', 'mindmap', 'gantt', 'calendar']) {
    assert.equal(b10.actual.modes[mode].dashed, true);
    assert.ok(b10.actual.modes[mode].text.includes('追蹤副本'));
  }

  const b12 = cases.get('B12-keyboard-reference-dnd')!;
  assert.equal(b12.actual.activeKeyboard.ariaPressed, 'true');
  assert.equal(b12.actual.cancelUnchanged, true);
  const b13 = cases.get('B13-primary-reference-visual-parity')!;
  assert.equal(b13.actual.referenceBorder, 'dashed');
  assert.notEqual(b13.actual.primaryBorder, 'dashed');
  assert.equal(b13.actual.referenceContent, true);
  assert.equal(b13.actual.primaryContent, true);
  assert.equal(b13.actual.referenceTitle, b13.actual.primaryTitle);
  assert.equal(b13.actual.visibleReferenceBadge, false);
  assert.ok(!b13.actual.referenceInnerText.includes('同步自主要任務'));
  assert.equal(b13.actual.referenceRole, 'button');
  const b14 = cases.get('B14-live-message-and-focus-visible')!;
  assert.equal(b14.actual.focusVisible, true);
  assert.equal(b14.actual.liveRegions, 1);
  assert.ok(b14.actual.successCount <= 1);
  const b15 = cases.get('B15-nested-reference-subtree')!;
  assert.equal(b15.actual.style.borderStyle, 'dashed');
  assert.equal(b15.actual.style.parent, b15.actual.rootReferenceId);
  assert.equal(b15.actual.canonicalUnchanged, true);
  const b16 = cases.get('B16-readonly-reference-context-and-details')!;
  assert.deepEqual(b16.actual.actionIds, ['task.open-details']);
  assert.equal(b16.actual.details.readonly, 'true');
  assert.equal(b16.actual.details.titleInputs, 0);
  assert.equal(b16.actual.details.overflowTriggers, 0);
});

check('QC04-backup-readback', 'backup v3/v2 and external canonical-reference safety facts', () => {
  assert.equal(backup.status, 'passed');
  assert.deepEqual(backup.summary, { PASS: 4, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 });
  assert.equal(backup.checks.length, 4);
  assert.ok(backup.checks.some((item: string) => item.includes('fractional and nested')));
  assert.ok(backup.checks.some((item: string) => item.includes('v2 import remains primary-only')));
  assert.ok(backup.checks.some((item: string) => item.includes('fails closed')));
});

check('QC05-database-security-performance-and-cleanup', 'isolated PostgreSQL 15 checks, expanded RLS/grant matrix, four plan fixture and runtime cleanup', () => {
  assert.equal(database.status, 'passed');
  assert.deepEqual(database.summary, { PASS: 15, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 });
  for (const key of ['tenantIsolation', 'privateHelperBoundary', 'futureViewerReadRevoke', 'customCapabilityBoundary']) {
    assert.equal(database.checks[key], true);
  }
  assert.equal(database.performance.fixture.tasks, 10000);
  assert.equal(database.performance.fixture.placements, 25000);
  assert.equal(database.performance.placementSeqScan, false);
  assert.equal(database.performance.canonicalTaskSeqScan, false);
  assert.match(database.runtimeCleanup, /released=true/);
  assert.match(database.runtimeCleanup, /path_removed=true/);
  assert.deepEqual(database.performance.fixture.plans, ['projection', 'rpc-projection', 'visibility', 'last-reference-revoke']);
});

check('QC06-cross-mode-contract', 'I01-I12 local cross-mode projection/lifecycle contract artifact is passed without claiming remote TEST', () => {
  assert.equal(crossMode.status, 'passed');
  assert.equal(crossMode.environment, 'local-test-cross-mode-contract');
  assert.deepEqual(crossMode.summary, { PASS: 12, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 });
  assert.equal(crossMode.checks.length, 12);
  for (const id of ['I01-placement-hierarchy', 'I05-canonical-update-convergence', 'I09-filter-parity-and-dedupe', 'I12-recycle-canonical-only']) {
    assert.ok(crossMode.checks.some((item: JsonRecord) => item.id === id && item.status === 'PASS'));
  }
  assert.ok((crossMode.notCovered ?? []).some((item: string) => item.includes('Supabase TEST')));
});

check('QC07-no-production-claim', 'local artifacts remain bounded to local-test/loopback; Supabase TEST preflight is read-only and records missing remote schema without claiming TEST PASS', () => {
  assert.equal(browser.provider, 'local-test');
  assert.equal(database.provider, 'postgresql-loopback');
  assert.equal(supabasePreflight.provider, 'supabase');
  assert.equal(supabasePreflight.environment, 'supabase-test-readonly-preflight');
  assert.equal(supabasePreflight.mutationsPerformed, false);
  assert.equal(supabasePreflight.status, 'blocked');
  assert.equal(dbLint.environment, 'linked Supabase project read-only preflight');
  assert.equal(dbLint.remoteMutation, false);
  assert.ok((dbLint.results ?? []).every((item: JsonRecord) => (item.issues ?? []).every((issue: JsonRecord) => !String(issue.level).toLowerCase().includes('error'))));
  assert.ok((supabasePreflight.checks ?? []).some((item: JsonRecord) => item.id === 'T08-readiness-probe' && item.status === 'BLOCKED'));
  assert.equal(existsSync(resolve(root, 'output/qa/dev-095/supabase-test-result.json')), false);
});

const result = {
  dev: 'DEV-095',
  devId: 'DEV-095',
  sourceRevision: 'working-tree',
  environment: 'targeted-local-qc',
  provider: 'local-test/postgresql-loopback',
  status: 'passed',
  passed: true,
  checks,
  summary: { PASS: checks.length, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
  scope: 'Independent readback of existing local artifacts; no product or remote mutation.',
  generatedAt: new Date().toISOString(),
};

const outputPath = resolve(root, 'output/qa/dev-095/qc-result.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
for (const item of checks) console.log(`PASS ${item.id}: ${item.evidence}`);
console.log(`DEV-095 targeted local QC: ${checks.length} passed`);
