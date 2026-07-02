// Core scalar types
export type TaskStatus = 'todo' | 'in_progress' | 'delayed' | 'completed' | 'unsure' | 'onhold';
export type DependencySide = 'start' | 'end';
export type ViewMode = 'home' | 'task_zone' | 'list' | 'mindmap' | 'board' | 'gantt' | 'calendar' | 'records' | 'calendar_subscriptions' | 'settings' | 'recycle_bin';
export type DialogType = 'confirm' | 'prompt' | 'action';
export type DialogActionVariant = 'primary' | 'secondary' | 'danger';
export type DragType = 'move' | 'left' | 'right';
export type TagColor = 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue' | 'sky' | 'lime' | 'pink' | 'black' | 'gray';
export type CollaborationRole = 'owner' | 'admin' | 'project_manager' | 'member' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'suspended';
export type BoardInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type KnowledgeRecordType = 'meeting' | 'work_log';
export type KnowledgeRecordStatus = 'draft' | 'published' | 'archived';
export type KnowledgeRecordVisibility = 'private' | 'project' | 'tenant';
export type RecordTaskLinkRole = 'main' | 'related' | 'decision' | 'blocker' | 'follow_up';
export type InboxItemType = 'todo' | 'someday' | 'note';
export type InboxItemCaptureStatus = 'untriaged' | 'promoted' | 'completed' | 'archived';
export type InboxItemSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type CollaborationScope = 'workspace' | 'board';
export type PermissionCapability =
  | 'read_workspace'
  | 'manage_workspace_settings'
  | 'manage_workspace_members'
  | 'create_board'
  | 'delete_workspace'
  | 'read_board'
  | 'edit_board_settings'
  | 'move_board_between_workspaces'
  | 'manage_board_members'
  | 'create_task'
  | 'edit_task'
  | 'move_task'
  | 'delete_task'
  | 'assign_task'
  | 'create_dependency'
  | 'delete_dependency'
  | 'read_activity'
  | 'write_activity'
  | 'read_audit'
  | 'write_audit';

export const COLLABORATION_ROLES = ['owner', 'admin', 'project_manager', 'member', 'viewer'] as const satisfies readonly CollaborationRole[];

export const WORKSPACE_ROLE_CAPABILITIES = {
  owner: [
    'read_workspace',
    'manage_workspace_settings',
    'manage_workspace_members',
    'create_board',
    'delete_workspace',
    'read_activity',
    'read_audit',
    'write_audit',
  ],
  admin: [
    'read_workspace',
    'manage_workspace_settings',
    'manage_workspace_members',
    'create_board',
    'read_activity',
    'read_audit',
    'write_audit',
  ],
  project_manager: ['read_workspace', 'create_board', 'read_activity'],
  member: ['read_workspace', 'read_activity'],
  viewer: ['read_workspace', 'read_activity'],
} as const satisfies Record<CollaborationRole, readonly PermissionCapability[]>;

export const BOARD_ROLE_CAPABILITIES = {
  owner: [
    'read_board',
    'edit_board_settings',
    'move_board_between_workspaces',
    'manage_board_members',
    'create_task',
    'edit_task',
    'move_task',
    'delete_task',
    'assign_task',
    'create_dependency',
    'delete_dependency',
    'read_activity',
    'write_activity',
    'read_audit',
    'write_audit',
  ],
  admin: [
    'read_board',
    'edit_board_settings',
    'move_board_between_workspaces',
    'manage_board_members',
    'create_task',
    'edit_task',
    'move_task',
    'delete_task',
    'assign_task',
    'create_dependency',
    'delete_dependency',
    'read_activity',
    'write_activity',
    'read_audit',
    'write_audit',
  ],
  project_manager: [
    'read_board',
    'edit_board_settings',
    'move_board_between_workspaces',
    'manage_board_members',
    'create_task',
    'edit_task',
    'move_task',
    'delete_task',
    'assign_task',
    'create_dependency',
    'delete_dependency',
    'read_activity',
    'write_activity',
  ],
  member: [
    'read_board',
    'create_task',
    'edit_task',
    'move_task',
    'assign_task',
    'create_dependency',
    'read_activity',
    'write_activity',
  ],
  viewer: ['read_board', 'read_activity'],
} as const satisfies Record<CollaborationRole, readonly PermissionCapability[]>;

