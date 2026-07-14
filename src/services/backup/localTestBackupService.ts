import type { Board, BoardMember, Dependency, TaskNode, TaskTag, Workspace } from '../../types';
import {
  BackupError,
  type BackupBackendAdapter,
  type BackupBackendExecuteRequest,
  type BackupBackendPlanRequest,
  type BackupExecutionResult,
  type BackupImportCounts,
  type BackupImportPlan,
  type BoardBackupSource,
} from '../../features/backup/types';
import { buildBackupPayload, calculateBackupChecksum, validateBackupPayload } from '../../features/backup/package';
import { localTestMemberService, localTestStorage } from '../localTestService';

const WORKSPACES_KEY = 'projed-local-test.workspaces';
const NODES_KEY = 'projed-local-test.nodes';
const DEPENDENCIES_KEY = 'projed-local-test.dependencies';
const TAGS_KEY = 'projed-local-test.tags';
const BOARD_MEMBERS_KEY = 'projed-local-test.boardMembers';
const EXECUTIONS_KEY = 'projed-local-test.backupImportExecutions';
const LOCAL_TEST_SESSION_KEY = 'projed-local-test.session';

type LocalMember = Pick<BoardMember, 'userId' | 'role' | 'createdAt' | 'updatedAt'>;
type LocalExecutionMap = Record<string, BackupExecutionResult>;

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const createExecutionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return createId('execution');
};

const readCurrentUserId = () => {
  try {
    const session = JSON.parse(localStorage.getItem(LOCAL_TEST_SESSION_KEY) ?? 'null') as { uid?: string } | null;
    return session?.uid || 'local-test-user';
  } catch {
    return 'local-test-user';
  }
};

const readExecutions = (): LocalExecutionMap => {
  try {
    return JSON.parse(localStorage.getItem(EXECUTIONS_KEY) ?? '{}') as LocalExecutionMap;
  } catch {
    return {};
  }
};

const getBoardMemberRole = (workspaceId: string, boardId: string, userId: string) => {
  const key = `${workspaceId}:${boardId}`;
  const stored = localTestStorage.readBoardMembers()[key];
  if (stored) return stored.find(member => member.userId === userId)?.role;
  const defaults: Record<string, LocalMember['role']> = {
    'local-test-user': 'owner',
    'local-test-admin': 'admin',
    'local-test-pm': 'project_manager',
    'local-test-member': 'member',
    'local-test-viewer': 'viewer',
  };
  return defaults[userId];
};

const getWorkspaceRole = async (workspaceId: string, userId: string) =>
  (await localTestMemberService.listWorkspaceMembers(workspaceId))
    .find(member => member.userId === userId && member.status === 'active')?.role;

const canCreateBoard = async (workspaceId: string, userId: string) =>
  ['owner', 'admin', 'project_manager'].includes(String(await getWorkspaceRole(workspaceId, userId)));

const canManageBoard = (workspaceId: string, boardId: string, userId: string) =>
  ['owner', 'admin', 'project_manager'].includes(String(getBoardMemberRole(workspaceId, boardId, userId)));

const findBoard = (workspaceId: string, boardId: string) => {
  const workspace = localTestStorage.readWorkspaces().find(item => item.id === workspaceId);
  const board = workspace?.boards.find(item => item.id === boardId);
  if (!workspace || !board) throw new BackupError('INVALID_FILE', '找不到指定的工作區或看板。');
  return { workspace, board };
};

