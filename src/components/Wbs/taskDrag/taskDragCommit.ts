import type { TaskNode } from '../../../types';
import type { BatchNodeUpdates, WbsBoardActions } from '../../../store/useWbsStore';
import { useWbsStore } from '../../../store/useWbsStore';
import useDialogStore from '../../../store/useDialogStore';
import { toast } from '../../../store/useToastStore';
import { selectAndOpenTaskDetails } from '../../../utils/taskInteractions';
import { TASK_WORKBENCH_UNPLACED_BOARD_ID } from '../../../features/taskWorkbench/placement';
import type {
  MobileTaskAction,
  TaskDragCommitResult,
  TaskDragObservation,
} from './taskDragTypes';
import {
  buildTaskParentIndex,
  desktopTargetTypeToSurfaceKind,
  getTaskAppendOrder,
  isValidTaskDropIntent,
  resolveTaskDropIntent,
  taskDragSourceKindToSurfaceKind,
  type TaskDropIntent,
} from './taskDropIntent';
import {
  resolveDesktopTaskDropIntent,
  type DesktopTaskDropPreview,
} from './desktopTaskDropPreview';

export { buildTaskParentIndex, getTaskAppendOrder, isValidTaskDropIntent } from './taskDropIntent';

type TaskDragStoreActions = Pick<
  WbsBoardActions,
  'addNode' | 'updateNode' | 'batchUpdateNodes' | 'removeNode' | 'recalculateAncestorStatus'
>;

export interface TaskDragCommitDependencies extends TaskDragStoreActions {
  activeBoardId: string | null;
  activeWorkspaceId: string | null;
  canMoveTask: boolean;
  canEditTask: boolean;
  canCreateTask: boolean;
  canDeleteTask: boolean;
}

const committed = (reason: string): TaskDragCommitResult => ({ status: 'committed', reason });
const noOp = (reason: string): TaskDragCommitResult => ({ status: 'no-op', reason });

const getBoardRootAppendOrder = (
  boardId: string,
  excludeId: string | undefined,
  nodesRecord: Record<string, TaskNode>,
) => Object.values(nodesRecord).reduce((max, node) => {
  if (!node || node.isArchived || node.id === excludeId) return max;
  if (node.boardId !== boardId || node.parentId !== null) return max;
  return Math.max(max, node.order ?? 0);
}, -1) + 1;

export const normalizeTaskMoveUpdates = (
  draggedNodeId: string,
  intent: TaskDropIntent,
  nodesRecord: Record<string, TaskNode>,
): BatchNodeUpdates => {
  const originalParentIndex = buildTaskParentIndex(nodesRecord);
  const movedNodes = {
    ...nodesRecord,
    [draggedNodeId]: {
      ...nodesRecord[draggedNodeId],
      parentId: intent.parentId,
      nodeType: intent.nodeType,
      order: intent.order,
    },
  };
  const movedParentIndex = buildTaskParentIndex(movedNodes);
  const affectedParentKeys = Array.from(new Set([
    nodesRecord[draggedNodeId]?.parentId || 'root',
    intent.parentId || 'root',
  ]));
  const updates: BatchNodeUpdates = {};

  affectedParentKeys.forEach((parentKey) => {
    const ids = parentKey === (intent.parentId || 'root')
      ? (movedParentIndex[parentKey] || [])
      : (originalParentIndex[parentKey] || []).filter((id) => id !== draggedNodeId);
    ids.forEach((id, index) => {
      updates[id] = { ...(updates[id] || {}), order: index };
    });
  });

  updates[draggedNodeId] = {
    ...(updates[draggedNodeId] || {}),
    parentId: intent.parentId,
    nodeType: intent.nodeType,
    updatedAt: Date.now(),
  };
  return updates;
};

