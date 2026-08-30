import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type JsonRecord = Record<string, any>;

const root = process.cwd();
const browserPath = resolve(root, 'output/playwright/dev-095/interaction-parity-result.json');
const sourcePath = resolve(root, 'output/qa/dev-095/interaction-parity-source-result.json');
const outputPath = resolve(root, 'output/qc/dev-095/interaction-parity-qc-result.json');
const readJson = (path: string): JsonRecord => {
  assert.ok(existsSync(path), `missing evidence artifact: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as JsonRecord;
};
const readSource = (path: string) => readFileSync(resolve(root, path), 'utf8');
const pngSize = (path: string) => {
  const file = readFileSync(path);
  assert.equal(file.subarray(1, 4).toString('ascii'), 'PNG', `${path} is not a PNG`);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
};

const browser = readJson(browserPath);
const source = readJson(sourcePath);
const cases = new Map<string, JsonRecord>((browser.cases ?? []).map((item: JsonRecord) => [item.id, item]));
const checks: Array<{ id: string; status: 'PASS'; evidence: string }> = [];
const check = (id: string, evidence: string, assertion: () => void) => {
  assertion();
  checks.push({ id, status: 'PASS', evidence });
};

const requiredCases = [
  'B17-click-details-focus-parity',
  'B18-context-action-capability-parity',
  'B19-desktop-pointer-dnd-parity',
  'B20-keyboard-mobile-dnd-parity',
  'B21-shared-surface-visual-parity',
  'B22-recursive-child-parity',
  'B23-subtree-transaction-and-recovery',
  'B24-capability-visible-error-and-convergence',
];

check('QC-IP01-current-evidence-envelope', 'current B17-B24 browser artifact and S07-S10 source artifact are complete and clean', () => {
  assert.equal(browser.devId, 'DEV-095');
  assert.equal(browser.environment, 'local-test-browser-interaction-parity');
  assert.equal(browser.provider, 'local-test');
  assert.equal(browser.status, 'passed');
  assert.deepEqual(browser.summary, { PASS: 8, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 });
  assert.deepEqual([...cases.keys()], requiredCases);
  assert.ok([...cases.values()].every(item => item.status === 'PASS' && item.failure === null));
  assert.deepEqual(browser.diagnostics, []);
  assert.equal(source.environment, 'source-interaction-parity');
  assert.deepEqual(source.summary, { PASS: 4, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 });
});

check('QC-IP02-one-surface-controller-and-tree', 'primary and tracking placements use one renderer/controller/tree; dashed styling is isolated to TaskSurfaceFrame', () => {
  assert.equal(existsSync(resolve(root, 'src/components/Wbs/TrackingReferenceItem.tsx')), false);
  const frame = readSource('src/components/Wbs/TaskSurfaceFrame.tsx');
  const controller = readSource('src/components/Wbs/useTaskPlacementController.ts');
  const tree = readSource('src/components/Wbs/TaskPlacementTree.tsx');
  assert.match(frame, /borderStyle:\s*'dashed'/);
  assert.match(frame, /reference\?: TaskTrackingReference/);
  assert.match(frame, /data-task-placement-kind=\{reference \? 'tracking-reference' : 'primary'\}/);
  assert.match(controller, /useSortable/);
  assert.match(controller, /useTaskInteractionBinding/);
  assert.match(controller, /useTaskGestureSurface/);
  assert.match(tree, /SortableContext items=\{rows\.map\(row => row\.placementId\)\}/);
  for (const path of [
    'src/components/Wbs/WbsNodeItem.tsx',
    'src/components/Wbs/KanbanCard.tsx',
    'src/components/Wbs/KanbanChecklist.tsx',
    'src/components/Wbs/KanbanColumn.tsx',
  ]) {
    const content = readSource(path);
    assert.match(content, /useTaskPlacementController/, `${path} does not use the shared placement controller`);
    assert.match(content, /TaskSurfaceFrame/, `${path} does not use the shared surface frame`);
    assert.doesNotMatch(content, /borderStyle:\s*'dashed'/, `${path} owns a duplicate tracking-only visual branch`);
    assert.doesNotMatch(content, /TrackingReference(?:Item|Card|Content|Subtree)/, `${path} contains a tracking-only renderer`);
  }
});

check('QC-IP03-details-focus-and-actions', 'click/double-click/Enter/Space share Task Details and focus return; actions differ only by legal placement capability', () => {
  const b17 = cases.get(requiredCases[0])!;
  assert.equal(b17.actual.interactions.length, 8);
  for (const kind of ['primary', 'tracking']) {
    const rows = b17.actual.interactions.filter((item: JsonRecord) => item.kind === kind);
    assert.deepEqual(rows.map((item: JsonRecord) => item.trigger), ['click', 'double-click', 'Enter', 'Space']);
    assert.ok(rows.every((item: JsonRecord) => item.taskId === 'p-task-a'));
    assert.ok(rows.every((item: JsonRecord) => item.focusedPlacement === (kind === 'primary' ? 'primary:p-task-a' : 'p-ref-a')));
    assert.ok(rows.every((item: JsonRecord) => (kind === 'tracking') === (item.trackingReferenceId === 'p-ref-a')));
  }
  const b18 = cases.get(requiredCases[1])!;
  assert.ok(b18.actual.primaryActions.includes('task.create-tracking-reference'));
  assert.ok(!b18.actual.referenceActions.includes('task.create-tracking-reference'));
  assert.ok(b18.actual.referenceActions.includes('task.remove-tracking-reference'));
  assert.ok(!b18.actual.primaryActions.includes('task.remove-tracking-reference'));
  assert.deepEqual(b18.actual.derivedManagerActions, ['task.promote', 'task.demote', 'task.remove-tracking-reference']);
});

check('QC-IP04-pointer-keyboard-and-two-mobile-widths', 'desktop pointer, KeyboardSensor and real TouchEvent at 390/320 preserve placement identity and commit through one path', () => {
  const b19 = cases.get(requiredCases[2])!;
  assert.equal(b19.actual.reordered.id, 'p-ref-a');
  assert.equal(b19.actual.appended.parentPlacementId, 'primary:p-task-d');
  assert.equal(b19.actual.canonicalChanged, true);
  assert.equal(b19.actual.failureSourceRetained, true);
  const b20 = cases.get(requiredCases[3])!;
  assert.deepEqual(b20.actual.keyboard.map((item: JsonRecord) => item.kind), ['primary', 'tracking']);
  assert.ok(b20.actual.keyboard.every((item: JsonRecord) => item.pressed === 'true' && item.cancelled === true));
  assert.deepEqual(b20.actual.mobile.map((item: JsonRecord) => item.viewport.width), [390, 320]);
  assert.ok(b20.actual.mobile.every((item: JsonRecord) => item.active === true));
  assert.ok(b20.actual.mobile.every((item: JsonRecord) => item.placementId === 'p-ref-a'));
  assert.ok(b20.actual.mobile.every((item: JsonRecord) => item.shortTapDidNotDrag === true && item.scrollDidNotDrag === true));
  assert.ok(b20.actual.mobile.every((item: JsonRecord) => item.cancelledWithoutMutation === true));
  assert.ok(b20.actual.mobile.every((item: JsonRecord) => Number.isFinite(item.committedOrder) && item.committedOrder > 2));
});

check('QC-IP05-visual-parity-and-viewports', 'primary/reference inner surfaces match; only reference frame is dashed; 1440/390/320 screenshots have exact dimensions and no page overflow', () => {
  const b21 = cases.get(requiredCases[4])!;
  for (const surface of [b21.actual.board, b21.actual.checklist, b21.actual.list]) {
    assert.equal(surface.primaryBorder, 'solid');
    assert.equal(surface.referenceBorder, 'dashed');
    assert.deepEqual(surface.referenceStyle, surface.primaryStyle);
    assert.equal(surface.visibleTrackingCopy, false);
    assert.match(surface.accessibleName, /追蹤副本/);
  }
  assert.equal(b21.actual.board.primaryTitle, b21.actual.board.referenceTitle);
  assert.deepEqual(b21.actual.viewports.map((item: JsonRecord) => [item.viewport.width, item.viewport.height]), [[1440, 900], [390, 844], [320, 844]]);
  for (const item of b21.actual.viewports as JsonRecord[]) {
    assert.equal(item.layout.documentWidth, item.layout.viewportWidth);
    assert.equal(item.layout.bodyWidth, item.layout.viewportWidth);
    const screenshotPath = resolve(root, item.screenshot);
    assert.ok(existsSync(screenshotPath), `missing screenshot: ${screenshotPath}`);
    assert.deepEqual(pngSize(screenshotPath), item.viewport);
  }
});

check('QC-IP06-recursive-subtree-integrity', 'explicit tracking descendants recurse through shared surfaces; move/remove/undo preserve one placement subtree and canonical graph', () => {
  const b22 = cases.get(requiredCases[5])!;
  assert.deepEqual(b22.actual.surfaceKinds, ['kanban-card', 'checklist-row', 'checklist-row']);
  assert.equal(b22.actual.collapseExpand, true);
  assert.equal(b22.actual.canonicalDescendantAutoProjected, false);
  assert.deepEqual(b22.actual.nestedDetails, { taskId: 'p-task-c', trackingReferenceId: 'p-ref-c' });
  assert.equal(b22.actual.focused, 'p-ref-c');
  const b23 = cases.get(requiredCases[6])!;
  assert.equal(b23.actual.childClosure, 'p-ref-a');
  assert.equal(b23.actual.grandchildClosure, 'p-ref-b');
  assert.equal(b23.actual.removedCount, 3);
  assert.equal(b23.actual.restoredCount, 3);
  assert.equal(b23.actual.canonicalUnchanged, true);
});

check('QC-IP07-capability-convergence-and-recovery', 'derived read is capability-only; source edit converges to every placement; provider failure is visible and source-retaining', () => {
  const b24 = cases.get(requiredCases[7])!;
  assert.deepEqual(b24.actual.derived, { readonly: 'true', titleInputs: 0, trackingReferenceId: 'p-ref-derived' });
  assert.equal(b24.actual.referenceConverged, true);
  assert.deepEqual(b24.actual.permissionBeforeRevokeEditable, { readonly: null, titleInputs: 1 });
  assert.deepEqual(b24.actual.permissionRevokedToReadonly, { readonly: 'true', titleInputs: 0 });
  assert.equal(b24.actual.staleRevisionSourceRetained, true);
  assert.equal(b24.actual.staleRevision, 2);
  assert.equal(b24.actual.providerFailureSourceRetained, true);
  assert.equal(b24.actual.recoverableMessage, '搬移失敗，追蹤副本已保留在原位置。');
  assert.deepEqual(b24.actual.unexpectedDiagnostics, []);
});

check('QC-IP08-remote-claim-boundary', 'local QC does not claim Supabase TEST migration, two-user remote readback, deployment or release', () => {
  assert.equal(existsSync(resolve(root, 'output/qa/dev-095/supabase-test-result.json')), false);
  assert.match(browser.environment, /^local-test-/);
  assert.equal(browser.provider, 'local-test');
});

const result = {
  dev: 'DEV-095',
  devId: 'DEV-095',
  sourceRevision: 'working-tree-frozen-candidate',
  environment: 'independent-local-interaction-parity-qc',
  provider: 'artifact-and-source-readback',
  status: 'passed',
  passed: true,
  checks,
  summary: { PASS: checks.length, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
  scope: 'Independent read-only postcondition verification of the frozen local implementation and current B17-B24/S07-S10 evidence.',
  remoteBoundary: {
    supabaseTestMigration: 'NOT RUN',
    twoUserRemoteReadback: 'NOT RUN',
    deployment: 'NOT RUN',
    release: 'NOT RUN',
  },
  generatedAt: new Date().toISOString(),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
checks.forEach(item => console.log(`PASS ${item.id}: ${item.evidence}`));
console.log(`DEV-095 independent interaction parity QC: ${checks.length} passed`);
