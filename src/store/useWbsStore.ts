import { create } from 'zustand';
import dayjs from 'dayjs';
import type { TaskNode, KanbanViewConfig, TaskStatus, Dependency } from '../types';
import { nodeService, dependencyService, workspaceService, boardService } from '../services/firestoreService';
import useUndoStore from './useUndoStore';
import useBoardStore from './useBoardStore';

/**
 * WbsStore 狀態定義
 */
export interface WbsBoardState {
  // 核心！所有節點扁平化儲存，方便快取與 O(1) 更新
  nodes: Record<string, TaskNode>; 
  
  // 建立輔助索引，加速渲染特定 Board 或特定 Parent 的子節點
  boardNodesIndex: Record<string, string[]>; // boardId -> TaskNode IDs
  parentNodesIndex: Record<string, string[]>; // parentId -> TaskNode IDs

  // 任務依賴關係圖
  dependencies: Dependency[];

  // Kanban 視圖設定快取
  kanbanConfigs: Record<string, KanbanViewConfig>;

  // 選項與過濾狀態
  loading: boolean;
  error: string | null;
}

export interface WbsBoardActions {
  // ===== 基礎資料操作 (CRUD) =====
  
  /** 
   * 初始化/覆蓋整個節點映射表 (通常用於載入專案時)
   * 需同時重建索引
   */
  setNodes: (nodes: TaskNode[]) => void;

  /**
   * 新增單一任務節點
   */
  addNode: (node: TaskNode) => void;

  /**
   * 更新任務節點 (部分欄位)
   */
  updateNode: (id: string, updates: Partial<TaskNode>) => void;

  /**
   * 軟刪除任務節點 (只標記 isArchived)
   */
  removeNode: (id: string) => void;

  /**
   * 變更節點的階層關係 (拖曳到另一個父節點下)
   */
  moveNode: (id: string, newParentId: string | null) => void;

  // ===== 索引更新內部輔助 (不應導出給 UI 直接呼叫) =====
  _buildIndices: (nodesRecord: Record<string, TaskNode>) => void;

  // ===== 衍生狀態取得 (Derived State Getters) =====
  
  /** 取得某專案底下的最上層節點 (parentId 為 null 或 等於 boardId) */
  getRootNodesForBoard: (boardId: string) => TaskNode[];

  /** 取得某節點底下的所有直接子節點 */
  getChildNodes: (parentId: string) => TaskNode[];

  /**
   * 動態計算節點進度 (0~100)
   * 如果是 Task，返回狀態對應的進度；如果是 Group，遞迴計算所有子節點的平均進度。
   */
  getNodeProgress: (id: string) => number;

  // ===== 進度向上彙總 (Roll-up) 邏輯 =====
  
  /** 
   * 被動觸發：重新計算指定節點及其所有祖先節點的狀態
   * (當某個子節點狀態改變時呼叫此方法)
   */
  recalculateAncestorStatus: (nodeId: string) => void;

  // ===== 依賴關係排程 =====
  addDependency: (dep: Dependency) => void;
  removeDependency: (depId: string) => void;
  updateDependency: (depId: string, updates: Partial<Dependency>) => void;
  _hasCycle: (newDependency: Dependency) => boolean;

  // ===== Import / Export =====
  exportData: () => void;
  importData: (jsonData: string) => void;
}

export type WbsStore = WbsBoardState & WbsBoardActions;

// 進度計算輔助函數
const getStatusProgress = (status: TaskStatus): number => {
  switch (status) {
    case 'completed': return 100;
    case 'in_progress': return 50;
    case 'todo':
    case 'delayed':
    case 'onhold':
    case 'unsure':
    default: return 0;
  }
};

