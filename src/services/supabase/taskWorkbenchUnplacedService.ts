import type { TaskNode } from '../../types';
import type {
  MoveTaskSubtreeCommand,
  MoveTaskSubtreeResult,
  PlacementScope,
  TaskOwnershipRef,
  TaskPlacementCanonicalNode,
} from '../../features/taskWorkbench/taskPlacementCommand';
import { isSupabaseConfigured, supabase } from './client';
import type {
  Json,
  TaskWorkbenchPlacementOperationRow,
  TaskWorkbenchUnplacedItemRow,
} from './database.types';

const TABLE_NAME = 'task_workbench_unplaced_items' as const;
const PLACEMENT_OPERATIONS_TABLE = 'task_workbench_placement_operations' as const;
const UNPLACED_BOARD_ID = '__task_workbench_unplaced__';

const requireSupabase = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured.');
  }
};

const isMissingTableError = (error: unknown) => {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error ?? '');
  return message.includes(`Could not find the table 'public.${TABLE_NAME}'`)
    || message.includes(TABLE_NAME);
};

const assertNoError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const toTaskNode = (row: TaskWorkbenchUnplacedItemRow): TaskNode | null => {
  if (!row.task || typeof row.task !== 'object' || Array.isArray(row.task)) return null;
  const task = row.task as Record<string, unknown>;
  if (typeof task.title !== 'string' || typeof task.status !== 'string') return null;

  return {
    ...(task as unknown as TaskNode),
    id: row.id,
    workspaceId: row.workspace_id,
    boardId: UNPLACED_BOARD_ID,
    parentId: typeof task.parentId === 'string' && task.parentId.trim() ? task.parentId : null,
    order: row.sort_order,
  };
};

export const supabaseTaskWorkbenchUnplacedService = {
  list: async (): Promise<TaskNode[]> => {
    requireSupabase();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('owner_id,id,workspace_id,task,sort_order,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: true });

    if (isMissingTableError(error)) {
      throw new Error(`Remote unplaced-task table is not available yet: ${TABLE_NAME}`);
    }
    assertNoError(error);
    return ((data ?? []) as TaskWorkbenchUnplacedItemRow[])
      .map(toTaskNode)
      .filter((task): task is TaskNode => Boolean(task));
  },

  upsert: async (task: TaskNode, ownerId: string): Promise<void> => {
    requireSupabase();
    const payload = {
      owner_id: ownerId,
      id: task.id,
      workspace_id: task.workspaceId,
      task: task as unknown as Json,
      sort_order: task.order ?? 0,
    } satisfies Partial<TaskWorkbenchUnplacedItemRow>;
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'owner_id,id' });

    if (isMissingTableError(error)) {
      throw new Error(`Remote unplaced-task table is not available yet: ${TABLE_NAME}`);
    }
    assertNoError(error);
  },

  remove: async (taskId: string): Promise<void> => {
    requireSupabase();
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', taskId);

    if (isMissingTableError(error)) {
      throw new Error(`Remote unplaced-task table is not available yet: ${TABLE_NAME}`);
    }
    assertNoError(error);
  },
};

const getPlacementErrorCode = (error: unknown) => {
  if (typeof error === 'object' && error) {
    if ('code' in error && typeof error.code === 'string') return error.code.slice(0, 80);
    if ('message' in error && typeof error.message === 'string') return error.message.slice(0, 80);
  }
  return String(error ?? 'unknown').slice(0, 80);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseOwnership = (value: unknown): TaskOwnershipRef => {
  if (!isRecord(value)) throw new Error('Supabase returned an invalid task placement ownership.');
  if (value.kind === 'account_unplaced') return { kind: 'account_unplaced' };
  if (value.kind === 'board' && typeof value.workspaceId === 'string' && typeof value.boardId === 'string') {
    return { kind: 'board', workspaceId: value.workspaceId, boardId: value.boardId };
  }
  throw new Error('Supabase returned an invalid task placement ownership.');
};

const parsePlacementScope = (value: unknown): PlacementScope => {
  if (!isRecord(value)) throw new Error('Supabase returned an invalid task placement scope.');
  return {
    ownership: parseOwnership(value.ownership),
    parentId: typeof value.parentId === 'string' && value.parentId ? value.parentId : null,
  };
};

const parseCanonicalNode = (value: unknown): TaskPlacementCanonicalNode => {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.workspaceId !== 'string'
    || typeof value.boardId !== 'string'
    || typeof value.order !== 'number'
    || typeof value.nodeType !== 'string'
    || typeof value.updatedAt !== 'number') {
    throw new Error('Supabase returned an invalid canonical task placement node.');
  }
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    boardId: value.boardId,
    parentId: typeof value.parentId === 'string' && value.parentId ? value.parentId : null,
    order: value.order,
    nodeType: value.nodeType as TaskNode['nodeType'],
    kanbanStageId: typeof value.kanbanStageId === 'string' ? value.kanbanStageId : undefined,
    updatedAt: value.updatedAt,
  };
};

