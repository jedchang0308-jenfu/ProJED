import type { Board, BoardInvite, BoardInviteAcceptInput, BoardInviteCreateInput, BoardMember, Dependency, TaskNode, TaskTag, Workspace, WorkspaceMember } from '../types';
import { hashBoardInviteToken } from '../utils/boardInviteToken';

const WORKSPACES_KEY = 'projed-local-test.workspaces';
const NODES_KEY = 'projed-local-test.nodes';
const DEPENDENCIES_KEY = 'projed-local-test.dependencies';
const TAGS_KEY = 'projed-local-test.tags';
const BOARD_MEMBERS_KEY = 'projed-local-test.boardMembers';
const BOARD_INVITES_KEY = 'projed-local-test.boardInvites';
const LOCAL_TEST_SESSION_KEY = 'projed-local-test.session';

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
      if (current === id || visited.has(current) || !sanitized[current]) {
        sanitized[id] = {
          ...node,
          parentId: null,
          nodeType: node.nodeType === 'milestone' ? 'milestone' : 'group',
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
const readNodes = () => {
  const nodes = readJson<Record<string, TaskNode>>(NODES_KEY, {});
  const sanitized = sanitizeNodes(nodes);
  if (sanitized !== nodes) writeJson(NODES_KEY, sanitized);
  return sanitized;
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
const getBoardMemberKey = (workspaceId: string, boardId: string) => `${workspaceId}:${boardId}`;
const readCurrentLocalUserId = () =>
  readJson<{ uid?: string } | null>(LOCAL_TEST_SESSION_KEY, null)?.uid || 'local-test-user';
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

const getLocalProfile = (userId: string) =>
  localTestProfiles[userId as keyof typeof localTestProfiles];

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
      profile: localTestProfiles['local-test-user'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-pm',
      role: 'project_manager',
      status: 'active',
      profile: localTestProfiles['local-test-pm'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-admin',
      role: 'admin',
      status: 'active',
      profile: localTestProfiles['local-test-admin'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-member',
      role: 'member',
      status: 'active',
      profile: localTestProfiles['local-test-member'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-viewer',
      role: 'viewer',
      status: 'active',
      profile: localTestProfiles['local-test-viewer'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
    {
      workspaceId,
      userId: 'local-test-analyst',
      role: 'member',
      status: 'active',
      profile: localTestProfiles['local-test-analyst'],
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    },
  ],

  listBoardMembers: async (workspaceId: string, boardId: string): Promise<BoardMember[]> => {
    const key = getBoardMemberKey(workspaceId, boardId);
    const records = readBoardMembers()[key] || defaultBoardMemberRecords;
    return records.map(record => toBoardMember(workspaceId, boardId, record));
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
};

export const localTestNodeService = {
  create: async (_workspaceId: string, _boardId: string, node: TaskNode): Promise<TaskNode> => {
    writeNodes({ ...readNodes(), [node.id]: node });
    return node;
  },

  update: async (_workspaceId: string, _boardId: string, nodeId: string, updates: Partial<TaskNode>): Promise<void> => {
    const nodes = readNodes();
    if (!nodes[nodeId]) return;
    writeNodes({
      ...nodes,
      [nodeId]: { ...nodes[nodeId], ...updates, updatedAt: Date.now() },
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
};
