import { TaskTrackingError, type TaskTrackingErrorCode } from '../../features/taskTracking/errors';
import { getReferenceSubtree } from '../../features/taskTracking/model';
import type {
  CreateTrackingReferenceInput,
  MoveTrackingReferenceInput,
  PlaceStagedTrackingReferenceInput,
  StageTrackingReferenceInput,
  StagedTaskTrackingReference,
  TaskTrackingReference,
  TrackingReferenceMutation,
  TrackingReferenceService,
} from '../../features/taskTracking/types';
import { parseHttpTask } from './domainReadAdapter';
import { HttpApiClient, HttpApiError } from './httpApiClient';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function data(value: unknown, label: string): unknown {
  return record(value, `${label}_ENVELOPE`).data;
}

function arrayData(value: unknown, label: string): unknown[] {
  const result = data(value, label);
  if (!Array.isArray(result)) throw new Error(`HTTP_API_INVALID_${label}_DATA`);
  return result;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value;
}

function ref(value: string): string {
  const control = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value === '.' || value === '..'
      || value.includes('/') || value.includes('\\') || control) {
    throw new Error('HTTP_API_INVALID_TRACKING_REF');
  }
  return encodeURIComponent(value);
}

function parseReference(value: unknown): TaskTrackingReference {
  const row = record(value, 'TRACKING_REFERENCE');
  if (row.parentPlacementId !== null && typeof row.parentPlacementId !== 'string') {
    throw new Error('HTTP_API_INVALID_TRACKING_PARENT');
  }
  const removedAt = row.removedAt === undefined ? undefined : numberValue(row.removedAt, 'TRACKING_REMOVED_AT');
  const kanbanStageId = row.kanbanStageId === undefined ? undefined : stringValue(row.kanbanStageId, 'TRACKING_STAGE_ID');
  const sourceBoardId = row.sourceBoardId === undefined ? undefined : stringValue(row.sourceBoardId, 'TRACKING_SOURCE_BOARD_ID');
  const revision = numberValue(row.revision, 'TRACKING_REVISION');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('HTTP_API_INVALID_TRACKING_REVISION');
  return {
    id: stringValue(row.id, 'TRACKING_ID'),
    taskId: stringValue(row.taskId, 'TRACKING_TASK_ID'),
    workspaceId: stringValue(row.workspaceId, 'TRACKING_WORKSPACE_ID'),
    boardId: stringValue(row.boardId, 'TRACKING_BOARD_ID'),
    ...(sourceBoardId ? { sourceBoardId } : {}),
    parentPlacementId: row.parentPlacementId as string | null,
    order: numberValue(row.order, 'TRACKING_ORDER'),
    ...(kanbanStageId ? { kanbanStageId } : {}),
    revision,
    createdAt: numberValue(row.createdAt, 'TRACKING_CREATED_AT'),
    updatedAt: numberValue(row.updatedAt, 'TRACKING_UPDATED_AT'),
    ...(removedAt === undefined ? {} : { removedAt }),
  };
}

function parseStaged(value: unknown): StagedTaskTrackingReference {
  const row = record(value, 'STAGED_TRACKING_REFERENCE');
  if (row.originalParentPlacementId !== null && typeof row.originalParentPlacementId !== 'string') {
    throw new Error('HTTP_API_INVALID_STAGED_TRACKING_PARENT');
  }
  const sourceBoardId = row.sourceBoardId === undefined ? undefined : stringValue(row.sourceBoardId, 'STAGED_TRACKING_SOURCE_BOARD_ID');
  const revision = numberValue(row.revision, 'STAGED_TRACKING_REVISION');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('HTTP_API_INVALID_STAGED_TRACKING_REVISION');
  return {
    referenceId: stringValue(row.referenceId, 'STAGED_TRACKING_ID'),
    taskId: stringValue(row.taskId, 'STAGED_TRACKING_TASK_ID'),
    workspaceId: stringValue(row.workspaceId, 'STAGED_TRACKING_WORKSPACE_ID'),
    ...(sourceBoardId ? { sourceBoardId } : {}),
    originalBoardId: stringValue(row.originalBoardId, 'STAGED_TRACKING_BOARD_ID'),
    originalParentPlacementId: row.originalParentPlacementId as string | null,
    originalOrder: numberValue(row.originalOrder, 'STAGED_TRACKING_ORIGINAL_ORDER'),
    order: numberValue(row.order, 'STAGED_TRACKING_ORDER'),
    revision,
    stagedAt: numberValue(row.stagedAt, 'STAGED_TRACKING_STAGED_AT'),
    updatedAt: numberValue(row.updatedAt, 'STAGED_TRACKING_UPDATED_AT'),
  };
}

function trackingPath(workspaceId: string, suffix = ''): string {
  return `/api/v1/workspaces/${ref(workspaceId)}/tracking-references${suffix}`;
}

function operationBody(input: TrackingReferenceMutation, expectedSubtreeIds?: string[]) {
  return {
    ...input,
    operationId: input.operationId ?? crypto.randomUUID(),
    ...(expectedSubtreeIds ? { expectedSubtreeIds } : {}),
  };
}

