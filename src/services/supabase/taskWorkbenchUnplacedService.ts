import type { TaskNode } from '../../types';
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

export type TaskWorkbenchPlacementDirection = 'to_unplaced' | 'to_board';

export type TaskWorkbenchPlacementOperationInput = {
  operationId: string;
  ownerId: string;
  direction: TaskWorkbenchPlacementDirection;
  rootTaskId: string;
  taskIds: string[];
  sourceWorkspaceId: string | null;
  sourceBoardId: string | null;
  targetWorkspaceId: string | null;
  targetBoardId: string | null;
  clientPlatform: string;
};

const getPlacementErrorCode = (error: unknown) => {
  if (typeof error === 'object' && error) {
    if ('code' in error && typeof error.code === 'string') return error.code.slice(0, 80);
    if ('message' in error && typeof error.message === 'string') return error.message.slice(0, 80);
  }
  return String(error ?? 'unknown').slice(0, 80);
};

export const supabaseTaskWorkbenchPlacementService = {
  begin: async (input: TaskWorkbenchPlacementOperationInput): Promise<void> => {
    requireSupabase();
    const payload = {
      owner_id: input.ownerId,
      operation_id: input.operationId,
      direction: input.direction,
      root_task_id: input.rootTaskId,
      task_ids: input.taskIds as unknown as Json,
      source_workspace_id: input.sourceWorkspaceId,
      source_board_id: input.sourceBoardId,
      target_workspace_id: input.targetWorkspaceId,
      target_board_id: input.targetBoardId,
      status: 'pending',
      error_code: null,
      client_platform: input.clientPlatform,
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

  commit: async (
    input: TaskWorkbenchPlacementOperationInput,
    nodes: TaskNode[],
  ): Promise<Json> => {
    requireSupabase();
    const { data, error } = await supabase.rpc('move_task_workbench_subtree', {
      p_operation_id: input.operationId,
      p_direction: input.direction,
      p_root_task_id: input.rootTaskId,
      p_source_workspace_id: input.sourceWorkspaceId,
      p_source_board_id: input.sourceBoardId,
      p_target_workspace_id: input.targetWorkspaceId,
      p_target_board_id: input.targetBoardId,
      p_nodes: nodes as unknown as Json,
    });
    assertNoError(error);
    if (!data || typeof data !== 'object') {
      throw new Error('Supabase did not return a task placement result.');
    }
    return data;
  },

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
