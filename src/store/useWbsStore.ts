import { create } from 'zustand';
import dayjs from 'dayjs';
import type { TaskNode, KanbanViewConfig, TaskStatus, Dependency } from '../types';
import { nodeService, dependencyService, workspaceService, boardService } from '../services/dataBackend';
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
  _hasCycle: (newDependency: Dependency, ignoreDepId?: string) => boolean;
  _applyDependencySchedule: (changedNodeId: string, source?: 'node' | 'dependency') => void;

  /**
   * 計算所有依賴的標籤 Map（排序穩定）
   * 設計意圖：統一標籤算法，確保 ListView 與 GanttView 顯示一致的字母標籤
   */
  getDependencyMarkers: () => Record<string, Array<{ id: string; label: string; role: 'active' | 'passive'; isSelf?: boolean; offset?: number }>>;

  /**
   * 取得節點的日期鎖定狀態（是否被依賴關係鎖定）
   * 設計意圖：只有「被動跟隨端」(toId) 的日期才被鎖定，主動驅動端不鎖定
   */
  getNodeLockStatus: (nodeId: string, customDeps?: Dependency[]) => { startLocked: boolean; endLocked: boolean; moveLocked: boolean };

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


const shouldMarkDelayed = (node: TaskNode): boolean => {
  if (node.isArchived || !node.endDate || node.status === 'completed' || node.status === 'unsure') return false;
  return dayjs(node.endDate).isValid() && dayjs(node.endDate).isBefore(dayjs(), 'day');
};

const applySmartStatus = (node: TaskNode): TaskNode => {
  if (!shouldMarkDelayed(node)) return node;
  return { ...node, status: 'delayed' };
};

const normalizeSmartStatusUpdates = (
  oldNode: TaskNode,
  updates: Partial<TaskNode>
): Partial<TaskNode> => {
  const candidate = { ...oldNode, ...updates };
  if (!shouldMarkDelayed(candidate)) return updates;
  return { ...updates, status: 'delayed' };
};

