import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTaskMenuActionIds } from '../src/interactions/task/taskActionCatalog';
import { getInteractionProfileLayers } from '../src/interactions/task/profiles';
import { resolveTaskInteraction, resolveTaskMenu } from '../src/interactions/task/resolveTaskInteraction';
import type { InteractionContext } from '../src/interactions/task/types';

const root = resolve('.');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const context: InteractionContext = {
  interactionId: 'dev-071-static',
  location: { hostMode: 'mindmap', origin: 'mode-primary' },
  surfaceId: 'mindmap.node',
  taskId: 'dev071-task',
  nodeRole: 'task',
  modality: 'fine-pointer',
  transientOwners: [],
  blockers: [],
};

const mindmapPrimary = resolveTaskInteraction(context, 'pointer.primary');
const mindmapDouble = resolveTaskInteraction(context, 'pointer.double');
const mindmapMenu = resolveTaskMenu(context);
const boardContext = { ...context, location: { hostMode: 'board' as const, origin: 'mode-primary' as const }, surfaceId: 'board.card' as const };
const boardPrimary = resolveTaskInteraction(boardContext, 'pointer.primary');
const boardMenu = resolveTaskMenu(boardContext);

assert.equal(mindmapPrimary.actionId, 'task.select');
assert.equal(mindmapPrimary.sourceLayer, 'host-mode');
assert.equal(mindmapDouble.actionId, 'task.open-details');
assert.equal(mindmapDouble.sourceLayer, 'host-mode');
assert.ok(mindmapMenu.includes('task.open-details'));
assert.ok(!mindmapMenu.includes('task.dependency-start'));
assert.equal(boardPrimary.actionId, 'task.open-details');
assert.ok(!boardMenu.includes('task.open-details'));
assert.deepEqual(
  getInteractionProfileLayers(context.location).map(layer => layer.layer),
  ['task-default', 'host-mode', 'origin', 'node-role'],
);

const nodeSource = read('src/components/MindMap/MindMapNode.tsx');
const menuSource = read('src/interactions/task/TaskActionMenu.tsx');
const globalMenuSource = read('src/components/GlobalContextMenu.tsx');
assert.ok(nodeSource.includes("interactionBinding.dispatch('pointer.primary')"));
assert.ok(nodeSource.includes("interactionBinding.dispatch('pointer.double')"));
assert.ok(nodeSource.includes('data-mindmap-inline-title-input="true"'));
const mindMapViewSource = read('src/components/MindMap/MindMapView.tsx');
assert.equal((mindMapViewSource.match(/openDetailsForNaming/g) || []).length, 0);
assert.ok(mindMapViewSource.includes('createTask(plan.parentId, plan.order, DEFAULT_MINDMAP_TASK_TITLE)'));
assert.ok(mindMapViewSource.includes('setInlineTitleEditNodeId(node.id)'));
assert.ok(menuSource.includes("'task.open-details': '開啟明細'"));
assert.ok(globalMenuSource.includes("case 'task.open-details':"));

console.log(JSON.stringify({
  status: 'PASS',
  mindmap: {
    primary: mindmapPrimary,
    double: mindmapDouble,
    menu: mindmapMenu,
  },
  board: {
    primary: boardPrimary,
    menu: boardMenu,
  },
  defaultMenuCount: getTaskMenuActionIds().length,
}, null, 2));
