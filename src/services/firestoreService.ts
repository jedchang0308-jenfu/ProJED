import { auth, db } from './firebase';
import { 
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, deleteField
} from 'firebase/firestore';
import type { Workspace, Board, Dependency, TaskNode } from '../types';

// ==========================
// Helper: 處理 undefined 轉 deleteField()
// Firestore 不允許 updateDoc 傳入 undefined，
// 當 Undo 將日期改回原本不存在的狀態時，必須轉換為 deleteField()
// ==========================
const sanitizeUpdates = (updates: any) => {
  const safeUpdates: any = {};
  for (const [k, v] of Object.entries(updates)) {
    safeUpdates[k] = v === undefined ? deleteField() : v;
  }
  return safeUpdates;
};

const TRACKED_NODE_FIELDS = [
  'title',
  'status',
  'startDate',
  'endDate',
  'parentId',
  'nodeType',
  'assigneeId',
  'collaboratorIds',
  'isArchived',
  'order',
  'kanbanStageId',
] as const;

const compactNodeSnapshot = (node: Partial<TaskNode> | null | undefined) => {
  if (!node) return null;

  const snapshot: Record<string, unknown> = {};
  for (const field of TRACKED_NODE_FIELDS) {
    if ((node as any)[field] !== undefined) {
      snapshot[field] = (node as any)[field];
    }
  }

  return {
    ...(node.id !== undefined ? { id: node.id } : {}),
    ...(node.workspaceId !== undefined ? { workspaceId: node.workspaceId } : {}),
    ...(node.boardId !== undefined ? { boardId: node.boardId } : {}),
    ...snapshot,
  };
};

const valuesAreEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const getChangedFields = (before: Partial<TaskNode> | null, after: Partial<TaskNode> | null) => {
  const changed: string[] = [];
  for (const field of TRACKED_NODE_FIELDS) {
    if (!valuesAreEqual((before as any)?.[field], (after as any)?.[field])) {
      changed.push(field);
    }
  }
  return changed;
};

const inferNodeAction = (
  action: 'created' | 'updated' | 'deleted',
  before: Partial<TaskNode> | null,
  after: Partial<TaskNode> | null,
) => {
  if (action !== 'updated') return action;
  if (!before?.isArchived && after?.isArchived) return 'archived';
  if (before?.isArchived && !after?.isArchived) return 'restored';
  return action;
};

const writeNodeChangeEvent = async (
  wsId: string,
  bId: string,
  action: 'created' | 'updated' | 'deleted',
  before: Partial<TaskNode> | null,
  after: Partial<TaskNode> | null,
) => {
  const changedFields = getChangedFields(before, after);
  if (action === 'updated' && changedFields.length === 0) return;

  const eventRef = doc(collection(db, 'workspaces', wsId, 'activityLogs'));
  const actor = auth.currentUser;
  const now = Date.now();
  const effectiveNode = after || before || {};

  await setDoc(eventRef, {
    id: eventRef.id,
    entityType: 'task',
    action: inferNodeAction(action, before, after),
    workspaceId: wsId,
    boardId: bId,
    taskId: effectiveNode.id,
    taskTitle: effectiveNode.title || '',
    changedFields,
    before: compactNodeSnapshot(before),
    after: compactNodeSnapshot(after),
    changedAt: now,
    changedAtIso: new Date(now).toISOString(),
    changedByUid: actor?.uid || null,
    changedByEmail: actor?.email || null,
  });
};

// ==========================
// Workspace Service
// ==========================
export const workspaceService = {
  create: async (userId: string, title?: string): Promise<Workspace> => {
    const wsRef = doc(collection(db, 'workspaces'));
    const ws: Workspace = {
      id: wsRef.id,
      title: title || '我的工作區',
      boards: [],
      ownerId: userId,
      members: [userId],
      order: Date.now(),
      createdAt: Date.now()
    };
    await setDoc(wsRef, ws);
    return ws;
  },
  restore: async (ws: Workspace) => {
    await setDoc(doc(db, 'workspaces', ws.id), ws);
  },
  update: async (wsId: string, updates: Partial<Workspace>) => {
    // Cannot update lists/boards arrays directly if they are not in the document,
    // but Workspace type includes boards: Board[]. Wait, if we use flatten subcollections,
    // we should strip boards before saving.
    const { boards, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId), sanitizeUpdates(docData));
    }
  },
  delete: async (wsId: string) => {
    // Note: This only deletes the parent doc. Subcollections must be handled via Cloud Functions or recursive delete in a real production app.
    await deleteDoc(doc(db, 'workspaces', wsId));
  }
};

