import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ActivityEvent, EditableKnowledgeRecord, KnowledgeRecord, TaskNode } from '../src/types';
import { buildTaskCollectionSnapshot, collectTaskSubtreeNodeIds } from '../src/features/taskCollection/snapshot';
import { canonicalJsonSha256 } from '../src/features/taskCollection/canonicalJson';
import { projectTaskCollectionContent } from '../src/features/taskCollection/contentProjection';
import { TASK_COLLECTION_LIMITS } from '../src/features/taskCollection/types';
import { TaskCollectionError } from '../src/features/taskCollection/errors';

const root = process.cwd();
const failures: string[] = [];
const checks: Array<{ id: string; status: 'PASS' | 'FAIL'; expected: string; actual: string; evidence: string[] }> = [];
const check = (id: string, condition: boolean, actual = condition ? 'condition=true' : 'condition=false') => {
  checks.push({ id, status: condition ? 'PASS' : 'FAIL', expected: `${id} should pass`, actual, evidence: ['DEV-093 pure contract verifier'] });
  if (!condition) failures.push(id);
};

const makeNode = (id: string, overrides: Partial<TaskNode> = {}): TaskNode => ({
  id,
  workspaceId: 'ws',
  boardId: 'board',
  parentId: null,
  title: id,
  status: 'todo',
  order: 0,
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const makeRecord = (id: string, overrides: Partial<EditableKnowledgeRecord> = {}): EditableKnowledgeRecord => ({
  id,
  workspaceId: 'ws',
  boardId: 'board',
  type: 'meeting',
  title: id,
  content: `${id} content`,
  status: 'published',
  visibility: 'project',
  taskLinks: [{ id: `${id}-link`, recordId: id, workspaceId: 'ws', boardId: 'board', nodeId: 'root', role: 'related' }],
  ...overrides,
});

const baseInput = (overrides: Partial<Parameters<typeof buildTaskCollectionSnapshot>[0]> = {}) => ({
  workspaceId: 'ws',
  workspaceTitle: '測試工作區',
  boardId: 'board',
  boardTitle: '測試看板',
  rootItemId: 'root',
  collectedAt: 100,
  nodes: [
    makeNode('root', { title: '根任務', order: 0 }),
    makeNode('child', { parentId: 'root', title: '子任務', order: 0, isArchived: true }),
    makeNode('other', { title: '外部任務', order: 1 }),
  ],
  dependencies: [
    { id: 'internal', fromId: 'root', fromSide: 'end', toId: 'child', toSide: 'start', offset: 2 },
    { id: 'boundary', fromId: 'root', fromSide: 'end', toId: 'other', toSide: 'start' },
  ],
  activityEvents: [],
  linkedRecords: [],
  ...overrides,
});

const build = (overrides: Partial<Parameters<typeof buildTaskCollectionSnapshot>[0]> = {}) =>
  buildTaskCollectionSnapshot(baseInput(overrides));

const expectThrows = (fn: () => unknown, message: string) => {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes(message);
  }
};

check('P01-selected-child-traversal', JSON.stringify(collectTaskSubtreeNodeIds(baseInput().nodes, 'child')) === '["child"]');
check('P02-missing-root-fail-closed', expectThrows(() => build({ rootItemId: 'missing' }), 'Task collection root not found'));
check('P02-duplicate-node-fail-closed', expectThrows(() => build({ nodes: [makeNode('root'), makeNode('root')] }), 'duplicate node identity'));
check('P02-duplicate-storage-fail-closed', expectThrows(() => build({ nodes: [makeNode('root', { storageId: 'same' }), makeNode('child', { parentId: 'root', storageId: 'same' })] }), 'duplicate storage identity'));
check('P02-cycle-fail-closed', expectThrows(() => build({ nodes: [makeNode('root', { parentId: 'child' }), makeNode('child', { parentId: 'root' })] }), 'parent cycle'));
check('P02-cross-project-fail-closed', expectThrows(() => build({ nodes: [makeNode('root'), makeNode('child', { parentId: 'root', workspaceId: 'other-workspace' })] }), 'crosses workspace/board scope'));

const sanitizedActivity: ActivityEvent = {
  id: 'activity-1',
  workspaceId: 'ws',
  boardId: 'board',
  eventType: 'task_status_changed',
  entityTable: 'wbs_items',
  entityId: 'root',
  createdAt: 12,
  payload: {
    taskId: 'root',
    secret: 'must-not-leak',
    before: { status: 'todo', secret: 'must-not-leak' },
    after: { status: 'completed', nested: { value: 'removed' } },
  },
};
const activitySnapshot = build({ activityEvents: [sanitizedActivity] });
const activityPayload = activitySnapshot.activityEvents[0]?.payload ?? {};
check('P04-activity-allowlist', activityPayload.taskId === 'root' && !('secret' in activityPayload) && !('nested' in (activityPayload.after as Record<string, unknown> ?? {})));
check('P04-activity-before-after-filter', JSON.stringify(activityPayload.before) === '{"status":"todo"}' && JSON.stringify(activityPayload.after) === '{"status":"completed"}');

const publicRecord = makeRecord('public');
const privateRecord = makeRecord('private', { visibility: 'private' });
const draftRecord = makeRecord('draft', { status: 'draft' });
const nestedCollection = {
  ...makeRecord('collection'),
  type: 'task_collection',
  collectionOperationId: 'operation',
  collectionVersion: 1,
  collectionSchemaVersion: 1,
  collectionSnapshotHash: 'a'.repeat(64),
  sourceRootItemId: 'root',
  sourceRootStorageId: 'root',
} as KnowledgeRecord;
const relatedSnapshot = build({ linkedRecords: [publicRecord, privateRecord, draftRecord, nestedCollection] });
check('P05-related-record-filter', relatedSnapshot.linkedRecords.length === 1 && relatedSnapshot.linkedRecords[0]?.id === 'public');
check('P05-related-record-excerpt', relatedSnapshot.linkedRecords[0]?.excerpt === 'public content');

const normalizedSnapshot = build({
  nodes: [
    makeNode('root', { title: '', description: undefined, detailNotes: undefined, assigneeIds: undefined, collaboratorIds: undefined, tagIds: undefined }),
    makeNode('child', { parentId: 'root', storageId: 'child-storage', order: Number.NaN, createdAt: Number.MAX_SAFE_INTEGER + 1, updatedAt: undefined }),
  ],
  dependencies: [{ id: 'dep', fromId: 'root', fromSide: 'end', toId: 'child', toSide: 'start' }],
});
const normalizedRoot = normalizedSnapshot.nodes.find(node => node.id === 'root');
const normalizedChild = normalizedSnapshot.nodes.find(node => node.id === 'child');
check('P08-null-normalization', normalizedRoot?.parentId === null && normalizedRoot.parentStorageId === null && normalizedRoot.description === null && Array.isArray(normalizedRoot.assigneeIds) && normalizedRoot.assigneeIds.length === 0);
check('P08-legacy-default-normalization', normalizedChild?.parentId === 'root' && normalizedChild.parentStorageId === 'root' && normalizedChild.order === 0 && normalizedChild.createdAt === 0 && normalizedChild.updatedAt === 0 && normalizedSnapshot.dependencies[0]?.offsetDays === 0);

const deterministicA = build({ nodes: [makeNode('root', { title: 'Root', order: 0 }), makeNode('child', { parentId: 'root', title: 'Child', order: 0 }), makeNode('other', { title: 'Other', order: 1 })] });
const deterministicB = build({ nodes: [makeNode('other', { title: 'Other', order: 1 }), makeNode('child', { parentId: 'root', title: 'Child', order: 0 }), makeNode('root', { title: 'Root', order: 0 })] });
const deterministicChanged = build({ nodes: [makeNode('root', { title: 'Changed', order: 0 }), makeNode('child', { parentId: 'root', title: 'Child', order: 0 }), makeNode('other', { title: 'Other', order: 1 })] });
const [hashA, hashB, hashChanged] = await Promise.all([
  canonicalJsonSha256(deterministicA),
  canonicalJsonSha256(deterministicB),
  canonicalJsonSha256(deterministicChanged),
]);
check('P06-deterministic-snapshot-hash', hashA === hashB && hashA !== hashChanged);
check('P06-content-projection-escape', projectTaskCollectionContent(build({ nodes: [makeNode('root', { title: '<unsafe>' })] })).includes('&lt;unsafe&gt;'));

check('P07-limit-contract-values', TASK_COLLECTION_LIMITS.taskCount === 500 && TASK_COLLECTION_LIMITS.dependencyCount === 1000 && TASK_COLLECTION_LIMITS.relatedRecordCount === 200);

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
    clear: () => data.clear(),
    key: index => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
};
globalThis.localStorage = memoryStorage();
const { localTestStorage, localTestTaskCollectionService } = await import('../src/services/localTestService');
const exactLimitNodes = Object.fromEntries(Array.from({ length: TASK_COLLECTION_LIMITS.taskCount }, (_, index) => {
  const id = index === 0 ? 'limit-root' : `limit-node-${index}`;
  const parentId = index === 0 ? null : (index === 1 ? 'limit-root' : `limit-node-${index - 1}`);
  return [id, makeNode(id, { parentId, order: index })];
}));
localTestStorage.writeWorkspaces([{ id: 'ws', title: 'Limit workspace', boards: [{ id: 'board', title: 'Limit board', dependencies: [] }] }]);
localTestStorage.writeNodes(exactLimitNodes);
localTestStorage.writeDependencies([]);
localTestStorage.writeKnowledgeRecords([]);
localTestStorage.writeActivityEvents([]);
const exactLimitPreview = await localTestTaskCollectionService.preview('ws', 'board', 'limit-root', 'limit-exact');
check('P07-exact-limit-allowed', exactLimitPreview.subtreeNodeCount === TASK_COLLECTION_LIMITS.taskCount);
const limitPlusOneNodes = { ...exactLimitNodes, 'limit-node-500': makeNode('limit-node-500', { parentId: 'limit-node-499', order: 500 }) };
localTestStorage.writeNodes(limitPlusOneNodes);
let limitPlusOneRejected = false;
try {
  await localTestTaskCollectionService.preview('ws', 'board', 'limit-root', 'limit-plus-one');
} catch (error) {
  limitPlusOneRejected = error instanceof TaskCollectionError && error.code === 'LIMIT_EXCEEDED';
}
check('P07-limit-plus-one-rejected', limitPlusOneRejected);