export type BoardRolePermissionMatrix = Record<CollaborationRole, PermissionCapability[]>;

export const BOARD_PERMISSION_CAPABILITIES: PermissionCapability[] = Array.from(
  new Set(COLLABORATION_ROLES.flatMap(role => BOARD_ROLE_CAPABILITIES[role]))
);

export const createDefaultBoardRolePermissionMatrix = (): BoardRolePermissionMatrix => ({
  owner: [...BOARD_ROLE_CAPABILITIES.owner],
  admin: [...BOARD_ROLE_CAPABILITIES.admin],
  project_manager: [...BOARD_ROLE_CAPABILITIES.project_manager],
  member: [...BOARD_ROLE_CAPABILITIES.member],
  viewer: [...BOARD_ROLE_CAPABILITIES.viewer],
});

export const normalizeBoardRolePermissionMatrix = (
  matrix?: Partial<Record<CollaborationRole, readonly PermissionCapability[] | null>>
): BoardRolePermissionMatrix => {
  const defaults = createDefaultBoardRolePermissionMatrix();
  const allowedCapabilities = new Set<PermissionCapability>(BOARD_PERMISSION_CAPABILITIES);

  return COLLABORATION_ROLES.reduce((result, role) => {
    if (role === 'owner') {
      result[role] = defaults.owner;
      return result;
    }

    const configured = matrix?.[role];
    result[role] = configured
      ? Array.from(new Set(configured.filter(capability => allowedCapabilities.has(capability))))
      : defaults[role];
    return result;
  }, {} as BoardRolePermissionMatrix);
};

// Kept for old deep links and modal state. New task editing should prefer TaskNode ids.
export type EditableItemType = 'list' | 'card' | 'checklist' | 'checklistitem' | 'tasknode';

export interface CollaborationMemberProfile {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: CollaborationRole;
  status: MembershipStatus;
  profile?: CollaborationMemberProfile;
  createdAt?: number;
  updatedAt?: number;
}

export interface BoardMember {
  workspaceId: string;
  boardId: string;
  userId: string;
  role: CollaborationRole;
  profile?: CollaborationMemberProfile;
  createdAt?: number;
  updatedAt?: number;
}

