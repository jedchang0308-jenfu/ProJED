import {
  normalizeBoardRolePermissionMatrix,
  type Board,
  type BoardWorkspaceTransferPreview,
  type BoardInvite,
  type BoardInviteAcceptInput,
  type BoardInviteCreateInput,
  type BoardMember,
  type BoardRolePermissionMatrix,
  type Dependency,
  type ActivityEvent,
  type KnowledgeRecord,
  type EditableKnowledgeRecord,
  type TaskCollectionRecord,
  type KnowledgeRecordInput,
  type MeetingDraftCheckpointInput,
  type MeetingDraftCheckpointResult,
  type TaskNode,
  type TaskTag,
  type Workspace,
  type WorkspaceMember,
} from '../types';
import { hashBoardInviteToken } from '../utils/boardInviteToken';
import { getLocalTestProfileOverride } from './localTestProfileService';
import { MeetingDraftCheckpointError } from './meetingDraftRecoveryService';
import {
  buildTaskCollectionSnapshot,
} from '../features/taskCollection/snapshot';
import { canonicalJsonSha256, canonicalJsonStringify } from '../features/taskCollection/canonicalJson';
import { projectTaskCollectionContent } from '../features/taskCollection/contentProjection';
import { TaskCollectionError } from '../features/taskCollection/errors';
import {
  completeTaskCollectionJournal,
  clearTaskCollectionJournal,
  readTaskCollectionJournal,
  prepareTaskCollectionJournal,
  setTaskCollectionJournalAfter,
} from '../features/taskCollection/localJournal';
import {
  TASK_COLLECTION_LIMITS,
} from '../features/taskCollection/types';
import type {
  TaskCollectionPreview,
  TaskCollectionResult,
  TaskCollectionSnapshot,
  TaskCollectionSummary,
} from '../features/taskCollection/types';

const WORKSPACES_KEY = 'projed-local-test.workspaces';
const NODES_KEY = 'projed-local-test.nodes';
const DEPENDENCIES_KEY = 'projed-local-test.dependencies';
const TAGS_KEY = 'projed-local-test.tags';
const BOARD_MEMBERS_KEY = 'projed-local-test.boardMembers';
const BOARD_INVITES_KEY = 'projed-local-test.boardInvites';
const BOARD_ROLE_PERMISSIONS_KEY = 'projed-local-test.boardRolePermissions';
const KNOWLEDGE_RECORDS_KEY = 'projed-local-test.knowledgeRecords';
const ACTIVITY_EVENTS_KEY = 'projed-local-test.activityEvents';
const LOCAL_TEST_SESSION_KEY = 'projed-local-test.session';
const TASK_COLLECTION_FAULT_KEY = 'projed-local-test.taskCollectionFault';
const TASK_PERSISTENCE_FAULT_KEY = 'projed-local-test.taskPersistenceFault';
const TASK_PERSISTENCE_TRACE_KEY = 'projed-local-test.taskPersistenceTrace';

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local test mode should never block the UI because persistence failed.
  }
};

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readWorkspaces = () => readJson<Workspace[]>(WORKSPACES_KEY, []);
const writeWorkspaces = (workspaces: Workspace[]) => writeJson(WORKSPACES_KEY, workspaces);
const sanitizeNodes = (nodes: Record<string, TaskNode>) => {
  let changed = false;
  const sanitized = { ...nodes };

  Object.keys(sanitized).forEach(id => {
    const node = sanitized[id];
    if (!node?.parentId) return;

    const visited = new Set<string>([id]);
    let current: string | null = node.parentId;

    while (current) {
      if (current === 'root' || current === node.boardId) return;
      if (current === id || visited.has(current) || !sanitized[current]) {
        sanitized[id] = {
          ...node,
          isArchived: true,
          updatedAt: Date.now(),
        };
        changed = true;
        return;
      }

      visited.add(current);
      current = sanitized[current]?.parentId || null;
    }
  });

  return changed ? sanitized : nodes;
};
const normalizeKanbanStageReferences = (nodes: Record<string, TaskNode>) => {
  const normalized = { ...nodes };
  let changed = false;
  const scopedNodes = new Map<string, TaskNode[]>();

  Object.values(nodes).forEach(node => {
    const scope = `${node.workspaceId}:${node.boardId}`;
    const current = scopedNodes.get(scope) ?? [];
    current.push(node);
    scopedNodes.set(scope, current);
  });

  scopedNodes.forEach(scopeNodes => {
    const byId = new Map(scopeNodes.map(node => [node.id, node]));
    scopeNodes.forEach(node => {
      if (!node.kanbanStageId || node.nodeType === 'group') return;
      const exactStage = byId.get(node.kanbanStageId);
      if (exactStage) return;

      const legacyStageId = node.kanbanStageId.startsWith('list_')
        ? node.kanbanStageId
        : `list_${node.kanbanStageId}`;
      if (byId.has(legacyStageId)) {
        normalized[node.id] = {
          ...node,
          kanbanStageId: legacyStageId,
          updatedAt: Date.now(),
        };
        changed = true;
        return;
      }

      const visited = new Set<string>();
      let parentId = node.parentId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        if (parent.nodeType === 'group' && !parent.parentId) {
          normalized[node.id] = {
            ...node,
            kanbanStageId: parent.id,
            updatedAt: Date.now(),
          };
          changed = true;
          break;
        }
        parentId = parent.parentId;
      }
    });
  });

  return changed ? normalized : nodes;
};
const readNodes = () => {
  const nodes = readJson<Record<string, TaskNode>>(NODES_KEY, {});
  const sanitized = sanitizeNodes(nodes);
  const normalized = normalizeKanbanStageReferences(sanitized);
  if (normalized !== nodes) writeJson(NODES_KEY, normalized);
  return normalized;
};
const writeNodes = (nodes: Record<string, TaskNode>) => writeJson(NODES_KEY, nodes);
const readDependencies = () => readJson<Dependency[]>(DEPENDENCIES_KEY, []);
const writeDependencies = (dependencies: Dependency[]) => writeJson(DEPENDENCIES_KEY, dependencies);
const readTags = () => readJson<TaskTag[]>(TAGS_KEY, []);
const writeTags = (tags: TaskTag[]) => writeJson(TAGS_KEY, tags);
type LocalBoardMemberRecord = Pick<BoardMember, 'userId' | 'role' | 'createdAt' | 'updatedAt'>;
type LocalBoardInviteRecord = BoardInvite & { tokenHash?: string };
const readBoardMembers = () => readJson<Record<string, LocalBoardMemberRecord[]>>(BOARD_MEMBERS_KEY, {});
const writeBoardMembers = (members: Record<string, LocalBoardMemberRecord[]>) => writeJson(BOARD_MEMBERS_KEY, members);
const readBoardInvites = () => readJson<Record<string, LocalBoardInviteRecord[]>>(BOARD_INVITES_KEY, {});
const writeBoardInvites = (invites: Record<string, LocalBoardInviteRecord[]>) => writeJson(BOARD_INVITES_KEY, invites);
const readBoardRolePermissions = () => readJson<Record<string, Partial<BoardRolePermissionMatrix>>>(BOARD_ROLE_PERMISSIONS_KEY, {});
const writeBoardRolePermissions = (permissions: Record<string, Partial<BoardRolePermissionMatrix>>) => writeJson(BOARD_ROLE_PERMISSIONS_KEY, permissions);
const readKnowledgeRecords = () => readJson<KnowledgeRecord[]>(KNOWLEDGE_RECORDS_KEY, []);
const writeKnowledgeRecords = (records: KnowledgeRecord[]) => writeJson(KNOWLEDGE_RECORDS_KEY, records);
const readActivityEvents = () => readJson<ActivityEvent[]>(ACTIVITY_EVENTS_KEY, []);
const writeActivityEvents = (events: ActivityEvent[]) => writeJson(ACTIVITY_EVENTS_KEY, events);
const writeStrict = (key: string, value: unknown) => {
  if (typeof localStorage === 'undefined') throw new Error('Local storage is unavailable.');
  localStorage.setItem(key, JSON.stringify(value));
};
const getBoardMemberKey = (workspaceId: string, boardId: string) => `${workspaceId}:${boardId}`;
const readCurrentLocalUserId = () =>
  readJson<{ uid?: string } | null>(LOCAL_TEST_SESSION_KEY, null)?.uid || 'local-test-user';

