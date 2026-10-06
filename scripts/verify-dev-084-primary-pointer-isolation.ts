import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isPrimaryPointerActivation } from '../src/interactions/pointerActivation';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks: string[] = [];
const check = (label: string, callback: () => void) => {
  callback();
  checks.push(label);
};

check('primary pointer helper accepts only the primary button and contact', () => {
  assert.equal(isPrimaryPointerActivation({ button: 0 }), true);
  assert.equal(isPrimaryPointerActivation({ button: 0, isPrimary: true }), true);
  assert.equal(isPrimaryPointerActivation({ button: 0, isPrimary: false }), false);
  assert.equal(isPrimaryPointerActivation({ button: 1 }), false);
  assert.equal(isPrimaryPointerActivation({ button: 2 }), false);
  assert.equal(isPrimaryPointerActivation({ button: 5 }), false);
});

const sensor = read('src/hooks/useDragSensors.ts');
const gantt = read('src/components/Gantt/GanttTaskBar.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const workbench = read('src/components/TaskWorkbenchPanel.tsx');
const recordSidebar = read('src/components/Records/RecordSidebar.tsx');
const relationshipLayer = read('src/components/MindMap/MindMapRelationshipInteractionLayer.tsx');
const mindMapView = read('src/components/MindMap/MindMapView.tsx');
const taskDetails = read('src/components/TaskDetailsModal.tsx');
const boardMembers = read('src/components/BoardMembersPanel.tsx');
const calendar = read('src/components/CalendarSubscriptionsView.tsx');
const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };

check('SmartMouseSensor rejects non-primary events before target handling and activator dispatch', () => {
  assert.match(sensor, /const nativeEvent = \(event as React\.MouseEvent\)\.nativeEvent/);
  assert.match(sensor, /if \(!isPrimaryPointerActivation\(nativeEvent\)\) \{\s*return false;/);
  assert.ok(sensor.indexOf('isPrimaryPointerActivation(nativeEvent)') < sensor.indexOf('const target ='), 'sensor guard must precede target handling');
});

check('Gantt move and both resize handles use the shared guard', () => {
  assert.match(gantt, /if \(!isPrimaryPointerActivation\(e\)\) return;/);
  assert.equal((gantt.match(/isPrimaryPointerActivation\(e\)/g) || []).length, 5, 'Gantt must guard primary starter, mouseup and both resize paths');
  assert.match(gantt, /data-gantt-task-resize-handle="start"/);
  assert.match(gantt, /data-gantt-task-resize-handle="end"/);
  const leftHandle = gantt.indexOf('data-gantt-task-resize-handle="start"');
  const leftGuard = gantt.indexOf('if (!isPrimaryPointerActivation(e)) return;', leftHandle);
  const leftStop = gantt.indexOf('e.stopPropagation();', leftHandle);
  assert.ok(leftGuard >= 0 && leftGuard < leftStop, 'left resize guard must precede stopPropagation');
  const rightHandle = gantt.indexOf('data-gantt-task-resize-handle="end"');
  const rightGuard = gantt.indexOf('if (!isPrimaryPointerActivation(e)) return;', rightHandle);
  const rightStop = gantt.indexOf('e.stopPropagation();', rightHandle);
  assert.ok(rightGuard >= 0 && rightGuard < rightStop, 'right resize guard must precede stopPropagation');
});

check('all panel resizers guard before pointer side effects', () => {
  for (const [label, source, selector] of [
    ['workspace sidebar', sidebar, 'data-sidebar-resize-handle="true"'],
    ['task workbench', workbench, 'data-task-workbench-resize-handle="true"'],
    ['record sidebar', recordSidebar, 'data-record-sidebar-resize-handle="true"'],
  ] as const) {
    assert.match(source, /isPrimaryPointerActivation/);
    assert.match(source, /if \(!isPrimaryPointerActivation\(event\)\) return;/);
    const guard = source.indexOf('if (!isPrimaryPointerActivation(event)) return;');
    const prevent = source.indexOf('event.preventDefault()', guard);
    assert.ok(guard >= 0 && prevent > guard, `${label} guard must precede preventDefault`);
    assert.match(source, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

check('Mindmap relationship selection commits on click while endpoint drag rejects non-primary events', () => {
  assert.match(relationshipLayer, /const selectOrEditRelationship = \(event: React\.MouseEvent/);
  assert.match(relationshipLayer, /onClick=\{\(event\) => selectOrEditRelationship\(event, path\)\}/);
  assert.doesNotMatch(relationshipLayer, /selectRelationshipFromEvent/);
  assert.doesNotMatch(relationshipLayer, /onAuxClick=/);
  assert.match(mindMapView, /if \(!isPrimaryPointerActivation\(event\)\) return;/);
  const viewGuard = mindMapView.indexOf('if (!isPrimaryPointerActivation(event)) return;');
  assert.ok(viewGuard < mindMapView.indexOf('event.preventDefault()', viewGuard));
});

check('modal backdrops require primary activation while content remains delegated', () => {
  for (const [label, source, selector] of [
    ['task details', taskDetails, 'data-task-details-modal="true"'],
    ['board share', boardMembers, 'data-board-share-backdrop="true"'],
    ['calendar delete', calendar, 'data-calendar-subscription-delete-backdrop="true"'],
  ] as const) {
    assert.match(source, /isPrimaryPointerActivation\(event\)/, `${label} must use shared guard`);
    assert.match(source, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(taskDetails, /event\.target === event\.currentTarget && isPrimaryPointerActivation\(event\)/);
  assert.match(boardMembers, /event\.target === event\.currentTarget && isPrimaryPointerActivation\(event\)/);
  assert.match(calendar, /event\.currentTarget === event\.target && !isDeleting && isPrimaryPointerActivation\(event\)/);
});

check('package exposes the DEV-084 static and rendered gates', () => {
  assert.equal(typeof packageJson.scripts?.['verify:dev-084-primary-pointer-isolation'], 'string');
  assert.equal(typeof packageJson.scripts?.['verify:dev-084-primary-pointer-isolation-browser'], 'string');
  assert.match(packageJson.scripts?.['verify:dev-084-primary-pointer-isolation'] || '', /verify-dev-084-primary-pointer-isolation\.ts/);
  assert.match(packageJson.scripts?.['verify:dev-084-primary-pointer-isolation-browser'] || '', /verify-dev-084-primary-pointer-isolation-browser\.pw\.js/);
});

console.log(`DEV-084 static/pure verification PASS (${checks.length}/${checks.length})`);
for (const label of checks) console.log(`PASS ${label}`);
