import assert from 'node:assert/strict';
import {
  BACKUP_MAX_DEPENDENCIES,
  BACKUP_MAX_FILE_BYTES,
  BACKUP_MAX_TASKS,
  BackupError,
  type BackupExecutionResult,
  type BackupPackageV2,
  type BoardBackupSource,
} from '../src/features/backup/types';
import {
  calculateBackupChecksum,
  canonicalizeBackupPayload,
  compareBackupSemantics,
  createBackupPackage,
  inspectBackupText,
  stringifyBackupPackage,
  validateBackupFileSize,
  validateBackupPayload,
} from '../src/features/backup/package';

let passed = 0;
const test = async (name: string, run: () => void | Promise<void>) => {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
};

const expectBackupError = async (code: BackupError['code'], run: () => unknown | Promise<unknown>) => {
  await assert.rejects(run, (error: unknown) => error instanceof BackupError && error.code === code);
};

const source: BoardBackupSource = {
  workspaceId: 'workspace-a',
  boardId: 'board-a',
  boardTitle: 'DEV-047 source',
  tasks: [
    {
      id: 'task-root', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null,
      title: 'Root', status: 'in_progress', collaboratorIds: ['member-a'], tagIds: ['tag-a'],
      nodeType: 'group', order: 0, isDurationLocked: false, isArchived: false,
      detailNotes: [{ id: 'note-a', title: 'Acceptance', content: 'Round trip' }],
      startDate: '2026-07-01', endDate: '2026-07-31', assigneeId: 'member-a',
    },
    {
      id: 'task-child', workspaceId: 'workspace-a', boardId: 'board-a', parentId: 'task-root',
      title: 'Archived child', description: 'Preserve me', status: 'completed', collaboratorIds: [],
      tagIds: ['tag-a'], nodeType: 'task', kanbanStageId: 'task-root', order: 1,
      isDurationLocked: true, isArchived: true,
    },
  ],
  dependencies: [
    { id: 'dependency-a', fromId: 'task-root', fromSide: 'end', toId: 'task-child', toSide: 'start', offset: 2 },
  ],
  tags: [
    { id: 'tag-a', workspaceId: 'workspace-a', name: 'Critical', color: 'red', order: 0 },
    { id: 'unused-tag', workspaceId: 'workspace-a', name: 'Unused', color: 'gray', order: 1 },
  ],
};

const resign = async (packageValue: BackupPackageV2) => {
  packageValue.manifest.entities = {
    tasks: packageValue.payload.tasks.length,
    dependencies: packageValue.payload.dependencies.length,
    tags: packageValue.payload.tags.length,
  };
  packageValue.manifest.checksum.value = await calculateBackupChecksum(packageValue.payload);
  return packageValue;
};

