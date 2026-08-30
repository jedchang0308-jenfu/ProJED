const pendingByTaskId = new Map<string, string>();

export const markTaskCollectionPending = (taskIds: readonly string[], operationId: string) => {
  taskIds.forEach(taskId => pendingByTaskId.set(taskId, operationId));
};

export const clearTaskCollectionPending = (taskId: string) => {
  pendingByTaskId.delete(taskId);
};

export const isTaskCollectionPending = (taskId: string) => pendingByTaskId.has(taskId);
