import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BackupError } from '../src/features/backup/types';
import {
  calculateBackupChecksum,
  compareBackupSemantics,
  createBackupPackage,
  inspectBackupText,
  stringifyBackupPackage,
} from '../src/features/backup/package';
import type { BoardBackupSource, BackupPackageV2 } from '../src/features/backup/types';
import type { TaskTrackingReference } from '../src/features/taskTracking/types';

const KEYS = {
  workspaces: 'projed-local-test.workspaces',
  nodes: 'projed-local-test.nodes',
  dependencies: 'projed-local-test.dependencies',
  tags: 'projed-local-test.tags',
  members: 'projed-local-test.boardMembers',
  records: 'projed-local-test.knowledgeRecords',
  executions: 'projed-local-test.backupImportExecutions',
  session: 'projed-local-test.session',
} as const;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const write = (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));

const reference = (id: string, taskId: string, parentPlacementId: string | null, order: number): TaskTrackingReference => ({
  id,
  taskId,
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  sourceBoardId: 'board-a',
  parentPlacementId,
  order,
  revision: 1,
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
});

const seed = () => {
  storage.clear();
  write(KEYS.workspaces, [{
    id: 'workspace-a',
    title: 'Backup workspace',
    ownerId: 'local-test-user',
    boards: [
      { id: 'board-a', title: '研發看板', dependencies: [], order: 1, createdAt: 1 },
      { id: 'board-b', title: '主管看板', dependencies: [], order: 2, createdAt: 1 },
    ],
  }]);
  write(KEYS.nodes, {
    'task-root': {
      id: 'task-root', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null,
      title: '唯一真相任務', status: 'in_progress', nodeType: 'group', order: 0,
      collaboratorIds: [], tagIds: [], isDurationLocked: false, isArchived: false,
    },
    'task-child': {
      id: 'task-child', workspaceId: 'workspace-a', boardId: 'board-a', parentId: 'task-root',
      title: '子任務', status: 'todo', nodeType: 'task', order: 1, kanbanStageId: 'task-root',
      collaboratorIds: [], tagIds: [], isDurationLocked: false, isArchived: false,
    },
  });
  write(KEYS.dependencies, []);
  write(KEYS.tags, []);
  write(KEYS.members, {});
  write(KEYS.records, []);
  write(KEYS.executions, {});
  write(KEYS.session, { uid: 'local-test-user' });
  write('projed-local-test.taskTrackingReferences.v1', [
    reference('ref-root', 'task-root', 'primary:task-root', 0.0001),
    reference('ref-child', 'task-child', 'ref-root', 0.0002),
  ]);
};

const expectCode = async (code: BackupError['code'], run: () => unknown | Promise<unknown>) => {
  await assert.rejects(run, (error: unknown) => error instanceof BackupError && error.code === code);
};

let passed = 0;
const checks: string[] = [];
const test = async (name: string, run: () => unknown | Promise<unknown>) => {
  await run();
  passed += 1;
  checks.push(name);
  console.log(`PASS ${name}`);
};

const main = async () => {
  seed();
  const { localTestBackupService } = await import('../src/services/backup/localTestBackupService');
  const source = await localTestBackupService.readBoardSource('workspace-a', 'board-a');
  const packageValue = await createBackupPackage(source, 'local-test', 'dev-095-backup');

  await test('v3 package preserves fractional and nested reference placement metadata', async () => {
    assert.equal(packageValue.schemaVersion, 3);
    assert.deepEqual(packageValue.payload.trackingReferences?.map(item => item.order), [0.0001, 0.0002]);
    assert.equal(packageValue.payload.trackingReferences?.[1]?.parentSourceId, 'ref-root');
    const inspected = await inspectBackupText(stringifyBackupPackage(packageValue));
    assert.deepEqual(inspected.package.payload.trackingReferences?.map(item => item.order), [0.0001, 0.0002]);
  });

  await test('v3 local backup copy read-after-write retains references without canonical duplication', async () => {
    const plan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'copy_to_new_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Backup workspace', boardTitle: '主管追蹤副本' },
    });
    assert.equal(plan.allowed, true);
    const result = await localTestBackupService.executeImport({ package: packageValue, plan, newBoardTitle: '主管追蹤副本' });
    const restored = await localTestBackupService.readBoardSource('workspace-a', result.targetBoardId);
    const semantic = await compareBackupSemantics(packageValue, restored, result);
    assert.equal(semantic.valid, true);
    assert.equal(semantic.expectedFingerprint, semantic.actualFingerprint);
    const restoredReferences = (restored.trackingReferences ?? []).filter(item => item.boardId === result.targetBoardId && !item.removedAt);
    assert.equal(restoredReferences.length, 2);
    const restoredRoot = restoredReferences.find(item => item.parentPlacementId?.startsWith('primary:'));
    const restoredChild = restoredReferences.find(item => item.parentPlacementId === restoredRoot?.id);
    assert.ok(restoredRoot && restoredChild, 'nested reference parent mapping must survive copy import');
    assert.equal(restored.tasks.filter(task => task.boardId === result.targetBoardId).length, 2);
  });

  await test('v2 import remains primary-only and does not invent references', async () => {
    const legacy = structuredClone(packageValue) as BackupPackageV2 & { schemaVersion: number };
    legacy.schemaVersion = 2;
    delete legacy.payload.trackingReferences;
    delete legacy.manifest.entities.trackingReferences;
    legacy.manifest.includes = legacy.manifest.includes.filter(item => item !== '追蹤副本與投影位置');
    legacy.manifest.checksum.value = await calculateBackupChecksum(legacy.payload);
    const inspected = await inspectBackupText(JSON.stringify(legacy));
    assert.equal(inspected.package.payload.trackingReferences, undefined);
    const plan = await localTestBackupService.planImport({
      package: inspected.package,
      mode: 'copy_to_new_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Backup workspace', boardTitle: 'V2 primary copy' },
    });
    const result = await localTestBackupService.executeImport({ package: inspected.package, plan, newBoardTitle: 'V2 primary copy' });
    const restored = await localTestBackupService.readBoardSource('workspace-a', result.targetBoardId);
    assert.equal((restored.trackingReferences ?? []).filter(item => item.boardId === result.targetBoardId && !item.removedAt).length, 0);
  });

  await test('external canonical reference fails closed instead of cloning or dropping', async () => {
    const externalSource: BoardBackupSource = {
      ...source,
      trackingReferences: [reference('ref-external', 'task-on-board-b', null, 0.0001)],
    };
    await expectCode('OUT_OF_PACKAGE_REFERENCE', () => createBackupPackage(externalSource, 'local-test', 'dev-095-external'));
  });

  const artifact = {
    dev: 'DEV-095',
    sourceRevision: 'working-tree',
    environment: 'node-backup-readback',
    provider: 'local-test',
    status: 'passed',
    passed: true,
    checks,
    summary: { PASS: passed, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 },
    generatedAt: new Date().toISOString(),
  };
  const outputDirectory = resolve(process.cwd(), 'output/qa/dev-095');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'backup-result.json'), JSON.stringify(artifact, null, 2));
  console.log(`DEV-095 backup readback: ${passed} passed`);
};

await main();
