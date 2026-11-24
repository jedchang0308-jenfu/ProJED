import type { TaskNode } from '../types';
import type { DataBackend } from './backendMode';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../features/taskWorkbench/placementModel';

export interface TaskDetailsCanonicalReadPorts {
  backend: DataBackend;
  readLocalUnplaced(accountId: string | null): TaskNode[];
  listHttpUnplaced(accountId: string): Promise<TaskNode[]>;
  listSupabaseUnplaced(): Promise<TaskNode[]>;
  listBoard(workspaceId: string, boardId: string): Promise<TaskNode[]>;
}

/** Recovery reads must not run the unplaced loader: it can migrate local writes.
 * An HTTP account's local fallback is not proof of its server commit outcome. */
export async function readTaskDetailsCanonical(
  source: TaskNode,
  accountId: string | null,
  ports: TaskDetailsCanonicalReadPorts,
): Promise<TaskNode | undefined> {
  if (source.boardId !== TASK_WORKBENCH_UNPLACED_BOARD_ID) {
    return (await ports.listBoard(source.workspaceId, source.boardId)).find(task => task.id === source.id);
  }
  if (ports.backend === 'http') {
    if (!accountId) return undefined;
    return (await ports.listHttpUnplaced(accountId)).find(task => task.id === source.id);
  }
  const local = ports.readLocalUnplaced(accountId).find(task => task.id === source.id);
  if (local || ports.backend !== 'supabase' || !accountId) return local;
  return (await ports.listSupabaseUnplaced()).find(task => task.id === source.id);
}
