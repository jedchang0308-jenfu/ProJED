import assert from 'node:assert/strict';
import { BackupError } from '../src/features/backup/types';
import { compareBackupSemantics, createBackupPackage } from '../src/features/backup/package';

const KEYS = {
  workspaces: 'projed-local-test.workspaces',
  nodes: 'projed-local-test.nodes',
  dependencies: 'projed-local-test.dependencies',
  tags: 'projed-local-test.tags',
  members: 'projed-local-test.boardMembers',
  records: 'projed-local-test.knowledgeRecords',
  session: 'projed-local-test.session',
  executions: 'projed-local-test.backupImportExecutions',
} as const;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  private failKey: string | null = null;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failKey === key) {
      this.failKey = null;
      throw new Error(`Injected write failure at ${key}`);
    }
    this.values.set(key, String(value));
  }
  failNextWriteTo(key: string) { this.failKey = key; }
  snapshot() {
    return Object.fromEntries(Array.from(this.values.entries()).sort(([left], [right]) => left.localeCompare(right)));
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const write = (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));
const read = <T>(key: string): T => JSON.parse(storage.getItem(key) ?? 'null') as T;
const setSession = (uid: string) => write(KEYS.session, { uid, email: `${uid}@projed.local` });

const seed = () => {
  storage.clear();
  write(KEYS.workspaces, [
    {
      id: 'workspace-a', title: 'Workspace A', ownerId: 'local-test-user',
      boards: [{ id: 'board-a', title: 'Source board', dependencies: [], order: 1, createdAt: 1 }],
    },
    { id: 'workspace-b', title: 'Workspace B', ownerId: 'local-test-user', boards: [] },
  ]);
  write(KEYS.nodes, {
    'task-root': {
      id: 'task-root', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null,
      title: 'Root', status: 'in_progress', assigneeId: 'local-test-member',
      collaboratorIds: ['missing-user'], tagIds: ['tag-source'], nodeType: 'group',
      order: 0, startDate: '2026-07-01', endDate: '2026-07-31', isArchived: false,
      detailNotes: [{ id: 'note-a', title: 'QC', content: 'Preserve details' }],
    },
    'task-child': {
      id: 'task-child', workspaceId: 'workspace-a', boardId: 'board-a', parentId: 'task-root',
      title: 'Child', status: 'completed', collaboratorIds: [], tagIds: ['tag-source'],
      nodeType: 'task', kanbanStageId: 'task-root', order: 1, isDurationLocked: true, isArchived: true,
    },
  });
  write(KEYS.dependencies, [
    { id: 'dependency-source', fromId: 'task-root', fromSide: 'end', toId: 'task-child', toSide: 'start', offset: 1 },
  ]);
  write(KEYS.tags, [
    { id: 'tag-source', workspaceId: 'workspace-a', name: 'Critical', color: 'red', order: 0 },
    { id: 'tag-target', workspaceId: 'workspace-b', name: 'critical', color: 'blue', order: 0 },
  ]);
  write(KEYS.members, {
    'workspace-a:board-a': [
      { userId: 'local-test-user', role: 'owner' },
      { userId: 'local-test-viewer', role: 'viewer' },
    ],
  });
  write(KEYS.records, []);
  write(KEYS.executions, {});
  setSession('local-test-user');
};

let passed = 0;
const test = async (name: string, run: () => void | Promise<void>) => {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
};

const expectCode = async (code: BackupError['code'], run: () => unknown | Promise<unknown>) => {
  await assert.rejects(run, (error: unknown) => error instanceof BackupError && error.code === code);
};

