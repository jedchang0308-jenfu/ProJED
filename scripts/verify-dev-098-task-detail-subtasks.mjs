import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  sharedTree: 'src/components/Wbs/TaskChecklistTree.tsx',
  boardAdapter: 'src/components/Wbs/KanbanChecklist.tsx',
  detailsSection: 'src/components/TaskDetailsSubtaskSection.tsx',
  detailsModal: 'src/components/TaskDetailsModal.tsx',
  detailsHost: 'src/components/GlobalContextMenu.tsx',
  navigation: 'src/components/taskDetailsNavigation.ts',
  placementController: 'src/components/Wbs/useTaskPlacementController.ts',
  dragSession: 'src/components/Wbs/taskDrag/useTaskDragSession.ts',
  dragTarget: 'src/components/Wbs/taskDrag/taskDragTargetAdapter.ts',
  childTarget: 'src/components/Wbs/taskDrag/taskChildDropTarget.ts',
  presenter: 'src/components/Wbs/taskDrag/TaskDragPresenter.tsx',
  interactionTypes: 'src/interactions/task/types.ts',
  spec: 'ai-doc/specs/SPEC-098-task-detail-subtask-management.md',
  qa: 'ai-doc/qa/QA-DEV-098-task-detail-subtask-management.md',
};

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readFileSync(resolve(file), 'utf8')]));
const results = [];
const assert = (id, ok, details = '') => results.push({ id, status: ok ? 'PASS' : 'FAIL', details });

for (const [key, file] of Object.entries(files)) assert(`S00-${key}-exists`, existsSync(resolve(file)), file);

assert('S01-shared-renderer', source.boardAdapter.includes("import { TaskChecklistTree } from './TaskChecklistTree'")
  && source.detailsSection.includes("import { TaskChecklistTree")
  && source.sharedTree.includes('const TaskChecklistRow')
  && !source.boardAdapter.includes('const ChecklistItem'));
assert('S02-neutral-host-boundary', !source.sharedTree.includes('KanbanDependencyContext')
  && !source.sharedTree.includes('useRecordStore')
  && source.boardAdapter.includes('onDependencySelect')
  && source.boardAdapter.includes('onRecordCapture'));
assert('S03-authoritative-commit', source.detailsSection.includes('commitDesktopTaskDrag')
  && source.detailsSection.includes('useTaskDragSession')
  && !source.detailsSection.includes('parentId:')
  && !source.detailsSection.includes('order: childrenIds.length'));
assert('S04-local-scope', source.detailsSection.includes('<DndContext')
  && source.detailsSection.includes('targetScopeRef: dragScopeRef')
  && source.detailsSection.includes('ref={dragScopeRef}')
  && source.dragSession.includes('scopeElement: dependenciesRef.current.targetScopeRef?.current')
  && source.dragTarget.includes('scopeElement && (!rawElement'));
assert('S05-single-modal-stack', source.navigation.includes('TaskDetailsNavigationEntry')
  && source.detailsHost.includes('useTaskDetailsNavigation')
  && source.detailsHost.split('<TaskDetailsModal').length - 1 === 1
  && !source.navigation.includes('HTMLElement'));
assert('S06-typed-transition', source.detailsModal.includes('type TaskDetailsTransition')
  && source.detailsModal.includes('pendingTransitionRef')
  && source.detailsModal.includes('runTransition')
  && !source.detailsModal.includes('TASK_DETAILS_SAVE_TIMEOUT_MS')
  && !source.detailsModal.includes('outcome-unknown'));
assert('S07-overlay-ownership', source.detailsSection.includes('overlayBaseZIndex={10020}')
  && source.presenter.includes('overlayBaseZIndex')
  && source.detailsModal.includes('data-task-details-back="true"'));
assert('S08-no-schema-boundary', !source.detailsSection.includes('migration')
  && !source.detailsSection.includes('create table')
  && source.spec.includes('RD Implementation Ready')
  && source.qa.includes('S01～S08'));

const pass = results.filter(result => result.status === 'PASS').length;
const fail = results.length - pass;
const output = { dev: 'DEV-098', revision: 'working-tree', status: fail === 0 ? 'PASS' : 'FAIL', summary: { pass, fail }, results };
const artifactPath = resolve('output/qa/dev-098/result.json');
mkdirSync(resolve('output/qa/dev-098'), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output, null, 2));
if (fail > 0) process.exit(1);
