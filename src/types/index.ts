/**
 * ProJED 核心型別定義
 * 設計意圖：集中管理所有資料模型的介面定義，
 * 作為 TypeScript 遷移的「型別基礎設施」。
 *
 * 資料層級：Workspace → Board → List → Card → Checklist → ChecklistItem
 * 附屬結構：Dependency（任務間的依賴關係）
 */

// ===== 狀態枚舉 =====

/** 任務狀態 — 簡化為核心流程 */
export type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';

/** 依賴連接點 — 任務的起始端或結束端 */
export type DependencySide = 'start' | 'end';

/** 檢視模式 */
export type ViewMode = 'home' | 'list' | 'board' | 'gantt' | 'calendar' | 'recycle_bin';

/** 對話框類型 */
export type DialogType = 'confirm' | 'prompt';

/** 甘特圖拖曳類型 */
export type DragType = 'move' | 'left' | 'right';

/** 可編輯項目的類型標識 (相容舊版，逐漸淘汰) */
export type EditableItemType = 'list' | 'card' | 'checklist' | 'checklistitem' | 'tasknode';

// ===== 新版 WBS 資料模型 (Adjacency List) =====

/**
 * 統一的任務節點 (WBS 結構基礎)
 * 設計意圖：廢除原本 List/Card 剛性結構，改為無限層級的樹狀結構。
 */
export interface TaskNode {
  id: string;              // 唯一識別碼
  workspaceId: string;     // 所屬工作區
  boardId: string;         // 所屬專案(看板) - 保留 Board 作為最大容器

  /**
   * 核心：Adjacency List 父節點參考
   * 若為最頂層節點（原先的 List/Group），parentId 為 null 或對應的 boardId。
   */
  parentId: string | null;  

  title: string;
  description?: string;     // 取代舊的 notes
  status: TaskStatus;
  
  // 日期排程 (可選)
  startDate?: string;
  endDate?: string;

  // 用於展示層的自訂屬性 (群組/里程碑/一般任務)
  nodeType?: 'group' | 'milestone' | 'task';

  // Kanban 視圖專用的動態屬性 (分離資料與視圖)
  // 此屬性記錄該任務在 Kanban 視圖下屬於哪個直行
  kanbanStageId?: string; 
  
  order: number;            // 同級兄弟節點間的排序權重
  
  createdAt?: number;
  updatedAt?: number;
  isArchived?: boolean;
}

/** 
 * Kanban 視圖定義
 * 將視圖設定獨立於任務資料之外，使得同一個任務樹可以有多種 Kanban 投影
 */
export interface KanbanViewConfig {
    id: string;
    boardId: string;
    stages: Array<{
        id: string;
        name: string;
        order: number;
    }>;
}

// ===== 棄用警告: 舊版資料模型 (用於遷移期過渡) =====

/** @deprecated 等待轉換至 TaskNode */
export interface ChecklistItem {
  id: string;
  title: string;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated 等待轉換至 TaskNode */
export interface Checklist {
  id: string;
  title: string;
  showCompleted: boolean;
  items: ChecklistItem[];
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated 等待轉換至 TaskNode */
export interface Card {
  id: string;
  title: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  checklists: Checklist[];
  ganttVisible: boolean;
  listId?: string;
  order?: number;
  createdAt?: number;
  isArchived?: boolean;
  archivedAt?: number;
}

/** @deprecated 等待轉換至 TaskNode */
export interface List {
  id: string;
  title: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  cards: Card[];
  ganttVisible: boolean;
  order?: number;
  createdAt?: number;
  isArchived?: boolean;
  archivedAt?: number;
}

/** 依賴關係（連接兩個任務的排程約束） */
export interface Dependency {
  id: string;
  fromId: string;
  fromSide: DependencySide;
  toId: string;
  toSide: DependencySide;
  offset?: number; // 天數偏移
}

/** 看板（專案單位） */
export interface Board {
  id: string;
  title: string;
  lists: List[];
  dependencies: Dependency[];
  order?: number;
  createdAt?: number;
}

/** 工作區（最上層容器） */
export interface Workspace {
  id: string;
  title: string;
  boards: Board[];
  ownerId?: string;
  members?: string[];
  order?: number;
  createdAt?: number;
}

// ===== 認證與使用者 =====

export interface FirestoreUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt?: number;
}

export interface AuthState {
  user: FirestoreUser | null;
  loading: boolean;
  error: string | null;
}

export interface AuthActions {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

// ===== 正在編輯的項目 =====

/** 正在編輯中的項目元資料（用於 Modal 開啟） */
export interface EditingItem {
  type: EditableItemType;
  itemId: string;
  listId: string;
  boardId: string;
  workspaceId: string;
  [key: string]: unknown; // 其他附加屬性（如 cardId, checklistId）
}

// ===== 狀態過濾器 =====

/** 甘特圖 / 月曆的狀態過濾器 */
export type StatusFilters = Record<TaskStatus, boolean>;

// ===== Store 型別 =====

/** Board Store 的狀態部分（不含 actions） */
export interface BoardState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeBoardId: string | null;
  currentView: ViewMode;
  isSidebarOpen: boolean;
  editingItem: EditingItem | null;
  statusFilters: StatusFilters;
}

/** Board Store 的 Action 方法 */
export interface BoardActions {
  // 基本 setters
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (id: string) => void;
  setActiveBoard: (id: string) => void;
  setView: (view: ViewMode) => void;
  setSidebarOpen: (isOpen: boolean) => void;