/**
 * Browser QA only: consume a one-shot fault requested through local storage.
 * This keeps timeout/error recovery coverage on the product delivery path
 * without changing normal local-test or production behaviour.
 */
const consumeTaskCollectionFault = (fault: string): boolean => {
  if (typeof localStorage === 'undefined') return false;
  const configured = localStorage.getItem(TASK_COLLECTION_FAULT_KEY);
  if (configured !== fault) return false;
  localStorage.removeItem(TASK_COLLECTION_FAULT_KEY);
  return true;
};
const consumeTaskPersistenceFault = (
  fault: 'reject-once' | 'timeout-no-commit-once' | 'timeout-commit-once',
): boolean => {
  if (typeof localStorage === 'undefined') return false;
  const configured = localStorage.getItem(TASK_PERSISTENCE_FAULT_KEY);
  if (configured !== fault) return false;
  localStorage.removeItem(TASK_PERSISTENCE_FAULT_KEY);
  return true;
};
const recordTaskPersistenceAttempt = (nodeId: string, updates: Partial<TaskNode>) => {
  const attempts = readJson<Array<{ nodeId: string; keys: string[]; at: number }>>(
    TASK_PERSISTENCE_TRACE_KEY,
    [],
  );
  attempts.push({ nodeId, keys: Object.keys(updates).sort(), at: Date.now() });
  writeJson(TASK_PERSISTENCE_TRACE_KEY, attempts.slice(-20));
};
const canManageBoard = (workspaceId: string, boardId: string, userId = readCurrentLocalUserId()) => {
  const records = readBoardMembers()[getBoardMemberKey(workspaceId, boardId)] || defaultBoardMemberRecords;
  const role = records.find(member => member.userId === userId)?.role;
  return role === 'owner' || role === 'admin' || role === 'project_manager';
};
const requireCanManageBoard = (workspaceId: string, boardId: string) => {
  if (!canManageBoard(workspaceId, boardId)) {
    throw new Error('需要看板管理權限。');
  }
};
const canConfigureRolePermissions = (workspaceId: string, boardId: string, userId = readCurrentLocalUserId()) => {
  const records = readBoardMembers()[getBoardMemberKey(workspaceId, boardId)] || defaultBoardMemberRecords;
  const role = records.find(member => member.userId === userId)?.role;
  return role === 'owner' || role === 'admin';
};
const requireCanConfigureRolePermissions = (workspaceId: string, boardId: string) => {
  if (!canConfigureRolePermissions(workspaceId, boardId)) {
    throw new Error('需要擁有者或管理員權限。');
  }
};

const localTestProfiles = {
  'local-test-user': {
    id: 'local-test-user',
    email: 'test@projed.local',
    displayName: 'ProJED 測試使用者',
  },
  'local-test-admin': {
    id: 'local-test-admin',
    email: 'admin@projed.local',
    displayName: '本機測試管理員',
  },
  'local-test-pm': {
    id: 'local-test-pm',
    email: 'pm@projed.local',
    displayName: '本機測試專案管理者',
  },
  'local-test-member': {
    id: 'local-test-member',
    email: 'member@projed.local',
    displayName: '本機測試成員',
  },
  'local-test-viewer': {
    id: 'local-test-viewer',
    email: 'viewer@projed.local',
    displayName: '本機測試檢視者',
  },
  'local-test-analyst': {
    id: 'local-test-analyst',
    email: 'analyst@projed.local',
    displayName: '本機測試分析員',
  },
};

const defaultBoardMemberRecords: LocalBoardMemberRecord[] = [
  { userId: 'local-test-user', role: 'owner', createdAt: 1704067200000, updatedAt: 1704067200000 },
  { userId: 'local-test-pm', role: 'project_manager', createdAt: 1704067200000, updatedAt: 1704067200000 },
  { userId: 'local-test-admin', role: 'admin', createdAt: 1704067200000, updatedAt: 1704067200000 },
  { userId: 'local-test-member', role: 'member', createdAt: 1704067200000, updatedAt: 1704067200000 },
  { userId: 'local-test-viewer', role: 'viewer', createdAt: 1704067200000, updatedAt: 1704067200000 },
];

const getLocalProfile = (userId: string) => {
  const profile = localTestProfiles[userId as keyof typeof localTestProfiles];
  const override = getLocalTestProfileOverride(userId);
  return profile ? { ...profile, ...override } : profile;
};