export const useWbsStore = create<WbsStore>((set, get) => ({
  nodes: {},
  boardNodesIndex: {},
  parentNodesIndex: {},
  dependencies: [],
  kanbanConfigs: {},
  loading: false,
  error: null,

  _buildIndices: (nodesRecord) => {
    const boardIndex: Record<string, string[]> = {};
    const parentIndex: Record<string, string[]> = {};

    Object.values(nodesRecord).forEach(node => {
      if (node.isArchived) return; // 略過已封存刪除的節點

      // 構建 board 索引
      if (!boardIndex[node.boardId]) boardIndex[node.boardId] = [];
      boardIndex[node.boardId].push(node.id);

      // 構建 parent 索引 (根節點的 parentId 可能為 null，我們用字串 'root' 來代表，或者依賴板塊 ID)
      const pIdKey = node.parentId || 'root';
      if (!parentIndex[pIdKey]) parentIndex[pIdKey] = [];
      parentIndex[pIdKey].push(node.id);
    });

    set({ 
        boardNodesIndex: boardIndex, 
        parentNodesIndex: parentIndex 
    });
  },

  setNodes: (nodes) => {
    const nodesRecord = nodes.reduce((acc, node) => {
      acc[node.id] = node;
      return acc;
    }, {} as Record<string, TaskNode>);

    set({ nodes: nodesRecord });
    get()._buildIndices(nodesRecord);
  },

  addNode: (node) => {
    const state = get();
    // 使用 Immutable 更新 nodes
    const updatedNodes = { ...state.nodes, [node.id]: node };
    set({ nodes: updatedNodes });
    get()._buildIndices(updatedNodes);

    // 同步寫入 Firestore
    if (node.workspaceId && node.boardId) {
        nodeService.create(node.workspaceId, node.boardId, node).catch(console.error);
    }

    // 紀錄上一步
    useUndoStore.getState().pushUndo({
        label: '新增任務',
        undo: () => get().removeNode(node.id),
        redo: () => get().addNode(node),
    });
  },

  updateNode: (id, updates) => {
    const state = get();
    if (!state.nodes[id]) return;

    const oldNode = state.nodes[id];

    // 比對實質變更，供 undo 使用
    const oldValues: Partial<TaskNode> = {};
    let hasChanges = false;
    for (const key of Object.keys(updates) as Array<keyof TaskNode>) {
        if (updates[key] !== oldNode[key]) {
            (oldValues as any)[key] = oldNode[key];
            hasChanges = true;
        }
    }
    if (!hasChanges) return;

    const newNode = { ...oldNode, ...updates, updatedAt: Date.now() };
    const updatedNodes = { ...state.nodes, [id]: newNode };
    
    set({ nodes: updatedNodes });

    // 同步更新索引
    if (
        ('parentId' in updates && updates.parentId !== oldNode.parentId) || 
        ('isArchived' in updates && updates.isArchived !== oldNode.isArchived) ||
        ('boardId' in updates && updates.boardId !== oldNode.boardId)
    ) {
        get()._buildIndices(updatedNodes);
    }

    // 若狀態改變，觸發 Roll-up
    if ('status' in updates && updates.status !== oldNode.status) {
        // 同步執行，確保父節點狀態可以立即在目前的 Render Cycle 被更新
        get().recalculateAncestorStatus(id);
    }

    // 非同步寫入 Firestore
    if (newNode.workspaceId && newNode.boardId) {
        nodeService.update(newNode.workspaceId, newNode.boardId, id, updates).catch(console.error);
    }

    // 紀錄上一步
    const label = updates.isArchived === true ? '刪除任務' :
                  updates.isArchived === false ? '復原任務' : '修改任務';
    useUndoStore.getState().pushUndo({
        label,
        undo: () => get().updateNode(id, oldValues),
        redo: () => get().updateNode(id, updates),
    });
  },

  removeNode: (id) => {
    // 實作軟刪除
    get().updateNode(id, { isArchived: true });
  },

  moveNode: (id, newParentId) => {
    get().updateNode(id, { parentId: newParentId });
  },

  getRootNodesForBoard: (boardId) => {
    const state = get();
    const rootIds = state.parentNodesIndex['root'] || [];
    const rootNodes = rootIds.map(id => state.nodes[id]).filter(node => node && node.boardId === boardId);

    const alternativeRootIds = state.parentNodesIndex[boardId] || [];
    const altRootNodes = alternativeRootIds.map(id => state.nodes[id]).filter(Boolean);

    const combined = [...rootNodes, ...altRootNodes];
    return combined.sort((a, b) => a.order - b.order);
  },

  getChildNodes: (parentId) => {
    const state = get();
    const childIds = state.parentNodesIndex[parentId] || [];
    return childIds.map(id => state.nodes[id]).filter(Boolean).sort((a, b) => a.order - b.order);
  },

  getNodeProgress: (id) => {
    const state = get();
    const node = state.nodes[id];
    if (!node) return 0;

    const childrenIds = state.parentNodesIndex[id] || [];

    // 無論是 Group 還是 Task，只要沒有子節點，進度就是依賴自身狀態
    if (childrenIds.length === 0) {
        return getStatusProgress(node.status);
    }

    // 只要有子節點，進度必須由下而上(Bottom-up) 遞迴彙總
    let totalProgress = 0;
    childrenIds.forEach(childId => {
        totalProgress += get().getNodeProgress(childId);
    });

    return Math.round(totalProgress / childrenIds.length);
  },

  recalculateAncestorStatus: (nodeId) => {
    const state = get();
    const node = state.nodes[nodeId];
    if (!node || !node.parentId) return;

    let currentParentId = node.parentId;
    const updatedNodes = { ...state.nodes };
    let hasChanges = false;

    // 向上追溯所有的 parent
    while (currentParentId && currentParentId !== 'root' && updatedNodes[currentParentId]) {
      const parentNode = updatedNodes[currentParentId];
      if (parentNode.nodeType === 'task' || parentNode.nodeType === 'milestone') {
          // 如果業務邏輯不允許 task 底下有 task，則跳出（依目前未限制，預防萬一）
      }

      const childIds = state.parentNodesIndex[currentParentId] || [];
      const children = childIds.map(id => updatedNodes[id]).filter(Boolean);
      
      if (children.length === 0) break;

      const total = children.length;
      let completedCount = 0;
      let inProgressCount = 0;

      children.forEach(child => {
        if (child.status === 'completed') completedCount++;
        else if (child.status === 'in_progress') inProgressCount++;
      });

      let newStatus: TaskStatus = parentNode.status;
      if (completedCount === total && total > 0) {
        newStatus = 'completed';
      } else if (inProgressCount > 0 || completedCount > 0) {
        newStatus = 'in_progress';
      } else {
        newStatus = 'todo';
      }

      if (newStatus !== parentNode.status) {
        updatedNodes[currentParentId] = { ...parentNode, status: newStatus, updatedAt: Date.now() };
        hasChanges = true;
      }
      
      currentParentId = parentNode.parentId as string;
    }

    if (hasChanges) {
      set({ nodes: updatedNodes });
    }
  },

  // ===== 依賴關係排程 (Dependencies & Cycle Detection) =====

  _hasCycle: (newDependency) => {
      const state = get();
      const allDeps = [...state.dependencies, newDependency];
      
      // 構建目前圖的 Adjacency List (有向圖: from -> to)
      const adjList: Record<string, string[]> = {};
      allDeps.forEach(dep => {
          if (!adjList[dep.fromId]) adjList[dep.fromId] = [];
          adjList[dep.fromId].push(dep.toId);
      });

      // 使用 DFS 檢查是否有從 newDependency.toId 出發能走回 newDependency.fromId 的路徑
      const visited = new Set<string>();
      const stack = [newDependency.toId];

      while (stack.length > 0) {
          const currentId = stack.pop()!;
          
          // 如果某條路徑走回了起點 (fromId)，就代表出現了 Cycle
          if (currentId === newDependency.fromId) {
              return true;
          }

          if (!visited.has(currentId)) {
              visited.add(currentId);
              const neighbors = adjList[currentId] || [];
              for (const next of neighbors) {
                  stack.push(next);
              }
          }
      }
      
      return false;
  },

  addDependency: (dep) => {
      // 確保有 id
      const finalDep = { ...dep, id: dep.id || `dep_${Date.now()}` };
      if (get()._hasCycle(finalDep)) {
          alert('排程防呆機制：此依賴關係將造成「邏輯死結（循環依賴）」，系統已攔截此操作。');
          return;
      }
      set(state => ({ dependencies: [...state.dependencies, finalDep] }));

      // 非同步寫入 Firestore 
      const state = get();
      const node = state.nodes[finalDep.fromId];
      if (node && node.workspaceId && node.boardId) {
          dependencyService.create(node.workspaceId, node.boardId, finalDep).catch(console.error);
      }

      useUndoStore.getState().pushUndo({
          label: '新增連線',
          undo: () => get().removeDependency(finalDep.id),
          redo: () => get().addDependency(finalDep),
      });
  },

  removeDependency: (depId) => {
      const state = get();
      const dep = state.dependencies.find(d => d.id === depId);
      if (!dep) return;

      set(s => ({ dependencies: s.dependencies.filter(d => d.id !== depId) }));

      const node = state.nodes[dep.fromId];
      if (node && node.workspaceId && node.boardId) {
          dependencyService.delete(node.workspaceId, node.boardId, depId).catch(console.error);
      }

      useUndoStore.getState().pushUndo({
          label: '刪除連線',
          undo: () => get().addDependency(dep),
          redo: () => get().removeDependency(depId),
      });
  },

  updateDependency: (depId, updates) => {
      const state = get();
      const dep = state.dependencies.find(d => d.id === depId);
      if (!dep) return;

      const newDep = { ...dep, ...updates };

      if (get()._hasCycle(newDep)) {
          alert('排程防呆機制：變更此依賴關係將造成「邏輯死結（循環依賴）」，系統已攔截此操作。');
          return;
      }

      set(s => ({
          dependencies: s.dependencies.map(d => d.id === depId ? newDep : d)
      }));

      const node = state.nodes[newDep.fromId];
      if (node && node.workspaceId && node.boardId) {
          dependencyService.update(node.workspaceId, node.boardId, depId, updates).catch(console.error);
      }

      // 計算 oldValues
      const oldValues: Partial<Dependency> = {};
      for (const k of Object.keys(updates) as Array<keyof Dependency>) {
          (oldValues as any)[k] = dep[k];
      }

      useUndoStore.getState().pushUndo({
          label: '修改連線',
          undo: () => get().updateDependency(depId, oldValues),
          redo: () => get().updateDependency(depId, updates),
      });
  },

  // ===== Import / Export =====
  exportData: () => {
      const { nodes, dependencies } = get();
      const workspaces = useBoardStore.getState().workspaces;
      const exportObj = {
          version: 'wbs-1.1',
          nodes,
          dependencies,
          workspaces,
          timestamp: Date.now()
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `ProJED_WBS_Backup_${dayjs().format('YYYYMMDD_HHmmss')}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  },

  importData: (jsonDataStr: string) => {
      try {
          const parsed = JSON.parse(jsonDataStr);
          
          // 支援各種舊版與新版格式
          const oldWorkspaces = parsed.workspaces || parsed?.state?.workspaces;

          if ((parsed.version === 'wbs-1.1' || parsed.version === 'wbs-1.0' || parsed.version === '2.0' || !parsed.version) && (parsed.nodes || oldWorkspaces)) {
              
              // 1. 如果包含 workspaces，覆寫 useBoardStore 並同步至雲端
              if (oldWorkspaces && Array.isArray(oldWorkspaces)) {
                  // 乾淨的 workspaces (不含 lists/cards/dependencies)
                  const cleanWorkspaces = oldWorkspaces.map((ws: any) => ({
                      ...ws,
                      boards: (ws.boards || []).map((b: any) => {
                          const { lists, dependencies, ...cleanBoard } = b;
                          return cleanBoard;
                      })
                  }));
                  
                  // 寫入到本地端 Store
                  useBoardStore.setState({ workspaces: cleanWorkspaces });
                  
                  // 同步到 Firestore
                  cleanWorkspaces.forEach(ws => {
                      if (!ws.id) return;
                      workspaceService.restore(ws).catch(console.error);
                      
                      (ws.boards || []).forEach((b: any) => {
                          if (!b.id) return;
                          boardService.restore(ws.id, b).catch(console.error);
                      });
                  });
              }

              // 2. 如果包含 WBS nodes (wbs-1.0 或 wbs-1.1 格式)，直接匯入
              if (parsed.nodes) {
                  const nodesArray = Object.values(parsed.nodes) as TaskNode[];
                  get().setNodes(nodesArray);
                  nodesArray.forEach(n => {
                      if (n.workspaceId && n.boardId) {
                          nodeService.create(n.workspaceId, n.boardId, n).catch(console.error);
                      }
                  });
              }

              // 3. 如果只有舊版格式 (未搬遷至 wbs 節點)，需要自動升級轉移
              if (!parsed.nodes && oldWorkspaces) {
                  const newNodes: TaskNode[] = [];
                  oldWorkspaces.forEach((ws: any) => {
                      const wsId = ws.id;
                      (ws.boards || []).forEach((board: any) => {
                          const bId = board.id;
                          
                          (board.lists || []).forEach((list: any, listIndex: number) => {
                              const listNodeId = `list_${list.id}`;
                              newNodes.push({
                                  id: listNodeId,
                                  workspaceId: wsId,
                                  boardId: bId,
                                  parentId: null,
                                  title: list.title || '無標題列表',
                                  status: list.status || 'todo',
                                  nodeType: 'group',
                                  order: list.order !== undefined ? list.order : listIndex,
                                  createdAt: list.createdAt || Date.now(),
                                  updatedAt: Date.now()
                              } as TaskNode);
                              
                              (list.cards || []).forEach((card: any, cardIndex: number) => {
                                  const cardNodeId = `card_${card.id}`;
                                  newNodes.push({
                                      id: cardNodeId,
                                      workspaceId: wsId,
                                      boardId: bId,
                                      parentId: listNodeId,
                                      title: card.title || '無標題卡片',
                                      description: card.notes || '',
                                      status: card.status || 'todo',
                                      startDate: card.startDate || '',
                                      endDate: card.endDate || '',
                                      nodeType: 'task',
                                      kanbanStageId: list.id,
                                      order: card.order !== undefined ? card.order : cardIndex,
                                      createdAt: card.createdAt || Date.now(),
                                      updatedAt: Date.now()
                                  } as TaskNode);

                                  (card.checklists || []).forEach((cl: any) => {
                                      (cl.items || []).forEach((cli: any, cliIndex: number) => {
                                          newNodes.push({
                                              id: `cli_${card.id}_${cli.id}`,
                                              workspaceId: wsId,
                                              boardId: bId,
                                              parentId: cardNodeId,
                                              title: cli.title || cli.text || '',
                                              status: (cli.status || (cli.completed ? 'completed' : 'todo')),
                                              startDate: cli.startDate || '',
                                              endDate: cli.endDate || '',
                                              nodeType: 'task',
                                              order: cliIndex,
                                              createdAt: Date.now(),
                                              updatedAt: Date.now()
                                          } as TaskNode);
                                      });
                                  });
                              });
                          });
                      });
                  });

                  get().setNodes(newNodes);
                  newNodes.forEach(n => {
                     if (n.workspaceId && n.boardId) {
                         nodeService.create(n.workspaceId, n.boardId, n).catch(console.error);
                     }
                  });
              }

              // 4. Dependencies
              if (parsed.dependencies && Array.isArray(parsed.dependencies)) {
                  set({ dependencies: parsed.dependencies });
                  // Firestore write for dependencies? Usually handled dynamically or kept locally
              }

              alert('ProJED 資料已成功匯入並同步至雲端！');
              return;
          }

          alert('無效的備份檔案格式。只接受 wbs-1.0 或 2.0 JSON 格式。');
      } catch (e) {
          console.error('Import error:', e);
          alert('解析備份檔案時發生錯誤。');
      }
  }

}));
