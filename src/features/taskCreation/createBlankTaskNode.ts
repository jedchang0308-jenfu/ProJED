import type { TaskDetailNote, TaskNode } from '../../types';

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

const createDefaultTaskDetailNotes = (): TaskDetailNote[] => [
  { id: 'note_default', title: '任務目的', content: '' },
  { id: 'note_default_secondary', title: '備註', content: '' },
];

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
}: CreateBlankTaskNodeInput): TaskNode => {
  const detailNotes = nodeType === 'task' ? createDefaultTaskDetailNotes() : undefined;

  return {
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
    ...(detailNotes ? { detailNotes } : {}),
  };
};
