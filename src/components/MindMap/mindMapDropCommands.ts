import type { TaskNode } from '../../types';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';
import {
  getInsertOrder,
  getSiblingNodes,
  wouldCreateMindMapCycle,
  type SideOverrides,
} from './mindMapTree';
import {
  getNextMindMapChildOrder,
  getNextMindMapRootOrder,
  getNextMindMapSideRootOrder,
} from './mindMapTaskCommands';

type MindMapNodeDropBlockedReason = 'child-cycle' | 'hierarchy-cycle';

interface MindMapDropMoveUpdate {
  nodeId: string;
  parentId: string | null;
  order: number;
  rootSide?: MindMapDirection;
  expandNodeId?: string;
}

type MindMapNodeDropResult =
  | { type: 'blocked'; reason: MindMapNodeDropBlockedReason }
  | { type: 'move'; update: MindMapDropMoveUpdate };

interface MindMapNodeDropResultInput {
  boardId: string;
  draggedNodeId: string;
  mode: MindMapDropMode;
  target: TaskNode;
  nodes: Record<string, TaskNode>;
  parentNodesIndex: Record<string, string[]>;
  getChildren: (nodeId: string) => TaskNode[];
  getNodeSide: (nodeId: string) => MindMapDirection;
}

interface MindMapCenterDropUpdateInput {
  draggedNodeId: string;
  rootNodes: TaskNode[];
  sideOverrides: SideOverrides;
}

interface MindMapSideDropUpdateInput {
  draggedNodeId: string;
  direction: MindMapDirection;
  previewDirection?: MindMapDirection;
  rootNodes: TaskNode[];
  sideOverrides: SideOverrides;
  getNodeSide: (nodeId: string) => MindMapDirection;
}

export const getMindMapNodeDropResult = ({
  boardId,
  draggedNodeId,
  mode,
  target,
  nodes,
  parentNodesIndex,
  getChildren,
  getNodeSide,
}: MindMapNodeDropResultInput): MindMapNodeDropResult => {
  if (mode === 'child') {
    if (wouldCreateMindMapCycle(nodes, draggedNodeId, target.id)) {
      return { type: 'blocked', reason: 'child-cycle' };
    }

    const children = getChildren(target.id).filter(child => child.id !== draggedNodeId);
    return {
      type: 'move',
      update: {
        nodeId: draggedNodeId,
        parentId: target.id,
        order: getNextMindMapChildOrder(children),
        expandNodeId: target.id,
      },
    };
  }

  const nextParentId = target.parentId || null;
  if (wouldCreateMindMapCycle(nodes, draggedNodeId, nextParentId)) {
    return { type: 'blocked', reason: 'hierarchy-cycle' };
  }

  const siblings = getSiblingNodes(nodes, parentNodesIndex, nextParentId, boardId)
    .filter(node => node.id !== draggedNodeId);
  return {
    type: 'move',
    update: {
      nodeId: draggedNodeId,
      parentId: nextParentId,
      order: getInsertOrder(siblings, target.id, mode),
      rootSide: nextParentId ? undefined : getNodeSide(target.id),
    },
  };
};

export const getMindMapCenterDropUpdate = ({
  draggedNodeId,
  rootNodes,
  sideOverrides,
}: MindMapCenterDropUpdateInput): MindMapDropMoveUpdate => ({
  nodeId: draggedNodeId,
  parentId: null,
  order: getNextMindMapRootOrder(rootNodes.filter(node => node.id !== draggedNodeId)),
  rootSide: sideOverrides[draggedNodeId] ? undefined : 'right',
});

export const getMindMapSideDropUpdate = ({
  draggedNodeId,
  direction,
  previewDirection,
  rootNodes,
  sideOverrides,
  getNodeSide,
}: MindMapSideDropUpdateInput): MindMapDropMoveUpdate => {
  const finalDirection = previewDirection || direction;
  const sameSideRoots = rootNodes.filter(
    node => node.id !== draggedNodeId && (sideOverrides[node.id] || getNodeSide(node.id)) === finalDirection,
  );
  return {
    nodeId: draggedNodeId,
    parentId: null,
    order: getNextMindMapSideRootOrder(sameSideRoots, rootNodes.length + 1),
    rootSide: finalDirection,
  };
};
