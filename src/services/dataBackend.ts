import type { Board, Dependency, TaskNode, Workspace } from '../types';
import {
  boardService as firestoreBoardService,
  dependencyService as firestoreDependencyService,
  nodeService as firestoreNodeService,
  workspaceService as firestoreWorkspaceService,
} from './firestoreService';
import {
  supabaseBoardService,
  supabaseDependencyService,
  supabaseNodeService,
  supabaseWorkspaceService,
} from './supabase/projedService';
import {
  localTestBoardService,
  localTestDependencyService,
  localTestNodeService,
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

  delete: (workspaceId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestWorkspaceService.delete(workspaceId)
      : isSupabaseBackend
      ? supabaseWorkspaceService.delete(workspaceId)
      : firestoreWorkspaceService.delete(workspaceId),
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

  delete: (workspaceId: string, boardId: string): Promise<void> =>
    isLocalTestBackend
      ? localTestBoardService.delete(workspaceId, boardId)
      : isSupabaseBackend
      ? supabaseBoardService.delete(workspaceId, boardId)
      : firestoreBoardService.delete(workspaceId, boardId),
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
