import type { TaskNode } from '../../types';
import { createBlankTaskNode } from '../../features/taskCreation/createBlankTaskNode';

export const DEFAULT_MINDMAP_TASK_TITLE = '新任務';

const createMindMapNodeId = () =>
  `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

interface CreateMindMapTaskNodeOptions {
  workspaceId: string;
  boardId: string;
  parentId: string | null;
  order: number;
  title?: string;
  now?: number;
}

interface MindMapSiblingTaskCreatePlanInput {
  nodeId: string | null;
  nodes: Record<string, TaskNode>;
  boardId: string;
}

interface MindMapChildTaskCreatePlanInput {
  nodeId: string | null;
  nodes: Record<string, TaskNode>;
}

interface MindMapTaskCreatePlan {
  parentId: string | null;
  inheritRootSideFromId?: string;
  anchorId?: string;
}

export const createMindMapTaskNode = ({
  workspaceId,
  boardId,
  parentId,
  order,
  title = DEFAULT_MINDMAP_TASK_TITLE,
  now = Date.now(),
}: CreateMindMapTaskNodeOptions): TaskNode => createBlankTaskNode({
  id: createMindMapNodeId(),
  workspaceId,
  boardId,
  parentId,
  title,
  nodeType: 'task',
  order,
  now,
});

export const getCommittedMindMapTitle = (title: string) =>
  title.trim() || DEFAULT_MINDMAP_TASK_TITLE;

export const getMindMapSiblingTaskCreatePlan = ({
  nodeId,
  nodes,
  boardId,
}: MindMapSiblingTaskCreatePlanInput): MindMapTaskCreatePlan | null => {
  if (!nodeId) return null;
  const selected = nodes[nodeId];
  if (!selected || selected.boardId !== boardId || selected.isArchived) return null;
  return {
    parentId: selected.parentId || null,
    anchorId: selected.id,
    inheritRootSideFromId: selected.parentId ? undefined : selected.id,
  };
};

export const getMindMapChildTaskCreatePlan = ({
  nodeId,
  nodes,
}: MindMapChildTaskCreatePlanInput): MindMapTaskCreatePlan | null => {
  if (!nodeId) return null;
  const selected = nodes[nodeId];
  if (!selected || selected.isArchived) return null;
  return {
    parentId: selected.id,
  };
};