const buildBoardSource = (
  workspaceId: string,
  boardId: string,
  state?: {
    workspaces: Workspace[];
    nodes: Record<string, TaskNode>;
    dependencies: Dependency[];
    tags: TaskTag[];
  }
): BoardBackupSource => {
  const workspaces = state?.workspaces ?? localTestStorage.readWorkspaces();
  const nodes = state?.nodes ?? localTestStorage.readNodes();
  const dependencies = state?.dependencies ?? localTestStorage.readDependencies();
  const tags = state?.tags ?? localTestStorage.readTags();
  const workspace = workspaces.find(item => item.id === workspaceId);
  const board = workspace?.boards.find(item => item.id === boardId);
  if (!workspace || !board) throw new BackupError('INVALID_FILE', '找不到指定的工作區或看板。');
  const tasks = Object.values(nodes).filter(task => task.workspaceId === workspaceId && task.boardId === boardId);
  const taskIds = new Set(tasks.map(task => task.id));
  const scopedDependencies = dependencies.filter(dependency =>
    taskIds.has(dependency.fromId) && taskIds.has(dependency.toId)
  );
  const referencedTagIds = new Set(tasks.flatMap(task => task.tagIds ?? []));
  return {
    workspaceId,
    boardId,
    boardTitle: board.title,
    tasks,
    dependencies: scopedDependencies,
    tags: tags.filter(tag => tag.workspaceId === workspaceId && referencedTagIds.has(tag.id)),
  };
};

const calculateSourceFingerprint = async (source: BoardBackupSource) =>
  calculateBackupChecksum(buildBackupPayload(source));

const getKnownWorkspaceUserIds = async (workspaceId: string) =>
  new Set((await localTestMemberService.listWorkspaceMembers(workspaceId))
    .filter(member => member.status === 'active')
    .map(member => member.userId));

const getUnresolvedPeople = (request: BackupBackendPlanRequest, knownUserIds: Set<string>) => {
  const referenced = new Set<string>();
  request.package.payload.tasks.forEach(task => {
    if (task.assigneeId) referenced.add(task.assigneeId);
    task.collaboratorIds.forEach(id => referenced.add(id));
  });
  return Array.from(referenced).filter(id => !knownUserIds.has(id));
};

const getTagPlan = (request: BackupBackendPlanRequest) => {
  const existing = localTestStorage.readTags().filter(tag => tag.workspaceId === request.target.workspaceId);
  const byName = new Map(existing.map(tag => [tag.name.trim().toLocaleLowerCase(), tag]));
  let create = 0;
  let reuse = 0;
  const warnings: string[] = [];
  request.package.payload.tags.forEach(tag => {
    const matched = byName.get(tag.name.trim().toLocaleLowerCase());
    if (!matched) {
      create += 1;
      return;
    }
    reuse += 1;
    if (matched.color !== tag.color) warnings.push(`標籤「${tag.name}」沿用目標工作區的 ${matched.color} 顏色。`);
  });
  return { create, reuse, warnings };
};

