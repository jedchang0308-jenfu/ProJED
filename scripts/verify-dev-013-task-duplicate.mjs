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
const menu = read('src/components/GlobalContextMenu.tsx');
const spec = read('ai-doc/specs/SPEC-013-task-tree-duplicate-context-menu.md');
const devTask = read('ai-doc/dev_task.md');
const backlog = read('ai-doc/backlog.md');
const documentationMap = read('ai-doc/documentation_map.md');
const packageJson = JSON.parse(read('package.json'));

assertIncludes(store, 'duplicateNodeTree', 'WBS duplicate action');
assertIncludes(store, 'if (!sourceNode || sourceNode.isArchived) return null;', 'archived source task guard');
assertIncludes(store, 'filter((child): child is TaskNode => Boolean(child) && !child.isArchived)', 'archived descendant exclusion');
assertIncludes(store, 'sourceIds.has(dep.fromId) && sourceIds.has(dep.toId)', 'internal dependency filter');
assertIncludes(store, 'idMap.get(dep.fromId)', 'dependency fromId remap');
assertIncludes(store, 'idMap.get(dep.toId)', 'dependency toId remap');
assertIncludes(store, 'detailNotes: node.detailNotes?.map', 'detail note deep copy');
assertIncludes(store, 'createNoteId()', 'new detail note ids');
assertIncludes(store, '（副本）', 'copied root title suffix');
assertIncludes(store, 'collaboratorIds: node.collaboratorIds ? [...node.collaboratorIds] : undefined', 'collaborator ids array copy');
assertIncludes(store, 'tagIds: node.tagIds ? [...node.tagIds] : undefined', 'tag ids array copy');
assertIncludes(store, 'order: isRoot ? copiedRootOrder : node.order', 'root inserted after source while descendants preserve order');
assertIncludes(store, 'createdAt: now', 'new node created timestamp');
assertIncludes(store, 'updatedAt: now', 'new node updated timestamp');
assertIncludes(store, 'isArchived: false', 'copied nodes are active');
assertIncludes(store, 'options.canCreateDependency === false', 'dependency permission guard');
assertIncludes(store, 'useUndoStore.getState().pushUndo', 'single undo command');
assertIncludes(store, 'copiedNodeIds.forEach(nodeId => {', 'undo removes copied subtree');
assertIncludes(store, 'current.dependencies.filter(dep => !copiedDependencyIds.has(dep.id))', 'undo removes copied dependencies');
assertIncludes(store, 'applyDuplicateState();', 'redo reapplies duplicate state');
assertOrder(
  store,
  'for (const node of copiedNodes)',
  'for (const dep of copiedDependencies)',
  'parent-first persistence before dependencies'
);

assertIncludes(menu, 'Copy,', 'context menu Copy icon import');
assertIncludes(menu, 'duplicateNodeTree', 'context menu duplicate action binding');
assertIncludes(menu, '<span>複製任務</span>', 'context menu duplicate label');
assertIncludes(menu, 'disabled={!canCreateTask}', 'duplicate action create_task guard');
assertIncludes(menu, 'canCreateDependency', 'dependency permission passed from UI');
assertIncludes(menu, 'toast.success', 'duplicate success feedback');

assertIncludes(spec, 'DEV-013', 'SPEC-013 DEV reference');
assertIncludes(spec, 'Dependencies that connect the copied subtree to outside tasks are not copied.', 'external dependency exclusion spec');
assertIncludes(devTask, 'DEV-013', 'DEV-013 task entry');
assertIncludes(devTask, '右鍵任務複製', 'DEV-013 task title');
assertIncludes(devTask, 'verify:dev-013-task-duplicate', 'DEV-013 verifier evidence');
assertIncludes(backlog, 'DEV-013', 'DEV-013 backlog entry');
assertIncludes(documentationMap, 'SPEC-013-task-tree-duplicate-context-menu', 'DEV-013 documentation map entry');
assertIncludes(
  packageJson.scripts['verify:dev-013-task-duplicate'] || '',
  'scripts/verify-dev-013-task-duplicate.mjs',
  'package verifier script'
);

console.log('DEV-013 task duplicate verifier passed.');
