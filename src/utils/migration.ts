import { requireFirebaseDb } from '../services/firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import type { Dependency, StatusFilters, TaskNode, Workspace } from '../types';
import type { LegacyCard, LegacyChecklistItem, LegacyList } from '../types/legacy';

interface PersistedState {
  state: {
    workspaces: Workspace[];
    activeWorkspaceId: string | null;
    activeBoardId: string | null;
    currentView: string;
    statusFilters: StatusFilters;
  };
  version: number;
}

interface LegacyData {
  workspaces?: Workspace[];
  activeWorkspaceId?: string | null;
  activeBoardId?: string | null;
}

const defaultStatusFilters: StatusFilters = {
  todo: true,
  in_progress: true,
  delayed: true,
  completed: true,
  unsure: true,
  onhold: true,
};

export const migrateLegacyData = (): PersistedState['state'] | null => {
  const legacyRaw = localStorage.getItem('projed_data');
  if (!legacyRaw) return null;

  try {
    const legacyData: LegacyData = JSON.parse(legacyRaw);
    const newState: PersistedState = {
      state: {
        workspaces: legacyData.workspaces || [],
        activeWorkspaceId: legacyData.activeWorkspaceId || null,
        activeBoardId: legacyData.activeBoardId || null,
        currentView: 'home',
        statusFilters: defaultStatusFilters,
      },
      version: 0,
    };

    localStorage.setItem('projed-storage', JSON.stringify(newState));
    console.log('[Migration] Legacy localStorage converted to projed-storage.');
    return newState.state;
  } catch (error) {
    console.error('[Migration] Failed to convert legacy localStorage:', error);
    return null;
  }
};

const compact = <T extends object>(value: T): T => {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;
};

const createLegacyNodeId = (prefix: string, id: string) =>
  id.startsWith(`${prefix}_`) ? id : `${prefix}_${id}`;

const toTaskStatus = (value: unknown, fallback: TaskNode['status'] = 'todo'): TaskNode['status'] => {
  const valid = ['todo', 'in_progress', 'delayed', 'completed', 'unsure', 'onhold'];
  return typeof value === 'string' && valid.includes(value) ? value as TaskNode['status'] : fallback;
};

const convertChecklistItemToNode = (
  wsId: string,
  boardId: string,
  parentId: string,
  card: LegacyCard,
  item: LegacyChecklistItem,
  itemIndex: number
): TaskNode => compact({
  id: createLegacyNodeId('cli', `${card.id}_${item.id || itemIndex}`),
  workspaceId: wsId,
  boardId,
  parentId,
  title: item.title || item.text || '未命名檢查項目',
  status: item.completed ? 'completed' : toTaskStatus(item.status),
  startDate: item.startDate || undefined,
  endDate: item.endDate || undefined,
  nodeType: 'task' as const,
  order: itemIndex,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isArchived: item.isArchived || undefined,
});

const convertCardToNode = (
  wsId: string,
  boardId: string,
  parentId: string,
  list: LegacyList,
  card: LegacyCard,
  cardIndex: number
): TaskNode => compact({
  id: createLegacyNodeId('card', card.id),
  workspaceId: wsId,
  boardId,
  parentId,
  title: card.title || '未命名任務',
  description: card.notes || card.description || undefined,
  status: toTaskStatus(card.status),
  startDate: card.startDate || undefined,
  endDate: card.endDate || undefined,
  nodeType: 'task' as const,
  kanbanStageId: list.id,
  order: card.order ?? cardIndex,
  createdAt: card.createdAt || Date.now(),
  updatedAt: Date.now(),
  isArchived: card.isArchived || undefined,
});

const convertListToNode = (wsId: string, boardId: string, list: LegacyList, listIndex: number): TaskNode => compact({
  id: createLegacyNodeId('list', list.id),
  workspaceId: wsId,
  boardId,
  parentId: null,
  title: list.title || '未命名群組',
  status: toTaskStatus(list.status),
  startDate: list.startDate || undefined,
  endDate: list.endDate || undefined,
  nodeType: 'group' as const,
  order: list.order ?? listIndex,
  createdAt: list.createdAt || Date.now(),
  updatedAt: Date.now(),
  isArchived: list.isArchived || undefined,
});

