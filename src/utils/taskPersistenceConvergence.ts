export type TaskPersistenceTerminalOutcome = 'persisted' | 'failed' | 'unknown';

export type TaskPersistenceReadback = 'confirmed' | 'mismatch' | 'unavailable';

/**
 * A provider request is allowed to finish after the UI has entered a bounded
 * readback path.  This guard makes the first terminal observation authoritative
 * for that operation and prevents a late callback from decrementing UI state a
 * second time.
 */
export const settlePersistenceOperationOnce = (
  pendingOperationIds: Set<string>,
  operationId: string,
): boolean => pendingOperationIds.delete(operationId);

export const readbackToTerminalOutcome = (
  readback: TaskPersistenceReadback,
): TaskPersistenceTerminalOutcome => {
  if (readback === 'confirmed') return 'persisted';
  if (readback === 'mismatch') return 'failed';
  return 'unknown';
};

export const arePersistedValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};
