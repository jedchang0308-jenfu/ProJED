import { db } from './firebase';
import { 
  collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, deleteField
} from 'firebase/firestore';
import type { Workspace, Board, Dependency } from '../types';

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
  create: async (wsId: string, bId: string, node: import('../types').TaskNode): Promise<void> => {
    const nodeRef = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', node.id);
    await setDoc(nodeRef, node);
  },
  update: async (wsId: string, bId: string, nId: string, updates: Partial<import('../types').TaskNode>) => {
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId), sanitizeUpdates(updates));
  },
  delete: async (wsId: string, bId: string, nId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId));
  },
  batchUpdate: async (wsId: string, bId: string, updates: { id: string, data: Partial<import('../types').TaskNode> }[]) => {
    const batch = writeBatch(db);
    updates.forEach(u => {
      const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', u.id);
      batch.update(ref, u.data as any);
    });
    await batch.commit();
  }
};