const convertLegacyListsToNodes = (wsId: string, boardId: string, lists: LegacyList[] = []): TaskNode[] => {
  const nodes: TaskNode[] = [];

  lists.forEach((list, listIndex) => {
    const listNode = convertListToNode(wsId, boardId, list, listIndex);
    nodes.push(listNode);

    (list.cards || []).forEach((card, cardIndex) => {
      const cardNode = convertCardToNode(wsId, boardId, listNode.id, list, card, cardIndex);
      nodes.push(cardNode);

      (card.checklists || []).forEach((checklist) => {
        (checklist.items || []).forEach((item, itemIndex) => {
          nodes.push(convertChecklistItemToNode(wsId, boardId, cardNode.id, card, item, itemIndex));
        });
      });
    });
  });

  return nodes;
};

const writeNodes = async (wsId: string, boardId: string, nodes: TaskNode[]) => {
  const firestoreDb = requireFirebaseDb();
  for (let start = 0; start < nodes.length; start += 450) {
    const batch = writeBatch(firestoreDb);
    nodes.slice(start, start + 450).forEach((node) => {
      batch.set(doc(firestoreDb, 'workspaces', wsId, 'boards', boardId, 'nodes', node.id), compact(node), { merge: true });
    });
    await batch.commit();
  }
};

const writeDependencies = async (wsId: string, boardId: string, dependencies: Dependency[] = []) => {
  if (dependencies.length === 0) return;

  const firestoreDb = requireFirebaseDb();
  for (let start = 0; start < dependencies.length; start += 450) {
    const batch = writeBatch(firestoreDb);
    dependencies.slice(start, start + 450).forEach((dependency) => {
      if (!dependency.id) return;
      batch.set(doc(firestoreDb, 'workspaces', wsId, 'boards', boardId, 'dependencies', dependency.id), dependency, { merge: true });
    });
    await batch.commit();
  }
};

const writeWorkspaceTreeToFirestore = async (userId: string, workspaces: Workspace[]) => {
  const firestoreDb = requireFirebaseDb();
  for (const ws of workspaces) {
    if (!ws.id) continue;

    await setDoc(doc(firestoreDb, 'workspaces', ws.id), compact({
      id: ws.id,
      title: ws.title || '工作區',
      ownerId: ws.ownerId || userId,
      members: ws.members?.length ? ws.members : [userId],
      order: ws.order || Date.now(),
      createdAt: ws.createdAt || Date.now(),
    }), { merge: true });

    for (const board of ws.boards || []) {
      if (!board.id) continue;

      await setDoc(doc(firestoreDb, 'workspaces', ws.id, 'boards', board.id), compact({
        id: board.id,
        title: board.title || '看板',
        order: board.order || Date.now(),
        createdAt: board.createdAt || Date.now(),
      }), { merge: true });

      const legacyLists = ((board as unknown as { lists?: LegacyList[] }).lists || []);
      const nodes = convertLegacyListsToNodes(ws.id, board.id, legacyLists);
      if (nodes.length > 0) {
        await writeNodes(ws.id, board.id, nodes);
      }

      await writeDependencies(ws.id, board.id, board.dependencies || []);
    }
  }
};

export const migrateLocalStorageToFirestore = async (userId: string): Promise<boolean> => {
  const raw = localStorage.getItem('projed-storage');
  if (!raw) {
    const legacyResult = migrateLegacyData();
    if (!legacyResult) return false;
    return migrateLocalStorageToFirestore(userId);
  }

  try {
    const parsed = JSON.parse(raw);
    const workspaces: Workspace[] = parsed?.state?.workspaces || parsed?.workspaces || [];

    if (workspaces.length === 0) {
      console.log('[Migration] No local workspaces to migrate.');
      return false;
    }

    await writeWorkspaceTreeToFirestore(userId, workspaces);

    localStorage.removeItem('projed-storage');
    localStorage.removeItem('projed_data');
    console.log('[Migration] Local data migrated to Firestore WBS nodes.');
    return true;
  } catch (error) {
    console.error('[Migration] Firestore migration failed:', error);
    alert('資料遷移失敗，請查看瀏覽器主控台錯誤訊息。');
    return false;
  }
};

export const writeImportedWorkspacesToFirestore = async (userId: string, workspaces: Workspace[]): Promise<boolean> => {
  try {
    await writeWorkspaceTreeToFirestore(userId, workspaces);
    console.log('[Import] Workspaces written to Firestore WBS nodes.');
    return true;
  } catch (error) {
    console.error('[Import] Firestore import failed:', error);
    return false;
  }
};
