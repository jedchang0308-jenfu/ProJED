import type { TaskNode } from '../../types';
import type {
  MoveTaskSubtreeCommand,
  MoveTaskSubtreeResult,
  PlacementScope,
  TaskOwnershipRef,
  TaskPlacementCanonicalNode,
} from '../../features/taskWorkbench/taskPlacementCommand';
import { parseHttpTask } from './domainReadAdapter';
import { HttpApiClient } from './httpApiClient';

export type HttpTaskWorkbenchPlacementResult = MoveTaskSubtreeResult & {
  activityLoggedRemotely: true;
};

export type HttpExpectedActor = {
  accountId: string;
  contextId: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`HTTP_API_INVALID_${label}`);
  return value as Record<string, unknown>;
}

function data(value: unknown, label: string): unknown {
  const envelope = object(value, `${label}_ENVELOPE`);
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) throw new Error(`HTTP_API_INVALID_${label}_ENVELOPE`);
  return envelope.data;
}

function ref(value: string): string {
  const hasControl = Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!value || value.trim() !== value || value.includes('/') || value.includes('\\') || hasControl) {
    throw new Error('HTTP_API_INVALID_TASK_REF');
  }
  return encodeURIComponent(value);
}

function parseOwnership(value: unknown): TaskOwnershipRef {
  const candidate = object(value, 'PLACEMENT_OWNERSHIP');
  if (candidate.kind === 'account_unplaced') return { kind: 'account_unplaced' };
  if (candidate.kind === 'board' && typeof candidate.workspaceId === 'string' && typeof candidate.boardId === 'string') {
    return { kind: 'board', workspaceId: candidate.workspaceId, boardId: candidate.boardId };
  }
  throw new Error('HTTP_API_INVALID_PLACEMENT_OWNERSHIP');
}

function parseScope(value: unknown): PlacementScope {
  const candidate = object(value, 'PLACEMENT_SCOPE');
  return {
    ownership: parseOwnership(candidate.ownership),
    parentId: typeof candidate.parentId === 'string' && candidate.parentId ? candidate.parentId : null,
  };
}

function parseCanonicalNode(value: unknown): TaskPlacementCanonicalNode {
  const candidate = object(value, 'PLACEMENT_NODE');
  if (typeof candidate.id !== 'string' || typeof candidate.workspaceId !== 'string'
      || typeof candidate.boardId !== 'string' || typeof candidate.order !== 'number'
      || !Number.isFinite(candidate.order) || typeof candidate.nodeType !== 'string'
      || !Number.isSafeInteger(candidate.updatedAt) || Number(candidate.updatedAt) < 0) {
    throw new Error('HTTP_API_INVALID_PLACEMENT_NODE');
  }
  return {
    id: candidate.id,
    workspaceId: candidate.workspaceId,
    boardId: candidate.boardId,
    parentId: typeof candidate.parentId === 'string' && candidate.parentId ? candidate.parentId : null,
    order: candidate.order,
    nodeType: candidate.nodeType as TaskNode['nodeType'],
    ...(typeof candidate.kanbanStageId === 'string' ? { kanbanStageId: candidate.kanbanStageId } : {}),
    updatedAt: Number(candidate.updatedAt),
  };
}

function parsePlacement(value: unknown, operationId: string): HttpTaskWorkbenchPlacementResult {
  const candidate = object(data(value, 'PLACEMENT'), 'PLACEMENT_RESULT');
  if (candidate.status !== 'committed' || candidate.operationId !== operationId
      || (candidate.direction !== 'to_board' && candidate.direction !== 'to_unplaced')
      || !Array.isArray(candidate.movedTaskIds) || candidate.movedTaskIds.some(id => typeof id !== 'string')
      || !Array.isArray(candidate.canonicalNodes) || !Array.isArray(candidate.affectedScopes)
      || candidate.activityLoggedRemotely !== true) {
    throw new Error('HTTP_API_INVALID_PLACEMENT_RESULT');
  }
  return {
    operationId,
    status: 'committed',
    direction: candidate.direction,
    movedTaskIds: candidate.movedTaskIds as string[],
    canonicalNodes: candidate.canonicalNodes.map(parseCanonicalNode),
    affectedScopes: candidate.affectedScopes.map(parseScope),
    activityLoggedRemotely: true,
  };
}

export function createHttpTaskWorkbenchAdapter(client: HttpApiClient) {
  return {
    async list(expectedActor: HttpExpectedActor, signal?: AbortSignal): Promise<TaskNode[]> {
      const value = data(await client.request<unknown>('/api/v1/task-workbench/unplaced', {
        expectedActor,
        signal,
      }), 'UNPLACED_LIST');
      if (!Array.isArray(value)) throw new Error('HTTP_API_INVALID_UNPLACED_LIST');
      return value.map(parseHttpTask);
    },

    async upsert(task: TaskNode, expectedActor: HttpExpectedActor, signal?: AbortSignal): Promise<TaskNode> {
      const response = await client.request<unknown>(`/api/v1/task-workbench/unplaced/${ref(task.id)}`, {
        method: 'PUT', body: { task }, expectedActor, signal,
      });
      return parseHttpTask(data(response, 'UNPLACED_UPSERT'));
    },

    async remove(taskId: string, expectedActor: HttpExpectedActor, signal?: AbortSignal): Promise<void> {
      await client.request<unknown>(`/api/v1/task-workbench/unplaced/${ref(taskId)}`, {
        method: 'DELETE', expectedActor, signal,
      });
    },

    async place(command: MoveTaskSubtreeCommand, expectedActor: HttpExpectedActor, signal?: AbortSignal): Promise<HttpTaskWorkbenchPlacementResult> {
      return parsePlacement(await client.request<unknown>('/api/v1/task-workbench/placements', {
        method: 'POST', body: command, expectedActor, signal,
      }), command.operationId);
    },
  };
}