const getDesktopDropIntent = (
  activeData: Record<string, any>,
  overData: Record<string, any>,
  nodesRecord: Record<string, TaskNode>,
): TaskDropIntent | null => {
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(activeData?.type);
  const targetSurfaceKind = desktopTargetTypeToSurfaceKind(overData?.type);
  if (!sourceSurfaceKind || !targetSurfaceKind || !activeData?.nodeId || !overData?.nodeId) return null;
  return resolveTaskDropIntent({
    source: { nodeId: activeData.nodeId, surfaceKind: sourceSurfaceKind },
    target: { nodeId: overData.nodeId, surfaceKind: targetSurfaceKind },
    nodesRecord,
  });
};

export const commitDesktopTaskDrag = ({
  activeData,
  overData,
  desktopPreview,
  dependencies,
}: {
  activeData: Record<string, any>;
  overData: Record<string, any>;
  desktopPreview?: DesktopTaskDropPreview | null;
  dependencies: TaskDragCommitDependencies;
}): TaskDragCommitResult => {
  if (!dependencies.canMoveTask) return noOp('move-permission-denied');
  if (activeData?.source === 'task-workbench' && activeData?.placement !== 'unplaced') {
    return noOp('workbench-placed-row-is-not-a-source');
  }

  const state = useWbsStore.getState();
  const draggedNode = state.nodes[activeData?.nodeId];
  if (!draggedNode || draggedNode.isArchived) return noOp('source-missing');

  const isUnplacedTarget = overData?.type === 'task-workbench-unplaced-lane'
    || (overData?.source === 'task-workbench' && overData?.placement === 'unplaced');
  if (isUnplacedTarget) {
    dependencies.batchUpdateNodes({
      [draggedNode.id]: {
        boardId: TASK_WORKBENCH_UNPLACED_BOARD_ID,
        parentId: null,
        order: getBoardRootAppendOrder(TASK_WORKBENCH_UNPLACED_BOARD_ID, draggedNode.id, state.nodes),
        updatedAt: Date.now(),
      },
    }, { label: '移到未歸位', mergeKey: `placement:${draggedNode.id}` });
    dependencies.recalculateAncestorStatus(draggedNode.id);
    return committed('moved-to-unplaced');
  }

  if (overData?.type === 'task-workbench-placed-board-lane' && overData.boardId && overData.workspaceId) {
    dependencies.batchUpdateNodes({
      [draggedNode.id]: {
        workspaceId: overData.workspaceId,
        boardId: overData.boardId,
        parentId: null,
        order: getBoardRootAppendOrder(overData.boardId, draggedNode.id, state.nodes),
        nodeType: draggedNode.nodeType || 'task',
        updatedAt: Date.now(),
      },
    }, { label: '歸位任務', mergeKey: `placement:${draggedNode.id}` });
    dependencies.recalculateAncestorStatus(draggedNode.id);
    return committed('placed-on-board');
  }

  let intent: TaskDropIntent | null = null;
  if (desktopPreview) {
    if (desktopPreview.sourceNodeId !== draggedNode.id || desktopPreview.targetNodeId !== overData?.nodeId) {
      return noOp('desktop-preview-target-mismatch');
    }
    const latest = resolveDesktopTaskDropIntent({ activeData, targetData: overData, nodesRecord: state.nodes });
    if (!latest
      || latest.targetSurfaceKind !== desktopPreview.targetSurfaceKind
      || latest.intent.displayPosition !== desktopPreview.displayPosition
      || latest.intent.parentId !== desktopPreview.intent.parentId
      || latest.intent.order !== desktopPreview.intent.order
      || latest.intent.nodeType !== desktopPreview.intent.nodeType) {
      return noOp('desktop-preview-stale');
    }
    intent = latest.intent;
  } else {
    intent = getDesktopDropIntent(activeData, overData, state.nodes);
  }
  if (!isValidTaskDropIntent(draggedNode.id, intent, state.nodes) || !intent) {
    return noOp('invalid-drop-intent');
  }

  const updates = normalizeTaskMoveUpdates(draggedNode.id, intent, state.nodes);
  if (activeData?.source === 'task-workbench' && dependencies.activeWorkspaceId && dependencies.activeBoardId) {
    updates[draggedNode.id] = {
      ...(updates[draggedNode.id] || {}),
      workspaceId: dependencies.activeWorkspaceId,
      boardId: dependencies.activeBoardId,
      nodeType: intent.parentId ? 'task' : (updates[draggedNode.id]?.nodeType || draggedNode.nodeType),
    };
  }
  dependencies.batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
  dependencies.recalculateAncestorStatus(draggedNode.id);
  return committed('task-position-updated');
};

