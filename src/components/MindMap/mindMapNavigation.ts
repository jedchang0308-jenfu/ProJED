import type { TaskNode } from '../../types';
import type { MindMapDirection } from './MindMapNode';

export type MindMapNavigationIndex = Readonly<{
  nodeIds: readonly string[];
  positionByNodeId: ReadonlyMap<string, number>;
  sideByNodeId: ReadonlyMap<string, MindMapDirection>;
  rootIdByNodeId: ReadonlyMap<string, string>;
  rootIdsBySide: Readonly<Record<MindMapDirection, readonly string[]>>;
  rootPositionById: ReadonlyMap<string, number>;
}>;

export type MindMapHorizontalSelection = Readonly<{
  nodeId: string;
  expandNodeId: string | null;
}>;

export const buildMindMapNavigationIndex = (
  rootsBySide: Readonly<Record<MindMapDirection, readonly TaskNode[]>>,
  expandedNodeIds: ReadonlySet<string>,
  getChildren: (nodeId: string) => readonly TaskNode[],
): MindMapNavigationIndex => {
  const nodeIds: string[] = [];
  const positionByNodeId = new Map<string, number>();
  const sideByNodeId = new Map<string, MindMapDirection>();
  const rootIdByNodeId = new Map<string, string>();
  const rootIdsBySide: Record<MindMapDirection, string[]> = { left: [], right: [] };
  const rootPositionById = new Map<string, number>();
  const visited = new Set<string>();

  const visit = (node: TaskNode, side: MindMapDirection, rootId: string) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    positionByNodeId.set(node.id, nodeIds.length);
    sideByNodeId.set(node.id, side);
    rootIdByNodeId.set(node.id, rootId);
    nodeIds.push(node.id);
    if (!expandedNodeIds.has(node.id)) return;
    getChildren(node.id).forEach(child => visit(child, side, rootId));
  };

  const visitRoots = (side: MindMapDirection) => {
    rootsBySide[side].forEach(root => {
      if (visited.has(root.id)) return;
      rootPositionById.set(root.id, rootIdsBySide[side].length);
      rootIdsBySide[side].push(root.id);
      visit(root, side, root.id);
    });
  };

  visitRoots('left');
  visitRoots('right');

  return {
    nodeIds,
    positionByNodeId,
    sideByNodeId,
    rootIdByNodeId,
    rootIdsBySide,
    rootPositionById,
  };
};

export const getMindMapVerticalSelection = (
  currentNodeId: string,
  index: MindMapNavigationIndex,
  direction: 'up' | 'down',
): string | null => {
  const currentPosition = index.positionByNodeId.get(currentNodeId);
  if (currentPosition === undefined) return null;
  const nextPosition = direction === 'up'
    ? Math.max(0, currentPosition - 1)
    : Math.min(index.nodeIds.length - 1, currentPosition + 1);
  return index.nodeIds[nextPosition] || null;
};

const getOppositeSide = (side: MindMapDirection): MindMapDirection =>
  side === 'left' ? 'right' : 'left';

const getAlignedOppositeRoot = (
  rootId: string,
  side: MindMapDirection,
  index: MindMapNavigationIndex,
) => {
  const ownRoots = index.rootIdsBySide[side];
  const oppositeRoots = index.rootIdsBySide[getOppositeSide(side)];
  const ownPosition = index.rootPositionById.get(rootId);
  if (ownPosition === undefined || oppositeRoots.length === 0) return null;
  const relativePosition = ownRoots.length <= 1 ? 0.5 : ownPosition / (ownRoots.length - 1);
  const oppositePosition = Math.round(relativePosition * Math.max(0, oppositeRoots.length - 1));
  return oppositeRoots[oppositePosition] || null;
};

export const getMindMapHorizontalSelection = (
  currentNodeId: string,
  index: MindMapNavigationIndex,
  direction: MindMapDirection,
  getParentId: (nodeId: string) => string | null,
  getChildren: (nodeId: string) => readonly TaskNode[],
): MindMapHorizontalSelection | null => {
  const side = index.sideByNodeId.get(currentNodeId);
  const rootId = index.rootIdByNodeId.get(currentNodeId);
  if (!side || !rootId) return null;

  const movingAwayFromCenter = direction === side;
  if (movingAwayFromCenter) {
    const firstChildId = getChildren(currentNodeId)[0]?.id;
    return firstChildId
      ? { nodeId: firstChildId, expandNodeId: currentNodeId }
      : { nodeId: currentNodeId, expandNodeId: null };
  }

  const parentId = getParentId(currentNodeId);
  if (parentId && index.positionByNodeId.has(parentId)) {
    return { nodeId: parentId, expandNodeId: null };
  }

  const oppositeRootId = getAlignedOppositeRoot(rootId, side, index);
  return {
    nodeId: oppositeRootId || currentNodeId,
    expandNodeId: null,
  };
};
