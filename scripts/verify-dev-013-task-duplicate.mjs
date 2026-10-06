import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const assertIncludes = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
};

const assertOrder = (content, first, second, label) => {
  const firstIndex = content.indexOf(first);
  const secondIndex = content.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    throw new Error(`Invalid order for ${label}.`);
  }
};

const store = read('src/store/useWbsStore.ts');
const clonePlan = read('src/features/taskClonePlan.ts');
const menu = read('src/components/GlobalContextMenu.tsx');
const sharedTaskMenu = read('src/interactions/task/TaskActionMenu.tsx');
const taskActionCatalog = read('src/interactions/task/taskActionCatalog.ts');
const spec = read('ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md');
const devTask = read('ai-doc/dev_task.md');
const backlog = read('ai-doc/backlog.md');
const documentationMap = read('ai-doc/documentation_map.md');
const packageJson = JSON.parse(read('package.json'));

assertIncludes(store, 'duplicateNodeTree', 'WBS duplicate action');
assertIncludes(store, 'if (!sourceNode || sourceNode.isArchived) return null;', 'archived source task guard');
assertIncludes(store, 'filter((child): child is TaskNode => Boolean(child) && !child.isArchived)', 'archived descendant exclusion');
assertIncludes(store, 'sourceIds.has(dep.fromId) && sourceIds.has(dep.toId)', 'internal dependency filter');
assertIncludes(clonePlan, 'idMap.get(dependency.fromId)', 'dependency fromId remap');
assertIncludes(clonePlan, 'idMap.get(dependency.toId)', 'dependency toId remap');
assertIncludes(clonePlan, 'detailNotes: source.detailNotes?.map', 'detail note deep copy');
assertIncludes(clonePlan, 'input.createNoteId()', 'new detail note ids');
assertIncludes(clonePlan, '（副本）', 'copied root title suffix');
assertIncludes(clonePlan, 'collaboratorIds: source.collaboratorIds ? [...source.collaboratorIds] : undefined', 'collaborator ids array copy');
assertIncludes(clonePlan, 'tagIds: source.tagIds ? [...source.tagIds] : undefined', 'tag ids array copy');
assertIncludes(clonePlan, 'order: isRoot ? rootOrder : normalizedChildOrderById.get(source.id) ?? 0', 'root insertion and normalized descendant order');
assertIncludes(clonePlan, 'createdAt: input.now', 'new node created timestamp');
assertIncludes(clonePlan, 'updatedAt: input.now', 'new node updated timestamp');
assertIncludes(clonePlan, 'isArchived: false', 'copied nodes are active');
assertIncludes(store, 'options.canCreateDependency === false', 'dependency permission guard');
assertIncludes(store, 'useUndoStore.getState().pushUndo', 'single undo command');
assertIncludes(store, 'const outcome = await get().commitNodeForestCreate({', 'shared durable forest transaction');
assertIncludes(store, 'existingUpdatesById: Object.fromEntries(changedSiblingOrders.map', 'complete sibling integer reindex');
assertIncludes(store, 'const persistRemove = async () => {', 'undo removes copied forest through the shared transaction');
assertIncludes(store, 'const outcome = await get().commitNodeForestCreate(input);', 'redo reapplies the shared forest transaction');
assertOrder(
  store,
  'for (const node of plannedNodes)',
  'for (const dependency of plannedDependencies)',
  'parent-first persistence before dependencies'
);

assertIncludes(sharedTaskMenu, "'task.duplicate': <Copy", 'context menu Copy icon binding');
assertIncludes(menu, 'duplicateNodeTree', 'context menu duplicate action binding');
assertIncludes(sharedTaskMenu, "'task.duplicate': '複製任務'", 'context menu duplicate label');
assertIncludes(taskActionCatalog, "id: 'task.duplicate', label: '複製任務'", 'duplicate action catalog contract');
assertIncludes(menu, 'candidateTaskActionEnabled = getTaskActionEnabledMap', 'duplicate action capability guard');
assertIncludes(menu, 'canCreateDependency', 'dependency permission passed from UI');
assertIncludes(menu, 'toast.success', 'duplicate success feedback');

assertIncludes(spec, 'DEV-013', 'SPEC-013 DEV reference');
assertIncludes(spec, 'Dependencies that connect the copied subtree to outside tasks are not copied.', 'external dependency exclusion spec');
assertIncludes(devTask, 'DEV-013', 'DEV-013 task entry');
if (!devTask.includes('右鍵任務複製') && !devTask.includes('任務子樹複製')) {
  throw new Error('Missing DEV-013 task title.');
}
assertIncludes(packageJson.scripts['verify:dev-013-task-duplicate'] || '', 'scripts/verify-dev-013-task-duplicate.mjs', 'DEV-013 verifier evidence');
assertIncludes(backlog, 'DEV-013', 'DEV-013 backlog entry');
assertIncludes(documentationMap, 'SPEC-013-task-tree-duplicate-context-menu', 'DEV-013 documentation map entry');
assertIncludes(
  packageJson.scripts['verify:dev-013-task-duplicate'] || '',
  'scripts/verify-dev-013-task-duplicate.mjs',
  'package verifier script'
);

console.log('DEV-013 task duplicate verifier passed.');
