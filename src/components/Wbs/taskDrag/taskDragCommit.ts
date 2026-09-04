import type { TaskNode } from '../../../types';
import type { WbsBoardActions } from '../../../store/useWbsStore';
import { useWbsStore } from '../../../store/useWbsStore';
import useDialogStore from '../../../store/useDialogStore';
import { toast } from '../../../store/useToastStore';
import { prepareNewTaskNaming } from '../../../utils/taskInteractions';
import { isTaskPlacementOutcomeUnknownError } from '../../../features/taskWorkbench/placementTransaction';
import {
  buildMoveTaskSubtreeCommand,
  getTaskOwnershipRef,
  type TaskOwnershipRef,
} from '../../../features/taskWorkbench/taskPlacementCommand';
import type {
  MobileTaskAction,
  TaskDragCommitResult,
  TaskDragObservation,
} from './taskDragTypes';
import {
  getTaskAppendOrder,
  isValidTaskDropIntent,
  resolveTaskDropOutcome,
  taskDragSourceKindToSurfaceKind,
  type TaskDropIntent,
} from './taskDropIntent';
import { normalizeTaskMoveUpdates } from './taskMoveUpdateNormalization';
import {
  resolveDesktopTaskDropIntent,
  type DesktopTaskDropPreview,
} from './desktopTaskDropPreview';
import { primaryPlacementId } from '../../../features/taskTracking/model';
export { buildTaskSubtreePlacementUpdates } from './taskSubtreePlacement';

export { buildTaskParentIndex, getTaskAppendOrder, isValidTaskDropIntent } from './taskDropIntent';

type TaskDragStoreActions = Pick<
  WbsBoardActions,
  'addNode' | 'updateNode' | 'batchUpdateNodes' | 'commitTaskPlacementCommand' | 'archiveNode' | 'recalculateAncestorStatus' | 'moveTrackingReference' | 'stageTrackingReference' | 'placeStagedTrackingReference'
>;

export interface TaskDragCommitDependencies extends TaskDragStoreActions {
  activeBoardId: string | null;
  activeWorkspaceId: string | null;
  canMoveTask: boolean;
  canEditTask: boolean;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  canManageTaskReference: boolean;
}

const committed = (reason: string): TaskDragCommitResult => ({ status: 'committed', reason });
const noOp = (reason: string): TaskDragCommitResult => ({ status: 'no-op', reason });
const failed = (reason: string): TaskDragCommitResult => ({ status: 'failed', reason });
const placementFailureToast = (error: unknown, fallbackMessage: string) => {
  toast.error(isTaskPlacementOutcomeUnknownError(error)
    ? '搬移結果尚未確認，請重新整理後再操作。'
    : fallbackMessage);
};

const commitTaskSubtreeToUnplaced = async (
  draggedNode: TaskNode,
  nodesRecord: Record<string, TaskNode>,
  dependencies: TaskDragCommitDependencies,
  clientPlatform: 'desktop' | 'mobile',
) => {
  const command = buildMoveTaskSubtreeCommand({
    rootTaskId: draggedNode.id,
    nodesRecord,
    destination: {
      ownership: { kind: 'account_unplaced' },
      parentId: null,
      anchorTaskId: null,
      position: 'append',
    },
    clientPlatform,
  });
  try {
    await dependencies.commitTaskPlacementCommand(command, {
      label: '移到未歸位',
      mergeKey: `placement:${draggedNode.id}`,
    });
    dependencies.recalculateAncestorStatus(draggedNode.id);
    return committed('moved-to-unplaced');
  } catch (error) {
    console.error('[taskDrag] Failed to move task subtree to the unplaced lane.', error);
    placementFailureToast(error, '搬移失敗，任務已保留在原位置。');
    return failed('placement-persistence-failed');
  }
};

export { normalizeTaskMoveUpdates } from './taskMoveUpdateNormalization';

const getBoardDestination = (
  targetOwnership: TaskOwnershipRef,
  intent: TaskDropIntent,
  anchorTaskId: string | null,
) => {
  if (targetOwnership.kind !== 'board') {
    throw new Error('Task placement destination must be a board.');
  }
  return {
    ownership: targetOwnership,
    parentId: intent.parentId,
    anchorTaskId: intent.displayPosition === 'append' ? null : anchorTaskId,
    position: intent.displayPosition,
  } as const;
};

