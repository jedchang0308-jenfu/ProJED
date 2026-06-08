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
assertIncludes(store, 'sourceIds.has(dep.fromId) && sourceIds.has(dep.toId)', 'internal dependency filter');
assertIncludes(store, 'idMap.get(dep.fromId)', 'dependency fromId remap');
assertIncludes(store, 'idMap.get(dep.toId)', 'dependency toId remap');
assertIncludes(store, 'detailNotes: node.detailNotes?.map', 'detail note deep copy');
assertIncludes(store, 'createNoteId()', 'new detail note ids');
assertIncludes(store, '（副本）', 'copied root title suffix');
assertIncludes(store, 'options.canCreateDependency === false', 'dependency permission guard');
assertIncludes(store, 'useUndoStore.getState().pushUndo', 'single undo command');
assertOrder(
  store,
  'for (const node of copiedNodes)',
  'for (const dep of copiedDependencies)',
  'parent-first persistence before dependencies'
);

assertIncludes(menu, 'Copy,', 'context menu Copy icon import');
assertIncludes(menu, 'duplicateNodeTree', 'context menu duplicate action binding');
assertIncludes(menu, '<span>複製任務</span>', 'context menu duplicate label');
assertIncludes(menu, 'canCreateDependency', 'dependency permission passed from UI');
assertIncludes(menu, 'toast.success', 'duplicate success feedback');

assertIncludes(spec, 'DEV-013', 'SPEC-013 DEV reference');
assertIncludes(spec, 'Dependencies that connect the copied subtree to outside tasks are not copied.', 'external dependency exclusion spec');
assertIncludes(devTask, 'PM DEV-013', 'DEV-013 task entry');
assertIncludes(backlog, 'DEV-013', 'DEV-013 backlog entry');
assertIncludes(documentationMap, 'SPEC-013-task-tree-duplicate-context-menu', 'DEV-013 documentation map entry');
assertIncludes(
  packageJson.scripts['verify:dev-013-task-duplicate'] || '',
  'scripts/verify-dev-013-task-duplicate.mjs',
  'package verifier script'
);

console.log('DEV-013 task duplicate verifier passed.');
