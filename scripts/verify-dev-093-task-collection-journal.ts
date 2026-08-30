import { mkdirSync, writeFileSync } from 'node:fs';
import type { ActivityEvent, EditableKnowledgeRecord, TaskNode } from '../src/types';
import {
  clearTaskCollectionJournal,
  completeTaskCollectionJournal,
  prepareTaskCollectionJournal,
  readTaskCollectionJournal,
  setTaskCollectionJournalAfter,
} from '../src/features/taskCollection/localJournal';
import { TaskCollectionError } from '../src/features/taskCollection/errors';

type MemoryState = { data: Map<string, string>; failNextKey: string | null };
const createMemoryStorage = (state: MemoryState): Storage => ({
  getItem: key => state.data.get(key) ?? null,
  setItem: (key, value) => {
    if (state.failNextKey === key) {
      state.failNextKey = null;
      throw new Error(`injected localStorage write failure: ${key}`);
    }
    state.data.set(key, value);
  },
  removeItem: key => { state.data.delete(key); },
  clear: () => { state.data.clear(); },
  key: index => Array.from(state.data.keys())[index] ?? null,
  get length() { return state.data.size; },
});

const state: MemoryState = { data: new Map(), failNextKey: null };
globalThis.localStorage = createMemoryStorage(state);
const { localTestStorage, localTestTaskCollectionService } = await import('../src/services/localTestService');

const workspaceId = 'journal-ws';
const boardId = 'journal-board';
const rootId = 'journal-root';
const baseNodes: Record<string, TaskNode> = {
  [rootId]: { id: rootId, storageId: 'journal-root-storage', workspaceId, boardId, parentId: null, title: 'Journal root', status: 'in_progress', order: 0, createdAt: 1, updatedAt: 1 },
  'journal-child': { id: 'journal-child', storageId: 'journal-child-storage', workspaceId, boardId, parentId: rootId, title: 'Journal child', status: 'todo', order: 0, createdAt: 1, updatedAt: 1 },
};
const emptyRecords: EditableKnowledgeRecord[] = [];
const emptyActivities: ActivityEvent[] = [];
const makeRecord = (id: string): EditableKnowledgeRecord => ({
  id,
  workspaceId,
  boardId,
  type: 'meeting',
  title: id,
  content: id,
  status: 'published',
  visibility: 'project',
  taskLinks: [],
});
const makeActivity = (id: string): ActivityEvent => ({
  id,
  workspaceId,
  boardId,
  eventType: 'task_created',
  entityTable: 'wbs_items',
  entityId: rootId,
  payload: {},
  createdAt: 2,
});
const reset = () => {
  state.data.clear();
  state.failNextKey = null;
  localTestStorage.writeWorkspaces([{ id: workspaceId, title: 'Journal workspace', boards: [{ id: boardId, title: 'Journal board', dependencies: [] }] }]);
  localTestStorage.writeNodes(baseNodes);
  localTestStorage.writeDependencies([]);
  localTestStorage.writeKnowledgeRecords(emptyRecords);
  localTestStorage.writeActivityEvents(emptyActivities);
  clearTaskCollectionJournal();
};
const readState = () => ({
  records: localTestStorage.readKnowledgeRecords(),
  nodes: localTestStorage.readNodes(),
  activities: localTestStorage.readActivityEvents(),
  journal: readTaskCollectionJournal(),
});
const checks: Array<{ id: string; status: 'PASS' | 'FAIL'; expected: string; actual: string; evidence: string[] }> = [];
const failures: string[] = [];
const check = (id: string, condition: boolean, actual = condition ? 'condition=true' : 'condition=false') => {
  checks.push({ id, status: condition ? 'PASS' : 'FAIL', expected: `${id} should pass`, actual, evidence: ['DEV-093 local journal verifier'] });
  if (!condition) failures.push(id);
};

reset();
const normalPreview = await localTestTaskCollectionService.preview(workspaceId, boardId, rootId, 'journal-normal');
await localTestTaskCollectionService.collect(workspaceId, boardId, rootId, 'journal-normal', normalPreview.previewToken);
const normalState = readState();
check('L01-normal-commit-reload-state', normalState.records.length === 1 && normalState.nodes[rootId]?.isArchived === true && normalState.journal.length === 0);

