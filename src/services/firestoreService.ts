import { db } from './firebase';
import { 
  collection, doc, setDoc, updateDoc, deleteDoc, writeBatch
} from 'firebase/firestore';
import type { Workspace, Board, List, Card, Dependency } from '../types';

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
  update: async (wsId: string, updates: Partial<Workspace>) => {
    // Cannot update lists/boards arrays directly if they are not in the document,
    // but Workspace type includes boards: Board[]. Wait, if we use flatten subcollections,
    // we should strip boards before saving.
    const { boards, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId), docData);
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
      lists: [],
      dependencies: [],
      order: Date.now(),
      createdAt: Date.now()
    };
    // Strip nested arrays before saving
    const { lists, dependencies, ...docData } = board as any;
    await setDoc(boardRef, docData);
    return board;
  },
  update: async (wsId: string, bId: string, updates: Partial<Board>) => {
    const { lists, dependencies, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId), docData);
    }
  },
  delete: async (wsId: string, bId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId));
  }
};

// ==========================
// List Service
// ==========================
export const listService = {
  create: async (wsId: string, bId: string, title?: string): Promise<List> => {
    const listRef = doc(collection(db, 'workspaces', wsId, 'boards', bId, 'lists'));
    const list: List = {
      id: listRef.id,
      title: title || '新列表',
      status: 'todo',
      cards: [],
      ganttVisible: true,
      order: Date.now(),
      createdAt: Date.now()
    };
    const { cards, ...docData } = list as any;
    await setDoc(listRef, docData);
    return list;
  },
  update: async (wsId: string, bId: string, lId: string, updates: Partial<List>) => {
    const { cards, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'lists', lId), docData);
    }
  },
  delete: async (wsId: string, bId: string, lId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'lists', lId));
  },
  batchUpdateOrder: async (wsId: string, bId: string, items: { id: string, order: number }[]) => {
    const batch = writeBatch(db);
    items.forEach(item => {
      const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'lists', item.id);
      batch.update(ref, { order: item.order });
    });
    await batch.commit();
  }
};

// ==========================
// Card Service
// ==========================
export const cardService = {
  create: async (wsId: string, bId: string, lId: string, title?: string): Promise<Card> => {
    const cardRef = doc(collection(db, 'workspaces', wsId, 'boards', bId, 'cards'));
    const card: Card = {
      id: cardRef.id,
      title: title || '新卡片',
      status: 'todo',
      checklists: [],
      ganttVisible: true,
      listId: lId,
      order: Date.now(),
      createdAt: Date.now()
    };
    await setDoc(cardRef, card);
    return card;
  },
  update: async (wsId: string, bId: string, cId: string, updates: Partial<Card>) => {
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'cards', cId), updates as any);
  },
  delete: async (wsId: string, bId: string, cId: string) => {
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'cards', cId));
  },
  batchUpdateOrder: async (wsId: string, bId: string, items: { id: string, order: number, listId?: string }[]) => {
    const batch = writeBatch(db);
    items.forEach(item => {
      const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'cards', item.id);
      const updates: any = { order: item.order };
      if (item.listId) updates.listId = item.listId;
      batch.update(ref, updates);
    });
    await batch.commit();
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
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', depId), updates as any);
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
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId), updates as any);
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