const toBoardMember = (workspaceId: string, boardId: string, record: LocalBoardMemberRecord): BoardMember => ({
  workspaceId,
  boardId,
  userId: record.userId,
  role: record.role,
  profile: getLocalProfile(record.userId),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const upsertBoardMemberRecord = (
  workspaceId: string,
  boardId: string,
  userId: string,
  role: BoardMember['role']
) => {
  const key = getBoardMemberKey(workspaceId, boardId);
  const allMembers = readBoardMembers();
  const currentRecords = allMembers[key] || defaultBoardMemberRecords;
  const now = Date.now();
  const existing = currentRecords.find(member => member.userId === userId);
  const nextRecords = existing
    ? currentRecords.map(member =>
        member.userId === userId ? { ...member, role, updatedAt: now } : member
      )
    : [...currentRecords, { userId, role, createdAt: now, updatedAt: now }];

  writeBoardMembers({ ...allMembers, [key]: nextRecords });
};

export const localTestMemberService = {
  listWorkspaceMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => [
    {
      workspaceId,
      userId: 'local-test-user',
      role: 'owner',
      status: 'active',
      profile: getLocalProfile('local-test-user'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-pm',
      role: 'project_manager',
      status: 'active',
      profile: getLocalProfile('local-test-pm'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-admin',
      role: 'admin',
      status: 'active',
      profile: getLocalProfile('local-test-admin'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-member',
      role: 'member',
      status: 'active',
      profile: getLocalProfile('local-test-member'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-viewer',
      role: 'viewer',
      status: 'active',
      profile: getLocalProfile('local-test-viewer'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-analyst',
      role: 'member',
      status: 'active',
      profile: getLocalProfile('local-test-analyst'),
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  ],

  listBoardMembers: async (workspaceId: string, boardId: string): Promise<BoardMember[]> => {
    const key = getBoardMemberKey(workspaceId, boardId);
    const records = readBoardMembers()[key] || defaultBoardMemberRecords;
    return records.map(record => toBoardMember(workspaceId, boardId, record));
  },

  getBoardRolePermissions: async (workspaceId: string, boardId: string): Promise<BoardRolePermissionMatrix> => {
    const key = getBoardMemberKey(workspaceId, boardId);
    return normalizeBoardRolePermissionMatrix(readBoardRolePermissions()[key]);
  },

  updateBoardRolePermissions: async (
    workspaceId: string,
    boardId: string,
    permissions: BoardRolePermissionMatrix
  ): Promise<void> => {
    requireCanConfigureRolePermissions(workspaceId, boardId);
    const key = getBoardMemberKey(workspaceId, boardId);
    const allPermissions = readBoardRolePermissions();
    writeBoardRolePermissions({
      ...allPermissions,
      [key]: normalizeBoardRolePermissionMatrix(permissions),
    });
  },

  upsertBoardMember: async (
    workspaceId: string,
    boardId: string,
    userId: string,
    role: BoardMember['role']
  ): Promise<void> => {
    requireCanManageBoard(workspaceId, boardId);
    upsertBoardMemberRecord(workspaceId, boardId, userId, role);
  },

  removeBoardMember: async (workspaceId: string, boardId: string, userId: string): Promise<void> => {
    requireCanManageBoard(workspaceId, boardId);
    const key = getBoardMemberKey(workspaceId, boardId);
    const allMembers = readBoardMembers();
    const currentRecords = allMembers[key] || defaultBoardMemberRecords;
    writeBoardMembers({
      ...allMembers,
      [key]: currentRecords.filter(member => member.userId !== userId),
    });
  },
};

export const localTestBoardInviteService = {
  listPending: async (workspaceId: string, boardId: string): Promise<BoardInvite[]> => {
    const key = getBoardMemberKey(workspaceId, boardId);
    return (readBoardInvites()[key] || [])
      .filter(invite => invite.status === 'pending')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  create: async (workspaceId: string, boardId: string, input: BoardInviteCreateInput): Promise<BoardInvite> => {
    requireCanManageBoard(workspaceId, boardId);
    const key = getBoardMemberKey(workspaceId, boardId);
    const allInvites = readBoardInvites();
    const normalizedEmail = input.email.trim().toLowerCase();
    const currentInvites = allInvites[key] || [];
    if (currentInvites.some(invite => invite.status === 'pending' && invite.email === normalizedEmail)) {
      throw new Error('此看板已有同一個電子郵件地址的待處理邀請。');
    }

    const now = Date.now();
    const invite: LocalBoardInviteRecord = {
      id: createId('local_invite'),
      workspaceId,
      boardId,
      email: normalizedEmail,
      invitedBy: 'local-test-user',
      status: 'pending',
      defaultRole: input.defaultRole ?? 'member',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    writeBoardInvites({
      ...allInvites,
      [key]: [invite, ...currentInvites],
    });
    return invite;
  },

  revoke: async (workspaceId: string, boardId: string, inviteId: string): Promise<void> => {
    requireCanManageBoard(workspaceId, boardId);
    const key = getBoardMemberKey(workspaceId, boardId);
    const allInvites = readBoardInvites();
    const now = Date.now();
    writeBoardInvites({
      ...allInvites,
      [key]: (allInvites[key] || []).map(invite =>
        invite.id === inviteId && invite.status === 'pending'
          ? { ...invite, status: 'revoked', revokedAt: now, updatedAt: now }
          : invite
      ),
    });
  },

  accept: async (input: BoardInviteAcceptInput): Promise<BoardInvite> => {
    const normalizedEmail = input.email?.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('接受邀請需要已登入且具有電子郵件地址的使用者。');

    const tokenHash = await hashBoardInviteToken(input.token);
    const allInvites = readBoardInvites();
    const match = Object.entries(allInvites).flatMap(([key, invites]) =>
      invites.map(invite => ({ key, invite }))
    ).find(({ invite }) => invite.tokenHash === tokenHash);
    if (!match) throw new Error('找不到看板邀請。');
    if (match.invite.status !== 'pending') throw new Error('此看板邀請已不在待處理狀態。');
    if (match.invite.expiresAt <= Date.now()) {
      const now = Date.now();
      writeBoardInvites({
        ...allInvites,
        [match.key]: allInvites[match.key].map(invite =>
          invite.id === match.invite.id ? { ...invite, status: 'expired', updatedAt: now } : invite
        ),
      });
      throw new Error('看板邀請已過期。');
    }
    if (match.invite.email !== normalizedEmail) {
      throw new Error('此邀請屬於其他電子郵件地址。');
    }

    const now = Date.now();
    const acceptedInvite = {
      ...match.invite,
      status: 'accepted' as const,
      acceptedAt: now,
      updatedAt: now,
    };
    writeBoardInvites({
      ...allInvites,
      [match.key]: allInvites[match.key].map(invite =>
        invite.id === match.invite.id ? acceptedInvite : invite
      ),
    });

    upsertBoardMemberRecord(
      acceptedInvite.workspaceId,
      acceptedInvite.boardId,
      input.userId,
      acceptedInvite.defaultRole
    );
    return acceptedInvite;
  },
};

export const localTestWorkspaceService = {
  create: async (title?: string): Promise<Workspace> => {
    const workspace: Workspace = {
      id: createId('local_ws'),
      title: title || '固定測試工作區',
      boards: [],
      ownerId: 'local-test-user',
      members: ['local-test-user'],
      order: Date.now(),
      createdAt: Date.now(),
    };
    writeWorkspaces([...readWorkspaces(), workspace]);
    return workspace;
  },

  restore: async (workspace: Workspace): Promise<void> => {
    const workspaces = readWorkspaces();
    writeWorkspaces([
      ...workspaces.filter(item => item.id !== workspace.id),
      workspace,
    ]);
  },

  update: async (workspaceId: string, updates: Partial<Workspace>): Promise<void> => {
    writeWorkspaces(readWorkspaces().map(workspace =>
      workspace.id === workspaceId ? { ...workspace, ...updates } : workspace
    ));
  },

  delete: async (workspaceId: string): Promise<void> => {
    writeWorkspaces(readWorkspaces().filter(workspace => workspace.id !== workspaceId));
  },
};

export const localTestBoardService = {
  create: async (workspaceId: string, title?: string): Promise<Board> => {
    const board: Board = {
      id: createId('local_board'),
      title: title || '手機板 UI 測試看板',
      dependencies: [],
      order: Date.now(),
      createdAt: Date.now(),
    };
    writeWorkspaces(readWorkspaces().map(workspace =>
      workspace.id === workspaceId
        ? { ...workspace, boards: [...(workspace.boards || []), board] }
        : workspace
    ));
    return board;
  },

  restore: async (workspaceId: string, board: Board): Promise<void> => {
    writeWorkspaces(readWorkspaces().map(workspace => {
      if (workspace.id !== workspaceId) return workspace;
      return {
        ...workspace,
        boards: [
          ...(workspace.boards || []).filter(item => item.id !== board.id),
          board,
        ],
      };
    }));
  },

  update: async (workspaceId: string, boardId: string, updates: Partial<Board>): Promise<void> => {
    writeWorkspaces(readWorkspaces().map(workspace => {
      if (workspace.id !== workspaceId) return workspace;
      return {
        ...workspace,
        boards: (workspace.boards || []).map(board =>
          board.id === boardId ? { ...board, ...updates } : board
        ),
      };
    }));
  },

  delete: async (workspaceId: string, boardId: string): Promise<void> => {
    writeWorkspaces(readWorkspaces().map(workspace => {
      if (workspace.id !== workspaceId) return workspace;
      return {
        ...workspace,
        boards: (workspace.boards || []).filter(board => board.id !== boardId),
      };
    }));
  },

  previewWorkspaceTransfer: async (
    workspaceId: string,
    boardId: string,
    targetWorkspaceId: string
  ): Promise<BoardWorkspaceTransferPreview> => {
    requireCanManageBoard(workspaceId, boardId);
    const workspaces = readWorkspaces();
    const sourceWorkspace = workspaces.find(workspace => workspace.id === workspaceId);
    const targetWorkspace = workspaces.find(workspace => workspace.id === targetWorkspaceId);
    const board = sourceWorkspace?.boards?.find(item => item.id === boardId);
    if (!sourceWorkspace || !board) throw new Error('Board not found in source workspace.');
    if (!targetWorkspace) throw new Error('Target workspace not found.');

    const nodes = Object.values(readNodes()).filter(node => node.workspaceId === workspaceId && node.boardId === boardId);
    const nodeIds = new Set(nodes.map(node => node.id));
    const dependencies = readDependencies().filter(dep => nodeIds.has(dep.fromId) || nodeIds.has(dep.toId));
    const records = readKnowledgeRecords().filter(record => record.workspaceId === workspaceId && record.boardId === boardId);
    const invites = readBoardInvites()[getBoardMemberKey(workspaceId, boardId)] || [];
    const members = readBoardMembers()[getBoardMemberKey(workspaceId, boardId)] || defaultBoardMemberRecords;

    return {
      blocked: workspaceId === targetWorkspaceId,
      reasons: workspaceId === targetWorkspaceId ? ['source_and_target_are_same'] : [],
      sourceWorkspaceId: workspaceId,
      sourceWorkspaceTitle: sourceWorkspace.title,
      targetWorkspaceId,
      targetWorkspaceTitle: targetWorkspace.title,
      boardId,
      boardTitle: board.title,
      counts: {
        targetActiveMembers: 6,
        preservedMembers: members.length,
        removedMembers: 0,
        tasks: nodes.length,
        dependencies: dependencies.length,
        tagsToMap: 0,
        documents: records.length,
        records: records.length,
        pendingInvitesToRevoke: invites.filter(invite => invite.status === 'pending').length,
        ragDocumentsToResync: records.filter(record => record.ragEnabled).length,
      },
    };
  },

  moveToWorkspace: async (
    workspaceId: string,
    boardId: string,
    targetWorkspaceId: string,
    expectedBoardTitle: string
  ): Promise<BoardWorkspaceTransferPreview> => {
    const preview = await localTestBoardService.previewWorkspaceTransfer(workspaceId, boardId, targetWorkspaceId);
    if (preview.blocked) throw new Error('Board transfer is blocked.');

    const workspaces = readWorkspaces();
    const sourceWorkspace = workspaces.find(workspace => workspace.id === workspaceId);
    const board = sourceWorkspace?.boards?.find(item => item.id === boardId);
    if (!board) throw new Error('Board not found in source workspace.');
    if (board.title !== expectedBoardTitle.trim()) throw new Error('Board title confirmation does not match.');

    writeWorkspaces(workspaces.map(workspace => {
      if (workspace.id === workspaceId) {
        return { ...workspace, boards: (workspace.boards || []).filter(item => item.id !== boardId) };
      }
      if (workspace.id === targetWorkspaceId) {
        return { ...workspace, boards: [...(workspace.boards || []), { ...board, order: Date.now() }] };
      }
      return workspace;
    }));

    const nodes = readNodes();
    writeNodes(Object.fromEntries(Object.entries(nodes).map(([nodeId, node]) => [
      nodeId,
      node.workspaceId === workspaceId && node.boardId === boardId
        ? { ...node, workspaceId: targetWorkspaceId, updatedAt: Date.now() }
        : node,
    ])) as Record<string, TaskNode>);

    writeKnowledgeRecords(readKnowledgeRecords().map(record =>
      record.workspaceId === workspaceId && record.boardId === boardId
        ? {
            ...record,
            workspaceId: targetWorkspaceId,
            taskLinks: record.taskLinks.map(link => ({ ...link, workspaceId: targetWorkspaceId })),
            updatedAt: Date.now(),
          }
        : record
    ));

    const oldMemberKey = getBoardMemberKey(workspaceId, boardId);
    const newMemberKey = getBoardMemberKey(targetWorkspaceId, boardId);
    const allMembers = readBoardMembers();
    writeBoardMembers({
      ...allMembers,
      [newMemberKey]: allMembers[oldMemberKey] || defaultBoardMemberRecords,
      [oldMemberKey]: [],
    });

    const allInvites = readBoardInvites();
    writeBoardInvites({
      ...allInvites,
      [newMemberKey]: (allInvites[oldMemberKey] || []).map(invite => ({
        ...invite,
        workspaceId: targetWorkspaceId,
        status: invite.status === 'pending' ? 'revoked' : invite.status,
        revokedAt: invite.status === 'pending' ? Date.now() : invite.revokedAt,
        updatedAt: Date.now(),
      })),
      [oldMemberKey]: [],
    });

    return preview;
  },
};

export const localTestNodeService = {
  listByProject: async (workspaceId: string, boardId: string): Promise<TaskNode[]> =>
    Object.values(readNodes())
      .filter(node => node.workspaceId === workspaceId && node.boardId === boardId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),

  create: async (_workspaceId: string, _boardId: string, node: TaskNode): Promise<TaskNode> => {
    writeNodes({ ...readNodes(), [node.id]: node });
    return node;
  },

  update: async (_workspaceId: string, _boardId: string, nodeId: string, updates: Partial<TaskNode>): Promise<void> => {
    const nodes = readNodes();
    if (!nodes[nodeId]) return;
    recordTaskPersistenceAttempt(nodeId, updates);
    if (consumeTaskPersistenceFault('reject-once')) {
      throw new Error('local-test injected task persistence rejection');
    }
    const nextNodes = {
      ...nodes,
      [nodeId]: { ...nodes[nodeId], ...updates, updatedAt: Date.now() },
    };
    if (consumeTaskPersistenceFault('timeout-commit-once')) {
      writeNodes(nextNodes);
      return new Promise<void>(() => {});
    }
    if (consumeTaskPersistenceFault('timeout-no-commit-once')) {
      return new Promise<void>(() => {});
    }
    writeNodes({
      ...nextNodes,
    });
  },

  delete: async (_workspaceId: string, _boardId: string, nodeId: string): Promise<void> => {
    const nodes = readNodes();
    delete nodes[nodeId];
    writeNodes(nodes);
  },

  batchUpdate: async (_workspaceId: string, _boardId: string, updates: { id: string; data: Partial<TaskNode> }[]): Promise<void> => {
    const nodes = readNodes();
    updates.forEach(update => {
      if (!nodes[update.id]) return;
      nodes[update.id] = { ...nodes[update.id], ...update.data, updatedAt: Date.now() };
    });
    writeNodes(nodes);
  },

  replaceAllByProject: async (_workspaceId: string, _boardId: string, nodes: TaskNode[]): Promise<void> => {
    writeNodes(Object.fromEntries(nodes.map(node => [node.id, node])));
  },
};

export const localTestDependencyService = {
  create: async (_workspaceId: string, _boardId: string, dependency: Omit<Dependency, 'id'>): Promise<Dependency> => {
    const created = { ...dependency, id: createId('local_dep') } as Dependency;
    writeDependencies([...readDependencies(), created]);
    return created;
  },

  set: async (_workspaceId: string, _boardId: string, dependency: Dependency): Promise<Dependency> => {
    writeDependencies([
      ...readDependencies().filter(item => item.id !== dependency.id),
      dependency,
    ]);
    return dependency;
  },

  update: async (_workspaceId: string, _boardId: string, dependencyId: string, updates: Partial<Dependency>): Promise<void> => {
    writeDependencies(readDependencies().map(dep =>
      dep.id === dependencyId ? { ...dep, ...updates } : dep
    ));
  },

  delete: async (_workspaceId: string, _boardId: string, dependencyId: string): Promise<void> => {
    writeDependencies(readDependencies().filter(dep => dep.id !== dependencyId));
  },

  deleteAllByProject: async (): Promise<void> => {
    writeDependencies([]);
  },
};

export const localTestTagService = {
  listByWorkspace: async (workspaceId: string): Promise<TaskTag[]> =>
    readTags()
      .filter(tag => tag.workspaceId === workspaceId)
      .sort((a, b) => a.order - b.order),

  create: async (workspaceId: string, tag: TaskTag): Promise<TaskTag> => {
    const created = { ...tag, workspaceId };
    writeTags([...readTags().filter(item => item.id !== created.id), created]);
    return created;
  },

  update: async (workspaceId: string, tagId: string, updates: Partial<TaskTag>): Promise<void> => {
    writeTags(readTags().map(tag =>
      tag.workspaceId === workspaceId && tag.id === tagId ? { ...tag, ...updates, updatedAt: Date.now() } : tag
    ));
  },

  delete: async (workspaceId: string, tagId: string): Promise<void> => {
    writeTags(readTags().filter(tag => !(tag.workspaceId === workspaceId && tag.id === tagId)));
    const nodes = readNodes();
    const updatedNodes = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [
        nodeId,
        node.workspaceId === workspaceId
          ? { ...node, tagIds: (node.tagIds || []).filter(id => id !== tagId), updatedAt: Date.now() }
          : node,
      ])
    ) as Record<string, TaskNode>;
    writeNodes(updatedNodes);
  },

  setNodeTags: async (_workspaceId: string, _boardId: string, nodeId: string, tagIds: string[]): Promise<void> => {
    const nodes = readNodes();
    if (!nodes[nodeId]) return;
    writeNodes({
      ...nodes,
      [nodeId]: { ...nodes[nodeId], tagIds, updatedAt: Date.now() },
    });
  },
};

export const localTestRecordService = {
  listByProject: async (workspaceId: string, boardId: string): Promise<EditableKnowledgeRecord[]> =>
    readKnowledgeRecords()
      .filter((record): record is EditableKnowledgeRecord => record.workspaceId === workspaceId && record.boardId === boardId && record.status !== 'archived' && record.type !== 'task_collection')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),

  listByNode: async (workspaceId: string, boardId: string, nodeId: string): Promise<EditableKnowledgeRecord[]> =>
    readKnowledgeRecords()
      .filter((record): record is EditableKnowledgeRecord =>
        record.workspaceId === workspaceId &&
        record.boardId === boardId &&
        record.status !== 'archived' && record.type !== 'task_collection' &&
        record.taskLinks.some(link => link.nodeId === nodeId)
      )
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),

  upsert: async (workspaceId: string, boardId: string, input: KnowledgeRecordInput): Promise<EditableKnowledgeRecord> => {
    if ((input as unknown as { type?: string }).type === 'task_collection') {
      throw new TaskCollectionError('SNAPSHOT_INVALID', '典藏任務不可透過一般紀錄編輯。');
    }
    const now = Date.now();
    const records = readKnowledgeRecords();
    const existing = input.id ? records.find(record => record.id === input.id) : undefined;
    const existingEditable = existing?.type === 'task_collection' ? undefined : existing;
    const recordId = existing?.id || input.id || createId('local_record');
    const actorId = readCurrentLocalUserId();
    const record: EditableKnowledgeRecord = {
      ...(existingEditable || {}),
      id: recordId,
      workspaceId,
      boardId,
      type: input.type,
      title: input.title,
      content: input.content,
      status: input.status,
      visibility: input.visibility,
      participantsText: input.participantsText,
      occurredAt: input.occurredAt,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      recordedBy: input.recordedBy ?? actorId,
      metadata: input.metadata,
      createdBy: existing?.createdBy ?? actorId,
      updatedBy: actorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ragEnabled: input.status === 'published' && input.visibility !== 'private',
      taskLinks: input.taskLinks.map((link, index) => ({
        id: `${recordId}_link_${link.nodeId}_${link.role}_${index}`,
        recordId,
        workspaceId,
        boardId,
        nodeId: link.nodeId,
        role: link.role,
        createdAt: now,
      })),
    };

    writeKnowledgeRecords([
      record,
      ...records.filter(item => item.id !== record.id),
    ]);
    return record;
  },

  checkpointDraft: async (workspaceId: string, boardId: string, input: MeetingDraftCheckpointInput): Promise<MeetingDraftCheckpointResult> => {
    if (!input.record.id) throw new MeetingDraftCheckpointError('transient', '會議草稿缺少固定識別碼。');
    const now = Date.now();
    const records = readKnowledgeRecords();
    const existing = records.find(record => record.id === input.record.id);
    const existingEditable = existing?.type === 'task_collection' ? undefined : existing;
    const existingRecovery = existing?.metadata?.projedDraftRecovery;
    const existingSignature = existingRecovery && typeof existingRecovery === 'object' && !Array.isArray(existingRecovery)
      ? (existingRecovery as { localSignature?: unknown }).localSignature
      : undefined;
    if (existing && existing.status !== 'draft') {
      throw new MeetingDraftCheckpointError('conflict', '雲端紀錄已不是草稿，請選擇保留本機內容或使用雲端版本。');
    }
    if (existingSignature && input.remoteSignature && existingSignature !== input.remoteSignature) {
      throw new MeetingDraftCheckpointError('conflict', '雲端紀錄已有其他版本，請選擇保留本機內容或使用雲端版本。');
    }
    const actorId = input.record.recordedBy ?? readCurrentLocalUserId();
    const recordId = input.record.id;
    const record: KnowledgeRecord = {
      ...(existingEditable || {}),
      id: recordId,
      workspaceId,
      boardId,
      type: 'meeting',
      title: input.record.title,
      content: input.record.content,
      status: 'draft',
      visibility: input.record.visibility,
      participantsText: input.record.participantsText,
      occurredAt: input.record.occurredAt,
      startedAt: input.record.startedAt,
      endedAt: input.record.endedAt,
      recordedBy: input.record.recordedBy ?? actorId,
      metadata: input.record.metadata,
      createdBy: existing?.createdBy ?? actorId,
      updatedBy: actorId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ragEnabled: false,
      taskLinks: input.record.taskLinks.map((link, index) => ({
        id: `${recordId}_link_${link.nodeId}_${link.role}_${index}`,
        recordId,
        workspaceId,
        boardId,
        nodeId: link.nodeId,
        role: link.role,
        createdAt: now,
      })),
    };
    writeKnowledgeRecords([record, ...records.filter(item => item.id !== record.id)]);
    return { recordId, confirmedAt: now, remoteSignature: input.localSignature };
  },

  delete: async (workspaceId: string, boardId: string, recordId: string): Promise<void> => {
    const now = Date.now();
    const target = readKnowledgeRecords().find(record => record.workspaceId === workspaceId && record.boardId === boardId && record.id === recordId);
    if (target?.type === 'task_collection') throw new TaskCollectionError('SNAPSHOT_INVALID', '典藏任務不可從一般紀錄流程刪除。');
    writeKnowledgeRecords(readKnowledgeRecords().map(record =>
      record.workspaceId === workspaceId && record.boardId === boardId && record.id === recordId
        ? { ...record, status: 'archived', updatedAt: now }
        : record
    ));
  },
};

const localTaskCollectionPermission = (workspaceId: string, boardId: string): boolean => {
  const userId = readCurrentLocalUserId();
  const members = readBoardMembers()[getBoardMemberKey(workspaceId, boardId)] || defaultBoardMemberRecords;
  const role = members.find(member => member.userId === userId)?.role;
  if (!role || role === 'viewer') return false;
  const configured = readBoardRolePermissions()[getBoardMemberKey(workspaceId, boardId)]?.[role];
  if (!configured) return ['owner', 'admin', 'project_manager', 'member'].includes(role);
  return configured.includes('collect_task') || configured.includes('delete_task');
};

const findLocalCollectionRecord = (workspaceId: string, boardId: string, operationId: string): TaskCollectionRecord | undefined => (
  readKnowledgeRecords().find((record): record is TaskCollectionRecord => (
    record.workspaceId === workspaceId && record.boardId === boardId && record.type === 'task_collection'
    && record.collectionOperationId === operationId
  ))
);
const localCollectionPreviewCache = new Map<string, TaskCollectionPreview>();
const recoverLocalTaskCollectionJournal = () => {
  const entries = readTaskCollectionJournal();
  entries.forEach(entry => {
    const snapshot = (entry.state === 'committed' ? entry.after : entry.before) as { records?: KnowledgeRecord[]; nodes?: Record<string, TaskNode>; activities?: ActivityEvent[] } | undefined;
    if (snapshot?.records && snapshot.nodes && snapshot.activities) {
      writeStrict(KNOWLEDGE_RECORDS_KEY, snapshot.records);
      writeStrict(NODES_KEY, snapshot.nodes);
      writeStrict(ACTIVITY_EVENTS_KEY, snapshot.activities);
    }
    clearTaskCollectionJournal(entry.operationId);
  });
};

const buildLocalCollectionPreview = async (
  workspaceId: string,
  boardId: string,
  rootItemId: string,
  operationId: string,
): Promise<TaskCollectionPreview> => {
  const nodes = Object.values(readNodes()).filter(node => node.workspaceId === workspaceId && node.boardId === boardId);
  const root = nodes.find(node => node.id === rootItemId);
  if (!root) throw new TaskCollectionError('SOURCE_NOT_FOUND', '找不到要典藏的根任務。');
  if (root.isArchived) throw new TaskCollectionError('SOURCE_ARCHIVED', '此根任務已封存，請先從回收桶還原後再建立新版本。');
  const workspaces = readWorkspaces();
  const workspace = workspaces.find(workspace => workspace.id === workspaceId);
  const boardTitle = workspace?.boards?.find(board => board.id === boardId)?.title ?? null;
  let snapshot: TaskCollectionSnapshot;
  try {
    snapshot = buildTaskCollectionSnapshot({
      workspaceId,
      workspaceTitle: workspace?.title ?? workspaceId,
      boardId,
      boardTitle,
      rootItemId,
      collectedAt: Date.now(),
      collectedBy: { userId: readCurrentLocalUserId(), displayName: getLocalProfile(readCurrentLocalUserId())?.displayName ?? null },
      nodes,
      dependencies: readDependencies(),
      activityEvents: readActivityEvents(),
      linkedRecords: readKnowledgeRecords(),
    });
  } catch (error) {
    if (error instanceof TaskCollectionError) throw error;
    throw new TaskCollectionError('SOURCE_INVALID_TREE', '來源任務樹無效，尚未移出看板。', { cause: error });
  }
  // collectedAt is presentation metadata; excluding it keeps a preview token
  // valid between the preview and commit requests.
  const sourceMaterial = { ...snapshot, collectedAt: 0, collectedBy: { userId: '', displayName: null }, annotation: null };
  const snapshotHash = await canonicalJsonSha256(sourceMaterial);
  const previewContent = projectTaskCollectionContent({ ...snapshot, collectedAt: 0 });
  const snapshotBytes = new TextEncoder().encode(canonicalJsonStringify(snapshot)).byteLength;
  const contentBytes = new TextEncoder().encode(previewContent).byteLength;
  const limits = [
    [snapshot.nodes.length, TASK_COLLECTION_LIMITS.taskCount, 'tasks'],
    [snapshot.dependencies.length, TASK_COLLECTION_LIMITS.dependencyCount, 'dependencies'],
    [snapshot.activityEvents.length, TASK_COLLECTION_LIMITS.activityCount, 'activities'],
    [snapshot.linkedRecords.length, TASK_COLLECTION_LIMITS.relatedRecordCount, 'related records'],
    [snapshotBytes, TASK_COLLECTION_LIMITS.snapshotUtf8Bytes, 'snapshot bytes'],
    [contentBytes, TASK_COLLECTION_LIMITS.contentUtf8Bytes, 'content bytes'],
  ] as const;
  const exceeded = limits.find(([actual, limit]) => actual > limit);
  if (exceeded) throw new TaskCollectionError('LIMIT_EXCEEDED', `此任務樹超過目前典藏上限（${exceeded[2]}），尚未移出看板。`);
  const previousVersions = readKnowledgeRecords()
    .filter(record => record.type === 'task_collection' && record.workspaceId === workspaceId && record.boardId === boardId && record.sourceRootItemId === rootItemId)
    .map(record => record.collectionVersion ?? 0);
  const nextVersion = Math.max(0, ...previousVersions) + 1;
  return {
    operationId,
    rootItemId,
    sourceBoardId: boardId,
    subtreeNodeCount: snapshot.nodes.length,
    dependencyCount: snapshot.dependencies.length,
    activityEventCount: snapshot.activityEvents.length,
    linkedRecordCount: snapshot.linkedRecords.length,
    nextVersion,
    snapshotHash,
    previewToken: `v1:${await canonicalJsonSha256(['task-collection-preview-v1', operationId, readCurrentLocalUserId(), workspaceId, boardId, rootItemId, snapshotHash])}`,
    snapshot,
  };
};

const toLocalCollectionSummary = (record: TaskCollectionRecord): TaskCollectionSummary => {
  const snapshot = record.metadata?.taskCollection as { sourceBoardTitle?: string | null; nodes?: unknown[]; historyCoverage?: TaskCollectionSummary['historyCoverage'] } | undefined;
  return {
    recordId: record.id,
    title: record.title,
    collectionVersion: record.collectionVersion ?? 1,
    occurredAt: record.occurredAt ?? record.createdAt ?? 0,
    sourceBoardTitle: snapshot?.sourceBoardTitle ?? null,
    taskCount: snapshot?.nodes?.length ?? record.taskLinks.length,
    historyCoverage: snapshot?.historyCoverage ?? { activityEvents: 0, linkedRecords: 0, oldestActivityAt: null, newestActivityAt: null },
  };
};

export const localTestTaskCollectionService = {
  previewDeleteImpact: async (workspaceId: string, boardId: string) => {
    recoverLocalTaskCollectionJournal();
    const taskCollectionCount = readKnowledgeRecords().filter(record => record.workspaceId === workspaceId && record.boardId === boardId && record.type === 'task_collection').length;
    return { blocked: false, unknown: false, reasons: taskCollectionCount > 0 ? ['task_collection_assets_exist'] : [], taskCollectionCount };
  },
  previewWorkspaceDeleteImpact: async (workspaceId: string) => {
    recoverLocalTaskCollectionJournal();
    const taskCollectionCount = readKnowledgeRecords().filter(record => record.workspaceId === workspaceId && record.type === 'task_collection').length;
    return { blocked: false, unknown: false, reasons: taskCollectionCount > 0 ? ['task_collection_assets_exist'] : [], taskCollectionCount };
  },
  preview: async (workspaceId: string, boardId: string, rootItemId: string, operationId: string): Promise<TaskCollectionPreview> => {
    recoverLocalTaskCollectionJournal();
    if (!localTaskCollectionPermission(workspaceId, boardId)) throw new TaskCollectionError('PERMISSION_DENIED', '你沒有典藏任務的權限。');
    const preview = await buildLocalCollectionPreview(workspaceId, boardId, rootItemId, operationId);
    localCollectionPreviewCache.set(operationId, preview);
    return preview;
  },

  collect: async (
    workspaceId: string,
    boardId: string,
    rootItemId: string,
    operationId: string,
    previewToken: string,
    annotation?: string | null,
  ): Promise<TaskCollectionResult> => {
    recoverLocalTaskCollectionJournal();
    if (!localTaskCollectionPermission(workspaceId, boardId)) throw new TaskCollectionError('PERMISSION_DENIED', '你沒有典藏任務的權限。');
    if (annotation && annotation.length > TASK_COLLECTION_LIMITS.annotationChars) throw new TaskCollectionError('LIMIT_EXCEEDED', '典藏註記不可超過 500 字。');
    if (consumeTaskCollectionFault('transient-once')) {
      throw new TaskCollectionError('TRANSIENT', '典藏服務暫時無法完成，請重試。');
    }
    if (consumeTaskCollectionFault('limit-once')) {
      throw new TaskCollectionError('LIMIT_EXCEEDED', '此任務樹超過目前典藏上限（測試注入），尚未移出看板。');
    }
    const existing = findLocalCollectionRecord(workspaceId, boardId, operationId);
    if (existing) {
      if (existing.sourceRootItemId && existing.sourceRootItemId !== rootItemId) {
        throw new TaskCollectionError('OPERATION_CONFLICT', '此操作識別碼已用於其他根任務。');
      }
      const snapshot = existing.metadata?.taskCollection as TaskCollectionPreview['snapshot'];
      const preview: TaskCollectionPreview = {
        operationId,
        rootItemId,
        sourceBoardId: boardId,
        subtreeNodeCount: snapshot?.nodes?.length ?? existing.taskLinks.length,
        dependencyCount: snapshot?.dependencies?.length ?? 0,
        activityEventCount: snapshot?.activityEvents?.length ?? 0,
        linkedRecordCount: snapshot?.linkedRecords?.length ?? 0,
        nextVersion: existing.collectionVersion ?? 1,
        snapshotHash: existing.collectionSnapshotHash ?? '',
        previewToken: `${operationId}:${existing.collectionSnapshotHash ?? ''}`,
        snapshot,
      };
      return {
        record: existing,
        preview,
        recordId: existing.id,
        operationId,
        sourceRootTaskId: rootItemId,
        collectionVersion: existing.collectionVersion ?? 1,
        collectedAt: existing.occurredAt ?? existing.createdAt ?? 0,
        sourceRootUpdatedAt: existing.occurredAt ?? existing.updatedAt ?? 0,
        taskCount: preview.subtreeNodeCount,
        summary: toLocalCollectionSummary(existing),
      };
    }
    const cachedPreview = localCollectionPreviewCache.get(operationId);
    const freshPreview = await buildLocalCollectionPreview(workspaceId, boardId, rootItemId, operationId);
    if (cachedPreview && cachedPreview.previewToken !== freshPreview.previewToken) {
      throw new TaskCollectionError('SOURCE_CHANGED', '來源任務在預覽後已有變更，請重新整理預覽。');
    }
    const preview = freshPreview;
    if (preview.previewToken !== previewToken) throw new TaskCollectionError('SOURCE_CHANGED', '典藏預覽已變更，請重新確認。');
      const now = Date.now();
    const recordsBefore = readKnowledgeRecords();
    const nodesBefore = readNodes();
    const activitiesBefore = readActivityEvents();
    let durableCommitCompleted = false;
    let committedResult: TaskCollectionResult | null = null;
    prepareTaskCollectionJournal(operationId, {
      records: recordsBefore,
      nodes: nodesBefore,
      activities: activitiesBefore,
    });
    try {
      const recordId = createId('local_task_collection');
      const root = preview.snapshot.nodes.find(node => node.id === rootItemId);
      const finalSnapshot = { ...preview.snapshot, collectedAt: now, annotation: annotation?.trim() || null };
      const projectedContent = projectTaskCollectionContent(finalSnapshot);
      if (new TextEncoder().encode(projectedContent).byteLength > TASK_COLLECTION_LIMITS.contentUtf8Bytes) {
        throw new TaskCollectionError('LIMIT_EXCEEDED', '此任務樹超過目前典藏內容上限，尚未移出看板。');
      }
      const finalSnapshotHash = await canonicalJsonSha256({ snapshot: finalSnapshot, content: projectedContent });
      const record: TaskCollectionRecord = {
        id: recordId,
        workspaceId,
        boardId,
        type: 'task_collection',
        title: root?.title || rootItemId,
        content: projectedContent,
        status: 'published',
        visibility: 'project',
        occurredAt: now,
        recordedBy: readCurrentLocalUserId(),
        createdBy: readCurrentLocalUserId(),
        updatedBy: readCurrentLocalUserId(),
        createdAt: now,
        updatedAt: now,
        ragEnabled: false,
        collectionOperationId: operationId,
        collectionVersion: preview.nextVersion,
        collectionSchemaVersion: preview.snapshot.schemaVersion,
        collectionSnapshotHash: finalSnapshotHash,
        sourceRootItemId: rootItemId,
        sourceRootStorageId: finalSnapshot.source.rootStorageId,
        metadata: {
          taskCollection: finalSnapshot,
          collectionOperationId: operationId,
          collectionVersion: preview.nextVersion,
          collectionSchemaVersion: preview.snapshot.schemaVersion,
          collectionSnapshotHash: finalSnapshotHash,
          sourceRootItemId: rootItemId,
          sourceRootStorageId: finalSnapshot.source.rootStorageId,
          annotation: annotation ?? null,
        },
        taskLinks: preview.snapshot.nodes.map((node, index) => ({
          id: `${recordId}_link_${node.id}`,
          recordId,
          workspaceId,
          boardId,
          nodeId: node.id,
          role: index === 0 ? 'main' : 'related',
          createdAt: now,
        })),
      };
      const nextNodes = {
        ...nodesBefore,
        [rootItemId]: { ...nodesBefore[rootItemId], isArchived: true, updatedAt: now },
      };
      const activity: ActivityEvent = {
        id: createId('local_activity'),
        workspaceId,
        boardId,
        actorId: readCurrentLocalUserId(),
        eventType: 'task_collected',
        entityTable: 'wbs_items',
        entityId: rootItemId,
        payload: { operationId, recordId, collectionVersion: preview.nextVersion, subtreeNodeCount: preview.subtreeNodeCount },
        createdAt: now,
      };
      setTaskCollectionJournalAfter(operationId, {
        records: [record, ...recordsBefore],
        nodes: nextNodes,
        activities: [activity, ...activitiesBefore].slice(0, 1000),
      });
      writeStrict(KNOWLEDGE_RECORDS_KEY, [record, ...recordsBefore]);
      writeStrict(NODES_KEY, nextNodes);
      writeStrict(ACTIVITY_EVENTS_KEY, [activity, ...activitiesBefore].slice(0, 1000));
      completeTaskCollectionJournal(operationId);
      clearTaskCollectionJournal(operationId);
      committedResult = {
        record,
        preview: { ...preview, snapshot: finalSnapshot, snapshotHash: finalSnapshotHash },
        recordId: record.id,
        operationId,
        sourceRootTaskId: rootItemId,
        collectionVersion: record.collectionVersion ?? 1,
        collectedAt: now,
        sourceRootUpdatedAt: now,
        taskCount: finalSnapshot.nodes.length,
        summary: toLocalCollectionSummary(record),
      };
      durableCommitCompleted = true;
      // Browser QA only: model a committed RPC whose response is lost. The
      // catch path must read back this operation rather than create a v2.
      if (consumeTaskCollectionFault('response-lost-once')) {
        throw new TaskCollectionError('TRANSIENT', '典藏已提交但回應遺失，正在讀回。');
      }
      return committedResult;
    } catch (error) {
      if (durableCommitCompleted && committedResult) {
        try {
          const recovered = await localTestTaskCollectionService.getOperationResult(workspaceId, boardId, operationId);
          if (recovered) {
            return {
              ...committedResult,
              record: recovered,
              recordId: recovered.id,
              summary: toLocalCollectionSummary(recovered),
            };
          }
        } catch {
          // Preserve the original response-lost error when the readback fails.
        }
        if (error instanceof TaskCollectionError) throw error;
        throw new TaskCollectionError('TRANSIENT', '典藏已提交，但目前無法讀回操作結果，請稍後重試。', { cause: error });
      }
      try {
        writeStrict(NODES_KEY, nodesBefore);
        writeStrict(KNOWLEDGE_RECORDS_KEY, recordsBefore);
        writeStrict(ACTIVITY_EVENTS_KEY, activitiesBefore);
        clearTaskCollectionJournal(operationId);
      } catch {
        // Preserve the original error while leaving a prepared journal for recovery tooling.
      }
      if (error instanceof TaskCollectionError) throw error;
      throw new TaskCollectionError('UNKNOWN', '典藏任務未完成，原資料已復原。', { cause: error });
    }
  },

  getOperationResult: async (workspaceId: string, boardId: string, operationId: string): Promise<TaskCollectionRecord | null> => findLocalCollectionRecord(workspaceId, boardId, operationId) ?? null,

  getById: async (workspaceId: string, boardId: string, recordId: string): Promise<TaskCollectionRecord | null> => readKnowledgeRecords().find((record): record is TaskCollectionRecord => record.workspaceId === workspaceId && record.boardId === boardId && record.id === recordId && record.type === 'task_collection') ?? null,

  listSummaries: async (workspaceId: string, boardId: string, search?: string): Promise<TaskCollectionSummary[]> => readKnowledgeRecords()
    .filter((record): record is TaskCollectionRecord => record.workspaceId === workspaceId && record.boardId === boardId && record.type === 'task_collection')
    .filter(record => {
      const normalizedSearch = (search ?? '').trim();
      const query = Array.from(normalizedSearch).length === 1 ? '' : normalizedSearch;
      return !query || `${record.title}\n${record.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    })
    .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0))
    .map(toLocalCollectionSummary),
};

export const localTestEventLogService = {
  logActivity: async (event: Omit<ActivityEvent, 'id' | 'actorId' | 'createdAt'>): Promise<void> => {
    const now = Date.now();
    const saved: ActivityEvent = {
      ...event,
      id: createId('local_activity'),
      actorId: readCurrentLocalUserId(),
      createdAt: now,
    };
    writeActivityEvents([saved, ...readActivityEvents()].slice(0, 1000));
  },

  listActivity: async (query: {
    workspaceId: string;
    boardId?: string | null;
    scope: 'workspace' | 'board';
    startedAt: number;
    endedAt: number;
    startBoundary?: 'inclusive' | 'exclusive';
    eventTypes?: string[];
  }): Promise<ActivityEvent[]> => {
    const eventTypeSet = query.eventTypes?.length ? new Set(query.eventTypes) : null;
    return readActivityEvents()
      .filter(event => event.workspaceId === query.workspaceId)
      .filter(event => query.scope === 'workspace' || event.boardId === query.boardId)
      .filter(event => !eventTypeSet || eventTypeSet.has(event.eventType))
      .filter(event => {
        const createdAt = event.createdAt ?? 0;
        const afterStart = query.startBoundary === 'exclusive' ? createdAt > query.startedAt : createdAt >= query.startedAt;
        return afterStart && createdAt <= query.endedAt;
      })
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },
};

export const localTestStorage = {
  readWorkspaces,
  writeWorkspaces,
  readNodes,
  writeNodes,
  readDependencies,
  writeDependencies,
  readTags,
  writeTags,
  readBoardMembers,
  writeBoardMembers,
  readBoardInvites,
  writeBoardInvites,
  readBoardRolePermissions,
  writeBoardRolePermissions,
  readKnowledgeRecords,
  writeKnowledgeRecords,
  readActivityEvents,
  writeActivityEvents,
};