const runPreparedRecovery = async (id: string, mutate: () => void) => {
  reset();
  const before = { records: emptyRecords, nodes: baseNodes, activities: emptyActivities };
  prepareTaskCollectionJournal(id, before);
  mutate();
  await localTestTaskCollectionService.previewDeleteImpact(workspaceId, boardId);
  return readState();
};

const afterJournal = await runPreparedRecovery('journal-after-journal', () => undefined);
check('L02-after-journal-recovery', afterJournal.records.length === 0 && afterJournal.nodes[rootId]?.isArchived !== true && afterJournal.activities.length === 0 && afterJournal.journal.length === 0);
const afterAsset = await runPreparedRecovery('journal-after-asset', () => localTestStorage.writeKnowledgeRecords([makeRecord('partial-asset')]));
check('L03-after-asset-recovery', afterAsset.records.length === 0 && afterAsset.journal.length === 0);
const afterArchive = await runPreparedRecovery('journal-after-archive', () => localTestStorage.writeNodes({ ...baseNodes, [rootId]: { ...baseNodes[rootId], isArchived: true } }));
check('L04-after-archive-recovery', afterArchive.nodes[rootId]?.isArchived !== true && afterArchive.journal.length === 0);
const afterActivity = await runPreparedRecovery('journal-after-activity', () => localTestStorage.writeActivityEvents([makeActivity('partial-activity')]));
check('L05-after-activity-recovery', afterActivity.activities.length === 0 && afterActivity.journal.length === 0);

reset();
const afterState = {
  records: [makeRecord('committed-record')],
  nodes: { ...baseNodes, [rootId]: { ...baseNodes[rootId], isArchived: true } },
  activities: [makeActivity('committed-activity')],
};
prepareTaskCollectionJournal('journal-commit-marker', { records: emptyRecords, nodes: baseNodes, activities: emptyActivities });
setTaskCollectionJournalAfter('journal-commit-marker', afterState);
completeTaskCollectionJournal('journal-commit-marker');
localTestStorage.writeKnowledgeRecords(emptyRecords);
localTestStorage.writeNodes(baseNodes);
localTestStorage.writeActivityEvents(emptyActivities);
await localTestTaskCollectionService.previewDeleteImpact(workspaceId, boardId);
const committedState = readState();
check('L06-after-commit-marker-replay', committedState.records.length === 1 && committedState.nodes[rootId]?.isArchived === true && committedState.activities.length === 1 && committedState.journal.length === 0);

reset();
const faultPreview = await localTestTaskCollectionService.preview(workspaceId, boardId, rootId, 'journal-apply-throw');
state.failNextKey = 'projed-local-test.activityEvents';
let applyThrowObserved = false;
try {
  await localTestTaskCollectionService.collect(workspaceId, boardId, rootId, 'journal-apply-throw', faultPreview.previewToken);
} catch (error) {
  applyThrowObserved = error instanceof TaskCollectionError;
}
const applyThrowState = readState();
check('L09-projection-apply-throw-rollback', applyThrowObserved && applyThrowState.records.length === 0 && applyThrowState.nodes[rootId]?.isArchived !== true && applyThrowState.activities.length === 0 && applyThrowState.journal.length === 0);

const output = {
  devId: 'DEV-093',
  sourceRevision: 'working-tree',
  generatedAt: new Date().toISOString(),
  environment: 'local-test',
  provider: 'local-test',
  command: 'npm run verify:dev-093-task-collection-journal',
  runtime: 'in-memory local-test storage; no external runtime',
  cases: checks,
  summary: { PASS: checks.filter(item => item.status === 'PASS').length, FAIL: checks.filter(item => item.status === 'FAIL').length, NOT_RUN: 0, BLOCKED: 0 },
  passed: failures.length === 0,
  failures,
};
mkdirSync('output/qa/dev-093', { recursive: true });
writeFileSync('output/qa/dev-093/journal-result.json', JSON.stringify(output, null, 2));
if (failures.length) {
  console.error('DEV-093 journal verification failed.');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`DEV-093 journal verification passed: ${checks.length} checks.`);
