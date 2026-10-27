import { BackupError, type BackupBackendAdapter, type BackupErrorCode, type BackupExecutionResult,
  type BackupImportCounts, type BackupImportPlan, type BackupPackageV2, type BoardBackupSource } from '../../features/backup/types';
import type { TaskTrackingReference } from '../../features/taskTracking/types';
import { parseHttpDependency, parseHttpTag, parseHttpTask } from './domainReadAdapter';
import { HttpApiClient, HttpApiError } from './httpApiClient';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function envelopeData(value: unknown, label: string): unknown {
  return record(value, `${label}_ENVELOPE`).data;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return stringValue(value, label);
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function recordArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`HTTP_API_INVALID_${label}`);
  }
  return [...value];
}

function pathRef(value: string, label: string): string {
  const control = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || control) {
    throw new BackupError('INVALID_FILE', `${label} is invalid`);
  }
  return encodeURIComponent(value);
}

function parseTrackingReference(value: unknown): TaskTrackingReference {
  const row = record(value, 'BACKUP_TRACKING_REFERENCE');
  if (row.parentPlacementId !== null && typeof row.parentPlacementId !== 'string') {
    throw new Error('HTTP_API_INVALID_BACKUP_TRACKING_PARENT');
  }
  const revision = numberValue(row.revision, 'BACKUP_TRACKING_REVISION');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('HTTP_API_INVALID_BACKUP_TRACKING_REVISION');
  const sourceBoardId = optionalString(row.sourceBoardId, 'BACKUP_TRACKING_SOURCE_BOARD_ID');
  const kanbanStageId = optionalString(row.kanbanStageId, 'BACKUP_TRACKING_STAGE_ID');
  const removedAt = row.removedAt === undefined ? undefined : numberValue(row.removedAt, 'BACKUP_TRACKING_REMOVED_AT');
  return {
    id: stringValue(row.id, 'BACKUP_TRACKING_ID'),
    taskId: stringValue(row.taskId, 'BACKUP_TRACKING_TASK_ID'),
    workspaceId: stringValue(row.workspaceId, 'BACKUP_TRACKING_WORKSPACE_ID'),
    boardId: stringValue(row.boardId, 'BACKUP_TRACKING_BOARD_ID'),
    ...(sourceBoardId ? { sourceBoardId } : {}),
    parentPlacementId: row.parentPlacementId as string | null,
    order: numberValue(row.order, 'BACKUP_TRACKING_ORDER'),
    ...(kanbanStageId ? { kanbanStageId } : {}),
    revision,
    createdAt: numberValue(row.createdAt, 'BACKUP_TRACKING_CREATED_AT'),
    updatedAt: numberValue(row.updatedAt, 'BACKUP_TRACKING_UPDATED_AT'),
    ...(removedAt === undefined ? {} : { removedAt }),
  };
}

function parseBoardSource(value: unknown): BoardBackupSource {
  const row = record(value, 'BACKUP_SOURCE');
  const workspaceTitle = optionalString(row.workspaceTitle, 'BACKUP_WORKSPACE_TITLE');
  return {
    workspaceId: stringValue(row.workspaceId, 'BACKUP_WORKSPACE_ID'),
    ...(workspaceTitle ? { workspaceTitle } : {}),
    boardId: stringValue(row.boardId, 'BACKUP_BOARD_ID'),
    boardTitle: stringValue(row.boardTitle, 'BACKUP_BOARD_TITLE'),
    tasks: recordArray(row.tasks, 'BACKUP_TASKS').map(parseHttpTask),
    dependencies: recordArray(row.dependencies, 'BACKUP_DEPENDENCIES').map(parseHttpDependency),
    tags: recordArray(row.tags, 'BACKUP_TAGS').map(parseHttpTag),
    ...(row.trackingReferences === undefined
      ? {}
      : { trackingReferences: recordArray(row.trackingReferences, 'BACKUP_TRACKING_REFERENCES').map(parseTrackingReference) }),
  };
}

const countKeys: Array<keyof BackupImportCounts> = [
  'create', 'update', 'delete', 'keep', 'dependencies', 'tagsToCreate', 'tagsToReuse',
  'unresolvedPeople', 'blockingRecordLinks',
];

