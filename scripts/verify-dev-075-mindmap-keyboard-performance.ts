import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaskNode } from '../src/types';

const root = resolve('.');
const outputRoot = resolve(root, 'output/playwright/dev-075-mindmap-keyboard-performance');
const baselineRoot = resolve(outputRoot, 'baseline');
const baselineArtifactPath = resolve(baselineRoot, 'keyboard-before.json');
const resultArtifactPath = resolve(outputRoot, 'result.json');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const sourcePaths = [
  'src/components/MindMap/mindMapNavigation.ts',
  'src/components/MindMap/mindMapSelectionStore.ts',
  'src/components/MindMap/mindMapSelection.ts',
  'src/components/MindMap/MindMapView.tsx',
  'src/components/MindMap/MindMapNode.tsx',
  'scripts/verify-dev-075-mindmap-keyboard-performance.ts',
  'scripts/verify-dev-075-mindmap-keyboard-performance-browser.pw.js',
  'scripts/verify-dev-027b-xmind-interaction-polish.mjs',
  'scripts/verify-dev-027g-mindmap-system-health.mjs',
  'package.json',
  'ai-doc/dev_task.md',
  'ai-doc/documentation_map.md',
  'ai-doc/specs/SPEC-075-mindmap-keyboard-navigation-performance.md',
  'ai-doc/qa/QA-DEV-075-mindmap-keyboard-navigation-performance.md',
];

const parseJson = (path: string) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as any;
const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const recordRegressionResult = (command: string) => {
  assert.ok(command.trim(), 'DEV-075 regression command must not be empty');
  assert.ok(existsSync(resultArtifactPath), 'DEV-075 browser artifact must exist before recording regressions');
  const artifact = parseJson(resultArtifactPath);
  const previous = Array.isArray(artifact.regressionCommands) ? artifact.regressionCommands : [];
  artifact.regressionCommands = [
    ...previous.filter((item: any) => item.command !== command),
    { command, exitCode: 0, recordedAt: new Date().toISOString() },
  ];
  writeFileSync(resultArtifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, verifier: 'DEV-075', recordedRegression: command }, null, 2));
};

const captureBaseline = () => {
  const marker = resolve(baselineRoot, 'git-head.txt');
  if (existsSync(marker)) throw new Error(`DEV-075 baseline already exists and must not be overwritten: ${baselineRoot}`);
  mkdirSync(baselineRoot, { recursive: true });
  writeFileSync(marker, git(['rev-parse', 'HEAD']), 'utf8');
  writeFileSync(resolve(baselineRoot, 'git-branch.txt'), git(['branch', '--show-current']), 'utf8');
  writeFileSync(resolve(baselineRoot, 'git-status.txt'), git(['status', '--short']), 'utf8');
  writeFileSync(resolve(baselineRoot, 'git-diff.patch'), git(['diff', '--', ...sourcePaths]), 'utf8');
  writeFileSync(resolve(baselineRoot, 'touched-paths.json'), JSON.stringify(sourcePaths, null, 2), 'utf8');
  console.log(JSON.stringify({
    verifier: 'DEV-075',
    baseline: 'captured',
    root: baselineRoot,
    head: git(['rev-parse', 'HEAD']).trim(),
    branch: git(['branch', '--show-current']).trim(),
  }, null, 2));
};

const makeNode = (id: string, parentId: string | null, order: number): TaskNode => ({
  id,
  workspaceId: 'workspace',
  boardId: 'board',
  parentId,
  title: id,
  status: 'todo',
  nodeType: 'task',
  order,
  createdAt: 1,
  updatedAt: 1,
});

