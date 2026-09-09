import type { TaskNode } from '../../types';

export interface CreateBlankTaskNodeInput {
  id: string;
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  order: number;
  nodeType: NonNullable<TaskNode['nodeType']>;
  title?: string;
  now?: number;
  description?: never;
}

/**
 * Build the canonical content for a task created without a source document.
 * Placement, permissions, identity and post-create effects stay with the caller.
 */
export const createBlankTaskNode = ({
  id,
  workspaceId,
  boardId,
  parentId,
  order,
  nodeType,
  title,
  now = Date.now(),
}: CreateBlankTaskNodeInput): TaskNode => ({
  id,
  workspaceId,
  boardId,
  parentId,
  title: title?.trim() || '新任務',
  status: 'todo',
  nodeType,
  order,
  createdAt: now,
  updatedAt: now,
});