function parseCounts(value: unknown): BackupImportCounts {
  const row = record(value, 'BACKUP_COUNTS');
  const counts = {} as BackupImportCounts;
  for (const key of countKeys) {
    const count = numberValue(row[key], `BACKUP_COUNT_${key.toUpperCase()}`);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`HTTP_API_INVALID_BACKUP_COUNT_${key.toUpperCase()}`);
    counts[key] = count;
  }
  if (row.trackingReferences !== undefined) {
    const trackingReferences = numberValue(row.trackingReferences, 'BACKUP_COUNT_TRACKING_REFERENCES');
    if (!Number.isSafeInteger(trackingReferences) || trackingReferences < 0) {
      throw new Error('HTTP_API_INVALID_BACKUP_COUNT_TRACKING_REFERENCES');
    }
    counts.trackingReferences = trackingReferences;
  }
  return counts;
}

const BACKUP_CODES = new Set<BackupErrorCode>([
  'INVALID_FILE', 'CHECKSUM_MISMATCH', 'UNSUPPORTED_VERSION', 'LEGACY_SCOPE_AMBIGUOUS',
  'PERMISSION_DENIED', 'TARGET_CHANGED', 'CROSS_BOARD_ID_COLLISION', 'OUT_OF_PACKAGE_REFERENCE',
  'IMPORT_ROLLED_BACK', 'VERIFY_MISMATCH', 'COMMIT_UNKNOWN', 'BACKEND_UNSUPPORTED',
]);

function normalizeError(error: unknown): never {
  if (error instanceof BackupError) throw error;
  if (error instanceof HttpApiError) {
    const aliases: Record<string, BackupErrorCode> = {
      ACCESS_DENIED: 'PERMISSION_DENIED',
      RESOURCE_NOT_FOUND: 'PERMISSION_DENIED',
      ENDPOINT_UNAVAILABLE: 'BACKEND_UNSUPPORTED',
      DB_COMMIT_UNKNOWN: 'COMMIT_UNKNOWN',
      DOMAIN_DATA_INVALID: 'INVALID_FILE',
    };
    const code = BACKUP_CODES.has(error.code as BackupErrorCode)
      ? error.code as BackupErrorCode
      : aliases[error.code];
    if (code) {
      const message = code === 'COMMIT_UNKNOWN'
        ? '匯入結果尚未確認；請先重新讀取目標看板，不要直接重試。'
        : error.code;
      throw new BackupError(code, message, { requestId: error.requestId ?? undefined, status: error.status });
    }
  }
  throw error;
}

function parsePlan(value: unknown, request: { package: BackupPackageV2; mode: BackupImportPlan['mode']; target: BackupImportPlan['target'] }): BackupImportPlan {
  const row = record(envelopeData(value, 'BACKUP_PLAN'), 'BACKUP_PLAN_DATA');
  if (typeof row.allowed !== 'boolean' || row.mode !== request.mode || row.packageId !== request.package.packageId) {
    throw new Error('HTTP_API_INVALID_BACKUP_PLAN_IDENTITY');
  }
  const targetRow = record(row.target, 'BACKUP_PLAN_TARGET');
  const target = {
    workspaceId: stringValue(targetRow.workspaceId, 'BACKUP_PLAN_WORKSPACE_ID'),
    workspaceTitle: stringValue(targetRow.workspaceTitle, 'BACKUP_PLAN_WORKSPACE_TITLE'),
    ...(targetRow.boardId === undefined ? {} : { boardId: stringValue(targetRow.boardId, 'BACKUP_PLAN_BOARD_ID') }),
    boardTitle: stringValue(targetRow.boardTitle, 'BACKUP_PLAN_BOARD_TITLE'),
  };
  if (target.workspaceId !== request.target.workspaceId
      || (target.boardId ?? '') !== (request.target.boardId ?? '')) {
    throw new Error('HTTP_API_INVALID_BACKUP_PLAN_TARGET');
  }
  const fingerprint = row.expectedTargetFingerprint;
  if (fingerprint !== null && typeof fingerprint !== 'string') throw new Error('HTTP_API_INVALID_BACKUP_PLAN_FINGERPRINT');
  const rawBlockers = recordArray(row.blockers, 'BACKUP_PLAN_BLOCKERS');
  const blockers = rawBlockers.map(value => {
    const blocker = record(value, 'BACKUP_PLAN_BLOCKER');
    const candidate = typeof blocker.code === 'string' && BACKUP_CODES.has(blocker.code as BackupErrorCode)
      ? blocker.code as BackupErrorCode : 'IMPORT_ROLLED_BACK';
    return { code: candidate, message: stringValue(blocker.message, 'BACKUP_PLAN_BLOCKER_MESSAGE') };
  });
  const warnings = stringArray(row.warnings, 'BACKUP_PLAN_WARNINGS');
  const confirmationPhrase = optionalString(row.confirmationPhrase, 'BACKUP_PLAN_CONFIRMATION');
  return {
    planId: stringValue(row.planId, 'BACKUP_PLAN_ID'),
    executionId: stringValue(row.executionId, 'BACKUP_EXECUTION_ID'),
    packageId: request.package.packageId,
    createdAt: stringValue(row.createdAt, 'BACKUP_PLAN_CREATED_AT'),
    expiresAt: stringValue(row.expiresAt, 'BACKUP_PLAN_EXPIRES_AT'),
    mode: request.mode,
    target,
    allowed: row.allowed && blockers.length === 0,
    expectedTargetFingerprint: fingerprint as string | null,
    counts: parseCounts(row.counts),
    warnings,
    blockers,
    ...(confirmationPhrase ? { confirmationPhrase } : {}),
  };
}

