export type TaskHostMode = 'list' | 'mindmap' | 'board' | 'gantt' | 'calendar';

export type TaskInteractionOrigin =
  | 'mode-primary'
  | 'task-workbench'
  | 'shared-task-sidebar'
  | 'calendar-segment';

export type TaskInteractionLocation = {
  hostMode: TaskHostMode;
  origin: TaskInteractionOrigin;
};

export type TaskPlacementInteractionContext = {
  taskId: string;
  placementId: string;
  placementKind: 'primary' | 'tracking_reference';
  boardId: string;
  parentPlacementId: string | null;
  canEditCanonicalTask: boolean;
  canManageReferenceHere: boolean;
};

export type TaskInteractionSurfaceId =
  | 'list.row'
  | 'mindmap.node'
  | 'board.column-header'
  | 'board.card'
  | 'board.checklist-row'
  | 'gantt.task-bar'
  | 'shared-task-sidebar.row'
  | 'calendar.segment'
  | 'task-workbench.placed-row'
  | 'task-workbench.unplaced-row'
  | 'task-details.subtask-row';

export type InteractionTrigger =
  | 'pointer.primary'
  | 'pointer.double'
  | 'pointer.secondary'
  | 'keyboard.enter'
  | 'keyboard.space'
  | 'keyboard.tab'
  | 'keyboard.arrow-up'
  | 'keyboard.arrow-down'
  | 'keyboard.arrow-left'
  | 'keyboard.arrow-right'
  | 'keyboard.escape'
  | 'keyboard.shift-f10'
  | 'gesture.tap'
  | 'gesture.long-press'
  | 'task.post-create';

export type TaskNodeRole = 'group' | 'milestone' | 'task' | 'unplaced';
export type TaskInteractionModality = 'fine-pointer' | 'coarse-pointer' | 'keyboard';
export type TaskTransientOwner = 'relationship' | 'dependency-selection' | 'record-capture' | 'mobile-action-mode';
export type TaskInteractionBlocker = 'drag-established' | 'resize-established';

export type TaskActionId =
  | 'task.select'
  | 'task.open-details'
  | 'task.open-details-for-naming'
  | 'task.switch-to-list'
  | 'task.open-menu'
  | 'task.clear-selection'
  | 'task.create-sibling'
  | 'task.create-child'
  | 'task.create-relationship'
  | 'task.duplicate'
  | 'task.copy'
  | 'task.cut'
  | 'task.paste-after'
  | 'task.create-tracking-reference'
  | 'task.remove-tracking-reference'
  | 'task.assign'
  | 'task.dependency-start'
  | 'task.dependency-end'
  | 'task.promote'
  | 'task.demote'
  | 'task.toggle-complete'
  | 'task.archive'
  | 'mindmap.select-parent'
  | 'mindmap.select-first-child'
  | 'mindmap.select-previous'
  | 'mindmap.select-next';

export type TaskInteractionBinding = TaskActionId | 'disabled';

export type InteractionContext = {
  interactionId: string;
  location: TaskInteractionLocation;
  surfaceId: TaskInteractionSurfaceId;
  taskId: string;
  nodeRole?: TaskNodeRole;
  modality: TaskInteractionModality;
  transientOwners: readonly TaskTransientOwner[];
  blockers: readonly TaskInteractionBlocker[];
  targetKind?: string;
};

export type ResolvedInteraction = {
  actionId: TaskActionId | null;
  sourceLayer: 'base' | 'task-default' | 'host-mode' | 'origin' | 'node-role' | 'transient';
  suppressedReason?: string;
};

export type TaskCommandStatus = 'executed' | 'noop' | 'denied' | 'cancelled' | 'failed';

export type TaskCommandOutcome = {
  interactionId: string;
  actionId: TaskActionId;
  status: TaskCommandStatus;
  reason?: string;
};

export type TaskInteractionDispatchOutcome = {
  resolved: ResolvedInteraction;
  commandOutcome: TaskCommandOutcome | null;
};

export type TaskMenuSection = 'create' | 'clipboard' | 'assignment' | 'dependency' | 'hierarchy' | 'lifecycle' | 'danger';

export type TaskActionDefinition = {
  id: TaskActionId;
  label: string;
  icon: string;
  section: TaskMenuSection | null;
  kind: 'navigation' | 'selection' | 'presentation' | 'mutation' | 'transient' | 'danger';
  capability?: 'create' | 'edit' | 'move' | 'delete' | 'assign' | 'dependency' | 'tracking-reference';
  /** Opt-in actions remain absent from every host menu unless a profile includes them explicitly. */
  defaultMenu?: boolean;
};

export type TaskInteractionProfile = {
  triggers?: Partial<Record<InteractionTrigger, TaskInteractionBinding>>;
  menu?: {
    include?: readonly TaskActionId[];
    exclude?: readonly TaskActionId[];
  };
};

export type TaskInteractionProfileLayer = {
  layer: ResolvedInteraction['sourceLayer'];
  profile: TaskInteractionProfile;
};