const commitTaskSubtreeToBoard = async ({
  draggedNode,
  nodesRecord,
  destinationOwnership,
  intent,
  anchorTaskId,
  dependencies,
  clientPlatform,
  label,
}: {
  draggedNode: TaskNode;
  nodesRecord: Record<string, TaskNode>;
  destinationOwnership: TaskOwnershipRef;
  intent: TaskDropIntent;
  anchorTaskId: string | null;
  dependencies: TaskDragCommitDependencies;
  clientPlatform: 'desktop' | 'mobile';
  label: string;
}) => {
  const command = buildMoveTaskSubtreeCommand({
    rootTaskId: draggedNode.id,
    nodesRecord,
    destination: getBoardDestination(destinationOwnership, intent, anchorTaskId),
    clientPlatform,
  });
  await dependencies.commitTaskPlacementCommand(command, {
    label,
    mergeKey: `placement:${draggedNode.id}`,
  });
};

export const commitDesktopTaskDrag = async ({
  activeData,
  overData,
  desktopPreview,
  dependencies,
}: {
  activeData: Record<string, any>;
  overData: Record<string, any>;
  desktopPreview?: DesktopTaskDropPreview | null;
  dependencies: TaskDragCommitDependencies;
}): Promise<TaskDragCommitResult> => {
  const activeReference = activeData?.trackingReference;
  if (activeReference) {
    if (!dependencies.canManageTaskReference) return noOp('reference-permission-denied');
    const state = useWbsStore.getState();
    const sourceReference = state.trackingReferences.find(reference => reference.id === activeReference.id && !reference.removedAt);
    const stagedReference = state.stagedTrackingReferences.find(reference => reference.referenceId === activeReference.id);
    if (!sourceReference && !stagedReference) return noOp('reference-source-missing');
    if (overData?.type === 'wbs-root-drop' && !overData?.nodeId) {
      if (!overData?.boardId || !overData?.workspaceId) return noOp('placement-target-missing');
      try {
        const place = stagedReference
          ? dependencies.placeStagedTrackingReference
          : dependencies.moveTrackingReference;
        await place({
          referenceId: activeReference.id,
          targetBoardId: overData.boardId,
          targetParentPlacementId: null,
          position: 'append',
        });
        return committed('reference-placed-on-empty-board');
      } catch (error) {
        console.error('[taskDrag] Failed to place tracking placement on the empty board.', error);
        placementFailureToast(error, '歸位失敗，追蹤副本仍保留在未歸位。');
        return failed('reference-placement-persistence-failed');
      }
    }
    if (overData?.type === 'task-workbench-unplaced-lane'
      || (overData?.source === 'task-workbench' && overData?.placement === 'unplaced')) {
      if (stagedReference) return noOp('reference-already-unplaced');
      try {
        await dependencies.stageTrackingReference(activeReference.id);
        return committed('reference-moved-to-unplaced');
      } catch (error) {
        console.error('[taskDrag] Failed to stage tracking placement.', error);
        placementFailureToast(error, '搬移失敗，追蹤副本已保留在原位置。');
        return failed('reference-staging-persistence-failed');
      }
    }
    try {
      if (overData?.type === 'task-workbench-placed-board-lane' && overData.boardId && overData.workspaceId) {
        const place = stagedReference
          ? dependencies.placeStagedTrackingReference
          : dependencies.moveTrackingReference;
        await place({
          referenceId: activeReference.id,
          targetBoardId: overData.boardId,
          targetParentPlacementId: null,
          position: 'append',
        });
        return committed('reference-placed-on-board');
      }

      const targetNode = state.nodes[overData?.nodeId || overData?.item?.id];
      const targetReference = overData?.trackingReference
        || state.trackingReferences.find(reference => reference.id === overData?.placementId && !reference.removedAt);
      const targetPlacementId = overData?.placementId
        || targetReference?.id
        || (targetNode ? primaryPlacementId(targetNode.id) : null);
      const targetBoardId = overData?.boardId || targetReference?.boardId || targetNode?.boardId;
      if (!targetPlacementId || !targetBoardId || targetPlacementId === activeReference.id) {
        return noOp('no-valid-reference-target');
      }
      const appendChild = desktopPreview?.displayPosition === 'append'
        || ['wbs-column-drop', 'wbs-card-drop', 'wbs-checklist-drop', 'wbs-task-title-child'].includes(overData?.type);
      const rootAppend = overData?.type === 'wbs-root-drop';
      const displayPosition = overData?.orderingPosition
        || desktopPreview?.displayPosition
        || 'after';
      const place = stagedReference
        ? dependencies.placeStagedTrackingReference
        : dependencies.moveTrackingReference;
      await place({
        referenceId: activeReference.id,
        targetBoardId,
        targetParentPlacementId: rootAppend
          ? null
          : appendChild
            ? targetPlacementId
            : targetReference?.parentPlacementId
              ?? (targetNode?.parentId ? primaryPlacementId(targetNode.parentId) : null),
        anchorPlacementId: appendChild || rootAppend ? null : targetPlacementId,
        position: appendChild || rootAppend
          ? 'append'
          : displayPosition === 'before' ? 'before' : 'after',
      });
      return committed(appendChild ? 'reference-appended-as-child' : 'reference-position-updated');
    } catch (error) {
      console.error('[taskDrag] Failed to move tracking placement.', error);
      placementFailureToast(error, '搬移失敗，追蹤副本已保留在原位置。');
      return failed('reference-placement-persistence-failed');
    }
  }
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
    return commitTaskSubtreeToUnplaced(draggedNode, state.nodes, dependencies, 'desktop');
  }

  if (overData?.type === 'task-workbench-placed-board-lane' && overData.boardId && overData.workspaceId) {
    try {
      await commitTaskSubtreeToBoard({
        draggedNode,
        nodesRecord: state.nodes,
        destinationOwnership: {
          kind: 'board',
          workspaceId: overData.workspaceId,
          boardId: overData.boardId,
        },
        intent: {
          parentId: null,
          order: 0,
          nodeType: draggedNode.nodeType || 'task',
          displayPosition: 'append',
        },
        anchorTaskId: null,
        dependencies,
        clientPlatform: 'desktop',
        label: '歸位任務',
      });
      dependencies.recalculateAncestorStatus(draggedNode.id);
      return committed('placed-on-board');
    } catch (error) {
      console.error('[taskDrag] Failed to place task subtree on the board.', error);
      placementFailureToast(error, '歸位失敗，任務已保留在未歸位。');
      return failed('placement-persistence-failed');
    }
  }

  if (overData?.type === 'wbs-root-drop' && !overData?.nodeId) {
    if (activeData?.source !== 'task-workbench') return noOp('empty-board-source-must-be-unplaced');
    if (!overData?.boardId || !overData?.workspaceId) return noOp('placement-target-missing');
    try {
      await commitTaskSubtreeToBoard({
        draggedNode,
        nodesRecord: state.nodes,
        destinationOwnership: {
          kind: 'board',
          workspaceId: overData.workspaceId,
          boardId: overData.boardId,
        },
        intent: {
          parentId: null,
          order: 0,
          nodeType: draggedNode.nodeType || 'task',
          displayPosition: 'append',
        },
        anchorTaskId: null,
        dependencies,
        clientPlatform: 'desktop',
        label: '歸位任務',
      });
      dependencies.recalculateAncestorStatus(draggedNode.id);
      return committed('placed-on-empty-board');
    } catch (error) {
      console.error('[taskDrag] Failed to place task subtree on the empty board.', error);
      placementFailureToast(error, '歸位失敗，任務已保留在未歸位。');
      return failed('placement-persistence-failed');
    }
  }

  // Revalidate against the same pointer-derived edge that was rendered.  The
  // dnd-kit `over` payload can omit `orderingPosition`, in which case the
  // fallback resolver infers direction from the source/target order and may
  // invert an already-displayed before/after marker (especially after a
  // prior cross-level move in a mixed drag sequence).
  const latestTargetData = desktopPreview
    && desktopPreview.displayPosition !== 'append'
    ? { ...overData, orderingPosition: desktopPreview.displayPosition }
    : overData;
  const latest = resolveDesktopTaskDropIntent({ activeData, targetData: latestTargetData, nodesRecord: state.nodes });
  if (!latest) return noOp('invalid-drop-intent');
  if (desktopPreview) {
    if (desktopPreview.sourceNodeId !== draggedNode.id
      || desktopPreview.targetNodeId !== (overData?.nodeId || null)) {
      return noOp('desktop-preview-target-mismatch');
    }
    if (latest.targetSurfaceKind !== desktopPreview.targetSurfaceKind
      || latest.outcomeKind !== desktopPreview.outcomeKind
      || latest.intent.displayPosition !== desktopPreview.displayPosition
      || latest.intent.parentId !== desktopPreview.intent.parentId
      || latest.intent.order !== desktopPreview.intent.order
      || latest.intent.nodeType !== desktopPreview.intent.nodeType) {
      return noOp('desktop-preview-stale');
    }
  }
  const { intent } = latest;
  if (!isValidTaskDropIntent(draggedNode.id, intent, state.nodes) || !intent) {
    return noOp('invalid-drop-intent');
  }
  if (latest.outcomeKind === 'origin') {
    return noOp('task-position-origin');
  }

  if (activeData?.source === 'task-workbench') {
    const targetNode = state.nodes[overData?.nodeId];
    if (!targetNode) return noOp('target-missing');
    try {
      await commitTaskSubtreeToBoard({
        draggedNode,
        nodesRecord: state.nodes,
        destinationOwnership: getTaskOwnershipRef(targetNode),
        intent,
        anchorTaskId: intent.displayPosition === 'append' ? null : targetNode.id,
        dependencies,
        clientPlatform: 'desktop',
        label: '移動任務位置',
      });
    } catch (error) {
      console.error('[taskDrag] Failed to place task subtree at the requested position.', error);
      placementFailureToast(error, '歸位失敗，任務已保留在未歸位。');
      return failed('placement-persistence-failed');
    }
  } else {
    const updates = normalizeTaskMoveUpdates(draggedNode.id, intent, state.nodes);
    dependencies.batchUpdateNodes(updates, {
      label: '移動任務位置',
      mergeKey: `move:${draggedNode.id}`,
    });
  }
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
    prepareNewTaskNaming(newNode.id);
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
    prepareNewTaskNaming(newNode.id);
    return committed('child-created');
  }

  if (!dependencies.canDeleteTask) return noOp('archive-permission-denied');
  const confirmed = await useDialogStore.getState().showConfirm(
    `確定要封存任務「${node.title || '未命名任務'}」嗎？之後可從目前看板回收桶還原。`,
  );
  if (!confirmed) return noOp('archive-cancelled');
  const latestNode = useWbsStore.getState().nodes[nodeId];
  if (!latestNode || latestNode.isArchived) return noOp('source-missing-after-confirmation');
  dependencies.archiveNode(nodeId);
  return committed('task-archived');
};