const createDependencyId = () =>
  `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 依賴標籤生成器（a, b, c, ..., aa, ab...）
 * 設計意圖：提供穩定、一致的字母標籤，作為模組級共用函式
 */
const getDependencyLabelHelper = (index: number): string => {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(97 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

const getNodeDate = (node: TaskNode | undefined, side: Dependency['fromSide']) =>
  side === 'start' ? node?.startDate : node?.endDate;

const getDateShift = (fromDate: string | undefined, toDate: string | undefined) => {
  if (!fromDate || !toDate || !dayjs(fromDate).isValid() || !dayjs(toDate).isValid()) return 0;
  return dayjs(toDate).diff(dayjs(fromDate), 'day');
};

const hasIncomingDateDependency = (
  dependencies: Dependency[],
  nodeId: string,
  side: Dependency['toSide'],
  exceptDepId?: string
) =>
  dependencies.some(dep =>
    dep.id !== exceptDepId &&
    dep.toId === nodeId &&
    dep.toSide === side
  );

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
      const normalizedNode = applySmartStatus(node);
      acc[normalizedNode.id] = normalizedNode;

      if (normalizedNode.status !== node.status && normalizedNode.workspaceId && normalizedNode.boardId) {
        nodeService.update(normalizedNode.workspaceId, normalizedNode.boardId, normalizedNode.id, {
          status: normalizedNode.status,
        }).catch(console.error);
      }

      return acc;
    }, {} as Record<string, TaskNode>);

    set({ nodes: nodesRecord });
    get()._buildIndices(nodesRecord);
  },

  addNode: (node) => {
    const state = get();
    const normalizedNode = applySmartStatus(node);
    // 使用 Immutable 更新 nodes
    const updatedNodes = { ...state.nodes, [normalizedNode.id]: normalizedNode };
    set({ nodes: updatedNodes });
    get()._buildIndices(updatedNodes);

    // 同步寫入 Firestore
    if (normalizedNode.workspaceId && normalizedNode.boardId) {
        nodeService.create(normalizedNode.workspaceId, normalizedNode.boardId, normalizedNode).catch(console.error);
    }

    // 紀錄上一步
    useUndoStore.getState().pushUndo({
        label: '新增任務',
        undo: () => get().removeNode(normalizedNode.id),
        redo: () => get().addNode(normalizedNode),
    });
  },

  updateNode: (id, updates) => {
    const state = get();
    if (!state.nodes[id]) return;

    const oldNode = state.nodes[id];
    const normalizedUpdates = normalizeSmartStatusUpdates(oldNode, updates);

    // 比對實質變更，供 undo 使用
    const oldValues: Partial<TaskNode> = {};
    let hasChanges = false;
    for (const key of Object.keys(normalizedUpdates) as Array<keyof TaskNode>) {
        if (normalizedUpdates[key] !== oldNode[key]) {
            (oldValues as any)[key] = oldNode[key];
            hasChanges = true;
        }
    }
    if (!hasChanges) return;

    const newNode = { ...oldNode, ...normalizedUpdates, updatedAt: Date.now() };
    const updatedNodes = { ...state.nodes, [id]: newNode };
    
    set({ nodes: updatedNodes });

    // 同步更新索引
    if (
        ('parentId' in normalizedUpdates && normalizedUpdates.parentId !== oldNode.parentId) || 
        ('isArchived' in normalizedUpdates && normalizedUpdates.isArchived !== oldNode.isArchived) ||
        ('boardId' in normalizedUpdates && normalizedUpdates.boardId !== oldNode.boardId) ||
        ('order' in normalizedUpdates && normalizedUpdates.order !== oldNode.order)
    ) {
        get()._buildIndices(updatedNodes);
    }

    // 若狀態改變，觸發 Roll-up
    if ('status' in normalizedUpdates && normalizedUpdates.status !== oldNode.status) {
        // 同步執行，確保父節點狀態可以立即在目前的 Render Cycle 被更新
        get().recalculateAncestorStatus(id);
    }

    // 非同步寫入 Firestore
    if (newNode.workspaceId && newNode.boardId) {
        nodeService.update(newNode.workspaceId, newNode.boardId, id, normalizedUpdates).catch(console.error);
    }

    if (
        ('startDate' in normalizedUpdates && normalizedUpdates.startDate !== oldNode.startDate) ||
        ('endDate' in normalizedUpdates && normalizedUpdates.endDate !== oldNode.endDate)
    ) {
        get()._applyDependencySchedule(id, 'node');
    }

    // 紀錄上一步
    const label = normalizedUpdates.isArchived === true ? '刪除任務' :
                  normalizedUpdates.isArchived === false ? '復原任務' : '修改任務';
    useUndoStore.getState().pushUndo({
        label,
        undo: () => get().updateNode(id, oldValues),
        redo: () => get().updateNode(id, normalizedUpdates),
    });
  },

  removeNode: (id) => {
    // B3 修復：先清理所有關聯的孤兒依賴，再軟刪除
    // 設計意圖：避免被刪除節點的依賴殘留，導致 _applyDependencySchedule 嘗試推動已封存節點
    const state = get();
    const orphanDeps = state.dependencies.filter(
      dep => dep.fromId === id || dep.toId === id
    );
    orphanDeps.forEach(dep => get().removeDependency(dep.id));
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

      const normalizedParent = applySmartStatus({ ...parentNode, status: newStatus });

      if (normalizedParent.status !== parentNode.status) {
        updatedNodes[currentParentId] = { ...parentNode, status: normalizedParent.status, updatedAt: Date.now() };
        hasChanges = true;
      }
      
      currentParentId = parentNode.parentId as string;
    }

    if (hasChanges) {
      set({ nodes: updatedNodes });
    }
  },

  // ===== 依賴關係排程 (Dependencies & Cycle Detection) =====

  _hasCycle: (newDependency, ignoreDepId) => {
      const state = get();
      const allDeps = [
          ...state.dependencies.filter(dep => dep.id !== ignoreDepId && dep.id !== newDependency.id),
          newDependency
      ];
      
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
      const finalDep = { ...dep, id: dep.id || createDependencyId() };
      if (get()._hasCycle(finalDep)) {
          alert('排程防呆機制：此依賴關係將造成「邏輯死結（循環依賴）」，系統已攔截此操作。');
          return;
      }
      set(state => ({ dependencies: [...state.dependencies, finalDep] }));
      get()._applyDependencySchedule(finalDep.fromId, 'dependency');

      // 非同步寫入 Firestore 
      const state = get();
      const node = state.nodes[finalDep.fromId];
      if (node && node.workspaceId && node.boardId) {
          dependencyService.set(node.workspaceId, node.boardId, finalDep).catch(console.error);
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

      if (get()._hasCycle(newDep, depId)) {
          alert('排程防呆機制：變更此依賴關係將造成「邏輯死結（循環依賴）」，系統已攔截此操作。');
          return;
      }

      set(s => ({
          dependencies: s.dependencies.map(d => d.id === depId ? newDep : d)
      }));
      get()._applyDependencySchedule(newDep.fromId, 'dependency');

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

  _applyDependencySchedule: (changedNodeId, _source = 'node') => {
      const state = get();

      // B1 修復：改用 BFS 展開，只收集真正涉及 changedNodeId 的依賴鏈
      // 設計意圖：從 changedNodeId 出發，沿「fromId → toId」方向 BFS 展開，
      // 確保只重算受影響的下游任務，避免舊版條件 (|| state.nodes[...]) 幾乎恆為 truthy 的效能問題
      const visitedNodes = new Set<string>();
      const queue = [changedNodeId];
      const relevantDeps: Dependency[] = [];

      while (queue.length > 0) {
          const currentId = queue.shift()!;
          if (visitedNodes.has(currentId)) continue;
          visitedNodes.add(currentId);

          for (const dep of state.dependencies) {
              if (dep.fromId === currentId && !relevantDeps.includes(dep)) {
                  relevantDeps.push(dep);
                  queue.push(dep.toId); // 繼續向下展開
              }
          }
      }

      if (relevantDeps.length === 0) return;

      let nextNodes = { ...state.nodes };
      const changed: Record<string, Partial<TaskNode>> = {};
      const maxPasses = Math.max(relevantDeps.length * 2, 1);

      for (let pass = 0; pass < maxPasses; pass++) {
          let changedInPass = false;

          for (const dep of relevantDeps) {
              const fromNode = nextNodes[dep.fromId];
              const toNode = nextNodes[dep.toId];
              const fromDate = getNodeDate(fromNode, dep.fromSide);

              if (!fromNode || !toNode || !fromDate || !dayjs(fromDate).isValid()) continue;

              const nextDate = dayjs(fromDate).add(dep.offset ?? 0, 'day').format('YYYY-MM-DD');
              const currentDate = getNodeDate(toNode, dep.toSide);
              if (currentDate === nextDate) continue;

              const nodeUpdates: Partial<TaskNode> = {
                  [dep.toSide === 'start' ? 'startDate' : 'endDate']: nextDate,
                  updatedAt: Date.now(),
              };

              if (currentDate && dayjs(currentDate).isValid()) {
                  const deltaDays = getDateShift(currentDate, nextDate);

                  // 只有當工期被鎖定時，才同步平移另一側的日期（維持工期長度）
                  if (toNode.isDurationLocked) {
                      if (
                          dep.toSide === 'start' &&
                          toNode.endDate &&
                          !hasIncomingDateDependency(state.dependencies, toNode.id, 'end', dep.id)
                      ) {
                          nodeUpdates.endDate = dayjs(toNode.endDate).add(deltaDays, 'day').format('YYYY-MM-DD');
                      }

                      if (
                          dep.toSide === 'end' &&
                          toNode.startDate &&
                          !hasIncomingDateDependency(state.dependencies, toNode.id, 'start', dep.id)
                      ) {
                          nodeUpdates.startDate = dayjs(toNode.startDate).add(deltaDays, 'day').format('YYYY-MM-DD');
                      }
                  }
              }

              const finalStart = nodeUpdates.startDate ?? toNode.startDate;
              const finalEnd = nodeUpdates.endDate ?? toNode.endDate;
              if (finalStart && finalEnd && dayjs(finalStart).isAfter(dayjs(finalEnd), 'day')) {
                  if (dep.toSide === 'start') {
                      nodeUpdates.endDate = finalStart;
                  } else {
                      nodeUpdates.startDate = finalEnd;
                  }
              }

              const scheduledNode = applySmartStatus({ ...toNode, ...nodeUpdates });
              const persistedUpdates: Partial<TaskNode> = { ...nodeUpdates };
              if (scheduledNode.status !== toNode.status) {
                  persistedUpdates.status = scheduledNode.status;
              }

              nextNodes = { ...nextNodes, [toNode.id]: scheduledNode };
              changed[toNode.id] = {
                  ...(changed[toNode.id] || {}),
                  ...persistedUpdates,
              };
              changedInPass = true;
          }

          if (!changedInPass) break;
      }

      const updates = Object.entries(changed)
          .map(([id, data]) => ({ id, data }))
          .filter(({ data }) => Object.keys(data).some(key => (data as any)[key] !== undefined));

      if (updates.length === 0) return;

      set({ nodes: nextNodes });

      // B2 修復：按 (workspaceId, boardId) 分組後各別 batchUpdate
      // 設計意圖：避免跨板依賴時，只用第一個節點的座標而導致其他板的 Firestore 更新靜默失敗
      const groups: Record<string, typeof updates> = {};
      for (const u of updates) {
          const n = nextNodes[u.id];
          if (!n?.workspaceId || !n?.boardId) continue;
          const key = `${n.workspaceId}|${n.boardId}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(u);
      }
      for (const [key, batch] of Object.entries(groups)) {
          const [wsId, bId] = key.split('|');
          nodeService.batchUpdate(wsId, bId, batch).catch(console.error);
      }
  },

  // ===== 共用 Getter（跨視圖一致性） =====

  getDependencyMarkers: () => {
      const { dependencies } = get();
      const markers: Record<string, Array<{ id: string; label: string; role: 'active' | 'passive'; isSelf?: boolean; offset?: number }>> = {};

      // 設計意圖：按 id 字典序排序，確保 ListView 與 GanttView 顯示的字母標籤完全一致
      const sortedDeps = [...dependencies].sort((a, b) => a.id.localeCompare(b.id));

      sortedDeps.forEach((dep, index) => {
          const label = getDependencyLabelHelper(index);
          const isSelf = dep.fromId === dep.toId;

          const fromKey = `${dep.fromId}_${dep.fromSide}`;
          if (!markers[fromKey]) markers[fromKey] = [];
          markers[fromKey].push({ id: dep.id, label, role: 'active', isSelf, offset: dep.offset });

          const toKey = `${dep.toId}_${dep.toSide}`;
          if (!markers[toKey]) markers[toKey] = [];
          markers[toKey].push({ id: dep.id, label, role: 'passive', isSelf, offset: dep.offset });
      });

      return markers;
  },

  getNodeLockStatus: (nodeId, customDeps) => {
      const dependencies = customDeps || get().dependencies;
      let startLocked = false;
      let endLocked = false;

      // 設計意圖：只有當節點是「被動跟隨端」(toId) 時，其日期才被鎖定；
      // 主動驅動端 (fromId) 不應鎖定，使用者可主動調整驅動日期
      for (const dep of dependencies) {
          if (dep.toId === nodeId && dep.fromId !== nodeId) {
              if (dep.toSide === 'start' || !dep.toSide) startLocked = true;
              if (dep.toSide === 'end') endLocked = true;
          }
          if (dep.toId === nodeId && dep.fromId === nodeId) {
              if (dep.fromSide === 'start' && dep.toSide === 'end') endLocked = true;
              if (dep.fromSide === 'end' && dep.toSide === 'start') startLocked = true;
          }
      }

      return {
          startLocked,
          endLocked,
          moveLocked: startLocked || endLocked,
      };
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

  importData: async (jsonDataStr: string) => {
      try {
          const parsed = JSON.parse(jsonDataStr);
          
          // 支援各種舊版與新版格式
          const oldWorkspaces = parsed.workspaces || parsed?.state?.workspaces;

          if ((parsed.version === 'wbs-1.1' || parsed.version === 'wbs-1.0' || parsed.version === '2.0' || !parsed.version) && (parsed.nodes || oldWorkspaces)) {
              // 取得目前 Supabase 中的 workspace/board 作為匯入目標
              const boardStore = useBoardStore.getState();
              const currentWsId = boardStore.activeWorkspaceId;
              const currentBoardId = boardStore.activeBoardId;
              if (!currentWsId || !currentBoardId) {
                  alert('請先選擇一個看板，再進行匯入操作。');
                  return;
              }

              alert('開始匯入並同步至雲端，請稍候...(資料量較大時可能需要數十秒，請勿關閉或重整網頁)');

              if (false) {
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
                  
                  // 同步到雲端 (restore = upsert)
                  cleanWorkspaces.forEach(ws => {
                      if (!ws.id) return;
                      workspaceService.restore(ws).catch(console.error);
                      
                      (ws.boards || []).forEach((b: any) => {
                          if (!b.id) return;
                          boardService.restore(ws.id, b).catch(console.error);
                      });
                  });
              }

              // 2. 如果包含 WBS nodes (wbs-1.0 或 wbs-1.1 格式)，將所有節點重新指向當前看板
              if (parsed.nodes) {
                  const nodesArray = (Object.values(parsed.nodes) as TaskNode[]).map(n => ({
                      ...n,
                      workspaceId: currentWsId,
                      boardId: currentBoardId,
                  }));
                  get().setNodes(nodesArray);
                  await nodeService.replaceAllByProject(currentWsId, currentBoardId, nodesArray).catch(console.error);
              }

              // 3. 如果只有舊版格式 (未搬遷至 wbs 節點)，需要自動升級轉移
              if (!parsed.nodes && oldWorkspaces) {
                  const newNodes: TaskNode[] = [];
                  oldWorkspaces.forEach((ws: any) => {
                      (ws.boards || []).forEach((board: any) => {

                          
                          (board.lists || []).forEach((list: any, listIndex: number) => {
                              const listNodeId = `list_${list.id}`;
                              newNodes.push({
                                  id: listNodeId,
                                  workspaceId: currentWsId,
                                  boardId: currentBoardId,
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
                                      workspaceId: currentWsId,
                                      boardId: currentBoardId,
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
                                              workspaceId: currentWsId,
                                              boardId: currentBoardId,
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
                  await nodeService.replaceAllByProject(currentWsId, currentBoardId, newNodes).catch(console.error);
              }

              // 4. Dependencies
              if (parsed.dependencies && Array.isArray(parsed.dependencies)) {
                  set({ dependencies: parsed.dependencies });
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
