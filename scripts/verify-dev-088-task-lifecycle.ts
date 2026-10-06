import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTaskActionCatalog } from '../src/interactions/task/taskActionCatalog';
import { guardTaskAction } from '../src/interactions/task/taskActionGuards';

const read = (path: string) => readFileSync(path, 'utf8');
const source = {
  store: read('src/store/useWbsStore.ts'),
  recycleBin: read('src/components/RecycleBinView.tsx'),
  globalMenu: read('src/components/GlobalContextMenu.tsx'),
  taskMenu: read('src/interactions/task/TaskActionMenu.tsx'),
  mobilePresenter: read('src/components/Wbs/taskDrag/TaskDragPresenter.tsx'),
  mobileCommit: read('src/components/Wbs/taskDrag/taskDragCommit.ts'),
  mobileTypes: read('src/components/Wbs/taskDrag/taskDragTypes.ts'),
  members: read('src/components/BoardMembersPanel.tsx'),
  spec: read('ai-doc/specs/SPEC-088-task-lifecycle-complete-archive-delete.md'),
  qa: read('ai-doc/qa/QA-DEV-088-task-lifecycle-complete-archive-delete.md'),
};

const catalog = getTaskActionCatalog();
const archive = catalog.find(action => action.id === 'task.archive');
assert.deepEqual(
  archive && { label: archive.label, section: archive.section, kind: archive.kind, capability: archive.capability },
  { label: '封存任務', section: 'lifecycle', kind: 'mutation', capability: 'delete' },
  'active task catalog must expose a reversible archive action',
);
assert.equal(catalog.some(action => action.id === ('task.delete-request' as never)), false, 'legacy delete request must leave the active catalog');
assert.equal(guardTaskAction('task.archive', { canDeleteTask: true }).allowed, true);
assert.equal(guardTaskAction('task.archive', { canDeleteTask: false }).allowed, false);

const archiveImplementation = source.store.slice(
  source.store.indexOf('archiveNode: (id) => {'),
  source.store.indexOf('permanentlyDeleteNodes: async'),
);
assert.ok(archiveImplementation.includes("get().updateNode(id, { isArchived: true })"), 'archive must only mark isArchived');
assert.equal(archiveImplementation.includes('removeDependency'), false, 'archive must preserve dependency for restore');

const permanentDeleteImplementation = source.store.slice(source.store.indexOf('permanentlyDeleteNodes: async'));
[
  'if (!root.isArchived)',
  'state.parentNodesIndex[nodeId]',
  'dependencyService.delete',
  'nodeService.delete',
  'getNodeHierarchyDepth(right.id',
  'delete nextNodes[nodeId]',
].forEach(contract => assert.ok(permanentDeleteImplementation.includes(contract), `permanent delete contract missing: ${contract}`));

assert.ok(source.recycleBin.includes('permanentlyDeleteNodes([item.id])'));
assert.ok(source.recycleBin.includes('permanentlyDeleteNodes(archivedItems.map(item => item.id))'));
assert.ok(source.recycleBin.includes('目前看板沒有封存任務。'));
assert.ok(source.recycleBin.includes('封存時間'));
assert.ok(source.recycleBin.includes('此動作無法復原。'));
assert.ok(source.recycleBin.includes('aria-label={`還原任務'));
assert.ok(source.recycleBin.includes('aria-label={`永久刪除任務'));
assert.equal(source.recycleBin.includes('state.removeNode'), false);

assert.ok(source.globalMenu.includes("guardTaskAction('task.archive'"));
assert.ok(source.globalMenu.includes('archiveNode(contextMenuState.nodeId)'));
assert.equal(source.globalMenu.includes('permanentlyDeleteNodes'), false, 'permanent delete must not exist on active task menu');
assert.ok(source.taskMenu.includes("'task.archive': '封存任務'"));
assert.ok(source.mobileTypes.includes("'archive'"));
assert.ok(source.mobilePresenter.includes("key: 'archive'"));
assert.ok(source.mobilePresenter.includes("label: '封存任務'"));
assert.equal(source.mobilePresenter.includes("key: 'delete'"), false);
assert.ok(source.mobileCommit.includes('確定要封存任務'));
assert.ok(source.mobileCommit.includes('dependencies.archiveNode(nodeId)'));
assert.ok(source.members.includes("label: '封存／永久刪除任務'"));

assert.ok(source.spec.includes('完成／取消完成` → `封存` → `永久刪除'));
assert.ok(source.qa.includes('dependency round trip') || source.qa.includes('dependency fingerprint'));

console.log('DEV-088 task lifecycle static contract: PASS');
