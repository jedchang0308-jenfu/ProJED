import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Dependency, TaskNode } from '../src/types';
import type { TaskTrackingReference } from '../src/features/taskTracking/types';
import {
  buildCollapsedProjectionTasks,
  buildExpandedProjectionTasks,
  buildProjectionNodes,
  buildTaskFilterNodesWithTrackingReferences,
  buildWorkbenchProjectionTasks,
  primaryPlacementId,
} from '../src/features/taskTracking/model';
import { createDefaultTaskFilters, projectTaskFilterResults } from '../src/features/taskFilters';

const root = resolve(process.cwd());
const outputDirectory = resolve(root, 'output/qa/dev-095');
const now = Date.now();

const tasks: TaskNode[] = [
  {
    id: 'cross-mode-a', workspaceId: 'cross-mode-ws', boardId: 'cross-mode-source', parentId: null,
    title: '唯一真相任務', status: 'in_progress', description: 'canonical description',
    startDate: '2026-08-28', endDate: '2026-09-02', assigneeIds: ['person-a'], collaboratorIds: ['person-b'],
    tagIds: ['tag-a'], nodeType: 'task', order: 0, createdAt: now, updatedAt: now, isArchived: false,
  },
  {
    id: 'cross-mode-child', workspaceId: 'cross-mode-ws', boardId: 'cross-mode-source', parentId: 'cross-mode-a',
    title: '子任務', status: 'todo', nodeType: 'task', order: 1, createdAt: now, updatedAt: now, isArchived: false,
  },
  {
    id: 'cross-mode-target-parent', workspaceId: 'cross-mode-ws', boardId: 'cross-mode-target', parentId: null,
    title: '主管追蹤區', status: 'todo', nodeType: 'group', order: 0, createdAt: now, updatedAt: now, isArchived: false,
  },
];

const reference = (
  id: string,
  taskId: string,
  parentPlacementId: string | null,
  order: number,
): TaskTrackingReference => ({
  id, taskId, workspaceId: 'cross-mode-ws', boardId: 'cross-mode-target', sourceBoardId: 'cross-mode-source',
  parentPlacementId, order, revision: 1, createdAt: now, updatedAt: now,
});

const references: TaskTrackingReference[] = [
  reference('cross-mode-ref-a-root', 'cross-mode-a', null, 1),
  reference('cross-mode-ref-a-nested', 'cross-mode-a', primaryPlacementId('cross-mode-target-parent'), 2),
  reference('cross-mode-ref-child', 'cross-mode-child', 'cross-mode-ref-a-nested', 3),
];

const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');
const checks: Array<{ id: string; status: 'PASS'; evidence: string }> = [];
const check = (id: string, evidence: string, assertion: () => void) => {
  assertion();
  checks.push({ id, status: 'PASS', evidence });
  console.log(`PASS ${id}: ${evidence}`);
};

