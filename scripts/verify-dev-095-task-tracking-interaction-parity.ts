import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const checks: Array<{ id: string; status: 'PASS'; evidence: string }> = [];
const check = (id: string, evidence: string, assertion: () => void) => {
  assertion();
  checks.push({ id, status: 'PASS', evidence });
};

const frame = read('src/components/Wbs/TaskSurfaceFrame.tsx');
const controller = read('src/components/Wbs/useTaskPlacementController.ts');
const tree = read('src/components/Wbs/TaskPlacementTree.tsx');
const sharedChecklistTree = read('src/components/Wbs/TaskChecklistTree.tsx');
const listItem = read('src/components/Wbs/WbsNodeItem.tsx');
const card = read('src/components/Wbs/KanbanCard.tsx');
const checklist = read('src/components/Wbs/KanbanChecklist.tsx');
const column = read('src/components/Wbs/KanbanColumn.tsx');
const board = read('src/components/BoardView.tsx');
const menu = read('src/components/GlobalContextMenu.tsx');
const details = read('src/components/TaskDetailsModal.tsx');
const binding = read('src/interactions/task/useTaskInteractionBinding.ts');
const profiles = read('src/interactions/task/profiles.ts');
const commit = read('src/components/Wbs/taskDrag/taskDragCommit.ts');
const session = read('src/components/Wbs/taskDrag/useTaskDragSession.ts');

check('S07-shared-pure-surface', 'List, Kanban and checklist accept a placement reference while sharing their primary renderer; only TaskSurfaceFrame owns the dashed branch.', () => {
  assert.equal(existsSync(resolve(root, 'src/components/Wbs/TrackingReferenceItem.tsx')), false);
  for (const [name, source] of [['list', listItem], ['card', card], ['column', column]] as const) {
    assert.match(source, /trackingReference\?: TaskTrackingReference/);
    assert.match(source, /useTaskPlacementController/);
    assert.match(source, /TaskSurfaceFrame/);
    assert.doesNotMatch(source, /TrackingReference(?:ListContent|CardContent|ChecklistContent|Subtree|Item)/, `${name} contains a reference-only renderer`);
  }
  assert.match(checklist, /trackingReference\?: TaskTrackingReference/);
  assert.match(checklist, /TaskChecklistTree/);
  assert.match(sharedChecklistTree, /useTaskPlacementController/);
  assert.match(sharedChecklistTree, /TaskSurfaceFrame/);
  assert.doesNotMatch(sharedChecklistTree, /TrackingReference(?:ListContent|CardContent|ChecklistContent|Subtree|Item)/, 'shared checklist contains a reference-only renderer');
  assert.match(frame, /borderStyle:\s*'dashed'/);
  assert.match(frame, /borderWidth:\s*2/);
  assert.match(frame, /追蹤副本/);
});

check('S08-shared-interaction-and-capability', 'Both placement kinds construct one placement context, one interaction binding and one capability-aware details/action pipeline.', () => {
  assert.match(controller, /placementKind/);
  assert.match(controller, /useTaskInteractionBinding/);
  assert.match(controller, /activationProps/);
  assert.match(binding, /taskPlacementContext:\s*placementContext/);
  assert.match(profiles, /'pointer\.double':\s*'task\.open-details'/);
  assert.match(profiles, /'keyboard\.space':\s*'task\.open-details'/);
  assert.match(menu, /useTaskPlacementPermissions\(currentNode, currentTrackingReference\)/);
  assert.match(menu, /task\.remove-tracking-reference/);
  assert.doesNotMatch(menu, /trackingReferenceId[\s\S]{0,160}actionId === 'task\.open-details'/);
  assert.match(details, /useTaskPlacementPermissions\(node, trackingReference\)/);
  assert.doesNotMatch(details, /&&\s*!trackingReferenceId/);
});

check('S09-shared-drag-kernel', 'Sortable, pointer/keyboard sensors and mobile long-press share one controller; command routing branches only on placement identity.', () => {
  assert.match(controller, /useSortable/);
  assert.match(controller, /useTaskGestureSurface/);
  assert.match(controller, /taskId:\s*task\.id[\s\S]*placementId[\s\S]*placementKind/);
  assert.match(board, /commitDesktopTaskDrag/);
  assert.match(commit, /activeData\?\.trackingReference/);
  assert.match(commit, /observation\.source\.trackingReferenceId/);
  assert.match(commit, /moveTrackingReference/);
  assert.match(session, /trackingReferenceId:\s*task\.trackingReferenceId/);
  assert.match(session, /placementId:\s*task\.placementId/);
});

check('S10-shared-recursive-placement-tree', 'Primary and tracking descendants merge by placementId in one recursive tree and the same child surface components.', () => {
  assert.match(tree, /primaryTasks/);
  assert.match(tree, /trackingReferences/);
  assert.match(tree, /primaryPlacementId/);
  assert.match(tree, /SortableContext items=\{rows\.map\(row => row\.placementId\)\}/);
  for (const [name, source] of [['list', read('src/components/Wbs/WbsListView.tsx')], ['list item', listItem], ['column', column]] as const) {
    assert.match(source, /TaskPlacementTree/, `${name} does not use TaskPlacementTree`);
  }
  assert.match(checklist, /TaskChecklistTree/);
  assert.match(sharedChecklistTree, /TaskPlacementTree/);
  assert.match(listItem, /<WbsNodeItem[\s\S]*trackingReference=\{row\.reference\}/);
  assert.match(sharedChecklistTree, /<TaskChecklistRow[\s\S]*trackingReference=\{row\.reference\}/);
  assert.match(column, /<KanbanCard[\s\S]*trackingReference=\{row\.reference\}/);
});

const result = {
  dev: 'DEV-095',
  devId: 'DEV-095',
  sourceRevision: 'working-tree',
  environment: 'source-interaction-parity',
  provider: 'local-source',
  status: 'passed',
  passed: true,
  checks,
  summary: { PASS: checks.length, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
  scope: 'S07-S10 source and architecture contract; browser behavior remains a separate B17-B24 artifact.',
  generatedAt: new Date().toISOString(),
};
const output = resolve(root, 'output/qa/dev-095/interaction-parity-source-result.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
checks.forEach(item => console.log(`PASS ${item.id}: ${item.evidence}`));
console.log(`DEV-095 interaction parity source contract: ${checks.length} passed`);
