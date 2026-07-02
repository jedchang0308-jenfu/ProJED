import {
  WORKSPACE_ROLE_CAPABILITIES,
  createDefaultBoardRolePermissionMatrix,
  normalizeBoardRolePermissionMatrix,
  type ActivityEvent,
  type ActivityEventListQuery,
  type AuditLogEntry,
  type BoardInviteAcceptInput,
  type Board,
  type BoardWorkspaceTransferPreview,
  type BoardInviteCreateInput,
  type BoardMember,
  type BoardRolePermissionMatrix,
  type CurrentBoardAccess,
  type Dependency,
  type InboxItem,
  type InboxItemPromotionInput,
  type InboxItemPromotionResult,
  type KnowledgeRecord,
  type KnowledgeRecordInput,
  type PersonalQuickTaskInput,
  type PersonalTaskPlacementInput,
  type PersonalTaskZoneInfo,
  type TaskBoardMoveInput,
  type TaskBoardMoveResult,
  type TaskWorkbenchStageInput,
  type TaskWorkbenchStageResult,
  type TaskNode,
  type TaskTag,
  type Workspace,
  type WorkspaceMember,
} from '../types';
import {
  boardService as firestoreBoardService,
  dependencyService as firestoreDependencyService,
  memberService as firestoreMemberService,
  nodeService as firestoreNodeService,
  tagService as firestoreTagService,
  recordService as firestoreRecordService,
  workspaceService as firestoreWorkspaceService,
} from './firestoreService';
import {
  supabaseBoardService,
  supabaseBoardInviteService,
  supabaseDependencyService,
  supabaseEventLogService,
  supabaseInboxService,
  supabaseMemberService,
  supabaseNodeService,
  supabaseRecordService,
  supabaseTaskZoneService,
  supabaseTagService,
  supabaseWorkspaceService,
} from './supabase/projedService';
import {
  localTestBoardService,
  localTestBoardInviteService,
  localTestDependencyService,
  localTestMemberService,
  localTestNodeService,
  localTestRecordService,
  localTestEventLogService,
  localTestTagService,
  localTestWorkspaceService,
} from './localTestService';
import type { TaskSubscriptionSource } from '../utils/taskSubscriptionSources';

export type DataBackend = 'firebase' | 'supabase' | 'local-test';

const configuredBackend = import.meta.env.VITE_DATA_BACKEND as DataBackend | undefined;

export const dataBackend: DataBackend =
  configuredBackend === 'local-test'
    ? 'local-test'
    : configuredBackend === 'supabase'
      ? 'supabase'
      : 'firebase';
export const isSupabaseBackend = dataBackend === 'supabase';
export const isLocalTestBackend = dataBackend === 'local-test';

const BOARD_ROLE_PERMISSIONS_KEY = 'projed.boardRolePermissions';
const FALLBACK_MEMO_CLOUD_KEY = 'projed.quickMemo.cloudItems';
const FALLBACK_TASK_ZONE_KEY = 'projed.taskZone.personalTasks';
const FALLBACK_TASK_ZONE: PersonalTaskZoneInfo = {
  workspaceId: 'personal_task_zone',
  boardId: 'personal_task_zone',
};

const getRolePermissionKey = (workspaceId: string, boardId: string) => `${workspaceId}:${boardId}`;

const readFallbackRolePermissions = (
  workspaceId: string,
  boardId: string
): BoardRolePermissionMatrix => {
  try {
    const stored = localStorage.getItem(BOARD_ROLE_PERMISSIONS_KEY);
    const allPermissions = stored ? JSON.parse(stored) as Record<string, Partial<BoardRolePermissionMatrix>> : {};
    return normalizeBoardRolePermissionMatrix(allPermissions[getRolePermissionKey(workspaceId, boardId)]);
  } catch {
    return createDefaultBoardRolePermissionMatrix();
  }
};

