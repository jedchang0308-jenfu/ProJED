import assert from 'node:assert/strict';
import type { TaskNode } from '../src/types';
import {
  addMindMapExpandedNodeIds,
  getMindMapExpansionPath,
  pruneMindMapExpandedNodeIds,
} from '../src/components/MindMap/mindMapExpansion';

const node = (id: string, parentId: string | null, boardId = 'board-a'): TaskNode => ({
  id,
  workspaceId: 'workspace-a',
  boardId,
  parentId,
  title: id,
  status: 'todo',
  nodeType: 'task',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
});

const nodes: Record<string, TaskNode> = {
  root: node('root', null),
  parent: node('parent', 'root'),
  child: node('child', 'parent'),
  otherBoard: node('other-board', null, 'board-b'),
};

const collapsed = new Set(['root', 'parent']);
assert.equal(
  addMindMapExpandedNodeIds(collapsed, ['root', null, undefined]),
  collapsed,
  'adding already-expanded or empty ids must preserve Set identity',
);

const expanded = addMindMapExpandedNodeIds(collapsed, ['child']);
assert.notEqual(expanded, collapsed, 'adding a new id must create a new Set');
assert.deepEqual([...expanded].sort(), ['child', 'parent', 'root']);

assert.deepEqual(
  getMindMapExpansionPath(nodes, 'child', 'board-a'),
  ['root', 'parent', 'child'],
  'new child visibility must expand only its own ancestor path',
);
assert.deepEqual(
  getMindMapExpansionPath(nodes, 'other-board', 'board-a'),
  [],
  'expansion paths must stay scoped to the active board',
);

const pruned = pruneMindMapExpandedNodeIds(new Set(['root', 'other-board']), new Set(['root']));
assert.deepEqual([...pruned], ['root']);
const validExpanded = new Set(['root']);
assert.equal(
  pruneMindMapExpandedNodeIds(validExpanded, new Set(['root'])),
  validExpanded,
  'pruning an already-valid Set must preserve Set identity',
);

console.log(JSON.stringify({ ok: true, checks: 7 }));
