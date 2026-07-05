import { requireFirebaseDb } from './firebase';
import { 
  collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, deleteField, getDoc, getDocs
} from 'firebase/firestore';
import type { Workspace, Board, BoardMember, Dependency, KnowledgeRecord, KnowledgeRecordInput, TaskNode, TaskTag, WorkspaceMember } from '../types';

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
    const db = requireFirebaseDb();
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
    const db = requireFirebaseDb();
    await setDoc(doc(db, 'workspaces', ws.id), ws);
  },
  update: async (wsId: string, updates: Partial<Workspace>) => {
    const db = requireFirebaseDb();
    // Cannot update lists/boards arrays directly if they are not in the document,
    // but Workspace type includes boards: Board[]. Wait, if we use flatten subcollections,
    // we should strip boards before saving.
    const { boards, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId), sanitizeUpdates(docData));
    }
  },
  delete: async (wsId: string) => {
    const db = requireFirebaseDb();
    // Note: This only deletes the parent doc. Subcollections must be handled via Cloud Functions or recursive delete in a real production app.
    await deleteDoc(doc(db, 'workspaces', wsId));
  }
};

export const memberService = {
  listWorkspaceMembers: async (wsId: string): Promise<WorkspaceMember[]> => {
    const db = requireFirebaseDb();
    const snapshot = await getDoc(doc(db, 'workspaces', wsId));
    if (!snapshot.exists()) return [];

    const workspace = { ...(snapshot.data() as Workspace), id: snapshot.id };
    const memberIds = Array.from(new Set([...(workspace.members || []), workspace.ownerId].filter(Boolean) as string[]));
    return memberIds.map(userId => ({
      workspaceId: wsId,
      userId,
      role: userId === workspace.ownerId ? 'owner' : 'member',
      status: 'active',
      profile: {
        id: userId,
        email: null,
        displayName: userId,
      },
      createdAt: workspace.createdAt,
    }));
  },

  listBoardMembers: async (wsId: string, boardId: string): Promise<BoardMember[]> => {
    const workspaceMembers = await memberService.listWorkspaceMembers(wsId);
    return workspaceMembers.map(member => ({
      workspaceId: wsId,
      boardId,
      userId: member.userId,
      role: member.role === 'owner' ? 'owner' : 'member',
      profile: member.profile,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    }));
  },
};

// ==========================
// Board Service
// ==========================
export const boardService = {
  create: async (wsId: string, title?: string): Promise<Board> => {
    const db = requireFirebaseDb();
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
    const db = requireFirebaseDb();
    const { dependencies, ...docData } = board as any;
    await setDoc(doc(db, 'workspaces', wsId, 'boards', board.id), docData);
  },
  update: async (wsId: string, bId: string, updates: Partial<Board>) => {
    const db = requireFirebaseDb();
    const { dependencies, ...docData } = updates as any;
    if (Object.keys(docData).length > 0) {
      await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId), sanitizeUpdates(docData));
    }
  },
  delete: async (wsId: string, bId: string) => {
    const db = requireFirebaseDb();
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId));
  }
};

// ==========================
// Dependency Service
// ==========================
export const dependencyService = {
  create: async (wsId: string, bId: string, dependency: Omit<Dependency, 'id'>): Promise<Dependency> => {
    const db = requireFirebaseDb();
    const depRef = doc(collection(db, 'workspaces', wsId, 'boards', bId, 'dependencies'));
    const dep = { ...dependency, id: depRef.id };
    await setDoc(depRef, dep);
    return dep;
  },
  set: async (wsId: string, bId: string, dependency: Dependency): Promise<Dependency> => {
    const db = requireFirebaseDb();
    await setDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', dependency.id), dependency);
    return dependency;
  },
  update: async (wsId: string, bId: string, depId: string, updates: Partial<Dependency>) => {
    const db = requireFirebaseDb();
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', depId), sanitizeUpdates(updates));
  },
  delete: async (wsId: string, bId: string, depId: string) => {
    const db = requireFirebaseDb();
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'dependencies', depId));
  }
};

// ==========================
// Node (WBS) Service
// ==========================
export const nodeService = {
  listByProject: async (wsId: string, bId: string): Promise<TaskNode[]> => {
    const db = requireFirebaseDb();
    const snapshot = await getDocs(collection(db, 'workspaces', wsId, 'boards', bId, 'nodes'));
    return snapshot.docs
      .map(docSnap => {
        const data = docSnap.data() as TaskNode;
        return {
          ...data,
          id: data.id || docSnap.id,
          workspaceId: data.workspaceId || wsId,
          boardId: data.boardId || bId,
        };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  create: async (wsId: string, bId: string, node: import('../types').TaskNode): Promise<void> => {
    const db = requireFirebaseDb();
    const nodeRef = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', node.id);
    await setDoc(nodeRef, node);
  },
  update: async (wsId: string, bId: string, nId: string, updates: Partial<import('../types').TaskNode>) => {
    const db = requireFirebaseDb();
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId), sanitizeUpdates(updates));
  },
  delete: async (wsId: string, bId: string, nId: string) => {
    const db = requireFirebaseDb();
    await deleteDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId));
  },
  batchUpdate: async (wsId: string, bId: string, updates: { id: string, data: Partial<import('../types').TaskNode> }[]) => {
    const db = requireFirebaseDb();
    const batch = writeBatch(db);
    updates.forEach(u => {
      const ref = doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', u.id);
      batch.update(ref, u.data as any);
    });
    await batch.commit();
  }
};