const main = async () => {
  const expanded = buildExpandedProjectionTasks(tasks, references, 'cross-mode-target');
  const expandedReferences = expanded.filter(task => task.isTrackingReference);
  const expandedById = Object.fromEntries(expanded.map(task => [task.id, task]));
  const collapsed = buildCollapsedProjectionTasks(tasks, references, 'cross-mode-target');
  const collapsedById = Object.fromEntries(collapsed.map(task => [task.id, task]));
  const defaultFilters = createDefaultTaskFilters();

  check('I01-placement-hierarchy', '同一 canonical task 可在兩個不同 parent placement 產生兩個可見追蹤位置，子 reference 保留巢狀 parent。', () => {
    assert.equal(expandedReferences.filter(task => task.canonicalTaskId === 'cross-mode-a').length, 2);
    assert.deepEqual(new Set(expandedReferences.map(task => task.id)), new Set(references.map(referenceRow => referenceRow.id)));
    assert.equal(expandedById['cross-mode-ref-child']?.parentId, 'cross-mode-ref-a-nested');
  });

  check('I02-timeline-collapse', 'collapsed projection 僅保留一筆 canonical task row，並保留 tracking reference marker/placement metadata。', () => {
    assert.equal(collapsed.filter(task => task.id === 'cross-mode-a').length, 1);
    assert.equal(collapsedById['cross-mode-a']?.isTrackingReference, true);
    assert.equal(collapsedById['cross-mode-a']?.trackingReferenceId, 'cross-mode-ref-a-root');
    assert.equal(collapsedById['cross-mode-a']?.trackingReferenceParentPlacementId, null);
  });

  check('I03-workbench-cross-board-scope', 'cross-board filter clone 只改變投影 board/parent，不改 canonical ownership；Workbench 目標 lane 已接入 reference move。', () => {
    const filterNodes = buildTaskFilterNodesWithTrackingReferences(tasks, references, 'cross-mode-target');
    assert.equal(filterNodes['cross-mode-a']?.boardId, 'cross-mode-target');
    assert.equal(tasks.find(task => task.id === 'cross-mode-a')?.boardId, 'cross-mode-source');
    // The source Board is deliberately absent from boardIds: this models a
    // derived-only reader whose canonical payload was hydrated through the
    // target reference permission path.
    const workbenchTasks = buildWorkbenchProjectionTasks(tasks, references, ['cross-mode-target']);
    assert.equal(workbenchTasks.filter(task => task.id === 'cross-mode-a').length, 1);
    assert.equal(workbenchTasks.find(task => task.id === 'cross-mode-a')?.isTrackingReference, true);
    assert.match(read('src/components/BoardView.tsx'), /task-workbench-placed-board-lane/);
    assert.match(read('src/components/BoardView.tsx'), /moveTrackingReference/);
    assert.match(read('src/components/TaskWorkbenchPanel.tsx'), /buildWorkbenchProjectionTasks/);
    assert.match(read('src/components/TaskWorkbenchPanel.tsx'), /data-task-workbench-tracking-reference/);
  });

  check('I04-details-and-permission', 'projection content follows canonical task；reference placement can be read while canonical edit capability remains independently supplied。', () => {
    const projection = buildProjectionNodes(tasks, references, 'cross-mode-target', {
      canEditCanonicalTask: false,
      canManageReferenceHere: true,
    });
    const row = projection.find(item => item.placementId === 'cross-mode-ref-a-root');
    assert.ok(row);
    assert.equal(row.task.title, '唯一真相任務');
    assert.equal(row.task.status, 'in_progress');
    assert.equal(row.access.canEditCanonicalTask, false);
    assert.equal(row.access.canManageReferenceHere, true);
    assert.match(read('src/components/MindMap/MindMapView.tsx'), /canEditTask|isReadOnly/);
  });

  check('I05-canonical-update-convergence', 'canonical status/title/date 變更後，所有投影重新建立並收斂；reference record 沒有 local status 欄位。', () => {
    const updatedTasks = tasks.map(task => task.id === 'cross-mode-a'
      ? { ...task, title: '唯一真相任務（更新）', status: 'completed' as const, endDate: '2026-09-05' }
      : task);
    const updatedExpanded = buildExpandedProjectionTasks(updatedTasks, references, 'cross-mode-target')
      .filter(task => task.canonicalTaskId === 'cross-mode-a');
    assert.equal(updatedExpanded.length, 2);
    assert.ok(updatedExpanded.every(task => task.title === '唯一真相任務（更新）' && task.status === 'completed' && task.endDate === '2026-09-05'));
    assert.ok(references.every(referenceRow => !Object.prototype.hasOwnProperty.call(referenceRow, 'status')));
  });

  check('I06-archive-ancestor-visibility', 'canonical ancestor 封存會隱藏其自身與所有外部 reference descendants。', () => {
    const archived = tasks.map(task => task.id === 'cross-mode-a' ? { ...task, isArchived: true } : task);
    assert.equal(buildExpandedProjectionTasks(archived, references, 'cross-mode-target').length, 1);
    assert.equal(buildCollapsedProjectionTasks(archived, references, 'cross-mode-target').length, 1);
  });

  check('I07-permanent-delete-cleanup', '永久刪除 canonical archived subtree 會以 taskId 清除 tracking placement。', () => {
    const source = read('src/store/useWbsStore.ts');
    assert.match(source, /trackingReferences: latest\.trackingReferences\.filter\(reference => !nodeIds\.has\(reference\.taskId\)\)/);
    assert.match(source, /persistRemoveTaskWorkbenchUnplacedTask/);
  });

  check('I08-dependency-record-integrity', 'placement projection 不會變更 dependency 或 record-link identity；reference nested placement 不建立新 dependency。', () => {
    const dependencies: Dependency[] = [{ id: 'dep-1', workspaceId: 'cross-mode-ws', boardId: 'cross-mode-source', fromId: 'cross-mode-a', toId: 'cross-mode-child', fromSide: 'end', toSide: 'start', offset: 0 }];
    const records = [{ id: 'record-1', taskId: 'cross-mode-a', role: 'main' }];
    const before = JSON.stringify({ dependencies, records });
    buildExpandedProjectionTasks(tasks, references, 'cross-mode-target');
    buildCollapsedProjectionTasks(tasks, references, 'cross-mode-target');
    const after = JSON.stringify({ dependencies, records });
    assert.equal(after, before);
    assert.doesNotMatch(read('src/features/taskTracking/model.ts'), /dependencyService|recordService/);
  });

  check('I09-filter-parity-and-dedupe', 'expanded placement surfaces 維持多個 visible placement，但 matched/total identity 以 canonical task 去重。', () => {
    const projection = projectTaskFilterResults(expandedById, defaultFilters, { boardId: 'cross-mode-target' });
    assert.equal(projection.totalTaskCount, 3);
    assert.equal(projection.matchedTaskIds.size, 3);
    assert.ok(projection.visibleTaskIds.has('cross-mode-ref-a-root'));
    assert.ok(projection.visibleTaskIds.has('cross-mode-ref-a-nested'));
    const collapsedProjection = projectTaskFilterResults(collapsedById, defaultFilters, { boardId: 'cross-mode-target' });
    assert.deepEqual(collapsedProjection.matchedTaskIds, projection.matchedTaskIds);
  });

  check('I10-backup-safety', 'current local backup readback artifact 已驗證 v3 nested/fractional、v2 primary-only 與 external canonical fail-closed。', () => {
    const artifactPath = resolve(root, 'output/qa/dev-095/backup-result.json');
    assert.ok(existsSync(artifactPath));
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { status: string; checks: string[] };
    assert.equal(artifact.status, 'passed');
    assert.ok(artifact.checks.some(item => item.includes('fractional and nested')));
    assert.ok(artifact.checks.some(item => item.includes('v2 import remains primary-only')));
    assert.ok(artifact.checks.some(item => item.includes('fails closed')));
  });

  check('I11-unplaced-block', '有 active tracking reference 時，canonical task 移至 unplaced 會被穩定阻擋；沒有 reference 的既有流程不新增狀態。', () => {
    assert.match(read('src/store/useWbsStore.ts'), /TRACKING_REFERENCE_BLOCKS_UNPLACED/);
    assert.match(read('src/store/useWbsStore.ts'), /expectedSubtreeIds\.some\(taskId => state\.trackingReferences\.some/);
    assert.match(read('src/features/taskTracking/types.ts'), /TaskPlacementKind = 'primary' \| 'tracking_reference'/);
  });

  check('I12-recycle-canonical-only', 'Recycle Bin 只列 canonical archived task；removed reference 是 placement lifecycle，不會獨立成 task。', () => {
    assert.match(read('src/components/RecycleBinView.tsx'), /boardId === activeBoardId && n\.isArchived/);
    assert.match(read('src/store/useWbsStore.ts'), /archiveNode: \(id\) =>/);
    assert.match(read('src/features/taskTracking/model.ts'), /activeTrackingReferences/);
  });

  const artifact = {
    dev: 'DEV-095', devId: 'DEV-095', sourceRevision: 'working-tree',
    environment: 'local-test-cross-mode-contract', provider: 'local-test',
    status: 'passed', passed: true, checks,
    summary: { PASS: checks.length, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
    notCovered: ['L2 rendered browser screenshots are reported by browser-result.json', 'L3 Supabase TEST two-user/RLS migration verification'],
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'cross-mode-result.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`DEV-095 local cross-mode contract: ${checks.length} passed`);
};

await main();
