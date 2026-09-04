import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const outputPath = resolve(root, 'output/qc/dev-098/task-detail-subtasks-qc-result.json');

const readJson = (relativePath) => {
  const path = resolve(root, relativePath);
  assert.ok(existsSync(path), `missing evidence artifact: ${relativePath}`);
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
};

const readSource = (relativePath) => {
  const path = resolve(root, relativePath);
  assert.ok(existsSync(path), `missing source file: ${relativePath}`);
  return readFileSync(path, 'utf8');
};

const sha256 = (relativePath) => {
  const path = resolve(root, relativePath);
  const bytes = readFileSync(path);
  return { path: relativePath, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};

const source = {
  tree: readSource('src/components/Wbs/TaskChecklistTree.tsx'),
  boardAdapter: readSource('src/components/Wbs/KanbanChecklist.tsx'),
  detailsSection: readSource('src/components/TaskDetailsSubtaskSection.tsx'),
  detailsModal: readSource('src/components/TaskDetailsModal.tsx'),
  navigation: readSource('src/components/taskDetailsNavigation.ts'),
  dragSession: readSource('src/components/Wbs/taskDrag/useTaskDragSession.ts'),
  dragTarget: readSource('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts'),
  childTarget: readSource('src/components/Wbs/taskDrag/taskChildDropTarget.ts'),
  dragCommit: readSource('src/components/Wbs/taskDrag/taskDragCommit.ts'),
  contextMenu: readSource('src/components/GlobalContextMenu.tsx'),
};

const staticResult = readJson('output/qa/dev-098/result.json');
const pureResult = readJson('output/qa/dev-098/pure-result.json');
const browserResult = readJson('output/playwright/dev-098/result.json');
const baselineAudit = readJson('output/qa/dev-098/baseline-audit.json');
const adjacentAudit = readJson('output/qa/dev-098/adjacent-audit-final-20260902.json');
const browserCases = new Map((browserResult.cases || []).map(item => [item.id, item]));
const checks = [];

const check = (id, evidence, assertion) => {
  assertion();
  checks.push({ id, status: 'PASS', evidence });
};

check('QC-098-01-evidence-envelope', 'static 22/22, pure 10/10, browser 16/16 and diagnostics empty', () => {
  assert.equal(staticResult.dev, 'DEV-098');
  assert.equal(staticResult.status, 'PASS');
  assert.deepEqual(staticResult.summary, { pass: 22, fail: 0 });
  assert.equal(pureResult.dev, 'DEV-098');
  assert.equal(pureResult.status, 'PASS');
  assert.deepEqual(pureResult.summary, { pass: 10, fail: 0, notRun: 0 });
  assert.equal(browserResult.dev, 'DEV-098');
  assert.equal(browserResult.status, 'PASS');
  assert.deepEqual(browserResult.summary, { pass: 16, fail: 0, diagnostics: 0 });
  assert.deepEqual(browserResult.diagnostics, []);
  assert.equal(browserCases.size, 16);
  assert.ok([...browserCases.values()].every(item => item.status === 'PASS'));
});

check('QC-098-02-shared-renderer-boundary', 'Details and Board both mount TaskChecklistTree; host-specific state remains in Board adapter', () => {
  assert.match(source.boardAdapter, /import\s*\{\s*TaskChecklistTree\s*\}/);
  assert.match(source.boardAdapter, /<TaskChecklistTree\s/);
  assert.match(source.detailsSection, /import\s*\{\s*TaskChecklistTree/);
  assert.match(source.detailsSection, /<TaskChecklistTree\s/);
  assert.doesNotMatch(source.tree, /useRecordStore|KanbanDependencyContext|from ['"]\.\.\/BoardView/);
  assert.match(source.tree, /useTaskPlacementController/);
  assert.match(source.tree, /TaskPlacementTree/);
  assert.match(source.tree, /surfaceId: TaskInteractionSurfaceId/);
});

check('QC-098-03-authoritative-placement-and-scope', 'Details uses a local DndContext, targetScopeRef and the existing placement commit path', () => {
  assert.match(source.detailsSection, /<DndContext/);
  assert.match(source.detailsSection, /targetScopeRef:\s*dragScopeRef/);
  assert.match(source.detailsSection, /data-task-details-subtask-drag-scope/);
  assert.match(source.detailsSection, /commitDesktopTaskDrag/);
  assert.match(source.dragSession, /targetScopeRef/);
  assert.match(source.dragTarget, /scopeElement/);
  assert.match(source.childTarget, /scopeElement/);
  assert.match(source.dragCommit, /commitTaskPlacementCommand/);
});

check('QC-098-04-details-scope-excludes-modal-shell', 'Only the subtask host and root drop zone are inside the drag scope; metadata/background are outside', () => {
  const metaIndex = source.detailsModal.indexOf('data-task-details-meta-section');
  const sectionIndex = source.detailsModal.indexOf('<TaskDetailsSubtaskSection');
  assert.ok(metaIndex >= 0 && sectionIndex > metaIndex);
  assert.match(source.detailsSection, /data-task-details-root-drop-zone/);
  assert.match(source.detailsSection, /ref=\{dragScopeRef\}/);
  assert.match(source.detailsModal, /data-task-details-scroll-surface/);
  assert.doesNotMatch(source.detailsModal, /data-task-details-meta-section[^]*data-task-details-subtask-drag-scope/);
});

check('QC-098-05-single-modal-navigation-and-save-gate', 'Child open/back and save rejection preserve one modal and one typed transition owner', () => {
  const b03 = browserCases.get('B03-single-modal-push-back');
  const b05 = browserCases.get('B05-save-reject-retry-blocks-navigation');
  const b06 = browserCases.get('B06-rapid-navigation-single-modal');
  assert.equal(b03?.status, 'PASS');
  assert.equal(b03.actual.modalCount, 1);
  assert.equal(b05?.status, 'PASS');
  assert.equal(b05.actual.stayedOnFailure, true);
  assert.equal(b05.actual.retryRecovered, true);
  assert.equal(b06?.status, 'PASS');
  assert.equal(b06.actual.modalCount, 1);
  assert.match(source.navigation, /detailsNodeId|entry/);
  assert.match(source.detailsModal, /pendingTransitionRef/);
  assert.match(source.detailsModal, /failed/);
});

check('QC-098-06-interaction-and-overlay', 'Context menu, Escape ownership, desktop reorder, append, invalid drop and keyboard drag all pass', () => {
  assert.equal(browserCases.get('B07-context-menu-above-modal')?.actual.menuZ, 10029);
  assert.equal(browserCases.get('B07-context-menu-above-modal')?.actual.modalZ, 10000);
  assert.equal(browserCases.get('B08-escape-outside-layer-ownership')?.actual.escapeClosedMenuOnly, true);
  assert.equal(browserCases.get('B08-escape-outside-layer-ownership')?.actual.outsideClickPreservedModal, true);
  assert.equal(browserCases.get('B09-details-desktop-sibling-reorder')?.actual.afterOrder, 1);
  assert.equal(browserCases.get('B10-details-append-and-invalid-drop')?.actual.descendantDropRejected, true);
  assert.equal(browserCases.get('B12-details-keyboard-drag-sensor')?.actual.started, true);
  assert.equal(browserCases.get('B12-details-keyboard-drag-sensor')?.actual.cancelled, true);
  assert.match(source.contextMenu, /useTaskDetailsNavigation/);
});

check('QC-098-07-mobile-capability-and-layout', '390/320 mobile scope, permission guards and four viewport layout checks are clean', () => {
  assert.equal(browserCases.get('B13-mobile-local-scroll-scope')?.actual.collapsedAndExpanded, true);
  assert.equal(browserCases.get('B14-mobile-320-short-scroll-guard')?.actual.shortScrollDidNotDrag, true);
  assert.equal(browserCases.get('B15-readonly-and-tracking-capability-guard')?.actual.mutationCtaHidden, true);
  const b16 = browserCases.get('B16-layout-error-sweep');
  assert.deepEqual(b16?.actual.viewports.map(item => [item.viewport.width, item.viewport.height]), [[1440, 900], [1024, 768], [390, 844], [320, 844]]);
  assert.equal(b16?.actual.diagnostics, 0);
  for (const item of b16.actual.viewports) {
    assert.equal(item.layout.scrollWidth, item.layout.clientWidth);
    assert.equal(item.layout.bodyScrollWidth, item.layout.bodyClientWidth);
  }
});

check('QC-098-08-failure-recovery-source-retention', 'Tracking placement failure retains source identity and normal placement failure has no false success', () => {
  const b11 = browserCases.get('B11-tracking-placement-failure-retains-source');
  assert.equal(b11?.actual.sourceRetained, true);
  assert.equal(b11?.actual.parentPlacementId, 'primary:dev098-parent');
  assert.equal(b11?.actual.order, 2);
  assert.match(source.dragCommit, /status: 'failed'/);
  assert.match(source.dragCommit, /catch \(error\)/);
  assert.match(source.dragCommit, /source/);
});

check('QC-098-09-adjacent-regression-disposition', 'Clean-baseline findings remain historical facts; affected adjacent cases were then fixed and rerun without waiver', () => {
  assert.equal(baselineAudit.dev, 'DEV-098');
  assert.equal(baselineAudit.baselineRevision, '13888b27221b4bf9214a5f78e00651a38f32c83f');
  assert.equal(baselineAudit.results['DEV-046'].status, 'FAIL');
  assert.deepEqual(baselineAudit.results['DEV-046'].cases, ['QA-046-D02']);
  assert.equal(baselineAudit.results['DEV-053'].status, 'FAIL');
  assert.deepEqual(baselineAudit.results['DEV-053'].cases, ['QA-053-B14']);
  assert.equal(baselineAudit.results['DEV-055'].status, 'FAIL');
  assert.equal(baselineAudit.results['DEV-055'].cases.length, 10);
  assert.equal(baselineAudit.cleanup.portReleased, true);
  assert.match(baselineAudit.interpretation, /pre-existing/);
  assert.equal(adjacentAudit.dev, 'DEV-098');
  assert.equal(adjacentAudit.waiver, null);
  for (const dev of ['DEV-046', 'DEV-053', 'DEV-055', 'DEV-095']) {
    assert.equal(adjacentAudit.results[dev].status, 'PASS');
    assert.equal(adjacentAudit.results[dev].static.fail, 0);
  }
  assert.equal(adjacentAudit.results['DEV-046'].browser.fail, 0);
  assert.equal(adjacentAudit.results['DEV-053'].browser.fail, 0);
  assert.equal(adjacentAudit.results['DEV-055'].browser.fail, 0);
});

check('QC-098-10-remote-release-boundary', 'QC is local read-only evidence and makes no schema, provider, deploy or release claim', () => {
  assert.doesNotMatch(source.detailsSection, /supabase|migration|RLS/);
  assert.doesNotMatch(source.detailsModal, /supabase|migration|RLS/);
  assert.equal(baselineAudit.runtime, 'http://127.0.0.1:4010/');
});

const consumedArtifacts = [
  'output/qa/dev-098/result.json',
  'output/qa/dev-098/pure-result.json',
  'output/playwright/dev-098/result.json',
  'output/qa/dev-098/baseline-audit.json',
  'output/qa/dev-098/adjacent-audit-final-20260902.json',
];
const sourceFiles = [
  'src/components/Wbs/TaskChecklistTree.tsx',
  'src/components/Wbs/KanbanChecklist.tsx',
  'src/components/TaskDetailsSubtaskSection.tsx',
  'src/components/TaskDetailsModal.tsx',
  'src/components/taskDetailsNavigation.ts',
  'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  'src/components/Wbs/taskDrag/taskChildDropTarget.ts',
  'src/components/Wbs/taskDrag/taskDragCommit.ts',
  'src/components/GlobalContextMenu.tsx',
];

const result = {
  dev: 'DEV-098',
  sourceRevision: 'working-tree',
  environment: 'independent-local-dev098-qc',
  provider: 'artifact-and-source-readback',
  status: 'PASS',
  passed: true,
  checks,
  summary: { PASS: checks.length, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
  scope: 'Independent read-only postcondition verification of the frozen local DEV-098 implementation and core S/P/B evidence.',
  adjacentRegression: 'PASS / DEV-046, DEV-053, DEV-055 and DEV-095 affected cases rerun after source/verifier alignment; no waiver used',
  remoteBoundary: { schema: 'NOT RUN', migration: 'NOT RUN', deployment: 'NOT RUN', release: 'NOT RUN' },
  evidenceEnvelope: {
    generatedAt: new Date().toISOString(),
    artifacts: consumedArtifacts.map(sha256),
    sources: sourceFiles.map(sha256),
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
checks.forEach(item => console.log(`PASS ${item.id}: ${item.evidence}`));
console.log(`DEV-098 independent local QC: ${checks.length} passed`);