const sourceChecks: Array<[string, string, string]> = [
  ['S01-editable-input-excludes-collection', 'src/types/index.ts', 'export interface KnowledgeRecordInput'],
  ['S02-collect-guard-contract', 'src/services/localTestService.ts', "configured.includes('collect_task') || configured.includes('delete_task')"],
  ['S03-firebase-unsupported-contract', 'src/services/dataBackend.ts', "TaskCollectionError('BACKEND_UNSUPPORTED'"],
  ['S04-editable-store-filter', 'src/store/useRecordStore.ts', 'records: EditableKnowledgeRecord[];'],
  ['S05-compact-rail-collection-free', 'src/components/Wbs/taskDrag/taskDragTypes.ts', "MobileTaskAction = 'toggle-complete' | 'add-sibling' | 'add-child' | 'archive'"],
];
sourceChecks.forEach(([id, path, snippet]) => check(id, readFileSync(`${root}/${path}`, 'utf8').includes(snippet)));

const output = {
  devId: 'DEV-093',
  sourceRevision: 'working-tree',
  generatedAt: new Date().toISOString(),
  environment: 'local-test',
  provider: 'local-test',
  command: 'npm run verify:dev-093-task-collection-pure',
  runtime: 'pure source/snapshot verifier; no external runtime',
  cases: checks,
  summary: {
    PASS: checks.filter(item => item.status === 'PASS').length,
    FAIL: checks.filter(item => item.status === 'FAIL').length,
    NOT_RUN: 0,
    BLOCKED: 0,
  },
  passed: failures.length === 0,
  failures,
};
mkdirSync(`${root}/output/qa/dev-093`, { recursive: true });
writeFileSync(`${root}/output/qa/dev-093/pure-result.json`, JSON.stringify(output, null, 2));
if (failures.length) {
  console.error('DEV-093 pure verification failed.');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-093 pure verification passed: ${checks.length} checks.`);
