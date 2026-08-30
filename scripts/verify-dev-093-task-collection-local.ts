import { mkdirSync, writeFileSync } from 'node:fs';
import type { Dependency, TaskNode } from '../src/types';
import { readTaskCollectionJournal } from '../src/features/taskCollection/localJournal';
import { TaskCollectionError } from '../src/features/taskCollection/errors';

type MemoryStorage = Storage;

const memoryStorage = (): MemoryStorage => {
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

const run = async () => {
  globalThis.localStorage = memoryStorage();
  const { localTestStorage, localTestTaskCollectionService } = await import('../src/services/localTestService');
  const workspaceId = 'local-ws';
  const boardId = 'local-board';
  const rootItemId = 'root';
  const operationId = 'op-local-093';
  const now = 1_700_000_000_000;
  const nodes: Record<string, TaskNode> = {
    root: { id: 'root', storageId: 'root-storage', workspaceId, boardId, parentId: null, title: '根任務', status: 'in_progress', order: 0, updatedAt: now, createdAt: now },
    child: { id: 'child', storageId: 'child-storage', workspaceId, boardId, parentId: 'root', title: '已封存子任務', status: 'completed', order: 0, isArchived: true, updatedAt: now, createdAt: now + 1 },
    external: { id: 'external', storageId: 'external-storage', workspaceId, boardId, parentId: null, title: '外部任務', status: 'todo', order: 1, updatedAt: now, createdAt: now + 2 },
    responseRoot: { id: 'response-root', storageId: 'response-root-storage', workspaceId, boardId, parentId: null, title: '回應遺失根任務', status: 'in_progress', order: 2, updatedAt: now, createdAt: now + 3 },
  };
  const dependencies: Dependency[] = [
    { id: 'internal', fromId: 'root', fromSide: 'end', toId: 'child', toSide: 'start', offset: 2 },
    { id: 'boundary', fromId: 'root', fromSide: 'end', toId: 'external', toSide: 'start' },
  ];
  localTestStorage.writeWorkspaces([{ id: workspaceId, title: '驗證工作區', boards: [{ id: boardId, title: '驗證看板', dependencies: [] }] }]);
  localTestStorage.writeNodes(nodes);
  localTestStorage.writeDependencies(dependencies);
  localTestStorage.writeKnowledgeRecords([]);
  localTestStorage.writeActivityEvents([]);

  const preview = await localTestTaskCollectionService.preview(workspaceId, boardId, rootItemId, operationId);
  const result = await localTestTaskCollectionService.collect(workspaceId, boardId, rootItemId, operationId, preview.previewToken, 'local verifier');
  const replay = await localTestTaskCollectionService.collect(workspaceId, boardId, rootItemId, operationId, preview.previewToken);
  const summaries = await localTestTaskCollectionService.listSummaries(workspaceId, boardId);
  const stored = localTestStorage.readKnowledgeRecords();
  const rootAfter = localTestStorage.readNodes()[rootItemId];
  const firstRecord = stored.find(record => record.type === 'task_collection');
  const boardImpact = await localTestTaskCollectionService.previewDeleteImpact(workspaceId, boardId);
  const workspaceImpact = await localTestTaskCollectionService.previewWorkspaceDeleteImpact(workspaceId);
  const responseOperationId = 'op-local-093-response-lost';
  const responsePreview = await localTestTaskCollectionService.preview(workspaceId, boardId, 'response-root', responseOperationId);
  globalThis.localStorage.setItem('projed-local-test.taskCollectionFault', 'response-lost-once');
  const responseResult = await localTestTaskCollectionService.collect(workspaceId, boardId, 'response-root', responseOperationId, responsePreview.previewToken, 'response-lost verifier');
  const responseReadback = await localTestTaskCollectionService.getOperationResult(workspaceId, boardId, responseOperationId);
  const responseRecordCount = localTestStorage.readKnowledgeRecords().filter(record => record.type === 'task_collection' && record.collectionOperationId === responseOperationId).length;
  localTestStorage.writeNodes({ ...localTestStorage.readNodes(), [rootItemId]: { ...localTestStorage.readNodes()[rootItemId], isArchived: false } });
  const v2Preview = await localTestTaskCollectionService.preview(workspaceId, boardId, rootItemId, 'op-local-093-v2');
  const v2Result = await localTestTaskCollectionService.collect(workspaceId, boardId, rootItemId, 'op-local-093-v2', v2Preview.previewToken, 'v2');
  const afterV2 = localTestStorage.readKnowledgeRecords();
  const v1AfterV2 = firstRecord ? await localTestTaskCollectionService.getById(workspaceId, boardId, firstRecord.id) : null;
  const nodesWithoutSource = { ...localTestStorage.readNodes() };
  delete nodesWithoutSource[rootItemId];
  delete nodesWithoutSource.child;
  localTestStorage.writeNodes(nodesWithoutSource);
  const v1AfterSourceDelete = firstRecord ? await localTestTaskCollectionService.getById(workspaceId, boardId, firstRecord.id) : null;
  globalThis.localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-viewer' }));
  let permissionDenied = false;
  try {
    await localTestTaskCollectionService.preview(workspaceId, boardId, rootItemId, 'op-local-093-denied');
  } catch (error) {
    permissionDenied = error instanceof TaskCollectionError && error.code === 'PERMISSION_DENIED';
  }
  globalThis.localStorage.setItem('projed-local-test.session', JSON.stringify({ uid: 'local-test-user' }));
  const checks = {
    previewIncludesArchivedDescendant: preview.subtreeNodeCount === 2,
    previewIncludesBoundaryDependency: preview.dependencyCount === 2,
    durableCollectionCreated: stored.filter(record => record.type === 'task_collection').length === 1,
    rootArchivedAfterCommit: rootAfter?.isArchived === true,
    sameOperationIsIdempotent: result.recordId === replay.recordId,
    summaryReadback: summaries.length === 1 && summaries[0].taskCount === 2,
    detailSurvivesSourceProjectionChange: (await localTestTaskCollectionService.getById(workspaceId, boardId, result.recordId))?.content.length ? true : false,
    journalClearedAfterCommit: readTaskCollectionJournal().length === 0,
    boardDeleteImpactCount: boardImpact.taskCollectionCount === 1 && boardImpact.unknown === false,
    workspaceDeleteImpactCount: workspaceImpact.taskCollectionCount === 1 && workspaceImpact.unknown === false,
    responseLostRecoveredByOperationReadback: responseResult.recordId === responseReadback?.id && responseRecordCount === 1 && localTestStorage.readNodes()['response-root']?.isArchived === true,
    restoreCreatesVersionTwo: v2Result.collectionVersion === 2 && afterV2.filter(record => record.type === 'task_collection' && record.sourceRootItemId === rootItemId).length === 2,
    versionOneImmutable: Boolean(firstRecord?.collectionSnapshotHash && v1AfterV2?.type === 'task_collection' && v1AfterV2.collectionSnapshotHash === firstRecord.collectionSnapshotHash),
    detailSurvivesSourceDelete: Boolean(v1AfterSourceDelete?.type === 'task_collection' && v1AfterSourceDelete.content.length > 0),
    permissionDeniedForViewer: permissionDenied,
  };
  const generatedAt = new Date().toISOString();
  const cases = Object.entries(checks).map(([id, passed]) => ({
    id,
    status: passed ? 'PASS' : 'FAIL' as const,
    expected: `${id} should pass`,
    actual: passed ? 'condition=true' : 'condition=false',
    evidence: ['local-test journal/provider verifier'],
  }));
  const output = {
    dev: 'DEV-093',
    devId: 'DEV-093',
    sourceRevision: 'working-tree',
    generatedAt,
    environment: 'local-test',
    provider: 'local-test',
    command: 'npm run verify:dev-093-task-collection-local',
    runtime: 'in-memory local-test provider; no external runtime',
    cases,
    summary: { PASS: cases.filter(item => item.status === 'PASS').length, FAIL: cases.filter(item => item.status === 'FAIL').length, NOT_RUN: 0, BLOCKED: 0 },
    passed: Object.values(checks).every(Boolean),
    checks,
  };
  mkdirSync('output/qa/dev-093', { recursive: true });
  writeFileSync('output/qa/dev-093/local-result.json', JSON.stringify(output, null, 2));
  if (!output.passed) {
    console.error('DEV-093 local verification failed.');
    Object.entries(checks).filter(([, passed]) => !passed).forEach(([name]) => console.error(`- ${name}`));
    process.exit(1);
  }
  console.log(`DEV-093 local verification passed: ${Object.keys(checks).length} checks.`);
};

void run();