const writeFallbackRolePermissions = (
  workspaceId: string,
  boardId: string,
  permissions: BoardRolePermissionMatrix
): void => {
  try {
    const stored = localStorage.getItem(BOARD_ROLE_PERMISSIONS_KEY);
    const allPermissions = stored ? JSON.parse(stored) as Record<string, BoardRolePermissionMatrix> : {};
    localStorage.setItem(BOARD_ROLE_PERMISSIONS_KEY, JSON.stringify({
      ...allPermissions,
      [getRolePermissionKey(workspaceId, boardId)]: normalizeBoardRolePermissionMatrix(permissions),
    }));
  } catch {
    // Fallback persistence should not block the UI.
  }
};

const logAuditBestEffort = async (entry: Omit<AuditLogEntry, 'id' | 'actorId' | 'createdAt'>) => {
  if (!isSupabaseBackend) return;
  try {
    await supabaseEventLogService.logAudit(entry);
  } catch (error) {
    console.warn('[auditLog] Failed to write collaboration audit event:', error);
  }
};

const readFallbackMemoCloud = (): InboxItem[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FALLBACK_MEMO_CLOUD_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeFallbackMemoCloud = (items: InboxItem[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FALLBACK_MEMO_CLOUD_KEY, JSON.stringify(items));
};

const readFallbackTaskZoneTasks = (): TaskNode[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FALLBACK_TASK_ZONE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeFallbackTaskZoneTasks = (tasks: TaskNode[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FALLBACK_TASK_ZONE_KEY, JSON.stringify(tasks));
};

const fallbackInboxService = {
  list: async (): Promise<InboxItem[]> => readFallbackMemoCloud(),

  upsert: async (ownerId: string, item: InboxItem): Promise<InboxItem> => {
    const now = Date.now();
    const cloudId = item.cloudId || `memo_cloud_${item.clientMutationId || item.id}`;
    const synced: InboxItem = {
      ...item,
      id: cloudId,
      cloudId,
      schemaVersion: 2,
      createdBy: ownerId,
      createdAuthUserId: ownerId,
      syncStatus: 'synced',
      requiresOwnershipConfirmation: false,
      lastSyncError: null,
      updatedAt: now,
    };
    const items = readFallbackMemoCloud();
    const next = [
      synced,
      ...items.filter(existing =>
        existing.cloudId !== cloudId &&
        existing.id !== cloudId &&
        existing.clientMutationId !== synced.clientMutationId
      ),
    ];
    writeFallbackMemoCloud(next);
    return synced;
  },

  markCompleted: async (itemId: string): Promise<InboxItem> => {
    const now = Date.now();
    const items = readFallbackMemoCloud();
    const target = items.find(item => item.id === itemId || item.cloudId === itemId);
    if (!target) throw new Error('找不到備忘項目。');
    const updated = { ...target, captureStatus: 'completed' as const, completedAt: now, updatedAt: now };
    writeFallbackMemoCloud(items.map(item => item === target ? updated : item));
    return updated;
  },

  archive: async (itemId: string): Promise<InboxItem> => {
    const now = Date.now();
    const items = readFallbackMemoCloud();
    const target = items.find(item => item.id === itemId || item.cloudId === itemId);
    if (!target) throw new Error('找不到備忘項目。');
    const updated = { ...target, captureStatus: 'archived' as const, archivedAt: now, updatedAt: now };
    writeFallbackMemoCloud(items.map(item => item === target ? updated : item));
    return updated;
  },

  promote: async (input: InboxItemPromotionInput): Promise<InboxItemPromotionResult> => {
    const now = Date.now();
    const items = readFallbackMemoCloud();
    const target = items.find(item => item.id === input.inboxItemId || item.cloudId === input.inboxItemId);
    if (!target) throw new Error('找不到備忘項目。');
    if (target.captureStatus === 'promoted' && target.promotionClientMutationId !== input.promotionClientMutationId) {
      throw new Error('此備忘已轉成任務。');
    }

    const updated: InboxItem = {
      ...target,
      captureStatus: 'promoted',
      promotedTaskNodeId: target.promotedTaskNodeId || input.taskNodeId,
      promotedAt: target.promotedAt || now,
      promotionClientMutationId: target.promotionClientMutationId || input.promotionClientMutationId,
      updatedAt: now,
    };
    writeFallbackMemoCloud(items.map(item => item === target ? updated : item));

    return {
      item: updated,
      taskNode: {
        id: updated.promotedTaskNodeId || input.taskNodeId,
        workspaceId: input.workspaceId,
        boardId: input.boardId,
        parentId: input.parentId,
        title: input.title,
        description: input.description ?? undefined,
        status: 'todo',
        nodeType: 'task',
        order: input.order,
        endDate: input.endDate ?? undefined,
        createdAt: now,
        updatedAt: now,
      },
    };
  },
};

const fallbackTaskZoneService = {
  ensureZone: async (): Promise<PersonalTaskZoneInfo> => FALLBACK_TASK_ZONE,

  listUnplacedTasks: async (): Promise<TaskNode[]> =>
    readFallbackTaskZoneTasks().filter(task => !task.isArchived),

  createQuickTask: async (input: PersonalQuickTaskInput): Promise<TaskNode> => {
    const now = Date.now();
    const task: TaskNode = {
      id: `task_zone_${input.clientMutationId || now}`,
      workspaceId: FALLBACK_TASK_ZONE.workspaceId,
      boardId: FALLBACK_TASK_ZONE.boardId,
      parentId: null,
      title: input.title,
      description: input.description || undefined,
      status: 'todo',
      nodeType: 'task',
      order: now,
      endDate: input.suggestedDueDate || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const tasks = readFallbackTaskZoneTasks();
    writeFallbackTaskZoneTasks([task, ...tasks.filter(existing => existing.id !== task.id)]);
    return task;
  },

  updateTask: async (taskId: string, updates: Partial<TaskNode>): Promise<void> => {
    const tasks = readFallbackTaskZoneTasks();
    writeFallbackTaskZoneTasks(tasks.map(task => task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task));
  },

  archiveTask: async (taskId: string): Promise<void> => {
    const tasks = readFallbackTaskZoneTasks();
    writeFallbackTaskZoneTasks(tasks.map(task => task.id === taskId ? { ...task, isArchived: true, updatedAt: Date.now() } : task));
  },

  placeTaskOnBoard: async (input: PersonalTaskPlacementInput): Promise<TaskNode> => {
    const tasks = readFallbackTaskZoneTasks();
    const task = tasks.find(item => item.id === input.taskId);
    if (!task) throw new Error('找不到待歸位任務。');
    const placed: TaskNode = {
      ...task,
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      parentId: input.parentId,
      order: input.order ?? Date.now(),
      updatedAt: Date.now(),
    };
    writeFallbackTaskZoneTasks(tasks.filter(item => item.id !== input.taskId));
    return placed;
  },
};

export const workspaceService = {
  create: (userId: string, title?: string): Promise<Workspace> =>
    isLocalTestBackend
      ? localTestWorkspaceService.create(title)
      : isSupabaseBackend
      ? supabaseWorkspaceService.create(title)
      : firestoreWorkspaceService.create(userId, title),

  restore: (workspace: Workspace): Promise<void> =>
    isLocalTestBackend
      ? localTestWorkspaceService.restore(workspace)
      : isSupabaseBackend
      ? supabaseWorkspaceService.restore(workspace)
      : firestoreWorkspaceService.restore(workspace),

  update: (workspaceId: string, updates: Partial<Workspace>): Promise<void> =>
    isLocalTestBackend
      ? localTestWorkspaceService.update(workspaceId, updates)
      : isSupabaseBackend
      ? supabaseWorkspaceService.update(workspaceId, updates)
      : firestoreWorkspaceService.update(workspaceId, updates),

  delete: async (workspaceId: string): Promise<void> => {
    await logAuditBestEffort({
      workspaceId,
      action: 'workspace_deleted',
      entityTable: 'tenants',
      entityId: workspaceId,
      beforeData: { workspaceId },
      afterData: null,
    });

    return isLocalTestBackend
      ? localTestWorkspaceService.delete(workspaceId)
      : isSupabaseBackend
      ? supabaseWorkspaceService.delete(workspaceId)
      : firestoreWorkspaceService.delete(workspaceId);
  },
};

export const boardService = {
  create: (workspaceId: string, title?: string): Promise<Board> =>
    isLocalTestBackend
      ? localTestBoardService.create(workspaceId, title)
      : isSupabaseBackend
      ? supabaseBoardService.create(workspaceId, title)
      : firestoreBoardService.create(workspaceId, title),

  restore: (workspaceId: string, board: Board): Promise<void> =>
    isLocalTestBackend
      ? localTestBoardService.restore(workspaceId, board)
      : isSupabaseBackend
      ? supabaseBoardService.restore(workspaceId, board)
      : firestoreBoardService.restore(workspaceId, board),

  update: (workspaceId: string, boardId: string, updates: Partial<Board>): Promise<void> =>
    isLocalTestBackend
      ? localTestBoardService.update(workspaceId, boardId, updates)
      : isSupabaseBackend
      ? supabaseBoardService.update(workspaceId, boardId, updates)
      : firestoreBoardService.update(workspaceId, boardId, updates),

  delete: async (workspaceId: string, boardId: string): Promise<void> => {
    await logAuditBestEffort({
      workspaceId,
      boardId,
      action: 'board_deleted',
      entityTable: 'projects',
      entityId: boardId,
      beforeData: { boardId },
      afterData: null,
    });

    return isLocalTestBackend
      ? localTestBoardService.delete(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseBoardService.delete(workspaceId, boardId)
      : firestoreBoardService.delete(workspaceId, boardId);
  },

  previewWorkspaceTransfer: (
    workspaceId: string,
    boardId: string,
    targetWorkspaceId: string
  ): Promise<BoardWorkspaceTransferPreview> => {
    if (isLocalTestBackend) {
      return localTestBoardService.previewWorkspaceTransfer(workspaceId, boardId, targetWorkspaceId);
    }
    if (isSupabaseBackend) {
      return supabaseBoardService.previewWorkspaceTransfer(workspaceId, boardId, targetWorkspaceId);
    }
    return Promise.reject(new Error('Board transfer between workspaces requires the Supabase backend.'));
  },

  moveToWorkspace: (
    workspaceId: string,
    boardId: string,
    targetWorkspaceId: string,
    expectedBoardTitle: string
  ): Promise<BoardWorkspaceTransferPreview> => {
    if (isLocalTestBackend) {
      return localTestBoardService.moveToWorkspace(workspaceId, boardId, targetWorkspaceId, expectedBoardTitle);
    }
    if (isSupabaseBackend) {
      return supabaseBoardService.moveToWorkspace(workspaceId, boardId, targetWorkspaceId, expectedBoardTitle);
    }
    return Promise.reject(new Error('Board transfer between workspaces requires the Supabase backend.'));
  },
};

export const memberService = {
  listWorkspaceMembers: (workspaceId: string): Promise<WorkspaceMember[]> =>
    isLocalTestBackend
      ? localTestMemberService.listWorkspaceMembers(workspaceId)
      : isSupabaseBackend
      ? supabaseMemberService.listWorkspaceMembers(workspaceId)
      : firestoreMemberService.listWorkspaceMembers(workspaceId),

  listBoardMembers: (workspaceId: string, boardId: string): Promise<BoardMember[]> =>
    isLocalTestBackend
      ? localTestMemberService.listBoardMembers(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseMemberService.listBoardMembers(workspaceId, boardId)
      : firestoreMemberService.listBoardMembers(workspaceId, boardId),

  getBoardRolePermissions: async (workspaceId: string, boardId: string): Promise<BoardRolePermissionMatrix> =>
    isLocalTestBackend
      ? localTestMemberService.getBoardRolePermissions(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseMemberService.getBoardRolePermissions(workspaceId, boardId)
      : readFallbackRolePermissions(workspaceId, boardId),

  updateBoardRolePermissions: async (
    workspaceId: string,
    boardId: string,
    permissions: BoardRolePermissionMatrix
  ): Promise<void> =>
    isLocalTestBackend
      ? localTestMemberService.updateBoardRolePermissions(workspaceId, boardId, permissions)
      : isSupabaseBackend
      ? supabaseMemberService.updateBoardRolePermissions(workspaceId, boardId, permissions)
      : writeFallbackRolePermissions(workspaceId, boardId, permissions),

  getCurrentBoardAccess: async (
    workspaceId: string,
    boardId: string,
    userId: string
  ): Promise<CurrentBoardAccess> => {
    if (isSupabaseBackend) {
      return supabaseMemberService.getCurrentBoardAccess(workspaceId, boardId, userId);
    }

    const [workspaceMembers, boardMembers, rolePermissions] = await Promise.all([
      memberService.listWorkspaceMembers(workspaceId),
      memberService.listBoardMembers(workspaceId, boardId),
      memberService.getBoardRolePermissions(workspaceId, boardId),
    ]);
    const workspaceRole = workspaceMembers.find(member => member.userId === userId && member.status === 'active')?.role;
    const boardRole = boardMembers.find(member => member.userId === userId)?.role;
    const capabilities = new Set<CurrentBoardAccess['capabilities'][number]>();
    if (workspaceRole) {
      WORKSPACE_ROLE_CAPABILITIES[workspaceRole].forEach(capability => capabilities.add(capability));
      if (workspaceRole === 'owner' || workspaceRole === 'admin') {
        rolePermissions[workspaceRole].forEach(capability => capabilities.add(capability));
      }
    }
    if (boardRole) {
      rolePermissions[boardRole].forEach(capability => capabilities.add(capability));
    }
    return {
      workspaceId,
      boardId,
      workspaceRole,
      boardRole,
      capabilities: Array.from(capabilities),
    };
  },

  upsertBoardMember: (workspaceId: string, boardId: string, userId: string, role: BoardMember['role']): Promise<void> =>
    isLocalTestBackend
      ? localTestMemberService.upsertBoardMember(workspaceId, boardId, userId, role)
      : isSupabaseBackend
      ? supabaseMemberService.upsertBoardMember(workspaceId, boardId, userId, role)
      : Promise.resolve(),

  removeBoardMember: (workspaceId: string, boardId: string, userId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestMemberService.removeBoardMember(workspaceId, boardId, userId)
      : isSupabaseBackend
      ? supabaseMemberService.removeBoardMember(workspaceId, boardId, userId)
      : Promise.resolve(),
};

export const boardInviteService = {
  listPending: (workspaceId: string, boardId: string) =>
    isLocalTestBackend
      ? localTestBoardInviteService.listPending(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseBoardInviteService.listPending(workspaceId, boardId)
      : Promise.resolve([]),

  create: (workspaceId: string, boardId: string, input: BoardInviteCreateInput) =>
    isLocalTestBackend
      ? localTestBoardInviteService.create(workspaceId, boardId, input)
      : isSupabaseBackend
      ? supabaseBoardInviteService.create(workspaceId, boardId, input)
      : Promise.reject(new Error('Board email invites are only available with the Supabase backend.')),

  revoke: (workspaceId: string, boardId: string, inviteId: string) =>
    isLocalTestBackend
      ? localTestBoardInviteService.revoke(workspaceId, boardId, inviteId)
      : isSupabaseBackend
      ? supabaseBoardInviteService.revoke(workspaceId, boardId, inviteId)
      : Promise.reject(new Error('Board email invites are only available with the Supabase backend.')),

  accept: (input: BoardInviteAcceptInput) =>
    isLocalTestBackend
      ? localTestBoardInviteService.accept(input)
      : isSupabaseBackend
      ? supabaseBoardInviteService.accept(input)
      : Promise.reject(new Error('Board email invites are only available with the Supabase backend.')),
};

export const inboxService = {
  list: (): Promise<InboxItem[]> =>
    isSupabaseBackend ? supabaseInboxService.list() : fallbackInboxService.list(),

  upsert: (ownerId: string, item: InboxItem): Promise<InboxItem> =>
    isSupabaseBackend ? supabaseInboxService.upsert(ownerId, item) : fallbackInboxService.upsert(ownerId, item),

  markCompleted: (itemId: string): Promise<InboxItem> =>
    isSupabaseBackend ? supabaseInboxService.markCompleted(itemId) : fallbackInboxService.markCompleted(itemId),

  archive: (itemId: string): Promise<InboxItem> =>
    isSupabaseBackend ? supabaseInboxService.archive(itemId) : fallbackInboxService.archive(itemId),

  promote: (input: InboxItemPromotionInput): Promise<InboxItemPromotionResult> =>
    isSupabaseBackend ? supabaseInboxService.promote(input) : fallbackInboxService.promote(input),
};

export const taskZoneService = {
  ensureZone: (): Promise<PersonalTaskZoneInfo> =>
    isSupabaseBackend ? supabaseTaskZoneService.ensureZone() : fallbackTaskZoneService.ensureZone(),

  loadZoneTasks: async (): Promise<{ zone: PersonalTaskZoneInfo; tasks: TaskNode[] }> => {
    if (isSupabaseBackend) return supabaseTaskZoneService.loadZoneTasks();
    const zone = await fallbackTaskZoneService.ensureZone();
    const tasks = await fallbackTaskZoneService.listUnplacedTasks();
    return { zone, tasks };
  },

  listUnplacedTasks: (): Promise<TaskNode[]> =>
    isSupabaseBackend ? supabaseTaskZoneService.listUnplacedTasks() : fallbackTaskZoneService.listUnplacedTasks(),

  createQuickTask: (input: PersonalQuickTaskInput): Promise<TaskNode> =>
    isSupabaseBackend ? supabaseTaskZoneService.createQuickTask(input) : fallbackTaskZoneService.createQuickTask(input),

  updateTask: (taskId: string, updates: Partial<TaskNode>): Promise<void> =>
    isSupabaseBackend ? supabaseTaskZoneService.updateTask(taskId, updates) : fallbackTaskZoneService.updateTask(taskId, updates),

  archiveTask: (taskId: string): Promise<void> =>
    isSupabaseBackend ? supabaseTaskZoneService.archiveTask(taskId) : fallbackTaskZoneService.archiveTask(taskId),

  placeTaskOnBoard: (input: PersonalTaskPlacementInput): Promise<TaskNode> =>
    isSupabaseBackend ? supabaseTaskZoneService.placeTaskOnBoard(input) : fallbackTaskZoneService.placeTaskOnBoard(input),
};

export const nodeService = {
  listAssignedToMe: (source: TaskSubscriptionSource, currentUserId: string): Promise<TaskNode[]> =>
    isSupabaseBackend
      ? supabaseNodeService.listAssignedToMe(source, currentUserId)
      : Promise.resolve([]),

  moveToBoard: (input: TaskBoardMoveInput): Promise<TaskBoardMoveResult> =>
    isSupabaseBackend
      ? supabaseNodeService.moveToBoard(input)
      : Promise.reject(new Error('跨看板任務歸位目前只支援 Supabase backend。')),

  stageToWorkbench: (input: TaskWorkbenchStageInput): Promise<TaskWorkbenchStageResult> =>
    isSupabaseBackend
      ? supabaseNodeService.stageToWorkbench(input)
      : Promise.reject(new Error('拖回待歸位目前只支援 Supabase backend。')),

  create: (workspaceId: string, boardId: string, node: TaskNode): Promise<void | TaskNode> =>
    isLocalTestBackend
      ? localTestNodeService.create(workspaceId, boardId, node)
      : isSupabaseBackend
      ? supabaseNodeService.create(workspaceId, boardId, node)
      : firestoreNodeService.create(workspaceId, boardId, node),

  update: (workspaceId: string, boardId: string, nodeId: string, updates: Partial<TaskNode>): Promise<void> =>
    isLocalTestBackend
      ? localTestNodeService.update(workspaceId, boardId, nodeId, updates)
      : isSupabaseBackend
      ? supabaseNodeService.update(workspaceId, boardId, nodeId, updates)
      : firestoreNodeService.update(workspaceId, boardId, nodeId, updates),

  delete: (workspaceId: string, boardId: string, nodeId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestNodeService.delete(workspaceId, boardId, nodeId)
      : isSupabaseBackend
      ? supabaseNodeService.delete(workspaceId, boardId, nodeId)
      : firestoreNodeService.delete(workspaceId, boardId, nodeId),

  batchUpdate: (
    workspaceId: string,
    boardId: string,
    updates: { id: string; data: Partial<TaskNode> }[]
  ): Promise<void> =>
    isLocalTestBackend
      ? localTestNodeService.batchUpdate(workspaceId, boardId, updates)
      : isSupabaseBackend
      ? supabaseNodeService.batchUpdate(workspaceId, boardId, updates)
      : firestoreNodeService.batchUpdate(workspaceId, boardId, updates),

  /** Delete all nodes in a project, then create all provided nodes. For import/overwrite flows. */
  replaceAllByProject: async (workspaceId: string, boardId: string, nodes: TaskNode[]): Promise<void> => {
    if (isLocalTestBackend) {
      await localTestNodeService.replaceAllByProject(workspaceId, boardId, nodes);
      return;
    }

    if (isSupabaseBackend) {
      // Delete existing dependencies first (FK constraint), then nodes
      await supabaseDependencyService.deleteAllByProject(workspaceId, boardId);
      await supabaseNodeService.deleteAllByProject(workspaceId, boardId);
      // Insert new nodes sequentially to respect parent FK ordering
      // Sort nodes topologically (parents first)
      const sortedNodes: TaskNode[] = [];
      const visited = new Set<string>();
      const nodeMap = new Map<string, TaskNode>();
      nodes.forEach(n => nodeMap.set(n.id, n));

      const visit = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        const node = nodeMap.get(nodeId);
        if (!node) return;
        if (node.parentId) {
          visit(node.parentId);
        }
        visited.add(nodeId);
        sortedNodes.push(node);
      };

      nodes.forEach(n => visit(n.id));

      for (const node of sortedNodes) {
        await supabaseNodeService.upsert(workspaceId, boardId, node).catch(console.error);
      }
    } else {
      // Firebase: create each node (Firestore uses set/merge semantics)
      for (const node of nodes) {
        await firestoreNodeService.create(workspaceId, boardId, node).catch(console.error);
      }
    }
  },
};

export const dependencyService = {
  create: (workspaceId: string, boardId: string, dependency: Omit<Dependency, 'id'>): Promise<Dependency> =>
    isLocalTestBackend
      ? localTestDependencyService.create(workspaceId, boardId, dependency)
      : isSupabaseBackend
      ? supabaseDependencyService.create(workspaceId, boardId, dependency)
      : firestoreDependencyService.create(workspaceId, boardId, dependency),

  set: (workspaceId: string, boardId: string, dependency: Dependency): Promise<Dependency> =>
    isLocalTestBackend
      ? localTestDependencyService.set(workspaceId, boardId, dependency)
      : isSupabaseBackend
      ? supabaseDependencyService.set(workspaceId, boardId, dependency)
      : firestoreDependencyService.set(workspaceId, boardId, dependency),

  update: (workspaceId: string, boardId: string, dependencyId: string, updates: Partial<Dependency>): Promise<void> =>
    isLocalTestBackend
      ? localTestDependencyService.update(workspaceId, boardId, dependencyId, updates)
      : isSupabaseBackend
      ? supabaseDependencyService.update(workspaceId, boardId, dependencyId, updates)
      : firestoreDependencyService.update(workspaceId, boardId, dependencyId, updates),

  delete: (workspaceId: string, boardId: string, dependencyId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestDependencyService.delete(workspaceId, boardId, dependencyId)
      : isSupabaseBackend
      ? supabaseDependencyService.delete(workspaceId, boardId, dependencyId)
      : firestoreDependencyService.delete(workspaceId, boardId, dependencyId),
};

export const tagService = {
  listByWorkspace: (workspaceId: string): Promise<TaskTag[]> =>
    isLocalTestBackend
      ? localTestTagService.listByWorkspace(workspaceId)
      : isSupabaseBackend
      ? supabaseTagService.listByWorkspace(workspaceId)
      : firestoreTagService.listByWorkspace(workspaceId),

  create: (workspaceId: string, tag: TaskTag): Promise<TaskTag> =>
    isLocalTestBackend
      ? localTestTagService.create(workspaceId, tag)
      : isSupabaseBackend
      ? supabaseTagService.create(workspaceId, tag)
      : firestoreTagService.create(workspaceId, tag),

  update: (workspaceId: string, tagId: string, updates: Partial<TaskTag>): Promise<void> =>
    isLocalTestBackend
      ? localTestTagService.update(workspaceId, tagId, updates)
      : isSupabaseBackend
      ? supabaseTagService.update(workspaceId, tagId, updates)
      : firestoreTagService.update(workspaceId, tagId, updates),

  delete: (workspaceId: string, tagId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestTagService.delete(workspaceId, tagId)
      : isSupabaseBackend
      ? supabaseTagService.delete(workspaceId, tagId)
      : firestoreTagService.delete(workspaceId, tagId),

  setNodeTags: (workspaceId: string, boardId: string, nodeId: string, tagIds: string[]): Promise<void> =>
    isLocalTestBackend
      ? localTestTagService.setNodeTags(workspaceId, boardId, nodeId, tagIds)
      : isSupabaseBackend
      ? supabaseTagService.setNodeTags(workspaceId, boardId, nodeId, tagIds)
      : firestoreTagService.setNodeTags(workspaceId, boardId, nodeId, tagIds),
};

export const recordService = {
  listByProject: (workspaceId: string, boardId: string): Promise<KnowledgeRecord[]> =>
    isLocalTestBackend
      ? localTestRecordService.listByProject(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseRecordService.listByProject(workspaceId, boardId)
      : firestoreRecordService.listByProject(workspaceId, boardId),

  listByNode: (workspaceId: string, boardId: string, nodeId: string): Promise<KnowledgeRecord[]> =>
    isLocalTestBackend
      ? localTestRecordService.listByNode(workspaceId, boardId, nodeId)
      : isSupabaseBackend
      ? supabaseRecordService.listByNode(workspaceId, boardId, nodeId)
      : firestoreRecordService.listByNode(workspaceId, boardId, nodeId),

  upsert: (workspaceId: string, boardId: string, input: KnowledgeRecordInput): Promise<KnowledgeRecord> =>
    isLocalTestBackend
      ? localTestRecordService.upsert(workspaceId, boardId, input)
      : isSupabaseBackend
      ? supabaseRecordService.upsert(workspaceId, boardId, input)
      : firestoreRecordService.upsert(workspaceId, boardId, input),

  delete: (workspaceId: string, boardId: string, recordId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestRecordService.delete(workspaceId, boardId, recordId)
      : isSupabaseBackend
      ? supabaseRecordService.delete(workspaceId, boardId, recordId)
      : firestoreRecordService.delete(workspaceId, boardId, recordId),
};

export const eventLogService = {
  logActivity: (event: Omit<ActivityEvent, 'id' | 'actorId' | 'createdAt'>): Promise<void> =>
    isLocalTestBackend
      ? localTestEventLogService.logActivity(event)
      : isSupabaseBackend
        ? supabaseEventLogService.logActivity(event)
        : Promise.resolve(),

  listActivity: (query: ActivityEventListQuery): Promise<ActivityEvent[]> =>
    isLocalTestBackend
      ? localTestEventLogService.listActivity(query)
      : isSupabaseBackend
        ? supabaseEventLogService.listActivity(query)
        : Promise.resolve([]),

  logAudit: (entry: Omit<AuditLogEntry, 'id' | 'actorId' | 'createdAt'>): Promise<void> =>
    isSupabaseBackend ? supabaseEventLogService.logAudit(entry) : Promise.resolve(),
};
