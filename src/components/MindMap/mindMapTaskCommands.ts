import type { TaskNode } from '../../types';
import { createBlankTaskNode } from '../../features/taskCreation/createBlankTaskNode';
import { getSiblingNodes } from './mindMapTree';

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
  parentNodesIndex: Record<string, string[]>;
  boardId: string;
}

interface MindMapChildTaskCreatePlanInput {
  nodeId: string | null;
  nodes: Record<string, TaskNode>;
  getChildren: (nodeId: string) => TaskNode[];
}

interface MindMapTaskCreatePlan {
  parentId: string | null;
  order: number;
  inheritRootSideFromId?: string;
  siblingOrderUpdates?: Record<string, { order: number }>;
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

export const getNextMindMapRootOrder = (rootNodes: TaskNode[]) =>
  rootNodes.length > 0 ? Math.max(...rootNodes.map(node => node.order)) + 1 : 0;

export const getNextMindMapChildOrder = (children: TaskNode[]) =>
  children.length > 0 ? Math.max(...children.map(node => node.order)) + 1 : 0;

export const getNextMindMapSideRootOrder = (
  sameSideRoots: TaskNode[],
  fallbackOrder: number,
) =>
  sameSideRoots.length > 0
    ? Math.max(...sameSideRoots.map(node => node.order)) + 1
    : fallbackOrder;

export const getMindMapSiblingTaskCreatePlan = ({
  nodeId,
  nodes,
  parentNodesIndex,
  boardId,
}: MindMapSiblingTaskCreatePlanInput): MindMapTaskCreatePlan | null => {
  if (!nodeId) return null;
  const selected = nodes[nodeId];
  if (!selected) return null;
  const siblings = getSiblingNodes(nodes, parentNodesIndex, selected.parentId, boardId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const index = siblings.findIndex(sibling => sibling.id === selected.id);
  if (index < 0) return null;
  // Supabase stores WBS and primary placement order as integers. Make room
  // only until the next gap instead of creating an unsavable fractional order.
  const order = Math.floor(selected.order) + 1;
  const siblingOrderUpdates: Record<string, { order: number }> = {};
  let nextOrder = order + 1;
  for (const sibling of siblings.slice(index + 1)) {
    if (sibling.order >= nextOrder) break;
    siblingOrderUpdates[sibling.id] = { order: nextOrder++ };
  }
  return {
    parentId: selected.parentId || null,
    order,
    inheritRootSideFromId: selected.parentId ? undefined : selected.id,
    siblingOrderUpdates,
  };
};

export const getMindMapChildTaskCreatePlan = ({
  nodeId,
  nodes,
  getChildren,
}: MindMapChildTaskCreatePlanInput): MindMapTaskCreatePlan | null => {
  if (!nodeId) return null;
  const selected = nodes[nodeId];
  if (!selected) return null;
  return {
    parentId: selected.id,
    order: getNextMindMapChildOrder(getChildren(selected.id)),
  };
};
