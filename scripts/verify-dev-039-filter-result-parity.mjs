import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  resultProjection: 'src/features/taskFilters/resultProjection.ts',
  assigneeOptions: 'src/features/taskFilters/assigneeOptions.ts',
  index: 'src/features/taskFilters/index.ts',
  boardView: 'src/components/BoardView.tsx',
  kanbanColumn: 'src/components/Wbs/KanbanColumn.tsx',
  kanbanCard: 'src/components/Wbs/KanbanCard.tsx',
  kanbanChecklist: 'src/components/Wbs/KanbanChecklist.tsx',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  statusFilterBar: 'src/components/ui/StatusFilterBar.tsx',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md',
  qa: 'ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md',
  qc: 'ai-doc/qc/QC-DEV-039-task-filter-core-and-workbench-profiles.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
  backlog: 'ai-doc/backlog.md',
  browserVerifier: 'scripts/verify-dev-039-filter-result-parity-browser.pw.js',
};

const read = file => readFileSync(resolve(file), 'utf8');
const results = [];
const assert = (name, ok, details = undefined) => results.push({ name, ok, details });

for (const [label, file] of Object.entries(files)) {
  assert(`file exists:${label}`, existsSync(resolve(file)), file);
}

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([, file]) => existsSync(resolve(file)))
    .map(([label, file]) => [label, read(file)]),
);

assert(
  'result projection exposes canonical matched and context-only sets',
  source.resultProjection.includes('projectTaskFilterResults') &&
    source.resultProjection.includes('isTaskEffectivelyVisible') &&
    source.resultProjection.includes('matchedTaskIds') &&
    source.resultProjection.includes('visibleContainerIds') &&
    source.resultProjection.includes('contextOnlyContainerIds') &&
    source.resultProjection.includes('visibleTaskIds') &&
    source.resultProjection.includes('currentParentId') &&
    source.resultProjection.includes('isStructuralRootParent') &&
    source.resultProjection.includes('if (!parent) return false') &&
    source.resultProjection.includes('if (parent.isArchived) return false') &&
    source.resultProjection.includes('if (!isSameBoard(parent, boardId)) return false') &&
    source.resultProjection.includes('if (!isTaskEffectivelyVisible(node, nodesById, { boardId })) return') &&
    source.resultProjection.includes('matchesTaskFilters(node, filters)'),
);

assert(
  'task filter index exports projection and selected-board assignee helpers',
  source.index.includes("export * from './resultProjection'") &&
    source.index.includes("export * from './assigneeOptions'"),
);

assert(
  'BoardView uses projection for root visibility and passes it to columns',
  source.boardView.includes('projectTaskFilterResults') &&
    source.boardView.includes('filterProjection.visibleTaskIds.has(n.id)') &&
    source.boardView.includes('filterProjection={filterProjection}') &&
    !source.boardView.includes('matchesTaskFilters(n, taskFilters)'),
);

assert(
  'Kanban hierarchy uses projection visibility instead of per-level predicate filtering',
  source.kanbanColumn.includes('filterProjection?: TaskFilterResultProjection') &&
    source.kanbanColumn.includes('filterProjection.visibleTaskIds.has(child.id)') &&
    source.kanbanColumn.includes('filterProjection={filterProjection}') &&
    !source.kanbanColumn.includes('matchesTaskFilters') &&
    source.kanbanCard.includes('filterProjection?: TaskFilterResultProjection') &&
    source.kanbanCard.includes('filterProjection={filterProjection}') &&
    source.kanbanChecklist.includes('filterProjection?: TaskFilterResultProjection') &&
    source.kanbanChecklist.includes('filterProjection.visibleTaskIds.has(n.id)') &&
    source.kanbanChecklist.includes('filterProjection={filterProjection}') &&
    !source.kanbanChecklist.includes('matchesTaskFilters'),
);