export interface BoardInvite {
  id: string;
  workspaceId: string;
  boardId: string;
  email: string;
  invitedBy?: string | null;
  status: BoardInviteStatus;
  defaultRole: CollaborationRole;
  expiresAt: number;
  acceptedAt?: number;
  revokedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface BoardInviteCreateInput {
  email: string;
  tokenHash: string;
  expiresAt: number;
  defaultRole?: CollaborationRole;
}

export interface BoardInviteAcceptInput {
  token: string;
  userId: string;
  email: string | null;
  displayName?: string | null;
}

export interface CurrentBoardAccess {
  workspaceId: string;
  boardId: string;
  workspaceRole?: CollaborationRole;
  boardRole?: CollaborationRole;
  capabilities: PermissionCapability[];
}

export interface BoardWorkspaceTransferPreview {
  blocked: boolean;
  reasons: string[];
  sourceWorkspaceId: string;
  sourceWorkspaceTitle?: string | null;
  targetWorkspaceId: string;
  targetWorkspaceTitle?: string | null;
  boardId: string;
  boardTitle: string;
  transferLocked?: boolean;
  counts: {
    targetActiveMembers?: number;
    preservedMembers?: number;
    removedMembers?: number;
    tasks?: number;
    dependencies?: number;
    tagsToMap?: number;
    documents?: number;
    records?: number;
    pendingInvitesToRevoke?: number;
    ragDocumentsToResync?: number;
    revokedInvites?: number;
    remappedTags?: number;
    ragJobsCreated?: number;
  };
}

export interface InboxItem {
  id: string;
  schemaVersion?: number;
  cloudId?: string | null;
  clientMutationId?: string;
  title: string;
  rawText?: string;
  note?: string;
  detailText?: string | null;
  itemType: InboxItemType;
  captureStatus: InboxItemCaptureStatus;
  syncStatus: InboxItemSyncStatus;
  createdBy?: string | null;
  createdAuthUserId?: string | null;
  anonymousOwnerKey?: string | null;
  requiresOwnershipConfirmation?: boolean;
  sourceWorkspaceId?: string | null;
  sourceBoardId?: string | null;
  lastSyncError?: string | null;
  migratedFromLocalOnly?: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
  archivedAt?: number | null;
  suggestedDueDate?: string | null;
  confirmedDueDate?: string | null;
  promotedTaskNodeId?: string | null;
  promotedAt?: number | null;
  promotionClientMutationId?: string | null;
}

export interface InboxItemPromotionInput {
  inboxItemId: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  insertBeforeId?: string | null;
  insertAfterId?: string | null;
  promotionClientMutationId: string;
  taskNodeId: string;
  title: string;
  description?: string | null;
  endDate?: string | null;
  order: number;
}

export interface InboxItemPromotionResult {
  item: InboxItem;
  taskNode: TaskNode;
}

export interface PersonalTaskZoneInfo {
  workspaceId: string;
  boardId: string;
}

export interface PersonalQuickTaskInput {
  clientMutationId: string;
  title: string;
  description?: string | null;
  suggestedDueDate?: string | null;
  sourceContext?: Record<string, unknown>;
}

export interface PersonalTaskPlacementInput {
  taskId: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  order?: number;
  insertBeforeId?: string | null;
  insertAfterId?: string | null;
  placementClientMutationId: string;
}

export interface TaskWorkbenchStageInput {
  taskId: string;
  sourceWorkspaceId: string;
  sourceBoardId: string;
  stageClientMutationId: string;
}

export interface TaskWorkbenchStageResult {
  stagedTask: TaskNode;
}

export interface TaskBoardMoveInput {
  taskId: string;
  sourceWorkspaceId: string;
  sourceBoardId: string;
  targetWorkspaceId: string;
  targetBoardId: string;
  parentId: string | null;
  order?: number;
  insertBeforeId?: string | null;
  insertAfterId?: string | null;
}

export interface TaskBoardMoveResult {
  movedTask: TaskNode;
  movedNodes: TaskNode[];
}

export type ActivityEventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_collaborators_changed'
  | 'task_status_changed'
  | 'task_moved'
  | 'task_dates_changed'
  | 'task_archived'
  | 'task_restored'
  | 'task_tags_changed'
  | 'dependency_created'
  | 'dependency_updated'
  | 'dependency_deleted'
  | 'project_workspace_transferred';

export type AuditAction =
  | 'invite_created'
  | 'invite_revoked'
  | 'invite_accepted'
  | 'member_invited'
  | 'member_removed'
  | 'member_role_changed'
  | 'board_deleted'
  | 'workspace_deleted'
  | 'board_workspace_transferred';

export interface ActivityEvent {
  id?: string;
  workspaceId: string;
  boardId?: string | null;
  actorId?: string | null;
  eventType: ActivityEventType;
  entityTable: string;
  entityId?: string | null;
  payload: Record<string, unknown>;
  createdAt?: number;
}

export interface ActivityEventListQuery {
  workspaceId: string;
  boardId?: string | null;
  scope: CollaborationScope;
  startedAt: number;
  endedAt: number;
  eventTypes?: ActivityEventType[];
}

export interface RecordTaskLink {
  id: string;
  recordId: string;
  workspaceId: string;
  boardId: string;
  nodeId: string;
  role: RecordTaskLinkRole;
  createdAt?: number;
}

export interface KnowledgeRecord {
  id: string;
  workspaceId: string;
  boardId: string;
  type: KnowledgeRecordType;
  title: string;
  content: string;
  status: KnowledgeRecordStatus;
  visibility: KnowledgeRecordVisibility;
  participantsText?: string;
  occurredAt?: number;
  startedAt?: number;
  endedAt?: number;
  recordedBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: number;
  updatedAt?: number;
  ragEnabled?: boolean;
  sourceDocumentId?: string | null;
  taskLinks: RecordTaskLink[];
}

export interface KnowledgeRecordInput {
  id?: string;
  type: KnowledgeRecordType;
  title: string;
  content: string;
  status: KnowledgeRecordStatus;
  visibility: KnowledgeRecordVisibility;
  participantsText?: string;
  occurredAt?: number;
  startedAt?: number;
  endedAt?: number;
  recordedBy?: string | null;
  taskLinks: Array<Pick<RecordTaskLink, 'nodeId' | 'role'>>;
}

export interface AuditLogEntry {
  id?: string;
  workspaceId: string;
  boardId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  entityTable: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  createdAt?: number;
}

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
  placementStatus?: 'placed' | 'unplaced' | 'staged';
  stagedFromWorkspaceId?: string | null;
  stagedFromBoardId?: string | null;
  stagedFromParentId?: string | null;
  stagedFromSortOrder?: number | null;
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

export type BoardContextMenuState =
  | {
      kind: 'task';
      isOpen: boolean;
      x: number;
      y: number;
      nodeId: string;
      title: string;
    }
  | {
      kind: 'workspace';
      isOpen: boolean;
      x: number;
      y: number;
      workspaceId: string;
      title: string;
    }
  | {
      kind: 'board';
      isOpen: boolean;
      x: number;
      y: number;
      workspaceId: string;
      boardId: string;
      title: string;
    };

export interface PendingBoardTitleEdit {
  workspaceId: string;
  boardId: string;
}

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
  dueWithinDays: number | null;
  selectedAssigneeIds: string[];