// ==========================
// Workspace Tag Service
// ==========================
export const tagService = {
  listByWorkspace: async (wsId: string): Promise<TaskTag[]> => {
    const db = requireFirebaseDb();
    const snapshot = await getDocs(collection(db, 'workspaces', wsId, 'tags'));
    return snapshot.docs
      .map(docSnap => ({ ...(docSnap.data() as TaskTag), id: docSnap.id, workspaceId: wsId }))
      .sort((a, b) => a.order - b.order);
  },

  create: async (wsId: string, tag: TaskTag): Promise<TaskTag> => {
    const db = requireFirebaseDb();
    const created = { ...tag, workspaceId: wsId };
    await setDoc(doc(db, 'workspaces', wsId, 'tags', created.id), created);
    return created;
  },

  update: async (wsId: string, tagId: string, updates: Partial<TaskTag>): Promise<void> => {
    const db = requireFirebaseDb();
    await updateDoc(doc(db, 'workspaces', wsId, 'tags', tagId), sanitizeUpdates(updates));
  },

  delete: async (wsId: string, tagId: string): Promise<void> => {
    const db = requireFirebaseDb();
    await deleteDoc(doc(db, 'workspaces', wsId, 'tags', tagId));

    const boardsSnapshot = await getDocs(collection(db, 'workspaces', wsId, 'boards'));
    const batch = writeBatch(db);
    for (const boardDoc of boardsSnapshot.docs) {
      const nodesSnapshot = await getDocs(collection(db, 'workspaces', wsId, 'boards', boardDoc.id, 'nodes'));
      nodesSnapshot.docs.forEach(nodeDoc => {
        const data = nodeDoc.data() as import('../types').TaskNode;
        if (!data.tagIds?.includes(tagId)) return;
        batch.update(nodeDoc.ref, {
          tagIds: data.tagIds.filter(id => id !== tagId),
          updatedAt: Date.now(),
        });
      });
    }
    await batch.commit();
  },

  setNodeTags: async (wsId: string, bId: string, nId: string, tagIds: string[]): Promise<void> => {
    const db = requireFirebaseDb();
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'nodes', nId), { tagIds, updatedAt: Date.now() });
  },
};

export const recordService = {
  listByProject: async (wsId: string, bId: string): Promise<KnowledgeRecord[]> => {
    const db = requireFirebaseDb();
    const snapshot = await getDocs(collection(db, 'workspaces', wsId, 'boards', bId, 'records'));
    return snapshot.docs
      .map(docSnap => ({ ...(docSnap.data() as KnowledgeRecord), id: docSnap.id }))
      .filter(record => record.status !== 'archived')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  listByNode: async (wsId: string, bId: string, nodeId: string): Promise<KnowledgeRecord[]> => {
    const records = await recordService.listByProject(wsId, bId);
    return records.filter(record => record.taskLinks.some(link => link.nodeId === nodeId));
  },

  upsert: async (wsId: string, bId: string, input: KnowledgeRecordInput): Promise<KnowledgeRecord> => {
    const db = requireFirebaseDb();
    const recordRef = input.id
      ? doc(db, 'workspaces', wsId, 'boards', bId, 'records', input.id)
      : doc(collection(db, 'workspaces', wsId, 'boards', bId, 'records'));
    const now = Date.now();
    const previous = input.id ? await getDoc(recordRef) : null;
    const existing = previous?.exists() ? previous.data() as KnowledgeRecord : undefined;
    const record: KnowledgeRecord = {
      ...(existing || {}),
      id: recordRef.id,
      workspaceId: wsId,
      boardId: bId,
      type: input.type,
      title: input.title,
      content: input.content,
      status: input.status,
      visibility: input.visibility,
      participantsText: input.participantsText,
      occurredAt: input.occurredAt,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      recordedBy: input.recordedBy,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ragEnabled: input.status === 'published' && input.visibility !== 'private',
      taskLinks: input.taskLinks.map((link, index) => ({
        id: `${recordRef.id}_link_${link.nodeId}_${link.role}_${index}`,
        recordId: recordRef.id,
        workspaceId: wsId,
        boardId: bId,
        nodeId: link.nodeId,
        role: link.role,
        createdAt: now,
      })),
    };
    await setDoc(recordRef, record);
    return record;
  },

  delete: async (wsId: string, bId: string, recordId: string): Promise<void> => {
    const db = requireFirebaseDb();
    await updateDoc(doc(db, 'workspaces', wsId, 'boards', bId, 'records', recordId), {
      status: 'archived',
      updatedAt: Date.now(),
    });
  },
};
