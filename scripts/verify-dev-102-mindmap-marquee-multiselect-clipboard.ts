import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Dependency, TaskNode } from '../src/types';
import { createMindMapSelectionStore } from '../src/components/MindMap/mindMapSelectionStore';
import {
  getClientRectBounds,
  getMindMapMarqueeHits,
  getMindMapMarqueePrimary,
  hasReachedMindMapMarqueeThreshold,
} from '../src/components/MindMap/mindMapMarquee';
import {
  createMindMapCopyClipboard,
  createMindMapCutClipboard,
  getMindMapCutStructureFingerprint,
  normalizeMindMapForestRoots,
  planMindMapCopyPasteAfter,
  planMindMapCutPasteAfter,
} from '../src/components/MindMap/mindMapClipboard';
import { resolveTaskMenu } from '../src/interactions/task/resolveTaskInteraction';
import type { InteractionContext } from '../src/interactions/task/types';

const root = resolve('.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const makeNode = (id: string, parentId: string | null, order: number): TaskNode => ({
  id,
  workspaceId: 'workspace-102',
  boardId: 'board-102',
  parentId,
  title: id,
  status: 'todo',
  nodeType: 'task',
  order,
  createdAt: 1,
  updatedAt: 1,
});

const nodeList = [
  makeNode('a', null, 0),
  makeNode('a-1', 'a', 0),
  makeNode('a-2', 'a', 1),
  makeNode('b', null, 1),
  makeNode('b-1', 'b', 0),
  makeNode('c', null, 2),
];
const nodes = Object.fromEntries(nodeList.map(node => [node.id, node]));
const dependencies: Dependency[] = [{ id: 'dep-a', fromId: 'a', fromSide: 'end', toId: 'a-1', toSide: 'start' }];

const selection = createMindMapSelectionStore();
let notificationCount = 0;
['primary:a', 'primary:b', 'primary:c'].forEach(id => selection.subscribeNode(id, () => { notificationCount += 1; }));
selection.setSelection(['primary:a', 'primary:b'], 'primary:a');
assert.deepEqual(selection.getSelectedPlacementIds(), ['primary:a', 'primary:b']);
assert.equal(selection.getPrimaryPlacementId(), 'primary:a');
selection.setPrimaryPlacementId('primary:b');
assert.equal(selection.getPrimaryPlacementId(), 'primary:b');
assert.equal(notificationCount, 2, 'primary-only change must not re-render selected nodes');
selection.setSelection(['primary:b', 'primary:c'], 'primary:b');
assert.equal(notificationCount, 4, 'only symmetric-difference nodes should be notified');

assert.equal(hasReachedMindMapMarqueeThreshold({ x: 0, y: 0 }, { x: 5.99, y: 0 }), false);
assert.equal(hasReachedMindMapMarqueeThreshold({ x: 0, y: 0 }, { x: 6, y: 0 }), true);
const bounds = getClientRectBounds({ x: 30, y: 30 }, { x: 0, y: 0 });
const hits = getMindMapMarqueeHits(bounds, [
  { placementId: 'primary:a', nodeId: 'a', x: 0, y: 0 },
  { placementId: 'primary:b', nodeId: 'b', x: 15, y: 15 },
  { placementId: 'primary:c', nodeId: 'c', x: 31, y: 15 },
]);
assert.deepEqual(hits.map(hit => hit.placementId), ['primary:a', 'primary:b']);
assert.equal(getMindMapMarqueePrimary(['primary:a', 'primary:b'], 'primary:b', ['primary:a', 'primary:b']), 'primary:b');
assert.equal(getMindMapMarqueePrimary(['primary:a', 'primary:b'], 'primary:c', ['primary:b', 'primary:a']), 'primary:b');

assert.deepEqual(normalizeMindMapForestRoots(['a', 'a-1', 'b'], nodes), ['a', 'b']);
const copyClipboard = createMindMapCopyClipboard('board-102', ['a'], nodes, dependencies, 10);
nodes.a.title = 'changed-after-snapshot';
assert.equal(copyClipboard.nodes.a.title, 'a');
let idSequence = 0;
const copyPlan = planMindMapCopyPasteAfter({
  clipboard: copyClipboard,
  anchorTaskId: 'c',
  currentNodes: nodes,
  now: 20,
  createTaskId: () => `copy-${idSequence += 1}`,
  createNoteId: () => `note-${idSequence += 1}`,
  createDependencyId: () => `dep-${idSequence += 1}`,
});
assert.equal(copyPlan.clonePlan.nodes[0].title, 'a（副本）');
assert.equal(copyPlan.clonePlan.dependencies.length, 1);
assert.ok(copyPlan.clonePlan.nodes.every(node => Number.isSafeInteger(node.order)));
assert.ok(Object.values(copyPlan.updatesById).every(update => Number.isSafeInteger(update.order)));

