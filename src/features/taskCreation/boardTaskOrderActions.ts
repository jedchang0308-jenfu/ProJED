import type { TaskNode } from '../../types';
import { useWbsStore } from '../../store/useWbsStore';
import { toast } from '../../store/useToastStore';
import type { BoardTaskOrderDestination } from './boardTaskOrder';

export async function createOrderedBoardTask(node: TaskNode, anchorId?: string, reopenParent = false) {
  try {
    return await useWbsStore.getState().commitBoardTaskOrder({
      kind: 'create', node, workspaceId: node.workspaceId, boardId: node.boardId, reopenParent,
      destination: anchorId
        ? { parentId: node.parentId, anchorId, position: 'after' }
        : { parentId: node.parentId, position: 'append' },
    });
  } catch (error) {
    toast.error(error instanceof Error ? `新增任務失敗：${error.message}` : '新增任務失敗。');
    return null;
  }
}

export async function moveOrderedBoardTask(nodeId: string, destination: BoardTaskOrderDestination) {
  const node = useWbsStore.getState().nodes[nodeId];
  if (!node) return false;
  try {
    await useWbsStore.getState().commitBoardTaskOrder({
      kind: 'move', taskId: nodeId, workspaceId: node.workspaceId, boardId: node.boardId,
      sourceParentId: node.parentId, destination,
    });
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '移動任務失敗。');
    return false;
  }
}