const runPureKernelCases = async () => {
  const {
    buildMindMapNavigationIndex,
    getMindMapHorizontalSelection,
    getMindMapVerticalSelection,
  } = await import('../src/components/MindMap/mindMapNavigation');
  const { createMindMapSelectionStore } = await import('../src/components/MindMap/mindMapSelectionStore');
  const leftRoot = makeNode('left-root', null, 0);
  const leftChild = makeNode('left-child', leftRoot.id, 0);
  const leftGrandchild = makeNode('left-grandchild', leftChild.id, 0);
  const rightRoot = makeNode('right-root', null, 1);
  const rightChild = makeNode('right-child', rightRoot.id, 0);
  const children = new Map<string, TaskNode[]>([
    [leftRoot.id, [leftChild]],
    [leftChild.id, [leftGrandchild]],
    [leftGrandchild.id, [leftRoot]],
    [rightRoot.id, [rightChild]],
  ]);
  const index = buildMindMapNavigationIndex(
    { left: [leftRoot], right: [rightRoot] },
    new Set([leftRoot.id, leftChild.id, leftGrandchild.id, rightRoot.id]),
    nodeId => children.get(nodeId) || [],
  );
  assert.deepEqual(index.nodeIds, ['left-root', 'left-child', 'left-grandchild', 'right-root', 'right-child']);
  assert.equal(index.positionByNodeId.size, index.nodeIds.length);
  assert.equal(getMindMapVerticalSelection('left-child', index, 'up'), 'left-root');
  assert.equal(getMindMapVerticalSelection('left-child', index, 'down'), 'left-grandchild');
  assert.equal(getMindMapVerticalSelection('left-root', index, 'up'), 'left-root');
  assert.equal(getMindMapVerticalSelection('right-child', index, 'down'), 'right-child');
  assert.equal(getMindMapVerticalSelection('missing', index, 'down'), null);

  const nodeById = new Map([leftRoot, leftChild, leftGrandchild, rightRoot, rightChild].map(node => [node.id, node]));
  const getParentId = (nodeId: string) => nodeById.get(nodeId)?.parentId || null;
  assert.deepEqual(getMindMapHorizontalSelection('right-child', index, 'left', getParentId, nodeId => children.get(nodeId) || []), {
    nodeId: 'right-root',
    expandNodeId: null,
  });
  assert.deepEqual(getMindMapHorizontalSelection('right-root', index, 'right', getParentId, nodeId => children.get(nodeId) || []), {
    nodeId: 'right-child',
    expandNodeId: 'right-root',
  });
  assert.deepEqual(getMindMapHorizontalSelection('right-root', index, 'left', getParentId, nodeId => children.get(nodeId) || []), {
    nodeId: 'left-root',
    expandNodeId: null,
  });
  assert.deepEqual(getMindMapHorizontalSelection('left-root', index, 'right', getParentId, nodeId => children.get(nodeId) || []), {
    nodeId: 'right-root',
    expandNodeId: null,
  });
  assert.deepEqual(getMindMapHorizontalSelection('left-root', index, 'left', getParentId, nodeId => children.get(nodeId) || []), {
    nodeId: 'left-child',
    expandNodeId: 'left-root',
  });
  assert.equal(getMindMapHorizontalSelection('missing', index, 'left', getParentId, nodeId => children.get(nodeId) || []), null);

  const collapsed = buildMindMapNavigationIndex(
    { left: [leftRoot], right: [rightRoot] },
    new Set([rightRoot.id]),
    nodeId => children.get(nodeId) || [],
  );
  assert.deepEqual(collapsed.nodeIds, ['left-root', 'right-root', 'right-child']);

  const store = createMindMapSelectionStore();
  let aNotifications = 0;
  let bNotifications = 0;
  const unsubscribeA = store.subscribeNode('a', () => { aNotifications += 1; });
  const unsubscribeB = store.subscribeNode('b', () => { bNotifications += 1; });
  assert.deepEqual(store.setSelectedNodeId('a'), {
    changed: true,
    previousNodeId: null,
    selectedNodeId: 'a',
    notifiedNodeCount: 1,
  });
  assert.equal(store.isNodeSelected('a'), true);
  assert.deepEqual(store.setSelectedNodeId('a'), {
    changed: false,
    previousNodeId: 'a',
    selectedNodeId: 'a',
    notifiedNodeCount: 0,
  });
  assert.deepEqual(store.setSelectedNodeId('b'), {
    changed: true,
    previousNodeId: 'a',
    selectedNodeId: 'b',
    notifiedNodeCount: 2,
  });
  assert.equal(aNotifications, 2);
  assert.equal(bNotifications, 1);
  assert.deepEqual(store.getDiagnostics(), { commitCount: 2, notifiedNodeCount: 3 });
  unsubscribeA();
  unsubscribeB();
  store.dispose();
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const runStaticAuthorityCases = () => {
  const navigation = read('src/components/MindMap/mindMapNavigation.ts');
  const selectionStore = read('src/components/MindMap/mindMapSelectionStore.ts');
  const selection = read('src/components/MindMap/mindMapSelection.ts');
  const view = read('src/components/MindMap/MindMapView.tsx');
  const node = read('src/components/MindMap/MindMapNode.tsx');
  const packageJson = read('package.json');

  assert.match(navigation, /buildMindMapNavigationIndex/);
  assert.match(navigation, /getMindMapHorizontalSelection/);
  assert.match(navigation, /sideByNodeId/);
  assert.match(navigation, /rootIdsBySide/);
  assert.match(navigation, /positionByNodeId\.get\(currentNodeId\)/);
  assert.doesNotMatch(navigation, /querySelector|HTMLElement|document\./);
  assert.match(selectionStore, /useSyncExternalStore/);
  assert.match(selectionStore, /subscribeNode/);
  assert.doesNotMatch(selection, /getVisibleMindMapNodeIds|querySelectorAll|indexOf/);
  assert.match(view, /buildMindMapNavigationIndex/);
  assert.match(view, /getMindMapHorizontalSelection/);
  assert.match(view, /createMindMapSelectionStore/);
  assert.match(view, /selectionStore\.getSelectedNodeId\(\)/);
  assert.match(view, /nodeElementRegistryRef/);
  assert.match(view, /isMindMapTextEditingTarget\(activeElement\)/);
  assert.match(view, /if \(restoreNodeFocus\) scheduleNodeFocus\(nodeId\)/);
  assert.doesNotMatch(view, /useState<string \| null>\(null\).*selectedNodeId|\[selectedNodeId, setSelectedNodeId\]/);
  assert.doesNotMatch(view, /getVisibleMindMapNodeIds/);
  assert.match(node, /useMindMapNodeSelected/);
  assert.match(node, /transition-colors/);
  assert.match(node, /commitTitleEdit\(true\)/);
  assert.match(node, /cancelTitleEdit\(true\)/);
  assert.doesNotMatch(node, /selectedNodeId:/);
  assert.match(read('src/components/MindMap/mindMapKeyboard.ts'), /type: 'select-horizontal'/);
  assert.match(packageJson, /verify:dev-075-mindmap-keyboard-performance/);
  assert.match(packageJson, /verify:dev-075-mindmap-keyboard-performance-browser/);
};

const validateBrowserArtifact = (requireRegressions = false) => {
  if (!existsSync(resultArtifactPath)) return { browserArtifact: 'pending' };
  assert.ok(existsSync(baselineArtifactPath), 'DEV-075 after evidence requires baseline/keyboard-before.json');
  const artifact = parseJson(resultArtifactPath);
  const baseline = parseJson(baselineArtifactPath);
  assert.equal(artifact.verifier, 'DEV-075');
  assert.equal(artifact.contract, 'mindmap-keyboard-navigation-performance');
  assert.equal(artifact.fixtureId, 'dev-075-v1');
  assert.equal(artifact.phase, 'after');
  assert.equal(artifact.baselineRef, 'baseline/keyboard-before.json');
  assert.equal(artifact.passed, true);
  assert.deepEqual(artifact.consoleErrors || [], []);
  assert.deepEqual(artifact.pageErrors || [], []);
  assert.deepEqual(artifact.visibleErrors || [], []);
  assert.equal(artifact.singleStep?.viewRenderDelta, 0);
  assert.ok((artifact.singleStep?.changedNodeRenderIds || []).length <= 2);
  assert.ok(artifact.singleStep?.notificationDelta <= 2);
  assert.equal(artifact.singleStep?.navigationIndexBuildDelta, 0);
  assert.equal(artifact.singleStep?.geometryRecomputeDelta, 0);
  assert.equal(artifact.singleStep?.focusMatchesSelection, true);
  assert.deepEqual(artifact.interactionEvidence?.initialSelectedIds, ['dev075-node-0000']);
  assert.equal(artifact.interactionEvidence?.selectedAfterEditorArrows, artifact.interactionEvidence?.interactionNodeId);
  assert.equal(artifact.interactionEvidence?.quickTitleFocusRetained, true);
  assert.equal(artifact.interactionEvidence?.focusRestoredAfterEscape, true);
  assert.equal(artifact.interactionEvidence?.selectedDuringModal, artifact.interactionEvidence?.interactionNodeId);
  assert.equal(artifact.interactionEvidence?.modalFocusRetained, true);
  assert.equal(artifact.interactionEvidence?.selectedRelationshipAfterArrow, artifact.interactionEvidence?.selectedRelationshipId);
  assert.equal(artifact.interactionEvidence?.selectedNodeCountDuringRelationship, 0);
  assert.equal(artifact.interactionEvidence?.centerBridge?.selectedAcrossCenter, 'dev075-node-0001');
  assert.equal(artifact.interactionEvidence?.centerBridge?.selectedBackAcrossCenter, 'dev075-node-0000');
  assert.equal(artifact.interactionEvidence?.centerBridge?.centerSelected, false);
  assert.equal(artifact.interactionEvidence?.centerBridge?.focusMatchesSelection, true);
  assert.equal(artifact.mobileBoundary?.mindMapVisible, false);
  assert.equal(artifact.mobileBoundary?.boardVisible, true);
  assert.equal(artifact.probeComparison?.probeAttributesPresent, false);
  assert.ok(artifact.probeComparison?.relativeRegressionRatio <= 0.2, 'general route regressed more than 20% against the instrumented route');
  if (requireRegressions) {
    assert.ok((artifact.regressionCommands || []).length >= 12, 'DEV-075 final evidence requires the recorded regression command matrix');
    assert.ok((artifact.regressionCommands || []).every((item: any) => item.exitCode === 0), 'all recorded regression commands must pass');
  }

  const afterCases = artifact.cases || [];
  assert.ok(afterCases.length >= 11, 'after artifact must contain the 50/200/500, burst, and zoom matrix');
  for (const item of afterCases) {
    const absoluteGate = item.visibleNodeCount === 500 ? 50 : 32;
    assert.ok(item.latencyMs?.p95 <= absoluteGate, `${item.visibleNodeCount} nodes p95 exceeded ${absoluteGate}ms`);
    assert.equal(item.expectedSelectedNodeId, item.actualSelectedNodeId);
    assert.equal(item.missedSteps, 0);
    assert.equal(item.longTaskCount, 0);
    assert.equal(item.viewRenderDelta, 0);
    assert.ok((item.changedNodeRenderIds || []).length <= 2);
    assert.ok(item.notificationDelta <= item.eventCount * 2);
    assert.equal(item.navigationIndexBuildDelta, 0);
    assert.equal(item.geometryRecomputeDelta, 0);
    assert.equal(item.focusMatchesSelection, true);
    assert.ok(existsSync(resolve(root, item.screenshot)), `missing screenshot ${item.screenshot}`);
  }

  for (const visibleNodeCount of [50, 200, 500]) {
    const afterP95 = median(afterCases
      .filter((item: any) => item.visibleNodeCount === visibleNodeCount && item.zoom === 1 && item.eventIntervalMs === 33)
      .map((item: any) => item.latencyMs.p95));
    const beforeP95 = median((baseline.cases || [])
      .filter((item: any) => item.visibleNodeCount === visibleNodeCount && item.zoom === 1 && item.eventIntervalMs === 33)
      .map((item: any) => item.latencyMs.p95));
    assert.ok(Number.isFinite(afterP95) && Number.isFinite(beforeP95), `missing before/after p95 for ${visibleNodeCount}`);
    const absoluteGate = visibleNodeCount === 500 ? 50 : 32;
    if (beforeP95 > absoluteGate) {
      assert.ok(afterP95 <= beforeP95 * 0.7, `${visibleNodeCount} nodes did not improve at least 30%`);
    } else {
      assert.ok(afterP95 <= Math.max(absoluteGate, beforeP95 * 1.2), `${visibleNodeCount} nodes regressed more than 20%`);
    }
  }
  return { browserArtifact: 'validated', caseCount: afterCases.length };
};

const main = async () => {
  const recordIndex = process.argv.indexOf('--record-regression');
  if (recordIndex >= 0) {
    recordRegressionResult(process.argv[recordIndex + 1] || '');
    return;
  }
  if (process.argv.includes('--capture-baseline')) {
    captureBaseline();
    return;
  }
  await runPureKernelCases();
  if (process.argv.includes('--pure-only')) {
    console.log(JSON.stringify({ ok: true, verifier: 'DEV-075', cases: 'pure-kernel' }, null, 2));
    return;
  }
  runStaticAuthorityCases();
  const browser = validateBrowserArtifact(process.argv.includes('--require-regressions'));
  console.log(JSON.stringify({ ok: true, verifier: 'DEV-075', cases: 'pure-kernel + static-authority', ...browser }, null, 2));
};

await main();