  dependencySelection: { id: string; side: 'start' | 'end'; title: string } | null;
  contextMenuState: BoardContextMenuState | null;
  selectedTaskId: string | null;
  pendingTitleEditNodeId: string | null;
  pendingTitleEditInitialValue: string | null;
  pendingDirectTitleEditNodeId: string | null;
  pendingWorkspaceTitleEditId: string | null;
  pendingBoardTitleEdit: PendingBoardTitleEdit | null;
}

export interface BoardActions {
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (id: string) => void;
  setActiveBoard: (id: string) => void;
  setView: (view: ViewMode) => void;
  setSidebarOpen: (isOpen: boolean) => void;

  addWorkspace: (title?: string) => Promise<Workspace>;
  removeWorkspace: (wsId: string) => Promise<void>;
  updateWorkspaceTitle: (workspaceId: string, newTitle: string) => void;

  addBoard: (workspaceId: string, boardName: string) => string | void;
  removeBoard: (wsId: string, bId: string) => void;
  updateBoardTitle: (workspaceId: string, boardId: string, newTitle: string) => void;
  moveBoardToWorkspace: (workspaceId: string, boardId: string, targetWorkspaceId: string, expectedBoardTitle: string) => Promise<void>;
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
  setDueWithinDays: (days: number | null) => void;
  toggleAssigneeFilter: (assigneeId: string) => void;
  clearAssigneeFilters: () => void;

  setDependencySelection: (state: { id: string; side: 'start' | 'end'; title: string } | null) => void;
  setContextMenuState: (state: BoardContextMenuState | null) => void;
  setSelectedTaskId: (nodeId: string | null) => void;
  setPendingTitleEditNodeId: (nodeId: string | null, initialValue?: string | null) => void;
  setPendingDirectTitleEditNodeId: (nodeId: string | null) => void;
  setPendingWorkspaceTitleEditId: (workspaceId: string | null) => void;
  setPendingBoardTitleEdit: (target: PendingBoardTitleEdit | null) => void;

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
  description: string;
  defaultValue: string;
  inputValue: string;
  actions: DialogAction[];
  resolvePromise: ((value: boolean | string | null) => void) | null;

  setInputValue: (val: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  showActionDialog: (config: ActionDialogConfig) => Promise<string | null>;
  closeDialog: (result: boolean | string | null) => void;
}

export interface DialogAction {
  id: string;
  label: string;
  description?: string;
  variant?: DialogActionVariant;
}

export interface ActionDialogConfig {
  title: string;
  message?: string;
  actions: DialogAction[];
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