function stringMap(value: unknown, label: string): Record<string, string> {
  const source = record(value, label);
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, stringValue(item, `${label}_VALUE`)]));
}

function parseExecution(value: unknown, request: { plan: BackupImportPlan }): BackupExecutionResult {
  const row = record(envelopeData(value, 'BACKUP_EXECUTION'), 'BACKUP_EXECUTION_DATA');
  if (row.executionId !== request.plan.executionId || row.mode !== request.plan.mode
      || row.targetWorkspaceId !== request.plan.target.workspaceId || typeof row.idempotentReplay !== 'boolean') {
    throw new Error('HTTP_API_INVALID_BACKUP_EXECUTION_IDENTITY');
  }
  const trackingMap = row.sourceTrackingReferenceIdMap === undefined
    ? undefined : stringMap(row.sourceTrackingReferenceIdMap, 'BACKUP_TRACKING_REFERENCE_MAP');
  return {
    executionId: request.plan.executionId,
    mode: request.plan.mode,
    targetWorkspaceId: request.plan.target.workspaceId,
    targetBoardId: stringValue(row.targetBoardId, 'BACKUP_EXECUTION_BOARD_ID'),
    targetBoardTitle: stringValue(row.targetBoardTitle, 'BACKUP_EXECUTION_BOARD_TITLE'),
    counts: parseCounts(row.counts),
    warnings: stringArray(row.warnings, 'BACKUP_EXECUTION_WARNINGS'),
    sourceTaskIdMap: stringMap(row.sourceTaskIdMap, 'BACKUP_TASK_ID_MAP'),
    ...(trackingMap ? { sourceTrackingReferenceIdMap: trackingMap } : {}),
    postWriteFingerprint: stringValue(row.postWriteFingerprint, 'BACKUP_POST_WRITE_FINGERPRINT'),
    idempotentReplay: row.idempotentReplay,
  };
}

function boardPath(workspaceId: string, boardId: string, suffix: string): string {
  return `/api/v1/workspaces/${pathRef(workspaceId, 'workspaceId')}/boards/${pathRef(boardId, 'boardId')}/backup/${suffix}`;
}

export function createHttpBackupAdapter(client: HttpApiClient): BackupBackendAdapter {
  return {
    async readBoardSource(workspaceId, boardId) {
      try {
        return parseBoardSource(envelopeData(await client.request<unknown>(boardPath(workspaceId, boardId, 'source'), {
          method: 'GET',
        }), 'BACKUP_SOURCE'));
      } catch (error) {
        return normalizeError(error);
      }
    },

    async readBoardFingerprint(workspaceId, boardId) {
      try {
        const value = envelopeData(await client.request<unknown>(boardPath(workspaceId, boardId, 'fingerprint')), 'BACKUP_FINGERPRINT');
        return stringValue(value, 'BACKUP_FINGERPRINT_VALUE');
      } catch (error) {
        return normalizeError(error);
      }
    },

    async planImport(request) {
      try {
        const response = await client.request<unknown>('/api/v1/backup/import/plan', {
          method: 'POST',
          body: request,
        });
        return parsePlan(response, request);
      } catch (error) {
        return normalizeError(error);
      }
    },

    async executeImport(request) {
      try {
        const response = await client.request<unknown>('/api/v1/backup/import/execute', {
          method: 'POST',
          body: request,
        });
        return parseExecution(response, request);
      } catch (error) {
        return normalizeError(error);
      }
    },
  };
}
