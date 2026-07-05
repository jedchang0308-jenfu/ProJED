import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = {
  taskWorkbenchSource: 'src/features/taskWorkbench/source.ts',
  taskWorkbench: 'src/components/TaskWorkbenchPanel.tsx',
  resultProjection: 'src/features/taskFilters/resultProjection.ts',
  wbsStore: 'src/store/useWbsStore.ts',
  dataBackend: 'src/services/dataBackend.ts',
  firestoreService: 'src/services/firestoreService.ts',
  localTestService: 'src/services/localTestService.ts',
  supabaseSync: 'src/hooks/useSupabaseSync.ts',
  firestoreSync: 'src/hooks/useFirestoreSync.ts',
  packageJson: 'package.json',
  spec: 'ai-doc/specs/SPEC-039-task-filter-core-and-workbench-profiles.md',
  qa: 'ai-doc/qa/QA-DEV-039-task-filter-core-and-workbench-profiles.md',
  devTask: 'ai-doc/dev_task.md',
  documentationMap: 'ai-doc/documentation_map.md',
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
  'workbench source exposes cross-board list and unplaced merge helpers',
  source.taskWorkbenchSource.includes('listWorkbenchTasks') &&
    source.taskWorkbenchSource.includes('mergeUnplacedTasks') &&
    source.taskWorkbenchSource.includes('isTaskWorkbenchSortableTask') &&
    source.taskWorkbenchSource.includes("task.nodeType !== 'group'") &&
    source.taskWorkbenchSource.includes('nodeService.listByProject') &&
    source.taskWorkbenchSource.includes('Promise.all') &&
    source.taskWorkbenchSource.includes('loadedBoardIds') &&
    source.taskWorkbenchSource.includes('failedBoardIds') &&
    source.taskWorkbenchSource.includes('results.flatMap(result => result.tasks)'),
);

assert(
  'generic nodeService exposes listByProject for all supported backends',
  source.dataBackend.includes('listByProject: (workspaceId: string, boardId: string): Promise<TaskNode[]>') &&
    source.dataBackend.includes('localTestNodeService.listByProject(workspaceId, boardId)') &&
    source.dataBackend.includes('supabaseNodeService.listByProject(workspaceId, boardId)') &&
    source.dataBackend.includes('firestoreNodeService.listByProject(workspaceId, boardId)') &&
    source.firestoreService.includes('listByProject: async (wsId: string, bId: string): Promise<TaskNode[]>') &&
    source.firestoreService.includes("collection(db, 'workspaces', wsId, 'boards', bId, 'nodes')") &&
    source.localTestService.includes('listByProject: async (workspaceId: string, boardId: string): Promise<TaskNode[]>') &&
    source.localTestService.includes('node.workspaceId === workspaceId && node.boardId === boardId'),
);

assert(
  'local-test node sanitizer does not re-root missing-parent or cycle nodes into visible containers',
  source.localTestService.includes("current === 'root' || current === node.boardId") &&
    source.localTestService.includes('isArchived: true') &&
    !source.localTestService.includes("nodeType: node.nodeType === 'milestone' ? 'milestone' : 'group'"),
);

assert(
  'WBS setNodes supports board-scoped replacement without overwriting cross-board source',
  source.wbsStore.includes('export type SetNodesOptions') &&
    source.wbsStore.includes('scopeBoardIds?: string[]') &&
    source.wbsStore.includes('preserveOutOfScope?: boolean') &&
    source.wbsStore.includes('setNodes: (nodes: TaskNode[], options?: SetNodesOptions) => void') &&
    source.wbsStore.includes('mergeLocalUnplacedTasksForSetNodes(nodes, get().nodes, options)') &&
    source.wbsStore.includes('options.preserveOutOfScope') &&
    source.wbsStore.includes('const hasScopedBoards = scopedBoardIds.size > 0') &&
    source.wbsStore.includes('scopedBoardIds.has(task.boardId)'),
);

assert(
  'active board sync preserves out-of-scope workbench boards',
  source.supabaseSync.includes('scopeBoardIds: [activeBoardId]') &&
    source.supabaseSync.includes('preserveOutOfScope: true') &&
    source.firestoreSync.includes('scopeBoardIds: [activeBoardId]') &&
    source.firestoreSync.includes('preserveOutOfScope: true'),
);

assert(
  'TaskWorkbenchPanel loads all boardOptions and does not source all-sorted tasks from active board only',
  source.taskWorkbench.includes("from '../features/taskWorkbench/source'") &&
    source.taskWorkbench.includes('listWorkbenchTasks(boardOptions)') &&
    source.taskWorkbench.includes('setNodes(workbenchSource.tasks, {') &&
    source.taskWorkbench.includes('scopeBoardIds: workbenchSource.loadedBoardIds') &&
    source.taskWorkbench.includes('preserveOutOfScope: workbenchSource.failedBoardIds.length > 0') &&
    source.taskWorkbench.includes('showContainersInAllTasks') &&
    source.taskWorkbench.includes('data-task-workbench-show-containers-toggle="true"') &&
    source.taskWorkbench.includes('isTaskWorkbenchSortableTask(task)') &&
    source.taskWorkbench.includes('!panelPrefs.showContainersInAllTasks && !isTaskWorkbenchSortableTask(task)') &&
    source.taskWorkbench.includes('boardScopeIds') &&
    source.taskWorkbench.includes('boardScopeIdSet.has(task.boardId)') &&
    source.taskWorkbench.includes('isTaskEffectivelyVisible(task, nodes, { boardId: task.boardId })') &&
    source.taskWorkbench.includes('mergeUnplacedTasks(visiblePlacedTasks, unplacedTasks)') &&
    source.taskWorkbench.includes('filterProjectionByBoardId.get(task.boardId)?.matchedTaskIds.has(task.id)') &&
    !source.taskWorkbench.includes('Object.values(nodes)\n    .filter((task): task is TaskNode => Boolean(task) && !task.isArchived'),
);

assert(
  'filter projection excludes archived ancestors before matching',
  source.resultProjection.includes('isTaskEffectivelyVisible') &&
    source.resultProjection.includes('currentParentId') &&
    source.resultProjection.includes('isStructuralRootParent') &&
    source.resultProjection.includes("parentId === 'root'") &&
    source.resultProjection.includes('if (!parent) return false') &&
    source.resultProjection.includes('if (parent.isArchived) return false') &&
    source.resultProjection.includes('if (!isSameBoard(parent, boardId)) return false') &&
    source.resultProjection.includes('if (!isTaskEffectivelyVisible(node, nodesById, { boardId })) return') &&
    source.resultProjection.indexOf('if (!isTaskEffectivelyVisible(node, nodesById, { boardId })) return') <
      source.resultProjection.indexOf('matchesTaskFilters(node, filters)'),
);

assert(
  'Phase 2 docs record cross-board source and deletion visibility gates',
  source.spec.includes('listWorkbenchTasks()') &&
    source.spec.includes('mergeUnplacedTasks()') &&
    source.spec.includes('effectiveVisibility()') &&
    source.spec.includes('active board A') &&
    source.qa.includes('Active board independence') &&
    source.qa.includes('Archived ancestor removal') &&
    source.devTask.includes('所有任務排序') &&
    source.devTask.includes('setNodes(activeBoardNodes)') &&
    source.documentationMap.includes('所有任務排序'),
);

assert(
  'package script is registered',
  source.packageJson.includes('"verify:dev-039-task-workbench-cross-board-source"'),
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
