import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TaskNode } from '../src/types';
import { collectTaskDragDescendantIds } from '../src/components/Wbs/taskDrag/taskDragScope';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const nodes: Record<string, TaskNode> = {
  root: { id: 'root', workspaceId: 'w', boardId: 'b', parentId: null, title: 'Root', status: 'todo', nodeType: 'group', order: 0 },
  childA: { id: 'childA', workspaceId: 'w', boardId: 'b', parentId: 'root', title: 'A', status: 'todo', nodeType: 'task', order: 0 },
  grandchild: { id: 'grandchild', workspaceId: 'w', boardId: 'b', parentId: 'childA', title: 'A1', status: 'todo', nodeType: 'task', order: 0 },
  childB: { id: 'childB', workspaceId: 'w', boardId: 'b', parentId: 'root', title: 'B', status: 'todo', nodeType: 'task', order: 1 },
  archived: { id: 'archived', workspaceId: 'w', boardId: 'b', parentId: 'root', title: 'Old', status: 'todo', nodeType: 'task', order: 2, isArchived: true },
};
const parentIndex = {
  root: ['childA', 'childB', 'archived'],
  childA: ['grandchild'],
  grandchild: ['root'],
};

assert.deepEqual(
  collectTaskDragDescendantIds('root', parentIndex, nodes),
  ['childA', 'grandchild', 'childB'],
  'collector must preserve canonical order, exclude archived nodes, and stop cycles',
);
assert.deepEqual(collectTaskDragDescendantIds('childB', parentIndex, nodes), [], 'leaf must have no descendants');

const boardView = read('src/components/BoardView.tsx');
const column = read('src/components/Wbs/KanbanColumn.tsx');
const card = read('src/components/Wbs/KanbanCard.tsx');
const checklist = read('src/components/Wbs/KanbanChecklist.tsx');
const listItem = read('src/components/Wbs/WbsNodeItem.tsx');
const desktopDropPreview = read('src/components/Wbs/taskDrag/desktopTaskDropPreview.ts');
const taskDragTargetAdapter = read('src/components/Wbs/taskDrag/taskDragTargetAdapter.ts');
const css = read('src/index.css');

assert.match(boardView, /collectTaskDragDescendantIds/);
assert.match(boardView, /data-task-drag-descendant-count/);
assert.doesNotMatch(boardView, /含 \{activeDragDescendantCount\} 個子任務/);
assert.match(column, /data-task-hover-scope-kind="column"/);
assert.match(column, /data-kanban-column-subtree-scope/);
assert.doesNotMatch(column, /className="task-title-text[^"]*hover:text-primary/);
assert.doesNotMatch(column, /title=\{node\.title \|\| '未命名任務'\}/);
assert.doesNotMatch(card, /title=\{node\.title \|\| '未命名任務'\}/);
assert.doesNotMatch(checklist, /title=\{child\.title \|\| '未命名任務'\}/);
assert.doesNotMatch(listItem, /title=\{node\.title \|\| '未命名任務'\}/);
assert.match(card, /data-task-surface-scope="true"/);
assert.match(card, /data-task-hover-scope-kind="card"/);
assert.match(card, /data-task-surface-source="true"/);
assert.match(card, /data-task-surface-subtree="true"/);
assert.match(card, /data-kanban-card-subtree-scope="true"/);
assert.ok(
  card.indexOf('data-task-surface-scope="true"') < card.indexOf('data-task-surface-source="true"')
    && card.indexOf('data-task-surface-source="true"') < card.indexOf('data-task-surface-subtree="true"'),
  'L2 DOM must be scope → source surface + subtree surface',
);
assert.match(checklist, /data-task-hover-scope-kind="checklist"/);
assert.match(checklist, /data-task-surface-scope="true"/);
assert.match(checklist, /data-task-surface-source="true"/);
assert.match(checklist, /data-task-surface-subtree="true"/);
assert.match(listItem, /data-task-surface-source="true"/);
assert.match(column, /data-task-surface-source="true"/);
assert.match(css, /data-task-hover-has-descendants="true"/);
assert.match(css, /body:not\(:has\(\[data-kanban-drag-overlay="true"\]\)\)/);
assert.match(css, /ring-2 ring-inset ring-primary-500 bg-primary-50\/60/);
assert.match(css, /\[data-task-surface-source="true"\]\[data-task-selected="true"\]/);
assert.match(css, /\[data-task-surface-source="true"\]:focus-visible/);
assert.match(css, /\[data-task-surface-scope="true"\][^{}]*:has\(> \[data-task-surface-source="true"\][^{}]*\)[^{}]*> \[data-task-surface-subtree="true"\]/);
assert.match(css, /border-color: var\(--color-primary-400\);/);
assert.match(css, /data-kanban-column-subtree-scope="true"/);
assert.match(css, /box-shadow: inset 0 0 0 1px var\(--color-primary-400\);/);
assert.doesNotMatch(css, /ring-2 ring-inset ring-primary-300/);
assert.doesNotMatch(css, /bg-primary-100\/60/);
assert.doesNotMatch(css, /\.kanban-task-card\[data-desktop-task-hover-preview="true"\]/);
assert.match(desktopDropPreview, /matches\('\[data-task-surface-source="true"\]'\)/);
assert.doesNotMatch(desktopDropPreview, /data-task-card-primary/);
assert.match(taskDragTargetAdapter, /matches\('\[data-task-surface-source="true"\]'\)/);
assert.doesNotMatch(taskDragTargetAdapter, /data-mobile-task-card-primary/);
assert.match(boardView, /hasAttribute\('data-task-surface-source'\)/);
assert.doesNotMatch(boardView, /activeData\?\.type === 'wbs-checklist'[\s\S]{0,300}data-task-card-primary/);

console.log(JSON.stringify({
  status: 'passed',
  checks: 40,
  canonicalDescendants: collectTaskDragDescendantIds('root', parentIndex, nodes),
}, null, 2));
