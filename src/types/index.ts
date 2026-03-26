/**
 * ProJED 核心型別定義
 * 設計意圖：集中管理所有資料模型的介面定義，
 * 作為 TypeScript 遷移的「型別基礎設施」。
 *
 * 資料層級：Workspace → Board → List → Card → Checklist → ChecklistItem
 * 附屬結構：Dependency（任務間的依賴關係）
 */

// ===== 狀態枚舉 =====

/** 任務狀態 — 適用於 List、Card、ChecklistItem */
export type TaskStatus = 'todo' | 'delayed' | 'completed' | 'unsure' | 'onhold';

/** 依賴連接點 — 任務的起始端或結束端 */
export type DependencySide = 'start' | 'end';

/** 檢視模式 */
export type ViewMode = 'home' | 'board' | 'gantt' | 'calendar';

/** 對話框類型 */
export type DialogType = 'confirm' | 'prompt';

/** 甘特圖拖曳類型 */
export type DragType = 'move' | 'left' | 'right';

/** 可編輯項目的類型標識 */
export type EditableItemType = 'list' | 'card' | 'checklist' | 'checklistitem';

// ===== 資料模型 =====

/** 待辦清單項目（最底層任務單元） */
export interface ChecklistItem {
  id: string;
  title: string;
  status: TaskStatus;
  startDate: string; // 'YYYY-MM-DD' 或空字串
  endDate: string;   // 'YYYY-MM-DD' 或空字串
}

/** 待辦清單（屬於 Card 的子集合） */
export interface Checklist {
  id: string;
  title: string;
  showCompleted: boolean;
  items: ChecklistItem[];
}

/** 卡片（任務單元，屬於 List 的子集合） */
export interface Card {
  id: string;
  title: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  checklists: Checklist[];
  ganttVisible: boolean;
  listId?: string; // 拖曳時用於標記所屬列表
}

/** 列表（任務群組，屬於 Board 的子集合） */
export interface List {
  id: string;
  title: string;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  cards: Card[];
  ganttVisible: boolean;
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
}

/** 工作區（最上層容器） */
export interface Workspace {
  id: string;
  title: string;
  boards: Board[];
}

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
  past: Workspace[][];
  future: Workspace[][];
}

/** Board Store 的 Action 方法 */
export interface BoardActions {
  // 歷史記錄
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;

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

  // List CRUD
  addList: (workspaceId: string, boardId: string, title?: string) => void;
  removeList: (wsId: string, bId: string, lId: string) => void;
  updateList: (wsId: string, bId: string, lId: string, updates: Partial<List>, noHistory?: boolean) => void;

  // Card CRUD
  addCard: (workspaceId: string, boardId: string, listId: string, title?: string) => void;
  removeCard: (wsId: string, bId: string, lId: string, cId: string) => void;
  updateCard: (wsId: string, bId: string, lId: string, cId: string, updates: Partial<Card>, noHistory?: boolean) => void;

  // Checklist CRUD
  addChecklist: (wsId: string, bId: string, lId: string, cId: string) => void;
  removeChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;
  updateChecklist: (wsId: string, bId: string, lId: string, cId: string, clId: string, updates: Partial<Checklist>) => void;

  // ChecklistItem CRUD
  addChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string) => void;
  removeChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string) => void;
  updateChecklistItem: (wsId: string, bId: string, lId: string, cId: string, clId: string, cliId: string, updates: Partial<ChecklistItem>, noHistory?: boolean) => void;

  // 拖曳排序
  reorderLists: (wsId: string, bId: string, activeId: string, overId: string) => void;
  reorderCardsInList: (wsId: string, bId: string, listId: string, activeId: string, overId: string) => void;
  reorderChecklistItems: (wsId: string, bId: string, listId: string, cardId: string, checklistId: string, activeId: string, overId: string) => void;
  moveCardToList: (wsId: string, bId: string, cardId: string, sourceListId: string, targetListId: string, targetIndex?: number | null) => void;
  moveChecklistItemToCard: (wsId: string, bId: string, itemId: string, sourceListId: string, sourceCardId: string, sourceChecklistId: string, targetListId: string, targetCardId: string, targetIndex?: number | null) => void;

  // 依賴管理
  addDependency: (wsId: string, bId: string, dependency: Omit<Dependency, 'id'>) => void;
  removeDependency: (wsId: string, bId: string, depId: string) => void;
  updateDependency: (wsId: string, bId: string, depId: string, updates: Partial<Dependency>) => void;
  fixBoardDependencies: (wsId: string, bId: string) => void;
  cleanBoardDependencies: (wsId: string, bId: string) => void;

  // 日期更新（甘特圖拖曳）
  updateTaskDate: (
    wsId: string, bId: string, taskType: EditableItemType, taskId: string,
    updates: { startDate?: string; endDate?: string },
    listId?: string | null, cardId?: string | null, checklistId?: string | null,
    noHistory?: boolean, originalDates?: { startDate?: string; endDate?: string } | null,
    dragType?: DragType
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
