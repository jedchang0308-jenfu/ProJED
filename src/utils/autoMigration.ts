// @ts-nocheck
/**
 * autoMigration.ts — 自動資料遷移執行器
 *
 * 設計意圖 (Design Intent)：
 * 本模組是所有舊版資料升級邏輯的唯一入口。
 * 採用「Idempotent（冪等）設計」：無論執行幾次，結果都一樣，
 * 確保多裝置登入或重複呼叫不會產生資料污染。
 *
 * 遷移版本號（Migration Guard）：
 * 儲存於 Firestore `users/{uid}.migrationVersion`
 * - undefined / 0 / 1 → 觸發遷移
 * - >= 2             → 跳過（已完成）
 *
 * 遷移流程：
 * 1. 讀取 users/{uid} 的 migrationVersion，若 >= 2 直接返回
 * 2. 讀取 localStorage 舊版資料（projed-storage / projed_data）
 * 3. 將 Workspace / Board 寫入 Firestore（保留原始 ID）
 * 4. 將 Lists / Cards / Checklists 轉換為 WBS TaskNode 並寫入 nodes 集合
 * 5. 掃描 Firestore 舊版 lists 集合，補充轉換未處理的舊雲端資料
 * 6. 寫入 migrationVersion = 2，標記完成
 * 7. 清除 localStorage 舊快取
 */
import { db } from '../services/firebase';
import {
  doc, getDoc, setDoc, collection, getDocs, writeBatch
} from 'firebase/firestore';
import type { TaskNode } from '../types';

// ==========================
// 遷移版本常數
// ==========================
const MIGRATION_VERSION = 2;
const LEGACY_STORAGE_KEY = 'projed-storage';
const VERY_LEGACY_STORAGE_KEY = 'projed_data';

// ==========================
// 主函式：runAutoMigration
// ==========================
/**
 * 登入後自動呼叫此函式。
 * @param userId - Firebase Auth UID
 * @returns 'migrated' | 'skipped' | 'failed'
 */
export const runAutoMigration = async (userId: string): Promise<'migrated' | 'skipped' | 'failed'> => {
  try {
    // ── Step 1: 讀取遷移旗標 ──────────────────────────────────────────
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const currentVersion = userSnap.data()?.migrationVersion ?? 0;

    if (currentVersion >= MIGRATION_VERSION) {
      console.log(`[AutoMigration] 已完成（version=${currentVersion}），跳過。`);
      return 'skipped';
    }

    console.log(`[AutoMigration] 開始遷移（currentVersion=${currentVersion}）...`);

    // ── Step 2: 讀取 localStorage 舊版資料 ────────────────────────────
    const workspaces = readLegacyLocalStorage();
    let migratedFromLocal = false;

    if (workspaces.length > 0) {
      console.log(`[AutoMigration] 找到 ${workspaces.length} 個舊版工作區，開始搬遷...`);
      await migrateWorkspacesToFirestore(userId, workspaces);
      migratedFromLocal = true;
    } else {
      console.log('[AutoMigration] 無 localStorage 舊資料，掃描 Firestore 舊版集合...');
    }

    // ── Step 3: 掃描 Firestore 舊版 lists 集合（雲端舊資料補救）────────
    await migrateLegacyFirestoreListsToNodes(userId);

    // ── Step 4: 寫入遷移完成旗標 ──────────────────────────────────────
    await setDoc(userRef, {
      migrationVersion: MIGRATION_VERSION,
      migratedAt: Date.now(),
    }, { merge: true });

    // ── Step 5: 清除 localStorage 舊快取（確保寫入成功後才清除）────────
    if (migratedFromLocal) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(VERY_LEGACY_STORAGE_KEY);
      console.log('[AutoMigration] localStorage 舊快取已清除。');
    }

    console.log('[AutoMigration] ✅ 遷移完成！');
    return 'migrated';
  } catch (error) {
    console.error('[AutoMigration] ❌ 遷移失敗:', error);
    return 'failed';
  }
};

