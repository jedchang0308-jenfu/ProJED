import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const toolbar = read('src/components/MindMap/MindMapToolbar.tsx');
const view = read('src/components/MindMap/MindMapView.tsx');
const keyboard = read('src/components/MindMap/mindMapKeyboard.ts');
const emptyState = read('src/components/MindMap/MindMapEmptyState.tsx');
const toolbarInvocationStart = view.indexOf('<MindMapToolbar');
const toolbarInvocationEnd = view.indexOf('/>', toolbarInvocationStart);
const toolbarInvocation = view.slice(toolbarInvocationStart, toolbarInvocationEnd >= 0 ? toolbarInvocationEnd : undefined);

const results = [
  {
    id: 'MINDMAP-078-001',
    label: 'mind map toolbar removes the create-task button and helper hint',
    ok: !toolbar.includes('data-mindmap-create-root') &&
      !toolbar.includes('新增任務') &&
      !toolbar.includes('Enter 新增同階，Tab 新增子任務，Delete 刪除'),
  },
  {
    id: 'MINDMAP-078-002',
    label: 'toolbar keeps relationship and zoom controls',
    ok: toolbar.includes('data-mindmap-note-relationship-tool') &&
      toolbar.includes('data-mindmap-zoom-controls') &&
      toolbar.includes('data-mindmap-zoom-out') &&
      toolbar.includes('data-mindmap-zoom-in') &&
      toolbar.includes('data-mindmap-zoom-reset') &&
      toolbar.includes('data-mindmap-zoom-fit'),
  },
  {
    id: 'MINDMAP-078-003',
    label: 'view no longer passes removed toolbar create-task props',
    ok: !toolbarInvocation.includes('onCreateRoot=') &&
      !toolbar.includes('canCreateTask') &&
      toolbarInvocation.includes('onZoomFit={fitToContent}'),
  },
  {
    id: 'MINDMAP-078-004',
    label: 'keyboard create and delete actions remain implemented',
    ok: keyboard.includes("event.key === 'Enter'") &&
      keyboard.includes("event.key === 'Tab'") &&
      keyboard.includes("event.key === 'Delete'") &&
      view.includes("action.type === 'create-sibling'") &&
      view.includes("action.type === 'create-child'") &&
      view.includes("action.type === 'archive-selected-node'"),
  },
  {
    id: 'MINDMAP-078-005',
    label: 'empty mind map keeps the first-task creation fallback',
    ok: emptyState.includes('data-mindmap-empty') &&
      emptyState.includes('新增第一個任務') &&
      emptyState.includes('onClick={onCreateRoot}'),
  },
];

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: { pass: results.length - failed.length, fail: failed.length },
  results,
}, null, 2));

if (failed.length > 0) process.exit(1);
