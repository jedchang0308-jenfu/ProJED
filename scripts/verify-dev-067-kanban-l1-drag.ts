import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TaskNode } from '../src/types';
import {
  resolveTaskDropIntent,
  type TaskDropDescriptor,
} from '../src/components/Wbs/taskDrag/taskDropIntent';

const now = 1_723_600_000_000;
const node = (value: Partial<TaskNode> & Pick<TaskNode, 'id' | 'parentId' | 'order' | 'nodeType'>): TaskNode => ({
  id: value.id,
  workspaceId: 'workspace-dev067',
  boardId: 'board-dev067',
  parentId: value.parentId,
  title: value.id,
  status: 'todo',
  nodeType: value.nodeType,
  order: value.order,
  createdAt: now,
  updatedAt: now,
  ...value,
});

const nodes: Record<string, TaskNode> = {
  rootA: node({ id: 'rootA', parentId: null, order: 0, nodeType: 'group' }),
  rootB: node({ id: 'rootB', parentId: null, order: 1, nodeType: 'group' }),
  cardA: node({ id: 'cardA', parentId: 'rootA', order: 0, nodeType: 'task' }),
  cardB: node({ id: 'cardB', parentId: 'rootB', order: 0, nodeType: 'task' }),
  childA: node({ id: 'childA', parentId: 'cardA', order: 0, nodeType: 'task' }),
  grandchildA: node({ id: 'grandchildA', parentId: 'childA', order: 0, nodeType: 'task' }),
};

const resolve = (source: TaskDropDescriptor, target: TaskDropDescriptor) =>
  resolveTaskDropIntent({ source, target, nodesRecord: nodes });

const cardToHeader = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.deepEqual(cardToHeader, {
  parentId: null,
  order: 0.5,
  nodeType: 'group',
  displayPosition: 'before',
});

assert.equal(nodes.childA.parentId, 'cardA');
assert.equal(nodes.grandchildA.parentId, 'childA');

const childToHeader = resolve(
  { nodeId: 'childA', surfaceKind: 'checklist-row' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.equal(childToHeader?.parentId, null);
assert.equal(childToHeader?.nodeType, 'group');
assert.equal(childToHeader?.displayPosition, 'before');

const cardToRootEnd = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'root-drop' },
);
assert.deepEqual(cardToRootEnd, {
  parentId: null,
  order: 2,
  nodeType: 'group',
  displayPosition: 'append',
});

const cardToColumnBody = resolve(
  { nodeId: 'cardA', surfaceKind: 'kanban-card' },
  { nodeId: 'rootB', surfaceKind: 'column-drop' },
);
assert.equal(cardToColumnBody?.parentId, 'rootB');
assert.equal(cardToColumnBody?.nodeType, 'task');
assert.equal(cardToColumnBody?.displayPosition, 'append');

const rootReorder = resolve(
  { nodeId: 'rootA', surfaceKind: 'column-header' },
  { nodeId: 'rootB', surfaceKind: 'column-header' },
);
assert.equal(rootReorder?.parentId, null);
assert.equal(rootReorder?.nodeType, 'group');
assert.equal(rootReorder?.displayPosition, 'after');

const invalidCycle = resolve(
  { nodeId: 'rootA', surfaceKind: 'column-header' },
  { nodeId: 'cardA', surfaceKind: 'checklist-drop' },
);
assert.equal(invalidCycle, null);

const source = {
  board: readFileSync('src/components/BoardView.tsx', 'utf8'),
  rootZone: readFileSync('src/components/Wbs/KanbanRootDropZone.tsx', 'utf8'),
  intent: readFileSync('src/components/Wbs/taskDrag/taskDropIntent.ts', 'utf8'),
  commit: readFileSync('src/components/Wbs/taskDrag/taskDragCommit.ts', 'utf8'),
  mobile: readFileSync('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts', 'utf8'),
  presenter: readFileSync('src/components/Wbs/taskDrag/TaskDragPresenter.tsx', 'utf8'),
  spec: readFileSync('ai-doc/specs/SPEC-067-kanban-l1-drag-promotion.md', 'utf8'),
  qa: readFileSync('ai-doc/qa/QA-DEV-067-kanban-l1-drag-promotion.md', 'utf8'),
};

assert.match(source.board, /<KanbanRootDropZone/);
assert.match(source.rootZone, /type: 'wbs-root-drop'/);
assert.match(source.rootZone, /data-task-drop-surface-kind=\{anchorNodeId \? 'root-drop'/);
assert.match(source.intent, /if \(targetType === 'wbs-root-drop'\) return 'root-drop'/);
assert.match(source.commit, /normalizeTaskMoveUpdates\(draggedNode\.id, intent, state\.nodes\)/);
assert.match(source.mobile, /data-task-drop-node-id/);
assert.match(source.presenter, /data-mobile-drop-surface-kind=\{state\.targetSurfaceKind/);
assert.match(source.spec, /Intentional replacement/);
assert.match(source.qa, /QA-067-011/);

console.log(JSON.stringify({
  ok: true,
  cases: 13,
  intents: { cardToHeader, childToHeader, cardToRootEnd, cardToColumnBody, rootReorder },
}, null, 2));