// ==========================
// 輔助：讀取 localStorage 舊資料
// ==========================
const readLegacyLocalStorage = (): any[] => {
  try {
    // 嘗試新版格式 (Zustand persist)
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const workspaces = parsed?.state?.workspaces || parsed?.workspaces || [];
      if (workspaces.length > 0) return workspaces;
    }

    // 嘗試最舊版格式 (projed_data)
    const veryLegacyRaw = localStorage.getItem(VERY_LEGACY_STORAGE_KEY);
    if (veryLegacyRaw) {
      const parsed = JSON.parse(veryLegacyRaw);
      return parsed?.workspaces || [];
    }
  } catch (e) {
    console.error('[AutoMigration] 讀取 localStorage 失敗:', e);
  }
  return [];
};

// ==========================
// 輔助：將 Workspaces 寫入 Firestore（含 Boards + Nodes）
// ==========================
const migrateWorkspacesToFirestore = async (userId: string, workspaces: any[]): Promise<void> => {
  for (const ws of workspaces) {
    if (!ws.id) continue;

    // 1. 寫入 Workspace 文件
    const wsRef = doc(db, 'workspaces', ws.id);
    await setDoc(wsRef, {
      id: ws.id,
      title: ws.title || '我的工作區',
      ownerId: userId,
      members: ws.members?.length > 0 ? ws.members : [userId],
      order: ws.order || Date.now(),
      createdAt: ws.createdAt || Date.now(),
    }, { merge: true });
    console.log(`  ✅ Workspace: ${ws.title}`);

    for (const board of ws.boards || []) {
      if (!board.id) continue;

      // 2. 寫入 Board 文件（剝除舊版 lists/dependencies 陣列）
      const boardRef = doc(db, 'workspaces', ws.id, 'boards', board.id);
      await setDoc(boardRef, {
        id: board.id,
        title: board.title || '新看板',
        order: board.order || Date.now(),
        createdAt: board.createdAt || Date.now(),
      }, { merge: true });
      console.log(`    ✅ Board: ${board.title}`);

      // 3. 將 Lists / Cards / Checklists 轉換為 WBS Nodes 並批次寫入
      const nodes = convertListsToNodes(ws.id, board.id, board.lists || []);
      if (nodes.length > 0) {
        await batchWriteNodes(ws.id, board.id, nodes);
        console.log(`      ✅ ${nodes.length} TaskNodes`);
      }

      // 4. 寫入 Dependencies
      if (board.dependencies?.length > 0) {
        await batchWriteDependencies(ws.id, board.id, board.dependencies);
        console.log(`      ✅ ${board.dependencies.length} Dependencies`);
      }
    }
  }
};

// ==========================
// 輔助：掃描 Firestore 舊版 lists 集合並轉換為 Nodes
// ==========================
const migrateLegacyFirestoreListsToNodes = async (userId: string): Promise<void> => {
  try {
    // 讀取使用者所屬的所有 workspace（透過 members 過濾）
    const wsSnap = await getDocs(collection(db, 'workspaces'));
    for (const wsDoc of wsSnap.docs) {
      const wsData = wsDoc.data();
      // 只處理此使用者所屬的 workspace
      if (!wsData.members?.includes(userId)) continue;

      const boardsSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'boards'));
      for (const boardDoc of boardsSnap.docs) {
        // 如果已經有 nodes 集合，說明已遷移，跳過
        const nodesSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'boards', boardDoc.id, 'nodes'));
        if (nodesSnap.size > 0) {
          console.log(`  [AutoMigration] Board ${boardDoc.id} 已有 nodes，跳過 lists 掃描。`);
          continue;
        }

        // 讀取舊版 lists 集合
        const listsSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'boards', boardDoc.id, 'lists'));
        if (listsSnap.empty) continue;

        console.log(`  [AutoMigration] 發現舊版 Firestore lists（Board: ${boardDoc.id}），開始轉換...`);

        const legacyLists = listsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 讀取舊版 cards 集合
        const cardsSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'boards', boardDoc.id, 'cards'));
        const allCards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 組裝成帶有 cards 的 lists 結構，再呼叫通用轉換函式
        const listsWithCards = legacyLists.map((list: any) => ({
          ...list,
          cards: allCards.filter((c: any) => c.listId === list.id)
        }));

        const nodes = convertListsToNodes(wsDoc.id, boardDoc.id, listsWithCards);
        if (nodes.length > 0) {
          await batchWriteNodes(wsDoc.id, boardDoc.id, nodes);
          console.log(`    ✅ 轉換 ${nodes.length} 個 TaskNodes from Firestore lists`);
        }
      }
    }
  } catch (e) {
    console.warn('[AutoMigration] 掃描 Firestore 舊版 lists 時發生警告（不影響主流程）:', e);
  }
};