const createTaskNodeId = () =>
  `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const getSiblingInsertOrderAfter = (sourceNode: TaskNode, nodesRecord: Record<string, TaskNode>) => {
  const siblings = Object.values(nodesRecord)
    .filter((node) => node && !node.isArchived
      && (node.parentId || null) === (sourceNode.parentId || null)
      && node.boardId === sourceNode.boardId)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  const index = siblings.findIndex((node) => node.id === sourceNode.id);
  const nextSibling = index >= 0 ? siblings[index + 1] : null;
  return nextSibling
    ? ((sourceNode.order ?? 0) + (nextSibling.order ?? 0)) / 2
    : (sourceNode.order ?? 0) + 1;
};

const reopenCompletedTaskForInsert = (node: TaskNode | null | undefined, dependencies: TaskDragCommitDependencies) => {
  if (!node || node.status !== 'completed') return;
  if (!dependencies.canEditTask) {
    toast.warning('已新增任務，但你沒有權限自動變更完成狀態。');
    return;
  }
  dependencies.updateNode(node.id, { status: 'in_progress', updatedAt: Date.now() });
  toast.info('已將完成任務改為進行中，並新增任務。');
};

export const commitTaskDragAction = async ({
  action,
  nodeId,
  dependencies,
}: {
  action: MobileTaskAction;
  nodeId: string;
  dependencies: TaskDragCommitDependencies;
}): Promise<TaskDragCommitResult> => {
  const state = useWbsStore.getState();
  const node = state.nodes[nodeId];
  if (!node || node.isArchived) return noOp('source-missing');

  if (action === 'toggle-complete') {
    if (!dependencies.canEditTask) return noOp('edit-permission-denied');
    dependencies.updateNode(nodeId, {
      status: node.status === 'completed' ? 'todo' : 'completed',
      updatedAt: Date.now(),
    });
    dependencies.recalculateAncestorStatus(nodeId);
    return committed('completion-toggled');
  }

  if (action === 'add-sibling') {
    if (!dependencies.canCreateTask) return noOp('create-permission-denied');
    const parentNode = node.parentId ? state.nodes[node.parentId] : null;
    reopenCompletedTaskForInsert(parentNode, dependencies);
    const newNode: TaskNode = {
      id: createTaskNodeId(),
      workspaceId: node.workspaceId || dependencies.activeWorkspaceId || '',
      boardId: node.boardId || dependencies.activeBoardId || '',
      parentId: node.parentId || null,
      title: '新任務',
      status: 'todo',
      nodeType: node.parentId ? 'task' : (node.nodeType || 'task'),
      order: getSiblingInsertOrderAfter(node, state.nodes),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dependencies.addNode(newNode);
    selectAndOpenTaskDetails(newNode.id);
    return committed('sibling-created');
  }

  if (action === 'add-child') {
    if (!dependencies.canCreateTask) return noOp('create-permission-denied');
    reopenCompletedTaskForInsert(node, dependencies);
    const newNode: TaskNode = {
      id: createTaskNodeId(),
      workspaceId: node.workspaceId || dependencies.activeWorkspaceId || '',
      boardId: node.boardId || dependencies.activeBoardId || '',
      parentId: node.id,
      title: '新任務',
      status: 'todo',
      nodeType: 'task',
      order: getTaskAppendOrder(node.id, undefined, state.nodes),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    dependencies.addNode(newNode);
    selectAndOpenTaskDetails(newNode.id);
    return committed('child-created');
  }

  if (!dependencies.canDeleteTask) return noOp('delete-permission-denied');
  const confirmed = await useDialogStore.getState().showConfirm(
    `確定要刪除任務「${node.title || '未命名任務'}」嗎？您可以隨時使用 Ctrl+Z 復原。`,
  );
  if (!confirmed) return noOp('delete-cancelled');
  const latestNode = useWbsStore.getState().nodes[nodeId];
  if (!latestNode || latestNode.isArchived) return noOp('source-missing-after-confirmation');
  dependencies.removeNode(nodeId);
  return committed('task-deleted');
};

export const commitTaskDragObservation = async ({
  observation,
  dependencies,
}: {
  observation: TaskDragObservation;
  dependencies: TaskDragCommitDependencies;
}): Promise<TaskDragCommitResult> => {
  if (observation.targetKind === 'mobile-action' && observation.action) {
    return commitTaskDragAction({
      action: observation.action,
      nodeId: observation.source.nodeId,
      dependencies,
    });
  }

  if (!dependencies.canMoveTask) return noOp('move-permission-denied');
  const state = useWbsStore.getState();
  const draggedNode = state.nodes[observation.source.nodeId];
  if (!draggedNode || draggedNode.isArchived) return noOp('source-missing');

  if (observation.targetKind === 'workbench-placed-lane') {
    if (observation.source.kind !== 'workbench-unplaced-row') return noOp('invalid-placement-source');
    if (!observation.targetBoardId || !observation.targetWorkspaceId) return noOp('placement-target-missing');
    dependencies.batchUpdateNodes({
      [draggedNode.id]: {
        workspaceId: observation.targetWorkspaceId,
        boardId: observation.targetBoardId,
        parentId: null,
        order: getBoardRootAppendOrder(observation.targetBoardId, draggedNode.id, state.nodes),
        nodeType: draggedNode.nodeType || 'task',
        updatedAt: Date.now(),
      },
    }, { label: '歸位任務', mergeKey: `placement:${draggedNode.id}` });
    dependencies.recalculateAncestorStatus(draggedNode.id);
    return committed('placed-on-board');
  }

  if (observation.targetKind !== 'task-position'
    || !observation.targetNodeId
    || !observation.dropPosition
    || observation.targetNodeId === draggedNode.id) {
    return noOp('no-valid-target');
  }

  const targetNode = state.nodes[observation.targetNodeId];
  if (!targetNode || targetNode.isArchived) return noOp('target-missing');
  const sourceSurfaceKind = taskDragSourceKindToSurfaceKind(observation.source.kind);
  if (!sourceSurfaceKind || !observation.targetSurfaceKind) return noOp('drop-surface-missing');
  const intent = resolveTaskDropIntent({
    source: { nodeId: draggedNode.id, surfaceKind: sourceSurfaceKind },
    target: { nodeId: targetNode.id, surfaceKind: observation.targetSurfaceKind },
    nodesRecord: state.nodes,
  });
  if (!isValidTaskDropIntent(draggedNode.id, intent, state.nodes)) return noOp('invalid-drop-intent');
  if (!intent) return noOp('invalid-drop-intent');

  const updates = normalizeTaskMoveUpdates(draggedNode.id, intent, state.nodes);
  updates[draggedNode.id] = {
    ...(updates[draggedNode.id] || {}),
    workspaceId: targetNode.workspaceId || draggedNode.workspaceId,
    boardId: targetNode.boardId || draggedNode.boardId,
    nodeType: intent.nodeType,
    updatedAt: Date.now(),
  };
  dependencies.batchUpdateNodes(updates, { label: '移動任務位置', mergeKey: `move:${draggedNode.id}` });
  dependencies.recalculateAncestorStatus(draggedNode.id);
  return committed('task-position-updated');
};
