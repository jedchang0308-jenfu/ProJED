import type { Board, Dependency, TaskNode, TaskTag, Workspace } from '../types';

const WORKSPACES_KEY = 'projed-local-test.workspaces';
const NODES_KEY = 'projed-local-test.nodes';
const DEPENDENCIES_KEY = 'projed-local-test.dependencies';
const TAGS_KEY = 'projed-local-test.tags';

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
};