const commitStorageTransaction = (values: Record<string, unknown>) => {
  const before = new Map<string, string | null>();
  Object.keys(values).forEach(key => before.set(key, localStorage.getItem(key)));
  try {
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  } catch (error) {
    before.forEach((value, key) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
    throw new BackupError('IMPORT_ROLLED_BACK', '本機交易寫入失敗，目標看板已維持執行前狀態。', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const emptyCounts = (): BackupImportCounts => ({
  create: 0,
  update: 0,
  delete: 0,
  keep: 0,
  dependencies: 0,
  tagsToCreate: 0,
  tagsToReuse: 0,
  unresolvedPeople: 0,
  blockingRecordLinks: 0,
});

const planImport = async (request: BackupBackendPlanRequest): Promise<BackupImportPlan> => {
  validateBackupPayload(request.package.payload);
  const now = new Date();
  const blockers: BackupImportPlan['blockers'] = [];
  const warnings: string[] = [];
  const counts = emptyCounts();
  const actorId = readCurrentUserId();
  const targetWorkspace = localTestStorage.readWorkspaces().find(item => item.id === request.target.workspaceId);
  if (!targetWorkspace) blockers.push({ code: 'PERMISSION_DENIED', message: '目標工作區不存在或不可存取。' });

  const knownUserIds = await getKnownWorkspaceUserIds(request.target.workspaceId);
  const unresolvedPeople = getUnresolvedPeople(request, knownUserIds);
  const tagPlan = getTagPlan(request);
  counts.dependencies = request.package.payload.dependencies.length;
  counts.tagsToCreate = tagPlan.create;
  counts.tagsToReuse = tagPlan.reuse;
  counts.unresolvedPeople = unresolvedPeople.length;
  warnings.push(...tagPlan.warnings);
  if (unresolvedPeople.length) warnings.push(`${unresolvedPeople.length} 位負責人或協作者不在目標工作區，匯入時會清除其指派。`);

  let fingerprint: string | null = null;
  if (request.mode === 'copy_to_new_board') {
    counts.create = request.package.payload.tasks.length;
    if (!(await canCreateBoard(request.target.workspaceId, actorId))) {
      blockers.push({ code: 'PERMISSION_DENIED', message: '你沒有在目標工作區建立看板的權限。' });
    }
  } else {
    const targetBoardId = request.target.boardId;
    if (!targetBoardId) {
      blockers.push({ code: 'INVALID_FILE', message: '取代模式缺少目標看板。' });
    } else {
      try {
        findBoard(request.target.workspaceId, targetBoardId);
        if (!canManageBoard(request.target.workspaceId, targetBoardId, actorId)) {
          blockers.push({ code: 'PERMISSION_DENIED', message: '你沒有取代目前看板內容的管理權限。' });
        }
        if (
          request.package.source.workspaceId !== request.target.workspaceId
          || request.package.source.boardId !== targetBoardId
        ) {
          blockers.push({ code: 'CROSS_BOARD_ID_COLLISION', message: '只有同一張看板建立的備份可以取代目前內容；請改用複製成新看板。' });
        }

        const allNodes = localTestStorage.readNodes();
        const targetTasks = Object.values(allNodes).filter(task =>
          task.workspaceId === request.target.workspaceId && task.boardId === targetBoardId
        );
        const packageTaskIds = new Set(request.package.payload.tasks.map(task => task.sourceId));
        const targetTaskIds = new Set(targetTasks.map(task => task.id));
        counts.update = request.package.payload.tasks.filter(task => targetTaskIds.has(task.sourceId)).length;
        counts.keep = counts.update;
        counts.create = request.package.payload.tasks.length - counts.update;
        counts.delete = targetTasks.filter(task => !packageTaskIds.has(task.id)).length;

        const collision = request.package.payload.tasks.find(task => {
          const existing = allNodes[task.sourceId];
          return existing && (existing.workspaceId !== request.target.workspaceId || existing.boardId !== targetBoardId);
        });
        if (collision) blockers.push({
          code: 'CROSS_BOARD_ID_COLLISION',
          message: `任務 ${collision.sourceId} 已存在於其他看板，不能執行同源取代。`,
        });

        const removedIds = new Set(targetTasks.filter(task => !packageTaskIds.has(task.id)).map(task => task.id));
        const blockingLinks = localTestStorage.readKnowledgeRecords()
          .filter(record => record.workspaceId === request.target.workspaceId && record.boardId === targetBoardId)
          .flatMap(record => record.taskLinks)
          .filter(link => removedIds.has(link.nodeId));
        counts.blockingRecordLinks = blockingLinks.length;
        if (blockingLinks.length) blockers.push({
          code: 'OUT_OF_PACKAGE_REFERENCE',
          message: `有 ${blockingLinks.length} 個紀錄連結指向將被移除的任務，已阻擋取代。`,
        });
        fingerprint = await calculateSourceFingerprint(buildBoardSource(request.target.workspaceId, targetBoardId));
      } catch (error) {
        if (error instanceof BackupError) blockers.push({ code: error.code, message: error.message });
        else throw error;
      }
    }
  }

  return {
    planId: createExecutionId(),
    executionId: createExecutionId(),
    packageId: request.package.packageId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    mode: request.mode,
    target: request.target,
    allowed: blockers.length === 0,
    expectedTargetFingerprint: fingerprint,
    counts,
    warnings,
    blockers,
    confirmationPhrase: request.mode === 'replace_current_board' ? request.target.boardTitle : undefined,
  };
};

const resolveTagMapping = (workspaceId: string, sourceTags: BackupBackendExecuteRequest['package']['payload']['tags']) => {
  const allTags = localTestStorage.readTags();
  const targetTags = allTags.filter(tag => tag.workspaceId === workspaceId);
  const byName = new Map(targetTags.map(tag => [tag.name.trim().toLocaleLowerCase(), tag]));
  const idMap = new Map<string, string>();
  const created: TaskTag[] = [];
  sourceTags.forEach(tag => {
    const matched = byName.get(tag.name.trim().toLocaleLowerCase());
    if (matched) {
      idMap.set(tag.sourceId, matched.id);
      return;
    }
    const next: TaskTag = {
      id: createId('local_tag'),
      workspaceId,
      name: tag.name,
      color: tag.color,
      order: targetTags.length + created.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    created.push(next);
    byName.set(tag.name.trim().toLocaleLowerCase(), next);
    idMap.set(tag.sourceId, next.id);
  });
  return { idMap, tags: [...allTags, ...created] };
};

const executeImport = async (request: BackupBackendExecuteRequest): Promise<BackupExecutionResult> => {
  const existing = readExecutions()[request.plan.executionId];
  if (existing) return { ...existing, idempotentReplay: true };
  if (request.plan.packageId !== request.package.packageId) {
    throw new BackupError('INVALID_FILE', '匯入計畫與備份檔不一致，請重新檢查檔案。');
  }
  if (Date.parse(request.plan.expiresAt) <= Date.now()) {
    throw new BackupError('TARGET_CHANGED', '匯入計畫已過期，請重新產生預覽。');
  }

  const refreshedPlan = await planImport({
    package: request.package,
    mode: request.plan.mode,
    target: request.plan.target,
  });
  if (!refreshedPlan.allowed) {
    const first = refreshedPlan.blockers[0];
    throw new BackupError(first?.code ?? 'IMPORT_ROLLED_BACK', first?.message ?? '匯入前置檢查失敗。');
  }
  if (
    request.plan.mode === 'replace_current_board'
    && refreshedPlan.expectedTargetFingerprint !== request.plan.expectedTargetFingerprint
  ) {
    throw new BackupError('TARGET_CHANGED', '目標看板在預覽後已有變更，請重新產生匯入計畫。');
  }

  const actorId = readCurrentUserId();
  const workspaceId = request.plan.target.workspaceId;
  const workspaces = localTestStorage.readWorkspaces();
  const allNodes = localTestStorage.readNodes();
  const allDependencies = localTestStorage.readDependencies();
  const allMembers = localTestStorage.readBoardMembers();
  const { idMap: tagIdMap, tags } = resolveTagMapping(workspaceId, request.package.payload.tags);
  const knownUserIds = await getKnownWorkspaceUserIds(workspaceId);

  let targetBoardId = request.plan.target.boardId;
  let targetBoardTitle = request.plan.target.boardTitle;
  let nextWorkspaces = workspaces;
  let nextMembers = allMembers;
  if (request.plan.mode === 'copy_to_new_board') {
    const creatorRole = await getWorkspaceRole(workspaceId, actorId);
    if (!creatorRole || !['owner', 'admin', 'project_manager'].includes(creatorRole)) {
      throw new BackupError('PERMISSION_DENIED', '你沒有在目標工作區建立看板的權限。');
    }
    targetBoardId = createId('local_board');
    targetBoardTitle = request.newBoardTitle?.trim() || request.package.payload.board.title;
    const board: Board = {
      id: targetBoardId,
      title: targetBoardTitle,
      dependencies: [],
      order: Date.now(),
      createdAt: Date.now(),
    };
    nextWorkspaces = workspaces.map(workspace => workspace.id === workspaceId
      ? { ...workspace, boards: [...workspace.boards, board] }
      : workspace);
    nextMembers = {
      ...allMembers,
      [`${workspaceId}:${targetBoardId}`]: [{
        userId: actorId,
        role: creatorRole,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    };
  }
  if (!targetBoardId) throw new BackupError('INVALID_FILE', '匯入缺少目標看板。');

  const taskIdMap = new Map<string, string>();
  request.package.payload.tasks.forEach(task => {
    taskIdMap.set(task.sourceId, request.plan.mode === 'copy_to_new_board' ? createId('local_task') : task.sourceId);
  });
  const now = Date.now();
  const importedTasks = request.package.payload.tasks.map((task): TaskNode => ({
    id: taskIdMap.get(task.sourceId) as string,
    workspaceId,
    boardId: targetBoardId as string,
    parentId: task.parentSourceId ? taskIdMap.get(task.parentSourceId) ?? null : null,
    title: task.title,
    detailNotes: task.detailNotes?.map(note => ({ ...note })),
    description: task.description,
    status: task.status,
    assigneeId: task.assigneeId && knownUserIds.has(task.assigneeId) ? task.assigneeId : undefined,
    collaboratorIds: task.collaboratorIds.filter(id => knownUserIds.has(id)),
    tagIds: task.tagSourceIds.map(id => tagIdMap.get(id)).filter((id): id is string => Boolean(id)),
    startDate: task.startDate,
    endDate: task.endDate,
    isDurationLocked: task.isDurationLocked,
    nodeType: task.nodeType,
    kanbanStageId: task.kanbanStageSourceId
      ? taskIdMap.get(task.kanbanStageSourceId)
      : undefined,
    order: task.order,
    createdAt: task.createdAt ?? now,
    updatedAt: now,
    isArchived: task.isArchived,
  }));
  const targetBeforeIds = new Set(Object.values(allNodes)
    .filter(task => task.workspaceId === workspaceId && task.boardId === targetBoardId)
    .map(task => task.id));
  const nextNodes = request.plan.mode === 'replace_current_board'
    ? Object.fromEntries(Object.entries(allNodes).filter(([, task]) =>
        task.workspaceId !== workspaceId || task.boardId !== targetBoardId
      )) as Record<string, TaskNode>
    : { ...allNodes };
  importedTasks.forEach(task => { nextNodes[task.id] = task; });

  const retainedDependencies = allDependencies.filter(dependency =>
    !targetBeforeIds.has(dependency.fromId) && !targetBeforeIds.has(dependency.toId)
  );
  const importedDependencies: Dependency[] = request.package.payload.dependencies.map(dependency => ({
    id: createId('local_dep'),
    fromId: taskIdMap.get(dependency.fromSourceId) as string,
    fromSide: dependency.fromSide,
    toId: taskIdMap.get(dependency.toSourceId) as string,
    toSide: dependency.toSide,
    offset: dependency.offset,
  }));
  const nextDependencies = [...retainedDependencies, ...importedDependencies];

  const postWriteFingerprint = await calculateSourceFingerprint(buildBoardSource(workspaceId, targetBoardId, {
    workspaces: nextWorkspaces,
    nodes: nextNodes,
    dependencies: nextDependencies,
    tags,
  }));
  const result: BackupExecutionResult = {
    executionId: request.plan.executionId,
    mode: request.plan.mode,
    targetWorkspaceId: workspaceId,
    targetBoardId,
    targetBoardTitle,
    counts: refreshedPlan.counts,
    warnings: refreshedPlan.warnings,
    sourceTaskIdMap: Object.fromEntries(taskIdMap),
    postWriteFingerprint,
    idempotentReplay: false,
  };
  commitStorageTransaction({
    [WORKSPACES_KEY]: nextWorkspaces,
    [NODES_KEY]: nextNodes,
    [DEPENDENCIES_KEY]: nextDependencies,
    [TAGS_KEY]: tags,
    [BOARD_MEMBERS_KEY]: nextMembers,
    [EXECUTIONS_KEY]: { ...readExecutions(), [request.plan.executionId]: result },
  });
  return result;
};

export const localTestBackupService: BackupBackendAdapter = {
  readBoardSource: async (workspaceId, boardId) => {
    if (!getBoardMemberRole(workspaceId, boardId, readCurrentUserId())) {
      throw new BackupError('PERMISSION_DENIED', '找不到要備份的看板，或你沒有讀取權限。');
    }
    return buildBoardSource(workspaceId, boardId);
  },
  planImport,
  executeImport,
  readBoardFingerprint: async (workspaceId, boardId) =>
    calculateSourceFingerprint(buildBoardSource(workspaceId, boardId)),
};
