import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBackupPackage } from '../../../server/backup';
import { KernelError } from '../../../server/errors';
import { BackupError, type BackupPayloadV2 } from '../../../src/features/backup/types';
import { calculateBackupChecksum, validateBackupPayload } from '../../../src/features/backup/package';

const includesV3 = [
  '看板名稱', '進行中與封存任務', '任務說明與詳細筆記', '父子階層與排序',
  '任務依賴', '任務使用的工作區標籤', '追蹤副本與投影位置',
];

const excludes = [
  '工作區成員與看板權限', '會議與工作紀錄', '附件與外部檔案',
  '行事曆訂閱與連結金鑰', '稽核、活動與 RAG 衍生資料', '其他工作區與看板',
];

const task = (sourceId: string) => ({
  sourceId,
  parentSourceId: null,
  title: sourceId,
  status: 'todo' as const,
  collaboratorIds: [],
  tagSourceIds: [],
  isDurationLocked: false,
  nodeType: 'task' as const,
  order: 0,
  isArchived: false,
});

async function packageFor(payload: BackupPayloadV2, schemaVersion: 2 | 3 = 3): Promise<unknown> {
  return {
    format: 'projed-backup',
    schemaVersion,
    packageId: '30000000-0000-4000-8000-000000000001',
    createdAt: '2026-10-27T00:00:00.000Z',
    source: {
      appVersion: 'test', backend: 'http', workspaceId: 'ws-a', boardId: 'board-a', boardTitle: payload.board.title,
    },
    scope: { type: 'board' },
    manifest: {
      entities: {
        tasks: payload.tasks.length,
        dependencies: payload.dependencies.length,
        tags: payload.tags.length,
        ...(payload.trackingReferences === undefined ? {} : { trackingReferences: payload.trackingReferences.length }),
      },
      includes: schemaVersion === 3 ? includesV3 : includesV3.slice(0, -1),
      excludes,
      canonicalization: 'json-sort-v1',
      checksum: { algorithm: 'SHA-256', value: await calculateBackupChecksum(payload) },
    },
    payload,
  };
}

test('backup validation rejects cyclic tracking-reference parents on client and server', async () => {
  const payload: BackupPayloadV2 = {
    board: { title: 'Cycle test' },
    tasks: [task('task-a'), task('task-b')],
    dependencies: [],
    tags: [],
    trackingReferences: [
      { sourceId: 'ref-a', taskSourceId: 'task-a', parentSourceId: 'ref-b', order: 0, revision: 1 },
      { sourceId: 'ref-b', taskSourceId: 'task-b', parentSourceId: 'ref-a', order: 0, revision: 1 },
    ],
  };

  assert.throws(() => validateBackupPayload(payload), (error: unknown) => (
    error instanceof BackupError && error.code === 'INVALID_FILE'
  ));
  const packageValue = await packageFor(payload);
  assert.throws(() => parseBackupPackage(packageValue), (error: unknown) => (
    error instanceof KernelError && error.code === 'INVALID_FILE'
  ));
});

test('server rejects V2 packages carrying V3 tracking-reference fields', async () => {
  const payload: BackupPayloadV2 = {
    board: { title: 'V2 boundary test' },
    tasks: [],
    dependencies: [],
    tags: [],
    trackingReferences: [],
  };

  const packageValue = await packageFor(payload, 2);
  assert.throws(() => parseBackupPackage(packageValue), (error: unknown) => (
    error instanceof KernelError && error.code === 'INVALID_FILE'
  ));
});
