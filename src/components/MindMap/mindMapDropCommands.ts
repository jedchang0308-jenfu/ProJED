import type { TaskNode } from '../../types';
import type { MindMapDirection, MindMapDropMode } from './MindMapNode';
import {
  wouldCreateMindMapCycle,
  type SideOverrides,
} from './mindMapTree';

type MindMapNodeDropBlockedReason = 'child-cycle' | 'hierarchy-cycle';

interface MindMapDropMoveUpdate {
  nodeId: string;
  parentId: string | null;
  rootSide?: MindMapDirection;
  anchorId?: string;
}

type MindMapNodeDropResult =
  | { type: 'blocked'; reason: MindMapNodeDropBlockedReason }
  | { type: 'move'; update: MindMapDropMoveUpdate & { expandNodeId: string } }
  | { type: 'reorder'; nodeId: string; anchorId: string; position: 'before' | 'after'; rootSide?: MindMapDirection };

interface MindMapNodeDropResultInput {
  draggedNodeId: string;
  mode: MindMapDropMode;
  target: TaskNode;
  nodes: Record<string, TaskNode>;
  getNodeSide: (nodeId: string) => MindMapDirection;
}

interface MindMapCenterDropUpdateInput {
  draggedNodeId: string;
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
  draggedNodeId,
  mode,
  target,
  nodes,
  getNodeSide,
}: MindMapNodeDropResultInput): MindMapNodeDropResult => {
  if (mode === 'child') {
    if (wouldCreateMindMapCycle(nodes, draggedNodeId, target.id)) {
      return { type: 'blocked', reason: 'child-cycle' };
    }

    return {
      type: 'move',
      update: {
        nodeId: draggedNodeId,
        parentId: target.id,
        expandNodeId: target.id,
      },
    };
  }

  const nextParentId = target.parentId || null;
  if (wouldCreateMindMapCycle(nodes, draggedNodeId, nextParentId)) {
    return { type: 'blocked', reason: 'hierarchy-cycle' };
  }

  return {
    type: 'reorder',
    nodeId: draggedNodeId,
    anchorId: target.id,
    position: mode,
    rootSide: nextParentId ? undefined : getNodeSide(target.id),
  };
};

export const getMindMapCenterDropUpdate = ({
  draggedNodeId,
  sideOverrides,
}: MindMapCenterDropUpdateInput): MindMapDropMoveUpdate => ({
  nodeId: draggedNodeId,
  parentId: null,
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
    node => node.id !== draggedNodeId && !node.isTrackingReference && (sideOverrides[node.id] || getNodeSide(node.id)) === finalDirection,
  );
  return {
    nodeId: draggedNodeId,
    parentId: null,
    anchorId: sameSideRoots[sameSideRoots.length - 1]?.id,
    rootSide: finalDirection,
  };
};
