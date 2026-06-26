import type { TaskNode } from '../../types';
import {
  getInsertOrder,
  getSiblingNodes,
} from './mindMapTree';
import {
  collectMindMapDescendantIds,
  getNextSelectionAfterDelete,
} from './mindMapSelection';

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

interface MindMapArchiveTaskPlanInput {
  selectedNodeId: string | null;
  nodes: Record<string, TaskNode>;
  parentNodesIndex: Record<string, string[]>;
  boardId: string;
  rootNodes: TaskNode[];
  getChildren: (nodeId: string) => TaskNode[];
}

interface MindMapTaskCreatePlan {
  parentId: string | null;
  order: number;
  inheritRootSideFromId?: string;
}

interface MindMapArchiveTaskPlan {
  selected: TaskNode;
  descendantIds: string[];
  deletingIds: Set<string>;
  nextSelectionId: string | null;
}

export const createMindMapTaskNode = ({
  workspaceId,
  boardId,
  parentId,
  order,
  title = DEFAULT_MINDMAP_TASK_TITLE,
  now = Date.now(),
}: CreateMindMapTaskNodeOptions): TaskNode => ({
  id: createMindMapNodeId(),
  workspaceId,
  boardId,
  parentId,
  title,
  status: 'todo',
  nodeType: 'task',
  order,
  createdAt: now,
  updatedAt: now,
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
  const siblings = getSiblingNodes(nodes, parentNodesIndex, selected.parentId, boardId);
  return {
    parentId: selected.parentId || null,
    order: getInsertOrder(siblings, selected.id, 'after'),
    inheritRootSideFromId: selected.parentId ? undefined : selected.id,
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

export const getMindMapArchiveTaskPlan = ({
  selectedNodeId,
  nodes,
  parentNodesIndex,
  boardId,
  rootNodes,
  getChildren,
}: MindMapArchiveTaskPlanInput): MindMapArchiveTaskPlan | null => {
  if (!selectedNodeId) return null;
  const selected = nodes[selectedNodeId];
  if (!selected) return null;
  const descendantIds = collectMindMapDescendantIds(selected.id, getChildren);
  const deletingIds = new Set([selected.id, ...descendantIds]);
  const siblings = getSiblingNodes(nodes, parentNodesIndex, selected.parentId, boardId);
  return {
    selected,
    descendantIds,
    deletingIds,
    nextSelectionId: getNextSelectionAfterDelete(selected, siblings, nodes, rootNodes, deletingIds),
  };
};
