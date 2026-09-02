import type { TaskNode } from '../../types';

export type TaskPlacementKind = 'primary' | 'tracking_reference';

/**
 * A non-owning placement of a canonical task.  The task content never lives in
 * this record; `taskId` always resolves back to the single canonical TaskNode.
 */
export interface TaskTrackingReference {
  id: string;
  taskId: string;
  workspaceId: string;
  boardId: string;
  /** Canonical source board; boardId is the current projection target. */
  sourceBoardId?: string;
  parentPlacementId: string | null;
  order: number;
  kanbanStageId?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  removedAt?: number;
}

/**
 * Account-owned holding record for a tracking placement that is temporarily
 * outside every Board. The canonical task and placement subtree remain in
 * their existing stores; this record only preserves the root's return point.
 */
export interface StagedTaskTrackingReference {
  referenceId: string;
  taskId: string;
  workspaceId: string;
  sourceBoardId?: string;
  originalBoardId: string;
  originalParentPlacementId: string | null;
  originalOrder: number;
  order: number;
  revision: number;
  stagedAt: number;
  updatedAt: number;
}

export interface TaskProjectionNode {
  placementId: string;
  taskId: string;
  placementKind: TaskPlacementKind;
  workspaceId: string;
  boardId: string;
  parentPlacementId: string | null;
  order: number;
  kanbanStageId?: string;
  task: TaskNode;
  access: {
    canRead: true;
    canEditCanonicalTask: boolean;
    canManageReferenceHere: boolean;
  };
}

export type TaskTrackingReferenceCapability = {
  supported: boolean;
  reason?: 'backend_unsupported' | 'schema_not_ready';
};

export type TrackingReferenceMutation = {
  operationId?: string;
  sourcePlacementId: string;
  expectedRevision?: number;
  clientPlatform?: 'web' | 'local-test';
};

export type CreateTrackingReferenceInput = TrackingReferenceMutation;

export type MoveTrackingReferenceInput = TrackingReferenceMutation & {
  targetBoardId: string;
  targetParentPlacementId: string | null;
  anchorPlacementId?: string | null;
  position?: 'before' | 'after' | 'append';
};

export type StageTrackingReferenceInput = TrackingReferenceMutation;

export type PlaceStagedTrackingReferenceInput = TrackingReferenceMutation & {
  targetBoardId: string;
  targetParentPlacementId: string | null;
  anchorPlacementId?: string | null;
  position?: 'before' | 'after' | 'append';
};

export interface TrackingReferenceService {
  getCapability(): Promise<TaskTrackingReferenceCapability>;
  listByWorkspace(workspaceId: string): Promise<TaskTrackingReference[]>;
  listStagedByWorkspace(workspaceId: string): Promise<StagedTaskTrackingReference[]>;
  /** Hydrate canonical task payloads through the provider's derived-read path. */
  listCanonicalTasksByIds?(workspaceId: string, taskIds: readonly string[]): Promise<TaskNode[]>;
  create(workspaceId: string, input: CreateTrackingReferenceInput): Promise<TaskTrackingReference>;
  move(workspaceId: string, input: MoveTrackingReferenceInput): Promise<TaskTrackingReference>;
  stage(workspaceId: string, input: StageTrackingReferenceInput): Promise<StagedTaskTrackingReference>;
  placeStaged(workspaceId: string, input: PlaceStagedTrackingReferenceInput): Promise<TaskTrackingReference>;
  remove(workspaceId: string, input: TrackingReferenceMutation): Promise<void>;
  restore(workspaceId: string, input: TrackingReferenceMutation): Promise<TaskTrackingReference>;
}
