import type { TaskNode } from '../../types';
import { isSupabaseBackend, nodeService } from '../../services/dataBackend';
import { supabaseTaskWorkbenchPlacementService } from '../../services/supabase/taskWorkbenchUnplacedService';
import {
  isTaskWorkbenchUnplacedTask,
  removeTaskWorkbenchUnplacedTask,
  upsertTaskWorkbenchUnplacedTask,
} from './placement';

export type TaskWorkbenchPlacementTransaction = {
  operationId: string;
  accountId: string | null | undefined;
  beforeNodes: TaskNode[];
  afterNodes: TaskNode[];
};

export type TaskWorkbenchPlacementTransactionResult = {
  activityLoggedRemotely: boolean;
  operationId: string;
};

export class TaskPlacementOutcomeUnknownError extends Error {
  constructor(cause: unknown) {
    super('Task placement outcome could not be confirmed.');
    this.name = 'TaskPlacementOutcomeUnknownError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export const isTaskPlacementOutcomeUnknownError = (error: unknown) =>
  error instanceof Error && error.name === 'TaskPlacementOutcomeUnknownError';

const getClientPlatform = () => {
  if (typeof window === 'undefined') return 'unknown';
  return window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop';
};

const getPlacementDirection = (beforeNodes: TaskNode[], afterNodes: TaskNode[]) => {
  const sourceIsUnplaced = beforeNodes.every(isTaskWorkbenchUnplacedTask);
  const targetIsUnplaced = afterNodes.every(isTaskWorkbenchUnplacedTask);
  if (sourceIsUnplaced === targetIsUnplaced) {
    throw new Error('Task placement transaction must cross the unplaced ownership boundary.');
  }
  if (sourceIsUnplaced && afterNodes.some(isTaskWorkbenchUnplacedTask)) {
    throw new Error('Task placement subtree has mixed target ownership.');
  }
  if (targetIsUnplaced && beforeNodes.some(isTaskWorkbenchUnplacedTask)) {
    throw new Error('Task placement subtree has mixed source ownership.');
  }
  return sourceIsUnplaced ? 'to_board' as const : 'to_unplaced' as const;
};

const getPlacementRootTaskId = (nodes: TaskNode[]) => {
  const nodeIds = new Set(nodes.map(node => node.id));
  const roots = nodes.filter(node => !node.parentId || !nodeIds.has(node.parentId));
  if (roots.length !== 1) {
    throw new Error('Task placement transaction requires exactly one subtree root.');
  }
  return roots[0].id;
};

const applyPlacementTestFault = async () => {
  if (import.meta.env.MODE !== 'test' || typeof window === 'undefined') return;
  const testWindow = window as typeof window & {
    __projedTaskPlacementTestFault?: { delayMs?: number; failNext?: boolean };
  };
  const fault = testWindow.__projedTaskPlacementTestFault;
  if (!fault) return;
  if (fault.delayMs && fault.delayMs > 0) {
    await new Promise(resolve => window.setTimeout(resolve, fault.delayMs));
  }
  if (fault.failNext) {
    delete testWindow.__projedTaskPlacementTestFault;
    throw new Error('Injected task placement persistence failure.');
  }
};

const isRetryablePlacementError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; status?: unknown };
  return candidate.name === 'AbortError'
    || (typeof candidate.status === 'number' && candidate.status >= 500);
};

const compensateCreatedBoardNodes = async (nodes: TaskNode[]) => {
  for (const node of [...nodes].reverse()) {
    if (!node.workspaceId || !node.boardId) continue;
    await nodeService.delete(node.workspaceId, node.boardId, node.id).catch(() => undefined);
  }
};

