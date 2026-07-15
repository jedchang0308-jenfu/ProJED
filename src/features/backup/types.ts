import type { DependencySide, TagColor, TaskDetailNote, TaskStatus } from '../../types';

export const BACKUP_FORMAT = 'projed-backup' as const;
export const BACKUP_SCHEMA_VERSION = 2 as const;
export const BACKUP_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const BACKUP_MAX_TASKS = 10_000;
export const BACKUP_MAX_DEPENDENCIES = 30_000;

export type BackupMode = 'copy_to_new_board' | 'replace_current_board';

export type BackupErrorCode =
  | 'INVALID_FILE'
  | 'CHECKSUM_MISMATCH'
  | 'UNSUPPORTED_VERSION'
  | 'LEGACY_SCOPE_AMBIGUOUS'
  | 'PERMISSION_DENIED'
  | 'TARGET_CHANGED'
  | 'CROSS_BOARD_ID_COLLISION'
  | 'OUT_OF_PACKAGE_REFERENCE'
  | 'IMPORT_ROLLED_BACK'
  | 'VERIFY_MISMATCH'
  | 'BACKEND_UNSUPPORTED';

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: BackupErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.details = details;
  }
}

export interface PortableBoardV2 {
  title: string;
}

export interface PortableTaskV2 {
  sourceId: string;
  parentSourceId: string | null;
  title: string;
  detailNotes?: TaskDetailNote[];
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  collaboratorIds: string[];
  tagSourceIds: string[];
  startDate?: string;
  endDate?: string;
  isDurationLocked: boolean;
  nodeType: 'group' | 'milestone' | 'task';
  kanbanStageSourceId?: string;
  order: number;
  createdAt?: number;
  updatedAt?: number;
  isArchived: boolean;
}

export interface PortableDependencyV2 {
  sourceId: string;
  fromSourceId: string;
  fromSide: DependencySide;
  toSourceId: string;
  toSide: DependencySide;
  offset: number;
}

export interface PortableTagV2 {
  sourceId: string;
  name: string;
  color: TagColor;
  order: number;
}

export interface BackupPayloadV2 {
  board: PortableBoardV2;
  tasks: PortableTaskV2[];
  dependencies: PortableDependencyV2[];
  tags: PortableTagV2[];
}

export interface BackupPackageV2 {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  packageId: string;
  createdAt: string;
  source: {
    appVersion: string;
    backend: 'supabase' | 'local-test';
    workspaceId: string;
    /** Optional display metadata; older V2 packages remain valid without it. */
    workspaceTitle?: string;
    boardId: string;
    boardTitle: string;
  };
  scope: { type: 'board' };
  manifest: {
    entities: {
      tasks: number;
      dependencies: number;
      tags: number;
    };
    includes: string[];
    excludes: string[];
    canonicalization: 'json-sort-v1';
    checksum: {
      algorithm: 'SHA-256';
      value: string;
    };
  };
  payload: BackupPayloadV2;
}

export interface BoardBackupSource {
  workspaceId: string;
  workspaceTitle?: string;
  boardId: string;
  boardTitle: string;
  tasks: import('../../types').TaskNode[];
  dependencies: import('../../types').Dependency[];
  tags: import('../../types').TaskTag[];
}

export interface BackupInspection {
  package: BackupPackageV2;
  sourceKind: 'v2' | 'legacy-converted';
  legacyVersion?: string;
  compatibleModes: BackupMode[];
  warnings: string[];
}

export interface BackupImportCounts {
  create: number;
  update: number;
  delete: number;
  keep: number;
  dependencies: number;
  tagsToCreate: number;
  tagsToReuse: number;
  unresolvedPeople: number;
  blockingRecordLinks: number;
}

export interface BackupImportTarget {
  workspaceId: string;
  workspaceTitle: string;
  boardId?: string;
  boardTitle: string;
}

export interface BackupImportPlan {
  planId: string;
  executionId: string;
  packageId: string;
  createdAt: string;
  expiresAt: string;
  mode: BackupMode;
  target: BackupImportTarget;
  allowed: boolean;
  expectedTargetFingerprint: string | null;
  counts: BackupImportCounts;
  warnings: string[];
  blockers: Array<{ code: BackupErrorCode; message: string }>;
  confirmationPhrase?: string;
}

export interface BackupExecutionResult {
  executionId: string;
  mode: BackupMode;
  targetWorkspaceId: string;
  targetBoardId: string;
  targetBoardTitle: string;
  counts: BackupImportCounts;
  warnings: string[];
  sourceTaskIdMap: Record<string, string>;
  postWriteFingerprint: string;
  idempotentReplay: boolean;
}

export interface BackupVerificationReport {
  verified: boolean;
  expectedFingerprint: string;
  actualFingerprint: string;
  backendExpectedFingerprint: string;
  backendActualFingerprint: string;
  expected: {
    tasks: number;
    dependencies: number;
  };
  actual: {
    tasks: number;
    dependencies: number;
  };
}

export interface BackupBackendPlanRequest {
  package: BackupPackageV2;
  mode: BackupMode;
  target: BackupImportTarget;
}

export interface BackupBackendExecuteRequest {
  package: BackupPackageV2;
  plan: BackupImportPlan;
  newBoardTitle?: string;
}

export interface BackupBackendAdapter {
  readBoardSource(workspaceId: string, boardId: string): Promise<BoardBackupSource>;
  planImport(request: BackupBackendPlanRequest): Promise<BackupImportPlan>;
  executeImport(request: BackupBackendExecuteRequest): Promise<BackupExecutionResult>;
  readBoardFingerprint(workspaceId: string, boardId: string): Promise<string>;
}
