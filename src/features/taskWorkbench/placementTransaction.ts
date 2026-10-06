import type { TaskNode } from '../../types';
import { isSupabaseBackend, nodeService } from '../../services/dataBackend';
import { supabaseTaskWorkbenchPlacementService } from '../../services/supabase/taskWorkbenchUnplacedService';
import {
  isTaskWorkbenchUnplacedTask,
  removeTaskWorkbenchUnplacedTask,
  upsertTaskWorkbenchUnplacedTask,
} from './placement';
import {
  projectMoveTaskSubtreeCommand,
  type MoveTaskSubtreeCommand,
  type MoveTaskSubtreeResult,
  type TaskPlacementCanonicalNode,
} from './taskPlacementCommand';

export type TaskWorkbenchPlacementCommandTransaction = {
  command: MoveTaskSubtreeCommand;
  accountId: string | null | undefined;
  nodesRecord: Record<string, TaskNode>;
};

export type TaskWorkbenchPlacementCommandResult = MoveTaskSubtreeResult & {
  activityLoggedRemotely: boolean;
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

const mergeCanonicalNode = (
  node: TaskNode,
  canonical: TaskPlacementCanonicalNode,
): TaskNode => ({
  ...node,
  ...canonical,
});

const persistFallbackSiblingPatches = async (
  canonicalNodes: TaskPlacementCanonicalNode[],
  movedIds: Set<string>,
  nodesRecord: Record<string, TaskNode>,
  accountId: string | null | undefined,
) => {
  for (const canonical of canonicalNodes) {
    if (movedIds.has(canonical.id)) continue;
    const before = nodesRecord[canonical.id];
    if (!before) continue;
    const after = mergeCanonicalNode(before, canonical);
    if (isTaskWorkbenchUnplacedTask(after)) {
      upsertTaskWorkbenchUnplacedTask(after, accountId);
    } else if (after.workspaceId && after.boardId) {
      await nodeService.update(after.workspaceId, after.boardId, after.id, {
        parentId: after.parentId,
        order: after.order,
        updatedAt: after.updatedAt,
      });
    }
  }
};

const restoreFallbackSiblingPatches = async (
  canonicalNodes: TaskPlacementCanonicalNode[],
  movedIds: Set<string>,
  nodesRecord: Record<string, TaskNode>,
  accountId: string | null | undefined,
) => {
  for (const canonical of [...canonicalNodes].reverse()) {
    if (movedIds.has(canonical.id)) continue;
    const before = nodesRecord[canonical.id];
    if (!before) continue;
    if (isTaskWorkbenchUnplacedTask(before)) {
      upsertTaskWorkbenchUnplacedTask(before, accountId);
    } else if (before.workspaceId && before.boardId) {
      await nodeService.update(before.workspaceId, before.boardId, before.id, {
        parentId: before.parentId,
        order: before.order,
        updatedAt: before.updatedAt,
      }).catch(() => undefined);
    }
  }
};

const persistFallbackPlacement = async (
  command: MoveTaskSubtreeCommand,
  nodesRecord: Record<string, TaskNode>,
  accountId: string | null | undefined,
): Promise<MoveTaskSubtreeResult> => {
  const projected = projectMoveTaskSubtreeCommand(command, nodesRecord);
  const movedIds = new Set(command.expectedSubtreeIds);
  const canonicalById = new Map(projected.canonicalNodes.map(node => [node.id, node]));
  const beforeMovedNodes = command.expectedSubtreeIds.map(id => nodesRecord[id]);
  const afterMovedNodes = beforeMovedNodes.map(node => {
    const canonical = canonicalById.get(node.id);
    if (!canonical) throw new Error(`Canonical task placement node is missing: ${node.id}`);
    return mergeCanonicalNode(node, canonical);
  });
  const direction = projected.direction;
  const createdBoardNodes: TaskNode[] = [];
  const deletedBoardNodes: TaskNode[] = [];

  try {
    if (direction === 'to_board') {
      for (const node of afterMovedNodes) {
        if (!node.workspaceId || !node.boardId) throw new Error('Target board is required.');
        await nodeService.create(node.workspaceId, node.boardId, node);
        createdBoardNodes.push(node);
      }
      await persistFallbackSiblingPatches(projected.canonicalNodes, movedIds, nodesRecord, accountId);
      beforeMovedNodes.forEach(node => removeTaskWorkbenchUnplacedTask(node.id, accountId));
    } else {
      afterMovedNodes.forEach(node => upsertTaskWorkbenchUnplacedTask(node, accountId));
      for (const node of [...beforeMovedNodes].reverse()) {
        if (!node.workspaceId || !node.boardId) throw new Error('Source board is required.');
        await nodeService.delete(node.workspaceId, node.boardId, node.id);
        deletedBoardNodes.push(node);
      }
      await persistFallbackSiblingPatches(projected.canonicalNodes, movedIds, nodesRecord, accountId);
    }
    return projected;
  } catch (error) {
    if (direction === 'to_board') {
      for (const node of [...createdBoardNodes].reverse()) {
        await nodeService.delete(node.workspaceId, node.boardId, node.id).catch(() => undefined);
      }
      beforeMovedNodes.forEach(node => upsertTaskWorkbenchUnplacedTask(node, accountId));
    } else {
      for (const node of [...deletedBoardNodes].reverse()) {
        await nodeService.create(node.workspaceId, node.boardId, node).catch(() => undefined);
      }
      afterMovedNodes.forEach(node => removeTaskWorkbenchUnplacedTask(node.id, accountId));
    }
    await restoreFallbackSiblingPatches(projected.canonicalNodes, movedIds, nodesRecord, accountId);
    throw error;
  }
};

const syncUnplacedLocalCache = (
  result: MoveTaskSubtreeResult,
  nodesRecord: Record<string, TaskNode>,
  accountId: string | null | undefined,
) => {
  const movedIds = new Set(result.movedTaskIds);
  if (result.direction === 'to_board') {
    result.movedTaskIds.forEach(id => removeTaskWorkbenchUnplacedTask(id, accountId));
  }
  result.canonicalNodes.forEach(canonical => {
    const before = nodesRecord[canonical.id];
    if (!before) return;
    const after = mergeCanonicalNode(before, canonical);
    if (isTaskWorkbenchUnplacedTask(after)) {
      upsertTaskWorkbenchUnplacedTask(after, accountId);
    } else if (!movedIds.has(after.id) && isTaskWorkbenchUnplacedTask(before)) {
      removeTaskWorkbenchUnplacedTask(after.id, accountId);
    }
  });
};

export const persistTaskWorkbenchPlacementCommand = async ({
  command,
  accountId,
  nodesRecord,
}: TaskWorkbenchPlacementCommandTransaction): Promise<TaskWorkbenchPlacementCommandResult> => {
  await applyPlacementTestFault();

  if (!isSupabaseBackend) {
    const result = await persistFallbackPlacement(command, nodesRecord, accountId);
    return { ...result, activityLoggedRemotely: false };
  }
  if (!accountId) throw new Error('Authenticated account is required to move global workbench tasks.');

  const startedAt = Date.now();
  await supabaseTaskWorkbenchPlacementService.begin(accountId, command);
  try {
    let result: MoveTaskSubtreeResult | null = null;
    try {
      result = await supabaseTaskWorkbenchPlacementService.commit(command);
    } catch (error) {
      if (!isRetryablePlacementError(error)) throw error;
      try {
        result = await supabaseTaskWorkbenchPlacementService.commit(command);
      } catch (retryError) {
        if (!isRetryablePlacementError(retryError)) throw retryError;
        try {
          await supabaseTaskWorkbenchPlacementService.fail(
            accountId,
            command.operationId,
            retryError,
            Date.now() - startedAt,
          );
          const readback = await supabaseTaskWorkbenchPlacementService.read(accountId, command.operationId);
          if (readback?.status === 'committed' && readback.result) {
            result = supabaseTaskWorkbenchPlacementService.parseResult(readback.result, command.operationId);
          } else {
            throw retryError;
          }
        } catch (resolutionError) {
          if (resolutionError === retryError) throw resolutionError;
          throw new TaskPlacementOutcomeUnknownError(resolutionError);
        }
      }
    }
    if (!result) throw new TaskPlacementOutcomeUnknownError(undefined);
    syncUnplacedLocalCache(result, nodesRecord, accountId);
    return { ...result, activityLoggedRemotely: true };
  } catch (error) {
    if (!isTaskPlacementOutcomeUnknownError(error)) {
      await supabaseTaskWorkbenchPlacementService
        .fail(accountId, command.operationId, error, Date.now() - startedAt)
        .catch(failError => {
          console.warn('[taskWorkbench] Failed to record placement failure.', failError);
        });
    }
    throw error;
  }
};