assert(
  'Task Workbench lists filtered placed ids in the due-date sorted placed task list and keeps unplaced separate',
  source.taskWorkbench.includes('projectTaskFilterResults') &&
    source.taskWorkbench.includes('isTaskEffectivelyVisible') &&
    source.taskWorkbench.includes('filterProjectionByBoardId') &&
    source.taskWorkbench.includes('loadedPlacedTasks') &&
    source.taskWorkbench.includes('visiblePlacedTasks') &&
    source.taskWorkbench.includes('sortedPlacedTasks') &&
    source.taskWorkbench.includes('sortTasksByDueDate(visiblePlacedTasks)') &&
    source.taskWorkbench.includes('tasks={unplacedTasks}') &&
    source.taskWorkbench.includes('data-task-workbench-all-tasks-list="true"') &&
    source.taskWorkbench.includes('data-task-workbench-all-task-card') &&
    source.taskWorkbench.includes('placement="placed"') &&
    source.taskWorkbench.includes('filterProjectionByBoardId.get(task.boardId)?.matchedTaskIds.has(task.id)') &&
    !source.taskWorkbench.includes('mergeUnplacedTasks') &&
    !source.taskWorkbench.includes('sortTasksByDueDate(mergeUnplacedTasks') &&
    !source.taskWorkbench.includes('loadedBoardTasks.filter(task => matchesTaskFilters'),
);

assert(
  'Task Workbench filter uses board-filter-like overlay trigger',
    source.taskWorkbench.includes('data-task-workbench-filter-popover="true"') &&
    source.taskWorkbench.includes('aria-expanded={panelPrefs.filtersOpen}') &&
    source.taskWorkbench.includes('data-active-task-workbench-filter-count') &&
    source.taskWorkbench.includes('data-task-workbench-filter-control-area="true"') &&
    source.taskWorkbench.includes('<TaskConditionFilterControls') &&
    !source.taskWorkbench.includes('relative mt-3 flex justify-end" data-task-workbench-filter-control-area="true"') &&
    !source.taskWorkbench.includes('space-y-3 border-t border-slate-100 p-3" data-task-workbench-filter-panel'),
);

assert(
  'Board and Workbench assignee option source is aligned to selected board context',
  source.assigneeOptions.includes('createBoardAssigneeFilterOptions') &&
    source.assigneeOptions.includes('workspaceMembers.forEach') &&
    source.assigneeOptions.includes('getTaskAssigneeIds(node).forEach(assigneeId =>') &&
    source.assigneeOptions.includes('workspaceMemberLabels.get(assigneeId)') &&
    source.assigneeOptions.includes('member.boardId !== boardId') &&
    source.assigneeOptions.includes('node.boardId !== boardId') &&
    source.statusFilterBar.includes('createBoardAssigneeFilterOptions(activeBoardId, boardMembers, nodes, workspaceMembers)') &&
    source.taskWorkbench.includes('createBoardAssigneeFilterOptions(selectedBoardId, boardMembers, nodes, workspaceMembers)'),
);

assert(
  'Phase 1C scripts are registered',
  source.packageJson.includes('"verify:dev-039-filter-result-parity"') &&
    source.packageJson.includes('"verify:dev-039-filter-result-parity-browser"') &&
    source.browserVerifier.includes('dev039-filter-parity-leaf') &&
    source.browserVerifier.includes('context-only ancestor'),
);

assert(
  'DEV-039 documents record Phase 1C and the completed local delivery entry',
  source.spec.includes('Phase 1C RD Contract') &&
    source.spec.includes('matchedTaskIds') &&
    source.spec.includes('context-only') &&
    source.qa.includes('Phase 1C Filter Result Parity Verification') &&
    source.qc.includes('Phase 1C QC Gate') &&
    source.devTask.includes('DEV-039 [交付點] [完成]') &&
    source.documentationMap.includes('Phase 1C') &&
    source.backlog.includes('Phase 1C') &&
    source.devTask.includes('QA/QC-DEV-039') &&
    source.qc.includes('Phase 1C QC Gate（Passed）'),
);

const failed = results.filter(result => !result.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  summary: {
    pass: results.length - failed.length,
    fail: failed.length,
  },
  results,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
