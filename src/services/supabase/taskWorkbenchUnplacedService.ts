import type { TaskNode } from '../../types';
import { isSupabaseConfigured, supabase } from './client';
import type { Json, TaskWorkbenchUnplacedItemRow } from './database.types';

const TABLE_NAME = 'task_workbench_unplaced_items' as const;
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
    parentId: null,
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