const cutClipboard = createMindMapCutClipboard('board-102', ['a-2', 'b'], nodes, 30);
assert.equal(cutClipboard.sourceStructureFingerprint, getMindMapCutStructureFingerprint('board-102', ['a-2', 'b'], nodes));
const cutPlan = planMindMapCutPasteAfter({
  clipboard: cutClipboard,
  anchorTaskId: 'c',
  nodes,
  sideOverrides: { a: 'right', b: 'left', c: 'right' },
  anchorSide: 'right',
});
assert.equal(cutPlan.destinationParentId, null);
assert.deepEqual(cutPlan.rootIds, ['a-2', 'b']);
assert.ok(Object.values(cutPlan.updatesById).every(update => Number.isSafeInteger(update.order)));
assert.throws(() => planMindMapCutPasteAfter({
  clipboard: cutClipboard,
  anchorTaskId: 'b-1',
  nodes,
  sideOverrides: {},
  anchorSide: 'right',
}), /不能貼在剪下來源或其子任務之後/);

const baseContext: InteractionContext = {
  interactionId: 'dev-102-menu',
  location: { hostMode: 'mindmap', origin: 'mode-primary' },
  surfaceId: 'mindmap.node',
  taskId: 'a',
  modality: 'fine-pointer',
  transientOwners: [],
  blockers: [],
};
const mindMapMenu = resolveTaskMenu(baseContext);
assert.ok(mindMapMenu.includes('task.copy'));
assert.ok(mindMapMenu.includes('task.cut'));
assert.ok(mindMapMenu.includes('task.paste-after'));
assert.equal(mindMapMenu.includes('task.duplicate'), false);
(['list', 'board', 'gantt', 'calendar'] as const).forEach(hostMode => {
  const surfaceId = hostMode === 'list' ? 'list.row' : hostMode === 'board' ? 'board.card' : hostMode === 'gantt' ? 'gantt.task-bar' : 'calendar.segment';
  const menu = resolveTaskMenu({ ...baseContext, location: { hostMode, origin: 'mode-primary' }, surfaceId });
  assert.equal(menu.includes('task.copy'), false, `${hostMode} must not expose mind-map clipboard actions`);
  assert.equal(menu.includes('task.cut'), false, `${hostMode} must not expose mind-map clipboard actions`);
  assert.equal(menu.includes('task.paste-after'), false, `${hostMode} must not expose mind-map clipboard actions`);
  assert.ok(menu.includes('task.duplicate'), `${hostMode} must retain immediate duplicate`);
});

const source = {
  view: read('src/components/MindMap/MindMapView.tsx'),
  node: read('src/components/MindMap/MindMapNode.tsx'),
  menu: read('src/components/MindMap/MindMapContextMenu.tsx'),
  actionMenu: read('src/interactions/task/TaskActionMenu.tsx'),
  catalog: read('src/interactions/task/taskActionCatalog.ts'),
  store: read('src/store/useWbsStore.ts'),
  clone: read('src/features/taskClonePlan.ts'),
  duplicate: read('src/store/useWbsStore.ts'),
  side: read('src/components/MindMap/mindMapSideStorage.ts'),
  packageJson: read('package.json'),
};
assert.doesNotMatch(source.view, /useState<[^>]*selectedPlacementIds/);
assert.match(source.view, /nodeElementRegistryRef/);
assert.match(source.view, /getBoundingClientRect/);
assert.match(source.view, /selectionStore\.setSelection/);
assert.match(source.view, /MindMapContextMenu/);
assert.doesNotMatch(source.view, /setContextMenuState\(/);
assert.match(source.node, /data-task-placement-id/);
assert.match(source.menu, /data-mindmap-context-menu/);
assert.match(source.menu, /hideDisabled/);
assert.match(source.menu, /data-mindmap-context-menu-density/);
assert.doesNotMatch(source.menu, /role="menu"/);
assert.match(source.actionMenu, /aria-disabled/);
assert.match(source.actionMenu, /disabledReason/);
assert.match(source.actionMenu, /visibleActionIds/);
assert.match(source.actionMenu, /compact/);
assert.match(source.catalog, /defaultMenu: false/);
assert.match(source.store, /commitNodeBatch/);
assert.match(source.store, /NodeBatchCommitStatus = 'committed' \| 'rejected' \| 'compensated' \| 'indeterminate'/);
assert.match(source.store, /projed\.mindmap\.batch-recovery\.v1/);
assert.match(source.store, /expectedBeforeFingerprint/);
assert.match(source.store, /expectedAfterFingerprint/);
assert.match(source.clone, /buildTaskTreeClonePlan/);
assert.match(source.duplicate, /commitNodeForestCreate/);
assert.match(source.side, /persistSideOverridesWithReadback/);
assert.match(source.packageJson, /verify:dev-102-mindmap-marquee-multiselect-clipboard/);
assert.match(source.packageJson, /verify:dev-102-mindmap-marquee-multiselect-clipboard-browser/);

console.log(JSON.stringify({
  ok: true,
  verifier: 'DEV-102',
  contract: 'mindmap-marquee-multiselect-clipboard',
  cases: {
    selection: 'PASS',
    marquee: 'PASS',
    forestNormalization: 'PASS',
    copySnapshotAndClonePlan: 'PASS',
    cutPastePlan: 'PASS',
    menuIsolation: 'PASS',
    staticAuthority: 'PASS',
  },
}, null, 2));