const knownCodes = new Set<TaskTrackingErrorCode>([
  'NOT_FOUND', 'PERMISSION_DENIED', 'REVISION_CONFLICT', 'INVALID_PARENT', 'CYCLE_DETECTED',
  'DUPLICATE_REFERENCE', 'CROSS_WORKSPACE_UNSUPPORTED', 'TRACKING_REFERENCE_BLOCKS_UNPLACED',
  'OPERATION_ID_CONFLICT', 'SCHEMA_NOT_READY', 'BACKEND_UNSUPPORTED',
]);

function normalizeError(error: unknown): never {
  if (error instanceof TaskTrackingError) throw error;
  if (error instanceof HttpApiError) {
    const aliases: Record<string, TaskTrackingErrorCode> = {
      ACCESS_DENIED: 'PERMISSION_DENIED',
      RESOURCE_NOT_FOUND: 'NOT_FOUND',
      DOMAIN_DATA_INVALID: 'INVALID_PARENT',
      ENDPOINT_UNAVAILABLE: 'SCHEMA_NOT_READY',
    };
    const code = knownCodes.has(error.code as TaskTrackingErrorCode)
      ? error.code as TaskTrackingErrorCode
      : aliases[error.code];
    if (code) throw new TaskTrackingError(code, error.code);
  }
  throw error;
}

export function createHttpTaskTrackingAdapter(client: HttpApiClient): TrackingReferenceService {
  const service: TrackingReferenceService = {
    async getCapability() {
      try {
        const result = record(data(await client.request<unknown>('/api/v1/task-tracking/capability'), 'TRACKING_CAPABILITY'), 'TRACKING_CAPABILITY');
        if (result.supported !== true) throw new Error('HTTP_API_INVALID_TRACKING_CAPABILITY');
        return { supported: true };
      } catch (error) {
        if (error instanceof HttpApiError && error.code === 'ENDPOINT_UNAVAILABLE') {
          return { supported: false, reason: 'schema_not_ready' };
        }
        return normalizeError(error);
      }
    },

    async listByWorkspace(workspaceId) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId));
        return arrayData(response, 'TRACKING_REFERENCES').map(parseReference);
      } catch (error) {
        return normalizeError(error);
      }
    },

    async listStagedByWorkspace(workspaceId) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId, '/staged'));
        return arrayData(response, 'STAGED_TRACKING_REFERENCES').map(parseStaged);
      } catch (error) {
        return normalizeError(error);
      }
    },

    async listCanonicalTasksByIds(workspaceId, taskIds) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId, '/canonical-tasks'), {
          method: 'POST', body: { taskIds: [...new Set(taskIds)] },
        });
        return arrayData(response, 'TRACKING_CANONICAL_TASKS').map(parseHttpTask);
      } catch (error) {
        return normalizeError(error);
      }
    },

    async create(workspaceId, input: CreateTrackingReferenceInput) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId), {
          method: 'POST', body: operationBody(input),
        });
        return parseReference(data(response, 'TRACKING_CREATE'));
      } catch (error) {
        return normalizeError(error);
      }
    },

    async move(workspaceId, input: MoveTrackingReferenceInput) {
      try {
        const current = await service.listByWorkspace(workspaceId);
        const subtree = getReferenceSubtree(current, input.sourcePlacementId).map(item => item.id);
        const response = await client.request<unknown>(trackingPath(workspaceId, `/${ref(input.sourcePlacementId)}/move`), {
          method: 'POST', body: operationBody(input, subtree.length ? subtree : [input.sourcePlacementId]),
        });
        return parseReference(data(response, 'TRACKING_MOVE'));
      } catch (error) {
        return normalizeError(error);
      }
    },

    async stage(workspaceId, input: StageTrackingReferenceInput) {
      try {
        const current = await service.listByWorkspace(workspaceId);
        const subtree = getReferenceSubtree(current, input.sourcePlacementId).map(item => item.id);
        const response = await client.request<unknown>(trackingPath(workspaceId, `/${ref(input.sourcePlacementId)}/stage`), {
          method: 'POST', body: operationBody(input, subtree.length ? subtree : [input.sourcePlacementId]),
        });
        return parseStaged(data(response, 'TRACKING_STAGE'));
      } catch (error) {
        return normalizeError(error);
      }
    },

    async placeStaged(workspaceId, input: PlaceStagedTrackingReferenceInput) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId, `/${ref(input.sourcePlacementId)}/place-staged`), {
          method: 'POST', body: operationBody(input),
        });
        return parseReference(data(response, 'TRACKING_PLACE_STAGED'));
      } catch (error) {
        return normalizeError(error);
      }
    },

    async remove(workspaceId, input: TrackingReferenceMutation) {
      try {
        const current = await service.listByWorkspace(workspaceId);
        const subtree = getReferenceSubtree(current, input.sourcePlacementId).map(item => item.id);
        await client.request<unknown>(trackingPath(workspaceId, `/${ref(input.sourcePlacementId)}/remove`), {
          method: 'POST', body: operationBody(input, subtree.length ? subtree : [input.sourcePlacementId]),
        });
      } catch (error) {
        normalizeError(error);
      }
    },

    async restore(workspaceId, input: TrackingReferenceMutation) {
      try {
        const response = await client.request<unknown>(trackingPath(workspaceId, `/${ref(input.sourcePlacementId)}/restore`), {
          method: 'POST', body: operationBody(input),
        });
        return parseReference(data(response, 'TRACKING_RESTORE'));
      } catch (error) {
        return normalizeError(error);
      }
    },
  };
  return service;
}
