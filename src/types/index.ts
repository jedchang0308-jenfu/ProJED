// Core scalar types
export type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';
export type DependencySide = 'start' | 'end';
export type ViewMode = 'home' | 'list' | 'board' | 'gantt' | 'calendar' | 'recycle_bin';
export type DialogType = 'confirm' | 'prompt';
export type DragType = 'move' | 'left' | 'right';
export type TagColor = 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue' | 'sky' | 'lime' | 'pink' | 'black' | 'gray';

// Kept for old deep links and modal state. New task editing should prefer TaskNode ids.
export type EditableItemType = 'list' | 'card' | 'checklist' | 'checklistitem' | 'tasknode';

// WBS data model: adjacency-list tree scoped to a board.
export interface TaskNode {
  id: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;

  title: string;
  detailNotes?: TaskDetailNote[];
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  collaboratorIds?: string[];
  tagIds?: string[];

  startDate?: string;
  endDate?: string;
  isDurationLocked?: boolean;

  nodeType?: 'group' | 'milestone' | 'task';

  // Optional compatibility metadata for board/kanban presentation only.
  kanbanStageId?: string;

  order: number;
  createdAt?: number;
  updatedAt?: number;
  isArchived?: boolean;
}

export interface TaskDetailNote {
  id: string;
  title: string;
  content: string;
}

export interface TaskTag {
  id: string;
  workspaceId: string;
  name: string;
  color: TagColor;
  order: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface KanbanViewConfig {
  id: string;
  boardId: string;
  stages: Array<{
    id: string;
    name: string;
    order: number;
  }>;
}

export interface Dependency {
  id: string;
  fromId: string;
  fromSide: DependencySide;
  toId: string;
  toSide: DependencySide;
  offset?: number;
}

export interface Board {
  id: string;
  title: string;
  /** @deprecated Dependencies are stored in useWbsStore / Firestore dependencies collection. */
  dependencies: Dependency[];
  order?: number;
  createdAt?: number;
}

export interface Workspace {
  id: string;
  title: string;
  boards: Board[];
  ownerId?: string;
  members?: string[];
  order?: number;
  createdAt?: number;
}

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

export interface EditingItem {
  type: EditableItemType;
  itemId: string;
  listId: string;
  boardId: string;
  workspaceId: string;
  [key: string]: unknown;
}

export type StatusFilters = Record<TaskStatus, boolean>;

export interface BoardState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeBoardId: string | null;
  currentView: ViewMode;
  isSidebarOpen: boolean;
  editingItem: EditingItem | null;
  statusFilters: StatusFilters;

  showDependencies: boolean;
  showStartDate: boolean;
  showTags: boolean;

  dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
  contextMenuState: { isOpen: boolean; x: number; y: number; nodeId: string; title: string } | null;
}

export interface BoardActions {
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (id: string) => void;
  setActiveBoard: (id: string) => void;
  setView: (view: ViewMode) => void;
  setSidebarOpen: (isOpen: boolean) => void;

  addWorkspace: (title?: string) => void;
  removeWorkspace: (wsId: string) => void;

  addBoard: (workspaceId: string, boardName: string) => void;
  removeBoard: (wsId: string, bId: string) => void;
  updateBoardTitle: (workspaceId: string, boardId: string, newTitle: string) => void;
  switchBoard: (workspaceId: string, boardId: string) => void;

  getActiveBoard: () => Board | undefined;
  getActiveWorkspace: () => Workspace | undefined;

  showHome: () => void;
  openModal: (type: EditableItemType, itemId: string, listId: string, extra?: Record<string, unknown>) => void;
  closeModal: () => void;
  toggleStatusFilter: (status: TaskStatus) => void;
  toggleDependencies: () => void;
  toggleStartDate: () => void;
  toggleTags: () => void;

  setDependencySelection: (state: { id: string; side: 'start' | 'end'; title: string } | null) => void;
  setContextMenuState: (state: { isOpen: boolean; x: number; y: number; nodeId: string; title: string } | null) => void;

  exportData: () => void;
  importData: (jsonData: string | object) => Promise<void>;
}

export type BoardStore = BoardState & BoardActions;

export interface UndoCommand {
  label: string;
  undo: () => void;
  redo: () => void;
}

export interface UndoStore {
  undoStack: UndoCommand[];
  redoStack: UndoCommand[];
  pushUndo: (command: UndoCommand) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

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

export type OverriddenDates = Record<string, { startDate?: string; endDate?: string }>;

export interface CalendarSyncState {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
}

export interface SyncableItem {
  id: string;
  title: string;
  type: NonNullable<TaskNode['nodeType']>;
  status: TaskStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface GoogleCalendarEvent {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  colorId?: string;
  visibility?: 'default' | 'public' | 'private' | 'confidential';
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}