const main = async () => {
  const packageValue = await createBackupPackage(source, 'local-test', 'dev-047-test');

  await test('MOD-047-001 canonical checksum ignores entity and object key order', async () => {
    const reordered = structuredClone(packageValue.payload);
    reordered.tasks.reverse();
    reordered.tags.reverse();
    const first = await calculateBackupChecksum(packageValue.payload);
    const second = await calculateBackupChecksum(reordered);
    assert.equal(first, second);
    assert.equal(canonicalizeBackupPayload(packageValue.payload), canonicalizeBackupPayload(reordered));
  });

  await test('MOD-047-002 V2 round trip validates checksum and manifest', async () => {
    const inspected = await inspectBackupText(stringifyBackupPackage(packageValue));
    assert.equal(inspected.sourceKind, 'v2');
    assert.deepEqual(inspected.package.manifest.entities, { tasks: 2, dependencies: 1, tags: 1 });
    assert.equal(inspected.package.payload.tasks[1].isArchived, true);
  });

  await test('MOD-047-003 legacy kanban stage IDs normalize to the scoped list node', async () => {
    const legacySource: BoardBackupSource = {
      ...source,
      tasks: [
        {
          ...source.tasks[0], id: 'list_lane-a', title: 'Lane A', nodeType: 'group',
          tagIds: [], collaboratorIds: [],
        },
        {
          ...source.tasks[1], id: 'card_c1768815829499', parentId: 'list_lane-a',
          kanbanStageId: 'lane-a', tagIds: [], collaboratorIds: [],
        },
      ],
      dependencies: [],
      tags: [],
    };
    const normalized = await createBackupPackage(legacySource, 'local-test');
    assert.equal(normalized.payload.tasks[1].kanbanStageSourceId, 'list_lane-a');
  });

  await test('MOD-047-004 missing stage IDs recover from an unambiguous root group', async () => {
    const recoverableSource: BoardBackupSource = {
      ...source,
      tasks: [
        { ...source.tasks[0], id: 'list_root', title: 'Root', nodeType: 'group', parentId: null, tagIds: [], collaboratorIds: [] },
        { ...source.tasks[1], id: 'task-recoverable', parentId: 'list_root', kanbanStageId: 'missing-stage', tagIds: [], collaboratorIds: [] },
      ],
      dependencies: [],
      tags: [],
    };
    const normalized = await createBackupPackage(recoverableSource, 'local-test');
    assert.equal(normalized.payload.tasks[1].kanbanStageSourceId, 'list_root');
  });

  await test('MOD-047-005 archived orphan tasks are preserved as detached backup roots', async () => {
    const orphanSource: BoardBackupSource = {
      ...source,
      tasks: [
        { ...source.tasks[0], id: 'archived-orphan', parentId: 'deleted-parent', isArchived: true, tagIds: [], collaboratorIds: [] },
      ],
      dependencies: [],
      tags: [],
    };
    const normalized = await createBackupPackage(orphanSource, 'local-test');
    assert.equal(normalized.payload.tasks[0].parentSourceId, null);
    assert.equal(normalized.payload.tasks[0].isArchived, true);

    const activeOrphanSource: BoardBackupSource = {
      ...orphanSource,
      tasks: [{ ...orphanSource.tasks[0], id: 'active-orphan', isArchived: false }],
    };
    await expectBackupError('INVALID_FILE', () => createBackupPackage(activeOrphanSource, 'local-test'));
  });

  await test('MOD-047-006 serializer excludes storage IDs, tokens, and unrelated tags', async () => {
    const unsafeSource = structuredClone(source) as BoardBackupSource & { token?: string };
    unsafeSource.token = 'secret-token-value';
    (unsafeSource.tasks[0] as typeof unsafeSource.tasks[0] & { storageId: string; signedUrl: string }).storageId = 'db-row-id';
    (unsafeSource.tasks[0] as typeof unsafeSource.tasks[0] & { signedUrl: string }).signedUrl = 'https://signed.invalid';
    const text = stringifyBackupPackage(await createBackupPackage(unsafeSource, 'local-test'));
    assert.equal(text.includes('secret-token-value'), false);
    assert.equal(text.includes('db-row-id'), false);
    assert.equal(text.includes('signed.invalid'), false);
    assert.equal(text.includes('unused-tag'), false);
  });

  await test('MOD-047-007 tampered payload is blocked', async () => {
    const tampered = structuredClone(packageValue);
    tampered.payload.tasks[0].title = 'Tampered';
    await expectBackupError('CHECKSUM_MISMATCH', () => inspectBackupText(JSON.stringify(tampered)));
  });

  await test('MOD-047-008 duplicate, dangling, and cyclic trees are blocked', async () => {
    const duplicate = structuredClone(packageValue);
    duplicate.payload.tasks[1].sourceId = duplicate.payload.tasks[0].sourceId;
    await resign(duplicate);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(duplicate)));
    const dangling = structuredClone(packageValue);
    dangling.payload.tasks[1].parentSourceId = 'missing-parent';
    await resign(dangling);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(dangling)));
    const cycle = structuredClone(packageValue);
    cycle.payload.tasks[0].parentSourceId = 'task-child';
    await resign(cycle);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(cycle)));
    const danglingStage = structuredClone(packageValue);
    danglingStage.payload.tasks[1].kanbanStageSourceId = 'missing-stage';
    await resign(danglingStage);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(danglingStage)));
    const duplicateTagName = structuredClone(packageValue);
    duplicateTagName.payload.tags.push({
      ...duplicateTagName.payload.tags[0], sourceId: 'tag-duplicate', name: ' critical ',
    });
    duplicateTagName.payload.tasks[0].tagSourceIds.push('tag-duplicate');
    await resign(duplicateTagName);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(duplicateTagName)));
  });

  await test('MOD-047-009 dangling dependencies are blocked during inspect and export', async () => {
    const dangling = structuredClone(packageValue);
    dangling.payload.dependencies[0].toSourceId = 'missing-task';
    await resign(dangling);
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(dangling)));
    const dirtySource = structuredClone(source);
    dirtySource.dependencies.push({ id: 'cross', fromId: 'task-root', fromSide: 'end', toId: 'other-board-task', toSide: 'start' });
    await expectBackupError('INVALID_FILE', () => createBackupPackage(dirtySource, 'local-test'));
    const legacyNode = { id: 'legacy-a', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null, title: 'Legacy', status: 'todo', order: 0 };
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify({
      version: 'wbs-1.2',
      nodes: [legacyNode],
      dependencies: [{ id: 'legacy-dangling', fromId: 'legacy-a', toId: 'missing-task' }],
    })));
  });

  await test('MOD-047-010 entity and file limits fail closed', async () => {
    const atTaskLimit = structuredClone(packageValue.payload);
    atTaskLimit.tasks = Array.from({ length: BACKUP_MAX_TASKS }, (_, index) => ({
      ...packageValue.payload.tasks[0], sourceId: `limit-task-${index}`, parentSourceId: null, tagSourceIds: [],
    }));
    atTaskLimit.dependencies = [];
    atTaskLimit.tags = [];
    validateBackupPayload(atTaskLimit);
    const oversizedPayload = structuredClone(packageValue.payload);
    oversizedPayload.tasks = Array.from({ length: BACKUP_MAX_TASKS + 1 }, (_, index) => ({
      ...packageValue.payload.tasks[0], sourceId: `task-${index}`, parentSourceId: null, tagSourceIds: [],
    }));
    assert.throws(() => validateBackupPayload(oversizedPayload), (error: unknown) =>
      error instanceof BackupError && error.code === 'INVALID_FILE');
    const atDependencyLimit = structuredClone(packageValue.payload);
    atDependencyLimit.dependencies = Array.from({ length: BACKUP_MAX_DEPENDENCIES }, (_, index) => ({
      ...packageValue.payload.dependencies[0], sourceId: `limit-dependency-${index}`,
    }));
    validateBackupPayload(atDependencyLimit);
    const overDependencyLimit = structuredClone(atDependencyLimit);
    overDependencyLimit.dependencies.push({
      ...packageValue.payload.dependencies[0], sourceId: 'limit-dependency-over',
    });
    assert.throws(() => validateBackupPayload(overDependencyLimit), (error: unknown) =>
      error instanceof BackupError && error.code === 'INVALID_FILE');
    validateBackupFileSize(BACKUP_MAX_FILE_BYTES);
    assert.throws(() => validateBackupFileSize(BACKUP_MAX_FILE_BYTES + 1), (error: unknown) =>
      error instanceof BackupError && error.code === 'INVALID_FILE');
    const oversizedText = JSON.stringify({ padding: 'x'.repeat(BACKUP_MAX_FILE_BYTES) });
    await expectBackupError('INVALID_FILE', () => inspectBackupText(oversizedText));
  });

  await test('MOD-047-011 unsupported schema and manifest count mismatch are blocked', async () => {
    const unsupported = structuredClone(packageValue) as BackupPackageV2 & { schemaVersion: number };
    unsupported.schemaVersion = 3;
    await expectBackupError('UNSUPPORTED_VERSION', () => inspectBackupText(JSON.stringify(unsupported)));
    const wrongManifest = structuredClone(packageValue);
    wrongManifest.manifest.entities.tasks = 99;
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(wrongManifest)));
    const invalidBackend = structuredClone(packageValue) as unknown as { source: { backend: string } };
    invalidBackend.source.backend = 'firebase';
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(invalidBackend)));
    const invalidCanonicalization = structuredClone(packageValue) as unknown as {
      manifest: { canonicalization: string };
    };
    invalidCanonicalization.manifest.canonicalization = 'unknown';
    await expectBackupError('UNSUPPORTED_VERSION', () => inspectBackupText(JSON.stringify(invalidCanonicalization)));
    const misleadingManifest = structuredClone(packageValue);
    misleadingManifest.manifest.excludes = ['沒有排除任何資料'];
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(misleadingManifest)));
    const invalidIdentity = structuredClone(packageValue);
    invalidIdentity.packageId = 'not-a-uuid';
    await expectBackupError('INVALID_FILE', () => inspectBackupText(JSON.stringify(invalidIdentity)));
  });

  await test('MOD-047-012 legacy single board converts, multi-board fails closed', async () => {
    const legacyNode = { id: 'legacy-a', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null, title: 'Legacy', status: 'todo', order: 0 };
    const single = await inspectBackupText(JSON.stringify({ version: 'wbs-1.2', nodes: [legacyNode] }));
    assert.equal(single.sourceKind, 'legacy-converted');
    assert.equal(single.package.schemaVersion, 2);
    await expectBackupError('LEGACY_SCOPE_AMBIGUOUS', () => inspectBackupText(JSON.stringify({
      version: 'wbs-2.0',
      nodes: [legacyNode, { ...legacyNode, id: 'legacy-b', boardId: 'board-b' }],
    })));
  });

  await test('MOD-047-013 semantic read-after-write detects field and graph corruption', async () => {
    const actual: BoardBackupSource = {
      workspaceId: 'workspace-b', boardId: 'board-copy', boardTitle: 'Restored board',
      tasks: [
        { ...source.tasks[0], id: 'copy-root', workspaceId: 'workspace-b', boardId: 'board-copy', tagIds: ['target-tag'] },
        { ...source.tasks[1], id: 'copy-child', workspaceId: 'workspace-b', boardId: 'board-copy', parentId: 'copy-root', kanbanStageId: 'copy-root', tagIds: ['target-tag'] },
      ],
      dependencies: [{ ...source.dependencies[0], id: 'copy-dependency', fromId: 'copy-root', toId: 'copy-child' }],
      tags: [{ id: 'target-tag', workspaceId: 'workspace-b', name: 'Critical', color: 'blue', order: 0 }],
    };
    const result: BackupExecutionResult = {
      executionId: 'execution-a', mode: 'copy_to_new_board', targetWorkspaceId: 'workspace-b',
      targetBoardId: 'board-copy', targetBoardTitle: 'Restored board',
      counts: { create: 2, update: 0, delete: 0, keep: 0, dependencies: 1, tagsToCreate: 0, tagsToReuse: 1, unresolvedPeople: 0, blockingRecordLinks: 0 },
      warnings: [], sourceTaskIdMap: { 'task-root': 'copy-root', 'task-child': 'copy-child' },
      postWriteFingerprint: 'backend', idempotentReplay: false,
    };
    const matching = await compareBackupSemantics(packageValue, actual, result);
    assert.equal(matching.valid, true);
    assert.equal(matching.expectedFingerprint, matching.actualFingerprint);
    actual.tasks[1].title = 'Corrupted after write';
    const corrupted = await compareBackupSemantics(packageValue, actual, result);
    assert.notEqual(corrupted.expectedFingerprint, corrupted.actualFingerprint);
  });

  console.log(`DEV-047 backup package model: ${passed} passed`);
};

await main();
