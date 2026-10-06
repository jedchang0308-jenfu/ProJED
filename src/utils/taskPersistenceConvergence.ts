export type TaskPersistenceTerminalOutcome = 'persisted' | 'failed' | 'unknown';

export type TaskPersistenceReadback = 'confirmed' | 'mismatch' | 'unavailable';

/**
 * A provider request may finish after the UI has entered its bounded
 * readback path.  Only the first terminal observation may settle the
 * operation, so a late provider callback cannot decrement UI state twice.
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
