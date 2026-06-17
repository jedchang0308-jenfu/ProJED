import {
  WORKSPACE_ROLE_CAPABILITIES,
  createDefaultBoardRolePermissionMatrix,
  normalizeBoardRolePermissionMatrix,
  type ActivityEvent,
  type ActivityEventListQuery,
  type AuditLogEntry,
  type BoardInviteAcceptInput,
  type Board,
  type BoardInviteCreateInput,
  type BoardMember,
  type BoardRolePermissionMatrix,
  type CurrentBoardAccess,
  type Dependency,
  type KnowledgeRecord,
  type KnowledgeRecordInput,
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
  supabaseMemberService,
  supabaseNodeService,
  supabaseRecordService,
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

export const nodeService = {
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