const parsePlacementResult = (value: unknown, operationId: string): MoveTaskSubtreeResult => {
  if (!isRecord(value)
    || value.status !== 'committed'
    || value.operationId !== operationId
    || (value.direction !== 'to_board' && value.direction !== 'to_unplaced')
    || !Array.isArray(value.movedTaskIds)
    || !Array.isArray(value.canonicalNodes)
    || !Array.isArray(value.affectedScopes)) {
    throw new Error('Supabase did not return a valid task placement result.');
  }
  const movedTaskIds = value.movedTaskIds.filter((id): id is string => typeof id === 'string');
  if (movedTaskIds.length !== value.movedTaskIds.length || movedTaskIds.length === 0) {
    throw new Error('Supabase returned invalid moved task ids.');
  }
  return {
    operationId,
    status: 'committed',
    direction: value.direction,
    movedTaskIds,
    canonicalNodes: value.canonicalNodes.map(parseCanonicalNode),
    affectedScopes: value.affectedScopes.map(parsePlacementScope),
  };
};

export const supabaseTaskWorkbenchPlacementService = {
  begin: async (
    ownerId: string,
    command: MoveTaskSubtreeCommand,
  ): Promise<void> => {
    requireSupabase();
    const direction = command.source.kind === 'account_unplaced' ? 'to_board' : 'to_unplaced';
    const sourceBoard = command.source.kind === 'board' ? command.source : null;
    const targetBoard = command.destination.ownership.kind === 'board'
      ? command.destination.ownership
      : null;
    const payload = {
      owner_id: ownerId,
      operation_id: command.operationId,
      command_version: command.commandVersion,
      direction,
      source_kind: command.source.kind,
      target_kind: command.destination.ownership.kind,
      root_task_id: command.rootTaskId,
      task_ids: command.expectedSubtreeIds as unknown as Json,
      source_workspace_id: sourceBoard?.workspaceId ?? null,
      source_board_id: sourceBoard?.boardId ?? null,
      target_workspace_id: targetBoard?.workspaceId ?? null,
      target_board_id: targetBoard?.boardId ?? null,
      target_parent_task_id: command.destination.parentId,
      anchor_task_id: command.destination.anchorTaskId,
      position: command.destination.position,
      status: 'pending',
      error_code: null,
      client_platform: command.clientPlatform,
      result: null,
      elapsed_ms: null,
    } satisfies Partial<TaskWorkbenchPlacementOperationRow>;
    const { error } = await supabase
      .from(PLACEMENT_OPERATIONS_TABLE)
      .upsert(payload, {
        onConflict: 'owner_id,operation_id',
        ignoreDuplicates: true,
      });
    assertNoError(error);
  },

  commit: async (command: MoveTaskSubtreeCommand): Promise<MoveTaskSubtreeResult> => {
    requireSupabase();
    const sourceBoard = command.source.kind === 'board' ? command.source : null;
    const targetBoard = command.destination.ownership.kind === 'board'
      ? command.destination.ownership
      : null;
    const { data, error } = await supabase.rpc('move_task_workbench_subtree_v2', {
      p_operation_id: command.operationId,
      p_root_task_id: command.rootTaskId,
      p_expected_subtree_ids: command.expectedSubtreeIds as unknown as Json,
      p_source_kind: command.source.kind,
      p_source_workspace_id: sourceBoard?.workspaceId ?? null,
      p_source_board_id: sourceBoard?.boardId ?? null,
      p_target_kind: command.destination.ownership.kind,
      p_target_workspace_id: targetBoard?.workspaceId ?? null,
      p_target_board_id: targetBoard?.boardId ?? null,
      p_target_parent_task_id: command.destination.parentId,
      p_anchor_task_id: command.destination.anchorTaskId,
      p_position: command.destination.position,
      p_client_platform: command.clientPlatform,
    });
    assertNoError(error);
    return parsePlacementResult(data, command.operationId);
  },

  parseResult: (value: Json, operationId: string) => parsePlacementResult(value, operationId),

  read: async (
    ownerId: string,
    operationId: string,
  ): Promise<TaskWorkbenchPlacementOperationRow | null> => {
    requireSupabase();
    const { data, error } = await supabase
      .from(PLACEMENT_OPERATIONS_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('operation_id', operationId)
      .maybeSingle();
    assertNoError(error);
    return data;
  },

  fail: async (
    ownerId: string,
    operationId: string,
    error: unknown,
    elapsedMs: number,
  ): Promise<void> => {
    requireSupabase();
    const { error: updateError } = await supabase
      .from(PLACEMENT_OPERATIONS_TABLE)
      .update({
        status: 'failed',
        error_code: getPlacementErrorCode(error),
        elapsed_ms: Math.max(0, Math.round(elapsedMs)),
      })
      .eq('owner_id', ownerId)
      .eq('operation_id', operationId)
      .eq('status', 'pending');
    assertNoError(updateError);
  },
};
