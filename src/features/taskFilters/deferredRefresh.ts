import { create } from 'zustand';
import type { TaskStatus } from '../../types';
import { normalizeManualTaskStatus, type ManualTaskStatus } from '../../utils/taskStatus';

type DeferredTaskStatus = {
  baselineStatus: ManualTaskStatus;
};

export type DeferredTaskStatusChange = {
  taskId: string;
  baselineStatus: TaskStatus;
  currentStatus: TaskStatus;
};

type DeferredStatusOperation = {
  nodeIds: string[];
};

type DeferredTaskFilterRefreshState = {
  deferredStatusesByTaskId: Record<string, DeferredTaskStatus>;
  pendingOperationsByTaskId: Record<string, DeferredStatusOperation>;
  revision: number;
  reconcileStatusOperation: (
    changedTaskId: string,
    changes: DeferredTaskStatusChange[],
    affectsFilterResult: boolean,
  ) => void;
  applyPendingStatusChanges: () => number;
  resetPendingStatusChanges: () => void;
};

export const useDeferredTaskFilterRefreshStore = create<DeferredTaskFilterRefreshState>((set, get) => ({
  deferredStatusesByTaskId: {},
  pendingOperationsByTaskId: {},
  revision: 0,

  reconcileStatusOperation: (changedTaskId, changes, affectsFilterResult) => {
    set((state) => {
      const nextDeferredStatuses = { ...state.deferredStatusesByTaskId };
      const nextPendingOperations = { ...state.pendingOperationsByTaskId };

      if (affectsFilterResult) {
        const changedNodeIds: string[] = [];

        changes.forEach(change => {
          const baselineStatus = normalizeManualTaskStatus(change.baselineStatus);
          const currentStatus = normalizeManualTaskStatus(change.currentStatus);
          if (baselineStatus === currentStatus) return;

          changedNodeIds.push(change.taskId);
          if (!nextDeferredStatuses[change.taskId]) {
            nextDeferredStatuses[change.taskId] = { baselineStatus };
          }
        });

        if (changedNodeIds.length > 0) {
          nextPendingOperations[changedTaskId] = { nodeIds: changedNodeIds };
        } else {
          delete nextPendingOperations[changedTaskId];
        }
      } else {
        delete nextPendingOperations[changedTaskId];
      }

      const referencedNodeIds = new Set(
        Object.values(nextPendingOperations).flatMap(operation => operation.nodeIds),
      );
      Object.keys(nextDeferredStatuses).forEach(taskId => {
        if (!referencedNodeIds.has(taskId)) delete nextDeferredStatuses[taskId];
      });

      return {
        deferredStatusesByTaskId: nextDeferredStatuses,
        pendingOperationsByTaskId: nextPendingOperations,
      };
    });
  },

  applyPendingStatusChanges: () => {
    const pendingCount = getPendingTaskFilterRefreshCount(get().pendingOperationsByTaskId);
    if (pendingCount === 0) return 0;

    set((state) => ({
      deferredStatusesByTaskId: {},
      pendingOperationsByTaskId: {},
      revision: state.revision + 1,
    }));
    return pendingCount;
  },

  resetPendingStatusChanges: () => {
    if (Object.keys(get().pendingOperationsByTaskId).length === 0) return;
    set((state) => ({
      deferredStatusesByTaskId: {},
      pendingOperationsByTaskId: {},
      revision: state.revision + 1,
    }));
  },
}));

const getPendingTaskFilterRefreshCount = (
  entries: Record<string, DeferredStatusOperation>,
) => Object.keys(entries).length;

export const selectPendingTaskFilterRefreshCount = (
  state: Pick<DeferredTaskFilterRefreshState, 'pendingOperationsByTaskId'>,
) => getPendingTaskFilterRefreshCount(state.pendingOperationsByTaskId);

export const getDeferredTaskStatusForFilters = (
  taskId: string,
  currentStatus: TaskStatus,
): ManualTaskStatus => (
  useDeferredTaskFilterRefreshStore.getState().deferredStatusesByTaskId[taskId]?.baselineStatus
  ?? normalizeManualTaskStatus(currentStatus)
);
