// @ts-nocheck
/**
 * 資料遷移工具
 * 設計意圖：
 * 1. migrateLegacyData — 舊版 projed_data → projed-storage 格式轉換（保留向下相容）
 * 2. migrateLocalStorageToFirestore — 將 Local Storage 的完整資料寫入 Firestore,
 *    實現從單機版到雲端版的一次性遷移。
 */
import { db } from '../services/firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import type { Workspace, Board, List, Card, Dependency, StatusFilters } from '../types';

// ===== 舊版遷移（保留）=====

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
                statusFilters: {
                    todo: true, delayed: true, completed: true, unsure: true, onhold: true,
                }
            },
            version: 0
        };
        localStorage.setItem('projed-storage', JSON.stringify(newState));
        console.log("✅ Data successfully migrated from legacy storage.");
        return newState.state;
    } catch (e) {
        console.error("❌ Migration failed:", e);
        return null;
    }
};

// ===== Local Storage → Firestore 遷移 =====

/**
 * 將 Local Storage 中的 projed-storage 資料逐層寫入 Firestore。
 * 設計意圖：使用者首次登入時觸發，將所有本地資料上傳到雲端。
 *
 * 寫入順序：Workspace → Board → List → Card → Dependency
 * 每個層級使用 WriteBatch 減少寫入次數。
 *
 * @param userId - 當前登入使用者的 UID
 * @returns 遷移是否成功
 */
export const migrateLocalStorageToFirestore = async (userId: string): Promise<boolean> => {
    const raw = localStorage.getItem('projed-storage');
    if (!raw) {
        // 嘗試舊版格式
        const legacyResult = migrateLegacyData();
        if (!legacyResult) return false;
        // 遞迴呼叫自己（此時已有 projed-storage）
        return migrateLocalStorageToFirestore(userId);
    }

    try {
        const parsed = JSON.parse(raw);
        // 支援 Zustand persist 格式 { state: { workspaces: [] } }
        const workspaces: Workspace[] = parsed?.state?.workspaces || parsed?.workspaces || [];

        if (workspaces.length === 0) {
            console.log("[Migration] No workspaces to migrate.");
            return false;
        }

        console.log(`[Migration] 開始遷移 ${workspaces.length} 個工作區到 Firestore...`);

        for (const ws of workspaces) {
            // 1. 寫入 Workspace 文件
            const wsRef = doc(db, 'workspaces', ws.id);
            await setDoc(wsRef, {
                id: ws.id,
                title: ws.title,
                ownerId: userId,
                members: [userId],
                order: ws.order || Date.now(),
                createdAt: ws.createdAt || Date.now()
            });
            console.log(`  ✅ Workspace: ${ws.title}`);

            for (const board of ws.boards || []) {
                // 2. 寫入 Board 文件
                const boardRef = doc(db, 'workspaces', ws.id, 'boards', board.id);
                await setDoc(boardRef, {
                    id: board.id,
                    title: board.title,
                    order: board.order || Date.now(),
                    createdAt: board.createdAt || Date.now()
                });
                console.log(`    ✅ Board: ${board.title}`);

                // 3. 批次寫入 Lists
                if (board.lists && board.lists.length > 0) {
                    const listBatch = writeBatch(db);
                    for (let i = 0; i < board.lists.length; i++) {
                        const list = board.lists[i];
                        const listRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'lists', list.id);
                        listBatch.set(listRef, {
                            id: list.id,
                            title: list.title,
                            status: list.status || 'todo',
                            startDate: list.startDate || '',
                            endDate: list.endDate || '',
                            ganttVisible: list.ganttVisible !== false,
                            order: i,
                            createdAt: list.createdAt || Date.now()
                        });
                    }
                    await listBatch.commit();
                    console.log(`      ✅ ${board.lists.length} Lists`);

                    // 4. 批次寫入 Cards（扁平化，用 listId 歸屬）
                    // Firestore WriteBatch 上限 500 筆，需要分批
                    const allCards: { ref: any; data: any }[] = [];
                    for (let i = 0; i < board.lists.length; i++) {
                        const list = board.lists[i];
                        for (let j = 0; j < (list.cards || []).length; j++) {
                            const card = list.cards[j];
                            const cardRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'cards', card.id);
                            allCards.push({
                                ref: cardRef,
                                data: {
                                    id: card.id,
                                    title: card.title,
                                    status: card.status || 'todo',
                                    startDate: card.startDate || '',
                                    endDate: card.endDate || '',
                                    notes: card.notes || '',
                                    ganttVisible: card.ganttVisible !== false,
                                    listId: list.id,
                                    order: j,
                                    createdAt: card.createdAt || Date.now(),
                                    checklists: card.checklists || [] // 嵌入式保留
                                }
                            });
                        }
                    }

                    // 分批寫入（每批最多 450 筆，留點餘量）
                    for (let batchStart = 0; batchStart < allCards.length; batchStart += 450) {
                        const batchSlice = allCards.slice(batchStart, batchStart + 450);
                        const cardBatch = writeBatch(db);
                        batchSlice.forEach(({ ref, data }) => cardBatch.set(ref, data));
                        await cardBatch.commit();
                    }
                    if (allCards.length > 0) {
                        console.log(`      ✅ ${allCards.length} Cards`);
                    }
                }

                // 5. 批次寫入 Dependencies
                if (board.dependencies && board.dependencies.length > 0) {
                    const depBatch = writeBatch(db);
                    for (const dep of board.dependencies) {
                        const depRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'dependencies', dep.id);
                        depBatch.set(depRef, dep);
                    }
                    await depBatch.commit();
                    console.log(`      ✅ ${board.dependencies.length} Dependencies`);
                }
            }
        }

        // 遷移完成，清除 Local Storage 舊資料
        localStorage.removeItem('projed-storage');
        localStorage.removeItem('projed_data');
        console.log("🎉 [Migration] 所有資料已成功遷移到 Firestore！Local Storage 已清除。");
        return true;
    } catch (error) {
        console.error("❌ [Migration] Firestore 遷移失敗:", error);
        alert("資料遷移失敗，請查看 Console 了解詳情。您的本地資料未被清除。");
        return false;
    }
};