  // Workspace CRUD
  addWorkspace: (title?: string) => void;
  removeWorkspace: (wsId: string) => void;

  // Board CRUD
  addBoard: (workspaceId: string, boardName: string) => void;
  removeBoard: (wsId: string, bId: string) => void;
  updateBoardTitle: (workspaceId: string, boardId: string, newTitle: string) => void;
  switchBoard: (workspaceId: string, boardId: string) => void;

  // 列表/卡片 CRUD
  addList: (wsId: string, bId: string, title: string) => void;
  updateList: (wsId: string, bId: string, lId: string, updates: Partial<List>) => void;
  removeList: (wsId: string, bId: string, lId: string) => void; // 改為移至垃圾桶 (軟刪除)
  restoreList: (wsId: string, bId: string, lId: string) => void;
  permanentDeleteList: (wsId: string, bId: string, lId: string) => void;

  addCard: (wsId: string, bId: string, lId: string, title: string) => void;
  updateCard: (wsId: string, bId: string, lId: string, cId: string, updates: Partial<Card>) => void;
  removeCard: (wsId: string, bId: string, lId: string, cId: string) => void; // 改為移至垃圾桶 (軟刪除)
  restoreCard: (wsId: string, bId: string, lId: string, cId: string) => void;
  permanentDeleteCard: (wsId: string, bId: string, lId: string, cId: string) => void;

  // Checklist CRUD
  addChecklist: (wsId: string, bId: string, lId: string, cId: string) => void;
  removeChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;
  updateChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string, updates: Partial<Checklist>) => void;
  restoreChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;
  permanentDeleteChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;

  // ChecklistItem CRUD
  addChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;
  removeChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => void;
  updateChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string, updates: Partial<ChecklistItem>) => void;
  restoreChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => void;
  permanentDeleteChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => void;

  // 拖曳排序
  reorderLists: (workspaceId: string, boardId: string, activeId: string, overId: string) => void;
  reorderChecklistItems: (wsId: string, bId: string, listId: string, cardId: string, checklistId: string, activeId: string, overId: string) => void;
  moveCardToList: (wsId: string, bId: string, cardId: string, sourceListId: string, targetListId: string, targetIndex?: number | null) => void;
  moveChecklistItemToCard: (wsId: string, bId: string, itemId: string, sourceListId: string, sourceCardId: string, sourceChecklistId: string, targetListId: string, targetCardId: string, targetIndex?: number | null) => void;
  reorderCardsInList: (wsId: string, bId: string, listId: string, activeId: string, overId: string) => void;

  // 依賴管理
  addDependency: (wsId: string, bId: string, dependency: Omit<Dependency, 'id'>) => void;
  removeDependency: (wsId: string, bId: string, depId: string) => void;
  updateDependency: (wsId: string, bId: string, depId: string, updates: Partial<Dependency>) => void;
  fixBoardDependencies: (wsId: string, bId: string) => void;
  cleanBoardDependencies: (wsId: string, bId: string) => void;

  // 時間與篩選操作
  updateTaskDate: (
    wsId: string, bId: string,
    taskType: 'list' | 'card' | 'checklist',
    taskId: string,
    updates: { startDate?: string; endDate?: string },
    listId?: string | null, cardId?: string | null, checklistId?: string | null,
    dragType?: 'move' | 'resize'
  ) => void;

  // Derived getters
  getActiveBoard: () => Board | undefined;
  getActiveWorkspace: () => Workspace | undefined;

  // UI Actions
  showHome: () => void;
  openModal: (type: EditableItemType, itemId: string, listId: string, extra?: Record<string, unknown>) => void;
  closeModal: () => void;
  toggleStatusFilter: (status: TaskStatus) => void;

  // 資料匯出/匯入
  exportData: () => void;
  importData: (jsonData: string | object) => Promise<void>;
}

