/**
 * useFirestoreSync — Firestore 即時同步 Hook
 * 設計意圖：使用 Firestore onSnapshot 監聽資料變動，
 * 自動將遠端變更同步至 Zustand Store，
 * 實現跨裝置/跨分頁的即時同步。
 *
 * 監聽策略：
 * - 第 1 層：監聽使用者所屬的所有 workspaces
 * - 第 2 層：對 **每一個** workspace 監聽其 boards 子集合（Sidebar 需要全部）
 * - 第 3 層：僅對當前 active board 監聽 lists / cards / dependencies（效能考量）
 *
 * 重要：查詢不使用 orderBy（避免 Composite Index），改在 client 端排序。
 */
import { useEffect, useRef, useMemo } from 'react';
import { 
  collection, query, where, onSnapshot, Unsubscribe
} from 'firebase/firestore';
import { db } from '../services/firebase';
import useBoardStore from '../store/useBoardStore';
import useAuthStore from '../store/useAuthStore';
import type { Workspace, Board, List, Card, Dependency } from '../types';

/** 依 order 欄位升冪排序的輔助函式 */
function sortByOrder<T extends { order?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function useFirestoreSync() {
  const user = useAuthStore(s => s.user);
  const activeBoardId = useBoardStore(s => s.activeBoardId);
  const workspaces = useBoardStore(s => s.workspaces);

  // 設計意圖：先將計算式提升到頂層，得到穩定的 primitive 值，
  // 避免在 useEffect dependency array 內做 .some()/.map() 等即時計算，
  // 那會讓 React (特別是 StrictMode) 偵測到 Hook 計數不一致，引發 Error #310。
  const workspaceIds = useMemo(
    () => workspaces.map(ws => ws.id).join(','),
    [workspaces]
  );
  // 穩定的 boolean：當前 activeBoardId 是否已存在於任何 workspace 的 boards 中
  const isBoardReady = useMemo(
    () => workspaces.some(ws => ws.boards.some(b => b.id === activeBoardId)),
    [workspaces, activeBoardId]
  );
  
  // 用 ref 儲存取消訂閱函式
  const unsubWorkspaces = useRef<Unsubscribe | null>(null);
  // boards 監聽器：每個 workspace 一個
  const unsubBoardsMap = useRef<Map<string, Unsubscribe>>(new Map());
  const unsubLists = useRef<Unsubscribe | null>(null);
  const unsubCards = useRef<Unsubscribe | null>(null);
  const unsubDeps = useRef<Unsubscribe | null>(null);

  // =============================
  // 1. 監聽 Workspaces
  // =============================
  useEffect(() => {
    if (!user) {
      useBoardStore.setState({ workspaces: [] });
      // 清除所有 boards 監聽
      unsubBoardsMap.current.forEach(unsub => unsub());
      unsubBoardsMap.current.clear();
      return;
    }

    const q = query(
      collection(db, 'workspaces'),
      where('members', 'array-contains', user.uid)
    );

    unsubWorkspaces.current = onSnapshot(q, (snapshot) => {
      const newWorkspaces: Workspace[] = sortByOrder(
        snapshot.docs.map(doc => ({
          ...(doc.data() as Workspace),
          id: doc.id,
          boards: []
        }))
      );

      // 保留現有 boards 資料
      const currentWorkspaces = useBoardStore.getState().workspaces;
      const merged = newWorkspaces.map(ws => {
        const existing = currentWorkspaces.find(w => w.id === ws.id);
        return existing ? { ...ws, boards: existing.boards } : ws;
      });

      useBoardStore.setState({ workspaces: merged });
    }, (error) => {
      console.error('[useFirestoreSync] Workspaces snapshot error:', error);
    });

    return () => {
      unsubWorkspaces.current?.();
    };
  }, [user?.uid]);

  // =============================
  // 2. 監聽 Boards — 為每個 workspace 建立獨立監聽器
  //    設計意圖：Sidebar 需要顯示所有 workspace 下的 boards，
  //    所以必須對每個 workspace 都建立 onSnapshot。
  //    當 workspaces 陣列變動時（新增/刪除），動態建立/移除監聽器。
  // =============================
  useEffect(() => {
    const currentWsIds = new Set(workspaces.map(ws => ws.id));
    const subscribedWsIds = new Set(unsubBoardsMap.current.keys());

    // 移除已不存在的 workspace 的監聽器
    subscribedWsIds.forEach(wsId => {
      if (!currentWsIds.has(wsId)) {
        unsubBoardsMap.current.get(wsId)?.();
        unsubBoardsMap.current.delete(wsId);
      }
    });

    // 為新的 workspace 建立監聽器
    workspaces.forEach(ws => {
      if (unsubBoardsMap.current.has(ws.id)) return; // 已有監聽器

      const unsub = onSnapshot(
        collection(db, 'workspaces', ws.id, 'boards'),
        (snapshot) => {
          const boards: Board[] = sortByOrder(
            snapshot.docs.map(doc => ({
              ...(doc.data() as Board),
              id: doc.id,
              lists: [],
              dependencies: []
            }))
          );

          // 保留現有 lists/deps 資料
          const currentWs = useBoardStore.getState().workspaces.find(w => w.id === ws.id);
          const mergedBoards = boards.map(b => {
            const existing = currentWs?.boards.find(eb => eb.id === b.id);
            return existing 
              ? { ...b, lists: existing.lists, dependencies: existing.dependencies } 
              : b;
          });

          useBoardStore.setState(state => ({
            workspaces: state.workspaces.map(w =>
              w.id === ws.id ? { ...w, boards: mergedBoards } : w
            )
          }));
        },
        (error) => {
          console.error(`[useFirestoreSync] Boards snapshot error for ws ${ws.id}:`, error);
        }
      );

      unsubBoardsMap.current.set(ws.id, unsub);
    });

    return () => {
      // 元件卸載時清除所有 boards 監聽
      unsubBoardsMap.current.forEach(unsub => unsub());
      unsubBoardsMap.current.clear();
    };
  }, [workspaceIds]); // 只在 workspace ID 清單變動時重新評估（改用穩定 useMemo 變數）

  // =============================
  // 3. 監聯 Lists / Cards / Dependencies（進入看板時）
  //    設計意圖：只有進入特定看板時才加載深層資料，
  //    避免不必要的 Firestore 讀取。
  // =============================
  useEffect(() => {
    unsubLists.current?.();
    unsubCards.current?.();
    unsubDeps.current?.();

    if (!activeBoardId) return;

    // 找出 activeBoardId 所屬的 workspace
    const activeWs = useBoardStore.getState().workspaces.find(ws =>
      ws.boards.some(b => b.id === activeBoardId)
    );
    // 需要等待 workspaces 載入完成才能正確組出 Firestore 路徑
    if (!activeWs) return;

    const boardPath = `workspaces/${activeWs.id}/boards/${activeBoardId}`;

    // 3a. 監聽 Lists
    unsubLists.current = onSnapshot(
      collection(db, boardPath, 'lists'),
      (snapshot) => {
        const lists: List[] = sortByOrder(
          snapshot.docs.map(doc => ({
            ...(doc.data() as List),
            id: doc.id,
            cards: []
          }))
        );

        updateBoardInStore(activeWs.id, activeBoardId, (board) => {
          const mergedLists = lists.map(l => {
            const existing = board.lists.find(el => el.id === l.id);
            return existing ? { ...l, cards: existing.cards } : l;
          });
          return { ...board, lists: mergedLists };
        });
      },
      (error) => {
        console.error('[useFirestoreSync] Lists snapshot error:', error);
      }
    );

    // 3b. 監聽 Cards（扁平集合，用 listId 分組）
    unsubCards.current = onSnapshot(
      collection(db, boardPath, 'cards'),
      (snapshot) => {
        const allCards: Card[] = sortByOrder(
          snapshot.docs.map(doc => ({
            ...(doc.data() as Card),
            id: doc.id
          }))
        );

        updateBoardInStore(activeWs.id, activeBoardId, (board) => ({
          ...board,
          lists: board.lists.map(l => ({
            ...l,
            cards: allCards.filter(c => c.listId === l.id)
          }))
        }));
      },
      (error) => {
        console.error('[useFirestoreSync] Cards snapshot error:', error);
      }
    );

    // 3c. 監聽 Dependencies
    unsubDeps.current = onSnapshot(
      collection(db, boardPath, 'dependencies'),
      (snapshot) => {
        const dependencies: Dependency[] = snapshot.docs.map(doc => ({
          ...(doc.data() as Dependency),
          id: doc.id
        }));

        updateBoardInStore(activeWs.id, activeBoardId, (board) => ({
          ...board,
          dependencies
        }));
      },
      (error) => {
        console.error('[useFirestoreSync] Dependencies snapshot error:', error);
      }
    );

    return () => {
      unsubLists.current?.();
      unsubCards.current?.();
      unsubDeps.current?.();
    };
  }, [activeBoardId, workspaceIds, isBoardReady]); // 使用頂層穩定變數，避免 dependency array 內即時計算觸發 Error #310
}

/**
 * 輔助函式：更新 Store 中特定 Board 的資料
 */
function updateBoardInStore(
  wsId: string,
  bId: string,
  updater: (board: Board) => Board
) {
  useBoardStore.setState(state => ({
    workspaces: state.workspaces.map(ws => {
      if (ws.id !== wsId) return ws;
      return {
        ...ws,
        boards: ws.boards.map(b => {
          if (b.id !== bId) return b;
          return updater(b);
        })
      };
    })
  }));
}