// ==========================
// Board Service
// ==========================
export const boardService = {
  create: async (wsId: string, title?: string): Promise<Board> => {
    const boardRef = doc(collection(db, 'workspaces', wsId, 'boards'));
    const board: Board = {
      id: boardRef.id,
      title: title || '新看板',
      dependencies: [],
      order: Date.now(),
      createdAt: Date.now()
    };
    // Strip nested arrays before saving
    const { dependencies, ...docData } = board as any;
    await setDoc(boardRef, docData);
    return board;
  },
  restore: async (wsId: string, board: Board) => {
    const { dependencies, ...docData } = board as any;
    await setDoc(doc(db, 'workspaces', wsId, 'boards', board.id), docData);
  },
  update: async (wsId: string, bId: string, updates: Partial<Board>) => {
    const { dependencies, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId), sanitizeUpdates(docData));
    }
  },
  delete: async (wsId: string, bId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId));
  }
};

// ==========================
// Dependency Service
// ==========================
export const dependencyService = {
  create: async (wsId: string, bId: string, dependency: Omit<Dependency, 'id'>): Promise<Dependency> => {
    const depRef = doc(collection(db, 'workspaces', wsId, 'boards', bId, 'dependencies'));
    const dep = { ...dependency, id: depRef.id };
    await setDoc(depRef, dep);
    return dep;
  },
  set: async (wsId: string, bId: string, dependency: Dependency): Promise<Dependency> => {
    await setDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', dependency.id), dependency);
    return dependency;
  },
  update: async (wsId: string, bId: string, depId: string, updates: Partial<Dependency>) => {
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', depId), sanitizeUpdates(updates));
  },
  delete: async (wsId: string, bId: string, depId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', depId));
  }
};

// ==========================
// Node (WBS) Service
// ==========================
export const nodeService = {
  create: async (wsId: string, bId: string, node: TaskNode): Promise<void> => {
    const nodeRef = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', node.id);
    await setDoc(nodeRef, node);
    await writeNodeChangeEvent(wsId, bId, 'created', null, node);
  },
  update: async (wsId: string, bId: string, nId: string, updates: Partial<TaskNode>) => {
    const nodeRef = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId);
    const beforeSnap = await getDoc(nodeRef);
    const before = beforeSnap.exists() ? ({ id: nId, ...beforeSnap.data() } as TaskNode) : null;
    await updateDoc(nodeRef, sanitizeUpdates(updates));
    const after = before ? ({ ...before, ...updates, id: nId, updatedAt: Date.now() } as TaskNode) : ({ id: nId, ...updates } as TaskNode);
    await writeNodeChangeEvent(wsId, bId, 'updated', before, after);
  },
  delete: async (wsId: string, bId: string, nId: string) => {
    const nodeRef = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId);
    const beforeSnap = await getDoc(nodeRef);
    const before = beforeSnap.exists() ? ({ id: nId, ...beforeSnap.data() } as TaskNode) : null;
    await deleteDoc(nodeRef);
    await writeNodeChangeEvent(wsId, bId, 'deleted', before, null);
  },
  batchUpdate: async (wsId: string, bId: string, updates: { id: string, data: Partial<TaskNode> }[]) => {
    const batch = writeBatch(db);
    const snapshots = await Promise.all(
      updates.map(async (u) => {
        const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', u.id);
        const snap = await getDoc(ref);
        return { update: u, before: snap.exists() ? ({ id: u.id, ...snap.data() } as TaskNode) : null };
      })
    );

    snapshots.forEach(({ update }) => {
      const u = update;
      const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', u.id);
      batch.update(ref, u.data as any);
    });
    await batch.commit();

    await Promise.all(
      snapshots.map(({ update, before }) => {
        const after = before
          ? ({ ...before, ...update.data, id: update.id, updatedAt: Date.now() } as TaskNode)
          : ({ id: update.id, ...update.data } as TaskNode);
        return writeNodeChangeEvent(wsId, bId, 'updated', before, after);
      })
    );
  }
};