export const commitTaskDragObservation = async ({
  observation,
  dependencies,
}: {
  observation: TaskDragObservation;
  dependencies: TaskDragCommitDependencies;
}): Promise<TaskDragCommitResult> => {
  if (observation.source.trackingReferenceId) {
    if (observation.targetKind === 'mobile-action' && observation.action) {
      return commitTaskDragAction({
        action: observation.action,
        nodeId: observation.source.nodeId,
        dependencies: {
          ...dependencies,
          canEditTask: observation.source.canEditCanonicalTask ?? dependencies.canEditTask,
          canCreateTask: observation.source.canCreateCanonicalTask ?? dependencies.canCreateTask,
          canDeleteTask: observation.source.canDeleteCanonicalTask ?? dependencies.canDeleteTask,
        },
      });
    }
    if (!dependencies.canManageTaskReference) return noOp('reference-permission-denied');
    const state = useWbsStore.getState();
    const stagedReference = state.stagedTrackingReferences.find(reference =>
      reference.referenceId === observation.source.trackingReferenceId);
    if (observation.targetKind === 'workbench-unplaced-lane') {
      if (stagedReference) return noOp('reference-already-unplaced');
      try {
        await dependencies.stageTrackingReference(observation.source.trackingReferenceId);
        return committed('reference-moved-to-unplaced');
      } catch (error) {
        console.error('[taskDrag] Failed to stage tracking placement.', error);
        placementFailureToast(error, '搬移失敗，追蹤副本已保留在原位置。');
        return failed('reference-staging-persistence-failed');
      }
    }
    if (observation.targetKind === 'workbench-placed-lane' || observation.targetKind === 'board-root') {
      if (!stagedReference) return noOp('invalid-placement-source');
      if (!observation.targetBoardId || !observation.targetWorkspaceId) return noOp('placement-target-missing');
      try {
        await dependencies.placeStagedTrackingReference({
          referenceId: observation.source.trackingReferenceId,
          targetBoardId: observation.targetBoardId,
          targetParentPlacementId: null,
          position: 'append',
        });
        return committed('reference-placed-on-board');
      } catch (error) {
        console.error('[taskDrag] Failed to place staged tracking placement.', error);
        placementFailureToast(error, '歸位失敗，追蹤副本仍保留在未歸位。');
        return failed('reference-placement-persistence-failed');
      }
    }
    if (observation.targetKind !== 'task-position'
      || !observation.targetNodeId
      || !observation.targetPlacementId
      || !observation.dropPosition) return noOp('no-valid-reference-target');
    const targetNode = state.nodes[observation.targetNodeId];
    if (!targetNode || targetNode.isArchived) return noOp('target-missing');
    const targetReference = state.trackingReferences.find(reference =>
      !reference.removedAt && reference.id === observation.targetPlacementId);
    const appendChild = observation.childIntentPhase === 'armed'
      && observation.childTargetId === observation.targetNodeId;
    try {
      const place = stagedReference
        ? dependencies.placeStagedTrackingReference
        : dependencies.moveTrackingReference;
      await place({
        referenceId: observation.source.trackingReferenceId,
        targetBoardId: targetReference?.boardId || observation.targetBoardId || targetNode.boardId,
        targetParentPlacementId: appendChild
          ? observation.targetPlacementId
          : targetReference?.parentPlacementId
            ?? (targetNode.parentId ? primaryPlacementId(targetNode.parentId) : null),
        anchorPlacementId: appendChild ? null : observation.targetPlacementId,
        position: appendChild ? 'append' : observation.dropPosition,
      });
      return committed(appendChild ? 'reference-appended-as-child' : 'reference-position-updated');
    } catch (error) {
      console.error('[taskDrag] Failed to move tracking placement.', error);
      placementFailureToast(error, '搬移失敗，追蹤副本已保留在原位置。');
      return failed('reference-placement-persistence-failed');
    }
  }

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

  if (observation.targetKind === 'workbench-unplaced-lane') {
    if (observation.source.kind === 'workbench-unplaced-row') return noOp('source-already-unplaced');
    return await commitTaskSubtreeToUnplaced(draggedNode, state.nodes, dependencies, 'mobile');
  }

  if (observation.targetKind === 'workbench-placed-lane' || observation.targetKind === 'board-root') {
    if (observation.source.kind !== 'workbench-unplaced-row') return noOp('invalid-placement-source');
    if (!observation.targetBoardId || !observation.targetWorkspaceId) return noOp('placement-target-missing');
    try {
      await commitTaskSubtreeToBoard({
        draggedNode,
        nodesRecord: state.nodes,
        destinationOwnership: {
          kind: 'board',
          workspaceId: observation.targetWorkspaceId,
          boardId: observation.targetBoardId,
        },
        intent: {
          parentId: null,
          order: 0,
          nodeType: draggedNode.nodeType || 'task',
          displayPosition: 'append',
        },
        anchorTaskId: null,
        dependencies,
        clientPlatform: 'mobile',
        label: '歸位任務',
      });
      dependencies.recalculateAncestorStatus(draggedNode.id);
      return committed('placed-on-board');
    } catch (error) {
      console.error('[taskDrag] Failed to place task subtree on the board.', error);
      placementFailureToast(error, '歸位失敗，任務已保留在未歸位。');
      return failed('placement-persistence-failed');
    }
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
  const outcome = resolveTaskDropOutcome({
    source: { nodeId: draggedNode.id, surfaceKind: sourceSurfaceKind },
    target: {
      nodeId: targetNode.id,
      surfaceKind: observation.targetSurfaceKind,
      orderingPosition: observation.dropPosition,
    },
    nodesRecord: state.nodes,
  });
  if (outcome.kind === 'invalid') return noOp('invalid-drop-intent');
  if (outcome.kind === 'origin') return noOp('task-position-origin');
  const { intent } = outcome;

  const isWorkbenchSource = observation.source.kind === 'workbench-unplaced-row';
  if (isWorkbenchSource) {
    try {
      await commitTaskSubtreeToBoard({
        draggedNode,
        nodesRecord: state.nodes,
        destinationOwnership: getTaskOwnershipRef(targetNode),
        intent,
        anchorTaskId: intent.displayPosition === 'append' ? null : targetNode.id,
        dependencies,
        clientPlatform: 'mobile',
        label: '移動任務位置',
      });
    } catch (error) {
      console.error('[taskDrag] Failed to place task subtree at the requested position.', error);
      placementFailureToast(error, '歸位失敗，任務已保留在未歸位。');
      return failed('placement-persistence-failed');
    }
  } else {
    const updates = normalizeTaskMoveUpdates(draggedNode.id, intent, state.nodes);
    dependencies.batchUpdateNodes(updates, {
      label: '移動任務位置',
      mergeKey: `move:${draggedNode.id}`,
    });
  }
  dependencies.recalculateAncestorStatus(draggedNode.id);
  return committed('task-position-updated');
};