// ===== 通用 Firestore 寫入（供 importData 呼叫）=====

/**
 * 將 Workspace 陣列寫入 Firestore。
 * 設計意圖：提供給手動匯入功能 (importData) 使用，
 * 將解析完成的 Workspace 物件逐層寫入 Firestore 子集合。
 * onSnapshot 監聽器會自動接收新文件並更新畫面。
 *
 * @param userId - 當前登入使用者的 UID
 * @param workspaces - 要寫入的 Workspace 陣列
 * @returns 是否成功
 */
export const writeImportedWorkspacesToFirestore = async (userId: string, workspaces: Workspace[]): Promise<boolean> => {
    try {
        console.log(`[Import] 開始寫入 ${workspaces.length} 個工作區到 Firestore...`);

        for (const ws of workspaces) {
            // 1. 寫入 Workspace 文件
            const wsRef = doc(db, 'workspaces', ws.id);
            await setDoc(wsRef, {
                id: ws.id,
                title: ws.title,
                ownerId: userId,
                members: [userId],
                order: ws.order || Date.now(),
                createdAt: ws.createdAt || Date.now()
            });
            console.log(`  ✅ Workspace: ${ws.title}`);

            for (const board of ws.boards || []) {
                // 2. 寫入 Board 文件
                const boardRef = doc(db, 'workspaces', ws.id, 'boards', board.id);
                await setDoc(boardRef, {
                    id: board.id,
                    title: board.title,
                    order: board.order || Date.now(),
                    createdAt: board.createdAt || Date.now()
                });
                console.log(`    ✅ Board: ${board.title}`);

                // 3. 批次寫入 Lists
                if (board.lists && board.lists.length > 0) {
                    const listBatch = writeBatch(db);
                    for (let i = 0; i < board.lists.length; i++) {
                        const list = board.lists[i];
                        const listRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'lists', list.id);
                        listBatch.set(listRef, {
                            id: list.id,
                            title: list.title,
                            status: list.status || 'todo',
                            startDate: list.startDate || '',
                            endDate: list.endDate || '',
                            ganttVisible: list.ganttVisible !== false,
                            order: list.order ?? i,
                            createdAt: list.createdAt || Date.now()
                        });
                    }
                    await listBatch.commit();
                    console.log(`      ✅ ${board.lists.length} Lists`);

                    // 4. 批次寫入 Cards（扁平化，用 listId 歸屬）
                    const allCards: { ref: any; data: any }[] = [];
                    for (let i = 0; i < board.lists.length; i++) {
                        const list = board.lists[i];
                        for (let j = 0; j < (list.cards || []).length; j++) {
                            const card = list.cards[j];
                            const cardRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'cards', card.id);
                            allCards.push({
                                ref: cardRef,
                                data: {
                                    id: card.id,
                                    title: card.title,
                                    status: card.status || 'todo',
                                    startDate: card.startDate || '',
                                    endDate: card.endDate || '',
                                    notes: card.notes || '',
                                    ganttVisible: card.ganttVisible !== false,
                                    listId: list.id,
                                    order: card.order ?? j,
                                    createdAt: card.createdAt || Date.now(),
                                    checklists: card.checklists || []
                                }
                            });
                        }
                    }

                    // 分批寫入（每批最多 450 筆）
                    for (let batchStart = 0; batchStart < allCards.length; batchStart += 450) {
                        const batchSlice = allCards.slice(batchStart, batchStart + 450);
                        const cardBatch = writeBatch(db);
                        batchSlice.forEach(({ ref, data }) => cardBatch.set(ref, data));
                        await cardBatch.commit();
                    }
                    if (allCards.length > 0) {
                        console.log(`      ✅ ${allCards.length} Cards`);
                    }
                }

                // 5. 批次寫入 Dependencies
                if (board.dependencies && board.dependencies.length > 0) {
                    const depBatch = writeBatch(db);
                    for (const dep of board.dependencies) {
                        const depRef = doc(db, 'workspaces', ws.id, 'boards', board.id, 'dependencies', dep.id);
                        depBatch.set(depRef, dep);
                    }
                    await depBatch.commit();
                    console.log(`      ✅ ${board.dependencies.length} Dependencies`);
                }
            }
        }

        console.log("🎉 [Import] 所有資料已成功寫入 Firestore！");
        return true;
    } catch (error) {
        console.error("❌ [Import] Firestore 寫入失敗:", error);
        return false;
    }
};