const persistFallbackPlacement = async (
  direction: 'to_unplaced' | 'to_board',
  beforeNodes: TaskNode[],
  afterNodes: TaskNode[],
  accountId: string | null | undefined,
) => {
  if (direction === 'to_board') {
    const created: TaskNode[] = [];
    try {
      for (const node of afterNodes) {
        if (!node.workspaceId || !node.boardId) throw new Error('Target board is required.');
        await nodeService.create(node.workspaceId, node.boardId, node);
        created.push(node);
      }
      beforeNodes.forEach(node => removeTaskWorkbenchUnplacedTask(node.id, accountId));
    } catch (error) {
      await compensateCreatedBoardNodes(created);
      throw error;
    }
    return;
  }

  const deleted: TaskNode[] = [];
  try {
    afterNodes.forEach(node => upsertTaskWorkbenchUnplacedTask(node, accountId));
    for (const node of beforeNodes) {
      if (!node.workspaceId || !node.boardId) throw new Error('Source board is required.');
      await nodeService.delete(node.workspaceId, node.boardId, node.id);
      deleted.push(node);
    }
  } catch (error) {
    for (const node of deleted) {
      if (!node.workspaceId || !node.boardId) continue;
      await nodeService.create(node.workspaceId, node.boardId, node).catch(() => undefined);
    }
    afterNodes.forEach(node => removeTaskWorkbenchUnplacedTask(node.id, accountId));
    throw error;
  }
};

export const persistTaskWorkbenchPlacementTransaction = async ({
  operationId,
  accountId,
  beforeNodes,
  afterNodes,
}: TaskWorkbenchPlacementTransaction): Promise<TaskWorkbenchPlacementTransactionResult> => {
  if (beforeNodes.length === 0 || beforeNodes.length !== afterNodes.length) {
    throw new Error('Task placement transaction requires matching source and target subtrees.');
  }
  const direction = getPlacementDirection(beforeNodes, afterNodes);
  const beforeIds = beforeNodes.map(node => node.id);
  if (beforeIds.some((id, index) => afterNodes[index]?.id !== id)) {
    throw new Error('Task placement transaction must preserve task identity and order.');
  }
  const rootTaskId = getPlacementRootTaskId(beforeNodes);
  await applyPlacementTestFault();

  if (!isSupabaseBackend) {
    await persistFallbackPlacement(direction, beforeNodes, afterNodes, accountId);
    return { activityLoggedRemotely: false, operationId };
  }
  if (!accountId) throw new Error('Authenticated account is required to move global workbench tasks.');

  const rootBefore = beforeNodes[0];
  const rootAfter = afterNodes[0];
  const operation = {
    operationId,
    ownerId: accountId,
    direction,
    rootTaskId,
    taskIds: beforeIds,
    sourceWorkspaceId: rootBefore.workspaceId || null,
    sourceBoardId: rootBefore.boardId || null,
    targetWorkspaceId: rootAfter.workspaceId || null,
    targetBoardId: rootAfter.boardId || null,
    clientPlatform: getClientPlatform(),
  };
  const startedAt = Date.now();
  await supabaseTaskWorkbenchPlacementService.begin(operation);
  try {
    let committed = false;
    try {
      await supabaseTaskWorkbenchPlacementService.commit(operation, afterNodes);
      committed = true;
    } catch (error) {
      if (!isRetryablePlacementError(error)) throw error;
      try {
        await supabaseTaskWorkbenchPlacementService.commit(operation, afterNodes);
        committed = true;
      } catch (retryError) {
        if (!isRetryablePlacementError(retryError)) throw retryError;
        try {
          // This conditional failure update serializes behind the RPC row lock.
          // If the RPC committed, it affects zero rows and readback returns the
          // committed result; if it rolled back, pending becomes failed.
          await supabaseTaskWorkbenchPlacementService.fail(
            accountId,
            operationId,
            retryError,
            Date.now() - startedAt,
          );
          const readback = await supabaseTaskWorkbenchPlacementService.read(accountId, operationId);
          if (readback?.status === 'committed' && readback.result) {
            committed = true;
          } else {
            throw retryError;
          }
        } catch (resolutionError) {
          if (resolutionError === retryError) throw resolutionError;
          throw new TaskPlacementOutcomeUnknownError(resolutionError);
        }
      }
    }
    if (!committed) throw new TaskPlacementOutcomeUnknownError(undefined);
    if (direction === 'to_board') {
      beforeNodes.forEach(node => removeTaskWorkbenchUnplacedTask(node.id, accountId));
    } else {
      afterNodes.forEach(node => upsertTaskWorkbenchUnplacedTask(node, accountId));
    }
    return { activityLoggedRemotely: true, operationId };
  } catch (error) {
    if (!isTaskPlacementOutcomeUnknownError(error)) {
      await supabaseTaskWorkbenchPlacementService
        .fail(accountId, operationId, error, Date.now() - startedAt)
        .catch(failError => {
          console.warn('[taskWorkbench] Failed to record placement failure.', failError);
        });
    }
    throw error;
  }
};
