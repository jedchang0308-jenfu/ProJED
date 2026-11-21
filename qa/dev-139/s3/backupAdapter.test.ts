import assert from 'node:assert/strict';
import test from 'node:test';

import { BackupError, type BackupImportPlan, type BackupPackageV2 } from '../../../src/features/backup/types';
import { createBackupPackage, inspectBackupText, stringifyBackupPackage } from '../../../src/features/backup/package';
import { HttpApiClient } from '../../../src/services/httpApi/httpApiClient';
import { createHttpBackupAdapter } from '../../../src/services/httpApi/backupAdapter';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const expectedActor = {
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contextId: '51111111-1111-4111-8111-111111111111',
};

const packageValue = {
  packageId: '30000000-0000-4000-8000-000000000001',
} as BackupPackageV2;

const target = {
  workspaceId: 'ws-a',
  workspaceTitle: 'Workspace A',
  boardId: 'board-a',
  boardTitle: 'Board A',
};

const counts = {
  create: 1,
  update: 0,
  delete: 0,
  keep: 0,
  dependencies: 0,
  tagsToCreate: 0,
  tagsToReuse: 0,
  unresolvedPeople: 0,
  blockingRecordLinks: 0,
  trackingReferences: 0,
};

const plan: BackupImportPlan = {
  planId: '40000000-0000-4000-8000-000000000001',
  executionId: '40000000-0000-4000-8000-000000000002',
  packageId: packageValue.packageId,
  createdAt: '2026-10-27T00:00:00.000Z',
  expiresAt: '2026-10-27T00:10:00.000Z',
  mode: 'replace_current_board',
  target,
  allowed: true,
  expectedTargetFingerprint: 'before-fingerprint',
  counts,
  warnings: [],
  blockers: [],
  confirmationPhrase: target.boardTitle,
};

function withCapture(responder: (path: string, init?: RequestInit) => Response) {
  const captures: Array<{ path: string; init?: RequestInit }> = [];
  const client = new HttpApiClient(async (input, init) => {
    const path = String(input);
    captures.push({ path, init });
    return responder(path, init);
  });
  client.bindExpectedActor(expectedActor);
  return { adapter: createHttpBackupAdapter(client), captures };
}

test('backup adapter reads board source and fingerprint with actor-bound scoped paths', async () => {
  const { adapter, captures } = withCapture(path => path.endsWith('/fingerprint')
    ? json({ data: 'board-fingerprint' })
    : json({ data: {
      workspaceId: 'ws A', workspaceTitle: 'Workspace A', boardId: 'board A', boardTitle: 'Board A',
      tasks: [], dependencies: [], tags: [], trackingReferences: [],
    } }));

  const source = await adapter.readBoardSource('ws A', 'board A');
  assert.equal(source.workspaceId, 'ws A');
  assert.equal(source.boardTitle, 'Board A');
  assert.deepEqual(source.tasks, []);
  assert.deepEqual(source.trackingReferences, []);
  assert.equal(await adapter.readBoardFingerprint('ws A', 'board A'), 'board-fingerprint');
  assert.deepEqual(captures.map(({ path }) => path), [
    '/api/v1/workspaces/ws%20A/boards/board%20A/backup/source',
    '/api/v1/workspaces/ws%20A/boards/board%20A/backup/fingerprint',
  ]);
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), expectedActor.accountId);
    assert.equal(headers.get('x-projed-expected-context-id'), expectedActor.contextId);
    assert.equal(capture.init?.credentials, 'same-origin');
  }
});

test('backup adapter posts plan and execute contracts and parses server results', async () => {
  const execution = {
    executionId: plan.executionId,
    mode: plan.mode,
    targetWorkspaceId: target.workspaceId,
    targetBoardId: target.boardId,
    targetBoardTitle: target.boardTitle,
    counts,
    warnings: [],
    sourceTaskIdMap: { 'source-task': 'target-task' },
    sourceTrackingReferenceIdMap: { 'source-reference': 'target-reference' },
    postWriteFingerprint: 'after-fingerprint',
    idempotentReplay: false,
  };
  const { adapter, captures } = withCapture(path => path.endsWith('/plan')
    ? json({ data: plan })
    : json({ data: execution }));
  const planResult = await adapter.planImport({ package: packageValue, mode: plan.mode, target });
  const result = await adapter.executeImport({ package: packageValue, plan: planResult, newBoardTitle: 'Board Copy' });

  assert.equal(planResult.executionId, plan.executionId);
  assert.equal(result.targetBoardId, target.boardId);
  assert.deepEqual(result.sourceTaskIdMap, execution.sourceTaskIdMap);
  assert.deepEqual(result.sourceTrackingReferenceIdMap, execution.sourceTrackingReferenceIdMap);
  assert.deepEqual(captures.map(({ path, init }) => [path, init?.method]), [
    ['/api/v1/backup/import/plan', 'POST'],
    ['/api/v1/backup/import/execute', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(String(captures[0]?.init?.body)), {
    package: packageValue,
    mode: plan.mode,
    target,
  });
  assert.deepEqual(JSON.parse(String(captures[1]?.init?.body)), {
    package: packageValue,
    plan: planResult,
    newBoardTitle: 'Board Copy',
  });
  for (const capture of captures) {
    const headers = new Headers(capture.init?.headers);
    assert.equal(headers.get('x-projed-expected-account-id'), expectedActor.accountId);
    assert.equal(headers.get('x-projed-expected-context-id'), expectedActor.contextId);
    assert.equal(capture.init?.credentials, 'same-origin');
  }
});

test('backup adapter maps permission, stale target and unknown commit errors safely', async () => {
  const denied = withCapture(() => json({ error: { code: 'ACCESS_DENIED', retryable: false } }, 403)).adapter;
  await assert.rejects(denied.readBoardSource('ws-a', 'board-a'), (error: unknown) => (
    error instanceof BackupError && error.code === 'PERMISSION_DENIED'
  ));

  const stale = withCapture(() => json({ error: { code: 'TARGET_CHANGED', retryable: false } }, 409)).adapter;
  await assert.rejects(stale.executeImport({ package: packageValue, plan }), (error: unknown) => (
    error instanceof BackupError && error.code === 'TARGET_CHANGED'
  ));

  const uncertain = withCapture(() => json({ error: { code: 'DB_COMMIT_UNKNOWN', retryable: true } }, 503)).adapter;
  await assert.rejects(uncertain.executeImport({ package: packageValue, plan }), (error: unknown) => (
    error instanceof BackupError && error.code === 'COMMIT_UNKNOWN'
      && /不要直接重試/u.test(error.message)
  ));
});

test('backup package accepts http as its source backend', async () => {
  const created = await createBackupPackage({
    workspaceId: 'ws-a',
    workspaceTitle: 'Workspace A',
    boardId: 'board-a',
    boardTitle: 'Board A',
    tasks: [],
    dependencies: [],
    tags: [],
  }, 'http');
  const inspected = await inspectBackupText(stringifyBackupPackage(created));
  assert.equal(inspected.package.source.backend, 'http');
});
