import type { TaskStatus } from '../../../types';

export type TaskDragInputMode = 'mouse' | 'keyboard' | 'touch';

export type TaskDragSourceKind =
  | 'kanban-card'
  | 'checklist-row'
  | 'column-header'
  | 'wbs-list-row'
  | 'workbench-unplaced-row';

export type MobileTaskAction = 'toggle-complete' | 'add-sibling' | 'add-child' | 'delete';
export type MobileTaskDropPosition = 'before' | 'after';
export type TaskDragTargetKind = 'task-position' | 'workbench-placed-lane' | 'mobile-action' | 'none';
export type TaskDragTerminalState = 'committed' | 'cancelled' | 'no-op';
export type TaskDragPhase = 'dragging' | 'armed';
export type TaskDropSurfaceKind =
  | 'column-header'
  | 'kanban-card'
  | 'checklist-row'
  | 'column-drop'
  | 'checklist-drop'
  | 'workbench-unplaced-row'
  | 'workbench-placed-lane';

export interface TaskDragSource {
  nodeId: string;
  kind: TaskDragSourceKind;
  inputMode: TaskDragInputMode;
  originBoardId?: string | null;
  originWorkspaceId?: string | null;
}

export interface TaskDragIndicatorRect {
  left: number;
  top: number;
  width: number;
}

export interface TaskDragTargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TaskDragObservation {
  sessionId: string;
  sequence: number;
  inputMode: TaskDragInputMode;
  source: TaskDragSource;
  targetKind: TaskDragTargetKind;
  targetNodeId: string | null;
  targetBoardId: string | null;
  targetWorkspaceId: string | null;
  targetSurfaceKind: TaskDropSurfaceKind | null;
  action: MobileTaskAction | null;
  dropPosition: MobileTaskDropPosition | null;
  indicatorRect: TaskDragIndicatorRect | null;
  lockedTargetRect: TaskDragTargetRect | null;
  pendingTargetId: string | null;
  pendingSince: number | null;
  lastStableAt: number | null;
  pointer: { x: number; y: number } | null;
  intentPointer: { x: number; y: number } | null;
  observedAt: number;
}

export interface TaskDragSessionState {
  sessionId: string;
  sequence: number;
  phase: TaskDragPhase;
  source: TaskDragSource;
  nodeId: string;
  title: string;
  status: TaskStatus;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  hasMoved: boolean;
  hoverAction: MobileTaskAction | null;
  hoverTargetId: string | null;
  targetBoardId: string | null;
  targetWorkspaceId: string | null;
  targetSurfaceKind: TaskDropSurfaceKind | null;
  targetKind: TaskDragTargetKind;
  dropPosition: MobileTaskDropPosition | null;
  dropIndicatorRect: TaskDragIndicatorRect | null;
  lockedTargetRect: TaskDragTargetRect | null;
  pendingTargetId: string | null;
  pendingSince: number | null;
  lastStableAt: number | null;
  terminal: TaskDragTerminalState | null;
}

export interface TaskDragCommitResult {
  status: 'committed' | 'no-op';
  reason: string;
}