const main = async () => {
  seed();
  const { localTestBackupService } = await import('../src/services/backup/localTestBackupService');
  const source = await localTestBackupService.readBoardSource('workspace-a', 'board-a');
  const packageValue = await createBackupPackage(source, 'local-test', 'dev-047-local-db');
  const sourceFingerprintBeforeCopy = await localTestBackupService.readBoardFingerprint('workspace-a', 'board-a');

  let copyResult: Awaited<ReturnType<typeof localTestBackupService.executeImport>>;
  let copyPlan: Awaited<ReturnType<typeof localTestBackupService.planImport>>;
  await test('DB-047-C01 owner copy is isolated and semantically equal', async () => {
    copyPlan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'copy_to_new_board',
      target: { workspaceId: 'workspace-b', workspaceTitle: 'Workspace B', boardTitle: 'Restored copy' },
    });
    assert.equal(copyPlan.allowed, true);
    assert.equal(copyPlan.counts.tagsToReuse, 1);
    assert.equal(copyPlan.counts.unresolvedPeople, 1);
    assert.equal(copyPlan.warnings.some(warning => warning.includes('沿用目標工作區')), true);
    copyResult = await localTestBackupService.executeImport({ package: packageValue, plan: copyPlan, newBoardTitle: 'Restored copy' });
    const copySource = await localTestBackupService.readBoardSource('workspace-b', copyResult.targetBoardId);
    const semantic = await compareBackupSemantics(packageValue, copySource, copyResult);
    assert.equal(semantic.valid, true);
    assert.equal(semantic.expectedFingerprint, semantic.actualFingerprint);
    assert.equal(await localTestBackupService.readBoardFingerprint('workspace-a', 'board-a'), sourceFingerprintBeforeCopy);
    assert.equal(copySource.tasks.some(task => ['task-root', 'task-child'].includes(task.id)), false);
    assert.equal(copySource.tasks.find(task => task.title === 'Root')?.assigneeId, 'local-test-member');
    assert.deepEqual(copySource.tasks.find(task => task.title === 'Root')?.collaboratorIds, []);
  });

  await test('DB-047-C02 duplicate execution is idempotent', async () => {
    const boardCountBefore = read<Array<{ boards: unknown[] }>>(KEYS.workspaces).reduce((sum, workspace) => sum + workspace.boards.length, 0);
    const replay = await localTestBackupService.executeImport({ package: packageValue, plan: copyPlan, newBoardTitle: 'Restored copy' });
    const boardCountAfter = read<Array<{ boards: unknown[] }>>(KEYS.workspaces).reduce((sum, workspace) => sum + workspace.boards.length, 0);
    assert.equal(replay.targetBoardId, copyResult.targetBoardId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(boardCountAfter, boardCountBefore);
  });

  await test('DB-047-C03 role matrix matches create and destructive-restore policy', async () => {
    const members = read<Record<string, Array<{ userId: string; role: string }>>>(KEYS.members);
    members['workspace-a:board-a'].push(
      { userId: 'local-test-admin', role: 'admin' },
      { userId: 'local-test-pm', role: 'project_manager' },
      { userId: 'local-test-member', role: 'member' },
    );
    write(KEYS.members, members);

    const roles = [
      { userId: 'local-test-admin', copy: true, replace: true },
      { userId: 'local-test-pm', copy: true, replace: true },
      { userId: 'local-test-member', copy: false, replace: false },
      { userId: 'local-test-viewer', copy: false, replace: false },
    ];
    for (const role of roles) {
      setSession(role.userId);
      await localTestBackupService.readBoardSource('workspace-a', 'board-a');
      const copy = await localTestBackupService.planImport({
        package: packageValue,
        mode: 'copy_to_new_board',
        target: { workspaceId: 'workspace-b', workspaceTitle: 'Workspace B', boardTitle: `${role.userId} copy` },
      });
      const replace = await localTestBackupService.planImport({
        package: packageValue,
        mode: 'replace_current_board',
        target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Source board' },
      });
      assert.equal(copy.allowed, role.copy, `${role.userId} copy policy`);
      assert.equal(replace.allowed, role.replace, `${role.userId} replace policy`);
      if (role.userId === 'local-test-pm') {
        const pmCopy = await localTestBackupService.executeImport({
          package: packageValue,
          plan: copy,
          newBoardTitle: 'PM role copy',
        });
        const copiedMembers = read<Record<string, Array<{ userId: string; role: string }>>>(KEYS.members);
        assert.equal(
          copiedMembers[`workspace-b:${pmCopy.targetBoardId}`]?.find(member => member.userId === role.userId)?.role,
          'project_manager',
          'copy must not elevate the creator role',
        );
      }
    }

    setSession('outsider');
    await expectCode('PERMISSION_DENIED', () => localTestBackupService.readBoardSource('workspace-a', 'board-a'));
    setSession('local-test-user');
  });

  await test('DB-047-R01 cross-origin replace is blocked before mutation', async () => {
    const foreign = structuredClone(packageValue);
    foreign.source.boardId = 'foreign-board';
    const before = storage.snapshot();
    const plan = await localTestBackupService.planImport({
      package: foreign,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Source board' },
    });
    assert.equal(plan.allowed, false);
    assert.equal(plan.blockers.some(blocker => blocker.code === 'CROSS_BOARD_ID_COLLISION'), true);
    assert.deepEqual(storage.snapshot(), before);
  });

  await test('DB-047-R02 out-of-package record links block removal', async () => {
    const nodes = read<Record<string, Record<string, unknown>>>(KEYS.nodes);
    nodes['target-only'] = {
      id: 'target-only', workspaceId: 'workspace-a', boardId: 'board-a', parentId: null,
      title: 'Target only', status: 'todo', order: 99, isArchived: false,
    };
    write(KEYS.nodes, nodes);
    write(KEYS.records, [{
      id: 'record-a', workspaceId: 'workspace-a', boardId: 'board-a', type: 'meeting',
      title: 'Linked', content: '', status: 'published', visibility: 'project',
      taskLinks: [{ id: 'link-a', nodeId: 'target-only', role: 'related' }],
    }]);
    const before = storage.snapshot();
    const plan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Source board' },
    });
    assert.equal(plan.allowed, false);
    assert.equal(plan.counts.blockingRecordLinks, 1);
    assert.equal(plan.blockers.some(blocker => blocker.code === 'OUT_OF_PACKAGE_REFERENCE'), true);
    assert.deepEqual(storage.snapshot(), before);
  });

  let stalePlan: Awaited<ReturnType<typeof localTestBackupService.planImport>>;
  await test('DB-047-R03 stale fingerprint blocks concurrent target changes', async () => {
    write(KEYS.records, [{
      id: 'record-retained', workspaceId: 'workspace-a', boardId: 'board-a', type: 'meeting',
      title: 'Retained', content: '', status: 'published', visibility: 'project',
      taskLinks: [{ id: 'link-retained', nodeId: 'task-root', role: 'related' }],
    }]);
    stalePlan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Source board' },
    });
    assert.equal(stalePlan.allowed, true);
    const nodes = read<Record<string, Record<string, unknown>>>(KEYS.nodes);
    nodes['task-root'] = { ...nodes['task-root'], title: 'Concurrent edit' };
    write(KEYS.nodes, nodes);
    const beforeExecute = storage.snapshot();
    await expectCode('TARGET_CHANGED', () => localTestBackupService.executeImport({ package: packageValue, plan: stalePlan }));
    assert.deepEqual(storage.snapshot(), beforeExecute);
  });

  await test('DB-047-R04 injected commit failure restores every local table', async () => {
    const workspaces = read<Array<{ id: string; boards: Array<{ id: string; title: string }> }>>(KEYS.workspaces);
    workspaces[0].boards[0].title = 'Renamed current board';
    write(KEYS.workspaces, workspaces);
    const plan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Renamed current board' },
    });
    assert.equal(plan.allowed, true);
    const before = storage.snapshot();
    storage.failNextWriteTo(KEYS.dependencies);
    await expectCode('IMPORT_ROLLED_BACK', () => localTestBackupService.executeImport({ package: packageValue, plan }));
    assert.deepEqual(storage.snapshot(), before);
  });

  await test('DB-047-R05 valid replace preserves board identity, title, members, and retained record links', async () => {
    const membersBefore = storage.getItem(KEYS.members);
    const recordsBefore = storage.getItem(KEYS.records);
    const plan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Renamed current board' },
    });
    assert.equal(plan.allowed, true);
    assert.equal(plan.counts.delete, 1);
    const result = await localTestBackupService.executeImport({ package: packageValue, plan });
    const restored = await localTestBackupService.readBoardSource('workspace-a', 'board-a');
    const semantic = await compareBackupSemantics(packageValue, restored, result);
    assert.equal(semantic.expectedFingerprint, semantic.actualFingerprint);
    assert.equal(restored.boardTitle, 'Renamed current board');
    assert.equal(restored.tasks.some(task => task.id === 'target-only'), false);
    assert.equal(storage.getItem(KEYS.members), membersBefore);
    assert.equal(storage.getItem(KEYS.records), recordsBefore);
  });

  await test('DB-047-R06 viewer cannot replace', async () => {
    setSession('local-test-viewer');
    const before = storage.snapshot();
    const plan = await localTestBackupService.planImport({
      package: packageValue,
      mode: 'replace_current_board',
      target: { workspaceId: 'workspace-a', workspaceTitle: 'Workspace A', boardId: 'board-a', boardTitle: 'Renamed current board' },
    });
    assert.equal(plan.allowed, false);
    assert.equal(plan.blockers.some(blocker => blocker.code === 'PERMISSION_DENIED'), true);
    assert.deepEqual(storage.snapshot(), before);
  });

  console.log(`DEV-047 local transaction matrix: ${passed} passed`);
};

await main();