/** Board Store 完整型別（State + Actions） */
export type BoardStore = BoardState & BoardActions;

// ===== Undo / Redo Store 型別 =====

/**
 * 可復原指令（Command Pattern）
 * 設計意圖：每次使用者執行可逆操作時建立一筆 UndoCommand，
 * 分別存放「如何撤銷」與「如何重做」的函式，
 * 由 useUndoStore 的堆疊統一管理。
 */
export interface UndoCommand {
  /** 顯示在 Tooltip 的操作描述，例如「修改卡片標題」 */
  label: string;
  /** 執行撤銷（上一步）的函式 */
  undo: () => void;
  /** 執行重做（下一步）的函式 */
  redo: () => void;
}

/** Undo Store 完整型別 */
export interface UndoStore {
  /** 可撤銷的操作堆疊（最新在尾端） */
  undoStack: UndoCommand[];
  /** 可重做的操作堆疊（最新在尾端） */
  redoStack: UndoCommand[];
  /** 推入一筆可復原指令（自動清空 redoStack） */
  pushUndo: (command: UndoCommand) => void;
  /** 執行上一步 */
  undo: () => void;
  /** 執行下一步 */
  redo: () => void;
  /** 清空所有堆疊（切換看板時呼叫） */
  clear: () => void;
  /** 是否可執行上一步 */
  canUndo: () => boolean;
  /** 是否可執行下一步 */
  canRedo: () => boolean;
}

// ===== Dialog Store 型別 =====

/** Dialog Store 的完整型別 */
export interface DialogStore {
  isOpen: boolean;
  type: DialogType;
  message: string;
  defaultValue: string;
  inputValue: string;
  resolvePromise: ((value: boolean | string | null) => void) | null;

  setInputValue: (val: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  closeDialog: (result: boolean | string | null) => void;
}

// ===== Cascade 計算用的輔助型別 =====

/** 帶型別標記的任務資訊（用於 cascade date 計算內部） */
export interface TaskWithType {
  id: string;
  type: EditableItemType;
  startDate?: string;
  endDate?: string;
  listId?: string;
  cardId?: string;
  checklistId?: string;
  [key: string]: unknown;
}

/** Cascade 計算的日期覆寫 Map */
export type OverriddenDates = Record<string, { startDate?: string; endDate?: string }>;

// ===== Google Calendar 同步 =====

/** Google Calendar 同步狀態 */
export interface CalendarSyncState {
  /** 是否已連接 Google Calendar（有有效 token） */
  isConnected: boolean;
  /** 是否正在同步中 */
  isSyncing: boolean;
  /** 最後成功同步的時間戳 */
  lastSyncAt: number | null;
  /** 最近一次錯誤訊息 */
  error: string | null;
}

/** 可同步至 Google Calendar 的扁平化項目 */
export interface SyncableItem {
  id: string;
  title: string;
  type: 'list' | 'card' | 'checklist';
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

/** Google Calendar 事件格式（對應 Google Calendar API v3） */
export interface GoogleCalendarEvent {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  colorId?: string;
  visibility?: 'default' | 'public' | 'private' | 'confidential';
}

/** 同步結果統計 */
export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}
