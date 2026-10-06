import { readFileSync } from 'node:fs';
import { createBlankTaskNode, type CreateBlankTaskNodeInput } from '../src/features/taskCreation/createBlankTaskNode';

const failures: string[] = [];
const checks: Array<{ label: string; status: 'PASS' | 'FAIL' }> = [];
const assert = (label: string, condition: boolean) => {
  checks.push({ label, status: condition ? 'PASS' : 'FAIL' });
  if (!condition) failures.push(label);
};

const read = (path: string) => readFileSync(path, 'utf8');
const count = (source: string, token: string) => source.split(token).length - 1;

const blank = createBlankTaskNode({
  id: 'dev115-blank',
  workspaceId: 'dev115-workspace',
  boardId: 'dev115-board',
  parentId: null,
  order: 4,
  nodeType: 'task',
  title: '   ',
  now: 1704067200000,
});
assert('factory applies the canonical blank title fallback', blank.title === '新任務');
assert('factory keeps blank task status and placement fields', blank.status === 'todo'
  && blank.nodeType === 'task'
  && blank.parentId === null
  && blank.order === 4);
assert('factory uses one deterministic creation timestamp', blank.createdAt === 1704067200000 && blank.updatedAt === 1704067200000);
assert('blank factory never creates a description field', !Object.prototype.hasOwnProperty.call(blank, 'description')
  && !JSON.stringify(blank).includes('description'));
assert('blank task factory creates the default task purpose note', blank.detailNotes?.[0]?.id === 'note_default'
  && blank.detailNotes[0].title === '任務目的'
  && blank.detailNotes[0].content === '');
assert('blank task factory creates a default secondary note', blank.detailNotes?.[1]?.id === 'note_default_secondary'
  && blank.detailNotes[1].title === '備註'
  && blank.detailNotes[1].content === '');
assert('blank task factory creates exactly two default notes', blank.detailNotes?.length === 2);

const titled = createBlankTaskNode({
  id: 'dev115-titled',
  workspaceId: 'dev115-workspace',
  boardId: 'dev115-board',
  parentId: 'dev115-parent',
  order: 5,
  nodeType: 'group',
  title: '  自訂任務  ',
  now: 1704067200001,
});
assert('factory trims explicit titles without adding description', titled.title === '自訂任務'
  && titled.parentId === 'dev115-parent'
  && titled.nodeType === 'group'
  && !Object.prototype.hasOwnProperty.call(titled, 'description')
  && !Object.prototype.hasOwnProperty.call(titled, 'detailNotes'));

const runtimeInput = {
  id: 'dev115-runtime-extra',
  workspaceId: 'dev115-workspace',
  boardId: 'dev115-board',
  parentId: null,
  order: 6,
  nodeType: 'task',
  description: '不應流入 blank content',
} as unknown as CreateBlankTaskNodeInput;
const runtimeGuarded = createBlankTaskNode(runtimeInput);
assert('factory ignores runtime-only description extras instead of spreading input',
  !Object.prototype.hasOwnProperty.call(runtimeGuarded, 'description'));

const constructors: Array<[string, number]> = [
  ['src/features/taskWorkbench/placement.ts', 1],
  ['src/components/BoardView.tsx', 1],
  ['src/components/Wbs/WbsListView.tsx', 1],
  ['src/components/SharedTaskSidebar.tsx', 2],
  ['src/components/GlobalContextMenu.tsx', 3],
  ['src/components/Wbs/taskDrag/taskDragCommit.ts', 2],
  ['src/components/MindMap/mindMapTaskCommands.ts', 1],
];
constructors.forEach(([path, expected]) => {
  const source = read(path);
  assert(`${path} routes every blank constructor through the factory`, count(source, 'createBlankTaskNode(') === expected);
});

const placement = read('src/features/taskWorkbench/placement.ts');
assert('source-derived inbox promotion keeps its source note mapping', placement.includes('description: item.note || item.title || \'\''));
assert('manual unplaced task no longer mirrors title into description', !placement.includes('description: trimmedTitle'));

const factory = read('src/features/taskCreation/createBlankTaskNode.ts');
assert('factory contract rejects description input at type level', factory.includes('description?: never'));
assert('factory owns only blank-task content, not placement side effects', factory.includes('Placement, permissions, identity and post-create effects stay with the caller.'));
assert('factory contract names the default purpose and note fields', factory.includes("title: '任務目的'")
  && factory.includes("title: '備註'")
  && factory.includes("id: 'note_default_secondary'"));

const artifact = {
  devId: 'DEV-115',
  status: failures.length > 0 ? 'FAIL' : 'PASS',
  sourceRevision: 'working-tree',
  environment: 'local-static',
  assertionCount: checks.length,
  checks,
  failures,
  constructorManifest: constructors.map(([path, expected]) => ({ path, expected })),
  generatedAt: new Date().toISOString(),
};

if (failures.length > 0) {
  console.error('DEV-115 static verification failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`DEV-115 static verification passed: ${checks.length} assertions.`);
console.log(JSON.stringify(artifact));