// ==========================
// 輔助：Lists → TaskNode 陣列轉換
// ==========================
const convertListsToNodes = (wsId: string, boardId: string, lists: any[]): TaskNode[] => {
  const nodes: TaskNode[] = [];

  lists.forEach((list: any, listIndex: number) => {
    const listNodeId = `list_${list.id}`;
    // Level 1：Group 節點（原 List）
    nodes.push({
      id: listNodeId,
      workspaceId: wsId,
      boardId: boardId,
      parentId: null,
      title: list.title || '無標題列表',
      status: list.status || 'todo',
      nodeType: 'group',
      startDate: list.startDate || undefined,
      endDate: list.endDate || undefined,
      order: list.order ?? listIndex,
      createdAt: list.createdAt || Date.now(),
      updatedAt: Date.now(),
    } as TaskNode);

    (list.cards || []).forEach((card: any, cardIndex: number) => {
      const cardNodeId = `card_${card.id}`;
      // Level 2：Task 節點（原 Card）
      nodes.push({
        id: cardNodeId,
        workspaceId: wsId,
        boardId: boardId,
        parentId: listNodeId,
        title: card.title || '無標題卡片',
        description: card.notes || card.description || '',
        status: card.status || 'todo',
        startDate: card.startDate || undefined,
        endDate: card.endDate || undefined,
        nodeType: 'task',
        kanbanStageId: list.id,
        order: card.order ?? cardIndex,
        createdAt: card.createdAt || Date.now(),
        updatedAt: Date.now(),
      } as TaskNode);

      // Level 3：Checklist items
      (card.checklists || []).forEach((cl: any) => {
        (cl.items || []).forEach((cli: any, cliIndex: number) => {
          nodes.push({
            id: `cli_${card.id}_${cli.id || cliIndex}`,
            workspaceId: wsId,
            boardId: boardId,
            parentId: cardNodeId,
            title: cli.title || cli.text || '待辦事項',
            status: cli.status || (cli.completed ? 'completed' : 'todo'),
            startDate: cli.startDate || undefined,
            endDate: cli.endDate || undefined,
            nodeType: 'task',
            order: cliIndex,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } as TaskNode);
        });
      });
    });
  });

  return nodes;
};

// ==========================
// 輔助：批次寫入 Nodes（每批 450 筆，避免 Firestore 500 筆限制）
// ==========================
const batchWriteNodes = async (wsId: string, boardId: string, nodes: TaskNode[]): Promise<void> => {
  for (let i = 0; i < nodes.length; i += 450) {
    const slice = nodes.slice(i, i + 450);
    const batch = writeBatch(db);
    slice.forEach(node => {
      // 移除 undefined 欄位（Firestore 不接受）
      const cleanNode: any = {};
      Object.entries(node).forEach(([k, v]) => {
        if (v !== undefined) cleanNode[k] = v;
      });
      const nodeRef = doc(db, 'workspaces', wsId, 'boards', boardId, 'nodes', node.id);
      batch.set(nodeRef, cleanNode, { merge: true });
    });
    await batch.commit();
  }
};

// ==========================
// 輔助：批次寫入 Dependencies
// ==========================
const batchWriteDependencies = async (wsId: string, boardId: string, deps: any[]): Promise<void> => {
  const batch = writeBatch(db);
  deps.forEach(dep => {
    if (!dep.id) return;
    const depRef = doc(db, 'workspaces', wsId, 'boards', boardId, 'dependencies', dep.id);
    batch.set(depRef, dep, { merge: true });
  });
  await batch.commit();
};
