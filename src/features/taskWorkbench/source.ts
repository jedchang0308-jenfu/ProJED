import type { TaskNode } from '../../types';
import { nodeService } from '../../services/dataBackend';

export type TaskWorkbenchBoardSource = {
  workspaceId: string;
  boardId: string;
};

type ListBoardTasks = (workspaceId: string, boardId: string) => Promise<TaskNode[]>;

export type TaskWorkbenchTaskSourceResult = {
  tasks: TaskNode[];
  loadedBoardIds: string[];
  failedBoardIds: string[];
};

export const isTaskWorkbenchSortableTask = (task: Pick<TaskNode, 'nodeType'> | null | undefined) =>
  Boolean(task && task.nodeType !== 'group');

export const listWorkbenchTasks = async (
  boardSources: TaskWorkbenchBoardSource[],
  listBoardTasks: ListBoardTasks = nodeService.listByProject,
): Promise<TaskWorkbenchTaskSourceResult> => {
  const results = await Promise.all(boardSources.map(async source => {
    try {
      return {
        source,
        tasks: await listBoardTasks(source.workspaceId, source.boardId),
        ok: true,
      };
    } catch (error) {
      console.warn('[taskWorkbench] Failed to load board tasks:', {
        workspaceId: source.workspaceId,
        boardId: source.boardId,
        error,
      });
      return {
        source,
        tasks: [],
        ok: false,
      };
    }
  }));

  return {
    tasks: results.flatMap(result => result.tasks),
    loadedBoardIds: results.filter(result => result.ok).map(result => result.source.boardId),
    failedBoardIds: results.filter(result => !result.ok).map(result => result.source.boardId),
  };
};
