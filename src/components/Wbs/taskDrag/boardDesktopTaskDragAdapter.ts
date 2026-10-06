import type { TaskNode } from '../../../types';
import {
  desktopTargetTypeToSurfaceKind,
  taskDragSourceKindToSurfaceKind,
} from './taskDropIntent';
import type { DesktopTaskDragSurfaceAdapter } from './desktopTaskDragAdapter';

/** Board adapter boundary: existing Board hit-test payloads remain intact,
 * while intent/commit ownership stays in the shared host authority. */
export const captureBoardDesktopTaskSource = ({
  activeData,
  nodesRecord,
}: {
  activeData: Record<string, any>;
  nodesRecord: Record<string, TaskNode>;
}) => {
  const nodeId = activeData?.nodeId;
  const node = nodeId ? nodesRecord[nodeId] : null;
  if (activeData?.trackingReference) return { kind: 'board-special' as const, activeData };
  const surfaceKind = taskDragSourceKindToSurfaceKind(activeData?.type);
  if (!node || !surfaceKind) return null;
  return {
    kind: 'primary' as const,
    descriptor: { nodeId, surfaceKind },
    workspaceId: node.workspaceId,
    boardId: node.boardId,
  };
};

export const resolveBoardDesktopTargetSurface = (targetData: Record<string, any>) => {
  const surfaceKind = desktopTargetTypeToSurfaceKind(targetData?.type);
  if (!surfaceKind || !targetData?.nodeId) return null;
  return {
    nodeId: targetData.nodeId,
    surfaceKind,
    orderingPosition: targetData.orderingPosition,
  } as const;
};

export const createBoardDesktopTaskDragAdapter = (
  collisionDetection: DesktopTaskDragSurfaceAdapter['collisionDetection'],
): Pick<DesktopTaskDragSurfaceAdapter, 'key' | 'collisionDetection'> => ({ key: 'board', collisionDetection });
